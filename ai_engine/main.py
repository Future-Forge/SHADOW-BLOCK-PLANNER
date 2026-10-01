import os
import sys
import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import redis
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")

# Import optimization engine & AI modules
from ai_engine.solver import run_optimization, get_db_connection, get_redis_client, REDIS_KEY, REDIS_TTL
from ai_engine.xgboost_scorer import predict_defect_criticality
from ai_engine.weather_engine import get_all_corridors_weather_risk, get_corridor_weather_risk
from ai_engine.chatbot_engine import query_rail_ai, HITL_PROPOSAL_PREFIX, CHANNEL_SCHEDULE_UPDATES
from ai_engine.reoptimizer import SectionReoptimizer
from ai_engine.analytics_engine import get_kpi_analytics
from ai_engine.websocket_manager import manager as ws_manager, redis_pubsub_listener

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("fastapi_app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start background Redis PubSub to WebSocket forwarder
    listener_task = asyncio.create_task(redis_pubsub_listener(ws_manager))
    logger.info("FastAPI Application Lifespan: Redis PubSub to WebSocket Bridge initialized.")
    yield
    # Shutdown: Cancel background task
    listener_task.cancel()
    try:
        await listener_task
    except asyncio.CancelledError:
        pass
    logger.info("FastAPI Application Lifespan: Redis PubSub Bridge shutdown.")

app = FastAPI(
    title="Shadow-Blockplanner AI Optimization Engine",
    description="Intelligent Multi-Department Railway Track Possession Optimization API (SIH26027)",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for BFF / UI interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# Pydantic Models
# -------------------------------------------------------------
class ServiceStatus(BaseModel):
    status: str
    details: Dict[str, Any]

class HealthResponse(BaseModel):
    service: str = "Shadow-Blockplanner AI Engine"
    status: str
    timestamp: str
    components: Dict[str, ServiceStatus]

class BlockSummary(BaseModel):
    total_defects_evaluated: int
    total_candidates_formed: int
    total_mega_blocks_scheduled: int
    total_block_hours_allocated: float
    total_shadow_hours_saved: float
    premium_train_conflicts: int
    freight_conflicts_managed: int
    corridors_covered: List[str]

class BlockItem(BaseModel):
    block_plan_id: int
    gq_corridor: str = "Delhi-Mumbai"
    block_section: str = "SUR-PUNE"
    primary_department: str = "TMS"
    shadow_departments: List[str] = []
    start_time: str
    end_time: str
    duration_hours: float
    shadow_hours_saved: float = 0.0
    urgency_score: float = 0.0
    max_temp_c: float = 35.0
    defect_count: int = 1
    status: str = "OPTIMIZED"

class OptimizationResponse(BaseModel):
    status: str
    solver_status: str
    solve_duration_seconds: float
    generated_at: str
    summary: BlockSummary
    blocks: List[BlockItem]

class DefectPredictRequest(BaseModel):
    defect_age_days: float = Field(..., example=5.0, description="Age of defect in days")
    ambient_temp_c: float = Field(..., example=42.5, description="Ambient temperature in degrees Celsius")
    track_tonnage_mgt: float = Field(55.0, example=65.0, description="Track cumulative tonnage in MGT")
    speed_restriction_kmh: float = Field(0.0, example=30.0, description="Speed restriction imposed in km/h")
    department_type: str = Field("TMS", example="TMS", description="Department code: TMS, SMMS, or TDMS")

class DefectPredictResponse(BaseModel):
    criticality_score: float
    urgency_tier: str
    indicator_color: str
    action_window_hours: int
    features: Dict[str, Any]

class ChatbotQueryRequest(BaseModel):
    query: str = Field(..., example="Shift S&T block at Km 142 by 30 minutes")

class ChatbotQueryResponse(BaseModel):
    intent: str
    query: str
    confidence: float
    action_type: str = "READ_ONLY"
    direct_answer: str
    executable_payload: Dict[str, Any] = {}
    data_payload: Dict[str, Any] = {}
    suggested_followups: List[str] = []

class EmergencyReoptimizeRequest(BaseModel):
    corridor: str = Field("Delhi-Mumbai", example="Delhi-Mumbai")
    block_section: str = Field("SUR-PUNE", example="SUR-PUNE")
    emergency_defect: Optional[Dict[str, Any]] = None
    train_delay: Optional[Dict[str, Any]] = None

class HITLCommitRequest(BaseModel):
    proposal_id: str = Field(..., example="PROP-RESCHED-26C73B76", description="ID of pending proposal")
    controller_id: str = Field("SM-NDLS-01", example="SM-NDLS-01", description="Authorizing Section Controller / Station Master ID")
    decision: str = Field("APPROVED", example="APPROVED", description="'APPROVED' or 'REJECTED'")
    remarks: Optional[str] = Field("Authorized track possession shift", example="Authorized track possession shift")

class HITLCommitResponse(BaseModel):
    status: str
    proposal_id: str
    decision: str
    block_plan_id: Optional[int] = None
    message: str
    committed_at: str

# -------------------------------------------------------------
# API Endpoints
# -------------------------------------------------------------

@app.get("/", tags=["General"])
def root_info():
    """Root metadata and API navigation info."""
    return {
        "service": "Shadow-Blockplanner AI Optimization Engine",
        "version": "1.0.0",
        "documentation": "/docs",
        "websocket_endpoint": "/ws/live-updates",
        "status": "ONLINE",
        "endpoints": [
            "/api/v1/health",
            "/api/v1/optimize-blocks",
            "/api/v1/blocks",
            "/api/v1/analytics/kpis",
            "/api/v1/predict-criticality",
            "/api/v1/weather-risk",
            "/api/v1/ai-query",
            "/api/v1/emergency-reoptimize",
            "/api/v1/hitl/commit",
            "/api/v1/hitl/pending-proposals"
        ]
    }

@app.get("/api/v1/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    """Check the connectivity and operational health of PostgreSQL and Redis."""
    components = {}
    is_all_healthy = True

    # Check PostgreSQL
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM scheduled_blocks;")
            count = cur.fetchone()[0]
        conn.close()
        components["postgres"] = ServiceStatus(
            status="HEALTHY",
            details={
                "host": os.getenv("DB_HOST", "localhost"),
                "port": os.getenv("DB_PORT", "5432"),
                "database": os.getenv("DB_NAME", "shadow_blockplanner"),
                "scheduled_blocks_count": count
            }
        )
    except Exception as e:
        is_all_healthy = False
        components["postgres"] = ServiceStatus(
            status="UNHEALTHY",
            details={"error": str(e)}
        )

    # Check Redis
    try:
        r = get_redis_client()
        is_redis_alive = r.ping()
        has_cache = r.exists(REDIS_KEY) == 1
        components["redis"] = ServiceStatus(
            status="HEALTHY" if is_redis_alive else "UNHEALTHY",
            details={
                "host": os.getenv("REDIS_HOST", "localhost"),
                "port": int(os.getenv("REDIS_PORT", 6379)),
                "cache_key_exists": has_cache
            }
        )
    except Exception as e:
        is_all_healthy = False
        components["redis"] = ServiceStatus(
            status="UNHEALTHY",
            details={"error": str(e)}
        )

    return HealthResponse(
        status="HEALTHY" if is_all_healthy else "DEGRADED",
        timestamp=datetime.now().isoformat(),
        components=components
    )

@app.post("/api/v1/optimize-blocks", response_model=OptimizationResponse, tags=["Optimization"])
def trigger_block_optimization():
    """
    Execute Google OR-Tools MILP optimization:
    1. Loads defect records (TMS, SMMS, TDMS) & COA train timetables from PostgreSQL.
    2. Performs Mega Block fusion with XGBoost scoring and thermal safety physics.
    3. Guarantees schedule protection for PREMIUM_PASSENGER trains.
    4. Writes scheduled blocks to PostgreSQL and caches payload to Redis.
    """
    try:
        logger.info("Triggering OR-Tools optimization via POST /api/v1/optimize-blocks...")
        result = run_optimization()
        # Invalidate analytics cache on re-optimization
        r = get_redis_client()
        r.delete("analytics:summary_kpis")
        return result
    except Exception as e:
        logger.error(f"Optimization execution failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Optimization failed: {str(e)}"
        )

@app.get("/api/v1/blocks", response_model=OptimizationResponse, tags=["Optimization"])
def get_scheduled_blocks():
    """
    Retrieve the current optimized schedule:
    - Primary source: Fast retrieval from Redis cache (`latest_optimized_schedule`).
    - Fallback source: PostgreSQL `scheduled_blocks` table if cache is missed.
    """
    r = get_redis_client()
    try:
        cached = r.get(REDIS_KEY)
        if cached:
            logger.info("Serving scheduled blocks from Redis cache.")
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Redis cache lookup failed: {e}. Falling back to PostgreSQL.")

    logger.info("Querying PostgreSQL scheduled_blocks table directly...")
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT block_plan_id, gq_corridor, block_section, primary_department,
                       shadow_departments, start_time, end_time, duration_hours, status
                FROM scheduled_blocks
                ORDER BY start_time ASC;
            """)
            rows = cur.fetchall()
        conn.close()

        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No scheduled blocks found. Please execute /api/v1/optimize-blocks first."
            )

        total_hours = sum(float(r["duration_hours"]) for r in rows)
        blocks = [
            {
                "block_plan_id": r["block_plan_id"],
                "gq_corridor": r["gq_corridor"],
                "block_section": r["block_section"],
                "primary_department": r["primary_department"],
                "shadow_departments": r["shadow_departments"] or [],
                "start_time": r["start_time"].strftime("%Y-%m-%d %H:%M:%S"),
                "end_time": r["end_time"].strftime("%Y-%m-%d %H:%M:%S"),
                "duration_hours": float(r["duration_hours"]),
                "shadow_hours_saved": 0.0,
                "urgency_score": 0.0,
                "max_temp_c": 0.0,
                "defect_count": len(r["shadow_departments"] or []) + 1,
                "status": r["status"]
            }
            for r in rows
        ]

        payload = {
            "status": "SUCCESS",
            "solver_status": "DATABASE_FALLBACK",
            "solve_duration_seconds": 0.0,
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_defects_evaluated": 0,
                "total_candidates_formed": len(blocks),
                "total_mega_blocks_scheduled": len(blocks),
                "total_block_hours_allocated": round(total_hours, 1),
                "total_shadow_hours_saved": 0.0,
                "premium_train_conflicts": 0,
                "freight_conflicts_managed": 0,
                "corridors_covered": list(set(b["gq_corridor"] for b in blocks))
            },
            "blocks": blocks
        }

        try:
            r.set(REDIS_KEY, json.dumps(payload, default=str), ex=REDIS_TTL)
        except Exception:
            pass

        return payload
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading scheduled blocks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve scheduled blocks: {str(e)}"
        )

@app.get("/api/v1/analytics/kpis", tags=["Analytics & Insights"])
def get_kpis_endpoint(refresh: bool = Query(False, description="Force recalculation instead of reading Redis cache")):
    """
    Retrieve executive KPIs, track maintenance delay minutes saved, and corridor efficiency analytics.
    """
    try:
        return get_kpi_analytics(force_refresh=refresh)
    except Exception as e:
        logger.error(f"Analytics computation error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.post("/api/v1/predict-criticality", response_model=DefectPredictResponse, tags=["Machine Learning"])
def predict_criticality_endpoint(defect: DefectPredictRequest):
    """
    Predict defect criticality score (0.0 - 100.0) and urgency classification using XGBoost.
    """
    try:
        res = predict_defect_criticality(
            defect_age_days=defect.defect_age_days,
            ambient_temp_c=defect.ambient_temp_c,
            track_tonnage_mgt=defect.track_tonnage_mgt,
            speed_restriction_kmh=defect.speed_restriction_kmh,
            department_type=defect.department_type
        )
        return DefectPredictResponse(**res)
    except Exception as e:
        logger.error(f"XGBoost inference error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failed: {str(e)}"
        )

@app.get("/api/v1/weather-risk", tags=["Physics & Weather"])
def get_weather_risk_endpoint(corridor: Optional[str] = Query(None, description="Corridor name (e.g. 'Delhi-Mumbai')")):
    """
    Retrieve live weather and rail physics metrics (ambient vs rail temp, solar heating, track buckling risk multiplier).
    """
    try:
        if corridor:
            return get_corridor_weather_risk(corridor)
        else:
            return get_all_corridors_weather_risk()
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Weather risk calculation error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.post("/api/v1/ai-query", response_model=ChatbotQueryResponse, tags=["AI Assistant"])
def ai_query_endpoint(req: ChatbotQueryRequest):
    """
    Action-Oriented Natural Language Command Interface:
    - Parses operational commands (reschedule, reroute, overrun recovery, emergency possessions).
    - Auto-generates Two-Phase Commit mutation proposals with safety & timetable impact analysis.
    """
    try:
        res = query_rail_ai(req.query)
        return ChatbotQueryResponse(**res)
    except Exception as e:
        logger.error(f"AI query processing error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.post("/api/v1/emergency-reoptimize", tags=["Optimization"])
def emergency_reoptimize_endpoint(req: EmergencyReoptimizeRequest):
    """
    Trigger sub-second localized micro-MILP re-optimization for an emergency defect or train delay on a specific section.
    """
    try:
        reopt = SectionReoptimizer()
        res = reopt.reoptimize_section(
            corridor=req.corridor,
            section=req.block_section,
            emergency_defect=req.emergency_defect,
            train_delay=req.train_delay
        )
        return res
    except Exception as e:
        logger.error(f"Emergency re-optimization failed: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# -------------------------------------------------------------
# Human-in-the-Loop (HITL) Handshake Lock Endpoints
# -------------------------------------------------------------
@app.get("/api/v1/hitl/pending-proposals", tags=["Human-in-the-Loop"])
def get_pending_hitl_proposals():
    """
    Retrieve all pending schedule mutation proposals awaiting Section Controller approval.
    """
    r = get_redis_client()
    try:
        keys = r.keys(f"{HITL_PROPOSAL_PREFIX}*")
        proposals = []
        for k in keys:
            val = r.get(k)
            if val:
                proposals.append(json.loads(val))
        return {
            "status": "SUCCESS",
            "total_pending": len(proposals),
            "proposals": proposals
        }
    except Exception as e:
        logger.error(f"Error reading pending HITL proposals: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.post("/api/v1/hitl/commit", response_model=HITLCommitResponse, tags=["Human-in-the-Loop"])
def commit_hitl_handshake(req: HITLCommitRequest):
    """
    Two-Phase Commit Handshake:
    - Step 2: Station Master / Section Controller issues explicit approval or rejection.
    - If Approved: Commits mutation to PostgreSQL, updates Redis schedule, and broadcasts to WebSocket clients.
    """
    r = get_redis_client()
    proposal_key = f"{HITL_PROPOSAL_PREFIX}{req.proposal_id}"
    cached_proposal = r.get(proposal_key)

    if not cached_proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proposal ID '{req.proposal_id}' not found or expired (10-minute TTL)."
        )

    proposal = json.loads(cached_proposal)

    if req.decision.upper() == "REJECTED":
        r.delete(proposal_key)
        # Broadcast rejection event
        try:
            r.publish(CHANNEL_SCHEDULE_UPDATES, json.dumps({
                "event_type": "PROPOSAL_REJECTED",
                "proposal_id": req.proposal_id,
                "controller_id": req.controller_id,
                "remarks": req.remarks
            }, default=str))
        except Exception:
            pass

        return HITLCommitResponse(
            status="REJECTED",
            proposal_id=req.proposal_id,
            decision="REJECTED",
            block_plan_id=None,
            message=f"Proposal {req.proposal_id} was rejected by Controller {req.controller_id}. Remarks: {req.remarks}",
            committed_at=datetime.now().isoformat()
        )

    # APPROVED: Execute database commit
    conn = get_db_connection()
    new_block_id = None
    try:
        params = proposal.get("target_parameters", {})
        corridor = params.get("corridor", "Delhi-Mumbai")
        section = params.get("block_section", "SUR-PUNE")
        dept = params.get("department", "TMS")
        start_t = params.get("proposed_start", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        end_t = params.get("proposed_end", (datetime.now() + timedelta(hours=3)).strftime("%Y-%m-%d %H:%M:%S"))
        duration = float(params.get("duration_hours", 3.0))

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO scheduled_blocks (
                    gq_corridor, block_section, primary_department, shadow_departments,
                    start_time, end_time, duration_hours, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'CONTROLLER_CONFIRMED')
                RETURNING block_plan_id;
                """,
                (corridor, section, dept, ["SMMS", "TDMS"], start_t, end_t, duration)
            )
            new_block_id = cur.fetchone()[0]
        conn.commit()

        # Update Redis Schedule Cache
        cached_sched = r.get(REDIS_KEY)
        if cached_sched:
            sched_data = json.loads(cached_sched)
            new_block_entry = {
                "block_plan_id": new_block_id,
                "gq_corridor": corridor,
                "block_section": section,
                "primary_department": dept,
                "shadow_departments": ["SMMS", "TDMS"],
                "start_time": start_t,
                "end_time": end_t,
                "duration_hours": duration,
                "shadow_hours_saved": 2.5,
                "urgency_score": 500.0,
                "max_temp_c": 38.0,
                "defect_count": 3,
                "status": "CONTROLLER_CONFIRMED"
            }
            sched_data["blocks"].append(new_block_entry)
            sched_data["summary"]["total_mega_blocks_scheduled"] += 1
            r.set(REDIS_KEY, json.dumps(sched_data, default=str), ex=REDIS_TTL)

        # Broadcast Two-Phase Commit Finalized to WebSockets
        r.publish(CHANNEL_SCHEDULE_UPDATES, json.dumps({
            "event_type": "COMMIT_HANDSHAKE_FINALIZED",
            "proposal_id": req.proposal_id,
            "controller_id": req.controller_id,
            "block_plan_id": new_block_id,
            "action": proposal.get("action"),
            "status": "CONFIRMED_COMMITTED"
        }, default=str))

        # Clean up proposal
        r.delete(proposal_key)

        return HITLCommitResponse(
            status="COMMITTED",
            proposal_id=req.proposal_id,
            decision="APPROVED",
            block_plan_id=new_block_id,
            message=f"Two-Phase Commit Handshake finalized by Controller {req.controller_id}. Block #{new_block_id} scheduled.",
            committed_at=datetime.now().isoformat()
        )
    finally:
        conn.close()

# -------------------------------------------------------------
# WebSocket Real-Time Event Stream Endpoint
# -------------------------------------------------------------
@app.websocket("/ws/live-updates")
async def websocket_live_updates(websocket: WebSocket):
    """
    Real-Time WebSocket Stream for Live Re-Optimization Events, Critical Alerts, and Weather Physics.
    """
    await ws_manager.connect(websocket)
    try:
        # Send initial state snapshot on connection
        r = get_redis_client()
        cached_schedule = r.get(REDIS_KEY)
        schedule_summary = json.loads(cached_schedule).get("summary", {}) if cached_schedule else {}

        await websocket.send_json({
            "event_type": "CONNECTION_INITIALIZED",
            "timestamp": datetime.now().isoformat(),
            "message": "Connected to Shadow-Blockplanner Live Event Bus",
            "schedule_summary": schedule_summary
        })

        # Keep connection open and receive client pings/messages
        while True:
            client_msg = await websocket.receive_text()
            logger.info(f"Received WS client message: {client_msg}")
            await websocket.send_json({
                "event_type": "ACK",
                "timestamp": datetime.now().isoformat(),
                "echo": client_msg
            })
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket session error: {e}")
        ws_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    api_port = int(os.getenv("API_PORT", 8000))
    uvicorn.run("ai_engine.main:app", host="0.0.0.0", port=api_port, reload=False)
