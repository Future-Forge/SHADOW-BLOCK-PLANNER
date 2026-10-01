"""
GQ Block Planner (Shadow Block) backend package.
Exports FastAPI app so both `uvicorn app:app` and `uvicorn app.main:app` resolve reliably.
"""
from .main import app

__all__ = ["app"]
