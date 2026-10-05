"""App-facing orchestration; no optimizer implementation here."""
from fastapi import APIRouter
from ai_engine.contracts import PlanResult
from app.ai_adapters.client import ai_request

router = APIRouter(prefix="/api/v1/ai", tags=["root AI service"])


@router.get("/ready")
def ready():
    return ai_request("GET", "/ready")


@router.post("/plan", response_model=PlanResult)
def plan():
    return ai_request("POST", "/api/v1/ai/plan", response_model=PlanResult)

