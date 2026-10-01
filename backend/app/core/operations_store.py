"""SQLite operation ledger. Timetables are never modified by simulations."""
from __future__ import annotations

import csv
import json
import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from datetime import datetime, date
from io import StringIO
from pathlib import Path
from threading import RLock
from uuid import uuid4


@dataclass(frozen=True)
class BlockOperation:
    block_id: str
    created_at: str
    department: str
    corridor: str
    from_station: str
    to_station: str
    start_time: str
    duration_minutes: int
    impacted_trains: tuple[str, ...]
    operation_date: str
    status: str = 'ACTIVE'
    snapshot: dict | None = None


class OperationStore:
    def __init__(self, path=None):
        path = path or os.environ.get('SHADOW_BLOCK_DB') or str(Path(__file__).resolve().parents[2] / 'var' / 'operations.sqlite3')
        if str(path) != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self.db = sqlite3.connect(str(path), check_same_thread=False, timeout=30)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
        self.db.commit()

    @contextmanager
    def transaction(self):
        """Serialize availability re-check + reservation across threads and processes."""
        with self._lock:
            self.db.execute('BEGIN IMMEDIATE')
            try:
                yield
                self.db.commit()
            except Exception:
                self.db.rollback()
                raise

    def record(self, *, department, corridor, from_station, to_station, start_time,
               duration_minutes, impacted_trains=(), operation_date=None, snapshot=None):
        operation = BlockOperation(
            block_id=f"BLK-{date.today():%Y%m%d}-{uuid4().hex[:8].upper()}",
            created_at=datetime.now().astimezone().isoformat(), department=department,
            corridor=corridor, from_station=from_station, to_station=to_station,
            start_time=start_time, duration_minutes=duration_minutes,
            impacted_trains=tuple(str(t) for t in impacted_trains),
            operation_date=str(operation_date or date.today()), snapshot=snapshot)
        with self._lock:
            nested = self.db.in_transaction
            self.db.execute('INSERT INTO operations VALUES (?, ?)', (operation.block_id, json.dumps(asdict(operation))))
            if not nested:
                self.db.commit()
        return operation

    def list(self):
        with self._lock:
            return [json.loads(row[0]) for row in self.db.execute('SELECT data FROM operations ORDER BY rowid DESC')]

    def close_operation(self, block_id):
        with self.transaction():
            row = self.db.execute('SELECT data FROM operations WHERE id=?', (block_id,)).fetchone()
            if row is None:
                return False
            data = json.loads(row[0])
            data['status'] = 'CLOSED'
            self.db.execute('UPDATE operations SET data=? WHERE id=?', (json.dumps(data), block_id))
        return True

    def monthly_csv(self, month, year):
        output = StringIO(newline='')
        writer = csv.writer(output)
        writer.writerow(['BlockID', 'Department', 'Corridor', 'From', 'To', 'StartTime', 'Duration', 'ImpactedTrains'])
        for op in self.list():
            if op['operation_date'][:7] == f'{year:04d}-{month:02d}':
                cells = [op['block_id'], op['department'], op['corridor'], op['from_station'],
                         op['to_station'], op['start_time'], op['duration_minutes'], '; '.join(op['impacted_trains'])]
                writer.writerow(["'" + c if isinstance(c, str) and c.startswith(('=', '+', '-', '@')) else c for c in cells])
        return output.getvalue()

    def close(self):
        with self._lock:
            self.db.close()
