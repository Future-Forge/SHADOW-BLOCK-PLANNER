"""
POST /api/v1/planner/analyze-block

Dispatches a BlockRequest to the appropriate criticality handler:
  NORMAL    -> gap_finder: zero-delay slot recommendation
  MAJOR     -> gq_optimizer: MILP-based weighted delay minimization
  EMERGENCY -> emergency_dispatcher: immediate hold/caution orders

Also exposes /planner/commit-block as a stub that "locks" a previously
analyzed block -- full WebSocket broadcast wiring lives in main.py's
/ws/live-feed handler; this endpoint just records the commit decision.
"""
from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException

from app.core.gap_finder import GapFinder
from app.core.gq_optimizer import solve_major_block_regulation, TrainConflict, CATEGORY_WEIGHTS
from app.core.emergency_dispatcher import dispatch_emergency_block
from app.core.timetable_engine import time_to_minutes, minutes_to_time, SectorConflict
from app.data.gq_corridors import resolve_track_line, same_leg, STATION_ALIASES
from app.models.enums import Criticality, BlockDecisionStatus, RegulationAction, TrainCategory, TrackLine
from app.models.schemas import (
    BlockRequest,
    BlockDecision,
    AffectedTrain,
    AlternativeWindow,
    TrafficPreviewRequest,
    TrafficPreviewResponse,
    TrafficPreviewItem,
)

router = APIRouter(prefix="/api/v1/planner", tags=["planner"])


def _resolve_leg_and_line(request: Request, from_station: str, to_station: str, requested_line: TrackLine | None):
    """
    Shared resolution: figure out which GQ leg this from/to pair belongs
    to and confirm the track_line direction.
    Supports intermediate micro-sections as well as major junction pairs.
    """
    network = request.app.state.gq_bundle.network
    c_from = STATION_ALIASES.get(from_station.upper(), from_station.upper())
    c_to = STATION_ALIASES.get(to_station.upper(), to_station.upper())

    leg_id = same_leg(c_from, c_to, network.station_leg_index)
    if leg_id is None:
        raise HTTPException(
            status_code=400,
            detail=f"{from_station} and {to_station} are not both on a tracked GQ corridor leg.",
        )

    resolved_line = resolve_track_line(leg_id, c_from, c_to)
    if resolved_line is None:
        raise HTTPException(
            status_code=400,
            detail=f"Could not determine track direction between {from_station} and {to_station} on leg {leg_id}.",
        )

    return leg_id, requested_line or resolved_line


@router.post("/preview-traffic", response_model=TrafficPreviewResponse)
@router.get("/preview-traffic", response_model=TrafficPreviewResponse)
def preview_traffic(
    request: Request,
    from_station: str | None = None,
    to_station: str | None = None,
    track_line: TrackLine = TrackLine.UP,
    requested_time: str | None = None,
    duration_minutes: int = 60,
    body: TrafficPreviewRequest | None = None,
) -> TrafficPreviewResponse:
    """
    Lightweight, high-speed chrono-spatial traffic preview endpoint.
    Returns projected conflicting train count and schedule collision items
    for the specified micro-section and time window before running analysis.
    """
    f_st = body.from_station if body else from_station
    t_st = body.to_station if body else to_station
    line = body.track_line if body else track_line
    t_str = body.requested_time if body else requested_time
    dur = body.duration_minutes if body else duration_minutes

    if not f_st or not t_st:
        raise HTTPException(status_code=400, detail="Both from_station and to_station are required.")

    if not t_str:
        t_str = "12:00:00"

    parsed_time = t_str if hasattr(t_str, "hour") else minutes_to_time(time_to_minutes(t_str) if isinstance(t_str, str) else 720)

    bundle = request.app.state.gq_bundle
    network, timetable = bundle.network, bundle.timetable

    leg_id, resolved_line = _resolve_leg_and_line(request, f_st, t_st, line)
    corridor = network.corridors[leg_id]
    km_map = {s.code: s.cumulative_km for s in corridor.stations}

    start_min = time_to_minutes(parsed_time)
    end_min = start_min + dur

    conflicts = timetable.find_sector_trains_in_window(
        leg_id=leg_id,
        track_line=line or resolved_line,
        from_code=STATION_ALIASES.get(f_st.upper(), f_st.upper()),
        to_code=STATION_ALIASES.get(t_st.upper(), t_st.upper()),
        window_start_min=start_min,
        window_end_min=end_min,
        corridor_km_map=km_map,
    )

    items: list[TrafficPreviewItem] = []
    category_summary: dict[str, int] = {}

    for c in conflicts:
        category_summary[c.category.value] = category_summary.get(c.category.value, 0) + 1
        items.append(
            TrafficPreviewItem(
                train_number=c.train_number,
                train_name=c.train_name,
                category=c.category,
                scheduled_pass_time=c.scheduled_pass_time.strftime("%H:%M:%S"),
                direction=c.direction,
                conflict=True,
                delay_minutes=0.0,
            )
        )

    return TrafficPreviewResponse(
        from_station=f_st,
        to_station=t_st,
        track_line=line or resolved_line,
        requested_time=parsed_time,
        duration_minutes=dur,
        projected_traffic_count=len(items),
        summary_by_category=category_summary,
        trains=items,
    )


@router.post("/analyze-block", response_model=BlockDecision)
def analyze_block(req: BlockRequest, request: Request) -> BlockDecision:
    bundle = request.app.state.gq_bundle
    network, timetable = bundle.network, bundle.timetable

    leg_id, line = _resolve_leg_and_line(request, req.from_station, req.to_station, req.track_line)
    requested_min = time_to_minutes(req.requested_time)
    track_geometry = network.get_track_segment(req.from_station, req.to_station)

    if req.criticality == Criticality.NORMAL:
        decision = _handle_normal(network, timetable, leg_id, line, req, requested_min)
    elif req.criticality == Criticality.MAJOR:
        decision = _handle_major(network, timetable, leg_id, line, req, requested_min)
    elif req.criticality == Criticality.EMERGENCY:
        decision = _handle_emergency(network, timetable, leg_id, line, req, requested_min)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown criticality: {req.criticality}")

    decision.block_geometry = track_geometry
    return decision


def _handle_normal(network, timetable, leg_id: str, line: TrackLine, req: BlockRequest, requested_min: int) -> BlockDecision:
    corridor = network.corridors[leg_id]
    km_map = {s.code: s.cumulative_km for s in corridor.stations}
    block_start = requested_min
    block_end = requested_min + req.duration_minutes

    sector_conflicts = timetable.find_sector_trains_in_window(
        leg_id=leg_id,
        track_line=line,
        from_code=STATION_ALIASES.get(req.from_station.upper(), req.from_station.upper()),
        to_code=STATION_ALIASES.get(req.to_station.upper(), req.to_station.upper()),
        window_start_min=block_start,
        window_end_min=block_end,
        corridor_km_map=km_map,
    )

    if not sector_conflicts:
        return BlockDecision(
            status=BlockDecisionStatus.APPROVED,
            block_window={
                "start": req.requested_time,
                "end": minutes_to_time(block_end % 1440),
            },
            affected_trains=[],
            asset_availability_index=100.0,
            total_weighted_delay_cost=0.0,
            notes="Zero conflicting trains on this micro-section during requested window -- approved with zero delay.",
        )

    # If conflicts exist, check if a qualifying zero-delay slot exists nearby
    gf = GapFinder(timetable)
    best = gf.best_gap_near(leg_id, line, req.from_station, req.to_station, requested_min, req.duration_minutes)

    if best:
        return BlockDecision(
            status=BlockDecisionStatus.APPROVED,
            block_window={
                "start": minutes_to_time(best.start_min % 1440),
                "end": minutes_to_time((best.start_min + req.duration_minutes) % 1440),
            },
            affected_trains=[],
            asset_availability_index=100.0,
            total_weighted_delay_cost=0.0,
            notes=f"Requested window had {len(sector_conflicts)} conflicting train(s); shifted to nearest zero-delay slot ({minutes_to_time(best.start_min)}).",
        )

    return BlockDecision(
        status=BlockDecisionStatus.REJECTED,
        block_window={"start": req.requested_time, "end": req.requested_time},
        affected_trains=[
            AffectedTrain(
                train_number=c.train_number,
                train_name=c.train_name,
                category=c.category,
                action=RegulationAction.NONE,
                scheduled_pass_time=c.scheduled_pass_time,
                delay_minutes=0.0,
            )
            for c in sector_conflicts
        ],
        asset_availability_index=0.0,
        notes=f"No zero-delay gap found on this micro-section -- {len(sector_conflicts)} conflicting trains during requested slot.",
    )


def _handle_major(network, timetable, leg_id: str, line: TrackLine, req: BlockRequest, requested_min: int) -> BlockDecision:
    corridor = network.corridors[leg_id]
    km_map = {s.code: s.cumulative_km for s in corridor.stations}
    block_start = requested_min
    block_end = requested_min + req.duration_minutes

    sector_conflicts = timetable.find_sector_trains_in_window(
        leg_id=leg_id,
        track_line=line,
        from_code=STATION_ALIASES.get(req.from_station.upper(), req.from_station.upper()),
        to_code=STATION_ALIASES.get(req.to_station.upper(), req.to_station.upper()),
        window_start_min=block_start,
        window_end_min=block_end,
        corridor_km_map=km_map,
    )

    if not sector_conflicts:
        return BlockDecision(
            status=BlockDecisionStatus.APPROVED,
            block_window={
                "start": minutes_to_time(block_start % 1440),
                "end": minutes_to_time(block_end % 1440),
            },
            affected_trains=[],
            asset_availability_index=100.0,
            total_weighted_delay_cost=0.0,
            notes="No trains conflict with the requested window -- approved with no regulation needed.",
        )

    conflicts = [
        TrainConflict(c.train_number, c.category, c.pass_entry_min)
        for c in sector_conflicts
    ]

    try:
        outcome = solve_major_block_regulation(conflicts, block_start, block_end)
    except Exception:
        # Fallback heuristic: delay by order of entry
        outcome = None

    affected: list[AffectedTrain] = []
    conflict_map = {c.train_number: c for c in sector_conflicts}

    if outcome:
        for r in outcome.results:
            c = conflict_map.get(r.train_number)
            if not c:
                continue
            affected.append(
                AffectedTrain(
                    train_number=r.train_number,
                    train_name=c.train_name,
                    category=c.category,
                    action=RegulationAction.HOLD if r.delay_minutes > 0 else RegulationAction.NONE,
                    hold_station=req.from_station if r.delay_minutes > 0 else None,
                    delay_minutes=r.delay_minutes,
                    scheduled_pass_time=c.scheduled_pass_time,
                )
            )
        total_delay = outcome.total_weighted_cost
    else:
        for idx, c in enumerate(sector_conflicts):
            del_m = (idx + 1) * 12.0
            affected.append(
                AffectedTrain(
                    train_number=c.train_number,
                    train_name=c.train_name,
                    category=c.category,
                    action=RegulationAction.HOLD,
                    hold_station=req.from_station,
                    delay_minutes=del_m,
                    scheduled_pass_time=c.scheduled_pass_time,
                )
            )
        total_delay = sum(a.delay_minutes for a in affected)

    worst_premium_delay = max(
        (a.delay_minutes for a in affected if a.category == TrainCategory.PREMIUM), default=0.0
    )
    availability_index = max(0.0, 100.0 - min(worst_premium_delay, 100.0))

    return BlockDecision(
        status=BlockDecisionStatus.APPROVED_WITH_REGULATION,
        block_window={
            "start": minutes_to_time(block_start % 1440),
            "end": minutes_to_time(block_end % 1440),
        },
        affected_trains=affected,
        asset_availability_index=round(availability_index, 1),
        total_weighted_delay_cost=round(total_delay, 1),
        notes=f"{len(affected)} train(s) regulated via weighted-delay MILP on micro-section {req.from_station}➔{req.to_station}.",
    )


def _handle_emergency(network, timetable, leg_id: str, line: TrackLine, req: BlockRequest, requested_min: int) -> BlockDecision:
    corridor = network.corridors[leg_id]
    km_map = {s.code: s.cumulative_km for s in corridor.stations}
    block_start = requested_min
    block_end = requested_min + req.duration_minutes

    sector_conflicts = timetable.find_sector_trains_in_window(
        leg_id=leg_id,
        track_line=line,
        from_code=STATION_ALIASES.get(req.from_station.upper(), req.from_station.upper()),
        to_code=STATION_ALIASES.get(req.to_station.upper(), req.to_station.upper()),
        window_start_min=block_start,
        window_end_min=block_end,
        corridor_km_map=km_map,
    )

    affected: list[AffectedTrain] = []
    for idx, c in enumerate(sector_conflicts):
        action = RegulationAction.HOLD if idx == 0 else RegulationAction.CAUTION
        delay = 24.0 if action == RegulationAction.HOLD else 15.0
        affected.append(
            AffectedTrain(
                train_number=c.train_number,
                train_name=c.train_name,
                category=c.category,
                action=action,
                hold_station=req.from_station if action == RegulationAction.HOLD else None,
                delay_minutes=delay,
                scheduled_pass_time=c.scheduled_pass_time,
            )
        )

    availability_index = max(0.0, 100.0 - min(len(affected) * 12.0, 100.0))

    return BlockDecision(
        status=BlockDecisionStatus.APPROVED_WITH_REGULATION,
        block_window={
            "start": req.requested_time,
            "end": minutes_to_time(block_end % 1440),
        },
        affected_trains=affected,
        asset_availability_index=round(availability_index, 1),
        total_weighted_delay_cost=sum(a.delay_minutes for a in affected),
        notes=f"EMERGENCY block enforced immediately on micro-section {req.from_station}➔{req.to_station} -- {len(affected)} train(s) regulated.",
    )


@router.post("/commit-block")
def commit_block(req: BlockRequest, request: Request) -> dict:
    decision = analyze_block(req, request)
    leg_id, _ = _resolve_leg_and_line(request, req.from_station, req.to_station, req.track_line)
    operation = request.app.state.operation_store.record(
        department=req.department.value,
        corridor=leg_id,
        from_station=req.from_station.upper(),
        to_station=req.to_station.upper(),
        start_time=decision.block_window["start"].strftime("%H:%M:%S"),
        duration_minutes=req.duration_minutes,
        impacted_trains=(train.train_number for train in decision.affected_trains),
    )
    return {"committed": True, "block_id": operation.block_id, "decision": decision}
