import os
import sys
import json
from pathlib import Path
import pytest
import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")

from ai_engine.chatbot_engine import query_rail_ai, get_chatbot
from ai_engine.safety_matrix import get_safety_engine

API_BASE_URL = "http://127.0.0.1:8000"

def test_nlp_command_intent_parsing_accuracy():
    """
    Test 1: NLP Command Parsing Accuracy across 16 diverse operational railway prompts.
    Asserts >= 95% accuracy.
    """
    test_cases = [
        # Reschedule commands
        {"query": "Shift S&T block at Km 142 by 30 minutes", "expected_intent": "COMMAND_RESCHEDULE", "action_type": "MUTATION_PROPOSAL"},
        {"query": "Delay TMS block on SUR-PUNE by 45 mins", "expected_intent": "COMMAND_RESCHEDULE", "action_type": "MUTATION_PROPOSAL"},
        {"query": "Move electrical OHE block on Delhi-Mumbai by 1 hour", "expected_intent": "COMMAND_RESCHEDULE", "action_type": "MUTATION_PROPOSAL"},
        {"query": "Reschedule block #15 by 20 minutes", "expected_intent": "COMMAND_RESCHEDULE", "action_type": "MUTATION_PROPOSAL"},
        {"query": "Postpone track possession on KOTA-RMA by 60 mins", "expected_intent": "COMMAND_RESCHEDULE", "action_type": "MUTATION_PROPOSAL"},
        
        # Reroute commands
        {"query": "Reroute Train 12301 via loop line due to rail defect", "expected_intent": "COMMAND_REROUTE", "action_type": "MUTATION_PROPOSAL"},
        {"query": "Divert freight G-924 to loop line on SUR-PUNE", "expected_intent": "COMMAND_REROUTE", "action_type": "MUTATION_PROPOSAL"},
        {"query": "Reroute express train 18176 to loop line", "expected_intent": "COMMAND_REROUTE", "action_type": "MUTATION_PROPOSAL"},

        # Overrun mitigation commands
        {"query": "Block 12 is overrunning by 45 minutes on SUR-PUNE", "expected_intent": "COMMAND_OVERRUN_MITIGATION", "action_type": "MUTATION_PROPOSAL"},
        {"query": "Maintenance block exceeded duration by 30 minutes", "expected_intent": "COMMAND_OVERRUN_MITIGATION", "action_type": "MUTATION_PROPOSAL"},

        # Emergency block commands
        {"query": "Declare emergency block on KOTA-RMA for weld fracture", "expected_intent": "COMMAND_EMERGENCY_BLOCK", "action_type": "MUTATION_PROPOSAL"},
        {"query": "Urgent block required on Delhi-Howrah for rail fracture", "expected_intent": "COMMAND_EMERGENCY_BLOCK", "action_type": "MUTATION_PROPOSAL"},

        # Physics & Weather queries
        {"query": "What is the rail stress level between Kanpur and Prayagraj?", "expected_intent": "QUERY_WEATHER_AND_RAIL_PHYSICS", "action_type": "READ_ONLY"},
        {"query": "Check track temperature on Delhi-Mumbai corridor", "expected_intent": "QUERY_WEATHER_AND_RAIL_PHYSICS", "action_type": "READ_ONLY"},

        # Savings & Protection queries
        {"query": "How many shadow hours have been saved across the system?", "expected_intent": "QUERY_SHADOW_SAVINGS", "action_type": "READ_ONLY"},
        {"query": "Are there any conflicts with Rajdhani passenger trains?", "expected_intent": "QUERY_TRAIN_CONFLICTS", "action_type": "READ_ONLY"}
    ]

    correct = 0
    total = len(test_cases)

    for tc in test_cases:
        res = query_rail_ai(tc["query"])
        intent_match = res["intent"] == tc["expected_intent"]
        action_match = res["action_type"] == tc["action_type"]
        if intent_match and action_match:
            correct += 1
        else:
            print(f"FAILED TC: {tc['query']} -> Got {res['intent']} ({res['action_type']}), Expected {tc['expected_intent']} ({tc['action_type']})")

    accuracy = (correct / total) * 100.0
    print(f"\n[NLP TEST] Command Parsing Accuracy: {accuracy:.2f}% ({correct}/{total} passed)")
    assert accuracy >= 95.0, f"Accuracy {accuracy}% below 95% threshold"

def test_safety_matrix_microclimate_tsr():
    """
    Test 2: Edge-case Microclimate TSR evaluation and transit time inflation.
    """
    safety = get_safety_engine()
    
    # Test high heat (rail temp > 55C)
    res_high_heat = safety.evaluate_microclimate_tsr(ambient_temp_c=44.0, corridor="Delhi-Mumbai", section="SUR-PUNE")
    assert res_high_heat["tsr_imposed"] is True
    assert res_high_heat["imposed_speed_kmh"] <= 50.0
    assert res_high_heat["transit_delay_inflation_mins"] > 0
    assert "HOT_WEATHER" in res_high_heat["safety_protocol"] or "DE-STRESSING" in res_high_heat["safety_protocol"]

    # Test nominal temp (ambient 25C -> rail ~39C)
    res_nominal = safety.evaluate_microclimate_tsr(ambient_temp_c=25.0, corridor="Delhi-Mumbai", section="SUR-PUNE")
    assert res_nominal["tsr_imposed"] is False
    assert res_nominal["imposed_speed_kmh"] == 130.0

def test_safety_matrix_interlocking_rules():
    """
    Test 3: Multi-department interlocking and isolation checks.
    """
    safety = get_safety_engine()
    res = safety.validate_interlocking_rules(
        primary_dept="TMS",
        shadow_depts=["SMMS", "TDMS"],
        corridor="Delhi-Mumbai",
        section="SUR-PUNE"
    )
    assert res["is_safe"] is True
    assert "PTW-OHE-25KV" in res["required_permits"]
    assert "SDN-SMMS-POINT-CLAMP" in res["required_permits"]
    assert len(res["safety_checklist"]) >= 4

def test_safety_matrix_overrun_mitigation():
    """
    Test 4: In-flight overrun recovery and zero deadlock prevention.
    """
    safety = get_safety_engine()
    affected_trains = [
        {"train_number": "12301", "train_type": "PREMIUM_PASSENGER", "scheduled_entry": "2026-10-01 10:00:00"},
        {"train_number": "G-988", "train_type": "FREIGHT_COAL", "scheduled_entry": "2026-10-01 10:15:00"}
    ]
    mitigation = safety.compute_overrun_mitigation(
        block_plan_id=101,
        corridor="Delhi-Mumbai",
        section="SUR-PUNE",
        overrun_minutes=40,
        affected_trains=affected_trains
    )
    assert mitigation["status"] == "MITIGATION_PLAN_GENERATED"
    assert mitigation["deadlock_risk"] == "ZERO_DEADLOCK_PREVENTED"
    assert len(mitigation["dispatch_orders"]) == 2
    # Verify freight is diverted/held
    freight_action = next(a for a in mitigation["dispatch_orders"] if a["train_number"] == "G-988")
    assert freight_action["action"] == "LOOP_LINE_REGULATION"

def test_two_phase_commit_hitl_workflow():
    """
    Test 5: Two-Phase Commit HITL workflow via REST API:
    1. Issue NLP reschedule query -> Receive PROPOSAL_ID.
    2. Check pending proposals endpoint.
    3. Issue Controller COMMIT_HANDSHAKE -> Verify PostgreSQL commit & finalization.
    """
    # Step 1: Generate Proposal via NLP command
    r_nlp = requests.post(
        f"{API_BASE_URL}/api/v1/ai-query",
        json={"query": "Shift S&T block at Km 142 by 30 minutes"}
    )
    assert r_nlp.status_code == 200
    nlp_data = r_nlp.json()
    assert nlp_data["action_type"] == "MUTATION_PROPOSAL"
    proposal = nlp_data["executable_payload"]
    proposal_id = proposal["proposal_id"]
    assert proposal_id.startswith("PROP-RESCHED-")

    # Step 2: Query pending proposals
    r_pending = requests.get(f"{API_BASE_URL}/api/v1/hitl/pending-proposals")
    assert r_pending.status_code == 200
    pending_list = r_pending.json()["proposals"]
    assert any(p["proposal_id"] == proposal_id for p in pending_list)

    # Step 3: Controller Commit Handshake (APPROVED)
    r_commit = requests.post(
        f"{API_BASE_URL}/api/v1/hitl/commit",
        json={
            "proposal_id": proposal_id,
            "controller_id": "SM-NDLS-01",
            "decision": "APPROVED",
            "remarks": "Approved 30-minute block shift for S&T maintenance"
        }
    )
    assert r_commit.status_code == 200
    commit_data = r_commit.json()
    assert commit_data["status"] == "COMMITTED"
    assert commit_data["decision"] == "APPROVED"
    assert commit_data["block_plan_id"] is not None

if __name__ == "__main__":
    test_nlp_command_intent_parsing_accuracy()
    test_safety_matrix_microclimate_tsr()
    test_safety_matrix_interlocking_rules()
    test_safety_matrix_overrun_mitigation()
    test_two_phase_commit_hitl_workflow()
    print("\nAll Safety, NLP, and HITL unit tests passed successfully!")
