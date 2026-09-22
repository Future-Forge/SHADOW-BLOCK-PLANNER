"""
Hardcoded ordered station-code sequences for the 4 Golden Quadrilateral
perimeter trunk legs.

Why hardcode this instead of deriving it from trains.json?
Individual train LineStrings only cover the stations *that particular train*
stops at — no single train runs the full leg end-to-end with every station
present. The corridor topology itself (which stations exist, and in what
order, on the physical trunk route) is a fixed piece of railway geography,
so it's defined once here and used to index every train's position onto its
corridor leg via simple list-index comparison rather than geographic
bounding-box math.

Approximate inter-station distances (km) are placeholders pending precise
chainage from the real stations.json/trains.json coordinate data — replace
via `gq_network.py`'s haversine pass at startup if you want table-driven
distances instead of these seed values.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class CorridorLegDef:
    leg_id: str
    display_name: str
    # Ordered station codes, origin -> destination, UP-line direction of travel.
    station_codes: list[str]


# High-resolution ordered GIS station waypoints tracing physical curves along each corridor
GQ_CORRIDOR_WAYPOINTS: dict[str, list[str]] = {
    "WEST": [
        "NDLS", "FDB", "PWL", "KSV", "MTJ", "BTE", "BXN", "HAN", "GGC", "SWM",
        "KOTA", "RMA", "BWM", "SGZ", "NAD", "RTM", "DHD", "GDA", "BRC", "MYG",
        "BH", "AKV", "KSB", "ST", "NVS", "BIM", "BL", "VAPI", "DRD", "PLG",
        "VR", "BSR", "BVI", "DDR", "BCT",
    ],
    "SOUTH_WEST": [
        "BCT", "KYN", "LNL", "PUNE", "DD", "KWV", "SUR", "GR", "WADI", "YG",
        "RC", "MALM", "AD", "GTL", "GY", "YA", "HX", "RU", "AJJ", "PER", "MAS",
    ],
    "EAST_COAST": [
        "MAS", "SPE", "GDR", "NLR", "OGL", "CLX", "TEL", "BZA", "EE", "TDD",
        "RJY", "SLO", "TUNI", "AKP", "DVD", "VSKP", "VZM", "CHE", "PSA", "BAM",
        "BALU", "KUR", "BBS", "CTC", "JJKR", "BHC", "BLS", "KGP", "SRC", "HWH",
    ],
    "NORTH_EAST": [
        "HWH", "BWN", "DGR", "ASN", "DHN", "GAYA", "MGS", "MZP", "ALD", "FTP",
        "CNB", "ETW", "SKB", "TDL", "ALJN", "KRJ", "GZB", "NDLS",
    ],
}

STATION_ALIASES: dict[str, str] = {
    "MMCT": "BCT",
    "CSMT": "BCT",
    "PRYJ": "ALD",
    "DDU": "MGS",
}

GQ_CORRIDOR_LEGS: list[CorridorLegDef] = [
    CorridorLegDef(
        leg_id="WEST",
        display_name="Delhi - Mumbai (West Corridor)",
        station_codes=GQ_CORRIDOR_WAYPOINTS["WEST"],
    ),
    CorridorLegDef(
        leg_id="SOUTH_WEST",
        display_name="Mumbai - Chennai (South-West Corridor)",
        station_codes=GQ_CORRIDOR_WAYPOINTS["SOUTH_WEST"],
    ),
    CorridorLegDef(
        leg_id="EAST_COAST",
        display_name="Chennai - Howrah (East Coast Corridor)",
        station_codes=GQ_CORRIDOR_WAYPOINTS["EAST_COAST"],
    ),
    CorridorLegDef(
        leg_id="NORTH_EAST",
        display_name="Howrah - Delhi (North-East Corridor)",
        station_codes=GQ_CORRIDOR_WAYPOINTS["NORTH_EAST"],
    ),
]


def build_station_index() -> dict[str, list[tuple[str, int]]]:
    """
    Reverse index: station_code -> list of (leg_id, position_in_leg).
    Supports all intermediate stations and maps aliases.
    """
    index: dict[str, list[tuple[str, int]]] = {}
    for leg in GQ_CORRIDOR_LEGS:
        for pos, code in enumerate(leg.station_codes):
            index.setdefault(code, []).append((leg.leg_id, pos))
    for alias, canonical in STATION_ALIASES.items():
        if canonical in index:
            index[alias] = index[canonical]
    return index


def get_leg(leg_id: str) -> CorridorLegDef:
    for leg in GQ_CORRIDOR_LEGS:
        if leg.leg_id == leg_id:
            return leg
    raise KeyError(f"Unknown GQ corridor leg_id: {leg_id!r}")


def stations_between(leg_id: str, from_code: str, to_code: str) -> list[str]:
    """
    Return the ordered slice of station codes between from_code and to_code
    (inclusive) on the given leg, regardless of which one comes first in the
    leg's canonical UP-line ordering.
    """
    leg = get_leg(leg_id)
    codes = leg.station_codes
    c_from = STATION_ALIASES.get(from_code.upper(), from_code.upper())
    c_to = STATION_ALIASES.get(to_code.upper(), to_code.upper())
    try:
        i, j = codes.index(c_from), codes.index(c_to)
    except ValueError as exc:
        raise ValueError(
            f"Station not found on leg {leg_id}: {exc}"
        ) from exc
    lo, hi = min(i, j), max(i, j)
    return codes[lo : hi + 1]


def same_leg(code_a: str, code_b: str, index: dict[str, list[tuple[str, int]]] | None = None) -> str | None:
    """Return a shared leg_id if two station codes lie on a common leg, else None."""
    idx = index or build_station_index()
    c_a = STATION_ALIASES.get(code_a.upper(), code_a.upper())
    c_b = STATION_ALIASES.get(code_b.upper(), code_b.upper())
    legs_a = {leg for leg, _ in idx.get(c_a, [])}
    legs_b = {leg for leg, _ in idx.get(c_b, [])}
    shared = legs_a & legs_b
    return next(iter(shared), None)


def resolve_track_line(leg_id: str, from_code: str, to_code: str) -> "TrackLine | None":
    """
    UP is defined as travel in the leg's canonical origin->destination
    station order (as listed in GQ_CORRIDOR_LEGS); DOWN is the reverse.
    Returns None if from_code/to_code aren't both found on the leg.
    """
    from app.models.enums import TrackLine

    leg = get_leg(leg_id)
    codes = leg.station_codes
    c_from = STATION_ALIASES.get(from_code.upper(), from_code.upper())
    c_to = STATION_ALIASES.get(to_code.upper(), to_code.upper())
    try:
        i, j = codes.index(c_from), codes.index(c_to)
    except ValueError:
        return None
    return TrackLine.UP if i < j else TrackLine.DOWN
