#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")
for migration in [
    "0001_core.sql",
    "0027_purchase_receipt_allocation.sql",
    "0028_purchase_allocation_cancel_guard.sql",
    "0029_purchase_allocation_rollout.sql",
]:
    connection.executescript((root / "migrations/tenant" / migration).read_text())

TENANT = "alu"
NOW = "2026-07-30T17:45:00.000Z"


def expect_database_error(code: str, work) -> None:
    try:
        work()
    except sqlite3.DatabaseError as error:
        assert code in str(error), (code, error)
    else:
        raise AssertionError(f"expected database error {code}")


assert connection.execute(
    "SELECT enabled FROM purchase_allocation_rollout_state WHERE tenant_id=?",
    (TENANT,),
).fetchone() is None, "absence of rollout row must mean disabled"

connection.execute(
    """INSERT INTO purchase_allocation_rollout_state
       (tenant_id,enabled,resolved_count,unresolved_count,updated_at)
       VALUES(?,0,0,0,?)""",
    (TENANT, NOW),
)

expect_database_error(
    "CHECK constraint failed",
    lambda: connection.execute(
        """UPDATE purchase_allocation_rollout_state
           SET enabled=1,enabled_at=?,enabled_by='Administrator'
           WHERE tenant_id=?""",
        (NOW, TENANT),
    ),
)

expect_database_error(
    "CHECK constraint failed",
    lambda: connection.execute(
        """UPDATE purchase_allocation_rollout_state
           SET enabled=1,backfill_checksum=?,resolved_count=10,unresolved_count=1,
               enabled_at=?,enabled_by='Administrator'
           WHERE tenant_id=?""",
        ("a" * 64, NOW, TENANT),
    ),
)

connection.execute(
    """UPDATE purchase_allocation_rollout_state
       SET enabled=1,backfill_checksum=?,resolved_count=10,unresolved_count=0,
           enabled_at=?,enabled_by='Administrator',updated_at=?
       WHERE tenant_id=?""",
    ("a" * 64, NOW, NOW, TENANT),
)
assert connection.execute(
    "SELECT enabled,backfill_checksum,resolved_count,unresolved_count FROM purchase_allocation_rollout_state WHERE tenant_id=?",
    (TENANT,),
).fetchone() == (1, "a" * 64, 10, 0)

expect_database_error(
    "PURCHASE_ALLOCATION_ROLLOUT_CANNOT_DISABLE",
    lambda: connection.execute(
        "UPDATE purchase_allocation_rollout_state SET enabled=0,updated_at=? WHERE tenant_id=?",
        (NOW, TENANT),
    ),
)

print("purchase allocation rollout migration tests passed")
