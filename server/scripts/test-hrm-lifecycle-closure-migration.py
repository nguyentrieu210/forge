#!/usr/bin/env python3
"""Focused SQLite regression for HRM lifecycle closure migration 0045."""
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("""CREATE TABLE documents(
 tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL,
 owner TEXT NOT NULL, docstatus INTEGER NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
 created_at TEXT NOT NULL, modified_at TEXT NOT NULL, payload_json TEXT NOT NULL,
 PRIMARY KEY(tenant_id,doc_key), UNIQUE(tenant_id,doctype,name))""")
db.executescript((root / "migrations/tenant/0045_hrm_lifecycle_closure_integrity.sql").read_text(encoding="utf-8"))
NOW="2026-08-03T00:00:00Z"

def insert_doc(doctype,name,docstatus,payload,tenant="demo"):
    db.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",(tenant,f"{doctype}:{name}",doctype,name,"qa",docstatus,"Submitted" if docstatus==1 else "Draft",1,NOW,NOW,json.dumps(payload)))

def rejected(fn,marker):
    db.execute("SAVEPOINT fail")
    try: fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error),(marker,str(error)); db.execute("ROLLBACK TO fail"); db.execute("RELEASE fail"); return
    db.execute("ROLLBACK TO fail"); db.execute("RELEASE fail"); raise AssertionError(marker)

insert_doc("Job Offer","OFF-1",1,{"job_applicant":"APP-1"})
insert_doc("Employment Contract","CON-1",1,{"employee":"EMP-1"})
insert_doc("Employee Onboarding","ONB-1",1,{"employee":"EMP-1"})
insert_doc("Hiring Completion","HIRE-1",1,{"job_offer":"OFF-1","employee":"EMP-1","employment_contract":"CON-1","employee_onboarding":"ONB-1"})
rejected(lambda: insert_doc("Hiring Completion","HIRE-2",1,{"job_offer":"OFF-1","employee":"EMP-2"}),"HR_HIRING_COMPLETION_DUPLICATE_OFFER")
rejected(lambda: insert_doc("Hiring Completion","HIRE-3",1,{"job_offer":"OFF-2","employee":"EMP-1"}),"HR_HIRING_COMPLETION_DUPLICATE_EMPLOYEE")
rejected(lambda: db.execute("UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doc_key='Job Offer:OFF-1'"),"HR_HIRING_SOURCE_LOCKED")

insert_doc("Employee Separation","SEP-1",1,{"employee":"EMP-1"})
insert_doc("Salary Slip","SLIP-FINAL",1,{"employee":"EMP-1"})
insert_doc("Employee Final Settlement","FSET-1",1,{"separation":"SEP-1","final_salary_slip":"SLIP-FINAL"})
rejected(lambda: insert_doc("Employee Final Settlement","FSET-2",1,{"separation":"SEP-1","final_salary_slip":"SLIP-OTHER"}),"HR_FINAL_SETTLEMENT_DUPLICATE")
rejected(lambda: db.execute("DELETE FROM documents WHERE tenant_id='demo' AND doc_key='Salary Slip:SLIP-FINAL'"),"HR_FINAL_SETTLEMENT_SOURCE_LOCKED")
print("HRM lifecycle closure migration regression: PASS")
