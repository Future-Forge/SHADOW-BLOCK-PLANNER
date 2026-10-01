# Planning Lab

Open the dashboard and choose **Planning Lab · Weather & history** (top right).
The manual **Run analysis** button also opens the lab. Analysis is read-only;
**Commit simulation block** rechecks constraints and persists the accepted plan.

## Implemented features

| Selected item | Implementation |
| --- | --- |
| 1 · Persistent history | SQLite ledger with original request, decision, operation date and active/closed status; active blocks reload after refresh. Monthly CSV uses the operation month. |
| 2 · Consistent conflict checks | One sector-occupancy calculation for previews, gaps and planning, with clipped hop interpolation, interior dwell, direction, service-origin weekdays and overnight intervals. Missing spatial timetable coverage requires review. |
| 4 · Shared maintenance | Up to three departments in the same section/window. Sequential durations are summed by default; explicitly confirmed parallel work uses the longest task. |
| 6 · Before/after comparison | Train-by-train timetable, weather-adjusted no-block time, regulated time, hold location and incremental block delay. |
| 11 · Resources | Operator-entered team, department equipment-kit and vehicle capacities checked against overlapping reservations. Commits serialize the check and reservation in a SQLite transaction. |
| 15 · Explanations | Reasons for the selected window, weather extensions, shortages, overlap, clearance and pending-review decisions. |
| 20 · Historical evaluation | Saved-input replay with requested-time FIFO baseline and computed delay/weighted-cost comparisons. Infeasible baselines do not produce savings claims. |

## Weather model

- Automatic mode uses the operation month and stations along the selected section.
- A coarse western-India latitude/longitude envelope triggers the June–September
  monsoon scenario. This is not a district-boundary lookup.
- [IMD's monsoon seasonal normals](https://imdpune.gov.in/climinfo/season/mon/index.html)
  support the season definition only. **All duration multipliers and train delays
  below are illustrative scenario settings, not measured forecasts or railway rules.**
- Site-specific wind-risk months can be selected by the operator. Those months
  trigger a wind scenario in Automatic mode; there is no built-in wind climatology.
- Rain adjusts arrival times and extends work. It never deletes/cancels trains.
- Severe conditions require review. High wind requires review for traction or
  exposed/elevated work. An emergency request does not bypass these checks.

| Scenario | Work multiplier | Train-arrival delay |
| --- | ---: | ---: |
| Western monsoon | 1.25 | 5 min |
| Heavy rain | 1.50 | 15 min |
| High wind | 1.30 | 8 min |
| Monsoon + configured wind month | 1.60 | 18 min |
| Severe weather | 1.75 | 25 min |

Weather arrival delay is applied once per modelled section traversal. Both sides
of the before/after comparison include it, so block-delay savings do not count
weather delay as an optimization benefit. The map/modal uses the effective
weather-adjusted committed duration, not the original work estimate.

## Storage and API

Default ledger: `backend/var/operations.sqlite3` (Git-ignored). Override with
`SHADOW_BLOCK_DB`; use `:memory:` for isolated tests. Preserve the SQLite file and
associated WAL/SHM files while running; close the server before copying just the
database as a backup. Existing process-only records from before this feature
cannot be recovered after that process exits.

Endpoints under `/api/v1/planner`:

- `POST /analyze-block`: request plus optional `operation_date`, `shared_tasks`,
  `parallel_work_confirmed`, `weather`, and `resource_capacity`.
- `POST /commit-block`: same request; optional `expected_start_iso` rejects a
  changed window rather than silently committing a different recommendation.
- `GET /operations`: persisted history and snapshots.
- `POST /operations/{id}/close`: close and release reservations; retain history.
- `POST /operations/{id}/evaluate`: replay snapshot, excluding its own reservation.

The AI dispatcher uses the same planning/commit service. Planning and dispatcher
requests no longer silently generate approvals when backend requests fail.

## Boundaries

This is a hackathon planning simulator, not a signalling or dispatch authority.
The new planner uses nearest-feasible gap search for NORMAL requests and
single-section FIFO holds for MAJOR/EMERGENCY requests. It does **not** claim MILP
optimality. The pre-existing MILP module remains available but is not the new
planner's decision engine. The five-minute clearance/re-entry buffer is illustrative.

Crew units are teams; equipment units are department kits, not item-level live
inventory. Capacity edits are scenario assumptions, not an authenticated resource
registry. Parallel compatibility is operator-confirmed, not engineered automatically.
Unknown running-day metadata is conservatively treated as daily. Timetable
coverage evidence does not guarantee a complete or current operational timetable.
Historical replay uses the current loaded timetable and current reservations; it
does not measure observed historical outcomes. Network-wide cascades, real wind
measurements, forecast integration, authentication, and live railway commands are
not implemented by this change.

## Verification

From the repository root, in PowerShell:

```powershell
.\venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
$env:PYTHONPATH = 'backend'
.\venv\Scripts\python.exe -m pytest backend/tests -q
npm --prefix frontend run build
npm --prefix frontend run lint
```

Tests isolate their ledgers from the development database. Coverage includes
midnight/service days, shared tasks, weather changes, shortages, persistence,
CSV filtering, atomic competing commits, stale previews, close/replay API, missing
coverage, and AI dispatcher constraint enforcement.
