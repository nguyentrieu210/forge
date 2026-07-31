#!/usr/bin/env python3
"""Verify migration 0031 advance guards, metadata and balance view."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/tenant/0031_finance_payment_allocations.sql"


def expect_integrity(db, sql, params, code):
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError as error:
        assert code in str(error), str(error)
    else:
        raise AssertionError(f"Expected {code}")


db = sqlite3.connect(":memory:")
db.executescript(
    """
    CREATE TABLE payment_ledger_entries (
      tenant_id TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      voucher_no TEXT NOT NULL,
      voucher_revision INTEGER NOT NULL,
      line_key TEXT NOT NULL,
      account_type TEXT NOT NULL,
      party_type TEXT NOT NULL,
      party TEXT NOT NULL,
      account TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      base_amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      currency_scale INTEGER NOT NULL,
      against_voucher_type TEXT,
      against_voucher_no TEXT,
      posting_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
    );
    CREATE TRIGGER receivable_outstanding_guard BEFORE INSERT ON payment_ledger_entries
    WHEN NEW.against_voucher_type IS NOT NULL AND NEW.amount_minor<0
    BEGIN SELECT RAISE(ABORT,'OUTSTANDING_EXCEEDED'); END;
    CREATE TRIGGER receivable_base_outstanding_guard BEFORE INSERT ON payment_ledger_entries
    WHEN NEW.against_voucher_type IS NOT NULL AND NEW.base_amount_minor<0
    BEGIN SELECT RAISE(ABORT,'BASE_OUTSTANDING_EXCEEDED'); END;

    CREATE TABLE documents (
      tenant_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      name TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      PRIMARY KEY(tenant_id,doctype,name)
    );
    CREATE TABLE doctype_definitions (
      tenant_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      module TEXT NOT NULL,
      is_custom INTEGER NOT NULL,
      is_submittable INTEGER NOT NULL,
      is_child INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
      disabled INTEGER NOT NULL,
      modified_by TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,doctype)
    );
    """
)

payment_meta = {
    "name": "Payment Entry",
    "fields": [
        {"fieldname": "company", "fieldtype": "Link", "required": True},
        {"fieldname": "references", "fieldtype": "Table", "required": True},
    ],
}
db.execute(
    "INSERT INTO doctype_definitions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Payment Entry", "Accounts", 0, 1, 0, 1, json.dumps(payment_meta), 0, "seed", "2026-07-01"),
)
db.executescript(MIGRATION.read_text(encoding="utf-8"))

meta = json.loads(db.execute(
    "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Payment Entry'"
).fetchone()[0])
fields = {field["fieldname"]: field for field in meta["fields"]}
assert fields["references"]["required"] is False
for field in ("paid_from", "paid_to", "received_amount", "unallocated_amount"):
    assert field in fields
assert db.execute(
    "SELECT is_submittable FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Payment Allocation'"
).fetchone() == (1,)
assert db.execute(
    "SELECT is_child FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Payment Allocation Reference'"
).fetchone() == (1,)

insert = """INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""
invoice = (
    "demo", "Sales Invoice", "SI-1", 1, "RECEIVABLE", "Receivable", "Customer", "CUST-1", "131",
    10000, 10000, "VND", 0, "Sales Invoice", "SI-1", "2026-08-01",
)
db.execute(insert, invoice)
db.execute(insert, (
    "demo", "Payment Entry", "PE-INVOICE", 1, "ALLOC", "Receivable", "Customer", "CUST-1", "131",
    -10000, -10000, "VND", 0, "Sales Invoice", "SI-1", "2026-08-02",
))
expect_integrity(db, insert, (
    "demo", "Payment Entry", "PE-OVER", 1, "ALLOC", "Receivable", "Customer", "CUST-1", "131",
    -1, -1, "VND", 0, "Sales Invoice", "SI-1", "2026-08-03",
), "OUTSTANDING_EXCEEDED")

# Advance starts negative and may only move toward zero.
db.execute(
    "INSERT INTO documents VALUES(?,?,?,?)",
    ("demo", "Payment Entry", "PE-ADV", json.dumps({"company": "Demo"})),
)
db.execute(insert, (
    "demo", "Payment Entry", "PE-ADV", 1, "ADVANCE", "Receivable", "Customer", "CUST-1", "131",
    -10000, -10000, "VND", 0, "Payment Entry", "PE-ADV", "2026-08-01",
))
db.execute(insert, (
    "demo", "Payment Allocation", "PA-1", 1, "SOURCE-1", "Receivable", "Customer", "CUST-1", "131",
    6000, 6000, "VND", 0, "Payment Entry", "PE-ADV", "2026-08-02",
))
expect_integrity(db, insert, (
    "demo", "Payment Allocation", "PA-OVER", 1, "SOURCE-1", "Receivable", "Customer", "CUST-1", "131",
    4001, 4001, "VND", 0, "Payment Entry", "PE-ADV", "2026-08-03",
), "PAYMENT_ADVANCE_EXCEEDED")
expect_integrity(db, insert, (
    "demo", "Payment Allocation", "PA-BAD", 1, "SOURCE-1", "Receivable", "Customer", "OTHER", "131",
    1, 1, "VND", 0, "Payment Entry", "PE-ADV", "2026-08-03",
), "PAYMENT_ADVANCE_CONTEXT_MISMATCH")

balance = db.execute(
    "SELECT original_advance_minor,allocated_amount_minor,remaining_advance_minor,remaining_advance FROM finance_advance_balance WHERE tenant_id='demo' AND source_payment_entry='PE-ADV'"
).fetchone()
assert balance == (10000, 6000, 4000, 4000.0)

print("FINANCE_PAYMENT_ALLOCATION_MIGRATION_0031_PASS")
