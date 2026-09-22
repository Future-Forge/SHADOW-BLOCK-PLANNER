"""
Timetable engine.

Normalizes EXP-TRAINS.json / PASS-TRAINS.json / SF-TRAINS.json (+ freight
generator output) into a single lookup structure indexed by:
  - train_number -> Train (full route)
  - (leg_id, track_line, from_code, to_code) -> sorted list of
    (departure_from_minutes, arrival_to_minutes, train_number)
so the gap finder can binary/linear scan a segment's occupancy without
re-scanning every train's full route on every query.

Times are stored as integer minutes-since-midnight for cheap arithmetic;
Pydantic `time` objects are only used at the API boundary.
"""
from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass
from datetime import time

from app.models.schemas import Train, TrainStop, LiveTrainState
from app.models.enums import TrainCategory, TrackLine, TrainStatus


def time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute + (1 if t.second >= 30 else 0)


def time_to_minutes_float(t: time | str) -> float:
    """High-precision time to minutes with seconds as fractional minutes."""
    if isinstance(t, str):
        parts = t.strip().split(":")
        h = int(parts[0]) if len(parts) > 0 else 0
        m = int(parts[1]) if len(parts) > 1 else 0
        s = float(parts[2]) if len(parts) > 2 else 0.0
        return h * 60.0 + m + (s / 60.0)
    return t.hour * 60.0 + t.minute + (t.second / 60.0) + (t.microsecond / 60000000.0)


def minutes_to_time(m: int) -> time:
    m = int(m) % (24 * 60)
    return time(hour=m // 60, minute=m % 60)


@dataclass
class SegmentOccupancy:
    """One train's occupancy of a single from->to hop, in minutes-since-midnight."""
    train_number: str
    depart_from_min: int
    arrive_to_min: int


@dataclass
class InterpolatedPosition:
    prev_stop: TrainStop
    next_stop: TrainStop
    fraction: float          # 0.0 at prev_stop, 1.0 at next_stop
    dep_min: int              # actual departure minute from prev_stop (may exceed 1440 for multi-day)
    arr_min: int              # actual arrival minute at next_stop (may exceed 1440 for multi-day)


@dataclass
class SectorConflict:
    train_number: str
    train_name: str
    category: TrainCategory
    scheduled_pass_time: time
    pass_entry_min: int
    pass_exit_min: int
    direction: TrackLine
    bounding_stops: tuple[str, str]


class TimetableEngine:
    def __init__(self) -> None:
        self.trains: dict[str, Train] = {}
        # (leg_id, track_line, from_code, to_code) -> sorted occupancy list
        self._segment_index: dict[tuple[str, TrackLine, str, str], list[SegmentOccupancy]] = {}

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def load_trains(self, trains: list[Train]) -> None:
        for t in trains:
            self.trains[t.number] = t

    def build_segment_index(self, leg_of_station: dict[str, str], track_line_resolver=None) -> None:
        """
        Build the segment occupancy index from loaded trains' routes.

        `leg_of_station`: code -> leg_id (from GQNetworkGraph.leg_for_station),
        used to scope each hop to the correct GQ leg.
        `track_line_resolver(train, stop_a, stop_b) -> TrackLine | None`:
        resolves which physical line (UP/DOWN) a hop runs on. If omitted,
        every hop is skipped rather than defaulted to UP -- silently
        mislabeling a DOWN-direction train as UP would corrupt every
        gap-finder and emergency-dispatch query against that segment.
        Pass `app.data.gq_corridors.resolve_track_line` (bound per-leg) for
        the standard GQ-corridor resolution, which infers direction from
        the two stations' relative position in the leg's canonical order.
        """
        index: dict[tuple[str, TrackLine, str, str], list[SegmentOccupancy]] = {}

        for train in self.trains.values():
            route = train.route
            for a, b in zip(route, route[1:]):
                if a.departure is None or b.arrival is None:
                    continue  # incomplete timing data for this hop, skip
                leg_id = leg_of_station.get(a.station_code) or leg_of_station.get(b.station_code)
                if leg_id is None:
                    continue  # stations not on a tracked GQ leg

                line = track_line_resolver(train, a, b) if track_line_resolver else None
                if line is None:
                    continue  # can't determine direction on this leg -- skip rather than mislabel

                dep_min = time_to_minutes(a.departure) + (a.day - 1) * 1440
                arr_min = time_to_minutes(b.arrival) + (b.day - 1) * 1440
                if arr_min < dep_min:
                    arr_min += 1440  # overnight hop

                key = (leg_id, line, a.station_code, b.station_code)
                index.setdefault(key, []).append(
                    SegmentOccupancy(train.number, dep_min, arr_min)
                )

        for occ_list in index.values():
            occ_list.sort(key=lambda o: o.depart_from_min)

        self._segment_index = index

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def occupancy_for_segment(
        self, leg_id: str, track_line: TrackLine, from_code: str, to_code: str
    ) -> list[SegmentOccupancy]:
        return self._segment_index.get((leg_id, track_line, from_code, to_code), [])

    def occupancy_in_window(
        self,
        leg_id: str,
        track_line: TrackLine,
        from_code: str,
        to_code: str,
        window_start_min: int,
        window_end_min: int,
    ) -> list[SegmentOccupancy]:
        """Trains occupying the segment with any overlap in [window_start, window_end]."""
        occs = self.occupancy_for_segment(leg_id, track_line, from_code, to_code)
        return [
            o for o in occs
            if o.depart_from_min < window_end_min and o.arrive_to_min > window_start_min
        ]

    def interpolate_position(
        self, train_number: str, at_min: float | int
    ) -> InterpolatedPosition | None:
        """
        Find the (prev_stop, next_stop, fraction) a train sits between at a
        given minute-of-day (supports fractional minutes for exact sub-second /
        second-level kinematics), plus actual dep/arr minutes.
        """
        train = self.trains.get(train_number)
        if not train:
            return None
        route = train.route
        at_min_flt = float(at_min)
        for a, b in zip(route, route[1:]):
            if a.departure is None or b.arrival is None:
                continue
            dep = time_to_minutes(a.departure) + (a.day - 1) * 1440
            arr = time_to_minutes(b.arrival) + (b.day - 1) * 1440
            if arr < dep:
                arr += 1440
            if dep <= at_min_flt <= arr:
                span = max(float(arr - dep), 1.0)
                fraction = max(0.0, min(1.0, (at_min_flt - dep) / span))
                return InterpolatedPosition(a, b, fraction, dep, arr)
        return None

    def find_sector_trains_in_window(
        self,
        leg_id: str,
        track_line: TrackLine | None,
        from_code: str,
        to_code: str,
        window_start_min: int,
        window_end_min: int,
        corridor_km_map: dict[str, float],
    ) -> list[SectorConflict]:
        """
        Finds all trains scheduled to traverse the micro-segment or span [from_code, to_code]
        during [window_start_min, window_end_min].

        Accurately calculates passage window and scheduled passing time using
        either exact scheduled stops or along-corridor spatio-temporal interpolation.
        """
        km_from = corridor_km_map.get(from_code)
        km_to = corridor_km_map.get(to_code)
        if km_from is None or km_to is None:
            return []

        s_min = min(km_from, km_to)
        s_max = max(km_from, km_to)
        req_line = TrackLine.UP if km_from < km_to else TrackLine.DOWN
        target_line = track_line or req_line

        conflicts: list[SectorConflict] = []
        seen_trains: set[str] = set()

        for train in self.trains.values():
            if train.number in seen_trains:
                continue

            route = train.route
            for a, b in zip(route, route[1:]):
                if a.station_code in corridor_km_map and b.station_code in corridor_km_map:
                    k_a = corridor_km_map[a.station_code]
                    k_b = corridor_km_map[b.station_code]
                    if k_a == k_b:
                        continue

                    hop_line = TrackLine.UP if k_a < k_b else TrackLine.DOWN
                    if target_line and hop_line != target_line:
                        continue

                    h_min = min(k_a, k_b)
                    h_max = max(k_a, k_b)

                    # Check if train hop overlaps the blocked sector on corridor chainage
                    if max(h_min, s_min) < min(h_max, s_max):
                        t1 = a.departure or a.arrival
                        t2 = b.arrival or b.departure
                        if not t1 or not t2:
                            continue

                        m1 = time_to_minutes(t1) + (a.day - 1) * 1440
                        m2 = time_to_minutes(t2) + (b.day - 1) * 1440
                        if m2 < m1:
                            m2 += 1440

                        # Calculate passage time across the sector
                        f_entry = (km_from - k_a) / (k_b - k_a)
                        f_exit = (km_to - k_a) / (k_b - k_a)
                        t_entry = m1 + f_entry * (m2 - m1)
                        t_exit = m1 + f_exit * (m2 - m1)

                        pass_start = min(t_entry, t_exit) % 1440
                        pass_end = max(t_entry, t_exit) % 1440

                        # Check if passage window intersects requested window
                        if pass_start <= window_end_min and pass_end >= window_start_min:
                            seen_trains.add(train.number)
                            conflicts.append(
                                SectorConflict(
                                    train_number=train.number,
                                    train_name=train.name,
                                    category=train.category,
                                    scheduled_pass_time=minutes_to_time(int(t_entry) % 1440),
                                    pass_entry_min=int(t_entry),
                                    pass_exit_min=int(t_exit),
                                    direction=hop_line,
                                    bounding_stops=(a.station_code, b.station_code),
                                )
                            )
                            break

        conflicts.sort(key=lambda c: c.pass_entry_min)
        return conflicts
