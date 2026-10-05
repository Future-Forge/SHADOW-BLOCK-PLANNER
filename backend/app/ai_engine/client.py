"""Bounded internal HTTP calls; never substitute locally generated AI results."""
import os
import httpx
from fastapi import HTTPException


def ai_request(method, path, payload=None, response_model=None):
    url = os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")
    try:
        with httpx.Client(timeout=httpx.Timeout(60, connect=3)) as client:
            response = client.request(method, url + path, json=payload)
        if response.status_code >= 400:
            code = response.status_code if response.status_code in (409, 422, 503) else 502
            raise HTTPException(code, "AI service could not complete the request. Check its readiness and logs; no fallback result generated.")
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError("Expected object")
        if response_model:
            result = response_model.model_validate(result).model_dump(mode="json")
        return result
    except httpx.TimeoutException:
        raise HTTPException(504, "AI service timed out. A batch job may still finish; check its result before retrying.")
    except httpx.RequestError:
        raise HTTPException(503, "AI service unavailable. Start the AI service; no fallback result generated.")
    except ValueError:
        raise HTTPException(502, "AI service returned an invalid result; no fallback result generated.")

