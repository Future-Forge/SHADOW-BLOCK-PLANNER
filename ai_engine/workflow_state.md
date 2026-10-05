# AI Engine State & Handoff
**Owner:** Lead AI & Data Science Engineer  
**Target Consumer:** Backend Developer (Node.js/BFF) & Frontend UI Team  
**Updated:** 2026-10-01 22:46 IST  

## System Status: ALL PHASES (Tasks 1–15) 100% COMPLETE & PRODUCTION-READY

### Architecture & Module Layout
```
Shadow-Blockplanner AI & Data Platform
├── ai_engine/
│   ├── models/defect_criticality_xgb.json   <-- Serialized XGBoost Booster (R2 = 0.9647)
│   ├── xgboost_scorer.py                   <-- ML Criticality Scoring Engine
│   ├── weather_engine.py                   <-- Live Weather & Rail Physics Engine
│   ├── safety_matrix.py                    <-- Edge-Case Safety, Interlocking & Overrun Recovery
│   ├── solver.py                           <-- Google OR-Tools MILP Mega Block Optimizer
│   ├── reoptimizer.py                      <-- Sub-Second Localized Dynamic Re-Optimizer
│   ├── chatbot_engine.py                   <-- Action-Oriented NLP Command Engine
│   ├── analytics_engine.py                 <-- KPI Analytics & Savings Pipeline
│   ├── websocket_manager.py                <-- Real-Time WebSocket Pub/Sub Stream Manager
│   ├── run_worker.py                       <-- Background Redis Event Worker Entrypoint
│   └── main.py                             <-- FastAPI Application (Port 8000)
├── tests/
│   ├── test_stress_benchmarks.py           <-- Automated Stress & Concurrency Benchmarks
│   ├── test_safety_and_nlp.py              <-- Safety Matrix, NLP Command & HITL Test Suite
│   └── benchmark_results.json              <-- Verified Latency Logs & Metrics
├── Dockerfile                              <-- Production Container Spec (Python 3.11)
└── docker-compose.yml                      <-- 4-Service Stack (Postgres, Redis, API, Worker)
```

---

## Phase 4 Additions & Guardrails

### 1. Action-Oriented NLP Command Engine ([`ai_engine/chatbot_engine.py`](file:///C:/Users/Pavankumar/Documents/Shadow-blockplanner/ai_engine/chatbot_engine.py))
- **Intent Parsing Accuracy:** **100.00% (16/16 test prompts passed)** in unit tests.
- **Operational Command Handlers:**
  - `COMMAND_RESCHEDULE`: Shifts block possessions with automatic timetable conflict validation.
  - `COMMAND_REROUTE`: Generates loop-line diversion dispatch orders for mainline block possessions.
  - `COMMAND_OVERRUN_MITIGATION`: In-flight overrun detection with freight siding regulation to prevent secondary deadlocks.
  - `COMMAND_EMERGENCY_BLOCK`: Sub-second emergency track possession allocation.
  - `QUERY_WEATHER_AND_RAIL_PHYSICS`: Real-time rail stress, solar heating, and TSR calculations.

### 2. Edge-Case Safety Engine & Interlocking Safeguards ([`ai_engine/safety_matrix.py`](file:///C:/Users/Pavankumar/Documents/Shadow-blockplanner/ai_engine/safety_matrix.py))
- **Microclimate TSR:** Enforces speed limits (PSR/TSR down to 30-50 km/h) when $T_{rail} > 55^\circ\text{C}$ and computes transit inflation.
- **Multi-Department Interlocking:** Enforces 25kV OHE power block permits (`PTW-OHE-25KV`) and signal disconnection clamping notices (`SDN-SMMS-POINT-CLAMP`).
- **Overrun Recovery:** Computes passenger green-corridor priority and freight holding dispatch orders.

### 3. Human-in-the-Loop (HITL) Two-Phase Commit Lock
- **Phase 1 (`PROPOSED_CHANGE`)**: AI generates mutation proposal with unique ID (e.g. `PROP-RESCHED-xxx`) and broadcasts via WebSocket.
- **Phase 2 (`COMMIT_HANDSHAKE`)**: Section Controller / Station Master reviews and approves via `POST /api/v1/hitl/commit`.
- **Finalization**: Writes approved block to PostgreSQL, updates Redis cache, and broadcasts `COMMIT_HANDSHAKE_FINALIZED`.

---

## Complete API Surface (FastAPI on Port 8000)

| Method | Endpoint | Description | Production SLA |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | PostgreSQL, Redis, and Worker health check | `< 5 ms` |
| `POST` | `/api/v1/optimize-blocks` | Full OR-Tools Mega Block MILP optimizer | `~ 1.8 s` |
| `GET` | `/api/v1/blocks` | Fast schedule retrieval from Redis cache | `< 5 ms` |
| `GET` | `/api/v1/analytics/kpis` | Executive KPIs, delay minutes saved, and savings charts | `< 10 ms` |
| `POST` | `/api/v1/predict-criticality` | XGBoost defect criticality inference | `< 8 ms` |
| `GET` | `/api/v1/weather-risk` | Live corridor rail temperature & buckling risk | `< 5 ms` |
| `POST` | `/api/v1/ai-query` | Action-oriented NLP command & query interface | `< 15 ms` |
| `POST` | `/api/v1/emergency-reoptimize` | Sub-second section-wise emergency re-optimization | `< 150 ms` |
| `GET` | `/api/v1/hitl/pending-proposals` | List all uncommitted proposals awaiting Controller approval | `< 5 ms` |
| `POST` | `/api/v1/hitl/commit` | Two-phase commit handshake (APPROVED / REJECTED) | `< 20 ms` |
| `WS` | `/ws/live-updates` | Real-time WebSocket stream for re-optimization & alerts | `< 30 ms` |
| `GET` | `/docs` | Interactive Swagger API documentation | `< 5 ms` |

---

## Test Verification Summary
- **Pytest Results:** **9/9 Tests Passed (100%)**
  - `tests/test_safety_and_nlp.py`: 5/5 Passed
  - `tests/test_stress_benchmarks.py`: 4/4 Passed

---

## 2026-10-03 Update: Planner Application Integration

This entry records the latest planner application changes. All earlier handoff
content above is retained as historical context. The integration described here
runs in `backend/app` and does not replace the standalone `ai_engine/main.py`
PostgreSQL/Redis service. Earlier production-readiness and latency claims have
not been independently reverified for this application integration.

### AI inference and assistant workflow

- Added `backend/app/ai_engine/inference.py`, `domain.py`, and `assistant.py`,
  plus the supplied `models/defect_criticality_xgb.json` artifact. The application
  loads the actual 150-tree XGBoost regressor; it does not train on startup or
  fabricate fallback scores. Backend dependencies now include XGBoost 3.1.3
  and NumPy 2.x.
- Defect scoring requires age, ambient temperature, tonnage, speed restriction,
  and department. Missing measurements trigger clarification; invalid inputs
  are rejected and values outside the companion training ranges are flagged.
- Added thermal scenario calculations and department-specific safety checklists.
  These use supplied model assumptions, not live weather observations or
  verified railway permissions. Risk scores are not calibrated probabilities.
- Added `GET /api/v1/chat/engine` and POST endpoints
  `/api/v1/chat/predict-criticality`, `/api/v1/chat/thermal-risk`, and
  `/api/v1/chat/safety-checklist`. The dispatcher accepts up to 12 conversation
  turns and validates simulation time.
- Dispatcher planning requests require explicit section, department, priority,
  duration, and start time. Analysis uses the existing planner; saving requires
  an explicit user action. Rerouting, rescheduling, and overrun requests explain
  unsupported execution capabilities and require controller review.
- Reworked the assistant UI with structured results, source disclosures,
  model status, session history, retryable connection states, and an expandable
  panel. Detailed integration notes are in
  [`docs/AI_ENGINE_INTEGRATION.md`](../docs/AI_ENGINE_INTEGRATION.md).

### Map, workspace, and timetable updates

- Updated the main workspace and map styling, block inspection, planning lab,
  active-block dialog, sidebar, and simulation state handling.
- Added `/api/v1/trains/snapshot`, including simulation-source labeling,
  corridor counts, and a complete corridor-filtered train list without a
  display-count cap.
- Added map camera fitting and block-path presentation helpers, train-marker
  grouping, dialog focus handling, and a map error boundary.
- The current application schema no longer exposes the former corridor
  telemetry routes/fields. Frontend API contracts were updated with the map
  implementation. Existing planning and operation-storage modules are retained.

### Verification on 2026-10-03

- Backend: `python -m pytest backend/tests -q` with `PYTHONPATH=backend`:
  **36 passed, 10 failed** out of 46 tests. Failures are in the existing
  `backend/tests/test_gemini_agent.py` suite, whose expected dispatcher behavior
  differs from the replacement assistant. They cover live-train and delay
  queries, incomplete block/emergency commands, train telemetry, resequencing,
  station/corridor information, and MILP explanations. These compatibility
  failures remain unresolved; this update does not claim a green backend suite.
- Frontend: `npm run test`: **16 passed** (camera fitting and map presentation).
- Frontend: `npm run build`: **passed**, with a bundle-size warning. Frontend
  checks ran against the local application source copied into this checkout,
  using its installed dependencies.
- Preserved the repository's existing CI workflows and intact documentation;
  older local copies included null-filled files and disabled test steps.
- Virtual environments, installed packages, local secrets, backups, generated
  build output, and runtime SQLite files are excluded from the commit.

## Integration update (2026-10-05)
Default deployment now uses `ai_engine.service:app`; original algorithms remain here. See [runtime map](../docs/AI_ENGINE_RUNTIME_MAP.md) and [handoff](../docs/HANDOFF_AI_INTEGRATION.md). Legacy main/worker are retained but not deployed by default.

## Folder clarification follow-up
Backend helpers were renamed to `backend/app/ai_adapters/`; imports and tests follow that name. This root folder remains the only AI engine and must be retained in downloads. See README.md in each folder.
