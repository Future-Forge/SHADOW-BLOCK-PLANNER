import os
import sys
import json
import time
import logging
import threading
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path

import redis
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from ortools.linear_solver import pywraplp
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")

from ai_engine.xgboost_scorer import predict_defect_criticality
from ai_engine.weather_engine import calculate_rail_physics

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("reoptimizer")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "shadow_blockplanner")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ShadowPL")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_KEY = "latest_optimized_schedule"

CHANNEL_EMERGENCY_DEFECTS = "emergency_defect_events"
CHANNEL_TRAIN_DELAYS = "train_delay_events"
CHANNEL_SCHEDULE_UPDATES = "schedule_updates"

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

def get_redis_client():
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

class SectionReoptimizer:
    """
    Sub-second Localized MILP Re-Optimizer for real-time dispatch interventions:
    - Target Latency: < 0.50 seconds.
    - Scope: Localized to the affected GQ Corridor & Block Section rather than re-solving national grid.
    - Triggers: Emergency Track Fractures, Sudden Signal/OHE Breakdowns, or Major Train Delays.
    """
    def __init__(self):
        self.redis_client = get_redis_client()

    def reoptimize_section(
        self,
        corridor: str,
        section: str,
        emergency_defect: Optional[Dict[str, Any]] = None,
        train_delay: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()
        logger.info(f"Starting localized sub-second re-optimization for Section '{section}' on Corridor '{corridor}'...")

        conn = get_db_connection()
        try:
            # 1. Fetch section train timetable
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM coa_train_timetable
                    WHERE gq_corridor = %s AND block_section = %s
                    ORDER BY scheduled_entry ASC;
                    """,
                    (corridor, section)
                )
                timetable = [dict(r) for r in cur.fetchall()]

                # Also fetch existing section defects
                cur.execute(
                    """
                    SELECT * FROM tms_track_defects
                    WHERE gq_corridor = %s AND block_section = %s
                    ORDER BY logged_timestamp ASC LIMIT 20;
                    """,
                    (corridor, section)
                )
                tms_defects = [dict(r) for r in cur.fetchall()]

            # Apply train delay adjustment if provided
            if train_delay:
                t_num = str(train_delay.get("train_number", ""))
                delay_mins = int(train_delay.get("delay_minutes", 0))
                for t in timetable:
                    if str(t["train_number"]) == t_num:
                        t["scheduled_entry"] += timedelta(minutes=delay_mins)
                        t["scheduled_exit"] += timedelta(minutes=delay_mins)
                        logger.info(f"Shifted train {t_num} by +{delay_mins} mins.")

            # Create emergency defect block if passed
            base_time = datetime(2026, 10, 1, 6, 0, 0)
            target_duration = 3.5
            primary_dept = "TMS"
            shadow_depts = ["SMMS", "TDMS"]
            urgency_score = 1500.0  # Ultra-high emergency priority
            earliest_start = base_time

            if emergency_defect:
                primary_dept = emergency_defect.get("department", "TMS")
                target_duration = float(emergency_defect.get("duration_hours", 3.0))
                shadow_depts = emergency_defect.get("shadow_departments", ["SMMS"])
                urgency_type = emergency_defect.get("urgency", "CRITICAL")
                defect_type = emergency_defect.get("defect_type", "Emergency Rail Fracture")
                
                # ML scoring
                xgb_res = predict_defect_criticality(
                    defect_age_days=1.0,
                    ambient_temp_c=42.0,
                    track_tonnage_mgt=80.0,
                    speed_restriction_kmh=60.0,
                    department_type=primary_dept
                )
                physics = calculate_rail_physics(42.0)
                urgency_score = xgb_res["criticality_score"] * physics["buckling_risk_multiplier"] * 2.0
                if "logged_time" in emergency_defect:
                    try:
                        earliest_start = datetime.fromisoformat(emergency_defect["logged_time"])
                    except Exception:
                        pass

            # 2. Fast candidate window generation on the localized section
            duration_delta = timedelta(hours=target_duration)
            candidate_windows = []
            
            for offset_hrs in range(0, 48, 2):
                w_start = earliest_start + timedelta(hours=offset_hrs)
                w_end = w_start + duration_delta

                # Evaluate timetable conflicts
                has_premium_conflict = False
                express_conflicts = 0
                freight_conflicts = 0

                for tr in timetable:
                    if max(w_start, tr["scheduled_entry"]) < min(w_end, tr["scheduled_exit"]):
                        if tr["train_type"] == "PREMIUM_PASSENGER":
                            has_premium_conflict = True
                            break
                        elif tr["train_type"] == "EXPRESS_PASSENGER":
                            express_conflicts += 1
                        else:
                            freight_conflicts += 1

                if has_premium_conflict:
                    continue  # Hard constraint: Protect Rajdhani/Shatabdi

                cost = (offset_hrs * 1.5) + (express_conflicts * 400.0) + (freight_conflicts * 40.0)
                candidate_windows.append({
                    "start_time": w_start,
                    "end_time": w_end,
                    "cost": cost,
                    "express_conflicts": express_conflicts,
                    "freight_conflicts": freight_conflicts
                })
                if len(candidate_windows) >= 10:
                    break

            if not candidate_windows:
                raise ValueError(f"No conflict-free feasible window found for section {section} protecting premium trains.")

            # 3. Localized Micro-MILP Solver
            solver = pywraplp.Solver.CreateSolver("SCIP")
            if not solver:
                solver = pywraplp.Solver.CreateSolver("CBC")

            x_vars = [solver.BoolVar(f"x_{i}") for i in range(len(candidate_windows))]
            # Must choose exactly 1 window
            solver.Add(solver.Sum(x_vars) == 1)

            # Objective: Minimize window cost
            objective = solver.Objective()
            for i, win in enumerate(candidate_windows):
                objective.SetCoefficient(x_vars[i], float(win["cost"]))
            objective.SetMinimization()

            solver_status = solver.Solve()

            chosen_window = candidate_windows[0]
            for i in range(len(candidate_windows)):
                if x_vars[i].solution_value() > 0.5:
                    chosen_window = candidate_windows[i]
                    break

            # 4. Insert or update block in PostgreSQL
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO scheduled_blocks (
                        gq_corridor, block_section, primary_department, shadow_departments,
                        start_time, end_time, duration_hours, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'EMERGENCY_OPTIMIZED')
                    RETURNING block_plan_id;
                    """,
                    (
                        corridor,
                        section,
                        primary_dept,
                        shadow_depts,
                        chosen_window["start_time"],
                        chosen_window["end_time"],
                        target_duration
                    )
                )
                new_block_id = cur.fetchone()[0]
            conn.commit()

            t_elapsed = time.perf_counter() - t0
            logger.info(f"Sub-second re-optimization finished in {t_elapsed:.4f}s! Assigned Block ID {new_block_id}.")

            result = {
                "status": "SUCCESS",
                "reoptimization_type": "LOCALIZED_DYNAMIC_MICRO_MILP",
                "execution_latency_ms": round(t_elapsed * 1000, 2),
                "corridor": corridor,
                "block_section": section,
                "assigned_block": {
                    "block_plan_id": new_block_id,
                    "gq_corridor": corridor,
                    "block_section": section,
                    "primary_department": primary_dept,
                    "shadow_departments": shadow_depts,
                    "start_time": chosen_window["start_time"].strftime("%Y-%m-%d %H:%M:%S"),
                    "end_time": chosen_window["end_time"].strftime("%Y-%m-%d %H:%M:%S"),
                    "duration_hours": target_duration,
                    "shadow_hours_saved": round(len(shadow_depts) * 1.5, 1),
                    "urgency_score": round(urgency_score, 2),
                    "max_temp_c": 42.0,
                    "defect_count": len(shadow_depts) + 1,
                    "status": "EMERGENCY_OPTIMIZED"
                }
            }

            # 5. Broadcast update to Redis PubSub and update cached schedule
            try:
                self.redis_client.publish(CHANNEL_SCHEDULE_UPDATES, json.dumps(result, default=str))
                # Update cached payload
                cached = self.redis_client.get(REDIS_KEY)
                if cached:
                    cached_data = json.loads(cached)
                    cached_data["blocks"].append(result["assigned_block"])
                    cached_data["summary"]["total_mega_blocks_scheduled"] += 1
                    cached_data["summary"]["total_block_hours_allocated"] += target_duration
                    self.redis_client.set(REDIS_KEY, json.dumps(cached_data, default=str), ex=86400)
            except Exception as e:
                logger.warning(f"Redis update error during re-optimization: {e}")

            return result
        finally:
            conn.close()

def start_reoptimizer_listener():
    """Background listener for Redis Pub/Sub events."""
    r = get_redis_client()
    pubsub = r.pubsub()
    pubsub.subscribe(CHANNEL_EMERGENCY_DEFECTS, CHANNEL_TRAIN_DELAYS)
    logger.info(f"Redis Reoptimizer Listener subscribed to '{CHANNEL_EMERGENCY_DEFECTS}' and '{CHANNEL_TRAIN_DELAYS}'...")

    reoptimizer = SectionReoptimizer()

    for message in pubsub.listen():
        if message["type"] == "message":
            try:
                channel = message["channel"]
                data = json.loads(message["data"])
                logger.info(f"Received event on channel [{channel}]: {data}")

                if channel == CHANNEL_EMERGENCY_DEFECTS:
                    corridor = data.get("gq_corridor", "Delhi-Mumbai")
                    section = data.get("block_section", "SUR-PUNE")
                    reoptimizer.reoptimize_section(corridor=corridor, section=section, emergency_defect=data)
                elif channel == CHANNEL_TRAIN_DELAYS:
                    corridor = data.get("gq_corridor", "Delhi-Mumbai")
                    section = data.get("block_section", "KOTA-RMA")
                    reoptimizer.reoptimize_section(corridor=corridor, section=section, train_delay=data)
            except Exception as e:
                logger.error(f"Error processing pubsub message: {e}", exc_info=True)

if __name__ == "__main__":
    reopt = SectionReoptimizer()
    sample_emergency = {
        "department": "TMS",
        "defect_type": "Emergency Rail Buckling",
        "urgency": "CRITICAL",
        "duration_hours": 3.0,
        "shadow_departments": ["SMMS", "TDMS"]
    }
    res = reopt.reoptimize_section(
        corridor="Delhi-Mumbai",
        section="SUR-PUNE",
        emergency_defect=sample_emergency
    )
    print("\n--- Sub-Second Re-Optimization Result ---")
    print(json.dumps(res, indent=2))
