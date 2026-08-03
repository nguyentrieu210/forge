#!/usr/bin/env python3
"""RC-022 AP settlement/reconciliation regression using canonical append-only ledgers."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYMENT_ALLOCATION_MIGRATION = ROOT / "migrations/tenant/0031_finance_payment_allocations.sql"
EXPLICIT_ADVANCE_MIGRATION = ROOT / "migrations/tenant/0032_finance_explicit_advances.sql"


def expect_integrity(db: sqlite3.Connection, sql: str, params: tuple, code: str) -> None:
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError as error:
        assert code in str(error), str(error)
    else:
        raise AssertionError(f"Expected {code}")


def add_doc(db: sqlite3.Connection, tenant: str, doctype: str, name: str, company: str) -> None:
    payload = {
        "company": company,
        "company_currency": "VND",
        "company_currency_scale": 0,
        "currency": "VND",
    }
    db.execute(
        "INSERT INTO documents(tenant_id,doctype,name,payload_json) VALUES(?,?,?,?)",
        (tenant, doctype, name, json.dumps(payload)),
    )


def payment_row(
    tenant: str,
    voucher_type: str,
    voucher_no: str,
    revision: int,
    line_key: str,
    amount: int,
    against_type: str,
    against_no: str,
    posting_at: str,
    supplier: str = "SUP-1",
    account: str = "331-AP",
) -> tuple:
    return (
        tenant, voucher_type, voucher_no, revision, line_key,
        "Payable", "Supplier", supplier, account,
        amount, amount, "VND", 0, against_type, against_no, posting_at,
    )


def gl_row(
    tenant: str,
    voucher_type: str,
    voucher_no: str,
    revision: int,
    line_key: str,
    debit: int,
    credit: int,
    posting_at: str,
    supplier: str = "SUP-1",
    account: str = "331-AP",
) -> tuple:
    return (
        tenant, voucher_type, voucher_no, revision, line_key, account,
        "Supplier", supplier, debit, credit, "VND", 0, posting_at,
    )


def balances(db: sqlite3.Connection, tenant: str, company: str) -> tuple[int, int]:
    payable = db.execute(
        """
        SELECT COALESCE(SUM(p.base_amount_minor),0)
        FROM payment_ledger_entries p
        JOIN documents d
          ON d.tenant_id=p.tenant_id AND d.doctype=p.voucher_type AND d.name=p.voucher_no
        WHERE p.tenant_id=? AND json_extract(d.payload_json,'$.company')=?
          AND p.party_type='Supplier' AND p.account_type='Payable'
          AND p.party='SUP-1' AND p.account='331-AP'
        """,
        (tenant, company),
    ).fetchone()[0]
    gl = db.execute(
        """
        SELECT COALESCE(SUM(g.credit_minor-g.debit_minor),0)
        FROM gl_entries g
        JOIN documents d
          ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
        WHERE g.tenant_id=? AND json_extract(d.payload_json,'$.company')=?
          AND g.party_type='Supplier' AND g.party='SUP-1' AND g.account='331-AP'
        """,
        (tenant, company),
    ).fetchone()[0]
    return payable, gl


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

    CREATE TABLE mutation_receipts (
      tenant_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      result_json TEXT NOT NULL,
      PRIMARY KEY(tenant_id,command_id)
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
    ("tenant-a", "Payment Entry", "Accounts", 0, 1, 0, 1, json.dumps(payment_meta), 0, "seed", "2026-08-01"),
)
db.executescript(PAYMENT_ALLOCATION_MIGRATION.read_text(encoding="utf-8"))
db.executescript(EXPLICIT_ADVANCE_MIGRATION.read_text(encoding="utf-8"))

insert_payment = "INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
insert_gl = "INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"

# Purchase Invoice establishes the authoritative AP balance and Supplier GL control.
add_doc(db, "tenant-a", "Purchase Invoice", "PI-1", "Demo Company")
db.execute(insert_payment, payment_row("tenant-a", "Purchase Invoice", "PI-1", 1, "PAYABLE", 100_000, "Purchase Invoice", "PI-1", "2026-08-01"))
db.execute(insert_gl, gl_row("tenant-a", "Purchase Invoice", "PI-1", 1, "PAYABLE", 0, 100_000, "2026-08-01"))
assert balances(db, "tenant-a", "Demo Company") == (100_000, 100_000)

# Two independent partial supplier payments settle the same invoice without a mutable paid_amount authority.
for name, revision, amount, posting in [
    ("PE-1", 1, 30_000, "2026-08-02"),
    ("PE-2", 1, 20_000, "2026-08-03"),
]:
    add_doc(db, "tenant-a", "Payment Entry", name, "Demo Company")
    db.execute(insert_payment, payment_row("tenant-a", "Payment Entry", name, revision, "ALLOC-1", -amount, "Purchase Invoice", "PI-1", posting))
    db.execute(insert_gl, gl_row("tenant-a", "Payment Entry", name, revision, "PARTY", amount, 0, posting))

invoice_outstanding = db.execute(
    "SELECT SUM(amount_minor) FROM payment_ledger_entries WHERE tenant_id='tenant-a' AND against_voucher_type='Purchase Invoice' AND against_voucher_no='PI-1'"
).fetchone()[0]
assert invoice_outstanding == 50_000

# Supplier advance: GL reduces payable immediately; Payment Ledger carries an explicit negative source balance.
add_doc(db, "tenant-a", "Payment Entry", "PE-ADV", "Demo Company")
db.execute(insert_payment, payment_row("tenant-a", "Payment Entry", "PE-ADV", 1, "ADVANCE", -40_000, "Payment Entry", "PE-ADV", "2026-08-04"))
db.execute(insert_gl, gl_row("tenant-a", "Payment Entry", "PE-ADV", 1, "PARTY", 40_000, 0, "2026-08-04"))

# Later allocation consumes 25k of the advance and settles 25k of PI-1. It is subledger-only and creates no GL.
add_doc(db, "tenant-a", "Payment Allocation", "PA-1", "Demo Company")
db.execute(insert_payment, payment_row("tenant-a", "Payment Allocation", "PA-1", 1, "SOURCE-1", 25_000, "Payment Entry", "PE-ADV", "2026-08-05"))
db.execute(insert_payment, payment_row("tenant-a", "Payment Allocation", "PA-1", 1, "TARGET-1", -25_000, "Purchase Invoice", "PI-1", "2026-08-05"))

invoice_outstanding = db.execute(
    "SELECT SUM(amount_minor) FROM payment_ledger_entries WHERE tenant_id='tenant-a' AND against_voucher_type='Purchase Invoice' AND against_voucher_no='PI-1'"
).fetchone()[0]
advance_remaining = -db.execute(
    "SELECT SUM(amount_minor) FROM payment_ledger_entries WHERE tenant_id='tenant-a' AND against_voucher_type='Payment Entry' AND against_voucher_no='PE-ADV'"
).fetchone()[0]
assert invoice_outstanding == 25_000
assert advance_remaining == 15_000
assert balances(db, "tenant-a", "Demo Company") == (10_000, 10_000)

# Both invoice and advance over-allocation are fail-closed at the canonical ledger boundary.
expect_integrity(
    db, insert_payment,
    payment_row("tenant-a", "Payment Allocation", "PA-OVER-PI", 1, "TARGET-1", -25_001, "Purchase Invoice", "PI-1", "2026-08-06"),
    "OUTSTANDING_EXCEEDED",
)
expect_integrity(
    db, insert_payment,
    payment_row("tenant-a", "Payment Allocation", "PA-OVER-ADV", 1, "SOURCE-1", 15_001, "Payment Entry", "PE-ADV", "2026-08-06"),
    "PAYMENT_ADVANCE_EXCEEDED",
)

# Cancelling an already-settled invoice or allocated advance cannot create impossible balances.
expect_integrity(
    db, insert_payment,
    payment_row("tenant-a", "Purchase Invoice", "PI-1", 2, "REV-PAYABLE", -100_000, "Purchase Invoice", "PI-1", "2026-08-06"),
    "OUTSTANDING_EXCEEDED",
)
expect_integrity(
    db, insert_payment,
    payment_row("tenant-a", "Payment Entry", "PE-ADV", 2, "REV-ADVANCE", 40_000, "Payment Entry", "PE-ADV", "2026-08-06"),
    "PAYMENT_ADVANCE_EXCEEDED",
)

# Supplier debit adjustment reduces the Purchase Invoice outstanding and the Supplier GL control together.
add_doc(db, "tenant-a", "Debit Note", "DN-1", "Demo Company")
db.execute(insert_payment, payment_row("tenant-a", "Debit Note", "DN-1", 1, "DEBIT", -10_000, "Purchase Invoice", "PI-1", "2026-08-07"))
db.execute(insert_gl, gl_row("tenant-a", "Debit Note", "DN-1", 1, "PAYABLE", 10_000, 0, "2026-08-07"))
assert balances(db, "tenant-a", "Demo Company") == (0, 0)

# Cancel/correction is exact reversal, restoring the pre-adjustment state.
db.execute(insert_payment, payment_row("tenant-a", "Debit Note", "DN-1", 2, "REV-DEBIT", 10_000, "Purchase Invoice", "PI-1", "2026-08-08"))
db.execute(insert_gl, gl_row("tenant-a", "Debit Note", "DN-1", 2, "REV-PAYABLE", 0, 10_000, "2026-08-08"))
assert balances(db, "tenant-a", "Demo Company") == (10_000, 10_000)

# Cancel a normal payment: reversal increases invoice outstanding and GL liability by the same amount.
db.execute(insert_payment, payment_row("tenant-a", "Payment Entry", "PE-2", 2, "REV-ALLOC-1", 20_000, "Purchase Invoice", "PI-1", "2026-08-09"))
db.execute(insert_gl, gl_row("tenant-a", "Payment Entry", "PE-2", 2, "REV-PARTY", 0, 20_000, "2026-08-09"))
assert balances(db, "tenant-a", "Demo Company") == (30_000, 30_000)

# Tenant and company scope are independent even with the same supplier/account/voucher names.
add_doc(db, "tenant-a", "Purchase Invoice", "PI-OTHER", "Other Company")
db.execute(insert_payment, payment_row("tenant-a", "Purchase Invoice", "PI-OTHER", 1, "PAYABLE", 7_000, "Purchase Invoice", "PI-OTHER", "2026-08-01"))
db.execute(insert_gl, gl_row("tenant-a", "Purchase Invoice", "PI-OTHER", 1, "PAYABLE", 0, 7_000, "2026-08-01"))
assert balances(db, "tenant-a", "Demo Company") == (30_000, 30_000)
assert balances(db, "tenant-a", "Other Company") == (7_000, 7_000)

add_doc(db, "tenant-b", "Purchase Invoice", "PI-1", "Demo Company")
db.execute(insert_payment, payment_row("tenant-b", "Purchase Invoice", "PI-1", 1, "PAYABLE", 9_000, "Purchase Invoice", "PI-1", "2026-08-01"))
db.execute(insert_gl, gl_row("tenant-b", "Purchase Invoice", "PI-1", 1, "PAYABLE", 0, 9_000, "2026-08-01"))
assert balances(db, "tenant-a", "Demo Company") == (30_000, 30_000)
assert balances(db, "tenant-b", "Demo Company") == (9_000, 9_000)

# Reconciliation catches a Supplier-party GL write that bypasses Payment Ledger.
add_doc(db, "tenant-a", "Journal Entry", "JE-MISMATCH", "Demo Company")
db.execute(insert_gl, gl_row("tenant-a", "Journal Entry", "JE-MISMATCH", 1, "SUPPLIER-AP", 0, 5_000, "2026-08-10"))
assert balances(db, "tenant-a", "Demo Company") == (30_000, 35_000)

# Retry/idempotency authority is tenant-scoped command receipt, not duplicate ledger posting.
receipt = ("tenant-a", "cmd-ap-1", "a" * 64, json.dumps({"ok": True}))
db.execute("INSERT INTO mutation_receipts VALUES(?,?,?,?)", receipt)
expect_integrity(db, "INSERT INTO mutation_receipts VALUES(?,?,?,?)", receipt, "UNIQUE")
db.execute("INSERT INTO mutation_receipts VALUES(?,?,?,?)", ("tenant-b", "cmd-ap-1", "a" * 64, json.dumps({"ok": True})))

# The append-only ledger itself also rejects the same voucher revision/line replay.
expect_integrity(
    db, insert_payment,
    payment_row("tenant-a", "Payment Entry", "PE-1", 1, "ALLOC-1", -30_000, "Purchase Invoice", "PI-1", "2026-08-02"),
    "UNIQUE",
)

print("FINANCE_AP_RECONCILIATION_RC022_PASS")
