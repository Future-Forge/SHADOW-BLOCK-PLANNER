"""Current assistant contract, replacing obsolete auto-dispatch expectations.

The 00b277e assistant replaced the Gemini dispatcher. Queries must now clarify
missing inputs and never fabricate live telemetry or execute emergency blocks.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("SHADOW_BLOCK_DB", str(tmp_path_factory.mktemp("dispatcher") / "operations.sqlite3"))
        with TestClient(app) as test_client:
            yield test_client


def query(client, message):
    response = client.post("/api/v1/chat/dispatcher", json={"message": message})
    assert response.status_code == 200
    return response.json()


def test_knowledge_does_not_run_optimizer(client, monkeypatch):
    from ai_engine import solver
    monkeypatch.setattr(solver, "run_optimization", lambda: pytest.fail("Knowledge must not optimize"))
    data = query(client, "What is the difference between TMS and SMMS?")
    assert data["action_triggered"] == "NONE"
    assert "TMS" in data["response_text"] and "SMMS" in data["response_text"]


@pytest.mark.parametrize("message", [
    "what trains running between mumbai central and surat",
    "What are the trains running on the track from Mumbai to Surat right now?",
    "Which trains are delayed today?",
])
def test_unsupported_live_queries_never_fabricate_telemetry(client, message):
    data = query(client, message)
    assert data["action_triggered"] == "NONE"
    assert "live_trains_count" not in data["payload"]
    assert data["fly_to_target"] is None
    assert "simulation" in data["response_text"]


def test_incomplete_block_requires_clarification(client):
    before = app.state.operation_store.list()
    data = query(client, "Block Surat for 40 mins")
    assert data["action_triggered"] == "NONE"
    assert data["response_text"].startswith("Please provide")
    assert "start time" in data["response_text"]
    assert app.state.operation_store.list() == before


def test_report_is_actual_ledger_csv(client):
    data = query(client, "Give me the March report")
    assert data["action_triggered"] == "DOWNLOAD_CSV"
    assert data["payload"]["csv_data"].startswith("BlockID,Department,Corridor")


def test_emergency_never_auto_commits(client):
    before = app.state.operation_store.list()
    data = query(client, "Emergency block Surat to Mumbai Central due to OHE wire snag")
    assert data["action_triggered"] == "NONE"
    assert data["response_text"].startswith("Please provide")
    assert "duration" in data["response_text"] and "start time" in data["response_text"]
    assert "department" not in data["response_text"]  # OHE was classified as TDMS.
    assert app.state.operation_store.list() == before


def test_inspection_does_not_invent_a_position(client):
    data = query(client, "Inspect real-time status of Train 12953")
    if data["action_triggered"] == "TRAIN_INSPECT":
        assert data["fly_to_target"] is not None
        assert "not live GPS" in data["response_text"]
    else:
        assert data["action_triggered"] == "NONE"
        assert data["fly_to_target"] is None
        assert "no modelled position" in data["response_text"] or "not in the loaded timetable" in data["response_text"]


def test_resequence_requires_review(client):
    data = query(client, "Resequence corridor traffic according to P1 hierarchy")
    assert data["action_triggered"] == "REVIEW_REQUIRED"
    assert "Nothing has been changed" in data["response_text"]
