"""Versioned domain contract for the internal HTTP boundary."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class DefectFeatures(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    defect_age_days: float = Field(ge=0, le=3650)
    ambient_temp_c: float = Field(ge=-50, le=70)
    track_tonnage_mgt: float = Field(ge=0, le=1000)
    speed_restriction_kmh: float = Field(ge=0, le=200)
    department_type: Literal["TMS", "SMMS", "TDMS"]


class CriticalityResult(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    criticality_score: float = Field(ge=0, le=100)
    urgency_tier: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    action_window_hours: int = Field(gt=0)
    features: DefectFeatures
    warnings: list[str]
    source: Literal["SUPPLIED_XGBOOST_MODEL"]
    engine: Literal["root/ai_engine"]
    notice: str


class BlockPlan(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    block_plan_id: int
    gq_corridor: str
    block_section: str
    primary_department: Literal["TMS", "SMMS", "TDMS"]
    shadow_departments: list[Literal["TMS", "SMMS", "TDMS"]]
    start_time: str
    end_time: str
    duration_hours: float = Field(gt=0)
    shadow_hours_saved: float
    urgency_score: float
    max_temp_c: float
    defect_count: int = Field(gt=0)
    status: Literal["PROPOSED"]


class PlanResult(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    contract_version: Literal[1] = 1
    engine: Literal["root/ai_engine"]
    mode: Literal["demo"]
    safety_status: Literal["REQUIRES_APPROVAL"]
    status: Literal["SUCCESS"]
    solver_status: Literal["OPTIMAL", "FEASIBLE"]
    solve_duration_seconds: float
    generated_at: str
    summary: dict
    blocks: list[BlockPlan]
    limitations: list[str]

