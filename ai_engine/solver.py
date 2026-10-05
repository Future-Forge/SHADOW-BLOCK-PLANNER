import os
import sys
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
import redis
from ortools.linear_solver import pywraplp
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")

# AI & Physics Modules
from ai_engine.xgboost_scorer import predict_defect_criticality
from ai_engine.weather_engine import calculate_rail_physics, get_corridor_weather_risk

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("ai_solver")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "shadow_blockplanner")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ShadowPL")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_KEY = "latest_optimized_schedule"
REDIS_TTL = 86400  # 24 hours

# Station code to likely block sections mapping
STATION_SECTION_MAP = {
    "NDLS": "NDLS-MTJ",
    "KOTA": "MTJ-KOTA",
    "RMA": "KOTA-RMA",
    "BRC": "RMA-BRC",
    "MMCT": "BRC-MMCT",
    "CNB": "CNB-PRYJ",
    "DDU": "DDU-ASN",
    "HWH": "HWH-KGP",
    "MAS": "BZA-MAS",
    "SUR": "SUR-PUNE"
}

# Corridor to block sections fallback list
CORRIDOR_SECTIONS_MAP = {
    "Delhi-Mumbai": ["NDLS-MTJ", "MTJ-KOTA", "KOTA-RMA", "RMA-BRC", "BRC-MMCT"],
    "Delhi-Howrah": ["NDLS-MTJ", "CNB-PRYJ", "DDU-ASN", "SUR-PUNE"],
    "Howrah-Chennai": ["HWH-KGP", "BZA-MAS"],
    "Mumbai-Chennai": ["SUR-PUNE", "BZA-MAS"]
}

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        connect_timeout=3
    )

def get_redis_client():
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True,
                       socket_connect_timeout=3, socket_timeout=3)

class BlockOptimizationEngine:
    def __init__(self):
        self.conn = get_db_connection()
        self.redis_client = get_redis_client()

    def fetch_data(self) -> Dict[str, List[Dict[str, Any]]]:
        """Fetch all defects and timetable slots from PostgreSQL."""
        logger.info("Fetching defects and timetable data from PostgreSQL...")
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM tms_track_defects ORDER BY logged_timestamp ASC;")
            tms_records = cur.fetchall()

            cur.execute("SELECT * FROM smms_signal_defects ORDER BY logged_timestamp ASC;")
            smms_records = cur.fetchall()

            cur.execute("SELECT * FROM tdms_traction_defects ORDER BY logged_timestamp ASC;")
            tdms_records = cur.fetchall()

            cur.execute("SELECT * FROM coa_train_timetable ORDER BY scheduled_entry ASC;")
            coa_records = cur.fetchall()

        logger.info(
            f"Fetched records: TMS={len(tms_records)}, SMMS={len(smms_records)}, "
            f"TDMS={len(tdms_records)}, COA={len(coa_records)}"
        )
        return {
            "tms": [dict(r) for r in tms_records],
            "smms": [dict(r) for r in smms_records],
            "tdms": [dict(r) for r in tdms_records],
            "coa": [dict(r) for r in coa_records]
        }

    def compute_defect_scoring(self, temp_c: float, defect_type: str, urgency: str, dept: str = "TMS", age_days: float = 3.0) -> Dict[str, float]:
        """Compute defect criticality using XGBoost inference combined with physical rail thermal stress."""
        # 1. Physics: Rail temperature & buckling multiplier
        physics = calculate_rail_physics(ambient_temp_c=temp_c)
        buckling_mult = physics["buckling_risk_multiplier"]
        rail_temp = physics["rail_temp_c"]

        # 2. ML: XGBoost Defect Criticality Scoring
        speed_restr = 45.0 if urgency == "CRITICAL" else (20.0 if urgency == "HIGH" else 0.0)
        xgb_pred = predict_defect_criticality(
            defect_age_days=age_days,
            ambient_temp_c=temp_c,
            track_tonnage_mgt=65.0,
            speed_restriction_kmh=speed_restr,
            department_type=dept
        )
        xgb_score = xgb_pred["criticality_score"]

        # 3. Dynamic Priority Scaling
        defect_multiplier = 1.5 if defect_type in ["Sun Kink/Track Buckling", "Weld Fracture", "OHE Wire Sagging"] else 1.0
        effective_priority = xgb_score * buckling_mult * defect_multiplier

        return {
            "xgboost_score": xgb_score,
            "rail_temp_c": rail_temp,
            "buckling_multiplier": buckling_mult,
            "effective_priority": effective_priority,
            "urgency_tier": xgb_pred["urgency_tier"]
        }

    def fuse_defects_into_mega_blocks(self, raw_data: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """
        Mega Block Fusion: Group defect requests from TMS, SMMS, TDMS by Corridor & Block Section
        over temporal cluster windows to consolidate possessions into zero-overlap Mega Blocks.
        """
        logger.info("Executing Mega Block Fusion across TMS, SMMS, and TDMS with XGBoost scoring...")
        
        # Standardize and map all defects with location and timestamp
        unified_defects = []

        # 1. TMS Track Defects
        for t in raw_data["tms"]:
            score_data = self.compute_defect_scoring(
                float(t["ambient_temp_c"]), t["defect_type"], t["urgency_level"], dept="TMS"
            )
            unified_defects.append({
                "defect_id": t["defect_id"],
                "dept": "TMS",
                "corridor": t["gq_corridor"],
                "section": t["block_section"],
                "urgency": t["urgency_level"],
                "duration_hours": float(t["required_block_hours"]),
                "logged_time": t["logged_timestamp"],
                "effective_priority": score_data["effective_priority"],
                "xgboost_score": score_data["xgboost_score"],
                "ambient_temp_c": float(t["ambient_temp_c"]),
                "rail_temp_c": score_data["rail_temp_c"]
            })

        # 2. SMMS Signal Defects
        for s in raw_data["smms"]:
            section = STATION_SECTION_MAP.get(s["station_code"])
            if not section:
                possible_sections = CORRIDOR_SECTIONS_MAP.get(s["gq_corridor"], ["NDLS-MTJ"])
                section = possible_sections[0]

            score_data = self.compute_defect_scoring(
                30.0, s["failure_mode"], s["urgency_level"], dept="SMMS"
            )
            unified_defects.append({
                "defect_id": s["defect_id"],
                "dept": "SMMS",
                "corridor": s["gq_corridor"],
                "section": section,
                "urgency": s["urgency_level"],
                "duration_hours": float(s["required_block_hours"]),
                "logged_time": s["logged_timestamp"],
                "effective_priority": score_data["effective_priority"],
                "xgboost_score": score_data["xgboost_score"],
                "ambient_temp_c": 30.0,
                "rail_temp_c": score_data["rail_temp_c"]
            })

        # 3. TDMS Traction Defects
        for td in raw_data["tdms"]:
            possible_sections = CORRIDOR_SECTIONS_MAP.get(td["gq_corridor"], ["NDLS-MTJ"])
            sec_idx = abs(hash(td["ohe_sector_id"])) % len(possible_sections)
            section = possible_sections[sec_idx]

            score_data = self.compute_defect_scoring(
                35.0, td["defect_type"], td["urgency_level"], dept="TDMS"
            )
            unified_defects.append({
                "defect_id": td["defect_id"],
                "dept": "TDMS",
                "corridor": td["gq_corridor"],
                "section": section,
                "urgency": td["urgency_level"],
                "duration_hours": float(td["required_block_hours"]),
                "logged_time": td["logged_timestamp"],
                "effective_priority": score_data["effective_priority"],
                "xgboost_score": score_data["xgboost_score"],
                "ambient_temp_c": 35.0,
                "rail_temp_c": score_data["rail_temp_c"]
            })

        # Group defects by (corridor, section, time_window)
        # Cluster window: 24-hour buckets from start date
        base_time = datetime(2026, 10, 1, 6, 0, 0)
        clusters: Dict[str, List[Dict[str, Any]]] = {}

        for d in unified_defects:
            t_diff_hours = (d["logged_time"] - base_time).total_seconds() / 3600.0
            day_bucket = int(max(0, t_diff_hours) // 24)
            key = f"{d['corridor']}|{d['section']}|day_{day_bucket}"
            if key not in clusters:
                clusters[key] = []
            clusters[key].append(d)

        mega_blocks = []
        cluster_id = 1

        for key, defect_list in clusters.items():
            corridor, section, bucket = key.split("|")
            
            # Rank departments by duration and urgency
            dept_durations = {}
            dept_urgency = {}
            for item in defect_list:
                dept = item["dept"]
                dept_durations[dept] = max(dept_durations.get(dept, 0.0), item["duration_hours"])
                dept_urgency[dept] = dept_urgency.get(dept, 0.0) + item["effective_priority"]

            # Identify primary department (longest duration and highest priority)
            sorted_depts = sorted(
                dept_durations.keys(),
                key=lambda d: (dept_durations[d], dept_urgency[d]),
                reverse=True
            )
            primary_dept = sorted_depts[0]
            shadow_depts = [d for d in sorted_depts if d != primary_dept]

            # Fused duration is the maximum required duration across combined departments
            fused_duration = max(dept_durations.values())
            sum_individual_durations = sum(dept_durations.values())
            shadow_hours_saved = sum_individual_durations - fused_duration

            total_priority = sum(item["effective_priority"] for item in defect_list)
            earliest_logged = min(item["logged_time"] for item in defect_list)
            max_temp = max(item["ambient_temp_c"] for item in defect_list)
            is_critical = any(item["urgency"] == "CRITICAL" for item in defect_list)

            mega_blocks.append({
                "candidate_id": cluster_id,
                "corridor": corridor,
                "section": section,
                "primary_department": primary_dept,
                "shadow_departments": shadow_depts,
                "duration_hours": round(fused_duration, 1),
                "shadow_hours_saved": round(shadow_hours_saved, 1),
                "total_priority": total_priority,
                "is_critical": is_critical,
                "max_temp_c": max_temp,
                "earliest_logged": earliest_logged,
                "defect_count": len(defect_list),
                "defects": [d["defect_id"] for d in defect_list]
            })
            cluster_id += 1

        logger.info(f"Generated {len(mega_blocks)} consolidated Mega Block candidates from {len(unified_defects)} defects.")
        return mega_blocks

    def generate_candidate_windows(
        self,
        block: Dict[str, Any],
        timetable: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Generate feasible time windows for a block candidate on its block section,
        evaluating train timetable conflicts and prioritizing natural gap windows.
        """
        section = block["section"]
        corridor = block["corridor"]
        duration_hrs = block["duration_hours"]
        duration_delta = timedelta(hours=duration_hrs)

        # Filter relevant train slots on this section
        section_trains = [
            t for t in timetable
            if t["block_section"] == section and t["gq_corridor"] == corridor
        ]

        # Consider window start times over a 72-hour window from earliest logged time
        start_anchor = block["earliest_logged"].replace(minute=0, second=0)
        candidate_windows = []

        # Step through discrete slots (every 2 hours)
        for offset_hrs in range(0, 72, 2):
            w_start = start_anchor + timedelta(hours=offset_hrs)
            w_end = w_start + duration_delta

            # Check overlap against train timetable slots
            has_premium_conflict = False
            express_conflict_count = 0
            freight_conflict_count = 0
            clean_gap_fit = False

            for train in section_trains:
                t_entry = train["scheduled_entry"]
                t_exit = train["scheduled_exit"]

                # Overlap check
                if max(w_start, t_entry) < min(w_end, t_exit):
                    if train["train_type"] == "PREMIUM_PASSENGER":
                        has_premium_conflict = True
                        break  # Hard constraint: strictly forbidden
                    elif train["train_type"] == "EXPRESS_PASSENGER":
                        express_conflict_count += 1
                    elif "FREIGHT" in train["train_type"]:
                        freight_conflict_count += 1

            if has_premium_conflict:
                continue  # Skip window entirely to protect Rajdhani/Shatabdi traffic

            # Penalty computation
            # Delay penalty: smaller if scheduled sooner
            delay_penalty = offset_hrs * 2.0
            train_penalty = (express_conflict_count * 500.0) + (freight_conflict_count * 50.0)

            # Check if fits nicely into a natural gap
            if express_conflict_count == 0 and freight_conflict_count == 0:
                clean_gap_fit = True
                bonus = 100.0
            else:
                bonus = 0.0

            total_cost = delay_penalty + train_penalty - bonus

            candidate_windows.append({
                "start_time": w_start,
                "end_time": w_end,
                "cost": total_cost,
                "clean_fit": clean_gap_fit,
                "express_conflicts": express_conflict_count,
                "freight_conflicts": freight_conflict_count
            })

            # Limit to top 15 feasible candidate windows per block for solver efficiency
            if len(candidate_windows) >= 15:
                break

        return candidate_windows

    def solve_optimization(self) -> Dict[str, Any]:
        """
        Build and solve the Mixed-Integer Linear Programming (MILP) model using Google OR-Tools.
        """
        start_solve_time = datetime.now()
        raw_data = self.fetch_data()
        mega_blocks = self.fuse_defects_into_mega_blocks(raw_data)
        timetable = raw_data["coa"]

        # Instantiate OR-Tools pywraplp Solver with SCIP or CBC backend
        solver = pywraplp.Solver.CreateSolver("SCIP")
        if not solver:
            solver = pywraplp.Solver.CreateSolver("CBC")
        if not solver:
            raise RuntimeError("Neither SCIP nor CBC OR-Tools solver backend could be initialized.")

        logger.info(f"Initialized Google OR-Tools Solver: {solver.SolverVersion()}")

        # Decision Variables
        # x[b_idx, w_idx]: 1 if block b is assigned to window w
        # y[b_idx]: 1 if block b is scheduled
        x_vars = {}
        y_vars = {}
        block_windows_map = {}

        for b_idx, block in enumerate(mega_blocks):
            windows = self.generate_candidate_windows(block, timetable)
            block_windows_map[b_idx] = windows

            y_vars[b_idx] = solver.BoolVar(f"y_{b_idx}")

            for w_idx, win in enumerate(windows):
                x_vars[b_idx, w_idx] = solver.BoolVar(f"x_{b_idx}_{w_idx}")

            # Constraint 1: Single window assignment
            # sum(x[b, w]) == y[b]
            if windows:
                solver.Add(
                    solver.Sum([x_vars[b_idx, w_idx] for w_idx in range(len(windows))]) == y_vars[b_idx]
                )
            else:
                solver.Add(y_vars[b_idx] == 0)

            # Constraint 2: Mandatory scheduling for critical blocks
            if block["is_critical"] and len(windows) > 0:
                solver.Add(y_vars[b_idx] == 1)

        # Constraint 3: Zero-overlap Hard-Constraint for blocks on the same (corridor, section)
        # For any two blocks b1, b2 on the same section, overlapping windows cannot both be selected.
        section_block_indices: Dict[str, List[int]] = {}
        for b_idx, block in enumerate(mega_blocks):
            sec_key = f"{block['corridor']}::{block['section']}"
            if sec_key not in section_block_indices:
                section_block_indices[sec_key] = []
            section_block_indices[sec_key].append(b_idx)

        conflict_constraints_count = 0
        for sec_key, b_list in section_block_indices.items():
            n = len(b_list)
            for i in range(n):
                b1 = b_list[i]
                w1_list = block_windows_map[b1]
                for j in range(i + 1, n):
                    b2 = b_list[j]
                    w2_list = block_windows_map[b2]

                    for w1_idx, w1 in enumerate(w1_list):
                        for w2_idx, w2 in enumerate(w2_list):
                            # Overlap check between block windows
                            if max(w1["start_time"], w2["start_time"]) < min(w1["end_time"], w2["end_time"]):
                                solver.Add(x_vars[b1, w1_idx] + x_vars[b2, w2_idx] <= 1)
                                conflict_constraints_count += 1

        logger.info(f"Added {conflict_constraints_count} zero-overlap spatial-temporal constraints to MILP model.")

        # Objective Function:
        # Maximize total scheduled priority minus window assignment costs
        objective = solver.Objective()
        for b_idx, block in enumerate(mega_blocks):
            # Benefit for scheduling block
            objective.SetCoefficient(y_vars[b_idx], float(block["total_priority"]))

            # Penalty / Cost for specific window choice
            for w_idx, win in enumerate(block_windows_map[b_idx]):
                # Subtract cost
                current_coeff = objective.GetCoefficient(x_vars[b_idx, w_idx])
                objective.SetCoefficient(x_vars[b_idx, w_idx], current_coeff - float(win["cost"]))

        objective.SetMaximization()

        # Set solver parameters
        solver.SetTimeLimit(30000)  # 30 seconds max
        logger.info("Solving MILP optimization model...")
        status = solver.Solve()

        solve_duration = (datetime.now() - start_solve_time).total_seconds()
        logger.info(f"Solver finished with status: {status} in {solve_duration:.2f}s")

        status_str = "UNKNOWN"
        if status == pywraplp.Solver.OPTIMAL:
            status_str = "OPTIMAL"
        elif status == pywraplp.Solver.FEASIBLE:
            status_str = "FEASIBLE"
        elif status == pywraplp.Solver.INFEASIBLE:
            status_str = "INFEASIBLE"

        if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
            raise RuntimeError(f"Optimizer failed ({status_str}); existing schedule preserved.")

        # Extract scheduled results
        scheduled_blocks = []
        total_shadow_hours_saved = 0.0
        total_block_hours = 0.0
        freight_conflicts = 0

        for b_idx, block in enumerate(mega_blocks):
            if y_vars[b_idx].solution_value() > 0.5:
                for w_idx, win in enumerate(block_windows_map[b_idx]):
                    if x_vars[b_idx, w_idx].solution_value() > 0.5:
                        scheduled_blocks.append({
                            "gq_corridor": block["corridor"],
                            "block_section": block["section"],
                            "primary_department": block["primary_department"],
                            "shadow_departments": block["shadow_departments"],
                            "start_time": win["start_time"],
                            "end_time": win["end_time"],
                            "duration_hours": block["duration_hours"],
                            "shadow_hours_saved": block["shadow_hours_saved"],
                            "urgency_score": round(block["total_priority"], 2),
                            "max_temp_c": block["max_temp_c"],
                            "defect_count": block["defect_count"],
                            "status": "PROPOSED"
                        })
                        total_shadow_hours_saved += block["shadow_hours_saved"]
                        total_block_hours += block["duration_hours"]
                        freight_conflicts += win["freight_conflicts"]
                        break

        # Persist to PostgreSQL scheduled_blocks table
        self.persist_to_postgres(scheduled_blocks)

        # Prepare payload for Redis and API response
        result_payload = {
            "status": "SUCCESS" if status in [pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE] else "FAILED",
            "solver_status": status_str,
            "solve_duration_seconds": round(solve_duration, 3),
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_defects_evaluated": len(raw_data["tms"]) + len(raw_data["smms"]) + len(raw_data["tdms"]),
                "total_candidates_formed": len(mega_blocks),
                "total_mega_blocks_scheduled": len(scheduled_blocks),
                "total_block_hours_allocated": round(total_block_hours, 1),
                "total_shadow_hours_saved": round(total_shadow_hours_saved, 1),
                "premium_train_conflicts": 0,  # Strict hard-constraint guaranteed
                "freight_conflicts_managed": freight_conflicts,
                "corridors_covered": list(set(b["gq_corridor"] for b in scheduled_blocks))
            },
            "blocks": [
                {
                    "block_plan_id": idx + 1,
                    "gq_corridor": b["gq_corridor"],
                    "block_section": b["block_section"],
                    "primary_department": b["primary_department"],
                    "shadow_departments": b["shadow_departments"],
                    "start_time": b["start_time"].strftime("%Y-%m-%d %H:%M:%S"),
                    "end_time": b["end_time"].strftime("%Y-%m-%d %H:%M:%S"),
                    "duration_hours": b["duration_hours"],
                    "shadow_hours_saved": b["shadow_hours_saved"],
                    "urgency_score": b["urgency_score"],
                    "max_temp_c": b["max_temp_c"],
                    "defect_count": b["defect_count"],
                    "status": b["status"]
                }
                for idx, b in enumerate(scheduled_blocks)
            ]
        }

        # Cache in Redis with 86400s TTL
        self.persist_to_redis(result_payload)

        return result_payload

    def persist_to_postgres(self, scheduled_blocks: List[Dict[str, Any]]):
        """Persist optimized block plans into the PostgreSQL scheduled_blocks table."""
        logger.info(f"Persisting {len(scheduled_blocks)} blocks to PostgreSQL table 'scheduled_blocks'...")
        with self.conn.cursor() as cur:
            # Clear old proposed blocks
            cur.execute("TRUNCATE TABLE scheduled_blocks RESTART IDENTITY;")
            
            if scheduled_blocks:
                insert_query = """
                    INSERT INTO scheduled_blocks (
                        gq_corridor, block_section, primary_department, shadow_departments,
                        start_time, end_time, duration_hours, status
                    ) VALUES %s
                """
                records = [
                    (
                        b["gq_corridor"],
                        b["block_section"],
                        b["primary_department"],
                        b["shadow_departments"],
                        b["start_time"],
                        b["end_time"],
                        b["duration_hours"],
                        b["status"]
                    )
                    for b in scheduled_blocks
                ]
                execute_values(cur, insert_query, records)
        self.conn.commit()
        logger.info("Successfully persisted scheduled blocks to PostgreSQL.")

    def persist_to_redis(self, payload: Dict[str, Any]):
        """Persist optimized block payload to Redis under key `latest_optimized_schedule`."""
        logger.info(f"Caching block payload to Redis key '{REDIS_KEY}' with TTL {REDIS_TTL}s...")
        try:
            self.redis_client.set(
                REDIS_KEY,
                json.dumps(payload, default=str),
                ex=REDIS_TTL
            )
            logger.info("Successfully cached payload in Redis.")
        except Exception as e:
            logger.error(f"Failed to cache to Redis: {e}")
            raise

    def close(self):
        if self.conn and not self.conn.closed:
            self.conn.close()

def run_optimization():
    engine = BlockOptimizationEngine()
    try:
        return engine.solve_optimization()
    finally:
        engine.close()

if __name__ == "__main__":
    result = run_optimization()
    print("\n--- OPTIMIZATION SUMMARY ---")
    print(json.dumps(result["summary"], indent=2))
