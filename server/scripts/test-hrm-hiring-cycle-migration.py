#!/usr/bin/env python3
"""Final-state SQLite regression for HRM hiring-cycle integrity through 0046."""

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

def insert_doc(name, offer, employee, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?)",
        (tenant, f"Hiring Completion:{name}", "Hiring Completion", name, 1,
         json.dumps({"job_offer": offer, "employee": employee})),
    )


def expect_rejected(fn):
    db.execute("SAVEPOINT rejected")
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert "HR_HIRING_COMPLETION_DUPLICATE" in str(error), str(error)
        db.execute("ROLLBACK TO rejected")
        db.execute("RELEASE rejected")
    else:
        db.execute("ROLLBACK TO rejected")
        db.execute("RELEASE rejected")
        raise AssertionError("expected HR_HIRING_COMPLETION_DUPLICATE")

# 0044 introduces the original guards; 0046 replaces only those two with the final invariant.
db.executescript((root / "migrations/tenant/0044_hrm_wave1_closure.sql").read_text(encoding="utf-8"))
db.executescript((root / "migrations/tenant/0046_hrm_hiring_cycle_integrity.sql").read_text(encoding="utf-8"))

insert_doc("HIRE-1", "OFFER-1", "EMP-1")
expect_rejected(lambda: insert_doc("HIRE-2", "OFFER-1", "EMP-2"))
expect_rejected(lambda: insert_doc("HIRE-3", "OFFER-2", "EMP-1"))

# Rehire is represented by a NEW Employee record under a new Job Offer.
insert_doc("HIRE-4", "OFFER-2", "EMP-2")
assert db.execute("SELECT COUNT(*) FROM documents WHERE tenant_id='demo' AND doctype='Hiring Completion'").fetchone()[0] == 2

# Tenant isolation remains intact.
insert_doc("HIRE-OTHER", "OFFER-1", "EMP-1", tenant="other")

print("HRM hiring-cycle migration regression: PASS")
