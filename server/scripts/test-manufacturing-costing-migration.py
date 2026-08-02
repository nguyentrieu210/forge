#!/usr/bin/env python3
"""Verify immutable manufacturing costing migration invariants."""

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/tenant/0037_manufacturing_costing.sql"


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
    "MCS-WO1-A",
    "WO-1",
    "ALUMDOOR",
    "VND",
    0,
    10_000_000,
    10_000_000,
    1_500_000,
    1_650_000,
    0,
    150_000,
    150_000,
    "a" * 64,
    '{"work_order":"WO-1","ready_to_finalize":true}',
    "accountant@example.com",
    "2026-08-02T08:00:00.000Z",
)
db.execute(
    "INSERT INTO manufacturing_cost_snapshots VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    snapshot,
)

# Same Work Order + same source fingerprint is idempotent at storage level.
expect_integrity(
    db,
    "INSERT INTO manufacturing_cost_snapshots VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    (
        "demo",
        "MCS-WO1-B",
        snapshot[2], snapshot[3], snapshot[4], snapshot[5], snapshot[6], snapshot[7],
        snapshot[8], snapshot[9], snapshot[10], snapshot[11], snapshot[12], snapshot[13],
        snapshot[14], snapshot[15], snapshot[16],
    ),
    "UNIQUE constraint failed",
)

# Snapshot is immutable immediately after creation.
expect_integrity(
    db,
    "UPDATE manufacturing_cost_snapshots SET actual_total_cost_minor=0 WHERE tenant_id=? AND snapshot_id=?",
    ("demo", "MCS-WO1-A"),
    "MANUFACTURING_COST_SNAPSHOT_IMMUTABLE",
)

adjustment = (
    "demo",
    "MCA-1",
    "MCS-WO1-A",
    "Overhead",
    50_000,
    "Late electricity invoice",
    "chief-accountant@example.com",
    "2026-08-02T09:00:00.000Z",
    '{"invoice":"HD-01"}',
)

# No post-close rewrite disguised as an adjustment before the cost sheet is frozen.
expect_integrity(
    db,
    "INSERT INTO manufacturing_cost_adjustments VALUES(?,?,?,?,?,?,?,?,?)",
    adjustment,
    "MANUFACTURING_COST_NOT_FROZEN",
)

# A freeze must point to the same Work Order as the chosen immutable snapshot.
expect_integrity(
    db,
    "INSERT INTO manufacturing_cost_freezes VALUES(?,?,?,?,?,?)",
    (
        "demo",
        "WO-WRONG",
        "MCS-WO1-A",
        "chief-accountant@example.com",
        "2026-08-02T08:30:00.000Z",
        "Close Work Order",
    ),
    "MANUFACTURING_COST_FREEZE_MISMATCH",
)

db.execute(
    "INSERT INTO manufacturing_cost_freezes VALUES(?,?,?,?,?,?)",
    (
        "demo",
        "WO-1",
        "MCS-WO1-A",
        "chief-accountant@example.com",
        "2026-08-02T08:30:00.000Z",
        "Close Work Order",
    ),
)
db.execute(
    "INSERT INTO manufacturing_cost_adjustments VALUES(?,?,?,?,?,?,?,?,?)",
    adjustment,
)

# Storage, not only application pre-checks, prevents concurrent negative adjustments from
# pushing the aggregate actual manufacturing cost below zero.
expect_integrity(
    db,
    "INSERT INTO manufacturing_cost_adjustments VALUES(?,?,?,?,?,?,?,?,?)",
    (
        "demo",
        "MCA-NEGATIVE",
        "MCS-WO1-A",
        "Other",
        -1_700_001,
        "Impossible correction",
        "chief-accountant@example.com",
        "2026-08-02T09:05:00.000Z",
        "{}",
    ),
    "MANUFACTURING_COST_NEGATIVE_TOTAL",
)

row = db.execute(
    """
    SELECT standard_total_cost_minor,actual_total_cost_minor,
           adjusted_actual_total_cost_minor,total_variance_minor,
           adjusted_total_variance_minor,adjustment_count,frozen_by
    FROM manufacturing_cost_report
    WHERE tenant_id='demo' AND snapshot_id='MCS-WO1-A'
    """
).fetchone()
assert row == (
    1_500_000,
    1_650_000,
    1_700_000,
    150_000,
    200_000,
    1,
    "chief-accountant@example.com",
), row

# Freeze and adjustments are append-only audit records.
expect_integrity(
    db,
    "DELETE FROM manufacturing_cost_freezes WHERE tenant_id=? AND work_order=?",
    ("demo", "WO-1"),
    "MANUFACTURING_COST_FREEZE_IMMUTABLE",
)
expect_integrity(
    db,
    "UPDATE manufacturing_cost_adjustments SET reason='rewritten' WHERE tenant_id=? AND adjustment_id=?",
    ("demo", "MCA-1"),
    "MANUFACTURING_COST_ADJUSTMENT_IMMUTABLE",
)

print("MANUFACTURING_COSTING_MIGRATION_0037_PASS")
