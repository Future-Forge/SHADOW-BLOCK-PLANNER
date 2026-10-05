"""Integration contracts: real root model, real OR-Tools, and honest failures."""
from unittest.mock import Mock
import pytest
import httpx
from fastapi.testclient import TestClient
from ai_engine import service, solver, xgboost_scorer
from ai_engine.contracts import CriticalityResult
from datetime import datetime

FEATURES = dict(defect_age_days=10, ambient_temp_c=44, track_tonnage_mgt=85,
                speed_restriction_kmh=45, department_type="TMS")


def test_fresh_backend_import_does_not_shadow_root_package():
    import subprocess
    import sys
    subprocess.run([sys.executable, "-c",
        "import sys; sys.path.insert(0, 'backend'); import app.main; "
        "from ai_engine import contracts; "
        "assert 'backend' not in str(contracts.__file__)"], check=True)


def test_batch_replacement_preserves_existing_approved_blocks():
    from unittest.mock import MagicMock
    engine = object.__new__(solver.BlockOptimizationEngine)
    engine.conn = MagicMock()
    cursor = engine.conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (1,)
    with pytest.raises(RuntimeError, match="controller review"):
        engine.persist_to_postgres([])
    assert not any("TRUNCATE" in str(call) for call in cursor.execute.call_args_list)
    engine.conn.commit.assert_not_called()


def test_actual_root_model_is_executed(monkeypatch):
    original = xgboost_scorer.predict_defect_criticality
    spy = Mock(wraps=original)
    monkeypatch.setattr(xgboost_scorer, "predict_defect_criticality", spy)
    with TestClient(service.app) as client:
        response = client.post("/api/v1/ai/criticality", json=FEATURES)
    assert response.status_code == 200
    assert response.json()["criticality_score"] == pytest.approx(78.39)
    assert response.json()["engine"] == "root/ai_engine"
    spy.assert_called_once_with(**FEATURES)


def test_missing_model_never_retrains(tmp_path, monkeypatch):
    monkeypatch.setattr(xgboost_scorer, "_MODEL_CACHE", None)
    monkeypatch.setattr(xgboost_scorer, "MODEL_PATH", tmp_path / "missing.json")
    training = Mock(side_effect=AssertionError("Runtime must not train"))
    monkeypatch.setattr(xgboost_scorer, "train_criticality_model", training)
    with TestClient(service.app) as client:
        assert client.post("/api/v1/ai/criticality", json=FEATURES).status_code == 503
        assert client.get("/api/v1/ai/model").status_code == 503
    training.assert_not_called()
    assert not (tmp_path / "missing.json").exists()


def test_plan_requires_explicit_demo_mode(monkeypatch):
    monkeypatch.delenv("MODE", raising=False)
    with TestClient(service.app) as client:
        assert client.post("/api/v1/ai/plan").status_code == 503
        assert client.get("/health").status_code == 200


def test_real_root_solver_with_small_fixture(monkeypatch):
    # Fake storage only: root fusion, original scoring and actual OR-Tools execute.
    monkeypatch.setattr(solver, "get_db_connection", Mock())
    monkeypatch.setattr(solver, "get_redis_client", Mock())
    engine = solver.BlockOptimizationEngine()
    dataset = {"tms": [dict(defect_id="T1", gq_corridor="Delhi-Mumbai",
        block_section="NDLS-MTJ", ambient_temp_c=30, defect_type="Track defect",
        urgency_level="HIGH", required_block_hours=1,
        logged_timestamp=datetime(2026, 10, 1, 6))], "smms": [], "tdms": [], "coa": []}
    monkeypatch.setattr(engine, "fetch_data", lambda: dataset)
    persisted = Mock()
    monkeypatch.setattr(engine, "persist_to_postgres", persisted)
    spy = Mock(wraps=solver.predict_defect_criticality)
    monkeypatch.setattr(solver, "predict_defect_criticality", spy)
    result = engine.solve_optimization()
    assert result["solver_status"] in ("OPTIMAL", "FEASIBLE")
    assert result["summary"]["total_defects_evaluated"] == 1
    assert result["blocks"]
    assert all(b["status"] == "PROPOSED" for b in result["blocks"])
    assert spy.call_count == 1
    persisted.assert_called_once()


@pytest.mark.parametrize("failure,expected", [
    (httpx.ConnectError("offline"), 503),
    (httpx.ReadTimeout("timeout"), 504),
    (httpx.Response(200, json={"not": "a score"}), 502),
    (httpx.Response(500, json={"detail": "failure"}), 502),
])
def test_backend_does_not_fabricate_ai_results(monkeypatch, failure, expected):
    from app.ai_adapters import client as adapter
    mock = Mock()
    mock.__enter__ = Mock(return_value=mock)
    mock.__exit__ = Mock(return_value=False)
    if isinstance(failure, Exception):
        mock.request.side_effect = failure
    else:
        mock.request.return_value = failure
    monkeypatch.setattr(adapter.httpx, "Client", lambda **kwargs: mock)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        adapter.ai_request("POST", "/api/v1/ai/criticality", FEATURES, CriticalityResult)
    assert exc.value.status_code == expected
