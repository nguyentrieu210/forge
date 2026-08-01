#!/usr/bin/env python3
"""Acceptance checks for organization/HRMS/accounting migration 0035."""

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
db.executescript((root / "migrations/tenant/0035_organization_hrms_vn_accounting.sql").read_text(encoding="utf-8"))


def insert(doctype, name, docstatus, payload):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", f"{doctype}:{name}", doctype, name, "qa", docstatus, "Submitted" if docstatus == 1 else "Draft", 1,
         "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", json.dumps(payload)),
    )


insert("Employee", "NV-1", 0, {"company": "ALUMDOOR", "employee_number": "NV001"})
try:
    insert("Employee", "NV-2", 0, {"company": "ALUMDOOR", "employee_number": "NV001"})
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("duplicate employee number was accepted")

insert("Attendance", "CC-1", 1, {"employee": "NV-1", "attendance_date": "2026-08-01"})
try:
    insert("Attendance", "CC-2", 1, {"employee": "NV-1", "attendance_date": "2026-08-01"})
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("duplicate attendance was accepted")

insert("VN Accounting Period", "KY-07", 1, {
    "company": "ALUMDOOR", "start_date": "2026-07-01", "end_date": "2026-07-31", "close_state": "Hard Locked"
})
try:
    insert("Journal Entry", "JV-LOCKED", 1, {"company": "ALUMDOOR", "posting_at": "2026-07-31T08:00:00Z"})
except sqlite3.IntegrityError as error:
    assert "ACCOUNTING_PERIOD_HARD_LOCKED" in str(error)
else:
    raise AssertionError("hard-locked period accepted a posting")

insert("Journal Entry", "JV-OPEN", 1, {"company": "ALUMDOOR", "posting_at": "2026-08-01T08:00:00Z"})

insert("VN Accounting Period", "KY-08", 1, {
    "company": "ALUMDOOR", "start_date": "2026-08-01", "end_date": "2026-08-31", "close_state": "Soft Closed"
})
try:
    insert("Journal Entry", "JV-SOFT-BLOCKED", 1, {"company": "ALUMDOOR", "posting_at": "2026-08-02T08:00:00Z"})
except sqlite3.IntegrityError as error:
    assert "ACCOUNTING_PERIOD_SOFT_CLOSED" in str(error)
else:
    raise AssertionError("soft-closed period accepted an unapproved posting")

insert("Journal Entry", "JV-ADJUSTMENT", 1, {
    "company": "ALUMDOOR",
    "posting_at": "2026-08-02T08:00:00Z",
    "approved_adjustment": 1,
    "adjustment_reason": "Điều chỉnh phân bổ lương",
    "adjustment_approved_by": "chief.accountant@example.test",
    "source_payroll_entry": "PAYROLL-2026-08",
})
try:
    insert("Journal Entry", "JV-DUPLICATE", 1, {
        "company": "ALUMDOOR",
        "posting_at": "2026-09-01T08:00:00Z",
        "source_payroll_entry": "PAYROLL-2026-08",
    })
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("duplicate payroll journal was accepted")

print("ORGANIZATION_HRMS_VN_ACCOUNTING_MIGRATION_0035_PASS")
