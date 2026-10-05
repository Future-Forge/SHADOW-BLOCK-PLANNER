"""Compatibility adapter to the authoritative root AI service; no local model."""
from ai_engine.contracts import DefectFeatures, CriticalityResult
from app.ai_engine.client import ai_request
from fastapi import HTTPException


def model_status():
    try:
        result = ai_request("GET", "/api/v1/ai/model")
        if result.get("engine") != "root/ai_engine" or not result.get("available"):
            raise HTTPException(502, "Invalid AI model status response.")
        return result
    except HTTPException as exc:
        return {"available": False, "name": "XGBoost defect criticality", "notice": str(exc.detail)}


def predict(features: DefectFeatures):
    return ai_request("POST", "/api/v1/ai/criticality", features.model_dump(), CriticalityResult)
