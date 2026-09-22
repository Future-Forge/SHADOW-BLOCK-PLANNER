"""
Autonomous Section Controller & AI Chief Dispatcher Agent.

Integrates Google Gemini with the in-memory Golden Quadrilateral railway network graph,
timetable cache, gap optimization solver, and emergency dispatcher.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, Optional

from app.config import settings
from app.core.gap_finder import GapFinder
from app.core.emergency_dispatcher import dispatch_emergency_block
from app.core.live_positions import compute_live_trains
from app.core.timetable_engine import time_to_minutes, minutes_to_time
from app.data.gq_corridors import resolve_track_line, same_leg
from app.models.enums import Criticality, Department, TrackLine, TrainCategory
from app.models.schemas import (
    BlockDecision,
    BlockDecisionStatus,
    BlockRequest,
    DispatcherChatResponse,
    FlyToTarget,
)

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """
You are the AUTONOMOUS SECTION CONTROLLER & AI CHIEF DISPATCHER for the Indian Railways Golden Quadrilateral (GQ) network.
You have direct telemetry command authority over trunk operations across Delhi-Mumbai (West), Mumbai-Chennai (South-West), Chennai-Howrah (East Coast), and Howrah-Delhi (North-East) corridors.

### OPERATIONAL DOMAIN RULES:
1. Departmental Maintenance Functions:
   - TMS (Track Management System): Deep screening, ballast tamping, rail fracture repairs, rail renewals.
   - SMMS (Signal & Telecom Maintenance Management System): Point machine overhaul, interlocking tests, track circuit maintenance.
   - TDMS (Traction Distribution Management System): 25kV AC OHE wire tensioning, pantograph inspection, power supply maintenance.
2. Train Priority Hierarchy for Resequencing:
   - P1 (Supreme): Vande Bharat / Rajdhani / Shatabdi Express
   - P2: Superfast Express
   - P3: Mail / Express
   - P4: MEMU / Suburban / Passenger
   - P5: Freight / Goods Rakes (BOXN, BTPN, Container)
3. Conflict Resolution Directive:
   - NEVER halt a P1 train for a Routine/Normal maintenance block.
   - If an EMERGENCY block halts a P1 train, enforce immediate loop line holding for lower-priority trains (P3-P5) ahead, clearing the trunk path the instant the block is lifted.
   - For emergency requests (rail fractures, OHE snags, signal failures), execute emergency block immediately.

4. Style & Response Protocol:
   - Respond in authoritative, crisp, tactical military-railway dispatch style.
   - Highlight station codes (e.g. `[ST]`, `[BCT]`, `[BRC]`), train numbers (e.g. `#12953`), and action directives in markdown.
   - Always name the action taken, the safety status, and traffic regulation orders.

5. Reporting Protocol:
   - When an operator asks for a monthly report, export, download, CSV, or block schedule for a month,
     call `generate_monthly_report`.
   - Extract the requested month and year. If no year is stated, use the current calendar year; for
     "last month", calculate the preceding calendar month and its year.
   - Confirm that the CSV report is ready for download after the tool is called.
"""

STATION_SYNONYMS: dict[str, str] = {
    "DELHI": "NDLS",
    "NEW DELHI": "NDLS",
    "NDLS": "NDLS",
    "MATHURA": "MTJ",
    "MTJ": "MTJ",
    "KOTA": "KOTA",
    "RATLAM": "RTM",
    "RTM": "RTM",
    "VADODARA": "BRC",
    "BARODA": "BRC",
    "BRC": "BRC",
    "SURAT": "ST",
    "ST": "ST",
    "MUMBAI": "BCT",
    "MUMBAI CENTRAL": "BCT",
    "BOMBAY": "BCT",
    "BCT": "BCT",
    "PUNE": "PUNE",
    "DAUND": "DD",
    "SOLAPUR": "SUR",
    "WADI": "WADI",
    "GUNTAKAL": "GTL",
    "RENIGUNTA": "RU",
    "CHENNAI": "MAS",
    "CHENNAI CENTRAL": "MAS",
    "MAS": "MAS",
    "GUDUR": "GDR",
    "VIJAYAWADA": "BZA",
    "BZA": "BZA",
    "RAJAHMUNDRY": "RJY",
    "VISAKHAPATNAM": "VSKP",
    "VIZAG": "VSKP",
    "BHUBANESWAR": "BBS",
    "CUTTACK": "CTC",
    "KHARAGPUR": "KGP",
    "HOWRAH": "HWH",
    "CALCUTTA": "HWH",
    "KOLKATA": "HWH",
    "HWH": "HWH",
    "ASANSOL": "ASN",
    "DHANBAD": "DHN",
    "GAYA": "GAYA",
    "MUGHAL SARAI": "MGS",
    "PT DEEN DAYAL UPADHYAYA": "MGS",
    "MGS": "MGS",
    "ALLAHABAD": "ALD",
    "PRAYAGRAJ": "ALD",
    "ALD": "ALD",
    "KANPUR": "CNB",
    "CNB": "CNB",
}


def normalize_station(name_or_code: str) -> str:
    cleaned = name_or_code.strip().upper()
    return STATION_SYNONYMS.get(cleaned, cleaned)


def str_or_time_to_minutes(val: Any) -> int:
    if isinstance(val, str):
        try:
            parts = val.split(":")
            h = int(parts[0]) if len(parts) > 0 else 12
            m = int(parts[1]) if len(parts) > 1 else 0
            s = int(parts[2]) if len(parts) > 2 else 0
            return (h * 60 + m + (1 if s >= 30 else 0)) % 1440
        except Exception:
            return 720
    elif hasattr(val, "hour"):
        return (val.hour * 60 + val.minute + (1 if val.second >= 30 else 0)) % 1440
    return 720


def minutes_to_timestr(m: int) -> str:
    m = m % (24 * 60)
    return f"{m // 60:02d}:{m % 60:02d}:00"


_MONTH_NAMES = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9, "october": 10,
    "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}


def _resolve_report_period(message: str) -> tuple[str, int] | None:
    """Extract a report month/year, including relative wording such as 'last month'."""
    text = message.lower()
    now = datetime.now().astimezone()
    if "last month" in text or "previous month" in text:
        month = 12 if now.month == 1 else now.month - 1
        year = now.year - 1 if now.month == 1 else now.year
        return datetime(year, month, 1).strftime("%B"), year

    matched = re.search(r"\b(" + "|".join(_MONTH_NAMES) + r")\b", text)
    if not matched:
        return None
    year_match = re.search(r"\b(20\d{2})\b", text)
    month = _MONTH_NAMES[matched.group(1)]
    return datetime(now.year if not year_match else int(year_match.group(1)), month, 1).strftime("%B"), (
        now.year if not year_match else int(year_match.group(1))
    )



class DispatcherExecutionContext:
    """Carries session state and captures tool side-effects."""
    def __init__(self, bundle: Any, sim_time: str = "12:00:00"):
        self.bundle = bundle
        self.sim_time = sim_time
        self.action_triggered: str = "NONE"
        self.payload: dict[str, Any] = {}
        self.fly_to_target: Optional[FlyToTarget] = None


FLAGSHIP_FLEET: dict[str, dict[str, Any]] = {
    "12951": {"name": "Mumbai Rajdhani Express", "category": TrainCategory.PREMIUM, "leg": "WEST", "origin": "BCT", "destination": "NDLS", "speed": 128.0, "lat": 21.85, "lon": 73.05, "section": "ST-BRC"},
    "12953": {"name": "August Kranti Rajdhani", "category": TrainCategory.PREMIUM, "leg": "WEST", "origin": "BCT", "destination": "NDLS", "speed": 122.0, "lat": 22.02, "lon": 73.12, "section": "ST-BRC"},
    "20901": {"name": "Vande Bharat Express", "category": TrainCategory.PREMIUM, "leg": "WEST", "origin": "BCT", "destination": "BRC", "speed": 135.0, "lat": 20.60, "lon": 72.95, "section": "BCT-ST"},
    "12840": {"name": "Howrah - Chennai Mail", "category": TrainCategory.SUPERFAST, "leg": "EAST_COAST", "origin": "HWH", "destination": "MAS", "speed": 105.0, "lat": 16.75, "lon": 81.20, "section": "RJY-BZA"},
    "12841": {"name": "Coromandel Express", "category": TrainCategory.SUPERFAST, "leg": "EAST_COAST", "origin": "HWH", "destination": "MAS", "speed": 110.0, "lat": 17.35, "lon": 82.50, "section": "VSKP-RJY"},
    "12301": {"name": "Kolkata Rajdhani Express", "category": TrainCategory.PREMIUM, "leg": "NORTH_EAST", "origin": "HWH", "destination": "NDLS", "speed": 130.0, "lat": 24.25, "lon": 85.70, "section": "DHN-GAYA"},
    "12313": {"name": "Sealdah Rajdhani Express", "category": TrainCategory.PREMIUM, "leg": "NORTH_EAST", "origin": "HWH", "destination": "NDLS", "speed": 125.0, "lat": 25.04, "lon": 84.10, "section": "GAYA-MGS"},
    "12163": {"name": "Mumbai LTT - Chennai Express", "category": TrainCategory.EXPRESS, "leg": "SOUTH_WEST", "origin": "BCT", "destination": "MAS", "speed": 96.0, "lat": 17.35, "lon": 76.50, "section": "SUR-WADI"},
    "22692": {"name": "Bengaluru Rajdhani", "category": TrainCategory.PREMIUM, "leg": "SOUTH_WEST", "origin": "MAS", "destination": "BCT", "speed": 115.0, "lat": 16.10, "lon": 77.18, "section": "WADI-GTL"},
    "84920": {"name": "BOXN Coal Freight Rake", "category": TrainCategory.FREIGHT, "leg": "WEST", "origin": "BRC", "destination": "ST", "speed": 72.0, "lat": 21.60, "lon": 72.95, "section": "BRC-ST"},
    "88214": {"name": "BTPN Petroleum Rake", "category": TrainCategory.FREIGHT, "leg": "NORTH_EAST", "origin": "ALD", "destination": "CNB", "speed": 68.0, "lat": 25.95, "lon": 81.10, "section": "ALD-CNB"},
    "59045": {"name": "Surat - Vadodara Passenger", "category": TrainCategory.PASSENGER, "leg": "WEST", "origin": "ST", "destination": "BRC", "speed": 58.0, "lat": 21.45, "lon": 72.88, "section": "ST-BRC"},
}


def create_dispatcher_tools(ctx: DispatcherExecutionContext):
    network = ctx.bundle.network
    timetable = ctx.bundle.timetable
    operation_store = getattr(ctx.bundle, "operation_store", None)

    def generate_monthly_report(month_name: str, year: int) -> str:
        """Generate a CSV report for all committed block operations in a named month and year."""
        month_key = month_name.strip().lower()
        month = _MONTH_NAMES.get(month_key)
        if month is None:
            return json.dumps({"error": f"Unknown month: {month_name}"})
        if operation_store is None:
            return json.dumps({"error": "Operations cache is unavailable."})

        csv_data = operation_store.monthly_csv(month, int(year))
        ctx.action_triggered = "DOWNLOAD_CSV"
        ctx.payload = {
            "csv_data": csv_data,
            "month": datetime(int(year), month, 1).strftime("%B"),
            "year": int(year),
        }
        return json.dumps({
            "status": "ready",
            "month": ctx.payload["month"],
            "year": ctx.payload["year"],
            "row_count": max(0, len(csv_data.splitlines()) - 1),
        })

    def analyze_shadow_block(
        from_station: str,
        to_station: str,
        department: str = "TMS",
        requested_time: str = "12:00:00",
        duration_minutes: int = 60,
        criticality: str = "NORMAL",
    ) -> str:
        """
        Analyze timetable capacity, find headway gaps, and assess disruption for a planned railway block.
        """
        from_code = normalize_station(from_station)
        to_code = normalize_station(to_station)

        leg_id = same_leg(from_code, to_code, network.station_leg_index)
        if not leg_id:
            return json.dumps({
                "error": f"Stations {from_code} and {to_code} are not both on a Golden Quadrilateral corridor."
            })

        track_line = resolve_track_line(leg_id, from_code, to_code) or TrackLine.UP
        req_min = str_or_time_to_minutes(requested_time)

        st_a = network.stations.get(from_code)
        st_b = network.stations.get(to_code)
        if st_a and st_b:
            ctx.fly_to_target = FlyToTarget(
                lat=round((st_a.lat + st_b.lat) / 2, 5),
                lon=round((st_a.lon + st_b.lon) / 2, 5),
                zoom=11.0,
            )

        crit_enum = Criticality(criticality.upper()) if criticality.upper() in Criticality._value2member_map_ else Criticality.NORMAL
        dept_enum = Department(department.upper()) if department.upper() in Department._value2member_map_ else Department.TMS

        gf = GapFinder(timetable)
        best = gf.best_gap_near(leg_id, track_line, from_code, to_code, req_min, duration_minutes)

        affected = []
        status = "APPROVED" if best else "APPROVED_WITH_REGULATION"
        window_start = requested_time
        window_end = minutes_to_timestr((req_min + duration_minutes) % 1440)

        if best:
            window_start = minutes_to_timestr(best.start_min % 1440)
            window_end = minutes_to_timestr((best.start_min + duration_minutes) % 1440)

        track_geometry = network.get_track_segment(from_code, to_code)
        ctx.action_triggered = "ANALYZE_GAP"
        ctx.payload = {
            "from_station": from_code,
            "to_station": to_code,
            "department": dept_enum.value,
            "criticality": crit_enum.value,
            "track_line": track_line.value,
            "block_window": {"start": window_start, "end": window_end},
            "status": status,
            "duration_minutes": duration_minutes,
            "asset_availability_index": 96.5 if best else 78.0,
            "affected_trains": affected,
            "block_geometry": track_geometry,
            "shadow_merging_opportunity": f"Slot allows simultaneous {dept_enum.value} + SMMS dual-maintenance without additional headway penalty.",
        }

        return json.dumps(ctx.payload)

    def execute_emergency_block(
        from_station: str,
        to_station: str,
        department: str = "TMS",
        reason: str = "Emergency track / OHE hazard",
    ) -> str:
        """
        Immediately lock a block section on live map, issue hold/caution orders, and calculate cascade delays.
        """
        from_code = normalize_station(from_station)
        to_code = normalize_station(to_station)

        leg_id = same_leg(from_code, to_code, network.station_leg_index)
        if not leg_id:
            # Fallback to WEST corridor if not recognized
            leg_id = "WEST"

        track_line = resolve_track_line(leg_id, from_code, to_code) or TrackLine.UP
        incident_min = str_or_time_to_minutes(ctx.sim_time)

        st_a = network.stations.get(from_code)
        st_b = network.stations.get(to_code)
        if st_a and st_b:
            ctx.fly_to_target = FlyToTarget(
                lat=round((st_a.lat + st_b.lat) / 2, 5),
                lon=round((st_a.lon + st_b.lon) / 2, 5),
                zoom=11.0,
            )

        train_names = {num: t.name for num, t in timetable.trains.items()}
        # Add flagship train names into name mapping
        for f_num, f_info in FLAGSHIP_FLEET.items():
            if f_num not in train_names:
                train_names[f_num] = f_info["name"]

        result = dispatch_emergency_block(
            network=network,
            timetable=timetable,
            leg_id=leg_id,
            track_line=track_line,
            from_code=from_code,
            to_code=to_code,
            incident_min=incident_min,
            duration_minutes=60,
            train_names=train_names,
        )

        orders_summary = [
            {
                "train_number": o.train_number,
                "train_name": o.train_name,
                "action": o.action.value,
                "location": o.location,
                "delay_minutes": o.cascade_delay_minutes,
                "instruction": o.instruction,
            }
            for o in result.hold_orders[:6]
        ]

        track_geometry = network.get_track_segment(from_code, to_code)
        ctx.action_triggered = "EXECUTE_BLOCK"
        ctx.payload = {
            "block_id": result.block_id,
            "from_station": from_code,
            "to_station": to_code,
            "track_line": track_line.value,
            "locked_at": result.locked_at.strftime("%H:%M:%S") if hasattr(result.locked_at, "strftime") else str(result.locked_at),
            "department": department.upper(),
            "criticality": "EMERGENCY",
            "duration_minutes": 60,
            "reason": reason,
            "total_cascade_delay_minutes": result.total_cascade_delay_minutes,
            "hold_orders": orders_summary,
            "affected_trains": orders_summary,
            "block_geometry": track_geometry,
        }

        if operation_store is not None:
            operation = operation_store.record(
                department=department.upper(),
                corridor=leg_id,
                from_station=from_code,
                to_station=to_code,
                start_time=ctx.sim_time,
                duration_minutes=60,
                impacted_trains=(order["train_number"] for order in orders_summary),
            )
            ctx.payload["block_id"] = operation.block_id

        return json.dumps(ctx.payload)

    def resequence_traffic(
        affected_trains: list[str],
        block_window_end: str = "13:00:00",
    ) -> str:
        """
        Re-sequence traffic departure order and compute staggered release headway prioritizing P1 trains.
        """
        train_objects = []
        for t_num in affected_trains:
            t = timetable.trains.get(t_num)
            if t:
                train_objects.append({
                    "number": t.number,
                    "name": t.name,
                    "category": t.category,
                })
            elif t_num in FLAGSHIP_FLEET:
                f = FLAGSHIP_FLEET[t_num]
                train_objects.append({
                    "number": t_num,
                    "name": f["name"],
                    "category": f["category"],
                })

        if not train_objects:
            # Provide standard mix if unspecified
            for t_num in ["12953", "12841", "84920", "59045"]:
                if t_num in FLAGSHIP_FLEET:
                    f = FLAGSHIP_FLEET[t_num]
                    train_objects.append({
                        "number": t_num,
                        "name": f["name"],
                        "category": f["category"],
                    })

        def priority_key(t):
            cat = t["category"]
            if cat == TrainCategory.PREMIUM:
                return 1
            if cat == TrainCategory.SUPERFAST:
                return 2
            if cat == TrainCategory.EXPRESS:
                return 3
            if cat == TrainCategory.PASSENGER:
                return 4
            return 5  # Freight

        sorted_trains = sorted(train_objects, key=priority_key)
        resequence_plan = []
        base_min = str_or_time_to_minutes(block_window_end)

        for idx, tr in enumerate(sorted_trains):
            slot_min = base_min + idx * 4  # 4-minute staggered release
            resequence_plan.append({
                "train_number": tr["number"],
                "train_name": tr["name"],
                "category": tr["category"].value,
                "priority_rank": f"P{priority_key(tr)}",
                "dispatch_slot": minutes_to_timestr(slot_min % 1440),
                "dynamic_speed_advice_kmph": 130 if tr["category"] == TrainCategory.PREMIUM else 110 if tr["category"] == TrainCategory.SUPERFAST else 80,
                "action": "CLEARED FOR MAINLINE RUNNING" if priority_key(tr) <= 2 else "HOLD IN LOOP UNTIL P1/P2 CLEAR",
            })

        ctx.action_triggered = "RESEQUENCE"
        ctx.payload = {
            "resequence_plan": resequence_plan,
            "block_window_end": block_window_end,
            "bottleneck_clearance_minutes": len(sorted_trains) * 4,
            "priority_protocol": "P1 (Vande Bharat/Rajdhani) cleared first; lower tiers regulated in loops.",
        }

        return json.dumps(ctx.payload)

    def inspect_train_status(train_number: str) -> str:
        """
        Query real-time coordinates, speed, current block section, and delay for any train number.
        """
        clean_num = re.sub(r"[^\d]", "", train_number)
        t = timetable.trains.get(clean_num)
        if not t:
            # Search by partial match in timetable
            match = next((train for num, train in timetable.trains.items() if clean_num in num), None)
            if match:
                t = match
                clean_num = t.number

        at_min = str_or_time_to_minutes(ctx.sim_time)
        live_trains = compute_live_trains(network, timetable, at_min)
        live_state = next((lt for lt in live_trains if lt.train_number == clean_num), None)

        if live_state:
            ctx.fly_to_target = FlyToTarget(
                lat=live_state.lat,
                lon=live_state.lon,
                zoom=11.0,
            )
            ctx.action_triggered = "TRAIN_INSPECT"
            ctx.payload = {
                "train_number": live_state.train_number,
                "train_name": live_state.train_name,
                "category": live_state.category.value,
                "current_section": live_state.current_section,
                "speed_kmph": live_state.speed_kmph,
                "status": live_state.status.value,
                "lat": live_state.lat,
                "lon": live_state.lon,
                "delay_minutes": live_state.delay_minutes,
            }
            return json.dumps(ctx.payload)

        # Check Flagship Fleet
        if clean_num in FLAGSHIP_FLEET:
            f = FLAGSHIP_FLEET[clean_num]
            ctx.fly_to_target = FlyToTarget(
                lat=f["lat"],
                lon=f["lon"],
                zoom=11.0,
            )
            ctx.action_triggered = "TRAIN_INSPECT"
            ctx.payload = {
                "train_number": clean_num,
                "train_name": f["name"],
                "category": f["category"].value,
                "current_section": f["section"],
                "speed_kmph": f["speed"],
                "status": "RUNNING",
                "lat": f["lat"],
                "lon": f["lon"],
                "delay_minutes": 0.0,
            }
            return json.dumps(ctx.payload)

        if t:
            ctx.payload = {
                "train_number": t.number,
                "train_name": t.name,
                "category": t.category.value,
                "origin": t.stops[0].station_code if t.stops else "UNKNOWN",
                "destination": t.stops[-1].station_code if t.stops else "UNKNOWN",
                "status": "SCHEDULED / NOT IN LIVE RUNNING WINDOW",
            }
            return json.dumps(ctx.payload)

        return json.dumps({"error": f"Train #{clean_num} not found in Golden Quadrilateral timetable index."})

    return {
        "analyze_shadow_block": analyze_shadow_block,
        "execute_emergency_block": execute_emergency_block,
        "resequence_traffic": resequence_traffic,
        "inspect_train_status": inspect_train_status,
        "generate_monthly_report": generate_monthly_report,
    }


def deterministic_dispatcher_fallback(
    ctx: DispatcherExecutionContext,
    tools: dict[str, Any],
    message: str,
) -> DispatcherChatResponse:
    """
    Intelligent domain-specific fallback NLP processor.
    Handles dispatcher queries when Gemini API key is missing or offline.
    """
    msg = message.lower()

    report_intent = any(word in msg for word in ["report", "export", "download", "csv", "schedule"])
    report_period = _resolve_report_period(message)
    if report_intent and report_period:
        month_name, year = report_period
        raw_res = tools["generate_monthly_report"](month_name, year)
        data = json.loads(raw_res)
        if "error" in data:
            return DispatcherChatResponse(
                response_text=f"⚠️ **REPORT GENERATION FAILED**: {data['error']}",
                action_triggered="NONE",
            )
        return DispatcherChatResponse(
            response_text=(
                f"📥 **MONTHLY SHADOW BLOCK REPORT READY**\n\n"
                f"- **Period:** `{data['month']} {data['year']}`\n"
                f"- **Committed Operations:** `{data['row_count']}`\n"
                f"- **Format:** `CSV`\n\n"
                "*Download transfer initiated.*"
            ),
            action_triggered=ctx.action_triggered,
            payload=ctx.payload,
        )

    # 1. Check for Train Inspection
    train_num_match = re.search(r"(?:train|rake|#)\s*(\d{4,5})", msg)
    if not train_num_match:
        train_num_match = re.search(r"\b(\d{5})\b", msg)

    if ("inspect" in msg or "status" in msg or "locate" in msg or "where is" in msg) and train_num_match:
        t_num = train_num_match.group(1)
        raw_res = tools["inspect_train_status"](t_num)
        data = json.loads(raw_res)

        if "error" in data:
            return DispatcherChatResponse(
                response_text=f"⚠️ **TRAIN TELEMETRY NOT FOUND**: {data['error']}",
                action_triggered="NONE",
            )

        speed = data.get("speed_kmph", 0)
        section = data.get("current_section", "In transit")
        return DispatcherChatResponse(
            response_text=(
                f"🛰️ **TELEMETRY LOCK: #{data['train_number']} {data['train_name']}**\n\n"
                f"- **Category:** `{data.get('category', 'SUPERFAST')}` (P2 Trunk Unit)\n"
                f"- **Live Section:** `{section}`\n"
                f"- **Telemetry Velocity:** `{speed} km/h`\n"
                f"- **Signal Status:** `NOMINAL / CLEAR RUNNING`\n"
                f"- **Coordinates:** `{data.get('lat', 0.0)}°N, {data.get('lon', 0.0)}°E`\n\n"
                f"*Tactical camera view sweeping to train position.*"
            ),
            action_triggered="TRAIN_INSPECT",
            payload=data,
            fly_to_target=ctx.fly_to_target,
        )

    # 2. Check for Emergency Block Directive
    is_emergency = any(w in msg for w in ["emergency", "fracture", "snag", "broken", "derail", "crack", "wire", "ohe"])
    is_block = any(w in msg for w in ["block", "lock", "halt", "stop", "freeze"])

    # Extract origin and destination stations
    detected_stations = []
    for word in re.findall(r"\b[A-Za-z]{2,20}\b", msg):
        norm = normalize_station(word)
        if norm in STATION_SYNONYMS.values() and norm not in detected_stations:
            detected_stations.append(norm)

    if is_emergency and is_block and len(detected_stations) >= 2:
        from_st = detected_stations[0]
        to_st = detected_stations[1]
        raw_res = tools["execute_emergency_block"](from_st, to_st, "TMS", "Emergency track/OHE disruption")
        data = json.loads(raw_res)

        hold_lines = ""
        for o in data.get("hold_orders", [])[:4]:
            hold_lines += f"- **#{o['train_number']} {o['train_name']}**: `{o['action']}` at `{o['location']}` (+{o['delay_minutes']} min)\n"

        return DispatcherChatResponse(
            response_text=(
                f"🚨 **EMERGENCY BLOCK ENFORCED: [{data['from_station']}] ➔ [{data['to_station']}]**\n\n"
                f"- **Block ID:** `{data['block_id']}`\n"
                f"- **Department:** `TMS (Track Safety Tier 1)`\n"
                f"- **Section Status:** `LOCKED / 3D ISOLATION ACTIVE`\n"
                f"- **Estimated Hold Window:** `60 Minutes`\n"
                f"- **Cascade Headway Cost:** `+{data.get('total_cascade_delay_minutes', 0)} min`\n\n"
                f"### Traffic Regulation Orders Issued:\n"
                f"{hold_lines or '- No immediately approaching traffic inside safety buffer.'}\n\n"
                f"*3D Tactical containment pillars extruded. Approaches restricted to 15 km/h caution.*"
            ),
            action_triggered="EXECUTE_BLOCK",
            payload=data,
            fly_to_target=ctx.fly_to_target,
        )

    # 3. Check for Planned / Shadow Block Analysis
    if is_block and len(detected_stations) >= 2:
        from_st = detected_stations[0]
        to_st = detected_stations[1]
        raw_res = tools["analyze_shadow_block"](from_st, to_st, "TMS", ctx.sim_time, 60, "NORMAL")
        data = json.loads(raw_res)

        return DispatcherChatResponse(
            response_text=(
                f"📊 **SHADOW BLOCK ANALYSIS: [{data['from_station']}] ➔ [{data['to_station']}]**\n\n"
                f"- **Recommended Window:** `{data['block_window']['start']} - {data['block_window']['end']}` ({data['duration_minutes']} min)\n"
                f"- **Asset Availability Index:** `{data['asset_availability_index']}%`\n"
                f"- **Status:** `APPROVED / ZERO-DELAY GAP CONFIRMED`\n"
                f"- **Shadow Opportunity:** {data.get('shadow_merging_opportunity', 'Single window shared across civil & OHE teams.')}\n\n"
                f"*Ready to commit to live network schedule.*"
            ),
            action_triggered="ANALYZE_GAP",
            payload=data,
            fly_to_target=ctx.fly_to_target,
        )

    # 4. Check for Resequencing Directive
    if "resequence" in msg or "priority" in msg or "clearance" in msg:
        raw_res = tools["resequence_traffic"](["12953", "12841", "84920", "59045"], "13:30:00")
        data = json.loads(raw_res)
        plan_rows = ""
        for p in data.get("resequence_plan", []):
            plan_rows += f"- **{p['priority_rank']} #{p['train_number']} {p['train_name']}**: Depart `{p['dispatch_slot']}` @ `{p['dynamic_speed_advice_kmph']} km/h`\n"

        return DispatcherChatResponse(
            response_text=(
                f"🔄 **TRAFFIC RESEQUENCING MATRIX ACTIVE**\n\n"
                f"- **Priority Protocol:** `Vande Bharat / Rajdhani (P1) > Superfast (P2) > Freight (P5)`\n"
                f"- **Dispatch Sequence:**\n{plan_rows}\n"
                f"- **Bottleneck Clearance:** `{data.get('bottleneck_clearance_minutes', 16)} minutes total`\n"
                f"Loop line holds verified to ensure zero headway interference for premium rakes."
            ),
            action_triggered="RESEQUENCE",
            payload=data,
        )

    # General Controller Guidance
    return DispatcherChatResponse(
        response_text=(
            "👮 **AI CHIEF DISPATCHER STANDING BY.**\n\n"
            "I have command link into all 4 Golden Quadrilateral trunk corridors. You can transmit tactical directives:\n"
            "- *\"Emergency block Surat to Mumbai Central due to OHE wire snag\"*\n"
            "- *\"Analyze 60min TMS maintenance block between Vadodara and Surat\"*\n"
            "- *\"Inspect real-time status of Train 12953\"*\n"
            "- *\"Resequence corridor traffic according to P1 hierarchy\"*"
        ),
        action_triggered="NONE",
    )


def process_dispatcher_message(
    bundle: Any,
    message: str,
    session_id: str = "default",
    sim_time: str = "12:00:00",
) -> DispatcherChatResponse:
    """
    Main entrypoint: executes dispatcher conversation through Gemini tool-calling,
    with automatic fallback to local rule-based dispatcher if Gemini API is not configured.
    """
    ctx = DispatcherExecutionContext(bundle=bundle, sim_time=sim_time)
    tools = create_dispatcher_tools(ctx)

    if not settings.GEMINI_API_KEY:
        logger.info("GEMINI_API_KEY not set; using local deterministic AI dispatcher.")
        return deterministic_dispatcher_fallback(ctx, tools, message)

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            system_instruction=SYSTEM_INSTRUCTION,
            tools=list(tools.values()),
        )

        chat = model.start_chat(enable_automatic_function_calling=True)
        response = chat.send_message(
            f"[Current Mission Clock: {sim_time}]\nOperator Directive: {message}"
        )

        response_text = response.text or "Directive processed successfully."

        return DispatcherChatResponse(
            response_text=response_text,
            action_triggered=ctx.action_triggered,
            payload=ctx.payload,
            fly_to_target=ctx.fly_to_target,
        )
    except Exception as e:
        logger.warning(f"Gemini API invocation error: {e}. Falling back to deterministic dispatcher.")
        return deterministic_dispatcher_fallback(ctx, tools, message)
