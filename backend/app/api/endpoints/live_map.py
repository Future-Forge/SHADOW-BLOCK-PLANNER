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
