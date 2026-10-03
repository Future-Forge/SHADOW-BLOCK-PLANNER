"""Adapted from the supplied xgboost_scorer.py; never trains on API startup."""
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MODEL_PATH = Path(__file__).parent / "models" / "defect_criticality_xgb.json"
FEATURES = ["defect_age_days", "ambient_temp_c", "track_tonnage_mgt", "speed_restriction_kmh", "department_code"]
DEPARTMENTS = {"TMS": 0, "SMMS": 1, "TDMS": 2}


class DefectFeatures(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    defect_age_days: float = Field(ge=0, le=3650)
    ambient_temp_c: float = Field(ge=-50, le=70)
    track_tonnage_mgt: float = Field(ge=0, le=1000)
    speed_restriction_kmh: float = Field(ge=0, le=200)
    department_type: Literal["TMS", "SMMS", "TDMS"]


@lru_cache(maxsize=1)
def get_model():
    import xgboost as xgb
    model = xgb.Booster(params={"nthread": 1})
    model.load_model(MODEL_PATH)
    if model.feature_names != FEATURES:
        raise RuntimeError("Model feature order does not match the supplied scorer.")
    return model


def model_status():
    try:
        model = get_model()
        return {"available": True, "name": "XGBoost defect criticality", "trees": model.num_boosted_rounds(),
                "sha256": sha256(MODEL_PATH.read_bytes().rstrip()).hexdigest(), "features": FEATURES,
                "training_source": "Supplied artifact; companion scorer generates synthetic training data. Independent real-world validation not supplied."}
    except Exception as exc:
        return {"available": False, "name": "XGBoost defect criticality", "error": type(exc).__name__,
                "notice": "Model unavailable; predictions are not fabricated or replaced by retraining."}


def predict(features: DefectFeatures):
    import numpy as np
    import xgboost as xgb
    matrix = xgb.DMatrix(np.array([[features.defect_age_days, features.ambient_temp_c,
        features.track_tonnage_mgt, features.speed_restriction_kmh, DEPARTMENTS[features.department_type]]]), feature_names=FEATURES)
    score = float(np.clip(get_model().predict(matrix)[0], 0, 100))
    tier, hours = ("CRITICAL", 12) if score >= 75 else ("HIGH", 36) if score >= 50 else ("MEDIUM", 72) if score >= 30 else ("LOW", 168)
    ranges = {"defect_age_days": (0.5, 30), "ambient_temp_c": (10, 48), "track_tonnage_mgt": (15, 110), "speed_restriction_kmh": (0, 75)}
    warnings = [f"{key} is outside the companion training generator's range ({lo}–{hi})." for key, (lo, hi) in ranges.items() if not lo <= getattr(features, key) <= hi]
    return {"criticality_score": round(score, 2), "urgency_tier": tier, "action_window_hours": hours,
            "features": features.model_dump(), "warnings": warnings, "source": "SUPPLIED_XGBOOST_MODEL",
            "notice": "Simulation risk score, not a calibrated failure probability or railway safety approval."}
