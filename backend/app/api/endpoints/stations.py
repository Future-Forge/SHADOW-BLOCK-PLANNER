"""
GET /api/v1/network/stations and /api/v1/network/gq-corridors endpoints.
Guarantees un-truncated, full-network ingestion across all defined CorridorLegs:
WEST, SOUTH_WEST, EAST_COAST, and NORTH_EAST.
"""
from __future__ import annotations

from typing import Union
from fastapi import APIRouter, Request, HTTPException, Query

from app.models.schemas import Corridor, StationItem, CorridorTelemetry
from app.data.gq_corridors import GQ_CORRIDOR_LEGS, STATION_ALIASES

router = APIRouter(prefix="/api/v1", tags=["stations"])

# Canonical CorridorLeg definitions
CORRIDOR_LEGS = ["WEST", "SOUTH_WEST", "EAST_COAST", "NORTH_EAST"]


def _extract_corridor_stations(network, leg_id: str | None = None) -> list[StationItem]:
    """
    Extracts all stations across the Golden Quadrilateral corridors,
    preserving full granularity (all intermediate micro-nodes),
    sequential chainage, and multi-corridor junction connections.
    """
    items: list[StationItem] = []

    for leg_key, corridor in network.corridors.items():
        if leg_id and leg_key.upper() != leg_id.upper():
            continue

        num_stations = len(corridor.stations)
        for idx, st in enumerate(corridor.stations):
            prev_code = corridor.stations[idx - 1].code if idx > 0 else None
            next_code = corridor.stations[idx + 1].code if idx < num_stations - 1 else None
            adj = [c for c in [prev_code, next_code] if c]

            existing = next((item for item in items if item.code == st.code), None)
            if existing:
                if leg_key not in existing.legs:
                    existing.legs.append(leg_key)
                for a in adj:
                    if a not in existing.adjacentCodes:
                        existing.adjacentCodes.append(a)
                existing.is_junction = len(existing.legs) > 1 or len(existing.adjacentCodes) > 2
            else:
                station_meta = network.stations.get(st.code)
                items.append(
                    StationItem(
                        code=st.code,
                        name=st.name,
                        lat=st.lat,
                        lon=st.lon,
                        legs=[leg_key],
                        cumulative_km=st.cumulative_km,
                        adjacentCodes=adj,
                        zone=station_meta.zone if station_meta else None,
                        is_junction=False,
                    )
                )

    return items


@router.get("/network/stations", response_model=Union[list[StationItem], dict[str, list[StationItem]]])
def get_network_stations(
    request: Request,
    leg_id: str | None = Query(None, description="Optional filter by corridor leg (e.g. WEST, EAST_COAST)"),
    query: str | None = Query(None, description="Optional search term matching station code or name"),
    grouped: bool = Query(False, description="If true, returns dictionary grouped by CorridorLeg"),
    include_national: bool = Query(False, description="If true, appends broader national stations matching query"),
) -> Union[list[StationItem], dict[str, list[StationItem]]]:
    """
    Returns the complete un-truncated array or structured dictionary of all stations
    across all 4 Golden Quadrilateral corridor legs (WEST, SOUTH_WEST, EAST_COAST, NORTH_EAST).
    Guarantees no arbitrary 50/100 limit, returning 100% of corridor nodes.
    """
    bundle = request.app.state.gq_bundle
    network = bundle.network

    items = _extract_corridor_stations(network, leg_id=leg_id)

    # If user passed a search query and requested national fallback, search the master 8.7k database
    if query:
        q = query.strip().upper()
        matching_corridor = [i for i in items if q in i.code.upper() or q in i.name.upper()]

        if include_national and len(matching_corridor) < 5:
            # Append non-corridor national stations matching query
            corridor_codes = {i.code for i in items}
            for code, meta in network.stations.items():
                if code not in corridor_codes and (q in code.upper() or q in meta.name.upper()):
                    matching_corridor.append(
                        StationItem(
                            code=code,
                            name=meta.name,
                            lat=meta.lat,
                            lon=meta.lon,
                            legs=[],
                            cumulative_km=0.0,
                            adjacentCodes=[],
                            zone=meta.zone,
                            is_junction=False,
                        )
                    )
                    if len(matching_corridor) >= 50:
                        break
        items = matching_corridor

    if grouped:
        grouped_dict: dict[str, list[StationItem]] = {leg: [] for leg in CORRIDOR_LEGS}
        for leg in CORRIDOR_LEGS:
            corridor_stations = _extract_corridor_stations(network, leg_id=leg)
            if query:
                q = query.strip().upper()
                corridor_stations = [s for s in corridor_stations if q in s.code.upper() or q in s.name.upper()]
            grouped_dict[leg] = corridor_stations
        return grouped_dict

    return items


@router.get("/network/stations/by-corridor", response_model=dict[str, list[StationItem]])
def get_network_stations_by_corridor(
    request: Request,
    query: str | None = Query(None, description="Optional search filter"),
) -> dict[str, list[StationItem]]:
    """
    Returns stations grouped by CorridorLeg:
    {
      "WEST": [StationItem, ...],
      "SOUTH_WEST": [StationItem, ...],
      "EAST_COAST": [StationItem, ...],
      "NORTH_EAST": [StationItem, ...]
    }
    """
    bundle = request.app.state.gq_bundle
    network = bundle.network

    result: dict[str, list[StationItem]] = {}
    for leg in CORRIDOR_LEGS:
        stations = _extract_corridor_stations(network, leg_id=leg)
        if query:
            q = query.strip().upper()
            stations = [s for s in stations if q in s.code.upper() or q in s.name.upper()]
        result[leg] = stations

    return result


@router.get("/network/gq-corridors", response_model=list[Corridor])
def get_gq_corridors(request: Request) -> list[Corridor]:
    """
    Ordered stations, cumulative chainage (km), and coordinates for the 4
    GQ perimeter legs: WEST, SOUTH_WEST, EAST_COAST, NORTH_EAST.
    """
    network = request.app.state.gq_bundle.network
    return list(network.corridors.values())


@router.get("/network/gq-corridors/{leg_id}", response_model=Corridor)
def get_gq_corridor(leg_id: str, request: Request) -> Corridor:
    network = request.app.state.gq_bundle.network
    corridor = network.corridors.get(leg_id.upper())
    if corridor is None:
        raise HTTPException(status_code=404, detail=f"Unknown GQ corridor leg_id: {leg_id!r}")
    return corridor


@router.get("/network/corridor-telemetry", response_model=list[CorridorTelemetry])
@router.get("/corridor-telemetry", response_model=list[CorridorTelemetry])
def get_corridor_telemetry(request: Request) -> list[CorridorTelemetry]:
    """
    Supplies the coordinate path, synchronized array of elapsed animation timestamps (0..1000),
    and real-time congestion scores driving data-driven TripsLayer width profiling.
    """
    network = request.app.state.gq_bundle.network
    results: list[CorridorTelemetry] = []
    for c in network.corridors.values():
        results.append(
            CorridorTelemetry(
                corridor_id=c.corridor_id or f"GQ_{c.leg_id}",
                path=c.path or [[s.lon, s.lat] for s in c.stations],
                timestamps=c.timestamps or [0.0] * len(c.stations),
                congestion_score=c.congestion_score or 6.0,
                status=c.status or "NORMAL",
            )
        )
    return results
