#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")
connection.executescript((root / "migrations/tenant/0001_core.sql").read_text())
connection.executescript((root / "migrations/tenant/0027_purchase_receipt_allocation.sql").read_text())

TENANT = "demo"
QUEUE = "a" * 64
MATERIAL = "b" * 64
WINDOW = "WIN-1"
NOW = "2026-07-30T16:30:00.000Z"


def expect_database_error(code: str, work) -> None:
    try:
        work()
    except sqlite3.DatabaseError as error:
        assert code in str(error), (code, error)
    else:
        raise AssertionError(f"expected database error {code}")


def insert_document(doctype: str, name: str, rows: list[tuple[str, int]]) -> None:
    connection.execute(
        """INSERT INTO documents
        (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (TENANT, f"{doctype}:{name}", doctype, name, "Administrator", 1, "Submitted", 1, NOW, NOW, "{}"),
    )
    for row_id, idx in rows:
        connection.execute(
            "INSERT INTO document_children VALUES(?,?,?,?,?,?,?)",
            (TENANT, f"{doctype}:{name}", "items", f"{doctype} Item", row_id, idx, "{}"),
        )


def insert_obligation(entry_id: str, po: str, row_id: str, qty_micros: int, idx: int) -> None:
    connection.execute(
        """INSERT INTO purchase_window_obligation_entries(
        tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
        purchase_order,purchase_order_item_row_id,entry_kind,qty_micros,transaction_date,
        purchase_order_created_at,item_idx,committed_at,actor,command_id,source,resolution)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            TENANT, entry_id, QUEUE, WINDOW, "Purchase Order", po, 1, entry_id,
            po, row_id, "open", qty_micros, "2026-07-01", NOW, idx, NOW,
            "Administrator", f"cmd-{entry_id}", "live", "resolved",
        ),
    )


def insert_allocation(
    entry_id: str,
    receipt: str,
    receipt_row: str,
    po: str,
    po_row: str,
    qty_micros: int,
    sequence: int,
    *,
    kind: str = "allocate",
    reversal_of: str | None = None,
) -> None:
    sign = 1 if qty_micros > 0 else -1
    connection.execute(
        """INSERT INTO purchase_receipt_allocation_entries(
        tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
        receipt_item_row_id,purchase_order,purchase_order_item_row_id,entry_kind,qty_micros,
        barem_weight_micros,projected_actual_weight_micros,projection_version,allocation_sequence,
        posting_at,committed_at,actor,reason,command_id,source,resolution,reversal_of_entry_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            TENANT, entry_id, QUEUE, WINDOW, "Purchase Receipt", receipt, 1, entry_id,
            receipt_row, po, po_row, kind, qty_micros, sign * abs(qty_micros),
            None, None, sequence, NOW, NOW, "Administrator", None,
            f"cmd-{entry_id}", "live", "resolved", reversal_of,
        ),
    )


insert_document("Purchase Order", "PO-01", [("PO-01-ROW-1", 1)])
insert_document("Purchase Order", "PO-02", [("PO-02-ROW-1", 1)])
insert_document("Purchase Receipt", "PR-01", [("PR-01-ROW-1", 1)])
insert_document("Purchase Receipt", "PR-02", [("PR-02-ROW-1", 1)])

connection.execute(
    "INSERT INTO purchase_obligation_queues VALUES(?,?,?,?,?,?,?,?,?,?)",
    (TENANT, QUEUE, "Alumdoor", "FACTORY-1", MATERIAL, 1, "{}", 0, NOW, NOW),
)
connection.execute(
    "INSERT INTO purchase_settlement_windows VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    (TENANT, WINDOW, QUEUE, 1, "Open", 500, 0, NOW, None, None, None),
)

insert_obligation("OBL-01", "PO-01", "PO-01-ROW-1", 200_000_000, 1)
insert_obligation("OBL-02", "PO-02", "PO-02-ROW-1", 100_000_000, 1)
insert_allocation("ALLOC-01", "PR-01", "PR-01-ROW-1", "PO-01", "PO-01-ROW-1", 200_000_000, 1)
insert_allocation("ALLOC-02", "PR-01", "PR-01-ROW-1", "PO-02", "PO-02-ROW-1", 30_000_000, 2)

balances = connection.execute(
    """SELECT purchase_order, nominal_qty_micros, allocated_qty_micros, remaining_qty_micros
       FROM purchase_obligation_balances ORDER BY purchase_order"""
).fetchall()
assert balances == [
    ("PO-01", 200_000_000, 200_000_000, 0),
    ("PO-02", 100_000_000, 30_000_000, 70_000_000),
], balances

expect_database_error(
    "PURCHASE_ALLOCATION_QUANTITY_EXCEEDED",
    lambda: insert_allocation("ALLOC-OVER", "PR-02", "PR-02-ROW-1", "PO-02", "PO-02-ROW-1", 70_000_001, 1),
)
expect_database_error(
    "PURCHASE_ALLOCATION_RECEIPT_ROW_NOT_FOUND",
    lambda: insert_allocation("ALLOC-MISSING-ROW", "PR-02", "NO-SUCH-ROW", "PO-02", "PO-02-ROW-1", 1, 1),
)

insert_allocation(
    "ALLOC-02-REV", "PR-01", "PR-01-ROW-1", "PO-02", "PO-02-ROW-1",
    -10_000_000, 3, kind="reverse", reversal_of="ALLOC-02",
)
expect_database_error(
    "PURCHASE_ALLOCATION_REVERSAL_EXCEEDED",
    lambda: insert_allocation(
        "ALLOC-02-REV-OVER", "PR-01", "PR-01-ROW-1", "PO-02", "PO-02-ROW-1",
        -21_000_000, 4, kind="reverse", reversal_of="ALLOC-02",
    ),
)

connection.execute(
    "INSERT INTO purchase_allocation_revision_claims VALUES(?,?,?,?,?,?)",
    (TENANT, "REV-1", "queue", QUEUE, 0, NOW),
)
assert connection.execute(
    "SELECT revision FROM purchase_obligation_queues WHERE tenant_id=? AND queue_key=?",
    (TENANT, QUEUE),
).fetchone() == (1,)

connection.commit()
try:
    connection.execute("BEGIN")
    insert_allocation("ALLOC-ATOMIC", "PR-02", "PR-02-ROW-1", "PO-02", "PO-02-ROW-1", 1, 1)
    connection.execute(
        "INSERT INTO purchase_allocation_revision_claims VALUES(?,?,?,?,?,?)",
        (TENANT, "REV-STALE", "queue", QUEUE, 0, NOW),
    )
    connection.commit()
    raise AssertionError("stale revision did not abort the transaction")
except sqlite3.DatabaseError as error:
    connection.rollback()
    assert "PURCHASE_ALLOCATION_REVISION_CONFLICT" in str(error), error
assert connection.execute(
    "SELECT COUNT(*) FROM purchase_receipt_allocation_entries WHERE entry_id='ALLOC-ATOMIC'"
).fetchone() == (0,)

expect_database_error(
    "CHECK constraint failed",
    lambda: connection.execute(
        "INSERT INTO purchase_settlement_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (TENANT, "SETTLE-BAD", QUEUE, WINDOW, "close", 300_000_000, 284_000_000,
         285_000_000, 315_000_000, 16_000_000, 0, NOW, "Administrator", "bad", "cmd-bad", None),
    ),
)
connection.execute(
    "INSERT INTO purchase_settlement_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    (TENANT, "SETTLE-1", QUEUE, WINDOW, "close", 300_000_000, 285_000_000,
     285_000_000, 315_000_000, 15_000_000, 0, NOW, "Administrator", "factory final delivery", "cmd-settle", None),
)
assert connection.execute(
    "SELECT status FROM purchase_settlement_windows WHERE tenant_id=? AND window_id=?",
    (TENANT, WINDOW),
).fetchone() == ("Settled",)

connection.execute(
    "INSERT INTO purchase_settlement_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    (TENANT, "SETTLE-REV", QUEUE, WINDOW, "reverse", 300_000_000, 285_000_000,
     285_000_000, 315_000_000, 15_000_000, 0, NOW, "Administrator", "correct settlement", "cmd-reverse", "SETTLE-1"),
)
assert connection.execute(
    "SELECT status FROM purchase_settlement_windows WHERE tenant_id=? AND window_id=?",
    (TENANT, WINDOW),
).fetchone() == ("Reversed",)

required_tables = {
    "purchase_obligation_queues",
    "purchase_settlement_windows",
    "purchase_window_obligation_entries",
    "purchase_receipt_allocation_entries",
    "purchase_unapplied_receipt_entries",
    "purchase_settlement_entries",
    "purchase_allocation_revision_claims",
}
actual_tables = {
    row[0] for row in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'purchase_%'"
    )
}
assert required_tables <= actual_tables, required_tables - actual_tables

print("purchase receipt allocation migration tests passed")
