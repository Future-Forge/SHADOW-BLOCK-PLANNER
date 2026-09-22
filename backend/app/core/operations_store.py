"""Process-scoped ledger for committed Shadow Block operations and CSV reports."""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime
from io import StringIO
from threading import Lock
from typing import Iterable
from uuid import uuid4


@dataclass(frozen=True)
class BlockOperation:
    block_id: str
    created_at: datetime
    department: str
    corridor: str
    from_station: str
    to_station: str
    start_time: str
    duration_minutes: int
    impacted_trains: tuple[str, ...]


class OperationStore:
    """Small thread-safe cache suitable for the app's in-memory deployment model."""

    def __init__(self) -> None:
        self._operations: list[BlockOperation] = []
        self._lock = Lock()

    def record(
        self,
        *,
        department: str,
        corridor: str,
        from_station: str,
        to_station: str,
        start_time: str,
        duration_minutes: int,
        impacted_trains: Iterable[str] = (),
    ) -> BlockOperation:
        operation = BlockOperation(
            block_id=f"BLK-{datetime.now().strftime('%Y%m%d')}-{uuid4().hex[:8].upper()}",
            created_at=datetime.now().astimezone(),
            department=department,
            corridor=corridor,
            from_station=from_station,
            to_station=to_station,
            start_time=start_time,
            duration_minutes=duration_minutes,
            impacted_trains=tuple(str(train) for train in impacted_trains),
        )
        with self._lock:
            self._operations.append(operation)
        return operation

    def monthly_csv(self, month: int, year: int) -> str:
        """Return RFC-compliant CSV for operations committed in the requested month."""
        with self._lock:
            matching = [
                operation
                for operation in self._operations
                if operation.created_at.year == year and operation.created_at.month == month
            ]

        output = StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow([
            "BlockID", "Department", "Corridor", "From", "To",
            "StartTime", "Duration", "ImpactedTrains",
        ])
        for operation in matching:
            writer.writerow([
                operation.block_id,
                operation.department,
                operation.corridor,
                operation.from_station,
                operation.to_station,
                operation.start_time,
                operation.duration_minutes,
                "; ".join(operation.impacted_trains),
            ])
        return output.getvalue()
