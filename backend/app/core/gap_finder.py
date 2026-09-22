"""
Gap finder.

Implements the NORMAL (Routine) criticality logic: scan a requested segment
for headway gaps between consecutive scheduled train movements, and
recommend the block window that (a) satisfies the requested duration,
(b) causes zero passenger delay, preferring gaps closest to the requested
time.

Also exposes a generic `find_gaps_in_range` used by the MAJOR-criticality
optimizer (gq_optimizer.py) to know which trains are even in contention
before it runs the MILP.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.timetable_engine import TimetableEngine, minutes_to_time
from app.models.enums import TrackLine
from app.models.schemas import HeadwayGap


MINUTES_IN_DAY = 24 * 60


@dataclass
class Gap:
    start_min: int
    end_min: int
    preceding_train: str | None
    following_train: str | None

    @property
    def duration_minutes(self) -> int:
        return self.end_min - self.start_min


class GapFinder:
    def __init__(self, timetable: TimetableEngine) -> None:
        self.timetable = timetable

    def all_gaps(
        self,
        leg_id: str,
        track_line: TrackLine,
        from_code: str,
        to_code: str,
        search_start_min: int = 0,
        search_end_min: int = MINUTES_IN_DAY,
    ) -> list[Gap]:
        """
        Every free window on the segment within [search_start, search_end],
        derived from the sorted occupancy list. A "gap" here is the idle
        time between one train clearing the segment and the next entering
        it — this is a simplification of true block-signalling headway
        (which would also add a safety buffer per block section) but is
        the right level of fidelity for slot recommendation; tighten by
        subtracting a MIN_SAFETY_BUFFER_MIN constant if your signalling
        spec requires it.
        """
        occs = sorted(
            self.timetable.occupancy_for_segment(leg_id, track_line, from_code, to_code),
            key=lambda o: o.depart_from_min,
        )
        # Only consider occupancies that could overlap the search window
        occs = [o for o in occs if o.arrive_to_min > search_start_min and o.depart_from_min < search_end_min]

        gaps: list[Gap] = []
        cursor = search_start_min
        prev_train: str | None = None

        for occ in occs:
            if occ.depart_from_min > cursor:
                gaps.append(Gap(cursor, occ.depart_from_min, prev_train, occ.train_number))
            cursor = max(cursor, occ.arrive_to_min)
            prev_train = occ.train_number

        if cursor < search_end_min:
            gaps.append(Gap(cursor, search_end_min, prev_train, None))

        return [g for g in gaps if g.duration_minutes > 0]

    def find_gaps_in_range(
        self,
        leg_id: str,
        track_line: TrackLine,
        from_code: str,
        to_code: str,
        min_duration_minutes: int,
        search_start_min: int = 0,
        search_end_min: int = MINUTES_IN_DAY,
    ) -> list[Gap]:
        gaps = self.all_gaps(leg_id, track_line, from_code, to_code, search_start_min, search_end_min)
        return [g for g in gaps if g.duration_minutes >= min_duration_minutes]

    def best_gap_near(
        self,
        leg_id: str,
        track_line: TrackLine,
        from_code: str,
        to_code: str,
        requested_min: int,
        duration_minutes: int,
        search_radius_min: int = 240,
    ) -> Gap | None:
        """
        NORMAL-criticality recommendation: the qualifying gap (duration >=
        requested block length) whose start time is closest to the
        requested time, searched within +/- search_radius_min of it.
        Falls back to a full-day search if nothing qualifies nearby.
        """
        window_lo = max(0, requested_min - search_radius_min)
        window_hi = min(MINUTES_IN_DAY, requested_min + search_radius_min)

        candidates = self.find_gaps_in_range(
            leg_id, track_line, from_code, to_code, duration_minutes, window_lo, window_hi
        )
        if not candidates:
            candidates = self.find_gaps_in_range(
                leg_id, track_line, from_code, to_code, duration_minutes
            )
        if not candidates:
            return None

        return min(candidates, key=lambda g: abs(g.start_min - requested_min))

    def to_schema(self, gap: Gap, track_line: TrackLine, from_code: str, to_code: str) -> HeadwayGap:
        return HeadwayGap(
            segment_from=from_code,
            segment_to=to_code,
            track_line=track_line,
            start=minutes_to_time(gap.start_min),
            end=minutes_to_time(gap.end_min),
            duration_minutes=gap.duration_minutes,
            preceding_train=gap.preceding_train,
            following_train=gap.following_train,
        )
