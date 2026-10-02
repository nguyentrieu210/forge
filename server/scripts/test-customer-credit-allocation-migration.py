#!/usr/bin/env python3
"""SQLite regression for reusable Credit Note customer-credit allocation."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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

    CREATE TRIGGER receivable_outstanding_guard BEFORE INSERT ON payment_ledger_entries
    WHEN NEW.against_voucher_type IS NOT NULL AND NEW.amount_minor<0
    BEGIN SELECT RAISE(ABORT,'OUTSTANDING_EXCEEDED'); END;

    CREATE TRIGGER receivable_base_outstanding_guard BEFORE INSERT ON payment_ledger_entries
    WHEN NEW.against_voucher_type IS NOT NULL AND NEW.base_amount_minor<0
    BEGIN SELECT RAISE(ABORT,'BASE_OUTSTANDING_EXCEEDED'); END;
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

for name in (
    "0031_finance_payment_allocations.sql",
    "0155_customer_credit_refund.sql",
    "0156_customer_credit_allocation.sql",
):
    db.executescript((ROOT / "migrations" / "tenant" / name).read_text(encoding="utf-8"))

meta = json.loads(db.execute(
    "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Payment Allocation'"
).fetchone()[0])
fields = {field["fieldname"]: field for field in meta["fields"]}
assert fields["source_payment_entry"]["required"] is False
assert fields["source_credit_note"]["fieldtype"] == "Link"
assert fields["source_credit_note"]["options"] == "Credit Note"

insert = """INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""

# Canonical target invoice and canonical negative Credit Note source.
db.execute(insert, (
    "demo", "Sales Invoice", "SI-LATER", 2, "RECEIVABLE",
    "Receivable", "Customer", "CUST-1", "Debtors",
    2500, 2500, "USD", 2,
    "Sales Invoice", "SI-LATER", "2026-10-02T09:00:00.000Z",
))
db.execute(insert, (
    "demo", "Credit Note", "CN-CREDIT", 2, "CUSTOMER-CREDIT",
    "Receivable", "Customer", "CUST-1", "Debtors",
    -4000, -4000, "USD", 2,
    "Credit Note", "CN-CREDIT", "2026-10-02T09:00:00.000Z",
))
db.commit()

# One Payment Allocation consumes the source toward zero and target toward zero.
db.execute("BEGIN")
db.execute(insert, (
    "demo", "Payment Allocation", "PA-CREDIT", 2, "SOURCE-1",
    "Receivable", "Customer", "CUST-1", "Debtors",
    2500, 2500, "USD", 2,
    "Credit Note", "CN-CREDIT", "2026-10-02T09:01:00.000Z",
))
db.execute(insert, (
    "demo", "Payment Allocation", "PA-CREDIT", 2, "TARGET-1",
    "Receivable", "Customer", "CUST-1", "Debtors",
    -2500, -2500, "USD", 2,
    "Sales Invoice", "SI-LATER", "2026-10-02T09:01:00.000Z",
))
db.commit()

credit = db.execute(
    """SELECT SUM(amount_minor),SUM(base_amount_minor) FROM payment_ledger_entries
       WHERE tenant_id='demo' AND against_voucher_type='Credit Note' AND against_voucher_no='CN-CREDIT'"""
).fetchone()
invoice = db.execute(
    """SELECT SUM(amount_minor),SUM(base_amount_minor) FROM payment_ledger_entries
       WHERE tenant_id='demo' AND against_voucher_type='Sales Invoice' AND against_voucher_no='SI-LATER'"""
).fetchone()
assert credit == (-1500, -1500), credit
assert invoice == (0, 0), invoice

# Source over-consumption is rejected by the same race-safe Credit Note guard used by refunds.
try:
    db.execute(insert, (
        "demo", "Payment Allocation", "PA-OVER-SOURCE", 2, "SOURCE-1",
        "Receivable", "Customer", "CUST-1", "Debtors",
        1501, 1501, "USD", 2,
        "Credit Note", "CN-CREDIT", "2026-10-02T09:02:00.000Z",
    ))
except sqlite3.IntegrityError as error:
    assert "CUSTOMER_CREDIT_EXCEEDED" in str(error), str(error)
    db.rollback()
else:
    raise AssertionError("Credit Note source over-allocation was accepted")

# Prove transaction atomicity: source row is valid, target row is invalid.
# Rolling back the failed target must restore the source credit too.
db.execute(insert, (
    "demo", "Sales Invoice", "SI-ATOMIC", 2, "RECEIVABLE",
    "Receivable", "Customer", "CUST-1", "Debtors",
    1000, 1000, "USD", 2,
    "Sales Invoice", "SI-ATOMIC", "2026-10-02T09:03:00.000Z",
))
db.commit()
try:
    db.execute("BEGIN")
    db.execute(insert, (
        "demo", "Payment Allocation", "PA-ATOMIC", 2, "SOURCE-1",
        "Receivable", "Customer", "CUST-1", "Debtors",
        1000, 1000, "USD", 2,
        "Credit Note", "CN-CREDIT", "2026-10-02T09:04:00.000Z",
    ))
    db.execute(insert, (
        "demo", "Payment Allocation", "PA-ATOMIC", 2, "TARGET-1",
        "Receivable", "Customer", "CUST-1", "Debtors",
        -1001, -1001, "USD", 2,
        "Sales Invoice", "SI-ATOMIC", "2026-10-02T09:04:00.000Z",
    ))
    db.commit()
except sqlite3.IntegrityError as error:
    assert "OUTSTANDING_EXCEEDED" in str(error), str(error)
    db.rollback()
else:
    raise AssertionError("invalid target allocation unexpectedly committed")

credit_after = db.execute(
    """SELECT SUM(amount_minor) FROM payment_ledger_entries
       WHERE tenant_id='demo' AND against_voucher_type='Credit Note' AND against_voucher_no='CN-CREDIT'"""
).fetchone()[0]
atomic_target = db.execute(
    """SELECT SUM(amount_minor) FROM payment_ledger_entries
       WHERE tenant_id='demo' AND against_voucher_type='Sales Invoice' AND against_voucher_no='SI-ATOMIC'"""
).fetchone()[0]
assert credit_after == -1500, credit_after
assert atomic_target == 1000, atomic_target

assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("CUSTOMER_CREDIT_ALLOCATION_MIGRATION_PASS")
