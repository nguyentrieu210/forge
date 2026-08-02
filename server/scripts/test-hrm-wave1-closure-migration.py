#!/usr/bin/env python3
"""Focused SQLite regression for HRM Wave 1 closure migration 0044."""

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
      docstatus INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY(tenant_id, doc_key),
      UNIQUE(tenant_id, doctype, name)
    )"""
)
db.executescript((root / "migrations/tenant/0044_hrm_wave1_closure.sql").read_text(encoding="utf-8"))


def insert_doc(doctype, name, docstatus, payload, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?)",
        (tenant, f"{doctype}:{name}", doctype, name, docstatus, json.dumps(payload)),
    )


def expect_rejected(fn, marker):
    db.execute("SAVEPOINT expected_rejection")
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.execute("ROLLBACK TO expected_rejection")
        db.execute("RELEASE expected_rejection")
    else:
        db.execute("ROLLBACK TO expected_rejection")
        db.execute("RELEASE expected_rejection")
        raise AssertionError(f"expected database rejection: {marker}")


insert_doc("Employee Checkin", "CHK-IN", 1, {"employee": "EMP-1", "time": "2026-08-03T08:00:00Z", "log_type": "IN"})
insert_doc("Employee Checkin", "CHK-OUT", 1, {"employee": "EMP-1", "time": "2026-08-03T17:00:00Z", "log_type": "OUT"})
insert_doc("Employee Checkin", "CHK-FREE", 1, {"employee": "EMP-1", "time": "2026-08-04T08:00:00Z", "log_type": "IN"})
insert_doc(
    "Attendance",
    "ATT-1",
    1,
    {
        "employee": "EMP-1",
        "attendance_date": "2026-08-03",
        "source": "Checkin",
        "checkin_refs_json": json.dumps(["CHK-IN", "CHK-OUT"]),
    },
)

expect_rejected(
    lambda: db.execute(
        "UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Employee Checkin' AND name='CHK-IN'",
        (json.dumps({"employee": "EMP-1", "time": "2026-08-03T09:00:00Z", "log_type": "IN"}),),
    ),
    "HR_CHECKIN_SOURCE_LOCKED",
)
expect_rejected(
    lambda: db.execute("DELETE FROM documents WHERE tenant_id='demo' AND doctype='Employee Checkin' AND name='CHK-OUT'"),
    "HR_CHECKIN_SOURCE_LOCKED",
)

db.execute(
    "UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Employee Checkin' AND name='CHK-FREE'",
    (json.dumps({"employee": "EMP-1", "time": "2026-08-04T08:05:00Z", "log_type": "IN"}),),
)

insert_doc("Hiring Completion", "HIRE-1", 1, {"job_offer": "OFFER-1", "employee": "EMP-1"})
expect_rejected(
    lambda: insert_doc("Hiring Completion", "HIRE-2", 1, {"job_offer": "OFFER-1", "employee": "EMP-2"}),
    "HR_HIRING_COMPLETION_DUPLICATE",
)
expect_rejected(
    lambda: insert_doc("Hiring Completion", "HIRE-3", 1, {"job_offer": "OFFER-2", "employee": "EMP-1"}),
    "HR_HIRING_COMPLETION_DUPLICATE",
)

insert_doc("Employee Final Settlement", "FSET-1", 1, {"separation": "SEP-1", "employee": "EMP-1"})
expect_rejected(
    lambda: insert_doc("Employee Final Settlement", "FSET-2", 1, {"separation": "SEP-1", "employee": "EMP-1"}),
    "HR_FINAL_SETTLEMENT_DUPLICATE",
)

# Tenant isolation: the same business references are valid in another tenant.
insert_doc("Hiring Completion", "HIRE-OTHER", 1, {"job_offer": "OFFER-1", "employee": "EMP-1"}, tenant="other")
insert_doc("Employee Final Settlement", "FSET-OTHER", 1, {"separation": "SEP-1", "employee": "EMP-1"}, tenant="other")

print("HRM Wave 1 closure migration regression: PASS")
