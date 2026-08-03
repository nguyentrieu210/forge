#!/usr/bin/env python3
"""Verify RC-021 credit-note guards and AR/GL reconciliation projection."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/tenant/0110_finance_ar_reconciliation.sql"


def payload(**values):
    return json.dumps(values, separators=(",", ":"), ensure_ascii=False)


def doc(tenant, doctype, name, data, status=1):
    return (
        tenant,
        f"{doctype}:{name}",
        doctype,
        name,
        "Administrator",
        status,
        "Submitted" if status == 1 else "Draft",
        1,
        "2026-08-03T00:00:00Z",
        "2026-08-03T00:00:00Z",
        payload(**data),
    )


def expect_integrity(db, sql, params, message):
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError(f"Expected {message}")


db = sqlite3.connect(":memory:")
db.executescript(
    """
    CREATE TABLE documents (
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
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      PRIMARY KEY(tenant_id,doc_key)
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
      against_voucher_type TEXT NOT NULL,
      against_voucher_no TEXT NOT NULL,
      posting_at TEXT NOT NULL
    );

    CREATE TABLE gl_entries (
      tenant_id TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      voucher_no TEXT NOT NULL,
      voucher_revision INTEGER NOT NULL,
      line_key TEXT NOT NULL,
      account TEXT NOT NULL,
      party_type TEXT,
      party TEXT,
      debit_minor INTEGER NOT NULL,
      credit_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      currency_scale INTEGER NOT NULL,
      posting_at TEXT NOT NULL
    );
    """
)

metadata = payload(name="Sales Invoice", fields=[{"fieldname": "customer", "fieldtype": "Link"}])
for tenant in ("tenant-a", "tenant-b"):
    db.execute(
        "INSERT INTO doctype_definitions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (tenant, "Sales Invoice", "Accounts", 0, 1, 0, 1, metadata, 0, "seed", "2026-08-01"),
    )

base_invoice = {
    "customer": "CUST-1",
    "company": "Demo",
    "currency": "USD",
    "currency_scale": 2,
    "company_currency": "USD",
    "company_currency_scale": 2,
    "posting_at": "2026-08-03T10:00:00Z",
    "debit_to": "Debtors",
    "grand_total_minor": 10000,
}
db.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", doc("tenant-a", "Sales Invoice", "SI-1", base_invoice))
db.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", doc("tenant-b", "Sales Invoice", "SI-1", {**base_invoice, "grand_total_minor": 7000}))

# Source documents used to resolve legal-entity scope for journal rows.
for name, values in (
    ("PAY-1", {**base_invoice, "grand_total_minor": 5000}),
    ("PA-1", {**base_invoice, "grand_total_minor": 0}),
):
    db.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", doc("tenant-a", "Payment Entry" if name.startswith("PAY") else "Payment Allocation", name, values))

migration_sql = MIGRATION.read_text(encoding="utf-8")
db.executescript(migration_sql)
db.executescript(migration_sql)

fields = json.loads(db.execute(
    "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='tenant-a' AND doctype='Sales Invoice'"
).fetchone()[0])["fields"]
assert len([field for field in fields if field["fieldname"] == "is_return"]) == 1
assert len([field for field in fields if field["fieldname"] == "return_against"]) == 1

insert_doc = "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)"
credit_data = {
    **base_invoice,
    "grand_total_minor": 1000,
    "base_grand_total_minor": 1000,
    "is_return": True,
    "return_against": "SI-1",
}
db.execute(insert_doc, doc("tenant-a", "Sales Invoice", "CN-1", credit_data))

expect_integrity(
    db,
    insert_doc,
    doc("tenant-b", "Sales Invoice", "CN-CROSS", {**credit_data, "company": "Other"}),
    "AR_CREDIT_NOTE_SOURCE_INVALID",
)
expect_integrity(
    db,
    insert_doc,
    doc("tenant-a", "Sales Invoice", "CN-SELF", {**credit_data, "return_against": "CN-SELF"}),
    "AR_CREDIT_NOTE_SELF_REFERENCE",
)
expect_integrity(
    db,
    insert_doc,
    doc("tenant-a", "Sales Invoice", "CN-MISSING", {**credit_data, "return_against": ""}),
    "AR_CREDIT_NOTE_SOURCE_REQUIRED",
)

# Tenant A: invoice +100, receipt -50, allocation redistributes 10 with net zero,
# credit note -10 => both Payment Ledger and customer GL control equal +40.
payment_rows = [
    ("tenant-a", "Sales Invoice", "SI-1", 1, "RECEIVABLE", "Receivable", "Customer", "CUST-1", "Debtors", 10000, 10000, "USD", 2, "Sales Invoice", "SI-1", "2026-08-03T10:00:00Z"),
    ("tenant-a", "Payment Entry", "PAY-1", 1, "ALLOC-1", "Receivable", "Customer", "CUST-1", "Debtors", -3000, -3000, "USD", 2, "Sales Invoice", "SI-1", "2026-08-03T10:01:00Z"),
    ("tenant-a", "Payment Entry", "PAY-1", 1, "ADVANCE", "Receivable", "Customer", "CUST-1", "Debtors", -2000, -2000, "USD", 2, "Payment Entry", "PAY-1", "2026-08-03T10:01:00Z"),
    ("tenant-a", "Payment Allocation", "PA-1", 1, "SOURCE-1", "Receivable", "Customer", "CUST-1", "Debtors", 1000, 1000, "USD", 2, "Payment Entry", "PAY-1", "2026-08-03T10:02:00Z"),
    ("tenant-a", "Payment Allocation", "PA-1", 1, "TARGET-1", "Receivable", "Customer", "CUST-1", "Debtors", -1000, -1000, "USD", 2, "Sales Invoice", "SI-1", "2026-08-03T10:02:00Z"),
    ("tenant-a", "Sales Invoice", "CN-1", 1, "CREDIT-NOTE", "Receivable", "Customer", "CUST-1", "Debtors", -1000, -1000, "USD", 2, "Sales Invoice", "SI-1", "2026-08-03T10:03:00Z"),
    ("tenant-b", "Sales Invoice", "SI-1", 1, "RECEIVABLE", "Receivable", "Customer", "CUST-1", "Debtors", 7000, 7000, "USD", 2, "Sales Invoice", "SI-1", "2026-08-03T10:00:00Z"),
]
db.executemany("INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", payment_rows)

gl_rows = [
    ("tenant-a", "Sales Invoice", "SI-1", 1, "RECEIVABLE", "Debtors", "Customer", "CUST-1", 10000, 0, "USD", 2, "2026-08-03T10:00:00Z"),
    ("tenant-a", "Payment Entry", "PAY-1", 1, "RECEIVABLE", "Debtors", "Customer", "CUST-1", 0, 5000, "USD", 2, "2026-08-03T10:01:00Z"),
    ("tenant-a", "Sales Invoice", "CN-1", 1, "REV-RECEIVABLE", "Debtors", "Customer", "CUST-1", 0, 1000, "USD", 2, "2026-08-03T10:03:00Z"),
    ("tenant-b", "Sales Invoice", "SI-1", 1, "RECEIVABLE", "Debtors", "Customer", "CUST-1", 7000, 0, "USD", 2, "2026-08-03T10:00:00Z"),
]
db.executemany("INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", gl_rows)

row_a = db.execute(
    "SELECT payment_ledger_base_minor,gl_receivable_base_minor,difference_minor,reconciled "
    "FROM finance_ar_reconciliation WHERE tenant_id='tenant-a' AND company='Demo' AND party='CUST-1' AND account='Debtors'"
).fetchone()
assert row_a == (4000, 4000, 0, 1), row_a
row_b = db.execute(
    "SELECT payment_ledger_base_minor,gl_receivable_base_minor,difference_minor,reconciled "
    "FROM finance_ar_reconciliation WHERE tenant_id='tenant-b' AND company='Demo' AND party='CUST-1' AND account='Debtors'"
).fetchone()
assert row_b == (7000, 7000, 0, 1), row_b

# A deliberately inconsistent GL row is surfaced, never silently repaired.
db.execute(
    "INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ("tenant-a", "Sales Invoice", "SI-1", 9, "TEST-DRIFT", "Debtors", "Customer", "CUST-1", 100, 0, "USD", 2, "2026-08-03T11:00:00Z"),
)
drift = db.execute(
    "SELECT difference_minor,reconciled FROM finance_ar_reconciliation "
    "WHERE tenant_id='tenant-a' AND company='Demo' AND party='CUST-1' AND account='Debtors'"
).fetchone()
assert drift == (100, 0), drift

print("FINANCE_AR_RECONCILIATION_0110_PASS")
