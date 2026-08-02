#!/usr/bin/env python3
"""Acceptance regression for VN accounting integrity migrations 0043-0044."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL43 = (ROOT / "migrations/tenant/0043_vn_accounting_integrity_closure.sql").read_text(encoding="utf-8")
SQL44 = (ROOT / "migrations/tenant/0044_vn_accounting_immutable_controls.sql").read_text(encoding="utf-8")
NOW = "2026-08-03T00:00:00Z"


def base_db():
    db = sqlite3.connect(":memory:")
    db.executescript(
        """
        CREATE TABLE master_records(
          tenant_id TEXT NOT NULL, record_type TEXT NOT NULL, name TEXT NOT NULL,
          disabled INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL, modified_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,record_type,name)
        );
        CREATE TABLE documents(
          tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL,
          owner TEXT NOT NULL, docstatus INTEGER NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
          created_at TEXT NOT NULL, modified_at TEXT NOT NULL, payload_json TEXT NOT NULL,
          PRIMARY KEY(tenant_id,doc_key), UNIQUE(tenant_id,doctype,name)
        );
        CREATE TABLE versions(
          tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, version INTEGER NOT NULL, command_id TEXT NOT NULL,
          actor TEXT NOT NULL, action TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,doc_key,version)
        );
        CREATE TABLE gl_entries(
          tenant_id TEXT NOT NULL, voucher_type TEXT NOT NULL, voucher_no TEXT NOT NULL, voucher_revision INTEGER NOT NULL,
          line_key TEXT NOT NULL, account TEXT NOT NULL, party_type TEXT, party TEXT,
          debit_minor INTEGER NOT NULL DEFAULT 0, credit_minor INTEGER NOT NULL DEFAULT 0,
          currency TEXT NOT NULL, currency_scale INTEGER NOT NULL, cost_center TEXT,
          dimensions_json TEXT NOT NULL DEFAULT '{}', remarks TEXT, posting_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
        );
        CREATE TABLE payment_ledger_entries(
          tenant_id TEXT NOT NULL, voucher_type TEXT NOT NULL, voucher_no TEXT NOT NULL, voucher_revision INTEGER NOT NULL,
          line_key TEXT NOT NULL, account_type TEXT NOT NULL, party_type TEXT NOT NULL, party TEXT NOT NULL,
          account TEXT NOT NULL, amount_minor INTEGER NOT NULL, base_amount_minor INTEGER NOT NULL DEFAULT 0,
          currency TEXT NOT NULL, currency_scale INTEGER NOT NULL, against_voucher_type TEXT, against_voucher_no TEXT,
          posting_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
        );
        CREATE TABLE stock_ledger_entries(
          tenant_id TEXT NOT NULL, voucher_type TEXT NOT NULL, voucher_no TEXT NOT NULL, voucher_revision INTEGER NOT NULL,
          line_key TEXT NOT NULL, item_code TEXT NOT NULL, warehouse TEXT NOT NULL,
          actual_qty_micros INTEGER NOT NULL, valuation_rate_minor INTEGER NOT NULL,
          stock_value_difference_minor INTEGER NOT NULL, qty_scale INTEGER NOT NULL DEFAULT 6,
          currency_scale INTEGER NOT NULL, currency TEXT NOT NULL, posting_at TEXT NOT NULL,
          batch_no TEXT, serial_no TEXT, allow_negative_stock INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
        );
        """
    )
    return db


def migrate(db):
    db.executescript(SQL43)
    db.executescript(SQL44)


def insert_doc(db, doctype, name, payload, docstatus=1, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (tenant, f"{doctype}:{name}", doctype, name, "qa", docstatus,
         "Submitted" if docstatus == 1 else "Draft", 1, NOW, NOW, json.dumps(payload)),
    )


def insert_account(db, name, company, root_type="Asset", account_type=""):
    db.execute(
        "INSERT INTO master_records VALUES(?,?,?,?,?,?)",
        ("demo", "Account", name, 0, json.dumps({"company": company, "root_type": root_type, "account_type": account_type}), NOW),
    )


def insert_gl(db, voucher_type, voucher_no, line_key, account, debit=0, credit=0, scale=0, revision=1, dimensions=None):
    db.execute(
        "INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", voucher_type, voucher_no, revision, line_key, account, None, None, debit, credit,
         "VND", scale, None, json.dumps(dimensions or {}), None, "2026-06-15T08:00:00Z"),
    )


def stock_row(voucher_type, voucher_no, line_key="S1", value=500, posting="2026-06-25T08:00:00Z"):
    return ("demo", voucher_type, voucher_no, 1, line_key, "ITEM", "WH", 1_000_000,
            value, value, 6, 0, "VND", posting, None, None, 0)


def expect(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        return
    raise AssertionError(f"expected rejection: {marker}")


# Historical orphan ledger must stop migration instead of receiving guessed scope.
orphan = base_db()
orphan.execute(
    "INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Journal Entry", "MISSING", 1, "A", "111", None, None, 1, 0, "VND", 0, None, "{}", None, NOW),
)
expect("CHECK constraint failed", lambda: orphan.executescript(SQL43))

# Clean installation.
db = base_db()
migrate(db)
for args in [
    ("111-A", "COMP-A", "Asset", "Cash"),
    ("111-B", "COMP-B", "Asset", "Cash"),
    ("331-A", "COMP-A", "Liability", "Payable"),
    ("156-A", "COMP-A", "Asset", "Stock"),
    ("338-A", "COMP-A", "Liability", "Stock Received But Not Billed"),
    ("811-A", "COMP-A", "Expense", "Stock Adjustment"),
]:
    insert_account(db, *args)

# Company and branch scope are authoritative and VND scale=0 is not divided by 100.
insert_doc(db, "Journal Entry", "JV-A", {"company": "COMP-A", "branch": "BR-A", "posting_at": "2026-06-15T08:00:00Z"})
insert_gl(db, "Journal Entry", "JV-A", "D", "111-A", debit=1000)
insert_gl(db, "Journal Entry", "JV-A", "C", "811-A", credit=1000)
insert_doc(db, "Journal Entry", "JV-B", {"company": "COMP-B", "branch": "BR-B", "posting_at": "2026-06-15T08:00:00Z"})
insert_gl(db, "Journal Entry", "JV-B", "D", "111-B", debit=2000)
insert_gl(db, "Journal Entry", "JV-B", "C", "111-B", credit=2000)
db.commit()
rows = db.execute("SELECT company,branch,account,debit,credit,balance FROM trial_balance ORDER BY company,account").fetchall()
assert ("COMP-A", "BR-A", "111-A", 1000.0, 0.0, 1000.0) in rows, rows
assert len(db.execute("SELECT DISTINCT company FROM general_ledger_report").fetchall()) == 2

insert_doc(db, "Journal Entry", "JV-BAD-ACCOUNT", {"company": "COMP-A", "posting_at": NOW})
db.commit()
expect("GL_ACCOUNT_COMPANY_MISMATCH", lambda: insert_gl(db, "Journal Entry", "JV-BAD-ACCOUNT", "D", "111-B", debit=100))
insert_doc(db, "Journal Entry", "JV-BAD-BRANCH", {"company": "COMP-A", "branch": "BR-A", "posting_at": NOW})
db.commit()
expect("GL_BRANCH_SCOPE_MISMATCH", lambda: insert_gl(db, "Journal Entry", "JV-BAD-BRANCH", "D", "111-A", debit=100, dimensions={"branch": "BR-X"}))

# AR/AP cannot cross legal entities.
insert_doc(db, "Payment Allocation", "ALLOC-A", {"company": "COMP-A", "posting_at": "2026-06-20T08:00:00Z"})
insert_doc(db, "Purchase Invoice", "PINV-B", {"company": "COMP-B", "posting_at": "2026-06-20T08:00:00Z"})
db.commit()
expect("PAYMENT_REFERENCE_COMPANY_MISMATCH", lambda: db.execute(
    "INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Payment Allocation", "ALLOC-A", 1, "P1", "Payable", "Supplier", "SUP", "331-A",
     -100, -100, "VND", 0, "Purchase Invoice", "PINV-B", "2026-06-20T08:00:00Z"),
))

# Payment Allocation obeys VN Accounting Period.
insert_doc(db, "VN Accounting Period", "KY-07", {
    "company": "COMP-A", "start_date": "2026-07-01", "end_date": "2026-07-31",
    "close_state": "Hard Locked", "allow_approved_adjustments": 0,
})
db.commit()
expect("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: insert_doc(db, "Payment Allocation", "ALLOC-LOCKED", {
    "company": "COMP-A", "posting_at": "2026-07-10T08:00:00Z"
}))

# Purchase Receipt must have a balanced GL before stock value posts.
insert_doc(db, "Purchase Receipt", "PR-1", {"company": "COMP-A", "posting_at": "2026-06-25T08:00:00Z"})
db.commit()
expect("PURCHASE_RECEIPT_GL_REQUIRED", lambda: db.execute(
    "INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Purchase Receipt", "PR-1")
))
insert_gl(db, "Purchase Receipt", "PR-1", "STOCK", "156-A", debit=500)
insert_gl(db, "Purchase Receipt", "PR-1", "SRBNB", "338-A", credit=500)
db.execute("INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Purchase Receipt", "PR-1"))
db.commit()

insert_doc(db, "Purchase Receipt", "PR-UNBAL", {"company": "COMP-A", "posting_at": "2026-06-26T08:00:00Z"})
insert_gl(db, "Purchase Receipt", "PR-UNBAL", "ONLY", "156-A", debit=500)
db.commit()
expect("PURCHASE_RECEIPT_GL_UNBALANCED", lambda: db.execute(
    "INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Purchase Receipt", "PR-UNBAL", posting="2026-06-26T08:00:00Z")
))

# Effective policy is unique and activates Stock Entry -> GL parity.
insert_doc(db, "VN Accounting Policy", "POL-1", {
    "company": "COMP-A", "effective_from": "2026-01-01", "effective_to": "2026-12-31",
    "inventory_account": "156-A", "stock_adjustment_account": "811-A",
    "stock_received_but_not_billed_account": "338-A"
})
db.commit()
expect("VN_ACCOUNTING_POLICY_OVERLAP", lambda: insert_doc(db, "VN Accounting Policy", "POL-2", {
    "company": "COMP-A", "effective_from": "2026-06-01", "effective_to": "2027-01-01"
}))
insert_doc(db, "Stock Entry", "STE-1", {"company": "COMP-A", "purpose": "Material Receipt", "posting_at": "2026-06-27T08:00:00Z"})
db.commit()
expect("STOCK_ENTRY_GL_REQUIRED", lambda: db.execute(
    "INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Stock Entry", "STE-1", posting="2026-06-27T08:00:00Z")
))
insert_gl(db, "Stock Entry", "STE-1", "STOCK", "156-A", debit=500)
insert_gl(db, "Stock Entry", "STE-1", "OFFSET", "811-A", credit=500)
db.execute("INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Stock Entry", "STE-1", posting="2026-06-27T08:00:00Z"))
db.commit()

# Approved legal/account-map/tax versions cannot be edited or cancelled.
for doctype, name, payload, marker in [
    ("VN Legal Rule", "RULE-1", {"rule_type": "VAT", "regime_code": "Tax-specific", "taxpayer_segment": "GENERAL", "effective_from": "2026-01-01", "effective_to": "2026-12-31"}, "VN_LEGAL_RULE_IMMUTABLE"),
    ("TT99 Account Map", "MAP-1", {"company": "COMP-A", "source_account": "111-A", "effective_from": "2026-01-01", "effective_to": "2026-12-31"}, "TT99_ACCOUNT_MAP_IMMUTABLE"),
    ("VN Tax Ruleset", "TAX-1", {"company": "COMP-A", "rule_type": "VAT", "taxpayer_segment": "GENERAL", "effective_from": "2026-01-01", "effective_to": "2026-12-31"}, "VN_TAX_RULESET_IMMUTABLE"),
]:
    insert_doc(db, doctype, name, payload)
    db.commit()
    expect(marker, lambda doctype=doctype, name=name: db.execute(
        "UPDATE documents SET docstatus=2 WHERE doc_key=?", (f"{doctype}:{name}",)
    ))
    expect(marker, lambda doctype=doctype, name=name, payload=payload: db.execute(
        "UPDATE documents SET payload_json=? WHERE doc_key=?", (json.dumps({**payload, "tampered": 1}), f"{doctype}:{name}")
    ))

# Reconciliation arithmetic and resolution evidence are enforced.
expect("VN_RECONCILIATION_DIFFERENCE_MISMATCH", lambda: insert_doc(db, "VN Reconciliation Case", "REC-BAD", {
    "company": "COMP-A", "expected_minor": 100, "actual_minor": 90, "difference_minor": 99
}, docstatus=0))
insert_doc(db, "VN Reconciliation Case", "REC-1", {
    "company": "COMP-A", "expected_minor": 100, "actual_minor": 90, "difference_minor": 10,
    "root_cause": "Missing correction", "resolution_doctype": "Journal Entry", "resolution_document": "JV-A"
})
db.commit()
expect("VN_RECONCILIATION_RESOLVED_IMMUTABLE", lambda: db.execute(
    "UPDATE documents SET payload_json=? WHERE doc_key='VN Reconciliation Case:REC-1'",
    (json.dumps({"company": "COMP-A", "expected_minor": 100, "actual_minor": 100, "difference_minor": 0}),),
))

# Approval identity comes from authenticated version history.
db.execute(
    "INSERT INTO versions VALUES(?,?,?,?,?,?,?,?)",
    ("demo", "VN Legal Rule:RULE-1", 1, "cmd-rule", "chief@example.test", "submit",
     json.dumps({"doctype": "VN Legal Rule", "name": "RULE-1"}), NOW),
)
assert db.execute("SELECT approved_by,approved_at FROM accounting_approval_evidence WHERE name='RULE-1'").fetchone() == ("chief@example.test", NOW)

# Clean accepted postings leave no CRITICAL integrity exception.
assert db.execute("SELECT code FROM accounting_integrity_exceptions WHERE severity='CRITICAL'").fetchall() == []
print("VN_ACCOUNTING_INTEGRITY_CLOSURE_0043_0044_PASS")
