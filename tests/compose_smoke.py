"""Run on the host after docker compose up. No mocked stores or AI calls."""
import json
import subprocess
import urllib.request

BASE = "http://127.0.0.1:5173"


def call(path, data=None):
    request = urllib.request.Request(BASE + "/api-proxy" + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


assert urllib.request.urlopen(BASE).status == 200
assert call("/api/v1/health")["status"] == "ok"
assert call("/api/v1/ai/ready")["status"] == "ready"
score = call("/api/v1/chat/predict-criticality", {
    "defect_age_days": 10, "ambient_temp_c": 44, "track_tonnage_mgt": 85,
    "speed_restriction_kmh": 45, "department_type": "TMS"})
assert score["engine"] == "root/ai_engine" and abs(score["criticality_score"] - 78.39) < .01
result = call("/api/v1/ai/plan", {})
assert result["engine"] == "root/ai_engine"
assert result["solver_status"] in ("OPTIMAL", "FEASIBLE")
assert result["safety_status"] == "REQUIRES_APPROVAL"
assert result["blocks"] and result["summary"]["total_defects_evaluated"] > 0
assert any(b["shadow_departments"] for b in result["blocks"])
stored = subprocess.check_output(["docker", "compose", "exec", "-T", "postgres",
    "psql", "-U", "postgres", "-d", "shadow_blockplanner", "-tAc",
    "SELECT count(*) FROM scheduled_blocks"], text=True)
assert int(stored.strip()) == len(result["blocks"])
cached = subprocess.check_output(["docker", "compose", "exec", "-T", "redis",
    "redis-cli", "--raw", "GET", "latest_optimized_schedule"], text=True)
assert json.loads(cached)["blocks"] == result["blocks"]
# Re-running initialization must preserve plans and existing records.
subprocess.check_call(["docker", "compose", "run", "--rm", "db-init"])
after = subprocess.check_output(["docker", "compose", "exec", "-T", "postgres",
    "psql", "-U", "postgres", "-d", "shadow_blockplanner", "-tAc",
    "SELECT count(*) FROM scheduled_blocks"], text=True)
assert after == stored
print("PASS: frontend proxy -> app -> root XGBoost/OR-Tools -> PostgreSQL + Redis -> response")
print(json.dumps(result["summary"], indent=2))
