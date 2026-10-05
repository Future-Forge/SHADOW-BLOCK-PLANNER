# Deployment runtime map

Baseline Compose exposed root `ai_engine.main` on 8000, which does not provide
the app's routes. It omitted frontend/backend and database initialization.

Corrected development/demo topology:

| Service | Role | Connection |
|---|---|---|
| frontend | Vite production build served by nginx | browser localhost:5173; `/api` proxies backend:8000 |
| backend | Existing app FastAPI | internal `AI_SERVICE_URL=http://ai-service:8001` |
| ai-service | Thin FastAPI wrapper over original root engine | PostgreSQL postgres:5432; Redis redis:6379 |
| db-init | One-shot idempotent schema + demo CSV import | completes before AI service starts |
| postgres | Persistent defect/timetable/proposal data | named volume; no public port by default |
| redis | AI schedule cache | internal only |

The app's existing manual simulation SQLite ledger gets a separate persistent
volume. It must not be confused with AI batch proposal approval state.
No autonomous worker starts by default: the old worker can overwrite proposals
independently and uses the legacy chat/reoptimization lifecycle.

`docker compose up --build -d` is the clean-download entry point. Only the
frontend is published by default, bound to localhost. This is a local SIH demo,
not an authenticated production deployment. The mode is explicitly demo because
the existing solver uses synthetic CSVs and fixed dataset assumptions.

CI must build the frontend/backend/AI images, start healthy database/cache,
initialize records, call scoring and planning through the public frontend proxy,
verify PostgreSQL/Redis output, and tear down its disposable volumes.
