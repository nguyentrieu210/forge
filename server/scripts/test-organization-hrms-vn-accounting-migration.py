#!/usr/bin/env python3
"""Acceptance checks for organization/HRMS/accounting migrations 0035 and 0039."""

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
db.executescript((root / "migrations/tenant/0039_hrm_operational_integrity.sql").read_text(encoding="utf-8"))
db.executescript((root / "migrations/tenant/0040_hrm_payroll_source_integrity.sql").read_text(encoding="utf-8"))


def insert(doctype, name, docstatus, payload, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (tenant, f"{doctype}:{name}", doctype, name, "qa", docstatus, "Submitted" if docstatus == 1 else "Draft", 1,
         "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", json.dumps(payload)),
    )


def expect_rejected(fn, marker=None):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        if marker:
            assert marker in str(error), (marker, str(error))
    else:
        raise AssertionError(f"expected database rejection: {marker or 'constraint'}")


# Existing 0035 guards remain intact.
insert("Employee", "NV-1", 0, {"company": "ALUMDOOR", "employee_number": "NV001"})
expect_rejected(lambda: insert("Employee", "NV-2", 0, {"company": "ALUMDOOR", "employee_number": "NV001"}))
insert("Attendance", "CC-1", 1, {"employee": "NV-1", "attendance_date": "2026-08-01"})
expect_rejected(lambda: insert("Attendance", "CC-2", 1, {"employee": "NV-1", "attendance_date": "2026-08-01"}))

insert("VN Accounting Period", "KY-07", 1, {
    "company": "ALUMDOOR", "start_date": "2026-07-01", "end_date": "2026-07-31", "close_state": "Hard Locked"
})
expect_rejected(
    lambda: insert("Journal Entry", "JV-LOCKED", 1, {"company": "ALUMDOOR", "posting_at": "2026-07-31T08:00:00Z"}),
    "ACCOUNTING_PERIOD_HARD_LOCKED",
)
insert("Journal Entry", "JV-OPEN", 1, {"company": "ALUMDOOR", "posting_at": "2026-08-01T08:00:00Z"})

insert("VN Accounting Period", "KY-08", 1, {
    "company": "ALUMDOOR", "start_date": "2026-08-01", "end_date": "2026-08-31", "close_state": "Soft Closed"
})
expect_rejected(
    lambda: insert("Journal Entry", "JV-SOFT-BLOCKED", 1, {"company": "ALUMDOOR", "posting_at": "2026-08-02T08:00:00Z"}),
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
)
insert("Journal Entry", "JV-ADJUSTMENT", 1, {
    "company": "ALUMDOOR", "posting_at": "2026-08-02T08:00:00Z", "approved_adjustment": 1,
    "adjustment_reason": "Điều chỉnh phân bổ lương", "adjustment_approved_by": "chief.accountant@example.test",
    "source_payroll_entry": "PAYROLL-2026-08",
})
expect_rejected(lambda: insert("Journal Entry", "JV-DUPLICATE", 1, {
    "company": "ALUMDOOR", "posting_at": "2026-09-01T08:00:00Z", "source_payroll_entry": "PAYROLL-2026-08",
}))

# HR interval integrity is tenant-scoped and race-safe.
insert("Employment Contract", "HD-1", 1, {"employee": "NV-1", "start_date": "2026-01-01", "end_date": "2026-12-31"})
expect_rejected(lambda: insert("Employment Contract", "HD-2", 1, {"employee": "NV-1", "start_date": "2026-06-01"}), "HR_CONTRACT_OVERLAP")
insert("Employment Contract", "HD-T2", 1, {"employee": "NV-1", "start_date": "2026-06-01"}, tenant="tenant-b")

insert("Shift Assignment", "CA-1", 1, {"employee": "NV-1", "start_date": "2026-08-01", "end_date": "2026-08-31"})
expect_rejected(lambda: insert("Shift Assignment", "CA-2", 1, {"employee": "NV-1", "start_date": "2026-08-15"}), "HR_SHIFT_OVERLAP")

insert("Leave Allocation", "CPP-1", 1, {"employee": "NV-1", "leave_type": "AL", "from_date": "2026-01-01", "to_date": "2026-12-31"})
expect_rejected(lambda: insert("Leave Allocation", "CPP-2", 1, {"employee": "NV-1", "leave_type": "AL", "from_date": "2026-06-01", "to_date": "2026-12-31"}), "HR_LEAVE_ALLOCATION_OVERLAP")

insert("Leave Application", "NP-1", 1, {"employee": "NV-1", "leave_type": "AL", "from_date": "2026-09-10", "to_date": "2026-09-11"})
expect_rejected(lambda: insert("Leave Application", "NP-2", 1, {"employee": "NV-1", "leave_type": "SL", "from_date": "2026-09-11", "to_date": "2026-09-12"}), "HR_LEAVE_OVERLAP")

insert("Overtime Request", "OT-1", 1, {"employee": "NV-1", "overtime_date": "2026-08-10"})
expect_rejected(lambda: insert("Overtime Request", "OT-2", 1, {"employee": "NV-1", "overtime_date": "2026-08-10"}), "HR_OVERTIME_DUPLICATE")

insert("Employee Checkin", "CK-1", 1, {"employee": "NV-1", "time": "2026-08-10T08:00:00+07:00", "log_type": "IN", "external_id": "DEVICE-1"})
expect_rejected(lambda: insert("Employee Checkin", "CK-2", 1, {"employee": "NV-1", "time": "2026-08-10T08:01:00+07:00", "log_type": "IN", "external_id": "DEVICE-1"}), "HR_CHECKIN_DUPLICATE")

insert("Salary Structure Assignment", "SSA-1", 1, {"employee": "NV-1", "from_date": "2026-01-01", "to_date": "2026-12-31"})
expect_rejected(lambda: insert("Salary Structure Assignment", "SSA-2", 1, {"employee": "NV-1", "from_date": "2026-08-01"}), "HR_SALARY_ASSIGNMENT_OVERLAP")

insert("Payroll Period", "P-08", 1, {"company": "ALUMDOOR", "branch": "HCM", "start_date": "2026-08-01", "end_date": "2026-08-31"})
expect_rejected(lambda: insert("Payroll Period", "P-08B", 1, {"company": "ALUMDOOR", "branch": "HCM", "start_date": "2026-08-15", "end_date": "2026-09-14"}), "HR_PAYROLL_PERIOD_OVERLAP")
insert("Payroll Period", "P-08-HN", 1, {"company": "ALUMDOOR", "branch": "HN", "start_date": "2026-08-01", "end_date": "2026-08-31"})

# Submitted salary slips may not overlap for one employee/company.
insert("Salary Slip", "SAL-08", 1, {"employee": "NV-1", "company": "ALUMDOOR", "start_date": "2026-08-01", "end_date": "2026-08-31"})
expect_rejected(lambda: insert("Salary Slip", "SAL-08B", 1, {"employee": "NV-1", "company": "ALUMDOOR", "start_date": "2026-08-15", "end_date": "2026-09-14"}), "HR_SALARY_SLIP_OVERLAP")

# Payroll facts become immutable once a submitted salary slip has consumed them.
insert("Attendance", "CC-PAY", 1, {"employee": "NV-1", "attendance_date": "2026-08-02"})
expect_rejected(
    lambda: db.execute("UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Attendance' AND name='CC-PAY'", (json.dumps({"employee": "NV-1", "attendance_date": "2026-08-02", "working_minutes": 1}),)),
    "HR_PAYROLL_SOURCE_LOCKED",
)
expect_rejected(
    lambda: db.execute("DELETE FROM documents WHERE tenant_id='demo' AND doctype='Attendance' AND name='CC-PAY'"),
    "HR_PAYROLL_SOURCE_LOCKED",
)

# Once the consuming slip is cancelled, a correction may proceed and a replacement slip can be created.
db.execute("UPDATE documents SET docstatus=2, status='Cancelled' WHERE tenant_id='demo' AND doctype='Salary Slip' AND name='SAL-08'")
db.execute("UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Attendance' AND name='CC-PAY'", (json.dumps({"employee": "NV-1", "attendance_date": "2026-08-02", "working_minutes": 480}),))
insert("Salary Slip", "SAL-08-R1", 1, {"employee": "NV-1", "company": "ALUMDOOR", "start_date": "2026-08-01", "end_date": "2026-08-31"})

print("ORGANIZATION_HRMS_VN_ACCOUNTING_MIGRATIONS_0035_0039_PASS")
