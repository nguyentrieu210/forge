#!/usr/bin/env python3
"""Focused SQLite regression for HRM workforce/finance integrity migration 0044."""

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
db.executescript((root / "migrations/tenant/0044_hrm_workforce_finance_integrity.sql").read_text(encoding="utf-8"))
NOW = "2026-08-03T00:00:00Z"


def insert_doc(doctype, name, docstatus, payload, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (tenant, f"{doctype}:{name}", doctype, name, "qa", docstatus,
         "Submitted" if docstatus == 1 else "Draft", 1, NOW, NOW, json.dumps(payload)),
    )


def rejected(fn, marker):
    db.execute("SAVEPOINT expected_failure")
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.execute("ROLLBACK TO expected_failure")
        db.execute("RELEASE expected_failure")
        return
    db.execute("ROLLBACK TO expected_failure")
    db.execute("RELEASE expected_failure")
    raise AssertionError(f"expected rejection containing {marker}")


insert_doc("Employee Benefit Enrollment", "BEN-1", 1, {
    "employee": "EMP-1", "company": "Demo", "benefit_code": "MEAL",
    "effective_from": "2026-01-01", "frequency": "Monthly", "amount": "1000000"
})
insert_doc("Salary Slip", "SLIP-BEN", 1, {
    "employee": "EMP-1", "start_date": "2026-07-01", "end_date": "2026-07-31",
    "rule_trace_json": json.dumps({"benefit_enrollments": [{"name": "BEN-1", "version": 1}]})
})
rejected(
    lambda: db.execute("UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doc_key='Employee Benefit Enrollment:BEN-1'",
                       (json.dumps({"employee": "EMP-1", "amount": "2000000"}),)),
    "HR_PAYROLL_SOURCE_LOCKED",
)

insert_doc("Employee Loan", "LOAN-1", 1, {
    "employee": "EMP-1", "company": "Demo", "loan_date": "2026-01-01",
    "principal_amount": "12000000", "currency": "VND"
})
insert_doc("Employee Loan Repayment", "LR-1", 1, {
    "employee_loan": "LOAN-1", "posting_date": "2026-05-15", "amount": "1000000"
})
rejected(
    lambda: db.execute("DELETE FROM documents WHERE tenant_id='demo' AND doc_key='Employee Loan:LOAN-1'"),
    "HR_EMPLOYEE_LOAN_LOCKED",
)
insert_doc("Salary Slip", "SLIP-LOAN", 1, {
    "employee": "EMP-1", "start_date": "2026-06-01", "end_date": "2026-06-30",
    "rule_trace_json": json.dumps({"employee_loans": [{"name": "LOAN-1", "amount_minor": 1000000}]})
})
rejected(
    lambda: db.execute("UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doc_key='Employee Loan Repayment:LR-1'"),
    "HR_LOAN_REPAYMENT_CONSUMED",
)

insert_doc("Workforce Plan", "WP-1", 1, {"company": "Demo", "fiscal_year": "2026"})
rejected(
    lambda: insert_doc("Workforce Plan", "WP-2", 1, {"company": "Demo", "fiscal_year": "2026"}),
    "HR_WORKFORCE_PLAN_DUPLICATE",
)
insert_doc("Workforce Plan", "WP-OTHER", 1, {"company": "Other", "fiscal_year": "2026"})

insert_doc("Salary Bank Batch", "BANK-1", 1, {"payroll_entry": "PAY-2026-07"})
rejected(
    lambda: insert_doc("Salary Bank Batch", "BANK-2", 1, {"payroll_entry": "PAY-2026-07"}),
    "HR_SALARY_BANK_BATCH_DUPLICATE",
)
insert_doc("Salary Bank Batch", "BANK-OTHER", 1, {"payroll_entry": "PAY-2026-08"})

print("HRM workforce finance migration regression: PASS")
