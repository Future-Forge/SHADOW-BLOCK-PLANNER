"""Shared, half-open sector occupancy for planning (not signalling authority)."""
from datetime import timedelta
from math import ceil, floor

from app.models.enums import TrackLine
from app.data.gq_corridors import STATION_ALIASES


def sector_conflicts(engine, track_line, from_code, to_code, start, end, km, operation_date=None):
    from app.core.timetable_engine import SectorConflict, minutes_to_time, time_to_minutes_float

    canonical = lambda code: STATION_ALIASES.get(code.upper(), code.upper())
    from_code, to_code = canonical(from_code), canonical(to_code)
    if from_code not in km or to_code not in km or from_code == to_code:
        return []
    low, high = sorted((km[from_code], km[to_code]))
    line = track_line or (TrackLine.UP if km[from_code] < km[to_code] else TrackLine.DOWN)
    results = []
    for train in engine.trains.values():
        # Aggregate adjacent intersecting hops, including dwell inside the sector.
        spans = []
        current = None
        for a, b in zip(train.route, train.route[1:]):
            ka, kb = km.get(canonical(a.station_code)), km.get(canonical(b.station_code))
            t1, t2 = a.departure or a.arrival, b.arrival or b.departure
            valid = ka is not None and kb is not None and ka != kb and t1 and t2
            if valid:
                direction = TrackLine.UP if ka < kb else TrackLine.DOWN
                left, right = max(min(ka, kb), low), min(max(ka, kb), high)
                valid = direction == line and left < right
            if not valid:
                if current:
                    spans.append(current)
                    current = None
                continue
            dep = time_to_minutes_float(t1) + (a.day - 1) * 1440
            arr = time_to_minutes_float(t2) + (b.day - 1) * 1440
            while arr < dep:
                arr += 1440
            fractions = sorted(((left - ka) / (kb - ka), (right - ka) / (kb - ka)))
            entry = floor(dep + fractions[0] * (arr - dep))
            leave = max(entry + 1, ceil(dep + fractions[1] * (arr - dep)))
            if current and entry >= current[0] and low < ka < high:
                current = (current[0], max(current[1], leave), current[2], b.station_code)
            else:
                if current:
                    spans.append(current)
                current = (entry, leave, a.station_code, b.station_code)
        if current:
            spans.append(current)
        for entry, leave, origin, destination in spans:
            # A service can originate on the preceding day; retain absolute times
            # throughout intersection tests instead of modulo-ing each endpoint.
            for shift in range(floor((start - leave) / 1440), ceil((end - entry) / 1440) + 1):
                shifted_entry, shifted_exit = entry + shift * 1440, leave + shift * 1440
                if shifted_entry >= end or shifted_exit <= start:
                    continue
                days = {str(d).strip().lower()[:3] for d in train.running_days}
                recognized = days & {'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'}
                if operation_date and recognized:
                    origin_date = operation_date + timedelta(days=shift)
                    if origin_date.strftime('%a').lower() not in recognized:
                        continue
                results.append(SectorConflict(train.number, train.name, train.category,
                    minutes_to_time(shifted_entry), shifted_entry, shifted_exit, line, (origin, destination)))
    # Hops separated by off-corridor data remain distinct; do not invent coverage.
    return sorted(results, key=lambda c: (c.pass_entry_min, c.train_number))


def coverage_gaps(engine, line, km, low, high):
    """Spatial coverage evidence, not a claim that the timetable is exhaustive."""
    spans = []
    for train in engine.trains.values():
        for a, b in zip(train.route, train.route[1:]):
            ka = km.get(STATION_ALIASES.get(a.station_code, a.station_code))
            kb = km.get(STATION_ALIASES.get(b.station_code, b.station_code))
            if ka is None or kb is None or ka == kb or not (a.departure or a.arrival) or not (b.arrival or b.departure):
                continue
            if (TrackLine.UP if ka < kb else TrackLine.DOWN) != line:
                continue
            left, right = max(min(ka, kb), low), min(max(ka, kb), high)
            if left < right:
                spans.append((left, right))
    cursor, missing = low, []
    for left, right in sorted(spans):
        if left > cursor:
            missing.append([cursor, left])
        cursor = max(cursor, right)
    if cursor < high:
        missing.append([cursor, high])
    return missing
