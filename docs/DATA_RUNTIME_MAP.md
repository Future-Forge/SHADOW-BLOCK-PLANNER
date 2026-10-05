# Data runtime map

| Dataset/entity | Source -> storage -> service -> consumer |
|---|---|
| TMS defects | `data/processed_ir/TMS_Track_Defects.csv` -> PostgreSQL `tms_track_defects` via `database/seed_db.py` -> root solver -> batch-plan UI |
| SMMS defects | sibling SMMS CSV -> `smms_signal_defects` -> root solver station-to-section mapping -> batch-plan UI |
| TDMS defects | sibling TDMS CSV -> `tdms_traction_defects` -> root solver sector hash mapping -> batch-plan UI |
| COA slots | sibling COA CSV -> `coa_train_timetable` -> root candidate windows/OR-Tools -> batch-plan UI |
| AI plans | root solver -> PostgreSQL `scheduled_blocks` (proposal output); Redis `latest_optimized_schedule` (24-hour cache) -> API result |
| App trains/stations | `backend/app/data/data_files/*.json` -> `data/pipeline.py` -> in-memory `gq_bundle` -> map/manual planner/chat |
| Resource capacity | Request fields + bundled resource sample -> manual planning checks; not live inventory |
| Manual plans/history | `core/operations_store.py` -> existing SQLite `operations` JSON snapshots -> app planner/history/report APIs |
| Weather | App operator/seasonal scenarios; root weather API optionally OpenWeatherMap with synthetic fallback; these are distinct paths |
| Root approvals | Legacy Redis proposal keys -> legacy `ai_engine/main.py` commit -> PostgreSQL; not mounted in default integration service |
| Users/audit | No production user/session store; app simulation snapshots are not a production railway audit ledger |

The supplied processed CSVs and model training generator are synthetic. The
dataset is a reproducible SIH demonstration, not live TMS/SMMS/TDMS integration.
Root station/sector mapping and fixed October 2026 horizon require DS review.
`SUR` in the root data is Solapur, not Surat (`ST` in the app); do not map by name
guessing. Root solver also assumes temperatures/age/tonnage for some departments.

PostgreSQL remains the root engine's persistent store, Redis its schedule cache.
The existing SQLite ledger is retained only for the current manual simulation;
it is not introduced as a replacement for PostgreSQL. Migration to one operational
source of truth is outstanding. Root batch proposals are not copied into that
ledger, avoiding duplicate approval state. No new database/cache is introduced.

Initialization must be idempotent and must not drop existing data. Automatic
initialization imports demo CSVs only with explicit `MODE=demo`.
