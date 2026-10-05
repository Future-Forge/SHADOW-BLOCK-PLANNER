# Internal AI HTTP contract (v1)

The schemas in `ai_engine/contracts.py` are authoritative wire schemas. The
backend imports these schemas only; it does not import algorithms or the model.
OpenAPI is available inside the service at `/openapi.json`.

| Method/path | Request | Response |
|---|---|---|
| GET /health | none | Process liveness, root engine identity |
| GET /ready | none | 200 only when model, OR-Tools, populated PostgreSQL input tables, Redis and explicit demo mode are ready; otherwise 503 with checks |
| GET /api/v1/ai/model | none | Artifact fingerprint, feature order, trees, provenance |
| POST /api/v1/ai/criticality | Five required validated defect features | Root model score, urgency tier, review window, inputs, warnings and provenance |
| POST /api/v1/ai/plan | none | Dataset-wide PlanResult with original root solver BlockPlan records |

The app exposes planning as `POST /api/v1/ai/plan`, readiness as
`GET /api/v1/ai/ready`, and scoring through the existing
`POST /api/v1/chat/predict-criticality` and assistant.

Planning is synchronous and bounded (root solver 30 seconds; internal HTTP read
timeout 60 seconds; UI 75 seconds). Long-running job queues and WebSocket progress
are not implemented in this milestone. A timeout can occur after computation
started; do not interpret it as cancellation. No automatic mutation retry occurs.

Plan responses carry `contract_version=1`, `engine=root/ai_engine`, `mode=demo`,
`safety_status=REQUIRES_APPROVAL`, solver status, summary and blocks.
Blocks preserve original corridor/section, department names, start/end,
duration, shadow savings, aggregate urgency, temperature, defect count and
`status=PROPOSED`. Dates are the source's timezone-naive October 2026 scenario
dates. Do not present them as live local/UTC operating timestamps.

Do not invent per-train delay, calibrated confidence, asset availability or
resources: the original batch solver does not return these fields. Aggregate
urgency is a planning-policy score, not a probability. The richer desired domain
contract needs joint DS review before those fields can be populated honestly.

Errors: 422 invalid input/failed feasible result; 409 already running; 503
model/data/service unavailable; backend 504 timeout; 502 invalid upstream result.
The adapter validates response schemas and never substitutes local scores/plans.

Batch planning replaces the previous demo proposals and updates Redis. A
PostgreSQL advisory lock serializes batch calls. No legacy worker or legacy
mutation API is started. PostgreSQL and Redis are not an atomic distributed
transaction: a Redis failure is reported as failure even if the database write
already committed. The root optimizer's objective/constraints are unchanged.

No approval endpoint is exposed for AI batch proposals in this milestone.
Human review remains required, with no claim of actual railway control.
