"""
FastAPI application entrypoint for the GQ Block Planner (Shadow Block)
backend.

Loads the real dataset once at startup into app.state.gq_bundle, then
exposes planner/live-map/stations/chat routers. Timetable data stays in memory;
committed planning snapshots are stored in a local SQLite ledger.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

import sys
from pathlib import Path

# Ensure both parent directory and current directory are in sys.path so 'app' resolves
_cur_dir = Path(__file__).resolve().parent
_parent_dir = _cur_dir.parent
if str(_cur_dir) not in sys.path:
    sys.path.insert(0, str(_cur_dir))
if str(_parent_dir) not in sys.path:
    sys.path.insert(0, str(_parent_dir))

from app.config import settings
from app.data.pipeline import build_gq_data_bundle
from app.api.endpoints import live_map, planner, chat, stations, resources, ai
from app.core.operations_store import OperationStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load once at startup; ~3-4s for the full real dataset (~8.5k trains,
    # ~8.7k stations) based on local testing -- acceptable for a one-time
    # boot cost, not something to repeat per-request.
    app.state.gq_bundle = build_gq_data_bundle(settings.DATA_DIR)
    app.state.operation_store = OperationStore()
    # The dispatcher receives the data bundle directly, so expose the same
    # persistent operations ledger there for its report-generation tool.
    app.state.gq_bundle.operation_store = app.state.operation_store
    print(
        f"[startup] GQ data bundle loaded: "
        f"{len(app.state.gq_bundle.network.stations)} stations, "
        f"{len(app.state.gq_bundle.timetable.trains)} trains, "
        f"{len(app.state.gq_bundle.timetable._segment_index)} indexed block sections"
    )
    yield
    app.state.operation_store.close()


app = FastAPI(title=settings.APP_TITLE, version=settings.APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stations.router)
app.include_router(live_map.router)
app.include_router(planner.router)
app.include_router(chat.router)
app.include_router(resources.router)
app.include_router(ai.router)


@app.get("/api/v1/health")
def health(request: Request) -> dict:
    bundle = getattr(request.app.state, "gq_bundle", None)
    if bundle is None:
        return {"status": "starting"}
    return {
        "status": "ok",
        "stations_loaded": len(bundle.network.stations),
        "trains_loaded": len(bundle.timetable.trains),
        "indexed_block_sections": len(bundle.timetable._segment_index),
    }
