"""
Domain enums shared across the GQ Block Planner backend.
"""
from enum import Enum


class Department(str, Enum):
    """Maintenance-requesting department / system of record."""
    TMS = "TMS"      # Track Management System
    SMMS = "SMMS"    # Signal Maintenance Management System
    TDMS = "TDMS"    # Traction Distribution (OHE) Management System


class Criticality(str, Enum):
    """Maintenance block criticality tiers."""
    NORMAL = "NORMAL"        # Routine — zero passenger delay tolerated
    MAJOR = "MAJOR"          # Planned 1-3hr work — optimized regulation allowed
    EMERGENCY = "EMERGENCY"  # Immediate block — hold/caution orders issued instantly


class TrainCategory(str, Enum):
    """Coarse train category used for filtering (PASSENGER / FREIGHT / ALL)."""
    PREMIUM = "PREMIUM"      # Rajdhani / Shatabdi / Vande Bharat
    SUPERFAST = "SUPERFAST"
    EXPRESS = "EXPRESS"
    PASSENGER = "PASSENGER"  # Passenger / MEMU
    FREIGHT = "FREIGHT"      # Synthetic BOXN / BTPN / CONTAINER rakes


class TrainFilter(str, Enum):
    """Filter-engine query parameter."""
    ALL = "ALL"
    PASSENGER = "PASSENGER"
    FREIGHT = "FREIGHT"


class TrackLine(str, Enum):
    UP = "UP"
    DOWN = "DOWN"


class TrainStatus(str, Enum):
    RUNNING = "RUNNING"
    LOOPED = "LOOPED"
    HELD = "HELD"
    DIVERTED = "DIVERTED"


class RegulationAction(str, Enum):
    """Action commanded on a train as a result of a block decision."""
    NONE = "NONE"
    HOLD = "HOLD"                # Held at a station (platform/loop line)
    CAUTION = "CAUTION"          # Restricted to caution speed
    CAUTION_SPEED = "CAUTION"    # Restricted to caution speed through/near the block
    LOOP = "LOOP"                # Taken into a loop line to allow a pass
    DIVERT = "DIVERT"            # Diverted to an alternate line/route


class BlockDecisionStatus(str, Enum):
    APPROVED = "APPROVED"
    APPROVED_WITH_REGULATION = "APPROVED_WITH_REGULATION"
    REJECTED = "REJECTED"
    PENDING_REVIEW = "PENDING_REVIEW"
