import hashlib
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.ai_engine.inference import MODEL_PATH, DefectFeatures, predict
from app.ai_engine.assistant import stations_in, explicit_time


@pytest.fixture(scope="module")
def client():
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("SHADOW_BLOCK_DB", ":memory:")
        with TestClient(app) as client:
            yield client


def chat(client, message, **kwargs):
    response = client.post("/api/v1/chat/dispatcher", json={"message": message, **kwargs})
    assert response.status_code == 200, response.text
    return response.json()


def test_artifact_identity_and_real_inference(client):
    assert hashlib.sha256(MODEL_PATH.read_bytes().rstrip()).hexdigest() == "7ede96de12abf625e4f3affc77af80c5c5af97de81158f583e055b4a24acc248"
    status = client.get("/api/v1/chat/engine").json()
    assert status["model"]["available"]
    assert status["model"]["trees"] == 150
    result = chat(client, "Score a TMS defect: age 10 days, temperature 44 C, tonnage 85 MGT, speed restriction 45 km/h")
    assert result["action_triggered"] == "MODEL_PREDICTION"
    assert result["payload"]["criticality_score"] == pytest.approx(78.39)
    assert result["payload"]["source"] == "SUPPLIED_XGBOOST_MODEL"


def test_model_does_not_invent_missing_measurements(client):
    result = chat(client, "Predict TMS defect criticality")
    assert result["response_text"].startswith("Please provide")
    assert "criticality_score" not in result["payload"]
    follow = chat(client, "age 10 days, temperature 44 C, tonnage 85 MGT, speed restriction 45 km/h", history=[
        {"role": "user", "content": "Predict TMS defect criticality"},
        {"role": "assistant", "content": result["response_text"]}])
    assert follow["action_triggered"] == "MODEL_PREDICTION"


@pytest.mark.parametrize("field,value", [("defect_age_days", -1), ("ambient_temp_c", 100), ("department_type", "UNKNOWN")])
def test_model_input_validation(client, field, value):
    values = {"defect_age_days": 10, "ambient_temp_c": 44, "track_tonnage_mgt": 85, "speed_restriction_kmh": 45, "department_type": "TMS"}
    values[field] = value
    assert client.post("/api/v1/chat/predict-criticality", json=values).status_code == 422


def test_out_of_training_range_is_disclosed():
    result = predict(DefectFeatures(defect_age_days=300, ambient_temp_c=44, track_tonnage_mgt=85, speed_restriction_kmh=45, department_type="TMS"))
    assert result["warnings"]


def test_thermal_is_a_scenario_not_live_weather(client):
    result = chat(client, "Calculate rail stress at 42 C with 15% cloud cover")
    assert result["action_triggered"] == "THERMAL_ANALYSIS"
    assert result["payload"]["rail_temp_c"] == 55.5
    assert result["payload"]["scenario_speed_kmh"] == 50
    assert "no speed restriction imposed" in result["payload"]["notice"]
    assert chat(client, "What is the weather at Surat?")["action_triggered"] == "NONE"


def test_safety_requires_human_verification(client):
    result = chat(client, "What permits are needed for TMS and TDMS?")
    assert result["action_triggered"] == "SAFETY_CHECKLIST"
    assert result["payload"]["status"] == "REQUIRES_CONTROLLER_VERIFICATION"
    assert len(result["payload"]["checklist"]) >= 4


def test_analysis_is_grounded_and_read_only(client):
    store = app.state.operation_store
    before = len(store.list())
    result = chat(client, "Analyze normal TMS block from Surat to Vadodara at 14:00 for 45 minutes")
    assert result["action_triggered"] == "PLAN_PROPOSAL"
    assert result["payload"]["request"]["from_station"] == "ST"
    assert result["payload"]["request"]["to_station"] == "BRC"
    assert result["payload"]["decision"]["block_geometry"]
    assert len(store.list()) == before


def test_no_demo_reroutes_or_fake_train_locations(client):
    result = chat(client, "Reroute train 12301 via loop line")
    assert result["action_triggered"] == "REVIEW_REQUIRED"
    assert "Nothing has been changed" in result["response_text"]
    unknown = chat(client, "Inspect train 999999")
    assert unknown["fly_to_target"] is None
    assert "not in the loaded timetable" in unknown["response_text"]


def test_monthly_csv_is_preserved(client):
    result = chat(client, "Export March 2026 report")
    assert result["action_triggered"] == "DOWNLOAD_CSV"
    assert result["payload"]["csv_data"].startswith("BlockID,Department,Corridor,From,To,StartTime,Duration,ImpactedTrains")


def test_station_aliases_and_explicit_time(client):
    assert stations_in("from MMCT to BRC", app.state.gq_bundle.network) == ["BCT", "BRC"]
    assert stations_in("from Kanpur to Prayagraj", app.state.gq_bundle.network) == ["CNB", "ALD"]
    assert explicit_time("for 45 minutes") is None
    assert explicit_time("at 14:00 for 45 minutes") == "14:00:00"
    assert explicit_time("at 2 pm") == "14:00:00"
    assert explicit_time("at 25:00") is None


def test_chat_limits(client):
    assert client.post("/api/v1/chat/dispatcher", json={"message": "hello", "sim_time": "99:00:00"}).status_code == 422
    assert client.post("/api/v1/chat/dispatcher", json={"message": "x" * 8001}).status_code == 422
