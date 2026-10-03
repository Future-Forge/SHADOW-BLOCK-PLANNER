"""
GET /api/v1/trains/live?time={HH:mm:ss}&type={ALL|PASSENGER|FREIGHT}
"""
from __future__ import annotations

from datetime import time as time_type

from fastapi import APIRouter, Request, Query

from app.core.live_positions import compute_live_trains
from app.core.timetable_engine import time_to_minutes_float
from app.models.enums import TrainFilter
from app.models.schemas import LiveTrainState

router = APIRouter(prefix="/api/v1", tags=["live_map"])


@router.get("/trains/live", response_model=list[LiveTrainState])
def get_live_trains(
    request: Request,
    time: str = Query(..., description="Simulated clock time, HH:MM:SS"),
    type: TrainFilter = Query(TrainFilter.ALL, description="ALL | PASSENGER | FREIGHT"),
) -> list[LiveTrainState]:
    bundle = request.app.state.gq_bundle
    at_min = time_to_minutes_float(time)
    return compute_live_trains(bundle.network, bundle.timetable, at_min, type)


@router.get('/trains/snapshot')
def train_snapshot(request: Request, time: time_type = Query(...)) -> dict:
    """Explicit data provenance and complete GQ counts for the control workspace."""
    bundle = request.app.state.gq_bundle
    trains = [t for t in compute_live_trains(bundle.network, bundle.timetable,
              time_to_minutes_float(time)) if t.corridor_leg is not None]
    counts = {leg: sum(t.corridor_leg == leg for t in trains) for leg in bundle.network.corridors}
    return {'source': 'TIMETABLE_SIMULATION', 'simulation_time': time.isoformat(),
            'total': len(trains), 'corridor_counts': counts, 'trains': trains,
            'notice': 'Interpolated timetable positions, not live GPS. Block decisions are planning overlays, not executed train commands.'}
