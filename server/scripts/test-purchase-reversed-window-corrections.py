#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for name in (
    "0001_core.sql",
    "0027_purchase_receipt_allocation.sql",
    "0028_purchase_allocation_cancel_guard.sql",
    "0030_purchase_unapplied_weight_attribution.sql",
    "0032_purchase_reversed_window_corrections.sql",
):
    db.executescript((root / "migrations/tenant" / name).read_text())

TENANT = "demo"
QUEUE = "q" * 64
WINDOW = "WIN-REVERSED"
NOW = "2026-07-31T00:00:00.000Z"


def expect_error(code: str, work) -> None:
    try:
        work()
    except sqlite3.DatabaseError as error:
        assert code in str(error), (code, error)
    else:
        raise AssertionError(f"expected {code}")


def document(doctype: str, name: str, row_id: str) -> None:
    db.execute(
        """INSERT INTO documents
        (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (TENANT, f"{doctype}:{name}", doctype, name, "Administrator", 2 if doctype == "Purchase Receipt" else 1,
         "Cancelled" if doctype == "Purchase Receipt" else "Submitted", 2 if doctype == "Purchase Receipt" else 1,
         NOW, NOW, "{}"),
    )
    db.execute(
        "INSERT INTO document_children VALUES(?,?,?,?,?,?,?)",
        (TENANT, f"{doctype}:{name}", "items", f"{doctype} Item", row_id, 1, "{}"),
    )


def allocation(entry_id: str, kind: str, qty: int, *, reversal_of: str | None = None) -> None:
    db.execute(
        """INSERT INTO purchase_receipt_allocation_entries(
        tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
        receipt_item_row_id,purchase_order,purchase_order_item_row_id,entry_kind,qty_micros,
        barem_weight_micros,projected_actual_weight_micros,projection_version,allocation_sequence,
        posting_at,committed_at,actor,reason,command_id,source,resolution,reversal_of_entry_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (TENANT, entry_id, QUEUE, WINDOW, "Purchase Receipt", "PR-1", 2, entry_id,
         "PR-ROW", "PO-1", "PO-ROW", kind, qty, qty, qty, 1, 1,
         NOW, NOW, "Administrator", "cancel correction", f"cmd-{entry_id}", "live", "resolved", reversal_of),
    )


def unapplied(entry_id: str, kind: str, qty: int, *, source_entry_id: str | None = None) -> None:
    db.execute(
        """INSERT INTO purchase_unapplied_receipt_entries(
        tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
        receipt_item_row_id,entry_kind,qty_micros,source_entry_id,allocation_entry_id,posting_at,
        committed_at,actor,reason,command_id,barem_weight_micros,
        projected_actual_weight_micros,projection_version)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (TENANT, entry_id, QUEUE, WINDOW, "Purchase Receipt", "PR-1", 2, entry_id,
         "PR-ROW", kind, qty, source_entry_id, None, NOW, NOW, "Administrator", "cancel correction",
         f"cmd-{entry_id}", qty, qty, 1),
    )


document("Purchase Order", "PO-1", "PO-ROW")
document("Purchase Receipt", "PR-1", "PR-ROW")
db.execute(
    "INSERT INTO purchase_obligation_queues VALUES(?,?,?,?,?,?,?,?,?,?)",
    (TENANT, QUEUE, "Alumdoor", "FACTORY-1", "m" * 64, 1, "{}", 0, NOW, NOW),
)
db.execute(
    "INSERT INTO purchase_settlement_windows VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    (TENANT, WINDOW, QUEUE, 1, "Open", 500, 0, NOW, None, None, None),
)
db.execute(
    """INSERT INTO purchase_window_obligation_entries(
    tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
    purchase_order,purchase_order_item_row_id,entry_kind,qty_micros,transaction_date,
    purchase_order_created_at,item_idx,committed_at,actor,command_id,source,resolution)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (TENANT, "OBL-1", QUEUE, WINDOW, "Purchase Order", "PO-1", 1, "OBL-1", "PO-1", "PO-ROW",
     "open", 10, "2026-07-01", NOW, 1, NOW, "Administrator", "cmd-obl", "live", "resolved"),
)
allocation("ALLOC-1", "allocate", 6)
unapplied("UNAPPLIED-1", "receive", 4)
db.execute(
    "UPDATE purchase_settlement_windows SET status='Reversed', settled_at=?, settled_by='Administrator', settlement_reason='reversed for correction' WHERE tenant_id=? AND window_id=?",
    (NOW, TENANT, WINDOW),
)

allocation("ALLOC-1-REV", "reverse", -6, reversal_of="ALLOC-1")
unapplied("UNAPPLIED-1-REV", "reverse", -4, source_entry_id="UNAPPLIED-1")

assert db.execute(
    "SELECT SUM(qty_micros) FROM purchase_receipt_allocation_entries WHERE tenant_id=? AND window_id=?",
    (TENANT, WINDOW),
).fetchone() == (0,)
assert db.execute(
    "SELECT SUM(qty_micros) FROM purchase_unapplied_receipt_entries WHERE tenant_id=? AND window_id=?",
    (TENANT, WINDOW),
).fetchone() == (0,)

expect_error("PURCHASE_ALLOCATION_WINDOW_NOT_OPEN", lambda: allocation("ALLOC-NEW", "allocate", 1))
expect_error("PURCHASE_ALLOCATION_WINDOW_NOT_OPEN", lambda: unapplied("UNAPPLIED-NEW", "receive", 1))

print("purchase reversed-window correction migration tests passed")
