#!/usr/bin/env python3
"""Acceptance checks for HRM statutory payroll migrations 0043-0044."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("""CREATE TABLE master_records(
  tenant_id TEXT NOT NULL, record_type TEXT NOT NULL, name TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL, modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, record_type, name)
)""")
db.execute("""CREATE TABLE documents(
  tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL,
  owner TEXT NOT NULL, docstatus INTEGER NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
  created_at TEXT NOT NULL, modified_at TEXT NOT NULL, payload_json TEXT NOT NULL,
  PRIMARY KEY(tenant_id, doc_key), UNIQUE(tenant_id, doctype, name)
)""")
db.execute("""CREATE TABLE document_children(
  tenant_id TEXT NOT NULL, parent_key TEXT NOT NULL, fieldname TEXT NOT NULL,
  child_doctype TEXT NOT NULL, row_id TEXT NOT NULL, idx INTEGER NOT NULL, payload_json TEXT NOT NULL,
  PRIMARY KEY(tenant_id, parent_key, fieldname, row_id)
)""")

# Production already ran 0041 before this release. Preserve that immutable migration and
# prove a legacy audit-only rule can exist before the 1.6 upgrade.
db.executescript((root / "migrations/tenant/0041_hrm_payroll_rule_integrity.sql").read_text(encoding="utf-8"))


def master(name, data, tenant="demo", disabled=0):
    db.execute(
        "INSERT INTO master_records VALUES(?,?,?,?,?,?)",
        (tenant, "VN Payroll Rule", name, disabled, json.dumps(data), "2026-08-02T00:00:00Z"),
    )


def doc(doctype, name, status, data, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (tenant, f"{doctype}:{name}", doctype, name, "qa", status,
         "Submitted" if status == 1 else "Cancelled" if status == 2 else "Draft",
         1, "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z", json.dumps(data)),
    )


def child(parent, row_id, fieldname, child_doctype, data):
    db.execute(
        "INSERT INTO document_children VALUES(?,?,?,?,?,?,?)",
        ("demo", parent, fieldname, child_doctype, row_id, 1, json.dumps(data)),
    )


def reject(fn, marker):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
    else:
        raise AssertionError(f"expected {marker}")


legacy = {
    "rule_code": "LEGACY",
    "effective_from": "2025-01-01",
    "legal_document_no": "LEGACY-LAW",
    "source_url": "https://example.test/legacy",
    "formula_json": "{}",
    "approved_by": "payroll@example.test",
    "approved_at": "2025-01-01T00:00:00Z",
}
master("LEGACY", legacy)

# New release upgrades trigger behavior without rewriting existing records.
db.executescript((root / "migrations/tenant/0043_hrm_payroll_rule_storage_integrity.sql").read_text(encoding="utf-8"))
db.executescript((root / "migrations/tenant/0044_hrm_statutory_input_integrity.sql").read_text(encoding="utf-8"))
assert db.execute("SELECT json_extract(data_json,'$.formula_json') FROM master_records WHERE name='LEGACY'").fetchone()[0] == "{}"

valid = {
    "rule_code": "RULE-1",
    "effective_from": "2026-01-01",
    "legal_document_no": "LAW-1",
    "source_url": "https://example.test/law-1",
    "formula_json": json.dumps({
        "schema_version": 1,
        "currency": "VND",
        "outputs": {"pit": {"const_minor": "1000"}},
    }),
    "approved_by": "payroll@example.test",
    "approved_at": "2026-01-01T00:00:00Z",
}
master("RULE-1", valid)
reject(lambda: master("BAD-SCHEMA", {**valid, "rule_code": "BAD-SCHEMA", "formula_json": json.dumps({"schema_version": 2, "currency": "VND", "outputs": {"x": {"const_minor": "1"}}})}), "HR_PAYROLL_RULE_INVALID")
reject(lambda: master("BAD-OUTPUT", {**valid, "rule_code": "BAD-OUTPUT", "formula_json": json.dumps({"schema_version": 1, "currency": "VND", "outputs": {}})}), "HR_PAYROLL_RULE_INVALID")

# Used master-backed rule is append-only.
doc("Salary Structure", "SS-1", 1, {"payroll_rule": "RULE-1"})
reject(lambda: db.execute("UPDATE master_records SET disabled=1 WHERE tenant_id='demo' AND record_type='VN Payroll Rule' AND name='RULE-1'"), "HR_PAYROLL_RULE_IMMUTABLE")
reject(lambda: db.execute("DELETE FROM master_records WHERE tenant_id='demo' AND record_type='VN Payroll Rule' AND name='RULE-1'"), "HR_PAYROLL_RULE_IMMUTABLE")

# User-created master DocTypes may be document-backed; protect that storage path too.
doc_rule = {**valid, "rule_code": "DOC-RULE", "legal_document_no": "LAW-DOC"}
doc("VN Payroll Rule", "DOC-RULE", 0, doc_rule)
doc("Salary Structure", "SS-DOC", 1, {"payroll_rule": "DOC-RULE"})
reject(lambda: db.execute("UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='VN Payroll Rule' AND name='DOC-RULE'", (json.dumps({**doc_rule, "legal_document_no": "MUTATED"}),)), "HR_PAYROLL_RULE_IMMUTABLE")
reject(lambda: db.execute("DELETE FROM documents WHERE tenant_id='demo' AND doctype='VN Payroll Rule' AND name='DOC-RULE'"), "HR_PAYROLL_RULE_IMMUTABLE")
reject(lambda: master("DOC-RULE", {**valid, "rule_code": "DOC-RULE"}), "HR_PAYROLL_RULE_DUPLICATE_STORAGE")
reject(lambda: doc("VN Payroll Rule", "RULE-1", 0, {**valid, "rule_code": "RULE-1"}), "HR_PAYROLL_RULE_INVALID")

# Statutory inputs are scalar, unique and frozen once a submitted slip consumes the assignment.
doc("Salary Structure Assignment", "SSA-1", 1, {"employee": "EMP-1", "company": "Demo", "from_date": "2026-08-01", "to_date": "2026-08-31"})
child("Salary Structure Assignment:SSA-1", "I1", "statutory_inputs", "Payroll Rule Input Value", {"input_key": "dependents", "value": "2"})
reject(lambda: child("Salary Structure Assignment:SSA-1", "I2", "statutory_inputs", "Payroll Rule Input Value", {"input_key": "dependents", "value": "3"}), "HR_STATUTORY_INPUT_INVALID")
reject(lambda: child("Salary Structure Assignment:SSA-1", "I3", "statutory_inputs", "Payroll Rule Input Value", {"input_key": "nested", "value": {"bad": 1}}), "HR_STATUTORY_INPUT_INVALID")
doc("Salary Slip", "SAL-1", 1, {"employee": "EMP-1", "company": "Demo", "start_date": "2026-08-01", "end_date": "2026-08-31"})
reject(lambda: db.execute("UPDATE document_children SET payload_json=? WHERE tenant_id='demo' AND parent_key='Salary Structure Assignment:SSA-1' AND row_id='I1'", (json.dumps({"input_key": "dependents", "value": "4"}),)), "HR_PAYROLL_SOURCE_LOCKED")
reject(lambda: db.execute("DELETE FROM document_children WHERE tenant_id='demo' AND parent_key='Salary Structure Assignment:SSA-1' AND row_id='I1'"), "HR_PAYROLL_SOURCE_LOCKED")

# A row cannot be moved from an unlocked assignment into a consumed assignment.
doc("Salary Structure Assignment", "SSA-2", 1, {"employee": "EMP-2", "company": "Demo", "from_date": "2026-08-01", "to_date": "2026-08-31"})
child("Salary Structure Assignment:SSA-2", "MOVE", "statutory_inputs", "Payroll Rule Input Value", {"input_key": "insured", "value": "1"})
reject(lambda: db.execute("UPDATE document_children SET parent_key='Salary Structure Assignment:SSA-1' WHERE tenant_id='demo' AND parent_key='Salary Structure Assignment:SSA-2' AND row_id='MOVE'"), "HR_PAYROLL_SOURCE_LOCKED")

# One legal monetary output cannot be mapped twice and double-counted.
child("Salary Structure:SS-COMP", "C1", "components", "Salary Structure Component", {"salary_component": "PIT", "amount_type": "Payroll Rule Output", "rule_output_key": "pit"})
reject(lambda: child("Salary Structure:SS-COMP", "C2", "components", "Salary Structure Component", {"salary_component": "Other PIT", "amount_type": "Payroll Rule Output", "rule_output_key": "pit"}), "HR_PAYROLL_RULE_OUTPUT_DUPLICATE")

print("HRM_STATUTORY_PAYROLL_MIGRATIONS_0043_0044_PASS")
