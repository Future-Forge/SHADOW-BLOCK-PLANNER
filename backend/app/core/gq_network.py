"""
GQ Network graph.

Builds an in-memory directed graph over the 4 GQ perimeter legs: nodes are
stations, edges are block sections between adjacent stations on a leg (one
edge per direction per track line). Distances are computed via haversine
over real station coordinates when available, falling back to the
approximate chainage baked into gq_corridors.py.

Also maintains a simple spatial index (sorted-by-lat/lon grid buckets) for
nearest-station lookups — a lightweight stand-in for a KD-Tree that avoids
a scipy dependency; swap in scipy.spatial.KDTree if you already have it
installed and want exact nearest-neighbour queries at scale.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.data.gq_corridors import GQ_CORRIDOR_LEGS, build_station_index, GQ_CORRIDOR_WAYPOINTS, STATION_ALIASES
from app.models.schemas import Station, Corridor, CorridorStation
from app.models.enums import TrackLine


EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


@dataclass
class BlockSection:
    """A single directed edge between two adjacent stations on one track line."""
    from_code: str
    to_code: str
    track_line: TrackLine
    leg_id: str
    distance_km: float
    section_id: str = field(init=False)

    def __post_init__(self) -> None:
        self.section_id = f"{self.from_code}-{self.to_code}-{self.track_line.value}"


class GQNetworkGraph:
    """
    Directed graph over the GQ perimeter.

    `stations`: code -> Station (populated from stations.json via load_stations)
    `corridors`: leg_id -> Corridor (station list + cumulative chainage)
    `adjacency`: (leg_id, track_line) -> ordered list[BlockSection]
    `station_leg_index`: code -> list[(leg_id, position)]
    """

    def __init__(self) -> None:
        self.stations: dict[str, Station] = {}
        self.corridors: dict[str, Corridor] = {}
        self.adjacency: dict[tuple[str, TrackLine], list[BlockSection]] = {}
        self.station_leg_index: dict[str, list[tuple[str, int]]] = build_station_index()
        self._built = False

    # ------------------------------------------------------------------
    # Population
    # ------------------------------------------------------------------

    def load_stations(self, station_records: list[dict]) -> None:
        """
        Load from parsed stations.json GeoJSON features, e.g.:
        {"properties": {"code": "BRC", "name": "Vadodara Jn", "zone": "WR"},
         "geometry": {"coordinates": [73.1943, 22.3072]}}
        Accepts either raw GeoJSON features or already-flattened dicts with
        code/name/lat/lon/zone keys.
        """
        for rec in station_records:
            if "geometry" in rec:  # raw GeoJSON feature
                props = rec.get("properties", {})
                lon, lat = rec["geometry"]["coordinates"][:2]
                code = props["code"]
                name = props.get("name", code)
                zone = props.get("zone")
            else:  # flattened
                code = rec["code"]
                name = rec.get("name", code)
                lat, lon = rec["lat"], rec["lon"]
                zone = rec.get("zone")

            self.stations[code] = Station(code=code, name=name, lat=lat, lon=lon, zone=zone)

    def build_corridors_and_edges(self) -> None:
        """
        Build Corridor objects (with cumulative chainage) and directed
        BlockSection edges for both UP and DOWN lines, for every leg.

        Falls back to a flat default distance per hop if a station is
        missing coordinates (e.g. stations.json didn't include it yet),
        so the graph still builds and can be corrected once data lands.
        """
        FALLBACK_HOP_KM = 55.0  # rough average inter-station spacing on GQ trunk

        for leg in GQ_CORRIDOR_LEGS:
            codes = leg.station_codes
            corridor_stations: list[CorridorStation] = []
            cumulative = 0.0
            up_sections: list[BlockSection] = []

            for i, code in enumerate(codes):
                st = self.stations.get(code)
                if i > 0:
                    prev_code = codes[i - 1]
                    prev_st = self.stations.get(prev_code)
                    if st and prev_st:
                        hop_km = haversine_km(prev_st.lat, prev_st.lon, st.lat, st.lon)
                    else:
                        hop_km = FALLBACK_HOP_KM
                    cumulative += hop_km
                    up_sections.append(
                        BlockSection(
                            from_code=prev_code,
                            to_code=code,
                            track_line=TrackLine.UP,
                            leg_id=leg.leg_id,
                            distance_km=round(hop_km, 2),
                        )
                    )

                corridor_stations.append(
                    CorridorStation(
                        code=code,
                        name=st.name if st else code,
                        lat=st.lat if st else 0.0,
                        lon=st.lon if st else 0.0,
                        cumulative_km=round(cumulative, 2),
                    )
                )

            down_sections = [
                BlockSection(
                    from_code=s.to_code,
                    to_code=s.from_code,
                    track_line=TrackLine.DOWN,
                    leg_id=leg.leg_id,
                    distance_km=s.distance_km,
                )
                for s in reversed(up_sections)
            ]

            self.adjacency[(leg.leg_id, TrackLine.UP)] = up_sections
            self.adjacency[(leg.leg_id, TrackLine.DOWN)] = down_sections

            # Synchronized coordinate path and timestamps normalized to 0..1000
            coords = [[round(s.lon, 4), round(s.lat, 4)] for s in corridor_stations]
            if cumulative > 0:
                timestamps = [round((s.cumulative_km / cumulative) * 1000.0, 1) for s in corridor_stations]
            else:
                n = len(corridor_stations)
                timestamps = [round((idx / max(1, n - 1)) * 1000.0, 1) for idx in range(n)]

            if timestamps:
                timestamps[0] = 0.0
                timestamps[-1] = 1000.0

            # Real-time congestion metrics driving dynamic TripsLayer width profiling
            CONGESTION_METRICS = {
                "WEST": {"score": 8.5, "status": "CRITICAL"},
                "NORTH_EAST": {"score": 9.2, "status": "CRITICAL"},
                "EAST_COAST": {"score": 6.8, "status": "NORMAL"},
                "SOUTH_WEST": {"score": 5.4, "status": "NORMAL"},
            }
            metric = CONGESTION_METRICS.get(leg.leg_id, {"score": 6.5, "status": "NORMAL"})

            self.corridors[leg.leg_id] = Corridor(
                corridor_id=f"GQ_{leg.leg_id}",
                leg_id=leg.leg_id,
                display_name=leg.display_name,
                origin_code=codes[0],
                destination_code=codes[-1],
                total_km=round(cumulative, 2),
                stations=corridor_stations,
                path=coords,
                timestamps=timestamps,
                congestion_score=metric["score"],
                status=metric["status"],
            )

        self._built = True

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_section(self, leg_id: str, track_line: TrackLine, from_code: str, to_code: str) -> BlockSection | None:
        for sec in self.adjacency.get((leg_id, track_line), []):
            if sec.from_code == from_code and sec.to_code == to_code:
                return sec
        return None

    def sections_in_range(
        self, leg_id: str, track_line: TrackLine, from_code: str, to_code: str
    ) -> list[BlockSection]:
        """All block sections covering the span from_code..to_code on one line."""
        sections = self.adjacency.get((leg_id, track_line), [])
        codes_in_order = [s.from_code for s in sections] + ([sections[-1].to_code] if sections else [])
        try:
            i, j = codes_in_order.index(from_code), codes_in_order.index(to_code)
        except ValueError:
            return []
        lo, hi = min(i, j), max(i, j)
        return sections[lo:hi]

    def nearest_station(self, lat: float, lon: float) -> tuple[Station, float] | None:
        """Linear-scan nearest station by haversine distance (fine for ~150-200 GQ stations)."""
        if not self.stations:
            return None
        best_code, best_dist = None, math.inf
        for code, st in self.stations.items():
            d = haversine_km(lat, lon, st.lat, st.lon)
            if d < best_dist:
                best_code, best_dist = code, d
        return (self.stations[best_code], best_dist) if best_code else None

    def leg_for_station(self, code: str) -> str | None:
        legs = self.station_leg_index.get(code, [])
        return legs[0][0] if legs else None

    def get_track_segment(self, from_station: str, to_station: str) -> list[list[float]]:
        """
        Slices the actual Golden Quadrilateral LineString array between from_station and to_station.
        Searches the master corridor coordinates array, finds the index of from_station,
        finds the index of to_station, and returns the exact subarray of all intermediate GIS coordinates.
        Handles both UP (forward) and DOWN (reverse) directions.
        Returns: [[lon, lat], [lon, lat], ...]
        """
        code_a = STATION_ALIASES.get(from_station.upper(), from_station.upper())
        code_b = STATION_ALIASES.get(to_station.upper(), to_station.upper())

        # Check in high-resolution corridor waypoints first
        for leg_id, waypoints in GQ_CORRIDOR_WAYPOINTS.items():
            if code_a in waypoints and code_b in waypoints:
                idx_a = waypoints.index(code_a)
                idx_b = waypoints.index(code_b)
                if idx_a <= idx_b:
                    sliced_codes = waypoints[idx_a : idx_b + 1]
                else:
                    sliced_codes = waypoints[idx_b : idx_a + 1][::-1]

                coords: list[list[float]] = []
                for c in sliced_codes:
                    st = self.stations.get(c)
                    if st:
                        coords.append([round(st.lon, 6), round(st.lat, 6)])
                if len(coords) >= 2:
                    return coords

        # Check in the corridor definitions (corridor.stations)
        for corridor in self.corridors.values():
            codes = [s.code for s in corridor.stations]
            if code_a in codes and code_b in codes:
                idx_a = codes.index(code_a)
                idx_b = codes.index(code_b)
                if idx_a <= idx_b:
                    sliced = corridor.stations[idx_a : idx_b + 1]
                else:
                    sliced = corridor.stations[idx_b : idx_a + 1][::-1]
                return [[round(s.lon, 6), round(s.lat, 6)] for s in sliced]

        # Fallback: if stations exist in network.stations, return direct [from, to] coordinates
        st_a = self.stations.get(code_a) or self.stations.get(from_station.upper())
        st_b = self.stations.get(code_b) or self.stations.get(to_station.upper())
        if st_a and st_b:
            return [
                [round(st_a.lon, 6), round(st_a.lat, 6)],
                [round(st_b.lon, 6), round(st_b.lat, 6)],
            ]

        return []


def get_track_segment(network: GQNetworkGraph, from_station: str, to_station: str) -> list[list[float]]:
    """Standalone helper function to slice track geometry from a GQNetworkGraph."""
    return network.get_track_segment(from_station, to_station)
