#!/usr/bin/env python3
"""Acceptance checks for organization/HRMS and VN accounting period integrity."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
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
    "0039_vn_accounting_period_hardening.sql",
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
            "2026-08-01T00:00:00Z",
            "2026-08-01T00:00:00Z",
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


def expect_integrity(expected, fn, message):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert expected in str(error), str(error)
    else:
        raise AssertionError(message)


insert("Employee", "NV-1", 0, {"company": "ALUMDOOR", "employee_number": "NV001"})
expect_integrity(
    "UNIQUE constraint failed",
    lambda: insert("Employee", "NV-2", 0, {"company": "ALUMDOOR", "employee_number": "NV001"}),
    "duplicate employee number was accepted",
)
insert("Attendance", "CC-1", 1, {"employee": "NV-1", "attendance_date": "2026-08-01"})
expect_integrity(
    "UNIQUE constraint failed",
    lambda: insert("Attendance", "CC-2", 1, {"employee": "NV-1", "attendance_date": "2026-08-01"}),
    "duplicate attendance was accepted",
)

insert("Journal Entry", "JV-JULY-POSTED", 1, {"company": "ALUMDOOR", "posting_at": "2026-07-15T08:00:00Z"})
insert(
    "VN Accounting Period",
    "KY-07",
    1,
    {
        "company": "ALUMDOOR",
        "start_date": "2026-07-01",
        "end_date": "2026-07-31",
        "close_state": "Hard Locked",
        "allow_approved_adjustments": 0,
    },
)
expect_integrity(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: insert("Journal Entry", "JV-LOCKED", 1, {"company": "ALUMDOOR", "posting_at": "2026-07-31T08:00:00Z"}),
    "hard-locked period accepted a new posting",
)
insert("Journal Entry", "JV-JULY-DRAFT", 0, {"company": "ALUMDOOR", "posting_at": "2026-07-20T08:00:00Z"})
expect_integrity(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_status("Journal Entry", "JV-JULY-DRAFT", 1),
    "hard-locked period accepted draft-to-submit",
)
expect_integrity(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_status("Journal Entry", "JV-JULY-POSTED", 2),
    "hard-locked period allowed cancellation",
)
expect_integrity(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_payload(
        "Journal Entry",
        "JV-JULY-POSTED",
        {"company": "ALUMDOOR", "posting_at": "2026-10-15T08:00:00Z"},
    ),
    "submitted document escaped a hard-locked period by changing scope",
)
insert("Journal Entry", "JV-OCT-POSTED", 1, {"company": "ALUMDOOR", "posting_at": "2026-10-15T08:00:00Z"})
expect_integrity(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_payload(
        "Journal Entry",
        "JV-OCT-POSTED",
        {"company": "ALUMDOOR", "posting_at": "2026-07-15T08:00:00Z"},
    ),
    "submitted document entered a hard-locked period by changing scope",
)

for doctype, date_field in (
    ("Purchase Receipt", "posting_at"),
    ("Delivery Note", "posting_at"),
    ("Warehouse Cash Voucher", "posting_date"),
):
    expect_integrity(
        "ACCOUNTING_PERIOD_HARD_LOCKED",
        lambda doctype=doctype, date_field=date_field: insert(
            doctype,
            f"{doctype}-LOCKED",
            1,
            {"company": "ALUMDOOR", date_field: "2026-07-10"},
        ),
        f"hard-locked period accepted {doctype}",
    )

insert(
    "Journal Entry",
    "JV-OTHER-TENANT",
    1,
    {"company": "ALUMDOOR", "posting_at": "2026-07-10T08:00:00Z"},
    tenant="other",
)
expect_integrity(
    "ACCOUNTING_PERIOD_OVERLAP",
    lambda: insert(
        "VN Accounting Period",
        "KY-07-OVERLAP",
        1,
        {
            "company": "ALUMDOOR",
            "branch": "HN",
            "start_date": "2026-07-15",
            "end_date": "2026-08-05",
            "close_state": "Open",
        },
    ),
    "overlapping company-wide accounting period was accepted",
)
expect_integrity(
    "ACCOUNTING_PERIOD_INVALID_RANGE",
    lambda: insert(
        "VN Accounting Period",
        "KY-BAD-RANGE",
        1,
        {
            "company": "ALUMDOOR",
            "start_date": "2026-10-31",
            "end_date": "2026-10-01",
            "close_state": "Open",
        },
    ),
    "accounting period accepted start_date after end_date",
)

insert("Journal Entry", "JV-AUG-POSTED", 1, {"company": "ALUMDOOR", "posting_at": "2026-08-03T08:00:00Z"})
insert(
    "VN Accounting Period",
    "KY-08",
    1,
    {
        "company": "ALUMDOOR",
        "start_date": "2026-08-01",
        "end_date": "2026-08-31",
        "close_state": "Soft Closed",
        "allow_approved_adjustments": 1,
    },
)
expect_integrity(
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
    lambda: insert("Journal Entry", "JV-SOFT-BLOCKED", 1, {"company": "ALUMDOOR", "posting_at": "2026-08-02T08:00:00Z"}),
    "soft-closed period accepted an unapproved posting",
)
expect_integrity(
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
    lambda: update_status("Journal Entry", "JV-AUG-POSTED", 2),
    "soft-closed period allowed unapproved cancellation",
)
insert(
    "Journal Entry",
    "JV-ADJUSTMENT",
    1,
    {
        "company": "ALUMDOOR",
        "posting_at": "2026-08-02T08:00:00Z",
        "approved_adjustment": 1,
        "adjustment_reason": "Điều chỉnh phân bổ lương",
        "adjustment_approved_by": "chief.accountant@example.test",
        "source_payroll_entry": "PAYROLL-2026-08",
    },
)
insert(
    "VN Accounting Period",
    "KY-09",
    1,
    {
        "company": "ALUMDOOR",
        "start_date": "2026-09-01",
        "end_date": "2026-09-30",
        "close_state": "Soft Closed",
        "allow_approved_adjustments": 0,
    },
)
expect_integrity(
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
    lambda: insert(
        "Journal Entry",
        "JV-ADJUSTMENT-DISABLED",
        1,
        {
            "company": "ALUMDOOR",
            "posting_at": "2026-09-02T08:00:00Z",
            "approved_adjustment": 1,
            "adjustment_reason": "Không được phép theo cấu hình kỳ",
            "adjustment_approved_by": "chief.accountant@example.test",
        },
    ),
    "soft-closed period ignored allow_approved_adjustments=0",
)

for branch in ("HN", "HCM"):
    insert(
        "VN Accounting Period",
        f"KY-{branch}-11",
        1,
        {
            "company": "ALUMDOOR",
            "branch": branch,
            "start_date": "2026-11-01",
            "end_date": "2026-11-30",
            "close_state": "Open",
        },
    )
expect_integrity(
    "ACCOUNTING_PERIOD_OVERLAP",
    lambda: update_payload(
        "VN Accounting Period",
        "KY-HCM-11",
        {
            "company": "ALUMDOOR",
            "branch": "HN",
            "start_date": "2026-11-01",
            "end_date": "2026-11-30",
            "close_state": "Open",
        },
    ),
    "accounting period update created an overlapping branch scope",
)
expect_integrity(
    "UNIQUE constraint failed",
    lambda: insert(
        "Journal Entry",
        "JV-DUPLICATE",
        1,
        {
            "company": "ALUMDOOR",
            "posting_at": "2026-10-01T08:00:00Z",
            "source_payroll_entry": "PAYROLL-2026-08",
        },
    ),
    "duplicate payroll journal source was accepted",
)

print("ORGANIZATION_HRMS_VN_ACCOUNTING_MIGRATIONS_PASS")
