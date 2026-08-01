#!/usr/bin/env python3
"""Acceptance checks for G03 organization-scope projection migration 0036."""

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
db.execute(
    """CREATE TABLE users(
      tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,session_epoch INTEGER NOT NULL,
      modified_at TEXT NOT NULL,PRIMARY KEY(tenant_id,user_id)
    )"""
)
db.execute(
    """CREATE TABLE user_roles(
      tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,
      PRIMARY KEY(tenant_id,user_id,role)
    )"""
)
db.executescript((root / "migrations/tenant/0036_organization_security_scope.sql").read_text(encoding="utf-8"))


def insert(name, docstatus, state, *, company="ACME", branch="HCM", department="SALES"):
    payload = {
        "user": "sales@example.test",
        "company": company,
        "branch": branch,
        "department": department,
        "effective_from": "2026-01-01",
        "effective_to": "2026-12-31",
        "workflow_state": state,
    }
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", f"Organization Assignment:{name}", "Organization Assignment", name, "admin@example.test",
         docstatus, state, 1, "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", json.dumps(payload)),
    )


insert("ORG-ASG-1", 0, "Draft")
assert db.execute("SELECT COUNT(*) FROM erp_organization_scope_grants").fetchone()[0] == 0

db.execute(
    """UPDATE documents SET docstatus=1,status='Published',version=2,
       payload_json=json_set(payload_json,'$.workflow_state','Published')
       WHERE tenant_id='demo' AND name='ORG-ASG-1'"""
)
grants = db.execute(
    "SELECT allow_doctype,allow_name FROM erp_organization_scope_grants ORDER BY allow_doctype"
).fetchall()
assert grants == [("Branch", "HCM"), ("Company", "ACME"), ("Department", "SALES")]

db.execute(
    """UPDATE documents SET docstatus=2,status='Retired',version=3,
       payload_json=json_set(payload_json,'$.workflow_state','Retired')
       WHERE tenant_id='demo' AND name='ORG-ASG-1'"""
)
assert db.execute("SELECT COUNT(*) FROM erp_organization_scope_grants").fetchone()[0] == 0

insert("ORG-ASG-2", 1, "Published", branch="", department="")
assert db.execute(
    "SELECT allow_doctype,allow_name FROM erp_organization_scope_grants WHERE assignment_name='ORG-ASG-2'"
).fetchall() == [("Company", "ACME")]

db.execute("DELETE FROM documents WHERE tenant_id='demo' AND name='ORG-ASG-2'")
assert db.execute("SELECT COUNT(*) FROM erp_organization_scope_grants").fetchone()[0] == 0

# Publishing and retiring a role policy revoke every open session for holders of
# that role, so stale Desk permissions cannot survive an effective-policy change.
db.execute("INSERT INTO users VALUES('demo','accountant@example.test',1,'2026-08-01T00:00:00Z')")
db.execute("INSERT INTO user_roles VALUES('demo','accountant@example.test','Accountant')")
policy = json.dumps({
    "role": "Accountant", "resource": "Journal Entry", "workflow_state": "Published",
    "actions_json": ["read"], "row_rule_json": {}, "field_rule_json": {}, "version_no": 1,
})
db.execute(
    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Role Policy:ROLE-POL-1", "Role Policy", "ROLE-POL-1", "owner@example.test",
     1, "Published", 1, "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", policy),
)
assert db.execute(
    "SELECT session_epoch FROM users WHERE tenant_id='demo' AND user_id='accountant@example.test'"
).fetchone()[0] == 2
db.execute(
    """UPDATE documents SET docstatus=2,status='Retired',version=2,
       payload_json=json_set(payload_json,'$.workflow_state','Retired')
       WHERE tenant_id='demo' AND name='ROLE-POL-1'"""
)
assert db.execute(
    "SELECT session_epoch FROM users WHERE tenant_id='demo' AND user_id='accountant@example.test'"
).fetchone()[0] == 3

print("ORGANIZATION_SECURITY_SCOPE_MIGRATION_0036_PASS")
