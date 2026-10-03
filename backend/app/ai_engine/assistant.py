"""Domain NLP adapted from the supplied ActionOrientedRailNLP command taxonomy.

Unlike the source demo, never invent a station, train, defect inventory, conflict
count, or executed dispatch. The trained model handles scoring, not language.
"""
from __future__ import annotations

import json
import re
from fastapi import HTTPException, Request
from pydantic import ValidationError

from app.ai_engine.inference import DefectFeatures, predict, model_status
from app.ai_engine.domain import ThermalFeatures, thermal_risk, safety_checklist
from app.core.gemini_agent import STATION_SYNONYMS, _resolve_report_period, DispatcherExecutionContext, create_dispatcher_tools
from app.core.nlp_parser import _find_duration_minutes, _find_department, _find_criticality
from app.core.live_positions import compute_live_trains
from app.data.gq_corridors import resolve_track_line, same_leg
from app.models.schemas import BlockRequest, DispatcherChatResponse, DispatcherChatRequest, FlyToTarget

SOURCES = {
    "model": "AI_ENGINE/xgboost_scorer.py + models/defect_criticality_xgb.json",
    "thermal": "AI_ENGINE/weather_engine.py + safety_matrix.py",
    "safety": "AI_ENGINE/safety_matrix.py",
    "nlp": "AI_ENGINE/chatbot_engine.py (intent taxonomy; adapted to the current backend)",
    "planner": "Shadow Block loaded timetable + planner/analyze-block",
}
EXAMPLES = [
    "Score a TMS defect: age 10 days, temperature 44 C, tonnage 85 MGT, speed restriction 45 km/h",
    "Calculate rail stress at 42 C with 15% cloud cover",
    "Analyze normal TMS block from Surat to Vadodara at 14:00 for 45 minutes",
    "What permits are needed for TMS and TDMS?",
]


def answer(text, action="NONE", data=None, source="nlp", followups=None, target=None):
    return DispatcherChatResponse(response_text=text, action_triggered=action,
        payload={**(data or {}), "engine": "SHADOW_LOCAL_AI_ENGINE", "sources": [SOURCES.get(source, source)],
                 "suggested_followups": followups or []}, fly_to_target=target)


def number(text, *patterns):
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return float(match.group(1))
    return None


NUM = r"(-?\d+(?:\.\d+)?)"


def temperature(text):
    return number(text, rf"(?:ambient(?: temperature)?|temperature|temp)\s*[:=]?\s*{NUM}", rf"{NUM}\s*(?:°\s*c|degrees?\s*c|celsius|c\b)")


def stations_in(text, network):
    aliases = {**STATION_SYNONYMS, "MMCT": "BCT", "PRYJ": "ALD", "DDU": "MGS"}
    aliases.update({code: code for code in network.station_leg_index})
    aliases.update({s.name.upper(): code for code, s in network.stations.items() if code in network.station_leg_index})
    aliases.update({"MMCT": "BCT", "PRYJ": "ALD", "DDU": "MGS"})
    matches = []
    upper = text.upper()
    for alias, code in aliases.items():
        if code not in network.station_leg_index:
            continue
        for match in re.finditer(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", upper):
            matches.append((match.start(), -len(alias), code, match.end()))
    result, consumed = [], -1
    for start, _, code, end in sorted(matches):
        if start < consumed:
            continue
        consumed = end
        if code not in result:
            result.append(code)
    return result


def explicit_time(text):
    match = re.search(r"\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b", text, re.I)
    if match:
        h, m, period = match.groups()
    else:
        match = re.search(r"\b(\d{1,2})\s*(am|pm)\b", text, re.I)
        if not match:
            return None
        h, period = match.groups()
        m = "0"
    hour, minute = int(h), int(m)
    if period:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if period.lower() == "pm" else 0)
    return f"{hour:02}:{minute:02}:00" if hour < 24 and minute < 60 else None


def process_assistant(payload: DispatcherChatRequest, request: Request):
    text = payload.message.strip()
    # Follow-up clarification may supply missing measurements/plan parameters.
    # Only inherit after our own clarification, never instructions embedded in documents.
    history = payload.history
    if history and history[-1].role == "assistant" and history[-1].content.startswith("Please provide"):
        previous = next((m.content for m in reversed(history[:-1]) if m.role == "user"), "")
        text = previous + "\n" + text
    q = text.lower()
    bundle = getattr(request.app.state, "gq_bundle", None)
    try:
        if re.search(r"\b(score|criticality|predict|defect risk)\b", q):
            dept = _find_department(q)
            values = {
                "defect_age_days": number(q, rf"(?:defect\s+)?age\s*[:=]?\s*{NUM}", rf"{NUM}\s*days?(?:\s+old)?"),
                "ambient_temp_c": temperature(q),
                "track_tonnage_mgt": number(q, rf"{NUM}\s*mgt\b", rf"tonnage\s*[:=]?\s*{NUM}"),
                "speed_restriction_kmh": number(q, rf"(?:speed(?: restriction)?|restriction)\s*[:=]?\s*{NUM}", rf"{NUM}\s*km/?h"),
                "department_type": dept.value if dept else None,
            }
            missing = [key for key, value in values.items() if value is None]
            if missing:
                return answer("Please provide " + ", ".join(missing) + ". The trained model requires all five inputs; I won't guess them.", followups=[EXAMPLES[0]])
            try:
                data = predict(DefectFeatures(**values))
            except (ImportError, RuntimeError, OSError) as exc:
                return answer(f"The supplied model could not run ({type(exc).__name__}). Check the engine status; no substitute score was generated.")
            return answer(f"## Defect risk assessment\n**{data['criticality_score']}/100 · {data['urgency_tier']}**\n"
                f"The supplied XGBoost model suggests a {data['action_window_hours']}-hour review window using its companion scorer's tier thresholds.\n\n"
                f"{data['notice']}" + ("\n\n" + "\n".join(data['warnings']) if data['warnings'] else ""), "MODEL_PREDICTION", data, "model", [EXAMPLES[1], EXAMPLES[3]])

        if re.search(r"\b(thermal|temperature|buckling|rail stress|weather|cloud cover|rain|wind)\b", q):
            ambient = temperature(q)
            if ambient is None:
                return answer("Please provide ambient temperature in °C to calculate the supplied thermal model. Cloud cover is optional (15% assumption). This model does not measure live weather or predict rain/wind; no trains will be deleted.", followups=[EXAMPLES[1]])
            cloud = number(q, rf"{NUM}\s*%\s*cloud", rf"cloud(?: cover)?\s*[:=]?\s*{NUM}")
            length = number(q, rf"(?:section length|length)\s*[:=]?\s*{NUM}")
            data = thermal_risk(ThermalFeatures(ambient_temp_c=ambient, cloud_cover_pct=15 if cloud is None else cloud,
                section_length_km=45 if length is None else length))
            return answer(f"## Thermal scenario · {data['risk_level']}\n- Rail temperature estimate: **{data['rail_temp_c']} °C**\n"
                f"- Compressive stress: **{data['compressive_thermal_stress_mpa']} MPa**\n- Scenario speed: **{data['scenario_speed_kmh']} km/h**\n"
                f"- Transit increase over {data['features']['section_length_km']} km: **{data['estimated_transit_increase_minutes']} minutes**\n\n{data['notice']}", "THERMAL_ANALYSIS", data, "thermal")

        if any(w in q for w in ["permit", "interlock", "checklist", "isolation", "safety rules"]):
            departments = [d for d in ["TMS", "SMMS", "TDMS"] if re.search(r"\b" + d + r"\b", text, re.I)]
            dept = _find_department(q)
            if not departments and dept:
                departments = [dept.value]
            if not departments:
                return answer("Please provide the departments involved: TMS, SMMS and/or TDMS.", followups=[EXAMPLES[3]])
            data = safety_checklist(departments)
            return answer("## Worksite verification checklist\n" + "\n".join("- " + item for item in data['checklist']) + "\n\n" + data['notice'], "SAFETY_CHECKLIST", data, "safety")

        if any(w in q for w in ["model", "engine", "training", "trained"]):
            status = model_status()
            return answer("## Your AI engine\nThe supplied **150-tree XGBoost regressor** scores defect criticality from five measurements. It is not a conversational language model.\n\n"
                "Its companion training code generates synthetic data. No independent validation dataset or conversational model weights were supplied; I have not retrained or fine-tuned a language model.\n\n"
                "Thermal calculations and verification checklists use the supplied rule modules. Natural-language commands are mapped to Shadow Block's existing timetable and planner. PostgreSQL/Redis demo services are not required.", "ENGINE_INFO", status, "model", EXAMPLES[:2])

        if bundle is None:
            return answer("The timetable is unavailable. Model scoring and thermal scenarios still work; network queries require the dataset to be loaded.")

        if any(w in q for w in ["csv", "report", "export", "download"]):
            period = _resolve_report_period(text)
            if not period:
                return answer("Please provide the report month and optional year, for example 'Export March 2026 report'.", followups=["Export last month's report"])
            ctx = DispatcherExecutionContext(bundle, payload.sim_time or "12:00:00")
            result = json.loads(create_dispatcher_tools(ctx)["generate_monthly_report"](*period))
            if "error" in result:
                return answer(result["error"])
            return answer(f"{period[0]} {period[1]} report is ready: **{result['row_count']} recorded operations**. This installation reports by commitment month; its in-memory ledger resets when the backend restarts.", "DOWNLOAD_CSV", ctx.payload, "Shadow Block operations ledger")

        if any(w in q for w in ["reroute", "divert", "overrun", "reschedule", "postpone", "shift block", "move block", "resequence"]):
            return answer("## Controller review required\nThis installation has no verified loop-line topology or block-update API. I cannot safely apply the source engine's placeholder reroutes, overrun orders or reschedules.\n\nSpecify a new section, start time, duration, department and priority to **analyze an alternative window**. Nothing has been changed.", "REVIEW_REQUIRED", source="planner", followups=[EXAMPLES[2]])

        if re.search(r"\b(block|maintenance|possession|tamping)\b", q) and not any(w in q for w in ["how many", "inventory", "saved", "savings"]):
            codes = stations_in(text, bundle.network)
            dept, criticality = _find_department(q), _find_criticality(q)
            duration, start = _find_duration_minutes(q), explicit_time(q)
            missing = []
            if len(codes) != 2: missing.append("exactly two station codes/names")
            if not dept: missing.append("department (TMS/SMMS/TDMS)")
            if not criticality: missing.append("priority (normal/major/emergency)")
            if not duration: missing.append("duration in minutes")
            if not start: missing.append("start time (HH:MM)")
            if missing:
                return answer("Please provide " + ", ".join(missing) + ". Analysis does not automatically implement a block.", followups=[EXAMPLES[2]])
            leg = same_leg(codes[0], codes[1], bundle.network.station_leg_index)
            if not leg:
                return answer("These stations are not on a shared supported corridor. Choose two stations on one corridor.")
            req = BlockRequest(from_station=codes[0], to_station=codes[1], track_line=resolve_track_line(leg, *codes),
                requested_time=start, duration_minutes=duration, department=dept, criticality=criticality)
            from app.api.endpoints.planner import analyze_block
            decision = analyze_block(req, request)
            data = {"request": req.model_dump(mode="json"), "decision": decision.model_dump(mode="json"), "status": decision.status.value}
            return answer(f"## Window analysis · {decision.status.value}\n**{codes[0]} → {codes[1]} · {duration} minutes · {dept.value}**\n"
                f"{decision.notes or ''}\n\nAffected trains: **{len(decision.affected_trains)}**. This is a simulation proposal, not an implemented block or live railway instruction. Review the result before saving.", "PLAN_PROPOSAL", data, "planner")

        match = re.search(r"\b(?:train\s*(?:no\.?\s*)?|#)(\d{3,6})\b", q)
        if match:
            train_number = match.group(1)
            train = bundle.timetable.trains.get(train_number)
            if train is None:
                return answer(f"Train {train_number} is not in the loaded timetable; no substitute location has been generated.", source="planner")
            parts = (payload.sim_time or "12:00:00").split(":")
            at = int(parts[0]) * 60 + int(parts[1])
            state = next((t for t in compute_live_trains(bundle.network, bundle.timetable, at) if t.train_number == train_number), None)
            if state:
                return answer(f"## {train.number} · {train.name}\nSection **{state.current_section}** at simulation time {payload.sim_time}.\n"
                    f"Estimated speed: **{state.speed_kmph:.1f} km/h**. Timetable interpolation, not live GPS.", "TRAIN_INSPECT", state.model_dump(mode="json"), "planner", target=FlyToTarget(lat=state.lat, lon=state.lon, zoom=9))
            return answer(f"**{train.number} · {train.name}** is in the timetable but has no modelled position at {payload.sim_time}.", source="planner")

        if any(w in q for w in ["saved", "savings", "efficiency", "inventory", "how many", "summary", "defects"]):
            store = getattr(bundle, "operation_store", None)
            operations = store.list() if store else []
            data = {"recorded_blocks": len(operations), "timetable_trains": len(bundle.timetable.trains), "corridors": len(bundle.network.corridors), "ledger_scope": "Persistent SQLite operations ledger"}
            return answer(f"## Loaded network summary\n- **{data['corridors']}** corridors\n- **{data['timetable_trains']}** timetable trains\n- **{data['recorded_blocks']}** blocks in the saved operations ledger\n\nNo defect inventory or counterfactual delay baseline is loaded. I cannot substantiate the source demo's 1,800 defects, 495.5 saved hours or 100% protection figures.", "NETWORK_SUMMARY", data, "planner")

        return answer("## Shadow Block assistant\nI can run your trained defect-risk model, calculate thermal scenarios, prepare worksite checklists, inspect timetable trains, analyze block windows and export monthly reports.\n\nTMS covers track work; SMMS covers signalling; TDMS covers traction. All results are for planning simulation and remain subject to controller review.", followups=EXAMPLES)
    except ValidationError as exc:
        fields = ", ".join(".".join(str(v) for v in error['loc']) for error in exc.errors())
        return answer(f"Please provide valid values for: {fields}. No prediction or block action was performed.")
    except HTTPException as exc:
        return answer(f"Analysis could not be completed: {exc.detail}. No block was saved.")
