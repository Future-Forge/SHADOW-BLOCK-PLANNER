# API / AI call graph

> Folder clarification (2026-10-05): the backend helpers now live in
> `backend/app/ai_adapters/`. The root `ai_engine/` is the sole model/optimizer
> service and is required. References to the old backend folder below describe
> the inspected baseline, not a second engine to run or copy.

## Existing routes retained

React assistant -> `/api/v1/chat/dispatcher` -> `assistant.process_assistant`.
Knowledge/clarification requests do not execute OR-Tools.
Manual block requests -> `/api/v1/planner/analyze-block` ->
`core/planning_service.analyze` -> app timetable simulation.

## Connected root-engine routes

- Chat scoring -> backend `inference.predict` -> HTTP
  `POST /api/v1/ai/criticality` -> `ai_engine.service` ->
  `xgboost_scorer.predict_defect_criticality` -> root model.
- Planning Lab AI batch view -> backend `POST /api/v1/ai/plan` -> HTTP same path
  -> `ai_engine.service` -> `solver.run_optimization` -> PostgreSQL inputs ->
  root XGBoost -> OR-Tools -> PostgreSQL proposals + Redis cache -> UI.
- Engine status -> backend `inference.model_status` -> service `/api/v1/ai/model`.
- Backend `/api/v1/ai/ready` -> service `/ready` checks model, solver and stores.

The HTTP contract is documented in `AI_SERVICE_CONTRACT.md`. Transport failures,
timeouts, malformed responses and solver failure must produce errors, never a
fake result. The backend owns frontend-specific wrappers. No service imports
browser state, app UI components, or backend Python modules.

No Express route exists in this repository. The approved current-stack milestone
uses FastAPI as the app backend; a future Express adapter can reuse this contract.
