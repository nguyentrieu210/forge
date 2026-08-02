#!/usr/bin/env python3
"""SQLite regression for owner-scoped Employee Salary Slip permission migration 0047."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute(
    """CREATE TABLE doctype_definitions(
      tenant_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      revision INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,doctype)
    )"""
)
base = {
    "name": "Salary Slip",
    "module": "Payroll",
    "revision": 2,
    "permissions": [
        {"role": "Payroll User", "read": True},
        {"role": "Payroll Manager", "read": True, "write": True},
    ],
}
for tenant in ("__standard__", "demo"):
    db.execute(
        "INSERT INTO doctype_definitions VALUES(?,?,?,?,?)",
        (tenant, "Salary Slip", 2, json.dumps(base), "2026-08-01T00:00:00Z"),
    )

migration = (root / "migrations/tenant/0047_hrm_payslip_self_service_permission.sql").read_text(encoding="utf-8")
db.executescript(migration)

for tenant in ("__standard__", "demo"):
    revision, raw = db.execute(
        "SELECT revision,metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype='Salary Slip'",
        (tenant,),
    ).fetchone()
    meta = json.loads(raw)
    assert revision == 3
    assert meta["revision"] == 3
    employee = [p for p in meta["permissions"] if p.get("role") == "Employee"]
    assert employee == [{"role": "Employee", "read": True, "if_owner": True}], employee
    assert not any(p.get("role") == "Employee" and (p.get("write") or p.get("report") or p.get("export")) for p in meta["permissions"])

# Migration is idempotent: no duplicate permission and no second revision bump.
db.executescript(migration)
for tenant in ("__standard__", "demo"):
    revision, raw = db.execute(
        "SELECT revision,metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype='Salary Slip'",
        (tenant,),
    ).fetchone()
    meta = json.loads(raw)
    assert revision == 3
    assert len([p for p in meta["permissions"] if p.get("role") == "Employee"]) == 1

print("HRM payslip self-service permission migration: PASS")
