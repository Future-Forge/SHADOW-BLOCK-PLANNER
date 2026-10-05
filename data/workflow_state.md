# Data Pipeline State
**Owner:** DB/AI Engineer
**Target Consumer:** Internal AI Logic

## Current State
* `USFRA_Dataset.csv` mapped and cleaned.
* Output structured in `data/processed_ir/`.
* **Note:** This folder contains static/synthetic seeds. Real-time data will eventually bypass this and flow directly from the BFF Gateway via OpenWeatherMap API and WTT streams.
## Integration update (2026-10-05)
Root CSVs are preserved and used by the connected demo batch planner through PostgreSQL. They remain synthetic October 2026 scenario data, separate from the app timetable JSON. See [data map](../docs/DATA_RUNTIME_MAP.md).
