"""
MAJOR-criticality regulation optimizer.

Solves:
    min  sum_i  w_i * delta_t_i

subject to:
  - Each conflicting train i either:
      (a) is delayed by delta_t_i >= 0 minutes (held before entering the
          block segment until the block clears + a re-entry buffer), or
      (b) passes through before the block starts / after it ends with
          delta_t_i = 0, if its *unregulated* schedule already clears it.
  - The block itself occupies [block_start, block_end] on the segment and
    no train may occupy the segment during that window: a train whose
    unregulated entry falls inside the window must be pushed to enter at
    or after block_end (+ re-entry buffer).
  - SEQUENCING: the segment is single-line during regulation, so trains
    queued to re-enter after the block clears cannot all enter
    simultaneously -- each pair of held trains must be separated by at
    least MIN_HEADWAY_MIN, in *some* order. Which train goes first is a
    genuine decision (modeled with a binary "before" variable per pair
    and a big-M disjunction), and that's exactly where the category
    weights w_i start driving different outcomes: the model will
    generally queue a premium train ahead of a freight rake even if the
    freight rake's unregulated entry was earlier, because delaying the
    freight further costs far less than delaying the premium train.
  - delta_t_i is minutes of added delay (entry_time_regulated - entry_time_unregulated),
    lower-bounded at 0 (trains are never advanced early).

This is a small per-block MILP (typically a handful of conflicting trains
per request) with O(n^2) pairwise ordering binaries, so CBC (bundled with
PuLP) still solves it in milliseconds at this scale. Swap
`pulp.PULP_CBC_CMD` for an OR-Tools CP-SAT model if you later need to
scale to network-wide, multi-block joint optimization with dozens of
simultaneous conflicts.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

import pulp

from app.core.timetable_engine import SegmentOccupancy
from app.models.enums import TrainCategory


# Weights per the mission spec: w_premium=10, w_express=5, w_local=3, w_freight=1
CATEGORY_WEIGHTS: dict[TrainCategory, float] = {
    TrainCategory.PREMIUM: 10.0,
    TrainCategory.SUPERFAST: 5.0,
    TrainCategory.EXPRESS: 5.0,
    TrainCategory.PASSENGER: 3.0,
    TrainCategory.FREIGHT: 1.0,
}

RE_ENTRY_BUFFER_MIN = 3   # safety margin before the first held train may re-enter the cleared segment
MIN_HEADWAY_MIN = 5       # minimum separation between two trains entering the same single-line segment
BIG_M = 3000               # large enough to dominate any realistic minutes-in-day span (>2 days)


@dataclass
class TrainConflict:
    train_number: str
    category: TrainCategory
    unregulated_entry_min: int  # this train's originally-scheduled entry time into the segment


@dataclass
class RegulationResult:
    train_number: str
    delay_minutes: float
    regulated_entry_min: float


@dataclass
class OptimizationOutcome:
    results: list[RegulationResult]
    total_weighted_cost: float


def solve_major_block_regulation(
    conflicts: list[TrainConflict],
    block_start_min: int,
    block_end_min: int,
) -> OptimizationOutcome:
    """
    Build and solve the MILP for one MAJOR-criticality block request.

    Each conflicting train gets a continuous decision variable for its
    regulated entry time. If its unregulated entry already falls outside
    [block_start, block_end], delay is forced to 0 (no free early-running
    credit). If it falls inside, the train must enter at or after
    block_end + RE_ENTRY_BUFFER_MIN, AND must be separated from every
    other held train by at least MIN_HEADWAY_MIN in whichever order the
    solver chooses -- so held trains queue onto the single line one at a
    time instead of all landing on the same reopening instant.
    """
    if not conflicts:
        return OptimizationOutcome(results=[], total_weighted_cost=0.0)

    prob = pulp.LpProblem("major_block_regulation", pulp.LpMinimize)

    delay_vars: dict[str, pulp.LpVariable] = {}
    entry_vars: dict[str, pulp.LpVariable] = {}
    held_flags: dict[str, bool] = {}

    for c in conflicts:
        entry_vars[c.train_number] = pulp.LpVariable(f"entry_{c.train_number}", lowBound=0)
        delay_vars[c.train_number] = pulp.LpVariable(f"delay_{c.train_number}", lowBound=0)
        held_flags[c.train_number] = block_start_min <= c.unregulated_entry_min <= block_end_min

    # Objective: minimize sum of weighted delays
    prob += pulp.lpSum(
        CATEGORY_WEIGHTS.get(c.category, 1.0) * delay_vars[c.train_number]
        for c in conflicts
    )

    for c in conflicts:
        entry = entry_vars[c.train_number]
        delay = delay_vars[c.train_number]

        # delay = entry - unregulated_entry, delay >= 0 is already enforced by lowBound
        prob += delay == entry - c.unregulated_entry_min

        if held_flags[c.train_number]:
            # must not enter until the block clears (+ buffer)
            prob += entry >= block_end_min + RE_ENTRY_BUFFER_MIN
        else:
            # no conflict: entry pinned to its unregulated time (zero delay)
            prob += entry == c.unregulated_entry_min

    # Pairwise sequencing: for every pair of trains BOTH held by the block,
    # enforce a minimum-headway disjunction -- either i enters at least
    # MIN_HEADWAY_MIN before j, or j enters at least MIN_HEADWAY_MIN before i.
    # A binary "order" variable picks which side of the disjunction is active,
    # via the standard big-M formulation.
    held_conflicts = [c for c in conflicts if held_flags[c.train_number]]
    order_vars: dict[tuple[str, str], pulp.LpVariable] = {}

    for c_i, c_j in combinations(held_conflicts, 2):
        i, j = c_i.train_number, c_j.train_number
        entry_i, entry_j = entry_vars[i], entry_vars[j]

        # y = 1  => i goes before j (entry_i + headway <= entry_j)
        # y = 0  => j goes before i (entry_j + headway <= entry_i)
        y = pulp.LpVariable(f"order_{i}_{j}", cat="Binary")
        order_vars[(i, j)] = y

        prob += entry_i + MIN_HEADWAY_MIN <= entry_j + BIG_M * (1 - y)
        prob += entry_j + MIN_HEADWAY_MIN <= entry_i + BIG_M * y

    prob.solve(pulp.PULP_CBC_CMD(msg=False))

    status = pulp.LpStatus[prob.status]
    if status != "Optimal":
        # Infeasible / solver issue -- surface as an empty outcome so the
        # caller can fall back to a manual/greedy path rather than crash.
        raise RuntimeError(f"MILP did not solve to optimality: status={status}")

    results = [
        RegulationResult(
            train_number=c.train_number,
            delay_minutes=round(pulp.value(delay_vars[c.train_number]), 2),
            regulated_entry_min=round(pulp.value(entry_vars[c.train_number]), 2),
        )
        for c in conflicts
    ]
    total_cost = sum(
        CATEGORY_WEIGHTS.get(c.category, 1.0) * r.delay_minutes
        for c, r in zip(conflicts, results)
    )

    return OptimizationOutcome(results=results, total_weighted_cost=round(total_cost, 2))
