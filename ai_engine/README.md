# The project's AI engine — required

This is the single authoritative AI/DS engine, called by the backend through an
internal HTTP service. Do not delete this folder when extracting the project.

- `service.py`: current FastAPI service entry point used by Docker Compose.
- `xgboost_scorer.py` and `models/`: original scorer and sole model artifact.
- `solver.py`: original OR-Tools batch optimizer.
- `contracts.py`: service request/response schemas.
- Other original modules remain for documented legacy/future integration work;
  `main.py` and `run_worker.py` are not the default deployment entry points.

The backend's `app/ai_adapters/` folder contains callers and app-specific helpers,
not another AI engine. Run the whole project from the repository root using
`docker compose up --build -d`. See [the project README](../README.md).
