#!/usr/bin/env python3
"""Verify immutable Daily Detailed Ledger migration invariants."""

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/tenant/0033_daily_detailed_ledger.sql"


def expect_integrity(db, sql, params, code):
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError as error:
        assert code in str(error), str(error)
    else:
        raise AssertionError(f"Expected {code}")


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(MIGRATION.read_text(encoding="utf-8"))

snapshot = (
    "demo",
    "DLS-20260801-001",
    "2026-08-01|Demo|Main|CUST-1|SO-1",
    "2026-08-01",
    "Demo",
    "Main",
    "CUST-1",
    "SO-1",
    "a" * 64,
    "accountant@example.com",
    "2026-08-01T17:00:00.000Z",
)
db.execute(
    "INSERT INTO daily_ledger_snapshots VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    snapshot,
)
db.execute(
    "INSERT INTO daily_ledger_snapshot_lines VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    (
        "demo",
        "DLS-20260801-001",
        "Inventory:Stock Entry:STE-1:ITEM-1",
        "Inventory",
        "Stock Entry",
        "STE-1",
        "stock_value_difference",
        2_000_000,
        150_000,
        "VND",
        '{"item_code":"ITEM-1"}',
    ),
)

# Re-running the exact same context/fingerprint cannot create a duplicate snapshot.
expect_integrity(
    db,
    "INSERT INTO daily_ledger_snapshots VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    (
        "demo",
        "DLS-20260801-002",
        snapshot[2],
        snapshot[3],
        snapshot[4],
        snapshot[5],
        snapshot[6],
        snapshot[7],
        snapshot[8],
        snapshot[9],
        snapshot[10],
    ),
    "UNIQUE constraint failed",
)

# Snapshot and source lines are immutable immediately after creation.
expect_integrity(
    db,
    "UPDATE daily_ledger_snapshots SET company='Changed' WHERE tenant_id=? AND snapshot_id=?",
    ("demo", "DLS-20260801-001"),
    "DAILY_LEDGER_IMMUTABLE",
)
expect_integrity(
    db,
    "UPDATE daily_ledger_snapshot_lines SET amount_minor=0 WHERE tenant_id=? AND snapshot_id=? AND line_key=?",
    ("demo", "DLS-20260801-001", "Inventory:Stock Entry:STE-1:ITEM-1"),
    "DAILY_LEDGER_IMMUTABLE",
)

# Corrections are only accepted after a context is frozen.
adjustment = (
    "demo",
    "DLA-1",
    "DLS-20260801-001",
    "Inventory:Stock Entry:STE-1:ITEM-1",
    "Approved stock valuation correction",
    "chief-accountant@example.com",
    "2026-08-02T08:00:00.000Z",
    -250_000,
    -25_000,
    '{"ticket":"ACC-42"}',
)
expect_integrity(
    db,
    "INSERT INTO daily_ledger_adjustments VALUES(?,?,?,?,?,?,?,?,?,?)",
    adjustment,
    "DAILY_LEDGER_NOT_FROZEN",
)
expect_integrity(
    db,
    "INSERT INTO daily_ledger_freezes VALUES(?,?,?,?,?,?)",
    (
        "demo",
        "wrong-context",
        "DLS-20260801-001",
        "chief-accountant@example.com",
        "2026-08-01T18:00:00.000Z",
        "Close day",
    ),
    "DAILY_LEDGER_FREEZE_CONTEXT_MISMATCH",
)

db.execute(
    "INSERT INTO daily_ledger_freezes VALUES(?,?,?,?,?,?)",
    (
        "demo",
        snapshot[2],
        "DLS-20260801-001",
        "chief-accountant@example.com",
        "2026-08-01T18:00:00.000Z",
        "Close day",
    ),
)
db.execute(
    "INSERT INTO daily_ledger_adjustments VALUES(?,?,?,?,?,?,?,?,?,?)",
    adjustment,
)

row = db.execute(
    """
    SELECT snapshot_quantity_micros,snapshot_amount_minor,
           adjusted_quantity_micros,adjusted_amount_minor,adjustment_count,frozen_by
    FROM daily_detailed_ledger_report
    WHERE tenant_id='demo' AND snapshot_id='DLS-20260801-001'
    """
).fetchone()
assert row == (
    2_000_000,
    150_000,
    1_750_000,
    125_000,
    1,
    "chief-accountant@example.com",
), row

# Freeze and adjustment audit records are append-only too.
expect_integrity(
    db,
    "UPDATE daily_ledger_freezes SET reason='rewritten' WHERE tenant_id=? AND context_key=?",
    ("demo", snapshot[2]),
    "DAILY_LEDGER_FREEZE_IMMUTABLE",
)
expect_integrity(
    db,
    "DELETE FROM daily_ledger_adjustments WHERE tenant_id=? AND adjustment_id=?",
    ("demo", "DLA-1"),
    "DAILY_LEDGER_ADJUSTMENT_IMMUTABLE",
)

print("DAILY_DETAILED_LEDGER_MIGRATION_0033_PASS")
