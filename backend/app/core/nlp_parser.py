"""
Regex-based NLP intent parser for /api/v1/chat/query.

This is a heuristic entity extractor, not a full LLM-backed parser --
good enough to turn structured-ish natural language ("Need an emergency
TMS track renewal between Surat and Vadodara around 14:00 for 45
minutes") into a BlockRequest, while degrading gracefully (asking for
clarification) when it can't confidently extract a required field.

Station name -> code resolution uses the loaded GQNetworkGraph's station
list (real names from stations.json), not a hardcoded lookup table, so it
stays in sync with whatever data is actually loaded.
"""
from __future__ import annotations

import re
from datetime import time as time_type

from app.core.gq_network import GQNetworkGraph
from app.models.enums import Department, Criticality
from app.models.schemas import ChatEntities


_DEPARTMENT_KEYWORDS = {
    Department.TMS: ["tms", "track renewal", "track work", "tamping", "rail fracture", "track maintenance"],
    Department.SMMS: ["smms", "signal", "red light", "signalling", "signal failure"],
    Department.TDMS: ["tdms", "ohe", "traction", "wire check", "overhead"],
}

_CRITICALITY_KEYWORDS = {
    Criticality.EMERGENCY: ["emergency", "urgent", "immediate", "fracture", "snag", "red light", "failure"],
    Criticality.MAJOR: ["major", "planned", "tamping", "1-3 hour", "hours"],
    Criticality.NORMAL: ["normal", "routine", "minor"],
}

_TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\b")
_DURATION_RE = re.compile(r"(\d+)\s*(hour|hr|minute|min)s?", re.IGNORECASE)
_BETWEEN_RE = re.compile(
    r"between\s+([A-Za-z\s]+?)\s+and\s+([A-Za-z\s]+?)(?=\s+(?:around|at|for|on|,|\.|$))",
    re.IGNORECASE,
)
_NEAR_RE = re.compile(r"near\s+([A-Za-z\s]+?)(?=\s+(?:around|at|for|on|,|\.|$))", re.IGNORECASE)


def _find_department(text: str) -> Department | None:
    lower = text.lower()
    for dept, keywords in _DEPARTMENT_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return dept
    return None


def _find_criticality(text: str) -> Criticality | None:
    lower = text.lower()
    # Check EMERGENCY first since its keywords are more specific/urgent
    for crit in (Criticality.EMERGENCY, Criticality.MAJOR, Criticality.NORMAL):
        if any(kw in lower for kw in _CRITICALITY_KEYWORDS[crit]):
            return crit
    return None


def _find_duration_minutes(text: str) -> int | None:
    total = 0
    found = False
    for match in _DURATION_RE.finditer(text):
        value = int(match.group(1))
        unit = match.group(2).lower()
        found = True
        if unit.startswith("hour") or unit == "hr":
            total += value * 60
        else:
            total += value
    return total if found else None


def _find_time(text: str) -> time_type | None:
    """
    Scan all HH[:MM][AM/PM]-shaped matches and prefer the most
    "time-like" one -- i.e. one with an explicit AM/PM marker or a
    minutes component -- over a bare 1-2 digit number, since bare
    numbers are ambiguous with duration phrases like "2 hour" that the
    time regex also matches incidentally.
    """
    candidates: list[tuple[int, int, str | None]] = []
    for match in _TIME_RE.finditer(text):
        hour_str, minute_str, meridiem = match.groups()
        hour = int(hour_str)
        if not (0 <= hour <= 23):
            continue
        minute = int(minute_str) if minute_str else 0
        if not (0 <= minute <= 59):
            continue
        candidates.append((hour, minute, meridiem))

    if not candidates:
        return None

    # Prefer a candidate with a meridiem marker, then one with an
    # explicit minutes component, then just take the first found.
    best = (
        next((c for c in candidates if c[2]), None)
        or next((c for c in candidates if c[1] != 0), None)
        or candidates[0]
    )
    hour, minute, meridiem = best
    if meridiem:
        meridiem = meridiem.upper()
        if meridiem == "PM" and hour != 12:
            hour += 12
        elif meridiem == "AM" and hour == 12:
            hour = 0
    return time_type(hour=hour, minute=minute)


def _resolve_station_name_to_code(name: str, network: GQNetworkGraph) -> str | None:
    """
    Match a free-text station name fragment (e.g. "Surat", "Vadodara")
    against the loaded station list's real names. Exact-ish match first
    (case-insensitive substring), falling back to None so the caller can
    ask for clarification rather than guess wrong.
    """
    name_clean = name.strip().lower()
    if not name_clean:
        return None

    # Direct code match (user typed the code itself, e.g. "ST")
    upper = name.strip().upper()
    if upper in network.stations:
        return upper

    best_code, best_len = None, None
    for code, station in network.stations.items():
        station_name_lower = station.name.lower()
        if name_clean == station_name_lower or name_clean in station_name_lower:
            # Prefer the shortest matching station name to avoid e.g.
            # "Surat" matching a long unrelated station that merely
            # contains the substring somewhere.
            if best_len is None or len(station_name_lower) < best_len:
                best_code, best_len = code, len(station_name_lower)
    return best_code


def extract_entities(text: str, network: GQNetworkGraph) -> ChatEntities:
    origin_code, dest_code = None, None

    between_match = _BETWEEN_RE.search(text)
    if between_match:
        origin_code = _resolve_station_name_to_code(between_match.group(1), network)
        dest_code = _resolve_station_name_to_code(between_match.group(2), network)

    if origin_code is None and dest_code is None:
        near_match = _NEAR_RE.search(text)
        if near_match:
            # "near Kota" -> use the same station as a proxy for both ends;
            # caller/endpoint should treat a single-station query as
            # needing clarification on which adjacent segment is meant.
            origin_code = _resolve_station_name_to_code(near_match.group(1), network)

    department = _find_department(text)
    criticality = _find_criticality(text)
    duration = _find_duration_minutes(text)
    time_of_day = _find_time(text)

    fields_found = sum(x is not None for x in [origin_code, dest_code, department, criticality, duration, time_of_day])
    confidence = fields_found / 6.0

    return ChatEntities(
        origin=origin_code,
        destination=dest_code,
        department=department,
        time_of_day=time_of_day,
        duration_minutes=duration,
        criticality=criticality,
        confidence=round(confidence, 2),
    )
