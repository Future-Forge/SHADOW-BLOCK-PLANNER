"""Auditable planning simulation shared by manual and dispatcher commits."""
from datetime import datetime, timedelta
from math import ceil

from fastapi import HTTPException

from app.data.gq_corridors import STATION_ALIASES, same_leg
from app.core.timetable_engine import time_to_minutes, minutes_to_time
from app.core.weather_constraints import assess_weather
from app.models.schemas import BlockDecision, AffectedTrain

BUFFER = 5  # Illustrative planning headway, not an approved signalling rule.
WEIGHTS = {'PREMIUM': 10, 'SUPERFAST': 5, 'EXPRESS': 5, 'PASSENGER': 3, 'FREIGHT': 1}


def canonical(code):
    return STATION_ALIASES.get(code.strip().upper(), code.strip().upper())


def analyze(req, bundle, store, *, ignore_id=None):
    a, b = canonical(req.from_station), canonical(req.to_station)
    leg = same_leg(a, b, bundle.network.station_leg_index)
    if a == b or not leg:
        raise HTTPException(400, 'Choose two different stations on the same tracked corridor.')
    corridor = bundle.network.corridors[leg]
    km = {s.code: s.cumulative_km for s in corridor.stations}
    low, high = sorted((km[a], km[b]))
    stations = [s for s in corridor.stations if low <= s.cumulative_km <= high]
    tasks = [{'department': req.department.value, 'duration_minutes': req.duration_minutes}]
    tasks += [t.model_dump(mode='json') for t in req.shared_tasks]
    departments = [t['department'] for t in tasks]
    if len(set(departments)) != len(departments):
        raise HTTPException(400, 'Each shared department must be listed once.')
    separate_duration = sum(t['duration_minutes'] for t in tasks)
    base_duration = max(t['duration_minutes'] for t in tasks) if req.parallel_work_confirmed else separate_duration
    weather = assess_weather(req, stations, base_duration, departments)
    duration = weather['adjusted_duration_minutes']
    requested = time_to_minutes(req.requested_time)
    midnight = datetime.combine(req.operation_date, datetime.min.time())
    required = {f'{d}_crew': 1 for d in departments}
    required.update(equipment_sets=len(tasks), vehicles=1)
    records = store.list() if store else []

    def resources_at(start):
        begin, finish = midnight + timedelta(minutes=start), midnight + timedelta(minutes=start + duration)
        reserved = {key: 0 for key in req.resource_capacity}
        overlaps = []
        for op in records:
            if op['status'] != 'ACTIVE' or op['block_id'] == ignore_id:
                continue
            other_start = datetime.fromisoformat(f"{op['operation_date']}T{op['start_time']}")
            other_end = other_start + timedelta(minutes=op['duration_minutes'])
            if begin >= other_end or finish <= other_start:
                continue
            snap = op.get('snapshot') or {}
            other_plan = (snap.get('decision') or {}).get('planning') or {}
            other_required = other_plan.get('resource_requirements') or {
                f"{op['department']}_crew": 1, 'equipment_sets': 1, 'vehicles': 1}
            for key, value in other_required.items():
                if key in reserved:
                    reserved[key] += value
            other_line = (snap.get('request') or {}).get('track_line')
            oa, ob = canonical(op['from_station']), canonical(op['to_station'])
            if op['corridor'] == leg and other_line in (None, req.track_line.value) and oa in km and ob in km:
                olow, ohigh = sorted((km[oa], km[ob]))
                if max(low, olow) < min(high, ohigh):
                    overlaps.append(op['block_id'])
        checks = [{'resource': key, 'required': required.get(key, 0), 'reserved': reserved[key],
                   'capacity': capacity, 'available': max(0, capacity - reserved[key]),
                   'sufficient': reserved[key] + required.get(key, 0) <= capacity}
                  for key, capacity in req.resource_capacity.items()]
        return checks, overlaps

    # Same absolute-time query powers gap selection, regulation and comparisons.
    # Extra horizon captures queued trains following reopening.
    raw = bundle.timetable.find_sector_trains_in_window(leg, req.track_line, a, b,
        -1440, max(4320, requested + duration + 1440), km, req.operation_date)
    weather_delay = weather['train_delay_minutes']
    occupancies = [(c, c.pass_entry_min + weather_delay, c.pass_exit_min + weather_delay) for c in raw]

    def conflicts_at(start):
        return [(c, entry, leave) for c, entry, leave in occupancies
                if entry < start + duration + BUFFER and leave + BUFFER > start]

    selected = requested
    explanations = [f'{len(tasks)} department(s): ' + ('parallel work explicitly confirmed' if req.parallel_work_confirmed else 'sequential work; no compatibility assumed'),
                    f'{base_duration} work minutes × {weather["duration_multiplier"]} weather factor = {duration} reserved minutes.',
                    'Occupancy uses clipped corridor hops, interior dwell, service weekdays and cross-midnight intervals.',
                    f'{BUFFER}-minute illustrative clearance/re-entry buffer; not a signalling clearance.']
    if req.criticality.value == 'NORMAL' and not weather['restricted']:
        # Nearest feasible zero-conflict start; endpoints of occupied spans are
        # candidates in addition to five-minute sampling for resource release.
        candidates = {requested, *range(max(0, requested - 240), min(1439, requested + 240) + 1, 5)}
        candidates.update(ceil(leave + BUFFER) for _, _, leave in occupancies)
        candidates.update(int(entry - BUFFER - duration) for _, entry, _ in occupancies)
        for candidate in sorted((t for t in candidates if 0 <= t < 1440 and abs(t - requested) <= 240), key=lambda t: (abs(t - requested), t)):
            checks, overlaps = resources_at(candidate)
            if not conflicts_at(candidate) and not overlaps and all(c['sufficient'] for c in checks):
                selected = candidate
                break
    checks, overlaps = resources_at(selected)
    conflicts = conflicts_at(selected)
    inside = [c.train_number for c, entry, leave in conflicts if entry < selected and leave + BUFFER > selected]
    reasons = []
    if weather['restricted']:
        reasons.append(weather['reason'])
    if overlaps:
        reasons.append('Overlapping committed blocks: ' + ', '.join(overlaps))
    if any(not c['sufficient'] for c in checks):
        reasons.append('Insufficient crews, equipment or vehicles for this time window.')
    if req.criticality.value == 'NORMAL' and conflicts:
        reasons.append('No resource-feasible zero-conflict slot found within ±240 minutes on the operation date.')
    if req.criticality.value != 'NORMAL' and inside:
        reasons.append('Trains already occupy the section or clearance buffer: ' + ', '.join(inside) + '. Choose a later start; they cannot be held retroactively.')

    def comparison(start):
        rows = []
        release = None
        # Only propagate the queue caused by the block, not unrelated baseline
        # timetable headway violations. Single-section FIFO, no overtaking.
        for c, entry, leave in occupancies:
            if leave < start - 60 or entry > start + duration + 1440:
                continue
            changed = entry
            if entry >= start and entry < start + duration + BUFFER:
                changed = start + duration + BUFFER
            if release is not None:
                changed = max(changed, release)
            block_delay = max(0, changed - entry)
            release = changed + BUFFER if block_delay else None
            if entry < start - 60 or (entry > start + duration + 120 and not block_delay):
                continue
            rows.append({'train_number': c.train_number, 'train_name': c.train_name,
                'category': c.category.value, 'scheduled_entry_min': c.pass_entry_min,
                'without_block_entry_min': entry, 'with_block_entry_min': changed,
                'weather_delay_minutes': weather_delay, 'block_delay_minutes': block_delay,
                'total_delay_minutes': weather_delay + block_delay,
                'hold_station': c.bounding_stops[0]})
        return rows

    rows = comparison(selected)
    baseline = comparison(requested)
    baseline_feasible = not any(entry < requested and leave + BUFFER > requested for _, entry, leave in conflicts_at(requested))
    total = lambda data: sum(r['block_delay_minutes'] for r in data)
    cost = lambda data: sum(r['block_delay_minutes'] * WEIGHTS[r['category']] for r in data)
    status = 'PENDING_REVIEW' if reasons else ('APPROVED_WITH_REGULATION' if total(rows) else 'APPROVED')
    affected = [AffectedTrain(train_number=r['train_number'], train_name=r['train_name'], category=r['category'],
        action='HOLD' if r['block_delay_minutes'] else 'CAUTION', hold_station=r['hold_station'] if r['block_delay_minutes'] else None,
        delay_minutes=r['total_delay_minutes'], scheduled_pass_time=minutes_to_time(r['scheduled_entry_min']))
        for r in rows if r['total_delay_minutes'] > 0]
    explanations.append(f'Selected start moved {selected - requested:+d} minutes from request; {len(conflicts)} occupancy conflicts at selected start.')
    explanations.extend(reasons or ['Resource and overlap checks passed against the current simulation ledger.'])
    planning = {
        'version': 1, 'operation_date': str(req.operation_date), 'corridor': leg,
        'start_iso': (midnight + timedelta(minutes=selected)).isoformat(),
        'end_iso': (midnight + timedelta(minutes=selected + duration)).isoformat(),
        'effective_duration_minutes': duration, 'tasks': tasks,
        'shared_minutes_saved': separate_duration - base_duration,
        'weather': weather, 'resource_requirements': required, 'resources': checks,
        'resource_basis': 'Operator-supplied scenario capacity; crew units are teams, equipment units are department kits. Not live inventory.',
        'explanations': explanations, 'blocking_reasons': reasons, 'comparison': rows,
        'evaluation': {'baseline': 'Requested-time FIFO regulation with the same weather and duration',
            'baseline_delay_minutes': total(baseline), 'planned_delay_minutes': total(rows),
            'delay_minutes_saved': total(baseline) - total(rows) if baseline_feasible and not reasons else None,
            'baseline_feasible': baseline_feasible,
            'baseline_weighted_cost': cost(baseline), 'planned_weighted_cost': cost(rows),
            'feasible': not reasons, 'historical_outcome': False},
        'limitations': ['Planning simulation only; no live train commands or timetable deletion.',
            'Missing/unrecognized running-day metadata is treated as daily; uncovered route hops are not inferred.',
            'Linear interpolation and single-section FIFO exclude network-wide cascades and signalling interlocks.',
            'Historical replay uses the current loaded timetable, not observed historical delay outcomes.'],
    }
    return BlockDecision(status=status, block_window={'start': minutes_to_time(selected), 'end': minutes_to_time(selected + duration)},
        affected_trains=affected, asset_availability_index=max(0, 100 - max((r['total_delay_minutes'] for r in rows), default=0)),
        total_weighted_delay_cost=cost(rows), notes=' '.join(reasons) if reasons else 'Simulation plan ready for explicit commit. ' + explanations[-1],
        block_geometry=bundle.network.get_track_segment(a, b), planning=planning)


def commit(req, bundle, store):
    with store.transaction():
        decision = analyze(req, bundle, store)
        if decision.status.value not in ('APPROVED', 'APPROVED_WITH_REGULATION'):
            raise HTTPException(409, decision.notes)
        if req.expected_start_iso and req.expected_start_iso != decision.planning['start_iso']:
            raise HTTPException(409, 'Availability changed since analysis. Analyze again to review the new window.')
        operation = store.record(
            department='+'.join(t['department'] for t in decision.planning['tasks']),
            corridor=decision.planning['corridor'], from_station=canonical(req.from_station), to_station=canonical(req.to_station),
            start_time=decision.block_window['start'].strftime('%H:%M:%S'),
            duration_minutes=decision.planning['effective_duration_minutes'], operation_date=req.operation_date,
            impacted_trains=(train.train_number for train in decision.affected_trains),
            snapshot={'request': req.model_dump(mode='json'), 'decision': decision.model_dump(mode='json')})
    return {'committed': True, 'block_id': operation.block_id, 'decision': decision}
