"""
Pydantic V2 schemas for the GQ Block Planner.

These model the data as it flows through the engine: raw ingested records,
the normalized in-memory graph objects, and the request/response contracts
for the planner + chat API surface.
"""
from __future__ import annotations

from datetime import time, date
from typing import Literal, Annotated
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.models.enums import (
    Department,
    Criticality,
    TrainCategory,
    TrackLine,
    TrainStatus,
    RegulationAction,
    BlockDecisionStatus,
)


# --------------------------------------------------------------------------
# Ingested / normalized network objects
# --------------------------------------------------------------------------

class Station(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str
    name: str
    lat: float
    lon: float
    zone: Optional[str] = None


class CorridorStation(BaseModel):
    """A station's position within one of the 4 GQ trunk legs."""
    code: str
    name: str
    lat: float
    lon: float
    cumulative_km: float = Field(..., description="Chainage from the leg's origin station")


class CorridorTelemetry(BaseModel):
    corridor_id: str = Field(..., description="e.g. 'GQ_WEST', 'GQ_SOUTH_WEST'")
    path: list[list[float]] = Field(..., description="Array of [lon, lat] coordinates")
    timestamps: list[float] = Field(..., description="Normalized elapsed animation timestamps (0..1000)")
    congestion_score: float = Field(..., description="Congestion/density analytical metric driving trail width")
    status: str = Field("NORMAL", description="'CRITICAL' | 'NORMAL'")


class Corridor(BaseModel):
    corridor_id: Optional[str] = None
    leg_id: str = Field(..., description="e.g. 'WEST', 'SOUTH_WEST', 'EAST_COAST', 'NORTH_EAST'")
    display_name: str
    origin_code: str
    destination_code: str
    total_km: float
    stations: list[CorridorStation]
    path: Optional[list[list[float]]] = None
    timestamps: Optional[list[float]] = None
    congestion_score: Optional[float] = 5.0
    status: Optional[str] = "NORMAL"


class TrainStop(BaseModel):
    """One scheduled stop in a train's route."""
    sno: int
    station_code: str
    station_name: str
    arrival: Optional[time] = None
    departure: Optional[time] = None
    distance_km: float
    day: int = Field(1, description="Day offset from origin departure, for multi-day trains")


class Train(BaseModel):
    number: str
    name: str
    category: TrainCategory
    from_station_code: str
    to_station_code: str
    running_days: list[str] = Field(default_factory=list)
    route: list[TrainStop]

    @field_validator("route")
    @classmethod
    def route_must_be_sorted(cls, v: list[TrainStop]) -> list[TrainStop]:
        if v != sorted(v, key=lambda s: s.sno):
            return sorted(v, key=lambda s: s.sno)
        return v


class LiveTrainState(BaseModel):
    """Interpolated real-time state of a single train at the simulation clock."""
    train_number: str
    train_name: str
    category: TrainCategory
    lat: float
    lon: float
    current_section: str = Field(..., description="'FROM_CODE-TO_CODE' block section identifier")
    track_line: TrackLine
    speed_kmph: float
    status: TrainStatus
    corridor_leg: Optional[str] = None
    delay_minutes: float = 0.0
    heading: Optional[float] = 0.0
    bearing: Optional[float] = 0.0


# --------------------------------------------------------------------------
# Gap finding
# --------------------------------------------------------------------------

class HeadwayGap(BaseModel):
    """A free window on a segment/line with no scheduled train movement."""
    segment_from: str
    segment_to: str
    track_line: TrackLine
    start: time
    end: time
    duration_minutes: int
    preceding_train: Optional[str] = None
    following_train: Optional[str] = None


# --------------------------------------------------------------------------
# Maintenance / block planning requests + responses
# --------------------------------------------------------------------------

class SharedTask(BaseModel):
    department: Department
    duration_minutes: int = Field(60, gt=0, le=480)


class WeatherScenario(BaseModel):
    mode: Literal['seasonal', 'clear', 'heavy_rain', 'high_wind', 'severe'] = 'seasonal'
    exposed_work: bool = False
    wind_risk_months: list[Annotated[int, Field(ge=1, le=12)]] = Field(default_factory=list, max_length=12)


class BlockRequest(BaseModel):
    from_station: str
    to_station: str
    track_line: TrackLine
    requested_time: time
    duration_minutes: int = Field(..., gt=0, le=480)
    department: Department
    criticality: Criticality
    operation_date: date = Field(default_factory=date.today)
    expected_start_iso: Optional[str] = None
    shared_tasks: list[SharedTask] = Field(default_factory=list, max_length=2)
    parallel_work_confirmed: bool = False
    weather: WeatherScenario = Field(default_factory=WeatherScenario)
    resource_capacity: dict[str, int] = Field(default_factory=lambda: {
        'TMS_crew': 2, 'SMMS_crew': 2, 'TDMS_crew': 2, 'equipment_sets': 3, 'vehicles': 2})

    @field_validator('resource_capacity')
    @classmethod
    def valid_capacities(cls, capacities):
        allowed = {'TMS_crew', 'SMMS_crew', 'TDMS_crew', 'equipment_sets', 'vehicles'}
        if set(capacities) != allowed or any(v < 0 or v > 100 for v in capacities.values()):
            raise ValueError('Supply all five resource capacities as integers from 0 to 100.')
        return capacities


class StationItem(BaseModel):
    """Granular station descriptor for combobox search and micro-topology."""
    code: str
    name: str
    lat: float
    lon: float
    legs: list[str] = Field(default_factory=list)
    cumulative_km: float = 0.0
    adjacentCodes: list[str] = Field(default_factory=list)
    zone: Optional[str] = None
    is_junction: bool = False


class AffectedTrain(BaseModel):
    train_number: str
    train_name: str
    category: TrainCategory
    action: RegulationAction
    hold_station: Optional[str] = None
    delay_minutes: float = 0.0
    scheduled_pass_time: Optional[time] = None


class AlternativeWindow(BaseModel):
    start: time
    end: time
    duration_minutes: int


class BlockDecision(BaseModel):
    status: BlockDecisionStatus
    block_window: dict[str, time]
    affected_trains: list[AffectedTrain] = Field(default_factory=list)
    max_available_gap_nearby: Optional[AlternativeWindow] = None
    asset_availability_index: float = Field(
        ..., ge=0, le=100,
        description="Composite score reflecting how little premium/express disruption this decision causes"
    )
    total_weighted_delay_cost: Optional[float] = None
    notes: Optional[str] = None
    block_geometry: list[list[float]] = Field(
        default_factory=list,
        description="Exact GIS LineString [[lon, lat], ...] sliced along the master corridor track"
    )
    planning: dict = Field(default_factory=dict)


class TrafficPreviewRequest(BaseModel):
    operation_date: date = Field(default_factory=date.today)
    from_station: str
    to_station: str
    track_line: TrackLine = TrackLine.UP
    requested_time: time
    duration_minutes: int = Field(60, gt=0, le=480)


class TrafficPreviewItem(BaseModel):
    train_number: str
    train_name: str
    category: TrainCategory
    scheduled_pass_time: str
    direction: TrackLine
    conflict: bool = True
    delay_minutes: float = 0.0


class TrafficPreviewResponse(BaseModel):
    from_station: str
    to_station: str
    track_line: TrackLine
    requested_time: time
    duration_minutes: int
    projected_traffic_count: int
    summary_by_category: dict[str, int] = Field(default_factory=dict)
    trains: list[TrafficPreviewItem] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Emergency dispatch
# --------------------------------------------------------------------------

class EmergencyHoldOrder(BaseModel):
    train_number: str
    train_name: str
    action: RegulationAction
    location: str = Field(..., description="Station or signal identifier where the action applies")
    instruction: str
    caution_speed_kmph: Optional[float] = None
    estimated_hold_minutes: Optional[float] = None
    cascade_delay_minutes: float = 0.0


class EmergencyDispatchResult(BaseModel):
    block_id: str
    from_station: str
    to_station: str
    track_line: TrackLine
    locked_at: time
    hold_orders: list[EmergencyHoldOrder]
    total_cascade_delay_minutes: float


# --------------------------------------------------------------------------
# Chat / NLP
# --------------------------------------------------------------------------

class ChatQuery(BaseModel):
    text: str


class ChatEntities(BaseModel):
    origin: Optional[str] = None
    destination: Optional[str] = None
    department: Optional[Department] = None
    time_of_day: Optional[time] = None
    duration_minutes: Optional[int] = None
    criticality: Optional[Criticality] = None
    confidence: float = Field(1.0, ge=0, le=1)


class ChatResponse(BaseModel):
    summary: str
    entities: ChatEntities
    decision: Optional[BlockDecision] = None
    clarification_needed: Optional[str] = None


# --------------------------------------------------------------------------
# Gemini AI Dispatcher Console
# --------------------------------------------------------------------------

class DispatcherChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default_session"
    sim_time: Optional[str] = "12:00:00"


class FlyToTarget(BaseModel):
    lat: float
    lon: float
    zoom: float = 11.0
    pitch: Optional[float] = 60.0
    bearing: Optional[float] = -15.0


class DispatcherChatResponse(BaseModel):
    response_text: str
    action_triggered: str = "NONE"  # EXECUTE_BLOCK | ANALYZE_GAP | TRAIN_INSPECT | RESEQUENCE | DOWNLOAD_CSV | NONE
    payload: dict = Field(default_factory=dict)
    fly_to_target: Optional[FlyToTarget] = None
