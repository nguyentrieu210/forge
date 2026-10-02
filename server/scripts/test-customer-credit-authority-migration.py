from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "tenant" / "0150_customer_credit_authority.sql"

SCHEMA = """
CREATE TABLE documents (
  tenant_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  doctype TEXT NOT NULL,
  name TEXT NOT NULL,
  docstatus INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, doc_key)
);
CREATE TABLE document_children (
  tenant_id TEXT NOT NULL,
  parent_key TEXT NOT NULL,
  fieldname TEXT NOT NULL,
  row_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id,parent_key,fieldname,row_id)
);
CREATE TABLE sales_line_fulfillment_entries (
  tenant_id TEXT NOT NULL,
  line_key TEXT NOT NULL,
  sales_order TEXT NOT NULL,
  sales_order_line_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  package_component_key TEXT NOT NULL DEFAULT '',
  item_code TEXT NOT NULL,
  qty_micros INTEGER NOT NULL,
  posting_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,line_key)
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
  against_voucher_type TEXT,
  against_voucher_no TEXT,
  posting_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
);
"""


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.executescript(SCHEMA)
    connection.executescript(MIGRATION.read_text())
    return connection


def draft_order(
    connection: sqlite3.Connection,
    name: str,
    grand_minor: int,
    limit_minor: int,
    qty_micros: int = 1_000_000,
) -> None:
    payload = (
        '{"customer":"CUST-1","company":"Demo",'
        f'"base_grand_total_minor":{grand_minor},'
        f'"credit_limit_minor":{limit_minor},'
        '"credit_limit_enforced":true}'
    )
    connection.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?)",
        ("demo", f"Sales Order:{name}", "Sales Order", name, 0, payload),
    )
    child = (
        '{"item_code":"ITEM-1",'
        f'"qty_micros":{qty_micros},'
        f'"net_amount_minor":{grand_minor}}'
    )
    connection.execute(
        "INSERT INTO document_children VALUES(?,?,?,?,?)",
        ("demo", f"Sales Order:{name}", "items", "ROW-1", child),
    )


def submit_order(connection: sqlite3.Connection, name: str) -> None:
    connection.execute(
        "UPDATE documents SET docstatus=1 WHERE tenant_id='demo' AND doc_key=?",
        (f"Sales Order:{name}",),
    )


def submitted_invoice(connection: sqlite3.Connection, name: str, limit_minor: int) -> None:
    payload = (
        '{"customer":"CUST-1","company":"Demo",'
        f'"credit_limit_minor":{limit_minor},'
        '"credit_limit_enforced":true}'
    )
    connection.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?)",
        ("demo", f"Sales Invoice:{name}", "Sales Invoice", name, 1, payload),
    )


def receivable(connection: sqlite3.Connection, invoice: str, base_minor: int, line: str = "AR") -> None:
    connection.execute(
        """INSERT INTO payment_ledger_entries(
             tenant_id,voucher_type,voucher_no,voucher_revision,line_key,
             account_type,party_type,party,account,amount_minor,base_amount_minor,
             currency,currency_scale,against_voucher_type,against_voucher_no,posting_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            "demo", "Sales Invoice", invoice, 2, line,
            "Receivable", "Customer", "CUST-1", "Debtors",
            base_minor, base_minor, "USD", 2,
            "Sales Invoice", invoice, "2026-10-02T09:00:00.000Z",
        ),
    )


# Concurrent-style serialization proof: the second submit observes the first submitted
# order in the same database authority and is rejected by the trigger.
connection = db()
draft_order(connection, "SO-1", 6_000, 10_000)
draft_order(connection, "SO-2", 6_000, 10_000)
submit_order(connection, "SO-1")
try:
    submit_order(connection, "SO-2")
except sqlite3.IntegrityError as exc:
    assert "CUSTOMER_CREDIT_LIMIT_EXCEEDED" in str(exc), exc
else:
    raise AssertionError("second order crossed the credit limit")

row = connection.execute(
    "SELECT exposure_minor FROM customer_credit_exposure WHERE tenant_id='demo' AND customer='CUST-1' AND company='Demo'"
).fetchone()
assert row == (6_000,), row

# Billing transfer proof: billing half of a 100 order releases 50 of order reservation
# before the invoice receivable is inserted.  The +50 AR therefore preserves exposure=100.
connection = db()
draft_order(connection, "SO-100", 10_000, 10_000, qty_micros=10_000_000)
submit_order(connection, "SO-100")
connection.execute(
    """INSERT INTO sales_line_fulfillment_entries
       VALUES(?,?,?,?,?,?,?,?,?)""",
    ("demo", "BILL-1", "SO-100", "ROW-1", "Billing", "", "ITEM-1", 5_000_000, "2026-10-02T09:00:00.000Z"),
)
submitted_invoice(connection, "SI-50", 10_000)
receivable(connection, "SI-50", 5_000)

row = connection.execute(
    "SELECT exposure_minor FROM customer_credit_exposure WHERE tenant_id='demo' AND customer='CUST-1' AND company='Demo'"
).fetchone()
assert row == (10_000,), row

# No remaining headroom: an unrelated extra receivable must fail atomically.
submitted_invoice(connection, "SI-EXTRA", 10_000)
try:
    receivable(connection, "SI-EXTRA", 1)
except sqlite3.IntegrityError as exc:
    assert "CUSTOMER_CREDIT_LIMIT_EXCEEDED" in str(exc), exc
else:
    raise AssertionError("standalone invoice crossed the credit limit")

print("customer credit authority migration: PASS")
