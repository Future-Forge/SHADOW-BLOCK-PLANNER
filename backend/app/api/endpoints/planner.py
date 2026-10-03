"""Scenario analysis, explicit transactional commits, history and replay."""
from __future__ import annotations
from datetime import time

from fastapi import APIRouter, Request, HTTPException

from app.core.planning_service import analyze as analyze_plan
from app.core.timetable_engine import time_to_minutes
from app.data.gq_corridors import resolve_track_line, same_leg, STATION_ALIASES
from app.models.enums import TrackLine
from app.models.schemas import (
    BlockRequest,
    BlockDecision,

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

    try:
        parsed_time = t_str if isinstance(t_str, time) else time.fromisoformat(t_str)
    except ValueError:
        raise HTTPException(422, 'requested_time must be HH:MM or HH:MM:SS.')
    if dur <= 0 or dur > 480:
        raise HTTPException(422, 'duration_minutes must be from 1 to 480.')

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
        operation_date=body.operation_date if body else None,
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
    return analyze_plan(req, request.app.state.gq_bundle, request.app.state.operation_store)



@router.post("/commit-block")
def commit_block(req: BlockRequest, request: Request) -> dict:
    from app.core.planning_service import commit
    return commit(req, request.app.state.gq_bundle, request.app.state.operation_store)


@router.get('/operations')
def operation_history(request: Request):
    return request.app.state.operation_store.list()


@router.post('/operations/{block_id}/close')
def close_operation(block_id: str, request: Request):
    if not request.app.state.operation_store.close_operation(block_id):
        raise HTTPException(404, 'Operation not found.')
    return {'closed': True}


@router.post('/operations/{block_id}/evaluate')
def evaluate_operation(block_id: str, request: Request):
    store = request.app.state.operation_store
    operation = next((op for op in store.list() if op['block_id'] == block_id), None)
    if not operation:
        raise HTTPException(404, 'Operation not found.')
    if not (operation.get('snapshot') or {}).get('request'):
        raise HTTPException(422, 'Legacy operation has no replayable request snapshot.')
    req = BlockRequest.model_validate(operation['snapshot']['request'])
    decision = analyze_plan(req, request.app.state.gq_bundle, store, ignore_id=block_id)
    return {'block_id': block_id, 'original': operation['snapshot']['decision'].get('planning', {}).get('evaluation'),
            'replay': decision.planning['evaluation'], 'explanations': decision.planning['explanations'],
            'limitations': decision.planning['limitations']}
