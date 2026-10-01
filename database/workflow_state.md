# Database State & Handoff
**Owner:** Lead DB & AI Engineer  
**Target Consumer:** Backend Engineer / BFF Developer  
**Updated:** 2026-10-01 22:00 IST  

## Current State
* **Schema Definition (`schema.sql`):** Fully applied in PostgreSQL.
* **Tables Seeded:**
  - `tms_track_defects`: 600 records
  - `smms_signal_defects`: 600 records
  - `tdms_traction_defects`: 600 records
  - `coa_train_timetable`: 1,000 records
  - `scheduled_blocks`: Ready for OR-Tools optimizer writes.
* **Seeding Script (`database/seed_db.py`):** Completed and verified.

## Connection Parameters
* **Host:** `localhost`
* **Port:** `5432`
* **Database:** `shadow_blockplanner`
* **User:** `postgres`
* **Container:** `shadow_postgres`

## Backend Handoff Notes
* **Read Requirements:** Backend BFF will query `scheduled_blocks` for streaming block maintenance schedules to the Next.js UI.
* **Trace Log:** Refer to [traceability_handoff.log](file:///C:/Users/Pavankumar/Documents/Shadow-blockplanner/traceability_handoff.log) for real-time infrastructure metadata.