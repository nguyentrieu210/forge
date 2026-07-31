#!/usr/bin/env python3
"""Verify migration 0030 invoice due-date guards and projection."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/tenant/0030_finance_invoice_aging.sql"


def payload(**values):
    return json.dumps(values, separators=(",", ":"), ensure_ascii=False)


def expect_integrity(db, sql, params, message):
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError(f"Expected {message}")


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
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
      PRIMARY KEY(tenant_id, doc_key)
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
      PRIMARY KEY(tenant_id, doctype)
    );
    """
)

sales_metadata = payload(
    name="Sales Invoice",
    fields=[
        {"fieldname": "customer", "fieldtype": "Link"},
        {"fieldname": "posting_at", "fieldtype": "Datetime"},
    ],
)
purchase_metadata = payload(
    name="Purchase Invoice",
    fields=[
        {"fieldname": "supplier", "fieldtype": "Link"},
        {"fieldname": "due_date", "fieldtype": "Date"},
    ],
)
for doctype, metadata in (("Sales Invoice", sales_metadata), ("Purchase Invoice", purchase_metadata)):
    db.execute(
        "INSERT INTO doctype_definitions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", doctype, "Accounts", 0, 1, 0, 1, metadata, 0, "seed", "2026-07-01"),
    )

# Legacy submitted invoice deliberately exists before the guard is installed.
db.execute(
    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    (
        "demo",
        "Sales Invoice:SI-LEGACY",
        "Sales Invoice",
        "SI-LEGACY",
        "Administrator",
        1,
        "Unpaid",
        1,
        "2026-06-01",
        "2026-06-01",
        payload(
            customer="CUST-1",
            company="Demo",
            currency="VND",
            currency_scale=0,
            posting_at="2026-06-01T08:00:00Z",
            debit_to="131",
            grand_total_minor=1000000,
        ),
    ),
)

migration_sql = MIGRATION.read_text(encoding="utf-8")
db.executescript(migration_sql)
db.executescript(migration_sql)

sales_fields = json.loads(
    db.execute(
        "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Sales Invoice'"
    ).fetchone()[0]
)["fields"]
due_fields = [field for field in sales_fields if field["fieldname"] == "due_date"]
assert len(due_fields) == 1
assert due_fields[0]["required"] is True

legacy = db.execute(
    "SELECT posting_date,due_date,due_date_source,party,account FROM finance_invoice_terms WHERE tenant_id='demo' AND voucher_no='SI-LEGACY'"
).fetchone()
assert legacy == ("2026-06-01", "2026-06-01", "posting_date_fallback", "CUST-1", "131")

insert_sql = "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)"

# Compatibility path: submitted API payloads that omit due_date remain valid
# until the explicit backfill/cutover enables hard presence enforcement.
db.execute(
    insert_sql,
    (
        "demo",
        "Sales Invoice:SI-MISSING",
        "Sales Invoice",
        "SI-MISSING",
        "Administrator",
        1,
        "Unpaid",
        1,
        "2026-07-01",
        "2026-07-01",
        payload(
            customer="CUST-1",
            company="Demo",
            currency="VND",
            currency_scale=0,
            posting_at="2026-07-01T09:00:00Z",
            debit_to="131",
            grand_total_minor=1500000,
        ),
    ),
)
missing = db.execute(
    "SELECT due_date,due_date_source FROM finance_invoice_terms WHERE tenant_id='demo' AND voucher_no='SI-MISSING'"
).fetchone()
assert missing == ("2026-07-01", "posting_date_fallback")

expect_integrity(
    db,
    insert_sql,
    (
        "demo",
        "Sales Invoice:SI-BAD",
        "Sales Invoice",
        "SI-BAD",
        "Administrator",
        1,
        "Unpaid",
        1,
        "2026-07-01",
        "2026-07-01",
        payload(customer="CUST-1", company="Demo", currency="VND", posting_at="2026-07-01", due_date="2026-02-31", debit_to="131"),
    ),
    "INVOICE_DUE_DATE_INVALID",
)
expect_integrity(
    db,
    insert_sql,
    (
        "demo",
        "Sales Invoice:SI-EARLY",
        "Sales Invoice",
        "SI-EARLY",
        "Administrator",
        1,
        "Unpaid",
        1,
        "2026-07-01",
        "2026-07-01",
        payload(customer="CUST-1", company="Demo", currency="VND", posting_at="2026-07-01", due_date="2026-06-30", debit_to="131"),
    ),
    "INVOICE_DUE_DATE_BEFORE_POSTING",
)

db.execute(
    insert_sql,
    (
        "demo",
        "Sales Invoice:SI-VALID",
        "Sales Invoice",
        "SI-VALID",
        "Administrator",
        1,
        "Unpaid",
        1,
        "2026-07-01",
        "2026-07-01",
        payload(
            customer="CUST-1",
            company="Demo",
            currency="VND",
            currency_scale=0,
            posting_at="2026-07-01T09:00:00Z",
            due_date="2026-07-31",
            debit_to="131",
            grand_total_minor=2500000,
        ),
    ),
)
explicit = db.execute(
    "SELECT due_date,due_date_source FROM finance_invoice_terms WHERE tenant_id='demo' AND voucher_no='SI-VALID'"
).fetchone()
assert explicit == ("2026-07-31", "explicit")

# Drafts may remain incomplete and legacy API clients may submit them during the
# compatibility phase; the report marks the fallback source for later backfill.
db.execute(
    insert_sql,
    (
        "demo",
        "Purchase Invoice:PI-DRAFT",
        "Purchase Invoice",
        "PI-DRAFT",
        "Administrator",
        0,
        "Draft",
        1,
        "2026-07-02",
        "2026-07-02",
        payload(supplier="SUP-1", company="Demo", currency="VND", posting_at="2026-07-02", credit_to="331"),
    ),
)
db.execute(
    "UPDATE documents SET docstatus=1,status='Unpaid' WHERE tenant_id='demo' AND doc_key='Purchase Invoice:PI-DRAFT'"
)
purchase_fallback = db.execute(
    "SELECT due_date,due_date_source FROM finance_invoice_terms WHERE tenant_id='demo' AND voucher_no='PI-DRAFT'"
).fetchone()
assert purchase_fallback == ("2026-07-02", "posting_date_fallback")

print("FINANCE_AGING_MIGRATION_0030_PASS")
