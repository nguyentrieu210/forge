#!/usr/bin/env python3
"""Focused SQLite regression for HRM recruitment depth migration 0102."""
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
db.executescript((root / "migrations/tenant/0102_hrm_recruitment_depth_integrity.sql").read_text(encoding="utf-8"))
NOW="2026-08-03T00:00:00Z"

def insert_doc(doctype,name,docstatus,payload,tenant="demo"):
    db.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",(tenant,f"{doctype}:{name}",doctype,name,"qa",docstatus,"Submitted" if docstatus==1 else "Draft",1,NOW,NOW,json.dumps(payload)))

def rejected(fn,marker):
    db.execute("SAVEPOINT fail")
    try: fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error),(marker,str(error)); db.execute("ROLLBACK TO fail"); db.execute("RELEASE fail"); return
    db.execute("ROLLBACK TO fail"); db.execute("RELEASE fail"); raise AssertionError(marker)

insert_doc("Candidate Profile","CAND-1",0,{"email":"Person@Example.com"})
rejected(lambda: insert_doc("Candidate Profile","CAND-2",0,{"email":" person@example.com "}),"HR_CANDIDATE_PROFILE_EMAIL_DUPLICATE")
insert_doc("Candidate Profile","CAND-OTHER",0,{"email":"person@example.com"},tenant="other")

insert_doc("Interview","INT-1",1,{"job_applicant":"APP-1"})
insert_doc("Interview Scorecard","SC-1",1,{"interview":"INT-1"})
rejected(lambda: insert_doc("Interview Scorecard","SC-2",1,{"interview":"INT-1"}),"HR_INTERVIEW_SCORECARD_DUPLICATE")
rejected(lambda: db.execute("UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doc_key='Interview:INT-1'"),"HR_INTERVIEW_ALREADY_SCORED")

insert_doc("Job Offer","OFF-1",1,{"job_applicant":"APP-1"})
insert_doc("Job Offer Response","RESP-1",1,{"job_offer":"OFF-1","response":"Accepted"})
rejected(lambda: insert_doc("Job Offer Response","RESP-2",1,{"job_offer":"OFF-1","response":"Rejected"}),"HR_JOB_OFFER_RESPONSE_DUPLICATE")
rejected(lambda: db.execute("DELETE FROM documents WHERE tenant_id='demo' AND doc_key='Job Offer:OFF-1'"),"HR_JOB_OFFER_ALREADY_RESPONDED")

insert_doc("Hiring Completion","HIRE-1",1,{"job_offer":"OFF-1","employee":"EMP-1"})
insert_doc("Job Offer","OFF-2",1,{"job_applicant":"APP-2"})
rejected(lambda: insert_doc("Hiring Completion","HIRE-2",1,{"job_offer":"OFF-2","employee":"EMP-2"}),"HR_HIRING_REQUIRES_ACCEPTED_OFFER")
print("HRM recruitment depth migration regression: PASS")
