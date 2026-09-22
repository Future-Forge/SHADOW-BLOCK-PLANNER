# Shadow Block — GQ Automatic Block Planner Backend

AI-powered automatic railway block planning engine for the Indian
Railways Golden Quadrilateral (GQ) perimeter, built for SIH. FastAPI
backend, in-memory data (no external DB), real Indian Railways open
dataset for stations/timetables.

## Setup

```bash
pip install -r requirements.txt
```

Place the dataset files in `data_files/` (or set `GQ_DATA_DIR`):
- `stations.json`
- `EXP-TRAINS.json`
- `PASS-TRAINS.json`
- `SF-TRAINS.json`

Run:

```bash
uvicorn app.main:app --reload
```

Interactive API docs: `http://localhost:8000/docs`

## Architecture

```
app/
├── main.py                     FastAPI app, CORS, startup data load, health check
├── config.py                   Settings (data dir, tunables)
├── core/
│   ├── gq_network.py           Station graph, haversine chainage, nearest-station lookup
│   ├── timetable_engine.py     Segment occupancy index, position interpolation
│   ├── gap_finder.py           NORMAL criticality: zero-delay headway gap search
│   ├── gq_optimizer.py         MAJOR criticality: MILP (PuLP/CBC) weighted-delay
│   │                           minimization with pairwise train sequencing
│   ├── emergency_dispatcher.py EMERGENCY criticality: instant hold/caution orders
│   │                           with physics-based caution-zone slowdown calc
│   ├── live_positions.py       Real-time train position/speed interpolation
│   └── nlp_parser.py           Regex-based entity extraction for chat queries
├── models/
│   ├── enums.py                Department, Criticality, TrainCategory, etc.
│   └── schemas.py               Pydantic V2 request/response contracts
├── data/
│   ├── gq_corridors.py         4 GQ leg definitions, station ordering, UP/DOWN resolution
│   ├── loader.py                Real dataset ingestion (stations.json, *-TRAINS.json)
│   └── pipeline.py              Single entrypoint wiring loader -> graph -> timetable
└── api/endpoints/
    ├── stations.py              GET /network/gq-corridors
    ├── live_map.py              GET /trains/live
    ├── planner.py               POST /planner/analyze-block, /planner/commit-block
    └── chat.py                  POST /chat/query
```

## Criticality handling

| Tier | Module | Behavior |
|---|---|---|
| NORMAL | `gap_finder.py` | Finds a headway gap on the segment with zero passenger delay; searches near the requested time, widening to full-day if needed. |
| MAJOR | `gq_optimizer.py` | Builds a MILP: minimizes `sum(w_i * delay_i)` (premium=10, express/superfast=5, passenger=3, freight=1) subject to conflicting trains queuing through the reopened segment with minimum headway between them in whichever order minimizes total cost — the weights genuinely reorder trains (a freight rake originally scheduled first will be pushed behind a later-scheduled premium train if that lowers total cost). Solved via PuLP/CBC (bundled, no external solver install). |
| EMERGENCY | `emergency_dispatcher.py` | No optimization — deterministic, auditable rule: trains not yet at the entry station get a HOLD order; trains already mid-section get a CAUTION_SPEED order (15 km/h) through a bounded ~3km hazard zone, with cascade delay computed from real section distance/speed, not the full remaining section length. |

## Known dataset caveats

The bundled real dataset (Sanjay Bhangar / Sajjad Anwar's open Indian
Railways data, CC0) has a few quirks worth knowing about:

- **CSMT is not present** under any code variant checked. `BCT` (Mumbai
  Central) is used as the Mumbai-end anchor for both the WEST and
  SOUTH_WEST corridor legs instead.
- **DDU and PRYJ appear under pre-renaming codes**: `MGS` (Mughal Sarai
  Jn) and `ALD` (Allahabad Jn) respectively — this dataset predates the
  2018/2019 station renamings.
- **Chainage is haversine (straight-line), not track distance** — runs
  roughly 7-14% short of real rail-track chainage since actual track
  curves around terrain. Fine for relative sequencing/positioning; not a
  source of truth for exact km if that's ever needed downstream.
- **UP/DOWN direction is inferred**, not given in the source data — see
  `gq_corridors.resolve_track_line()`, which compares a hop's two
  stations against each leg's canonical station order. A from/to pair
  must be *adjacent* stations on a tracked leg to resolve; multi-hop
  spans or off-corridor stations return `None` and are skipped during
  indexing (this is intentional — the gap finder and optimizer operate
  on single block sections, not multi-station spans).
- Only `EXP-TRAINS.json` / `PASS-TRAINS.json` / `SF-TRAINS.json` are
  used as the route/timetable source (8490 trains total). The
  supplementary `isl_wise_train_detail` CSV (2810 trains, ~2036
  overlapping) and `schedules.json` are not merged in, to avoid two
  conflicting route representations for the same train number.
- Freight traffic is out of scope for this pass — the mission spec's
  synthetic freight generator (`freight_generator.py`) has not been
  built yet; `TrainCategory.FREIGHT` exists in the type system and the
  filter engine already branches on it, ready to receive synthetic
  freight trains once that module is added.

## Not yet built

- `freight_engine.py` — synthetic freight corridor generator
- WebSocket `/ws/live-feed` broadcast (commit-block currently returns
  the decision directly rather than broadcasting)
- Global simulation clock scrub endpoint (0-24hr, speed multipliers)
- KD-Tree spatial index (currently linear-scan nearest-station lookup —
  fine at ~8.7k stations, would need upgrading at much larger scale)
