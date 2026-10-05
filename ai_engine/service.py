"""Internal adapter. Algorithms and the model stay in the original root engine."""
import logging
import os
from hashlib import sha256

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from ai_engine import xgboost_scorer as scorer
from ai_engine.contracts import DefectFeatures, CriticalityResult, PlanResult

app = FastAPI(title="Shadow Block internal AI service", version="1.0.0")
logger = logging.getLogger(__name__)


@app.get("/health")
def health():
    return {"status": "ok", "engine": "root/ai_engine"}


@app.get("/api/v1/ai/model")
def model_status():
    try:
        model = scorer.get_criticality_model()
        return {"available": True, "name": "XGBoost defect criticality",
                "engine": "root/ai_engine", "trees": model.num_boosted_rounds(),
                "sha256": sha256(scorer.MODEL_PATH.read_bytes().rstrip()).hexdigest(),
                "features": scorer.FEATURE_NAMES,
                "training_source": "Supplied synthetic-trained artifact; independent validation not supplied."}
    except Exception:
        logger.exception("Root model unavailable")
        raise HTTPException(503, "Root model unavailable; no training or fallback performed.")


@app.get("/ready")
def ready():
    checks = {}
    try:
        model_status()
        checks["model"] = True
    except HTTPException:
        checks["model"] = False
    from ai_engine.solver import get_db_connection, get_redis_client
    from ortools.linear_solver import pywraplp
    checks["ortools"] = bool(pywraplp.Solver.CreateSolver("SCIP") or pywraplp.Solver.CreateSolver("CBC"))
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                for table in ("tms_track_defects", "smms_signal_defects", "tdms_traction_defects", "coa_train_timetable"):
                    cur.execute(f"SELECT count(*) FROM {table}")
                    if cur.fetchone()[0] == 0:
                        raise RuntimeError("Required dataset is empty")
            checks["postgres"] = True
        finally:
            conn.close()
    except Exception:
        checks["postgres"] = False
    try:
        checks["redis"] = bool(get_redis_client().ping())
    except Exception:
        checks["redis"] = False
    checks["demo_mode"] = os.getenv("MODE") == "demo"
    ok = all(checks.values())
    return JSONResponse(status_code=200 if ok else 503, content={"status": "ready" if ok else "unavailable", "checks": checks})


@app.post("/api/v1/ai/criticality", response_model=CriticalityResult)
def criticality(features: DefectFeatures):
    try:
        result = scorer.predict_defect_criticality(**features.model_dump())
    except Exception:
        logger.exception("Root inference failed")
        raise HTTPException(503, "Root model inference failed; no substitute score generated.")
    ranges = {"defect_age_days": (0.5, 30), "ambient_temp_c": (10, 48),
              "track_tonnage_mgt": (15, 110), "speed_restriction_kmh": (0, 75)}
    return {**result, "engine": "root/ai_engine", "source": "SUPPLIED_XGBOOST_MODEL",
            "warnings": [f"{key} is outside the companion training generator's range ({lo}–{hi})."
                         for key, (lo, hi) in ranges.items() if not lo <= getattr(features, key) <= hi],
            "notice": "Simulation risk score, not a calibrated failure probability or railway safety approval."}


@app.post("/api/v1/ai/plan", response_model=PlanResult)
def plan():
    if os.getenv("MODE") != "demo":
        raise HTTPException(503, "Batch planner requires explicit MODE=demo until dataset assumptions are validated.")
    from ai_engine.solver import run_optimization, get_db_connection
    lock = None
    try:
        # Serialize the original whole-schedule replacement across service processes.
        lock = get_db_connection()
        with lock.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(26027)")
            if not cur.fetchone()[0]:
                raise HTTPException(409, "An AI batch plan is already running. Retry after it completes.")
        result = run_optimization()
        if result["status"] != "SUCCESS":
            raise HTTPException(422, "Optimizer found no feasible solution; no substitute plan generated.")
        return {**result, "engine": "root/ai_engine", "mode": "demo",
                "safety_status": "REQUIRES_APPROVAL", "contract_version": 1,
                "limitations": ["Synthetic October 2026 defect and COA dataset; not live railway feeds.",
                    "Existing section mapping, default measurements and fusion policy require DS validation.",
                    "Proposals only. No physical block, isolation or train-control action is performed.",
                    "Batch proposals are separate from the manual timetable simulation ledger."]}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Root optimization failed")
        raise HTTPException(503, "Root optimization or data storage failed; no substitute plan generated.")
    finally:
        if lock is not None:
            lock.close()

