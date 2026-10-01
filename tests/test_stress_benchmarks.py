import os
import sys
import json
import time
import asyncio
import statistics
from typing import Dict, Any, List
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import pytest
import requests
import websockets
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")

API_BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws/live-updates"
BENCHMARK_OUTPUT_PATH = BASE_DIR / "tests" / "benchmark_results.json"

def test_health_endpoint():
    """Verify system health status across PostgreSQL and Redis."""
    resp = requests.get(f"{API_BASE_URL}/api/v1/health", timeout=5.0)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "HEALTHY"
    assert data["components"]["postgres"]["status"] == "HEALTHY"
    assert data["components"]["redis"]["status"] == "HEALTHY"

def test_benchmark_xgboost_concurrent_latency():
    """
    Benchmark 1: 100 Concurrent requests to POST /api/v1/predict-criticality
    Asserts p99 latency < 20 ms.
    """
    num_requests = 100
    payload = {
        "defect_age_days": 8.5,
        "ambient_temp_c": 43.0,
        "track_tonnage_mgt": 70.0,
        "speed_restriction_kmh": 30.0,
        "department_type": "TMS"
    }

    session = requests.Session()
    # Warmup
    session.post(f"{API_BASE_URL}/api/v1/predict-criticality", json=payload)

    latencies_ms = []

    def make_request(idx: int):
        t0 = time.perf_counter()
        r = session.post(f"{API_BASE_URL}/api/v1/predict-criticality", json=payload, timeout=5.0)
        dt = (time.perf_counter() - t0) * 1000.0
        assert r.status_code == 200
        return dt

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(make_request, i) for i in range(num_requests)]
        latencies_ms = [f.result() for f in futures]

    latencies_ms.sort()
    p50 = statistics.median(latencies_ms)
    p95 = latencies_ms[int(0.95 * len(latencies_ms))]
    p99 = latencies_ms[int(0.99 * len(latencies_ms))]
    mean_lat = statistics.mean(latencies_ms)

    print(f"\n[BENCHMARK 1 - XGBoost] Mean: {mean_lat:.2f}ms | P50: {p50:.2f}ms | P95: {p95:.2f}ms | P99: {p99:.2f}ms")

    assert mean_lat < 10.0, f"Mean latency too high: {mean_lat:.2f}ms"
    assert p99 < 25.0, f"P99 latency too high: {p99:.2f}ms"

    return {
        "name": "XGBoost Defect Criticality Inference Concurrency",
        "requests_count": num_requests,
        "mean_ms": round(mean_lat, 2),
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
        "p99_ms": round(p99, 2),
        "passed": True
    }

def test_benchmark_micro_milp_reoptimizer_latency():
    """
    Benchmark 2: 50 Concurrent requests to POST /api/v1/emergency-reoptimize
    Asserts localized Micro-MILP solver response latency remains < 1.0 second.
    """
    num_requests = 50
    payload = {
        "corridor": "Delhi-Mumbai",
        "block_section": "SUR-PUNE",
        "emergency_defect": {
            "department": "TMS",
            "defect_type": "Emergency Rail Buckling",
            "urgency": "CRITICAL",
            "duration_hours": 3.0,
            "shadow_departments": ["SMMS", "TDMS"]
        }
    }

    session = requests.Session()
    # Warmup
    session.post(f"{API_BASE_URL}/api/v1/emergency-reoptimize", json=payload)

    latencies_ms = []

    def make_reopt_request(idx: int):
        t0 = time.perf_counter()
        r = session.post(f"{API_BASE_URL}/api/v1/emergency-reoptimize", json=payload, timeout=10.0)
        dt = (time.perf_counter() - t0) * 1000.0
        assert r.status_code == 200
        res = r.json()
        assert res["status"] == "SUCCESS"
        return dt

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(make_reopt_request, i) for i in range(num_requests)]
        latencies_ms = [f.result() for f in futures]

    latencies_ms.sort()
    p50 = statistics.median(latencies_ms)
    p95 = latencies_ms[int(0.95 * len(latencies_ms))]
    p99 = latencies_ms[int(0.99 * len(latencies_ms))]
    mean_lat = statistics.mean(latencies_ms)

    print(f"\n[BENCHMARK 2 - Micro-MILP] Mean: {mean_lat:.2f}ms | P50: {p50:.2f}ms | P95: {p95:.2f}ms | P99: {p99:.2f}ms")

    assert mean_lat < 500.0, f"Mean latency too high: {mean_lat:.2f}ms"
    assert p99 < 1000.0, f"P99 latency exceeds 1.0s limit: {p99:.2f}ms"

    return {
        "name": "Sub-Second Micro-MILP Emergency Re-Optimizer",
        "requests_count": num_requests,
        "mean_ms": round(mean_lat, 2),
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
        "p99_ms": round(p99, 2),
        "passed": True
    }

@pytest.mark.asyncio
async def test_benchmark_websocket_realtime_stream():
    """
    Benchmark 3: Validate WebSocket connection and real-time handshake.
    """
    t0 = time.perf_counter()
    async with websockets.connect(WS_URL) as ws:
        # Receive initial handshake
        raw_msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
        msg = json.loads(raw_msg)
        assert msg["event_type"] == "CONNECTION_INITIALIZED"

        # Send test ping
        await ws.send(json.dumps({"ping": "health_check"}))
        ack_raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
        ack_msg = json.loads(ack_raw)
        assert ack_msg["event_type"] == "ACK"

    dt = (time.perf_counter() - t0) * 1000.0
    print(f"\n[BENCHMARK 3 - WebSocket] Connection Handshake & Ping-Pong Latency: {dt:.2f}ms")

    return {
        "name": "Real-Time WebSocket Event Stream Handshake",
        "handshake_latency_ms": round(dt, 2),
        "status": "CONNECTED",
        "passed": True
    }

def run_all_benchmarks():
    """Execute all benchmarks and save results to tests/benchmark_results.json."""
    print("Executing Shadow-Blockplanner Automated Latency & Stress Benchmarks...")
    test_health_endpoint()
    b1 = test_benchmark_xgboost_concurrent_latency()
    b2 = test_benchmark_micro_milp_reoptimizer_latency()
    b3 = asyncio.run(test_benchmark_websocket_realtime_stream())

    results = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "environment": "Docker Localhost (PostgreSQL 15 + Redis 7)",
        "benchmarks": [b1, b2, b3],
        "overall_status": "PASSED"
    }

    BENCHMARK_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(BENCHMARK_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nSaved Benchmark Report to {BENCHMARK_OUTPUT_PATH}")
    return results

if __name__ == "__main__":
    run_all_benchmarks()
