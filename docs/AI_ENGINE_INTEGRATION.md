> Updated integration and startup: see [repository README](../README.md) and

> Folder clarification (2026-10-05): the backend helpers now live in
> `backend/app/ai_adapters/`. The root `ai_engine/` is the sole model/optimizer
> service and is required. References to the old backend folder below describe
> the inspected baseline, not a second engine to run or copy.
> [AI integration handoff](../docs/HANDOFF_AI_INTEGRATION.md).
> The notes below describe the earlier app-only runtime and are retained for context.

# Supplied AI_ENGINE integration

Source: `C:/Users/jenil/OneDrive/Desktop/AI_ENGINE/` (read-only).

## What runs

- The supplied `models/defect_criticality_xgb.json` is bundled in
  `backend/app/ai_engine/models`. Its 150 trees are loaded by XGBoost, not replaced
  by a formula. SHA-256 of the JSON excluding trailing whitespace:
  `7ede96de12abf625e4f3affc77af80c5c5af97de81158f583e055b4a24acc248`.
- Feature order and department codes match `xgboost_scorer.py`: age in days,
  ambient temperature °C, tonnage MGT, speed restriction km/h, TMS=0/SMMS=1/TDMS=2.
  All five inputs are required. Missing inputs prompt clarification. Out-of-range
  values relative to the companion synthetic generator produce warnings.
- Thermal calculations port the solar-heating and constrained-expansion formulas
  from `weather_engine.py`. TSR scenarios follow `safety_matrix.py`'s 45/55/60°C
  thresholds. The original weather module instead uses 52°C at the middle tier;
  this discrepancy is explicit, not silently mixed. These are supplied scenario
  assumptions, not independently verified railway standards.
- Worksite checklists adapt the supplied safety matrix without its unconditional
  `INTERLOCKING_VERIFIED_SAFE` claim. Physical permits require human verification.
- The supplied chatbot's intent categories are adapted to the existing in-memory
  network and timetable. Block analysis calls the actual planner endpoint logic;
  reports use the existing operation ledger. No Redis or PostgreSQL is needed.
- Assistant save is an explicit user action, uses the configured backend once,
  and renders its returned decision. Rejected blocks cannot be committed.

## What is not represented as integrated or trained

The folder contains one trained tabular regressor, not conversational model
weights. No language-model fine-tuning occurred. Companion code generates
synthetic training samples; independent validation data supporting the handoff
document's reported R²/latency/production-readiness claims was not supplied.
Those claims are not displayed as verified performance.

The source chatbot has hardcoded default sections, train IDs, October 2026 dates,
defect counts, savings totals, zero-conflict claims and hypothetical loop lines.
These were not connected as operational facts. Its PostgreSQL/Redis-specific
optimizer, reoptimizer, worker and websocket service are not drop-in replacements
for this app's data contract. The existing planner remains in use. Rescheduling,
overrun and rerouting commands explain the missing execution/topology support
and offer analysis of a replacement window; they do not pretend to execute.

Rain/wind forecasting, live weather measurements and railway dispatch are not
provided by this model. Model risk scores are not calibrated failure probabilities.
No train is deleted. The restored planning ledger uses SQLite and reports by
operation month. Committed planning snapshots survive backend restarts.

## API

- `GET /api/v1/chat/engine`: real load status, feature names, fingerprint, limits.
- `POST /api/v1/chat/predict-criticality`: all five named features.
- `POST /api/v1/chat/thermal-risk`: ambient temperature; optional cloud cover,
  solar factor and section length. Defaults are returned as explicit assumptions.
- `POST /api/v1/chat/safety-checklist`: departments list.
- `POST /api/v1/chat/dispatcher`: message, simulation clock, up to 12 history turns.
  Local domain parsing works without a Gemini key. Only clarification follow-ups
  inherit prior user input. Source documents are data, not executable instructions.

## Assistant interface

780px-wide pinned workspace, expandable to 1120px, constrained to the viewport.
Readable message typography, a single-line composer that grows to at most 96px,
and independently scrollable full responses. Duplicate panel chrome is removed;
starter cards disappear after the first prompt and replies open at their beginning.
The panel includes
input/source disclosures, structured risk cards, affected-train tables, explicit
save review, retryable connection status, and session-scoped conversation history.
There is no fake online banner or offline-success chat response. Original map
layout remains unchanged. Opening/closing the panel does not execute requests.

## Run and verify

Install `backend/requirements.txt`; launch uvicorn with `--app-dir backend`.
Default dataset location now matches the checked-in `backend/app/data/data_files`;
`GQ_DATA_DIR` still overrides it. Install pytest/httpx for tests.

`$env:PYTHONPATH='backend'; .\venv\Scripts\python.exe -m pytest backend/tests`

`npm --prefix frontend run build`
