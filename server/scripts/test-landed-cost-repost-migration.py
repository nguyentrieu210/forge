#!/usr/bin/env python3
"""SQLite regression for R8-B Landed Cost history fingerprint guard."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")

db.execute(
    """CREATE TABLE documents(
      tenant_id TEXT NOT NULL,
      doc_key TEXT NOT NULL,
      doctype TEXT NOT NULL,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      docstatus INTEGER NOT NULL,
      status TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY(tenant_id, doc_key),
      UNIQUE(tenant_id, doctype, name)
    )"""
)
db.execute(
    """CREATE TABLE stock_ledger_entries(
      tenant_id TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      voucher_no TEXT NOT NULL,
      voucher_revision INTEGER NOT NULL,
      line_key TEXT NOT NULL,
      item_code TEXT NOT NULL,
      warehouse TEXT NOT NULL,
      actual_qty_micros INTEGER NOT NULL,
      actual_weight_micros INTEGER,
      valuation_rate_minor INTEGER NOT NULL,
      stock_value_difference_minor INTEGER NOT NULL,
      qty_scale INTEGER NOT NULL,
      currency_scale INTEGER NOT NULL,
      currency TEXT NOT NULL,
      posting_at TEXT NOT NULL,
      batch_no TEXT,
      serial_no TEXT,
      allow_negative_stock INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
    )"""
)
db.execute(
    """CREATE TABLE doctype_definitions(
      tenant_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      module TEXT NOT NULL,
      is_custom INTEGER NOT NULL,
      is_submittable INTEGER NOT NULL,
      is_child INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      disabled INTEGER NOT NULL,
      modified_by TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,doctype)
    )"""
)

db.executescript((root / "migrations/tenant/0142_landed_cost_valuation_identity.sql").read_text(encoding="utf-8"))

db.executescript((root / "migrations/tenant/0161_landed_cost_chronological_fingerprint.sql").read_text(encoding="utf-8"))

db.executescript((root / "migrations/tenant/0167_landed_cost_transfer_propagation_fingerprint.sql").read_text(encoding="utf-8"))

def insert_sle(voucher_type, voucher_no, revision, line_key, qty, value, posting_at, warehouse="Stores", source_row_id=None):
    db.execute(
        """INSERT INTO stock_ledger_entries(
          tenant_id,voucher_type,voucher_no,voucher_revision,line_key,source_row_id,
          item_code,warehouse,actual_qty_micros,valuation_rate_minor,
          stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at,allow_negative_stock
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)""",
        (
            "demo", voucher_type, voucher_no, revision, line_key,
            source_row_id or ("PR-ROW" if voucher_type == "Purchase Receipt" else "ISSUE-ROW"),
            "ITEM-1", warehouse, qty, 1000, value, 6, 2, "USD", posting_at,
        ),
    )


def payload(row_count, qty, value):
    return {
        "posting_at": "2026-10-02T08:45:00.000Z",
        "allocations": [{
            "row_id": "ALLOC-1",
            "item_code": "ITEM-1",
            "warehouse": "Stores",
            "history_row_count": row_count,
            "history_qty_micros": qty,
            "history_value_minor": value,
        }],
    }


def insert_lcv(name, data):
    db.execute(
        """INSERT INTO documents(
          tenant_id,doc_key,doctype,name,owner,docstatus,status,version,
          created_at,modified_at,payload_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (
            "demo", f"Landed Cost Voucher:{name}", "Landed Cost Voucher", name,
            "qa@example.test", 0, "Draft", 1,
            "2026-10-02T09:00:00Z", "2026-10-02T09:00:00Z", json.dumps(data),
        ),
    )


insert_sle("Purchase Receipt", "PR-1", 2, "RECEIPT", 1_000_000, 1000, "2026-10-02T08:00:00.000Z")
insert_sle("Stock Entry", "ISSUE-1", 2, "SRC-1", -500_000, -500, "2026-10-02T08:30:00.000Z")
db.commit()

# Unchanged source history: submit transition is allowed.
insert_lcv("LCV-OK", payload(2, 500_000, 500))
db.execute(
    "UPDATE documents SET docstatus=1,status='Submitted',version=2 WHERE tenant_id='demo' AND doctype='Landed Cost Voucher' AND name='LCV-OK'"
)
db.commit()

# Stale plan: a stock mutation wins before the LCV submit reaches the commit guard.
insert_lcv("LCV-RACE", payload(2, 500_000, 500))
db.commit()
insert_sle("Stock Entry", "ISSUE-RACE", 2, "SRC-RACE", -100_000, -100, "2026-10-02T08:40:00.000Z")
db.commit()
try:
    db.execute(
        "UPDATE documents SET docstatus=1,status='Submitted',version=2 WHERE tenant_id='demo' AND doctype='Landed Cost Voucher' AND name='LCV-RACE'"
    )
except sqlite3.IntegrityError as error:
    assert "Landed Cost stock history changed after planning" in str(error), str(error)
    db.rollback()
else:
    raise AssertionError("stale Landed Cost history fingerprint must reject submit")

# Propagated destination history is guarded independently from the receipt warehouse.
insert_sle("Stock Entry", "TRANSFER-1", 2, "TGT-ROW", 500_000, 500, "2026-10-02T08:30:00.000Z", warehouse="Transit", source_row_id="TRANSFER-ROW")
source_count, source_qty, source_value = db.execute(
    "SELECT COUNT(*),COALESCE(SUM(actual_qty_micros),0),COALESCE(SUM(stock_value_difference_minor),0) FROM stock_ledger_entries WHERE tenant_id='demo' AND item_code='ITEM-1' AND warehouse='Stores'"
).fetchone()
target_count, target_qty, target_value = db.execute(
    "SELECT COUNT(*),COALESCE(SUM(actual_qty_micros),0),COALESCE(SUM(stock_value_difference_minor),0) FROM stock_ledger_entries WHERE tenant_id='demo' AND item_code='ITEM-1' AND warehouse='Transit'"
).fetchone()
data = payload(source_count, source_qty, source_value)
data["allocations"][0]["history_until"] = "9999-12-31T23:59:59.999Z"
data["allocations"][0]["propagation_fingerprints"] = [{
    "item_code": "ITEM-1",
    "warehouse": "Transit",
    "history_until": "9999-12-31T23:59:59.999Z",
    "history_row_count": target_count,
    "history_qty_micros": target_qty,
    "history_value_minor": target_value,
}]
insert_lcv("LCV-TARGET-RACE", data)
db.commit()
insert_sle("Stock Entry", "TARGET-RACE", 2, "SRC-TARGET-RACE", -100_000, -100, "2026-10-02T08:50:00.000Z", warehouse="Transit")
db.commit()
try:
    db.execute("UPDATE documents SET docstatus=1 WHERE name='LCV-TARGET-RACE'")
except sqlite3.IntegrityError as error:
    assert "propagated stock history changed" in str(error), str(error)
    db.rollback()
else:
    raise AssertionError("destination stock mutation must invalidate Landed Cost propagation plan")

assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
# A chronological plan must include stock entries after its own posting time.
data = payload(3, 400_000, 400)
data["posting_at"] = "2026-10-02T08:15:00.000Z"
data["allocations"][0]["history_until"] = "9999-12-31T23:59:59.999Z"
insert_lcv("LCV-FUTURE-RACE", data)
db.commit()
insert_sle("Stock Entry", "LATER-RACE", 2, "SRC-LATER", -100_000, -100, "2026-10-02T08:55:00.000Z")
db.commit()
try:
    db.execute("UPDATE documents SET docstatus=1 WHERE name='LCV-FUTURE-RACE'")
except sqlite3.IntegrityError as error:
    assert "history changed" in str(error)
    db.rollback()
else:
    raise AssertionError("later stock mutation must invalidate chronological plan")
# Chronological cancel excludes its own rows and checks the unchanged external history.
data = payload(4, 300_000, 300)
data["allocations"][0]["history_until"] = "9999-12-31T23:59:59.999Z"
data["allocations"][0]["chronological_reposts"] = [{"difference_minor": -250}]
insert_lcv("LCV-CANCEL", data)
db.execute("UPDATE documents SET docstatus=1 WHERE name='LCV-CANCEL'")
insert_sle("Landed Cost Voucher", "LCV-CANCEL", 2, "LCV-ALLOC-1", 0, 500, "2026-10-02T08:15:00.000Z")
db.execute("UPDATE documents SET docstatus=2 WHERE name='LCV-CANCEL'")
db.commit()
# A new external mutation makes the otherwise identical cancel plan stale.
data = payload(5, 300_000, 800)
data["allocations"][0]["history_until"] = "9999-12-31T23:59:59.999Z"
data["allocations"][0]["chronological_reposts"] = [{"difference_minor": -250}]
insert_lcv("LCV-CANCEL-RACE", data)
db.execute("UPDATE documents SET docstatus=1 WHERE name='LCV-CANCEL-RACE'")
db.commit()
insert_sle("Stock Entry", "CANCEL-RACE", 2, "SRC-CANCEL", -100_000, -100, "2026-10-02T08:56:00.000Z")
db.commit()
try:
    db.execute("UPDATE documents SET docstatus=2 WHERE name='LCV-CANCEL-RACE'")
except sqlite3.IntegrityError as error:
    assert "history changed" in str(error)
    db.rollback()
else:
    raise AssertionError("later stock mutation must invalidate chronological cancel")
print("LANDED_COST_REPOST_MIGRATION_PASS")
