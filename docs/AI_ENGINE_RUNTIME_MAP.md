# AI runtime map

Inspected baseline: `00b277e` (original AI/DS commit `0862099`). The owner
confirmed on 2026-10-05 that this change must integrate the existing stack,
without migrating frameworks.

## Before integration

- `frontend/package.json`: Vite/React, not Next.js. `npm run dev` starts Vite.
- `uvicorn app.main:app --app-dir backend` starts the application FastAPI backend.
- Browser calls `/api/v1/planner/*`, `/chat/*`, `/live-map/*`, `/stations/*`.
- Chat imports `backend/app/ai_engine/inference.py`, which loads a copied model.
- Manual planning calls `core/planning_service.py`; older emergency planning uses
  `gq_optimizer.py` (PuLP). Neither calls root OR-Tools.
- `uvicorn ai_engine.main:app` starts a separate original AI API. Original Compose
  starts that API and a worker, but no application backend or frontend.
- Root `solver.py` reads PostgreSQL, scores with root XGBoost, solves with OR-Tools,
  writes PostgreSQL and caches in Redis. Nothing in the app calls it.
- There is no Express server, Node application API, or Next.js source to reconnect.

## Integration milestone

React -> application FastAPI -> internal HTTP -> `ai_engine.service:app` ->
root XGBoost / root OR-Tools -> PostgreSQL / Redis -> application -> React.

The service wrapper delegates algorithms; it is not another engine. Existing
manual planning remains an explicitly separate timetable simulation, pending a
joint contract/data migration. The root batch planner uses the supplied synthetic
October 2026 defects/COA dataset. Its demo assumptions must not be presented as
live railway operations. Root emergency/chat/worker APIs remain legacy and are
not exposed by the new default service.

Next.js, Express, production authentication, Node-owned WS/HITL, common asset IDs,
and unified persistent application state remain a later migration. This milestone
does not claim the full architecture checklist is complete.
