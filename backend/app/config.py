"""
App configuration. Keeps the data directory and a few tunables in one
place rather than scattered magic strings across endpoint modules.
"""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATA_DIR: Path = Path(os.environ.get("GQ_DATA_DIR", Path(__file__).resolve().parent / "data" / "data_files"))
    APP_TITLE: str = "GQ Block Planner (Shadow Block)"
    APP_VERSION: str = "0.1.0"
    CORS_ALLOW_ORIGINS: list[str] = ["*"]
    DEFAULT_GAP_SEARCH_RADIUS_MIN: int = 240
    EMERGENCY_SCAN_BUFFER_MIN: int = 180
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")


settings = Settings()
