import os
import sys
import logging
from pathlib import Path
from typing import Dict, Any, Union, List, Optional
import numpy as np
import pandas as pd
import xgboost as xgb

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("xgboost_scorer")

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "ai_engine" / "models" / "defect_criticality_xgb.json"

DEPT_MAP = {"TMS": 0, "SMMS": 1, "TDMS": 2}
REVERSE_DEPT_MAP = {0: "TMS", 1: "SMMS", 2: "TDMS"}

FEATURE_NAMES = [
    "defect_age_days",
    "ambient_temp_c",
    "track_tonnage_mgt",
    "speed_restriction_kmh",
    "department_code"
]

def generate_training_data(n_samples: int = 5000) -> pd.DataFrame:
    """
    Generate synthetic defect parameters with railway domain physics correlations:
    - High ambient temp (>38C) drastically increases track buckling risk.
    - Higher cumulative tonnage (MGT) accelerates rail wear and fracture probability.
    - Defect age increases risk of catastrophic failure.
    - Higher speed restriction indicates high initial defect severity.
    """
    np.random.seed(42)

    defect_age = np.random.uniform(0.5, 30.0, n_samples)
    ambient_temp = np.random.uniform(10.0, 48.0, n_samples)
    tonnage_mgt = np.random.uniform(15.0, 110.0, n_samples)
    speed_restriction = np.random.choice([0.0, 15.0, 30.0, 45.0, 60.0, 75.0], size=n_samples, p=[0.3, 0.2, 0.2, 0.15, 0.1, 0.05])
    departments = np.random.choice(["TMS", "SMMS", "TDMS"], size=n_samples, p=[0.45, 0.30, 0.25])
    dept_codes = np.array([DEPT_MAP[d] for d in departments])

    # Compute target criticality score (0 - 100) using nonlinear physics equation + stochastic noise
    temp_factor = np.where(ambient_temp >= 45.0, 35.0, np.where(ambient_temp >= 38.0, 22.0, ambient_temp * 0.25))
    age_factor = np.log1p(defect_age) * 6.5
    tonnage_factor = (tonnage_mgt / 100.0) * 18.0
    speed_factor = (speed_restriction / 75.0) * 28.0
    dept_bias = np.where(dept_codes == 0, 10.0, np.where(dept_codes == 1, 6.0, 4.0))

    base_score = temp_factor + age_factor + tonnage_factor + speed_factor + dept_bias
    noise = np.random.normal(0, 2.5, n_samples)
    raw_criticality = np.clip(base_score + noise, 5.0, 99.5)

    df = pd.DataFrame({
        "defect_age_days": defect_age,
        "ambient_temp_c": ambient_temp,
        "track_tonnage_mgt": tonnage_mgt,
        "speed_restriction_kmh": speed_restriction,
        "department_code": dept_codes,
        "department_type": departments,
        "criticality_score": raw_criticality
    })
    return df

def train_criticality_model(save_path: Path = MODEL_PATH) -> xgb.Booster:
    """Train and persist the XGBoost Defect Criticality model."""
    logger.info("Generating synthetic training dataset for XGBoost defect criticality...")
    df = generate_training_data(6000)

    X = df[FEATURE_NAMES].values
    y = df["criticality_score"].values

    # Train / test split using pure numpy
    indices = np.random.permutation(len(X))
    split_idx = int(len(X) * 0.8)
    train_idx, test_idx = indices[:split_idx], indices[split_idx:]

    dtrain = xgb.DMatrix(X[train_idx], label=y[train_idx], feature_names=FEATURE_NAMES)
    dtest = xgb.DMatrix(X[test_idx], label=y[test_idx], feature_names=FEATURE_NAMES)

    params = {
        "max_depth": 4,
        "eta": 0.06,
        "subsample": 0.85,
        "colsample_bytree": 0.85,
        "objective": "reg:squarederror",
        "eval_metric": "rmse",
        "seed": 42
    }

    logger.info("Fitting XGBoost Booster model...")
    evals = [(dtrain, "train"), (dtest, "test")]
    booster = xgb.train(params, dtrain, num_boost_round=150, evals=evals, verbose_eval=False)

    y_pred = booster.predict(dtest)
    rmse = float(np.sqrt(np.mean((y[test_idx] - y_pred) ** 2)))
    ss_tot = float(np.sum((y[test_idx] - np.mean(y[test_idx])) ** 2))
    ss_res = float(np.sum((y[test_idx] - y_pred) ** 2))
    r2 = 1.0 - (ss_res / ss_tot)
    logger.info(f"Model Training Complete! Test RMSE: {rmse:.3f}, R2 Score: {r2:.4f}")

    save_path.parent.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(save_path))
    logger.info(f"Model serialized successfully to {save_path}")
    return booster

_MODEL_CACHE: Optional[xgb.Booster] = None

def get_criticality_model() -> xgb.Booster:
    """Singleton getter for loaded XGBoost model."""
    global _MODEL_CACHE
    if _MODEL_CACHE is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Required model artifact missing: {MODEL_PATH}. Runtime training is disabled.")
        else:
            booster = xgb.Booster(params={"nthread": 1})
            booster.load_model(str(MODEL_PATH))
            if booster.feature_names != FEATURE_NAMES:
                raise RuntimeError("Model feature order does not match the original scorer.")
            _MODEL_CACHE = booster
    return _MODEL_CACHE

def predict_defect_criticality(
    defect_age_days: float,
    ambient_temp_c: float,
    track_tonnage_mgt: float = 55.0,
    speed_restriction_kmh: float = 0.0,
    department_type: str = "TMS"
) -> Dict[str, Any]:
    """
    Predict defect criticality score (0.0 - 100.0) and urgency tier using XGBoost.
    """
    booster = get_criticality_model()
    dept_code = DEPT_MAP.get(department_type.upper(), 0)

    X = np.array([[
        float(defect_age_days),
        float(ambient_temp_c),
        float(track_tonnage_mgt),
        float(speed_restriction_kmh),
        int(dept_code)
    ]])
    dmat = xgb.DMatrix(X, feature_names=FEATURE_NAMES)
    score = float(np.clip(booster.predict(dmat)[0], 0.0, 100.0))

    if score >= 75.0:
        tier = "CRITICAL"
        color = "RED"
        action_time_window_hours = 12
    elif score >= 50.0:
        tier = "HIGH"
        color = "ORANGE"
        action_time_window_hours = 36
    elif score >= 30.0:
        tier = "MEDIUM"
        color = "YELLOW"
        action_time_window_hours = 72
    else:
        tier = "LOW"
        color = "GREEN"
        action_time_window_hours = 168

    return {
        "criticality_score": round(score, 2),
        "urgency_tier": tier,
        "indicator_color": color,
        "action_window_hours": action_time_window_hours,
        "features": {
            "defect_age_days": defect_age_days,
            "ambient_temp_c": ambient_temp_c,
            "track_tonnage_mgt": track_tonnage_mgt,
            "speed_restriction_kmh": speed_restriction_kmh,
            "department_type": department_type
        }
    }

def predict_batch_criticality(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Predict criticality for a batch of defects."""
    booster = get_criticality_model()
    if not records:
        return []

    X = []
    for r in records:
        dept_str = r.get("department_type") or r.get("dept") or "TMS"
        dept_code = DEPT_MAP.get(dept_str.upper(), 0)
        X.append([
            float(r.get("defect_age_days", 3.0)),
            float(r.get("ambient_temp_c", 30.0)),
            float(r.get("track_tonnage_mgt", 50.0)),
            float(r.get("speed_restriction_kmh", 0.0)),
            int(dept_code)
        ])

    dmat = xgb.DMatrix(np.array(X), feature_names=FEATURE_NAMES)
    predictions = booster.predict(dmat)
    
    results = []
    for pred, rec in zip(predictions, records):
        sc = float(np.clip(pred, 0.0, 100.0))
        tier = "CRITICAL" if sc >= 75.0 else ("HIGH" if sc >= 50.0 else ("MEDIUM" if sc >= 30.0 else "LOW"))
        results.append({
            **rec,
            "criticality_score": round(sc, 2),
            "urgency_tier": tier
        })
    return results

if __name__ == "__main__":
    train_criticality_model()
    test_sample = predict_defect_criticality(
        defect_age_days=10.5,
        ambient_temp_c=44.2,
        track_tonnage_mgt=85.0,
        speed_restriction_kmh=45.0,
        department_type="TMS"
    )
    print("\n--- Test Sample Criticality Prediction ---")
    print(test_sample)
