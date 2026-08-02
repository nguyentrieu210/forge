#!/usr/bin/env python3
"""Acceptance regression for VN accounting integrity migrations 0043-0047."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL43 = (ROOT / "migrations/tenant/0043_vn_accounting_integrity_closure.sql").read_text(encoding="utf-8")
SQL44 = (ROOT / "migrations/tenant/0044_vn_accounting_immutable_controls.sql").read_text(encoding="utf-8")
SQL45 = (ROOT / "migrations/tenant/0045_vn_accounting_fx_and_compatibility.sql").read_text(encoding="utf-8")
SQL46 = (ROOT / "migrations/tenant/0046_vn_accounting_single_source_and_valuation.sql").read_text(encoding="utf-8")
SQL47 = (ROOT / "migrations/tenant/0047_vn_accounting_base_currency_guards.sql").read_text(encoding="utf-8")
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
        CREATE TABLE accounting_period_locks(
          tenant_id TEXT NOT NULL, company TEXT NOT NULL, lock_date TEXT NOT NULL, modified_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,company)
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
        CREATE TABLE doctype_definitions(
          tenant_id TEXT NOT NULL, doctype TEXT NOT NULL, module TEXT NOT NULL, is_custom INTEGER NOT NULL,
          is_submittable INTEGER NOT NULL, is_child INTEGER NOT NULL, revision INTEGER NOT NULL,
          metadata_json TEXT NOT NULL, disabled INTEGER NOT NULL, modified_by TEXT NOT NULL, modified_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,doctype)
        );
        INSERT INTO doctype_definitions VALUES(
          'demo','Account','Accounts',0,0,0,1,
          '{"name":"Account","revision":1,"fields":[{"fieldname":"account_name","fieldtype":"Data"}]}',0,'seed','2026-01-01'
        );
        INSERT INTO doctype_definitions VALUES(
          'demo','Journal Entry Account','Accounts',0,0,1,1,
          '{"name":"Journal Entry Account","revision":1,"fields":[{"fieldname":"account","fieldtype":"Link"},{"fieldname":"debit","fieldtype":"Currency"},{"fieldname":"credit","fieldtype":"Currency"}]}',0,'seed','2026-01-01'
        );
        """
    )
    return db


def migrate(db):
    for sql in (SQL43, SQL44, SQL45, SQL46, SQL47):
        db.executescript(sql)


def insert_master(db, record_type, name, data, tenant="demo"):
    db.execute(
        "INSERT INTO master_records VALUES(?,?,?,?,?,?)",
        (tenant, record_type, name, 0, json.dumps(data), NOW),
    )


def insert_doc(db, doctype, name, payload, docstatus=1, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (tenant, f"{doctype}:{name}", doctype, name, "qa", docstatus,
         "Submitted" if docstatus == 1 else "Draft", 1, NOW, NOW, json.dumps(payload)),
    )


def insert_account(db, name, company, root_type="Asset", account_type=""):
    insert_master(db, "Account", name, {"company": company, "root_type": root_type, "account_type": account_type})


def insert_gl(db, voucher_type, voucher_no, line_key, account, debit=0, credit=0,
              currency="VND", scale=0, revision=1, posting="2026-06-15T08:00:00Z", dimensions=None):
    db.execute(
        "INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", voucher_type, voucher_no, revision, line_key, account, None, None, debit, credit,
         currency, scale, None, json.dumps(dimensions or {}), None, posting),
    )


def stock_row(voucher_type, voucher_no, line_key="S1", qty=1_000_000, rate=500, value=500,
              currency="VND", scale=0, posting="2026-06-25T08:00:00Z"):
    return ("demo", voucher_type, voucher_no, 1, line_key, "ITEM", "WH", qty,
            rate, value, 6, scale, currency, posting, None, None, 0)


def expect(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        return
    raise AssertionError(f"expected rejection: {marker}")


# 0043 refuses historical ledger rows that cannot be mapped to a legal entity.
orphan = base_db()
orphan.execute(
    "INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Journal Entry", "MISSING", 1, "A", "111", None, None, 1, 0, "VND", 0, None, "{}", None, NOW),
)
expect("CHECK constraint failed", lambda: orphan.executescript(SQL43))

db = base_db()
migrate(db)

# 0045 exposes first-class account-currency metadata exactly once.
account_meta = json.loads(db.execute("SELECT metadata_json FROM doctype_definitions WHERE doctype='Account'").fetchone()[0])
assert [f["fieldname"] for f in account_meta["fields"]].count("account_currency") == 1
je_meta = json.loads(db.execute("SELECT metadata_json FROM doctype_definitions WHERE doctype='Journal Entry Account'").fetchone()[0])
for field in ("account_currency", "exchange_rate", "debit_in_account_currency", "credit_in_account_currency"):
    assert [f["fieldname"] for f in je_meta["fields"]].count(field) == 1, field

# Legal entities, currencies and accounts used by the acceptance fixture.
for company in ("COMP-A", "COMP-B", "COMP-C"):
    insert_master(db, "Company", company, {"default_currency": "VND"})
insert_master(db, "Currency", "VND", {"currency_scale": 0})
insert_master(db, "Currency", "USD", {"currency_scale": 2})
for args in [
    ("111-A", "COMP-A", "Asset", "Cash"),
    ("111-B", "COMP-B", "Asset", "Cash"),
    ("331-A", "COMP-A", "Liability", "Payable"),
    ("156-A", "COMP-A", "Asset", "Stock"),
    ("338-A", "COMP-A", "Liability", "Stock Received But Not Billed"),
    ("632-A", "COMP-A", "Expense", "Cost of Goods Sold"),
    ("811-A", "COMP-A", "Expense", "Stock Adjustment"),
]:
    insert_account(db, *args)

# Company/branch scope and VND scale=0 reporting are exact.
insert_doc(db, "Journal Entry", "JV-A", {"company": "COMP-A", "branch": "BR-A", "posting_at": "2026-06-15T08:00:00Z"})
insert_gl(db, "Journal Entry", "JV-A", "D", "111-A", debit=1000)
insert_gl(db, "Journal Entry", "JV-A", "C", "811-A", credit=1000)
insert_doc(db, "Journal Entry", "JV-B", {"company": "COMP-B", "branch": "BR-B", "posting_at": "2026-06-15T08:00:00Z"})
insert_gl(db, "Journal Entry", "JV-B", "D", "111-B", debit=2000)
insert_gl(db, "Journal Entry", "JV-B", "C", "111-B", credit=2000)
rows = db.execute("SELECT company,branch,account,debit,credit,balance FROM trial_balance ORDER BY company,account").fetchall()
assert ("COMP-A", "BR-A", "111-A", 1000.0, 0.0, 1000.0) in rows
assert len(db.execute("SELECT DISTINCT company FROM general_ledger_report").fetchall()) == 2

insert_doc(db, "Journal Entry", "JV-BAD-ACCOUNT", {"company": "COMP-A", "posting_at": NOW})
expect("GL_ACCOUNT_COMPANY_MISMATCH", lambda: insert_gl(db, "Journal Entry", "JV-BAD-ACCOUNT", "D", "111-B", debit=100))
insert_doc(db, "Journal Entry", "JV-BAD-BRANCH", {"company": "COMP-A", "branch": "BR-A", "posting_at": NOW})
expect("GL_BRANCH_SCOPE_MISMATCH", lambda: insert_gl(db, "Journal Entry", "JV-BAD-BRANCH", "D", "111-A", debit=100, dimensions={"branch": "BR-X"}))

# AR/AP cannot cross legal entities and Payment Allocation follows VN period locks.
insert_doc(db, "Payment Allocation", "ALLOC-A", {"company": "COMP-A", "posting_at": "2026-06-20T08:00:00Z"})
insert_doc(db, "Purchase Invoice", "PINV-B", {"company": "COMP-B", "posting_at": "2026-06-20T08:00:00Z"})
expect("PAYMENT_REFERENCE_COMPANY_MISMATCH", lambda: db.execute(
    "INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Payment Allocation", "ALLOC-A", 1, "P1", "Payable", "Supplier", "SUP", "331-A",
     -100, -100, "VND", 0, "Purchase Invoice", "PINV-B", "2026-06-20T08:00:00Z"),
))
insert_doc(db, "VN Accounting Period", "KY-07", {
    "company": "COMP-A", "start_date": "2026-07-01", "end_date": "2026-07-31",
    "close_state": "Hard Locked", "allow_approved_adjustments": 0,
})
expect("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: insert_doc(db, "Payment Allocation", "ALLOC-LOCKED", {
    "company": "COMP-A", "posting_at": "2026-07-10T08:00:00Z"
}))

# A non-VN company keeps legacy stock-only behavior.
insert_doc(db, "Purchase Receipt", "PR-LEGACY", {"company": "COMP-C", "posting_at": "2026-06-20T08:00:00Z"})
db.execute("INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Purchase Receipt", "PR-LEGACY", posting="2026-06-20T08:00:00Z"))

# Existing legacy lock is superseded when VN policy becomes authoritative.
db.execute("INSERT INTO accounting_period_locks VALUES(?,?,?,?)", ("demo", "COMP-A", "2026-05-31", NOW))
policy = {
    "company": "COMP-A", "accounting_currency": "VND",
    "effective_from": "2026-01-01", "effective_to": "2026-12-31",
    "inventory_account": "156-A", "cogs_account": "632-A", "stock_adjustment_account": "811-A",
    "stock_received_but_not_billed_account": "338-A",
}
insert_doc(db, "VN Accounting Policy", "POL-1", policy)
assert db.execute("SELECT COUNT(*) FROM accounting_period_locks WHERE company='COMP-A'").fetchone()[0] == 0
expect("USE_VN_ACCOUNTING_PERIOD", lambda: db.execute(
    "INSERT INTO accounting_period_locks VALUES(?,?,?,?)", ("demo", "COMP-A", "2026-06-30", NOW)
))
expect("VN_ACCOUNTING_POLICY_OVERLAP", lambda: insert_doc(db, "VN Accounting Policy", "POL-2", {
    **policy, "effective_from": "2026-06-01", "effective_to": "2027-01-01"
}))
expect("VN_ACCOUNTING_POLICY_CONTROLS_REQUIRED", lambda: insert_doc(db, "VN Accounting Policy", "POL-GAP", {
    "company": "COMP-B", "accounting_currency": "VND", "effective_from": "2026-01-01"
}))

# Base ledgers reject any currency/scale other than Company.default_currency under policy.
insert_doc(db, "Journal Entry", "JV-FX-BAD-GL", {"company": "COMP-A", "posting_at": "2026-06-21T08:00:00Z"})
expect("GL_COMPANY_CURRENCY_MISMATCH", lambda: insert_gl(
    db, "Journal Entry", "JV-FX-BAD-GL", "D", "111-A", debit=100, currency="USD", scale=2, posting="2026-06-21T08:00:00Z"
))

# Purchase Receipt requires balanced base-currency GL under active policy.
insert_doc(db, "Purchase Receipt", "PR-1", {"company": "COMP-A", "posting_at": "2026-06-25T08:00:00Z"})
expect("PURCHASE_RECEIPT_GL_REQUIRED", lambda: db.execute(
    "INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Purchase Receipt", "PR-1")
))
insert_gl(db, "Purchase Receipt", "PR-1", "STOCK", "156-A", debit=500, posting="2026-06-25T08:00:00Z")
insert_gl(db, "Purchase Receipt", "PR-1", "SRBNB", "338-A", credit=500, posting="2026-06-25T08:00:00Z")
db.execute("INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Purchase Receipt", "PR-1"))

insert_doc(db, "Purchase Receipt", "PR-UNBAL", {"company": "COMP-A", "posting_at": "2026-06-26T08:00:00Z"})
insert_gl(db, "Purchase Receipt", "PR-UNBAL", "ONLY", "156-A", debit=500, posting="2026-06-26T08:00:00Z")
expect("PURCHASE_RECEIPT_GL_UNBALANCED", lambda: db.execute(
    "INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Purchase Receipt", "PR-UNBAL", posting="2026-06-26T08:00:00Z")
))
insert_gl(db, "Purchase Receipt", "PR-UNBAL", "BALANCE", "338-A", credit=500, posting="2026-06-26T08:00:00Z")

# Stock Entry is equally strict; foreign base-ledger currency is rejected.
insert_doc(db, "Stock Entry", "STE-1", {"company": "COMP-A", "purpose": "Material Receipt", "posting_at": "2026-06-27T08:00:00Z"})
expect("STOCK_ENTRY_GL_REQUIRED", lambda: db.execute(
    "INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Stock Entry", "STE-1", posting="2026-06-27T08:00:00Z")
))
insert_gl(db, "Stock Entry", "STE-1", "STOCK", "156-A", debit=500, posting="2026-06-27T08:00:00Z")
insert_gl(db, "Stock Entry", "STE-1", "OFFSET", "811-A", credit=500, posting="2026-06-27T08:00:00Z")
expect("STOCK_COMPANY_CURRENCY_MISMATCH", lambda: db.execute(
    "INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    stock_row("Stock Entry", "STE-1", line_key="BAD-CUR", currency="USD", scale=2, posting="2026-06-27T08:00:00Z")
))
db.execute("INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", stock_row("Stock Entry", "STE-1", posting="2026-06-27T08:00:00Z"))

# Delivery Note/COGS must accompany every valued stock issue under policy.
insert_doc(db, "Delivery Note", "DN-1", {"company": "COMP-A", "issue_purpose": "Bán hàng", "posting_at": "2026-06-28T08:00:00Z"})
issue = stock_row("Delivery Note", "DN-1", qty=-1_000_000, rate=500, value=-500, posting="2026-06-28T08:00:00Z")
expect("DELIVERY_NOTE_GL_REQUIRED", lambda: db.execute(
    "INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", issue
))
insert_gl(db, "Delivery Note", "DN-1", "COGS", "632-A", debit=500, posting="2026-06-28T08:00:00Z")
insert_gl(db, "Delivery Note", "DN-1", "STOCK", "156-A", credit=500, posting="2026-06-28T08:00:00Z")
db.execute("INSERT INTO stock_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", issue)

# Approved legal/account-map/tax versions cannot be edited or cancelled.
for doctype, name, payload, marker in [
    ("VN Legal Rule", "RULE-1", {"rule_type": "VAT", "regime_code": "Tax-specific", "taxpayer_segment": "GENERAL", "effective_from": "2026-01-01", "effective_to": "2026-12-31"}, "VN_LEGAL_RULE_IMMUTABLE"),
    ("TT99 Account Map", "MAP-1", {"company": "COMP-A", "source_account": "111-A", "effective_from": "2026-01-01", "effective_to": "2026-12-31"}, "TT99_ACCOUNT_MAP_IMMUTABLE"),
    ("VN Tax Ruleset", "TAX-1", {"company": "COMP-A", "rule_type": "VAT", "taxpayer_segment": "GENERAL", "effective_from": "2026-01-01", "effective_to": "2026-12-31"}, "VN_TAX_RULESET_IMMUTABLE"),
]:
    insert_doc(db, doctype, name, payload)
    expect(marker, lambda doctype=doctype, name=name: db.execute("UPDATE documents SET docstatus=2 WHERE doc_key=?", (f"{doctype}:{name}",)))
    expect(marker, lambda doctype=doctype, name=name, payload=payload: db.execute(
        "UPDATE documents SET payload_json=? WHERE doc_key=?", (json.dumps({**payload, "tampered": 1}), f"{doctype}:{name}")
    ))

# Resolved reconciliation evidence is immutable and ties to a submitted correction.
expect("VN_RECONCILIATION_DIFFERENCE_MISMATCH", lambda: insert_doc(db, "VN Reconciliation Case", "REC-BAD", {
    "company": "COMP-A", "expected_minor": 100, "actual_minor": 90, "difference_minor": 99
}, docstatus=0))
insert_doc(db, "VN Reconciliation Case", "REC-1", {
    "company": "COMP-A", "expected_minor": 100, "actual_minor": 90, "difference_minor": 10,
    "root_cause": "Missing correction", "resolution_doctype": "Journal Entry", "resolution_document": "JV-A"
})
expect("VN_RECONCILIATION_RESOLVED_IMMUTABLE", lambda: db.execute("UPDATE documents SET docstatus=2 WHERE doc_key='VN Reconciliation Case:REC-1'"))

# Approval identity comes from authenticated version history, never client payload.
db.execute(
    "INSERT INTO versions VALUES(?,?,?,?,?,?,?,?)",
    ("demo", "VN Legal Rule:RULE-1", 1, "cmd-rule", "chief@example.test", "submit",
     json.dumps({"doctype": "VN Legal Rule", "name": "RULE-1"}), NOW),
)
assert db.execute("SELECT approved_by,approved_at FROM accounting_approval_evidence WHERE name='RULE-1'").fetchone() == ("chief@example.test", NOW)

# Accepted fixtures leave no critical integrity exception.
critical = db.execute("SELECT code,voucher_type,voucher_no FROM accounting_integrity_exceptions WHERE severity='CRITICAL'").fetchall()
assert critical == [], critical
print("VN_ACCOUNTING_INTEGRITY_CLOSURE_0043_0047_PASS")
