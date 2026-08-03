#!/usr/bin/env python3
"""Focused SQLite regression for HRM statutory payroll migration 0099."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
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
db.execute(
    """CREATE TABLE document_children(
      tenant_id TEXT NOT NULL,
      parent_key TEXT NOT NULL,
      fieldname TEXT NOT NULL,
      child_doctype TEXT NOT NULL,
      row_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY(tenant_id, parent_key, fieldname, row_id),
      FOREIGN KEY(tenant_id, parent_key) REFERENCES documents(tenant_id, doc_key) ON DELETE CASCADE
    )"""
)

db.executescript((root / "migrations/tenant/0041_hrm_payroll_rule_integrity.sql").read_text(encoding="utf-8"))
db.executescript((root / "migrations/tenant/0099_hrm_statutory_payroll_integrity.sql").read_text(encoding="utf-8"))

NOW = "2026-08-03T00:00:00Z"


def insert_document(doctype, name, docstatus, payload, tenant="demo"):
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
            NOW,
            NOW,
            json.dumps(payload),
        ),
    )


def insert_child(parent_key, fieldname, child_doctype, row_id, idx, payload, tenant="demo"):
    db.execute(
        "INSERT INTO document_children VALUES(?,?,?,?,?,?,?)",
        (tenant, parent_key, fieldname, child_doctype, row_id, idx, json.dumps(payload)),
    )


def valid_formula():
    return json.dumps(
        {
            "schema_version": 1,
            "currency": "VND",
            "inputs": {"dependents": {"type": "integer", "required": True, "min": 0}},
            "outputs": {"pit": {"const_minor": "1000"}},
        }
    )


def valid_rule(code):
    return {
        "rule_code": code,
        "rule_name": code,
        "effective_from": "2026-01-01",
        "legal_document_no": "LEGAL-TEST",
        "source_url": "https://example.test/legal",
        "formula_json": valid_formula(),
        "approved_by": "payroll@example.test",
        "approved_at": NOW,
        "disabled": 0,
    }


def expect_rejected(fn, marker):
    savepoint = f"sp_{abs(hash(marker))}"
    db.execute(f"SAVEPOINT {savepoint}")
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.execute(f"ROLLBACK TO {savepoint}")
        db.execute(f"RELEASE {savepoint}")
    else:
        db.execute(f"ROLLBACK TO {savepoint}")
        db.execute(f"RELEASE {savepoint}")
        raise AssertionError(f"expected database rejection: {marker}")


invalid_rule = valid_rule("RULE-BAD-SCHEMA")
invalid_rule["formula_json"] = json.dumps(
    {"schema_version": 2, "currency": "VND", "outputs": {"pit": {"const_minor": "1"}}}
)
expect_rejected(
    lambda: db.execute(
        "INSERT INTO master_records VALUES(?,?,?,?,?,?)",
        ("demo", "VN Payroll Rule", "RULE-BAD-SCHEMA", 0, json.dumps(invalid_rule), NOW),
    ),
    "HR_PAYROLL_RULE_INVALID",
)

insert_document("VN Payroll Rule", "RULE-DOC", 0, valid_rule("RULE-DOC"))
expect_rejected(
    lambda: db.execute(
        "INSERT INTO master_records VALUES(?,?,?,?,?,?)",
        ("demo", "VN Payroll Rule", "RULE-DOC", 0, json.dumps(valid_rule("RULE-DOC")), NOW),
    ),
    "HR_PAYROLL_RULE_DUPLICATE_STORAGE",
)

db.execute(
    "INSERT INTO master_records VALUES(?,?,?,?,?,?)",
    ("demo", "VN Payroll Rule", "RULE-MASTER", 0, json.dumps(valid_rule("RULE-MASTER")), NOW),
)
expect_rejected(
    lambda: insert_document("VN Payroll Rule", "RULE-MASTER", 0, valid_rule("RULE-MASTER")),
    "HR_PAYROLL_RULE_INVALID",
)

assignment_payload = {
    "employee": "EMP-1",
    "company": "Demo",
    "salary_structure": "SS-1",
    "from_date": "2026-01-01",
    "payroll_rule": "RULE-MASTER",
}
insert_document("Salary Structure Assignment", "ASSIGN-A", 1, assignment_payload)
insert_child(
    "Salary Structure Assignment:ASSIGN-A",
    "statutory_inputs",
    "Payroll Rule Input Value",
    "INPUT-A-1",
    1,
    {"input_key": "dependents", "value": 2},
)
expect_rejected(
    lambda: insert_child(
        "Salary Structure Assignment:ASSIGN-A",
        "statutory_inputs",
        "Payroll Rule Input Value",
        "INPUT-A-2",
        2,
        {"input_key": "dependents", "value": 3},
    ),
    "HR_STATUTORY_INPUT_INVALID",
)
expect_rejected(
    lambda: insert_child(
        "Salary Structure Assignment:ASSIGN-A",
        "statutory_inputs",
        "Payroll Rule Input Value",
        "INPUT-A-MISSING",
        3,
        {"input_key": "insured"},
    ),
    "HR_STATUTORY_INPUT_INVALID",
)
expect_rejected(
    lambda: insert_child(
        "Salary Structure Assignment:ASSIGN-A",
        "statutory_inputs",
        "Payroll Rule Input Value",
        "INPUT-A-BADKEY",
        4,
        {"input_key": "1 invalid key", "value": 1},
    ),
    "HR_STATUTORY_INPUT_INVALID",
)

insert_document("Salary Structure Assignment", "ASSIGN-B", 1, assignment_payload)
insert_child(
    "Salary Structure Assignment:ASSIGN-B",
    "statutory_inputs",
    "Payroll Rule Input Value",
    "INPUT-B-1",
    1,
    {"input_key": "dependents", "value": 1},
)
insert_document(
    "Salary Slip",
    "SLIP-1",
    1,
    {
        "employee": "EMP-1",
        "company": "Demo",
        "start_date": "2026-07-01",
        "end_date": "2026-07-31",
        "salary_structure_assignment": "ASSIGN-A",
        "rule_trace_json": json.dumps({"payroll_rule": {"name": "RULE-MASTER"}}),
    },
)

expect_rejected(
    lambda: db.execute(
        "UPDATE document_children SET payload_json=? WHERE tenant_id='demo' AND parent_key=? AND row_id=?",
        (json.dumps({"input_key": "dependents", "value": 4}), "Salary Structure Assignment:ASSIGN-A", "INPUT-A-1"),
    ),
    "HR_PAYROLL_SOURCE_LOCKED",
)

db.execute(
    "UPDATE document_children SET payload_json=? WHERE tenant_id='demo' AND parent_key=? AND row_id=?",
    (json.dumps({"input_key": "dependents", "value": 5}), "Salary Structure Assignment:ASSIGN-B", "INPUT-B-1"),
)
assert json.loads(
    db.execute(
        "SELECT payload_json FROM document_children WHERE tenant_id='demo' AND parent_key=? AND row_id=?",
        ("Salary Structure Assignment:ASSIGN-B", "INPUT-B-1"),
    ).fetchone()[0]
)["value"] == 5

insert_document("Salary Structure", "SS-DUP", 0, {"company": "Demo", "payroll_rule": "RULE-MASTER"})
expect_rejected(
    lambda: insert_child(
        "Salary Structure:SS-DUP",
        "components",
        "Salary Structure Component",
        "COMP-BAD",
        1,
        {"salary_component": "PIT Invalid", "amount_type": "Payroll Rule Output"},
    ),
    "HR_PAYROLL_RULE_OUTPUT_INVALID",
)
insert_child(
    "Salary Structure:SS-DUP",
    "components",
    "Salary Structure Component",
    "COMP-1",
    1,
    {"salary_component": "PIT", "amount_type": "Payroll Rule Output", "rule_output_key": "pit"},
)
expect_rejected(
    lambda: insert_child(
        "Salary Structure:SS-DUP",
        "components",
        "Salary Structure Component",
        "COMP-2",
        2,
        {"salary_component": "PIT Copy", "amount_type": "Payroll Rule Output", "rule_output_key": "pit"},
    ),
    "HR_PAYROLL_RULE_OUTPUT_DUPLICATE",
)

print("HRM statutory payroll migration regression: PASS")
