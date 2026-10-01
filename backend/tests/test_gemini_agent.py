import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv('SHADOW_BLOCK_DB', str(tmp_path_factory.mktemp('dispatcher') / 'operations.sqlite3'))
        with TestClient(app) as test_client:
            yield test_client


def test_dispatcher_operational_tms_smms_query(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "What is the difference between TMS and SMMS?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["action_triggered"] == "NONE"
    assert "TMS" in data["response_text"] and "SMMS" in data["response_text"]


def test_dispatcher_mumbai_to_surat_user_query(client):
    """Verifies the exact user query: 'what trains running between mumbai central and surat'."""
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "what trains running between mumbai central and surat"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "LIVE TRAINS ON TRACK" in data["response_text"]
    assert "BCT" in data["response_text"] and "ST" in data["response_text"]
    assert data["payload"]["live_trains_count"] > 0


def test_dispatcher_mumbai_to_surat_live_on_track_query(client):
    """Verifies: 'What are the trains running on the track from Mumbai to Surat right now?'."""
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "What are the trains running on the track from Mumbai to Surat right now?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "LIVE TRAINS ON TRACK" in data["response_text"]
    assert "Vande Bharat" in data["response_text"] or "Rajdhani" in data["response_text"]


def test_dispatcher_delayed_trains_query(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "Which trains are delayed today?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "DELAY" in data["response_text"] or "delay" in data["response_text"]


def test_dispatcher_block_surat_directive(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "Block Surat for 40 mins"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["action_triggered"] == "ANALYZE_GAP"
    assert data["payload"]["duration_minutes"] == 40
    assert data["payload"]["from_station"] == "ST"


def test_dispatcher_report_directive(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "Give me the March report"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["action_triggered"] == "DOWNLOAD_CSV"
    assert "csv_data" in data["payload"]


def test_dispatcher_emergency_block_directive(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "Emergency block Surat to Mumbai Central due to OHE wire snag"},
    )
    assert response.status_code == 200
    data = response.json()
    # Occupied sections must not bypass clearance just because the AI says emergency.
    assert data['payload']['department'] == 'TDMS'
    if data['payload']['status'] == 'PENDING_REVIEW':
        assert data['action_triggered'] == 'ANALYZE_GAP'
        assert 'block_id' not in data['payload']
        assert data['payload']['planning']['blocking_reasons']
    else:
        assert data['action_triggered'] == 'EXECUTE_BLOCK'
        assert 'block_id' in data['payload']


def test_dispatcher_train_telemetry_directive(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "Inspect real-time status of Train 12953"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["action_triggered"] == "TRAIN_INSPECT"
    assert data["fly_to_target"] is not None


def test_dispatcher_resequence_directive(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "Resequence corridor traffic according to P1 hierarchy"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["action_triggered"] == "RESEQUENCE"


def test_dispatcher_station_info_query(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "tell me about Surat station"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "SURAT" in data["response_text"]


def test_dispatcher_corridor_query(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "how long is the western corridor"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "WEST" in data["response_text"] and "km" in data["response_text"]


def test_dispatcher_milp_concept_query(client):
    response = client.post(
        "/api/v1/chat/dispatcher",
        json={"message": "explain how the milp optimizer works"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "MILP" in data["response_text"]
