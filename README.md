# Shadow Block — SIH Railway Block Planner

Vite/React frontend + application FastAPI + internal Python AI service using the
original root XGBoost / OR-Tools implementation. PostgreSQL stores the AI input
data and batch proposals; Redis caches the latest batch result.

## Run a clean download

Install Docker Engine/Desktop with Compose v2, then from the repository root:

```sh
docker compose up --build -d
docker compose ps
```

Open **http://localhost:5173**. First startup downloads/builds dependencies and
imports the bundled demo CSVs. Use `docker compose logs db-init ai-service backend`
if startup fails. No external API key is required for this integration slice.

This is an explicit **MODE=demo** deployment using synthetic October 2026
AI datasets. It is a decision-support simulation, not an authenticated production
railway control system. Services bind only the frontend to localhost by default.
Copy `.env.example` to `.env` to override local configuration. Existing manual
planning snapshots and PostgreSQL data survive restarts in named volumes.

- **Assistant scoring:** all five defect inputs go through internal HTTP to the
  original root model. Example: "Score a TMS defect: age 10 days, temperature
  44 C, tonnage 85 MGT, speed restriction 45 km/h".
- **Planning Lab -> AI batch proposals:** invokes original root fusion/XGBoost/
  OR-Tools against PostgreSQL and displays actual proposed batch windows.
- **Plan & compare:** the existing manual timetable simulation remains separate.
  It uses app JSON timetables and the existing SQLite simulation ledger.
- AI batch proposals require human review; they cannot activate physical blocks.
- If this browser has an old saved backend URL, clear it or set `/api-proxy`.

Stop without deleting data: `docker compose down`.

## Local development without containers

Run commands from the repository root with Python 3.11+ and Node 22+:

```sh
python -m venv .venv
# Activate .venv using the command appropriate for your shell.
python -m pip install -r requirements.txt -r backend/requirements-dev.txt
python -m uvicorn ai_engine.service:app --port 8001
# In a second activated terminal:
python -m uvicorn app.main:app --app-dir backend --port 8000
# In a third terminal:
npm --prefix frontend ci --legacy-peer-deps
npm --prefix frontend run dev
```

Scoring requires the AI process; full batch planning additionally requires
PostgreSQL/Redis and initialization with `MODE=demo python database/seed_db.py`
(PowerShell: `$env:MODE='demo'; python database/seed_db.py`). Configure DB_HOST,
DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, REDIS_HOST and REDIS_PORT for your instance.
The app's AI_SERVICE_URL defaults to http://127.0.0.1:8001.

## Verification

```sh
# POSIX; PowerShell: $env:PYTHONPATH='.;backend'
PYTHONPATH=.:backend python -m pytest backend/tests tests/test_ai_service.py -q
npm --prefix frontend test
npm --prefix frontend run build
# With the full Compose stack running:
python tests/compose_smoke.py
```

The historical root stress/NLP suites target the legacy ai_engine.main API and
include fixed latency/demo assertions. They are not the new integration acceptance
suite. Full Stack Integration CI exercises real PostgreSQL/Redis and the root
engine through the frontend proxy, including a repeated non-destructive seed.

## Ownership and next milestone

There is **one AI engine**, in `ai_engine/`. Keep this folder when downloading or
extracting the repository: the backend calls it as an internal service. Integration
does not mean the engine was copied into the backend. The former confusing
`backend/app/ai_engine/` folder is now named `backend/app/ai_adapters/`.


- `ai_engine/`: authoritative model/scorer/OR-Tools; `service.py` is an HTTP wrapper.
- `backend/app/ai_adapters/`: HTTP connection, chat orchestration and scenario helpers. No model or optimizer lives here.
- `data/`, `database/`: original dataset and schema, preserved.
- `frontend/`: existing Vite app, including batch-plan results.
- [Teammate handoff](docs/HANDOFF_AI_INTEGRATION.md)
- [Runtime map](docs/AI_ENGINE_RUNTIME_MAP.md)
- [Duplication matrix](docs/AI_ENGINE_DUPLICATION_MATRIX.md)
- [Data map](docs/DATA_RUNTIME_MAP.md)
- [Call graph](docs/API_AI_CALL_GRAPH.md)
- [Deployment map](docs/DEPLOYMENT_RUNTIME_MAP.md)
- [HTTP contract](docs/AI_SERVICE_CONTRACT.md)

The proposed Next.js/Express architecture is not currently in this repository.
The owner chose to connect the existing stack first. Unified production data,
HITL/emergency workflows and framework migration remain documented follow-up work.
