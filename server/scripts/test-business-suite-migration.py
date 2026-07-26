#!/usr/bin/env python3
"""Rehearse migration 0009 over a populated v0.9 tenant schema."""
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for number, name in [
    (1, "core"), (2, "o2c_projections"), (3, "commercial_accounting"),
    (4, "frappe_platform"), (5, "erp_core"), (6, "frappe_core_beta"),
    (7, "erpnext_core"), (8, "erpnext_breadth"),
]:
    db.executescript((root / f"migrations/tenant/{number:04d}_{name}.sql").read_text())

# Preserve representative existing documents and metadata while introducing v1.0 breadth.
db.execute(
    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Sales Invoice:SI-MIG", "Sales Invoice", "SI-MIG", "Administrator", 1, "Unpaid", 2,
     "2026-07-01", "2026-07-01", '{"company":"Demo","grand_total_minor":10000}'),
)
before_docs = db.execute("SELECT COUNT(*) FROM documents WHERE tenant_id='demo'").fetchone()[0]
before_meta = db.execute("SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='demo'").fetchone()[0]

db.executescript((root / "migrations/tenant/0009_business_suite.sql").read_text())

assert db.execute("SELECT COUNT(*) FROM documents WHERE tenant_id='demo'").fetchone()[0] == before_docs
assert db.execute("SELECT status FROM documents WHERE tenant_id='demo' AND name='SI-MIG'").fetchone()[0] == "Unpaid"
assert db.execute("SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='demo'").fetchone()[0] > before_meta
for object_type, name in [
    ("table", "bank_reconciliation_entries"),
    ("view", "bank_reconciliation_summary"),
    ("view", "payroll_register"),
    ("view", "subscription_schedule"),
    ("view", "e_invoice_submission_log"),
]:
    assert db.execute("SELECT 1 FROM sqlite_master WHERE type=? AND name=?", (object_type, name)).fetchone(), name
for doctype in ["Bank Reconciliation", "Salary Slip", "Payroll Entry", "Subscription", "E-Invoice Submission"]:
    assert db.execute("SELECT 1 FROM doctype_definitions WHERE tenant_id='demo' AND doctype=?", (doctype,)).fetchone(), doctype

print("BUSINESS_SUITE_MIGRATION_0009_DRY_RUN_PASS")
