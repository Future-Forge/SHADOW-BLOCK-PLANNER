"""
POST /api/v1/chat/query

Parses a free-text controller query into structured entities, and if
enough was extracted to form a valid BlockRequest, runs it through the
same analyze_block logic the structured endpoint uses. Otherwise returns
a clarification prompt naming what's missing, rather than guessing.
"""
from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.endpoints.planner import analyze_block
from app.core.nlp_parser import extract_entities
from app.core.gemini_agent import process_dispatcher_message
from app.models.enums import Criticality, TrackLine
from app.models.schemas import (
    ChatQuery,
    ChatResponse,
    BlockRequest,
    DispatcherChatRequest,
    DispatcherChatResponse,
)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


def _missing_fields(entities) -> list[str]:
    missing = []
    if not entities.origin:
        missing.append("origin station")
    if not entities.destination:
        missing.append("destination station")
    if not entities.department:
        missing.append("department (TMS/SMMS/TDMS)")
    if not entities.time_of_day:
        missing.append("requested time")
    if not entities.duration_minutes:
        missing.append("duration")
    if not entities.criticality:
        missing.append("criticality (NORMAL/MAJOR/EMERGENCY)")
    return missing


@router.post("/query", response_model=ChatResponse)
def chat_query(payload: ChatQuery, request: Request) -> ChatResponse:
    network = request.app.state.gq_bundle.network
    entities = extract_entities(payload.text, network)

    missing = _missing_fields(entities)
    if missing:
        return ChatResponse(
            summary=(
                "I couldn't extract everything needed to plan this block. "
                f"Missing: {', '.join(missing)}."
            ),
            entities=entities,
            decision=None,
            clarification_needed=(
                "Please specify: " + ", ".join(missing) +
                ". Example: \"Need an emergency TMS track renewal between "
                "Surat and Vadodara around 14:00 for 45 minutes.\""
            ),
        )

    # Track line direction is resolved inside analyze_block from the
    # from/to pair, so any placeholder value works here -- it gets
    # overwritten by the leg's canonical direction resolution.
    block_req = BlockRequest(
        from_station=entities.origin,
        to_station=entities.destination,
        track_line=TrackLine.UP,
        requested_time=entities.time_of_day,
        duration_minutes=entities.duration_minutes,
        department=entities.department,
        criticality=entities.criticality,
    )

    decision = analyze_block(block_req, request)

    summary = (
        f"{entities.criticality.value} {entities.department.value} block requested "
        f"{entities.origin}->{entities.destination} at {entities.time_of_day} for "
        f"{entities.duration_minutes} min. Result: {decision.status.value}. "
        f"{decision.notes or ''}"
    ).strip()

    return ChatResponse(
        summary=summary,
        entities=entities,
        decision=decision,
        clarification_needed=None,
    )


# --------------------------------------------------------------------------
# Autonomous Section Controller & AI Chief Dispatcher
# --------------------------------------------------------------------------

@router.post("/dispatcher", response_model=DispatcherChatResponse)
def chat_dispatcher(payload: DispatcherChatRequest, request: Request) -> DispatcherChatResponse:
    """
    Direct conversational interface with the Gemini-powered AI Railway Dispatcher.
    Executes domain function calling against in-memory GQ network, timetable, and solvers.
    """
    bundle = getattr(request.app.state, "gq_bundle", None)
    if bundle is None:
        return DispatcherChatResponse(
            response_text="⚠️ **SYSTEM BOOT IN PROGRESS**: Golden Quadrilateral network bundle is currently initializing. Please standby.",
            action_triggered="NONE",
        )

    return process_dispatcher_message(
        bundle=bundle,
        message=payload.message,
        session_id=payload.session_id or "default_session",
        sim_time=payload.sim_time or "12:00:00",
    )

