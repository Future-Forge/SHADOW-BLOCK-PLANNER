# Data Pipeline State
**Owner:** DB/AI Engineer
**Target Consumer:** Internal AI Logic

## Current State
* `USFRA_Dataset.csv` mapped and cleaned.
* Output structured in `data/processed_ir/`.
* **Note:** This folder contains static/synthetic seeds. Real-time data will eventually bypass this and flow directly from the BFF Gateway via OpenWeatherMap API and WTT streams.