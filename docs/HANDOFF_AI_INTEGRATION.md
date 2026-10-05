# Note for the AI / Data Science teammate

Jenil confirmed that this change should integrate the existing stack first,
without migrating frameworks.

## What the issue was

The repository had two independent runtime paths. The Vite/React frontend called
the application FastAPI backend, which loaded a copied XGBoost model and used its
own timetable planner. The original root AI/DS service was never called by that
flow. Compose started only the original AI service/worker, without the app or
schema initialization. A fresh frontend install also lacked two imported
Markdown dependencies.

There is no Next.js or Express application in the inspected GitHub commit.
Those parts of the proposed architecture are future work, not existing code.

## What changed

- Preserved root ai_engine, data and database in their original locations.
- Added the five requested runtime/duplication/data/call/deployment maps.
- Added a thin internal FastAPI adapter that invokes the original root scorer
  and OR-Tools solver, with explicit versioned wire schemas.
- Converted backend inference into an HTTP adapter; removed only the duplicate
  model JSON. The authoritative root model bytes, feature order, scoring tiers,
  optimizer objective and constraints were preserved. Runtime retraining is
  disabled if the artifact is missing.
- Connected all current app scoring to the service. Added Planning Lab ->
  AI batch proposals to display actual root batch output and demo limitations.
- Kept app-specific chat/safety adapters and manual timetable simulation; the
  duplication matrix explains why they cannot safely be deleted or substituted.
- Repaired clean-download Docker startup for frontend, application, AI service,
  PostgreSQL, Redis and one-shot initialization. Initialization is idempotent.
  The legacy autonomous worker is not started by default.
- Added health/readiness, bounded HTTP timeouts, upstream response validation,
  error propagation, and serialization of concurrent demo batch runs.
- Added missing react-markdown / remark-gfm dependencies and corrected frontend
  environment/proxy configuration.
- Updated CI to test original AI code and run the whole Compose stack through
  the frontend proxy, including PostgreSQL output and Redis cache checks.
- Updated obsolete chatbot tests that expected invented telemetry/automatic
  dispatch to check the current clarification and explicit review contract.

## Verify together

1. Download/clone the updated repo; run `docker compose up --build -d`.
2. Open http://localhost:5173. If an old API URL was saved in browser settings,
   clear it or set it to `/api-proxy`.
3. Ask the assistant: "Score a TMS defect: age 10 days, temperature 44 C,
   tonnage 85 MGT, speed restriction 45 km/h". Expected original model score:
   78.39, with simulation disclosure.
4. Open Planning Lab -> AI batch proposals -> Generate AI batch proposals.
   Review the actual departments, windows, priority and shadow hours.
5. Run `python tests/compose_smoke.py` to verify the full HTTP/data path.
6. Review the five maps and AI_SERVICE_CONTRACT.md before the next migration.

## Outstanding DS / architecture decisions

This is the first integration milestone, not completion of the entire SIH
architecture checklist. The batch input CSVs and training generator are synthetic.
The original solver assumes a fixed October 2026 horizon, default age/tonnage/
temperatures, hashed TDMS sector mappings and parallel department fusion.
These policies need validation before production use. The app's Surat code ST
must not be confused with the root dataset's Solapur code SUR.

We still need agreed asset/task/section identifiers, one approved data source,
production auth/audit, a PostgreSQL migration for the existing manual SQLite
ledger, unified HITL, emergency reoptimization, validated per-train impact and
availability metrics, and any agreed Express/Next.js migration.
The legacy emergency/chat service is not exposed as a production feature.
No result means a train was stopped, signals locked or OHE isolated.

## Validation

Local: all 51 application/AI contract tests pass; real root model and real
OR-Tools are exercised (unit tests replace storage only). Frontend production
build and all 16 frontend tests pass. Docker is unavailable on the local host;
the GitHub Full Stack Integration job is the deployment verification authority.
See the PR checks for its final result and any follow-up fixes.
