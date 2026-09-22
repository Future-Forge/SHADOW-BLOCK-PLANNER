"""
Ingestion loader for the real Indian Railways datasets (Sanjay Bhangar /
Sajjad Anwar's open dataset, CC0) supplied for this project.

Verified shapes as actually shipped in these files (not just the README):

  stations.json
    GeoJSON FeatureCollection. ~8990 features, ~293 of them are junk
    placeholder codes (e.g. "XX-BECE") with `geometry: null` -- these are
    filtered out. Real stations have `properties.code/name/zone/state` and
    `geometry.coordinates: [lon, lat]`.

  EXP-TRAINS.json / PASS-TRAINS.json / SF-TRAINS.json
    Flat JSON arrays (not GeoJSON). Each record:
      trainNumber, trainName, route (display string), runningDays (dict of
      7 bool flags), trainRoute: list of stops with:
        sno (STRING digit), stationName ("NAME - CODE" combined),
        arrives / departs ("Source" | "Destination" | "HH:MM", no seconds),
        distance ("N kms" string), day (STRING digit, 1-4 seen).
    These three files are the primary route/timetable source for this
    project -- they cover ~8490 trains total vs. ~2810 in the supplementary
    ISL-wise CSV, and they're the ones the mission spec names directly, so
    the CSV is not merged in here to avoid two conflicting route
    representations for the same train number.

  trains.json
    GeoJSON FeatureCollection with only origin/destination + a raw
    LineString of intermediate lat/lon points -- no station-level stops.
    Useful for a rough polyline overlay on the live map, not for
    stop-by-stop timetable logic, so it's not loaded here.

  schedules.json
    Large flat array of single (train, station) stop records. Overlaps
    with the *-TRAINS.json stop data but is keyed differently and doesn't
    carry the EXP/PASS/SF category. Not needed once *-TRAINS.json is
    loaded; kept out of the critical path to avoid a slow, redundant
    second parse of an 80MB file.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from app.models.schemas import Station, Train, TrainStop
from app.models.enums import TrainCategory


_STATION_NAME_CODE_RE = re.compile(r"^(.*?)\s*-\s*([A-Za-z0-9]+)\s*$")


def load_stations_json(path: str | Path) -> list[Station]:
    """
    Parse stations.json, silently dropping junk placeholder codes
    (null geometry, e.g. "XX-BECE") that pollute the raw dataset.
    """
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)

    stations: list[Station] = []
    for feat in raw.get("features", []):
        geom = feat.get("geometry")
        props = feat.get("properties", {})
        code = props.get("code")
        if geom is None or not code:
            continue
        lon, lat = geom["coordinates"][:2]
        stations.append(
            Station(
                code=code,
                name=props.get("name") or code,
                lat=lat,
                lon=lon,
                zone=props.get("zone"),
            )
        )
    return stations


def _parse_station_name_code(station_name: str) -> tuple[str, str]:
    """
    "SURAT - ST" -> ("SURAT", "ST"). Falls back to using the whole string
    as both name and code if the " - CODE" suffix is ever absent (not seen
    in a full-file scan, but the ingestion shouldn't hard-crash on one bad
    record from a much larger production pull).
    """
    m = _STATION_NAME_CODE_RE.match(station_name)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return station_name.strip(), station_name.strip()


def _parse_distance_km(distance_str: str) -> float:
    """"25 kms" -> 25.0; "0 kms" -> 0.0."""
    try:
        return float(distance_str.replace("kms", "").strip())
    except (ValueError, AttributeError):
        return 0.0


def _parse_hhmm(value: str) -> str | None:
    """
    "Source" / "Destination" -> None (no arrival/departure to record at
    the route's endpoints in that direction). "HH:MM" -> "HH:MM:00" so it
    matches Pydantic's `time` parsing (which expects seconds or a full
    ISO time string).
    """
    if value in ("Source", "Destination"):
        return None
    if re.match(r"^\d{1,2}:\d{2}$", value):
        return f"{value}:00"
    return None  # unrecognized value: treat as missing rather than crash ingestion


def load_category_trains_json(path: str | Path, category: TrainCategory) -> list[Train]:
    """
    Load one of EXP-TRAINS.json / PASS-TRAINS.json / SF-TRAINS.json and
    normalize into the project's Train/TrainStop schema.

    Stops with unparseable times become TrainStop entries with
    arrival/departure left None (the timetable engine already skips hops
    with missing timing rather than fabricating a value) -- this keeps a
    single malformed stop from silently corrupting an entire train's
    schedule via a bad guess.
    """
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)

    trains: list[Train] = []
    for rec in raw:
        stops: list[TrainStop] = []
        for stop in rec.get("trainRoute", []):
            name, code = _parse_station_name_code(stop["stationName"])
            stops.append(
                TrainStop(
                    sno=int(stop["sno"]),
                    station_code=code,
                    station_name=name,
                    arrival=_parse_hhmm(stop["arrives"]),
                    departure=_parse_hhmm(stop["departs"]),
                    distance_km=_parse_distance_km(stop["distance"]),
                    day=int(stop.get("day", 1)),
                )
            )

        if not stops:
            continue  # skip trains with no parseable route at all

        running_days = [day for day, active in rec.get("runningDays", {}).items() if active]

        trains.append(
            Train(
                number=rec["trainNumber"],
                name=rec.get("trainName", rec["trainNumber"]),
                category=category,
                from_station_code=stops[0].station_code,
                to_station_code=stops[-1].station_code,
                running_days=running_days,
                route=stops,
            )
        )
    return trains


def load_all_category_trains(
    exp_path: str | Path, pass_path: str | Path, sf_path: str | Path
) -> list[Train]:
    """Convenience loader combining all three category files into one list."""
    return (
        load_category_trains_json(exp_path, TrainCategory.EXPRESS)
        + load_category_trains_json(pass_path, TrainCategory.PASSENGER)
        + load_category_trains_json(sf_path, TrainCategory.SUPERFAST)
    )
