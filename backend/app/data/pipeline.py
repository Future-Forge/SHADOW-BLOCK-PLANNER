"""
Single entrypoint that wires together the loader, GQNetworkGraph, and
TimetableEngine from the real dataset files on disk. This is what
`main.py`'s FastAPI startup event should call once at boot.
"""
from __future__ import annotations

from pathlib import Path

from app.core.gq_network import GQNetworkGraph
from app.core.timetable_engine import TimetableEngine
from app.data.loader import load_stations_json, load_all_category_trains
from app.data.gq_corridors import resolve_track_line


class GQDataBundle:
    """Holds the fully-built graph + timetable engine, ready for querying."""

    def __init__(self, network: GQNetworkGraph, timetable: TimetableEngine) -> None:
        self.network = network
        self.timetable = timetable


def build_gq_data_bundle(data_dir: str | Path) -> GQDataBundle:
    data_dir = Path(data_dir)

    stations = load_stations_json(data_dir / "stations.json")
    station_dicts = [
        {"code": s.code, "name": s.name, "lat": s.lat, "lon": s.lon, "zone": s.zone}
        for s in stations
    ]

    network = GQNetworkGraph()
    network.load_stations(station_dicts)
    network.build_corridors_and_edges()

    trains = load_all_category_trains(
        data_dir / "EXP-TRAINS.json",
        data_dir / "PASS-TRAINS.json",
        data_dir / "SF-TRAINS.json",
    )

    timetable = TimetableEngine()
    timetable.load_trains(trains)
    timetable.corridor_km_maps = {
        leg: {s.code: s.cumulative_km for s in corridor.stations}
        for leg, corridor in network.corridors.items()
    }

    leg_of_station = {
        code: network.leg_for_station(code)
        for code in network.stations
        if network.leg_for_station(code)
    }

    def _resolver(train, stop_a, stop_b):
        leg_id = leg_of_station.get(stop_a.station_code) or leg_of_station.get(stop_b.station_code)
        if leg_id is None:
            return None
        return resolve_track_line(leg_id, stop_a.station_code, stop_b.station_code)

    timetable.build_segment_index(leg_of_station, track_line_resolver=_resolver)

    return GQDataBundle(network=network, timetable=timetable)
