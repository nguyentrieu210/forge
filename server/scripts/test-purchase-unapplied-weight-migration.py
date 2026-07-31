#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")
connection.executescript((root / "migrations/tenant/0001_core.sql").read_text())
connection.executescript((root / "migrations/tenant/0027_purchase_receipt_allocation.sql").read_text())
connection.executescript((root / "migrations/tenant/0030_purchase_unapplied_weight_attribution.sql").read_text())

TENANT = "demo"
QUEUE = "a" * 64
WINDOW = "WIN-1"
NOW = "2026-07-31T00:00:00.000Z"


def expect_database_error(code: str, work) -> None:
    try:
        work()
    except sqlite3.DatabaseError as error:
        assert code in str(error), (code, error)
    else:
        raise AssertionError(f"expected database error {code}")


connection.execute(
    "INSERT INTO purchase_obligation_queues VALUES(?,?,?,?,?,?,?,?,?,?)",
    (TENANT, QUEUE, "Alumdoor", "FACTORY-1", "b" * 64, 1, "{}", 0, NOW, NOW),
)
connection.execute(
    "INSERT INTO purchase_settlement_windows VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    (TENANT, WINDOW, QUEUE, 1, "Open", 500, 0, NOW, None, None, None),
)


def insert_unapplied(
    entry_id: str,
    kind: str,
    qty: int,
    barem: int,
    projected_actual: int | None,
    projection_version: int | None,
    *,
    source_entry_id: str | None = None,
) -> None:
    connection.execute(
        """INSERT INTO purchase_unapplied_receipt_entries(
        tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
        receipt_item_row_id,entry_kind,qty_micros,source_entry_id,allocation_entry_id,posting_at,
        committed_at,actor,reason,command_id,barem_weight_micros,
        projected_actual_weight_micros,projection_version)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            TENANT, entry_id, QUEUE, WINDOW, "Purchase Receipt", "PR-01", 1, entry_id,
            "PR-ROW-1", kind, qty, source_entry_id, None, NOW, NOW, "Administrator",
            "migration test", f"cmd-{entry_id}", barem, projected_actual, projection_version,
        ),
    )


insert_unapplied("UNAPPLIED-1", "receive", 20_000_000, 56_016_000, 54_782_609, 1)
insert_unapplied(
    "UNAPPLIED-1-REV", "reverse", -5_000_000, -14_004_000, -13_695_652, 1,
    source_entry_id="UNAPPLIED-1",
)

row = connection.execute(
    """SELECT SUM(qty_micros), SUM(barem_weight_micros),
              SUM(projected_actual_weight_micros)
       FROM purchase_unapplied_receipt_entries
       WHERE tenant_id=? AND (entry_id=? OR source_entry_id=?)""",
    (TENANT, "UNAPPLIED-1", "UNAPPLIED-1"),
).fetchone()
assert row == (15_000_000, 42_012_000, 41_086_957), row

expect_database_error(
    "PURCHASE_UNAPPLIED_BAREM_SIGN",
    lambda: insert_unapplied("BAD-BAREM", "receive", 1, -1, None, None),
)
expect_database_error(
    "PURCHASE_UNAPPLIED_ACTUAL_WEIGHT_SIGN",
    lambda: insert_unapplied("BAD-ACTUAL", "receive", 1, 1, -1, 1),
)
expect_database_error(
    "PURCHASE_UNAPPLIED_PROJECTION_PAIR",
    lambda: insert_unapplied("BAD-PAIR", "receive", 1, 1, 1, None),
)
expect_database_error(
    "PURCHASE_UNAPPLIED_PROJECTION_VERSION",
    lambda: insert_unapplied("BAD-VERSION", "receive", 1, 1, 1, 0),
)
expect_database_error(
    "PURCHASE_UNAPPLIED_BAREM_SIGN",
    lambda: insert_unapplied(
        "BAD-REVERSE", "reverse", -1, 1, -1, 1, source_entry_id="UNAPPLIED-1"
    ),
)

columns = {
    row[1] for row in connection.execute("PRAGMA table_info(purchase_unapplied_receipt_entries)")
}
assert {
    "barem_weight_micros",
    "projected_actual_weight_micros",
    "projection_version",
} <= columns

print("purchase unapplied weight migration tests passed")
