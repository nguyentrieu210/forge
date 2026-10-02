#!/usr/bin/env python3
"""SQLite regression for R8-B Exchange Rate Revaluation source/rate guards."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("""CREATE TABLE documents(
  tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL,
  owner TEXT NOT NULL, docstatus INTEGER NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
  created_at TEXT NOT NULL, modified_at TEXT NOT NULL, payload_json TEXT NOT NULL,
  PRIMARY KEY(tenant_id,doc_key), UNIQUE(tenant_id,doctype,name)
)""")
db.execute("""CREATE TABLE master_records(
  tenant_id TEXT NOT NULL, record_type TEXT NOT NULL, name TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL, modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,record_type,name)
)""")
db.execute("""CREATE TABLE doctype_definitions(
  tenant_id TEXT NOT NULL, doctype TEXT NOT NULL, module TEXT NOT NULL,
  is_custom INTEGER NOT NULL, is_submittable INTEGER NOT NULL, is_child INTEGER NOT NULL,
  revision INTEGER NOT NULL, metadata_json TEXT NOT NULL, disabled INTEGER NOT NULL,
  modified_by TEXT NOT NULL, modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,doctype)
)""")
db.execute("""CREATE TABLE payment_ledger_entries(
  tenant_id TEXT NOT NULL, voucher_type TEXT NOT NULL, voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL, line_key TEXT NOT NULL,
  account_type TEXT NOT NULL, party_type TEXT NOT NULL, party TEXT NOT NULL, account TEXT NOT NULL,
  amount_minor INTEGER NOT NULL, base_amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL, currency_scale INTEGER NOT NULL,
  against_voucher_type TEXT, against_voucher_no TEXT, posting_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
)""")
db.executescript((root / "migrations/tenant/0154_exchange_rate_revaluation.sql").read_text(encoding="utf-8"))


def master(record_type, name, data):
    db.execute(
        "INSERT INTO master_records VALUES(?,?,?,?,?,?)",
        ("demo", record_type, name, 0, json.dumps(data), "2026-10-02T00:00:00Z"),
    )


def document(doctype, name, data, docstatus=1):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            "demo", f"{doctype}:{name}", doctype, name, "qa@example.test",
            docstatus, "Submitted" if docstatus == 1 else "Draft", 1,
            "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z", json.dumps(data),
        ),
    )


def payment(voucher_type, voucher_no, line_key, amount, base, posting_at):
    db.execute(
        "INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            "demo", voucher_type, voucher_no, 1, line_key, "Receivable", "Customer", "CUST-1", "Debtors",
            amount, base, "EUR", 2, "Sales Invoice", "SI-1", posting_at,
        ),
    )


def expect(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected {marker}")


master("Company", "Kairo", {"default_currency": "VND", "exchange_gain_loss_account": "FX-GL"})
master("Currency", "VND", {"currency_scale": 0})
master("Exchange Rate", "EUR:VND:2026-09-30", {"rate": "30000"})
document("Sales Invoice", "SI-1", {"company": "Kairo", "currency": "EUR"})
payment("Sales Invoice", "SI-1", "OPEN", 10000, 2900000, "2026-08-01T00:00:00Z")
# Future allocation must not affect the 30-Sep source snapshot.
payment("Payment Entry", "PE-FUTURE", "ALLOC", -1000, -300000, "2026-10-15T00:00:00Z")
db.commit()

entry = {
    "row_id": "FX-1",
    "account_type": "Receivable",
    "party_type": "Customer",
    "party": "CUST-1",
    "account": "Debtors",
    "against_voucher_type": "Sales Invoice",
    "against_voucher_no": "SI-1",
    "currency": "EUR",
    "currency_scale": 2,
    "outstanding_minor": 10000,
    "base_outstanding_minor": 2900000,
    "closing_rate_micros": 30000000000,
    "closing_rate": "30000.000000",
    "target_base_minor": 3000000,
    "difference_minor": 100000,
    "source_row_count": 1,
}
payload = {
    "company": "Kairo",
    "posting_at": "2026-09-30T23:59:59.000Z",
    "company_currency": "VND",
    "company_currency_scale": 0,
    "gain_loss_account": "FX-GL",
    "reversal_at": "2026-10-01T23:59:59.000Z",
    "total_gain_minor": 100000,
    "total_loss_minor": 0,
    "total_adjustment_minor": 100000,
    "revaluation_entries": [entry],
}
document("Exchange Rate Revaluation", "FX-OK", {"company": "Kairo", "posting_at": payload["posting_at"]}, 0)
db.execute(
    "UPDATE documents SET docstatus=1,status='Submitted',payload_json=? WHERE tenant_id='demo' AND doctype='Exchange Rate Revaluation' AND name='FX-OK'",
    (json.dumps(payload),),
)
db.commit()

# Another draft built from the same source is rejected for the same company/date.
document("Exchange Rate Revaluation", "FX-DUP", {"company": "Kairo", "posting_at": payload["posting_at"]}, 0)
db.commit()
expect("FINANCE_FX_DUPLICATE_DATE", lambda: db.execute(
    "UPDATE documents SET docstatus=1,payload_json=? WHERE tenant_id='demo' AND doctype='Exchange Rate Revaluation' AND name='FX-DUP'",
    (json.dumps(payload),),
))

# Cancel the first fixture in raw SQL to isolate source-drift checks.
db.execute("UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doctype='Exchange Rate Revaluation' AND name='FX-OK'")
db.commit()

# A new allocation dated before period end invalidates the controller snapshot atomically.
payment("Payment Entry", "PE-BACKDATED", "ALLOC", -1000, -290000, "2026-09-20T00:00:00Z")
document("Exchange Rate Revaluation", "FX-DRIFT", {"company": "Kairo", "posting_at": payload["posting_at"]}, 0)
db.commit()
expect("FINANCE_FX_SOURCE_BALANCE_DRIFT", lambda: db.execute(
    "UPDATE documents SET docstatus=1,payload_json=? WHERE tenant_id='demo' AND doctype='Exchange Rate Revaluation' AND name='FX-DRIFT'",
    (json.dumps(payload),),
))

# Restore a fresh snapshot, then mutate the authoritative close rate.
fresh_entry = {**entry, "outstanding_minor": 9000, "base_outstanding_minor": 2610000, "source_row_count": 2}
fresh_entry["target_base_minor"] = 2700000
fresh_entry["difference_minor"] = 90000
fresh = {**payload, "total_gain_minor": 90000, "total_adjustment_minor": 90000, "revaluation_entries": [fresh_entry]}
db.execute("UPDATE master_records SET data_json=? WHERE tenant_id='demo' AND record_type='Exchange Rate' AND name='EUR:VND:2026-09-30'",
           (json.dumps({"rate": "31000"}),))
document("Exchange Rate Revaluation", "FX-RATE", {"company": "Kairo", "posting_at": payload["posting_at"]}, 0)
db.commit()
expect("FINANCE_FX_RATE_DRIFT", lambda: db.execute(
    "UPDATE documents SET docstatus=1,payload_json=? WHERE tenant_id='demo' AND doctype='Exchange Rate Revaluation' AND name='FX-RATE'",
    (json.dumps(fresh),),
))

meta = db.execute(
    "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='__standard__' AND doctype='Exchange Rate Revaluation'"
).fetchone()
assert meta and json.loads(meta[0])["is_submittable"] is True
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("EXCHANGE_RATE_REVALUATION_0154_PASS")
