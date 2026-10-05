# AI duplication matrix

Baseline inspection precedes implementation. Keep root `ai_engine`, `data`, and
`database` in place; no bulk folder move is appropriate.

| Backend file | Purpose / callers / APIs | Root overlap | Decision |
|---|---|---|---|
| `__init__.py` | Package marker | None | Retain; label adapters |
| `inference.py` | Validation/model loading; imported by assistant and chat endpoints; `/chat/predict-criticality`, `/chat/engine`, `/chat/dispatcher` | `xgboost_scorer.py` feature order, inference, tiers | Replace local inference with HTTP adapter; keep public backend validation and warning fields |
| `models/defect_criticality_xgb.json` | Loaded only by inference; same JSON as root apart from trailing newline | Exact model duplicate | Remove copied artifact after redirecting caller; root artifact is authoritative |
| `assistant.py` | Local intent parser and app orchestration; `/chat/dispatcher` | `chatbot_engine.py` intent taxonomy | Retain app adapter: it knows current timetable, UI response and simulation ledger; do not expose legacy chatbot's invented locations/results |
| `domain.py` | Validated thermal scenarios and human safety checklists; chat endpoints and assistant | `weather_engine.py`, `safety_matrix.py` | Retain documented scenario policy; root weather uses a 52 C threshold while backend safety scenario uses 55 C. Consolidation requires DS agreement; do not silently change thresholds |

| Capability | Current backend | Original root engine | Integration decision |
|---|---|---|---|
| Criticality / XGBoost | Copied scorer/model | Trained artifact, scorer | All app scoring goes through service to root scorer |
| Planning / OR-Tools | `core/planning_service.py` timetable simulation; `gq_optimizer.py` PuLP | `solver.py` batch MILP + fusion | Expose root batch planning in Planning Lab with its own explicit dataset scope; preserve manual planner contract |
| Emergency | `emergency_dispatcher.py`, legacy Gemini tools | `reoptimizer.py` mutates schedule | Defer consolidation; incompatible section IDs, approval ownership and immediate mutations need review |
| Weather | Scenario calculations | API weather with synthetic fallback | Preserve scenario labels; do not route synthetic weather as live measurements |
| Chat | Current app-aware assistant | Independent command API | Keep app orchestration; root legacy command API not default deployment |
| Analytics | Simulation ledger evaluation | `analytics_engine.py`, PostgreSQL/Redis | Keep separate dataset labels until IDs/data contracts are unified |
| Data | JSON timetable + SQLite operation ledger | PostgreSQL CSV imports + Redis cache | No deletion or silent cross-dataset mapping |

Root scorer previously retrained automatically if its artifact was missing. The
service must instead fail closed; explicit offline training remains available.
Existing optimizer objectives, constraints, weights and model bytes are preserved.
