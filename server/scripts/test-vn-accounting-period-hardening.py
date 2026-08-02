#!/usr/bin/env python3
"""Regression checks for VN accounting period hardening migration 0042."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute(
    """CREATE TABLE master_records(
      tenant_id TEXT NOT NULL,
      record_type TEXT NOT NULL,
      name TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id, record_type, name)
    )"""
)
db.execute(
    """CREATE TABLE documents(
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
      payload_json TEXT NOT NULL,
      PRIMARY KEY(tenant_id, doc_key),
      UNIQUE(tenant_id, doctype, name)
    )"""
)

for migration in (
    "0035_organization_hrms_vn_accounting.sql",
    "0039_hrm_operational_integrity.sql",
    "0040_hrm_payroll_source_integrity.sql",
    "0041_hrm_payroll_rule_integrity.sql",
    "0042_vn_accounting_period_hardening.sql",
):
    db.executescript((root / "migrations/tenant" / migration).read_text(encoding="utf-8"))


def insert(doctype, name, docstatus, payload, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            tenant,
            f"{doctype}:{name}",
            doctype,
            name,
            "qa",
            docstatus,
            "Submitted" if docstatus == 1 else "Draft",
            1,
            "2026-08-03T00:00:00Z",
            "2026-08-03T00:00:00Z",
            json.dumps(payload),
        ),
    )


def update_status(doctype, name, docstatus, tenant="demo"):
    db.execute(
        "UPDATE documents SET docstatus=?, status=?, version=version+1 WHERE tenant_id=? AND doc_key=?",
        (docstatus, "Cancelled" if docstatus == 2 else "Submitted", tenant, f"{doctype}:{name}"),
    )


def update_payload(doctype, name, payload, tenant="demo"):
    db.execute(
        "UPDATE documents SET payload_json=?, version=version+1 WHERE tenant_id=? AND doc_key=?",
        (json.dumps(payload), tenant, f"{doctype}:{name}"),
    )


def expect_rejected(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected database rejection: {marker}")


# Existing posted transaction then hard-lock the period.
insert("Journal Entry", "JV-JULY-POSTED", 1, {"company": "ALUMDOOR", "posting_at": "2026-07-15T08:00:00Z"})
db.commit()
insert("VN Accounting Period", "KY-07", 1, {
    "company": "ALUMDOOR", "start_date": "2026-07-01", "end_date": "2026-07-31",
    "close_state": "Hard Locked", "allow_approved_adjustments": 0,
})
db.commit()

expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: insert(
    "Journal Entry", "JV-LOCKED", 1, {"company": "ALUMDOOR", "posting_at": "2026-07-31T08:00:00Z"}
))
insert("Journal Entry", "JV-JULY-DRAFT", 0, {"company": "ALUMDOOR", "posting_at": "2026-07-20T08:00:00Z"})
db.commit()
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_status("Journal Entry", "JV-JULY-DRAFT", 1))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_status("Journal Entry", "JV-JULY-POSTED", 2))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_payload(
    "Journal Entry", "JV-JULY-POSTED", {"company": "ALUMDOOR", "posting_at": "2026-10-15T08:00:00Z"}
))

insert("Journal Entry", "JV-OCT-POSTED", 1, {"company": "ALUMDOOR", "posting_at": "2026-10-15T08:00:00Z"})
db.commit()
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_payload(
    "Journal Entry", "JV-OCT-POSTED", {"company": "ALUMDOOR", "posting_at": "2026-07-15T08:00:00Z"}
))

# Locked-period coverage for operational posting documents added by 0042.
for doctype, date_field in (
    ("Purchase Receipt", "posting_at"),
    ("Delivery Note", "posting_at"),
    ("Stock Reconciliation", "posting_date"),
    ("Warehouse Cash Voucher", "posting_date"),
    ("Warehouse Cash Transfer", "posting_date"),
):
    expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda doctype=doctype, date_field=date_field: insert(
        doctype, f"{doctype}-LOCKED", 1, {"company": "ALUMDOOR", date_field: "2026-07-10"}
    ))

# Tenant isolation.
insert("Journal Entry", "JV-OTHER-TENANT", 1, {
    "company": "ALUMDOOR", "posting_at": "2026-07-10T08:00:00Z"
}, tenant="other")
db.commit()

# Invalid and overlapping periods are rejected.
expect_rejected("ACCOUNTING_PERIOD_OVERLAP", lambda: insert("VN Accounting Period", "KY-07-OVERLAP", 1, {
    "company": "ALUMDOOR", "branch": "HN", "start_date": "2026-07-15", "end_date": "2026-08-05", "close_state": "Open"
}))
expect_rejected("ACCOUNTING_PERIOD_INVALID_RANGE", lambda: insert("VN Accounting Period", "KY-BAD-RANGE", 1, {
    "company": "ALUMDOOR", "start_date": "2026-10-31", "end_date": "2026-10-01", "close_state": "Open"
}))

for branch in ("HN", "HCM"):
    insert("VN Accounting Period", f"KY-{branch}-11", 1, {
        "company": "ALUMDOOR", "branch": branch, "start_date": "2026-11-01", "end_date": "2026-11-30", "close_state": "Open"
    })
    db.commit()
expect_rejected("ACCOUNTING_PERIOD_OVERLAP", lambda: update_payload("VN Accounting Period", "KY-HCM-11", {
    "company": "ALUMDOOR", "branch": "HN", "start_date": "2026-11-01", "end_date": "2026-11-30", "close_state": "Open"
}))

# Soft close: normal posting rejected; approved adjustment allowed only when period permits it.
insert("VN Accounting Period", "KY-08", 1, {
    "company": "ALUMDOOR", "start_date": "2026-08-01", "end_date": "2026-08-31",
    "close_state": "Soft Closed", "allow_approved_adjustments": 1,
})
db.commit()
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: insert(
    "Journal Entry", "JV-SOFT-BLOCKED", 1, {"company": "ALUMDOOR", "posting_at": "2026-08-02T08:00:00Z"}
))
insert("Journal Entry", "JV-ADJUSTMENT", 1, {
    "company": "ALUMDOOR", "posting_at": "2026-08-02T08:00:00Z", "approved_adjustment": 1,
    "adjustment_reason": "Điều chỉnh phân bổ lương", "adjustment_approved_by": "chief.accountant@example.test",
})
db.commit()

insert("VN Accounting Period", "KY-09", 1, {
    "company": "ALUMDOOR", "start_date": "2026-09-01", "end_date": "2026-09-30",
    "close_state": "Soft Closed", "allow_approved_adjustments": 0,
})
db.commit()
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: insert("Journal Entry", "JV-ADJUSTMENT-DISABLED", 1, {
    "company": "ALUMDOOR", "posting_at": "2026-09-02T08:00:00Z", "approved_adjustment": 1,
    "adjustment_reason": "Không được phép theo cấu hình kỳ", "adjustment_approved_by": "chief.accountant@example.test",
}))

print("VN_ACCOUNTING_PERIOD_HARDENING_0042_PASS")
