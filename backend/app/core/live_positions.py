"""
Live train position computation.

Combines TimetableEngine.interpolate_position (which finds *where in the
schedule* a train sits at a given minute, plus the real dep/arr minutes
for that hop) with real station coordinates from GQNetworkGraph (which
turns that into an actual [lat, lon]) to produce the LiveTrainState
objects the /trains/live endpoint returns.
"""
from __future__ import annotations

import math
from app.core.gq_network import GQNetworkGraph, haversine_km
from app.core.timetable_engine import TimetableEngine
from app.data.gq_corridors import resolve_track_line
from app.models.enums import TrainStatus, TrainFilter, TrainCategory, TrackLine
from app.models.schemas import LiveTrainState

try:
    from shapely.geometry import LineString
    _HAS_SHAPELY = True
except ImportError:
    _HAS_SHAPELY = False


def _interpolate_along_polyline(coords: list[list[float]], fraction: float) -> tuple[float, float]:
    """Calculates exact [lon, lat] along an arbitrary GIS polyline by distance ratio."""
    if not coords:
        return 0.0, 0.0
    if len(coords) == 1 or fraction <= 0.0:
        return coords[0][0], coords[0][1]
    if fraction >= 1.0:
        return coords[-1][0], coords[-1][1]

    lengths = []
    total_len = 0.0
    for p1, p2 in zip(coords, coords[1:]):
        seg_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        lengths.append(seg_len)
        total_len += seg_len

    if total_len <= 1e-9:
        return coords[0][0], coords[0][1]

    target_dist = fraction * total_len
    cur_dist = 0.0
    for i, seg_len in enumerate(lengths):
        if cur_dist + seg_len >= target_dist:
            seg_frac = (target_dist - cur_dist) / max(seg_len, 1e-9)
            p1, p2 = coords[i], coords[i + 1]
            lon = p1[0] + (p2[0] - p1[0]) * seg_frac
            lat = p1[1] + (p2[1] - p1[1]) * seg_frac
            return lon, lat
        cur_dist += seg_len

    return coords[-1][0], coords[-1][1]


def compute_live_trains(
    network: GQNetworkGraph,
    timetable: TimetableEngine,
    at_min: float | int,
    train_filter: TrainFilter = TrainFilter.ALL,
) -> list[LiveTrainState]:
    """
    For every loaded train, check whether it's running at `at_min`
    (minutes since midnight, supports fractional minutes for second-level kinematics)
    and interpolate its exact coordinates along the physical railway track segment.
    """
    results: list[LiveTrainState] = []

    for train in timetable.trains.values():
        if train_filter == TrainFilter.PASSENGER and train.category == TrainCategory.FREIGHT:
            continue
        if train_filter == TrainFilter.FREIGHT and train.category != TrainCategory.FREIGHT:
            continue

        pos = timetable.interpolate_position(train.number, at_min)
        if pos is None:
            continue  # not running at this simulated minute

        station_a = network.stations.get(pos.prev_stop.station_code)
        station_b = network.stations.get(pos.next_stop.station_code)
        if not station_a or not station_b:
            continue  # can't place a train whose stations lack coordinates

        # Slice real GIS track geometry between prev_stop and next_stop
        track_coords = network.get_track_segment(pos.prev_stop.station_code, pos.next_stop.station_code)
        if track_coords and len(track_coords) >= 2:
            if _HAS_SHAPELY:
                try:
                    line = LineString(track_coords)
                    if line.length > 0:
                        pt = line.interpolate(pos.fraction, normalized=True)
                        lon, lat = pt.x, pt.y
                    else:
                        lon, lat = track_coords[0][0], track_coords[0][1]
                except Exception:
                    lon, lat = _interpolate_along_polyline(track_coords, pos.fraction)
            else:
                lon, lat = _interpolate_along_polyline(track_coords, pos.fraction)
        else:
            # Fallback direct interpolation between station coordinates
            lat = station_a.lat + (station_b.lat - station_a.lat) * pos.fraction
            lon = station_a.lon + (station_b.lon - station_a.lon) * pos.fraction

        leg_a = network.leg_for_station(pos.prev_stop.station_code)
        leg_b = network.leg_for_station(pos.next_stop.station_code)
        leg_id = leg_a or leg_b
        track_line = (
            resolve_track_line(leg_id, pos.prev_stop.station_code, pos.next_stop.station_code)
            if leg_id else None
        ) or TrackLine.UP  # off-corridor hop (not on a tracked GQ leg): direction is undefined, default UP

        # Real elapsed-time-based speed: haversine distance between the two
        # stops divided by the hop's actual scheduled duration. Falls back
        # to the section's stated distance_km delta if station coordinates
        # somehow coincide (0 distance), to avoid a divide-by-zero speed.
        # NOTE: haversine is straight-line, so hops through hilly/ghat
        # terrain (where track distance >> straight-line distance) will
        # show an artificially low computed speed here -- this mirrors the
        # same straight-line-vs-track-distance gap noted in gq_network.py's
        # corridor chainage, just at per-hop granularity.
        hop_distance_km = haversine_km(station_a.lat, station_a.lon, station_b.lat, station_b.lon)
        if hop_distance_km <= 0:
            hop_distance_km = max(pos.next_stop.distance_km - pos.prev_stop.distance_km, 0.0)
        hop_span_min = max(pos.arr_min - pos.dep_min, 1)
        speed_kmph = (hop_distance_km / hop_span_min) * 60 if hop_distance_km > 0 else 0.0

        results.append(
            LiveTrainState(
                train_number=train.number,
                train_name=train.name,
                category=train.category,
                lat=round(lat, 5),
                lon=round(lon, 5),
                current_section=f"{pos.prev_stop.station_code}-{pos.next_stop.station_code}",
                track_line=track_line,
                speed_kmph=round(speed_kmph, 1),
                status=TrainStatus.RUNNING,
                corridor_leg=leg_id,
                delay_minutes=0.0,
            )
        )

    # Enforce deterministic alphanumeric sort so clients never experience telemetry list shuffling
    results.sort(key=lambda t: t.train_number)
    return results
