"""
Emergency dispatcher.

Implements the EMERGENCY criticality tier: rail fracture / OHE snag / red
light scenarios where the affected block section must be locked
*instantly*, with no optimization pass -- there's no time to solve an
MILP when a signal has gone red. Instead this module:

  1. Locks the segment [from_code, to_code] on the given track line,
     effective immediately at the simulation clock time the request lands.
  2. Scans every train currently *inside* the block's buffer zone (already
     past the entry station, not yet past the exit station) or approaching
     it (scheduled to enter before the block clears), using the timetable
     engine's interpolation so this works against live train state, not
     just static schedule lookups.
  3. Issues hold orders:
       - Trains not yet at the entry station: HOLD at that station's
         platform/loop line.
       - Trains already inside the block buffer zone when the fracture/
         snag is reported: restricted to caution speed (15 km/h) rather
         than an instant stop, since a train mid-section can't simply
         teleport back to a signal.
  4. Computes a cascading hold duration for each affected train and a
     network-wide total, so the controller sees the full downstream cost
     of the emergency before confirming the block.

Unlike gq_optimizer.py, this module deliberately does NOT run a solver --
emergency response needs a deterministic, auditable, instant answer, not
an optimization pass. Every order it issues is directly traceable to a
simple rule ("ahead of the block -> hold", "inside the block -> caution"),
which matters when a controller has to justify an action after the fact.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.core.gq_network import GQNetworkGraph
from app.core.timetable_engine import TimetableEngine, minutes_to_time
from app.models.enums import TrackLine, RegulationAction, TrainCategory
from app.models.schemas import EmergencyHoldOrder, EmergencyDispatchResult


CAUTION_SPEED_KMPH = 15.0
# Real emergency caution restrictions apply through the immediate hazard
# zone, not the entire remainder of the block section -- a fracture or
# signal failure is a point/short-span hazard, and a train slows for a
# bounded distance around it before resuming normal running once clear.
# This caps how much of the "remaining distance" actually gets treated as
# caution-speed track, so the slowdown estimate stays physically realistic
# instead of applying 15 km/h across (e.g.) an entire 100+ km remaining
# section.
CAUTION_ZONE_KM = 3.0
# Minimum time (minutes) a controller needs to physically relay a hold
# order to a Loco Pilot / Section Controller before it can take effect.
ORDER_RELAY_BUFFER_MIN = 2


@dataclass
class LiveTrainSnapshot:
    """Minimal live state needed to decide a hold/caution order for one train."""
    train_number: str
    category: TrainCategory
    entry_min: int   # scheduled/interpolated minute this train enters the segment
    exit_min: int    # scheduled/interpolated minute this train would clear the segment
    entry_station: str
    exit_station: str
    distance_km: float = 0.0  # section length; needed to compute caution-speed slowdown


def _fraction_remaining(train: LiveTrainSnapshot, incident_min: int) -> float:
    """
    What fraction of the section's *distance* is still ahead of the train
    when the incident occurs, assuming constant speed across the section
    (a reasonable approximation for a single block section a few tens of
    km long). 0.0 = train was about to exit anyway, 1.0 = train just
    entered.
    """
    span = max(train.exit_min - train.entry_min, 1)
    elapsed_fraction = (incident_min - train.entry_min) / span
    return max(0.0, min(1.0, 1.0 - elapsed_fraction))


def classify_and_order(
    train: LiveTrainSnapshot,
    incident_min: int,
    block_clear_min: float,
) -> EmergencyHoldOrder:
    """
    Decide the regulation action for a single train relative to an
    emergency block reported at `incident_min`, expected to clear at
    `block_clear_min` (may be a float if it inherits fractional minutes
    from an upstream cascade calc).
    """
    already_inside = train.entry_min <= incident_min < train.exit_min
    already_past = incident_min >= train.exit_min
    not_yet_departed_entry = incident_min < train.entry_min

    if already_past:
        # Train already cleared the segment before the incident -- unaffected.
        return EmergencyHoldOrder(
            train_number=train.train_number,
            train_name=train.train_number,  # caller enriches with real name
            action=RegulationAction.NONE,
            location=train.exit_station,
            instruction="No action -- train already clear of the affected section.",
            estimated_hold_minutes=0.0,
            cascade_delay_minutes=0.0,
        )

    if already_inside:
        # Mid-section when the fracture/snag occurred: cannot be held at a
        # station it's already past -- restrict to caution speed through
        # a bounded hazard zone (CAUTION_ZONE_KM), not the section's full
        # remaining distance, then resume normal running for whatever
        # distance is left after that zone.
        #
        # Compute the train's normal running speed over this section from
        # its own schedule (distance / normal traversal time). The
        # slowdown is only charged for the caution zone itself; the
        # remaining distance beyond the zone (if any) is assumed to
        # resume at normal speed once the train is clear of the hazard.
        remaining_fraction = _fraction_remaining(train, incident_min)
        remaining_distance_km = train.distance_km * remaining_fraction
        caution_zone_km = min(CAUTION_ZONE_KM, remaining_distance_km)
        post_zone_km = max(0.0, remaining_distance_km - caution_zone_km)

        normal_span_min = max(train.exit_min - train.entry_min, 1)
        normal_speed_kmph = (train.distance_km / normal_span_min) * 60 if train.distance_km > 0 else None

        if normal_speed_kmph and normal_speed_kmph > CAUTION_SPEED_KMPH:
            normal_caution_zone_time_min = (caution_zone_km / normal_speed_kmph) * 60
            actual_caution_zone_time_min = (caution_zone_km / CAUTION_SPEED_KMPH) * 60
            slowdown_delay_min = actual_caution_zone_time_min - normal_caution_zone_time_min
            post_zone_time_min = (post_zone_km / normal_speed_kmph) * 60
            actual_exit_min = incident_min + actual_caution_zone_time_min + post_zone_time_min
        else:
            # No usable distance/speed data (e.g. distance_km not supplied) --
            # fall back to treating the caution restriction as adding no
            # extra time beyond the section's own scheduled exit, rather
            # than fabricating a slowdown figure from incomplete data.
            slowdown_delay_min = 0.0
            actual_exit_min = train.exit_min

        # Total cascade delay = however much longer the block itself is
        # still active past this train's now-later actual exit, PLUS the
        # slowdown time itself (both compound: a late-clearing block and a
        # slow-moving train both push real-world arrival further out).
        block_overhang_min = max(0.0, block_clear_min - actual_exit_min)
        cascade_delay = slowdown_delay_min + block_overhang_min

        return EmergencyHoldOrder(
            train_number=train.train_number,
            train_name=train.train_number,
            action=RegulationAction.CAUTION_SPEED,
            location=f"{train.entry_station}-{train.exit_station} (in section)",
            instruction=(
                f"ACTION: RESTRICT TO CAUTION SPEED ({CAUTION_SPEED_KMPH:.0f} KM/H) "
                f"FOR {caution_zone_km:.1f} KM THROUGH {train.entry_station}-{train.exit_station} SECTION, "
                f"THEN RESUME NORMAL RUNNING"
            ),
            caution_speed_kmph=CAUTION_SPEED_KMPH,
            estimated_hold_minutes=0.0,
            cascade_delay_minutes=round(cascade_delay, 1),
        )

    # not_yet_departed_entry: hold at (or before) the entry station until
    # the block clears, plus the relay buffer for the order to reach the crew.
    effective_release = block_clear_min + ORDER_RELAY_BUFFER_MIN
    hold_minutes = effective_release - train.entry_min

    if hold_minutes <= 0:
        # Train's own unregulated entry is already at/after the block's
        # effective release -- the block clears before this train would
        # have entered anyway, so no hold is actually required.
        return EmergencyHoldOrder(
            train_number=train.train_number,
            train_name=train.train_number,
            action=RegulationAction.NONE,
            location=train.entry_station,
            instruction="No action -- scheduled entry is already after the block clears.",
            estimated_hold_minutes=0.0,
            cascade_delay_minutes=0.0,
        )

    return EmergencyHoldOrder(
        train_number=train.train_number,
        train_name=train.train_number,
        action=RegulationAction.HOLD,
        location=train.entry_station,
        instruction=f"ACTION: HOLD AT {train.entry_station} PLATFORM/LOOP LINE",
        estimated_hold_minutes=round(hold_minutes, 1),
        cascade_delay_minutes=round(hold_minutes, 1),
    )


def dispatch_emergency_block(
    network: GQNetworkGraph,
    timetable: TimetableEngine,
    leg_id: str,
    track_line: TrackLine,
    from_code: str,
    to_code: str,
    incident_min: int,
    duration_minutes: int,
    train_names: dict[str, str] | None = None,
) -> EmergencyDispatchResult:
    """
    Immediately lock [from_code, to_code] on `track_line` starting at
    `incident_min`, for `duration_minutes`, and compute hold/caution
    orders for every train scheduled through that segment whose journey
    overlaps the incident.

    `train_names`: optional train_number -> display name map (the caller
    typically has this already from the loaded Train records) used to
    enrich the orders; falls back to the train number if omitted.
    """
    block_clear_min = incident_min + duration_minutes

    # Any train occupying this exact adjacent hop with any overlap in a
    # generous window around the incident (from well before it to well
    # after the block clears) is in scope -- trains far outside that
    # window can't possibly be inside or approaching the segment.
    scan_lo = max(0, incident_min - 180)
    scan_hi = block_clear_min + 180
    occs = timetable.occupancy_in_window(leg_id, track_line, from_code, to_code, scan_lo, scan_hi)

    section = network.get_section(leg_id, track_line, from_code, to_code)
    section_distance_km = section.distance_km if section else 0.0

    orders: list[EmergencyHoldOrder] = []
    total_cascade = 0.0

    for occ in occs:
        snapshot = LiveTrainSnapshot(
            train_number=occ.train_number,
            category=timetable.trains[occ.train_number].category if occ.train_number in timetable.trains else TrainCategory.PASSENGER,
            entry_min=occ.depart_from_min,
            exit_min=occ.arrive_to_min,
            entry_station=from_code,
            exit_station=to_code,
            distance_km=section_distance_km,
        )
        order = classify_and_order(snapshot, incident_min, block_clear_min)
        if train_names and order.train_number in train_names:
            order.train_name = train_names[order.train_number]

        if order.action != RegulationAction.NONE:
            orders.append(order)
            total_cascade += order.cascade_delay_minutes

    return EmergencyDispatchResult(
        block_id=f"EMBLK-{uuid.uuid4().hex[:8].upper()}",
        from_station=from_code,
        to_station=to_code,
        track_line=track_line,
        locked_at=minutes_to_time(incident_min % 1440),
        hold_orders=orders,
        total_cascade_delay_minutes=round(total_cascade, 1),
    )
