#!/usr/bin/env python3
"""Acceptance checks for warehouse-cash GL guards and projections."""
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
migration = root / "migrations/tenant/0038_warehouse_cash.sql"

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE master_records(
  tenant_id TEXT NOT NULL, record_type TEXT NOT NULL, name TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL DEFAULT '{}', modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,record_type,name)
);
CREATE TABLE documents(
  tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'owner', docstatus INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Draft',
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT '2026-08-02T00:00:00Z',
  modified_at TEXT NOT NULL DEFAULT '2026-08-02T00:00:00Z', payload_json TEXT NOT NULL,
  PRIMARY KEY(tenant_id,doc_key), UNIQUE(tenant_id,doctype,name)
);
CREATE TABLE gl_entries(
  tenant_id TEXT NOT NULL, voucher_type TEXT NOT NULL, voucher_no TEXT NOT NULL, voucher_revision INTEGER NOT NULL,
  line_key TEXT NOT NULL, account TEXT NOT NULL, party_type TEXT, party TEXT,
  debit_minor INTEGER NOT NULL DEFAULT 0, credit_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL, currency_scale INTEGER NOT NULL, cost_center TEXT,
  dimensions_json TEXT NOT NULL DEFAULT '{}', remarks TEXT, posting_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
);
""")
db.executescript(migration.read_text(encoding="utf-8"))


def fund(tenant, name, *, daily=50_000, max_balance=200_000, warehouse="WH-1"):
    data = {
        "fund_code": name, "fund_name": name, "company": "ACME", "warehouse": warehouse,
        "cash_account": "1111", "currency": "VND", "daily_limit_minor": daily,
        "max_balance_minor": max_balance, "disabled": False,
    }
    db.execute(
        "INSERT INTO documents(tenant_id,doc_key,doctype,name,payload_json) VALUES(?,?,?,?,?)",
        (tenant, f"Warehouse Cash Fund:{name}", "Warehouse Cash Fund", name, json.dumps(data)),
    )


def gl(tenant, voucher_type, voucher_no, line_key, *, fund_name, debit=0, credit=0,
       flow="incoming", warehouse="WH-1", account="1111", currency="VND", date="2026-08-02"):
    dims = {"warehouse": warehouse, "warehouse_cash_fund": fund_name, "warehouse_cash_flow": flow}
    db.execute(
        """INSERT INTO gl_entries(tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account,debit_minor,credit_minor,currency,currency_scale,dimensions_json,posting_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (tenant, voucher_type, voucher_no, 1, line_key, account, debit, credit, currency, 0, json.dumps(dims), date),
    )


def projection(tenant, record_type, name, field):
    row = db.execute(
        "SELECT data_json FROM master_records WHERE tenant_id=? AND record_type=? AND name=?",
        (tenant, record_type, name),
    ).fetchone()
    return None if row is None else json.loads(row[0])[field]


def rejects(message, fn):
    db.execute("SAVEPOINT expected_failure")
    try:
        fn()
    except sqlite3.IntegrityError as exc:
        assert message in str(exc), (message, exc)
        db.execute("ROLLBACK TO expected_failure")
        db.execute("RELEASE expected_failure")
        return
    db.execute("ROLLBACK TO expected_failure")
    db.execute("RELEASE expected_failure")
    raise AssertionError(f"expected {message}")


fund("t1", "F1")
fund("t2", "F1", daily=999_999, max_balance=999_999)

gl("t1", "Warehouse Cash Voucher", "V-IN", "CASH", fund_name="F1", debit=100_000, flow="incoming")
assert projection("t1", "Warehouse Cash Balance", "F1", "current_balance_minor") == 100_000
assert projection("t1", "Warehouse Cash Balance", "F1", "has_activity") == 1

gl("t1", "Warehouse Cash Voucher", "V-OUT", "CASH", fund_name="F1", credit=30_000, flow="outgoing")
assert projection("t1", "Warehouse Cash Balance", "F1", "current_balance_minor") == 70_000
assert projection("t1", "Warehouse Cash Daily Usage", "F1:2026-08-02", "outgoing_minor") == 30_000

rejects("WAREHOUSE_CASH_DAILY_LIMIT", lambda: gl("t1", "Warehouse Cash Voucher", "V-LIMIT", "CASH", fund_name="F1", credit=25_000, flow="outgoing"))
rejects("WAREHOUSE_CASH_NEGATIVE_BALANCE", lambda: gl("t1", "Warehouse Cash Voucher", "V-NEG", "CASH", fund_name="F1", credit=80_000, flow="outgoing"))
rejects("WAREHOUSE_CASH_MAX_BALANCE", lambda: gl("t1", "Warehouse Cash Voucher", "V-MAX", "CASH", fund_name="F1", debit=150_000, flow="incoming"))
rejects("WAREHOUSE_CASH_ACCOUNT_MISMATCH", lambda: gl("t1", "Warehouse Cash Voucher", "V-ACC", "CASH", fund_name="F1", debit=1, flow="incoming", account="9999"))
rejects("WAREHOUSE_CASH_WAREHOUSE_MISMATCH", lambda: gl("t1", "Warehouse Cash Voucher", "V-WH", "CASH", fund_name="F1", debit=1, flow="incoming", warehouse="WH-X"))
rejects("WAREHOUSE_CASH_CURRENCY_MISMATCH", lambda: gl("t1", "Warehouse Cash Voucher", "V-CUR", "CASH", fund_name="F1", debit=1, flow="incoming", currency="USD"))

gl("t1", "Warehouse Cash Voucher", "V-OUT", "REV-CASH", fund_name="F1", debit=30_000, flow="outgoing")
assert projection("t1", "Warehouse Cash Balance", "F1", "current_balance_minor") == 100_000
assert projection("t1", "Warehouse Cash Daily Usage", "F1:2026-08-02", "outgoing_minor") == 0

gl("t1", "Warehouse Cash Transfer", "T-1", "TRANSFER-OUT", fund_name="F1", credit=10_000, flow="transfer_out")
assert projection("t1", "Warehouse Cash Balance", "F1", "current_balance_minor") == 90_000
assert projection("t1", "Warehouse Cash Daily Usage", "F1:2026-08-02", "outgoing_minor") == 0

gl("t2", "Warehouse Cash Voucher", "B-IN", "CASH", fund_name="F1", debit=7_000, flow="incoming")
assert projection("t2", "Warehouse Cash Balance", "F1", "current_balance_minor") == 7_000
assert projection("t1", "Warehouse Cash Balance", "F1", "current_balance_minor") == 90_000

old = db.execute("SELECT payload_json FROM documents WHERE tenant_id='t1' AND doctype='Warehouse Cash Fund' AND name='F1'").fetchone()[0]
changed = json.loads(old)
changed["warehouse"] = "WH-2"
rejects("WAREHOUSE_CASH_FUND_MAPPING_IMMUTABLE", lambda: db.execute("UPDATE documents SET payload_json=? WHERE tenant_id='t1' AND doctype='Warehouse Cash Fund' AND name='F1'", (json.dumps(changed),)))
disabled = json.loads(old)
disabled["disabled"] = True
rejects("WAREHOUSE_CASH_NONZERO_DISABLE", lambda: db.execute("UPDATE documents SET payload_json=? WHERE tenant_id='t1' AND doctype='Warehouse Cash Fund' AND name='F1'", (json.dumps(disabled),)))
rejects("WAREHOUSE_CASH_FUND_HAS_ACTIVITY", lambda: db.execute("DELETE FROM documents WHERE tenant_id='t1' AND doctype='Warehouse Cash Fund' AND name='F1'"))

gl("t1", "Warehouse Cash Transfer", "T-REV", "TRANSFER-IN", fund_name="F1", debit=10_000, flow="transfer_in")
gl("t1", "Warehouse Cash Transfer", "T-ZERO", "TRANSFER-OUT", fund_name="F1", credit=100_000, flow="transfer_out", date="2026-08-03")
assert projection("t1", "Warehouse Cash Balance", "F1", "current_balance_minor") == 0
disabled = json.loads(old)
disabled["disabled"] = True
db.execute("UPDATE documents SET payload_json=? WHERE tenant_id='t1' AND doctype='Warehouse Cash Fund' AND name='F1'", (json.dumps(disabled),))
assert json.loads(db.execute("SELECT payload_json FROM documents WHERE tenant_id='t1' AND doctype='Warehouse Cash Fund' AND name='F1'").fetchone()[0])["disabled"] is True

print("WAREHOUSE_CASH_MIGRATION_0038_PASS")
