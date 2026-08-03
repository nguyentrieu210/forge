#!/usr/bin/env python3
"""Focused SQLite regression for HRM loan-disbursement migration 0104."""
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
db.executescript((root / "migrations/tenant/0104_hrm_loan_disbursement_integrity.sql").read_text(encoding="utf-8"))
NOW="2026-08-03T00:00:00Z"

def insert_doc(doctype,name,docstatus,payload,tenant="demo"):
    db.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",(tenant,f"{doctype}:{name}",doctype,name,"qa",docstatus,"Submitted" if docstatus==1 else "Draft",1,NOW,NOW,json.dumps(payload)))

def rejected(fn,marker):
    db.execute("SAVEPOINT fail")
    try: fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error),(marker,str(error)); db.execute("ROLLBACK TO fail"); db.execute("RELEASE fail"); return
    db.execute("ROLLBACK TO fail"); db.execute("RELEASE fail"); raise AssertionError(marker)

insert_doc("Employee Loan","LOAN-1",0,{"employee":"EMP-1","company":"Demo","principal_amount":"10000000","currency":"VND"})
insert_doc("Employee Loan Disbursement","DISB-1",1,{"employee_loan":"LOAN-1","payment_entry":"PAY-1","amount":"10000000"})
rejected(lambda: insert_doc("Employee Loan Disbursement","DISB-2",1,{"employee_loan":"LOAN-1","payment_entry":"PAY-2","amount":"10000000"}),"HR_EMPLOYEE_LOAN_DISBURSEMENT_DUPLICATE")
db.execute("UPDATE documents SET docstatus=1,status='Submitted' WHERE tenant_id='demo' AND doc_key='Employee Loan:LOAN-1'")
rejected(lambda: db.execute("UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doc_key='Employee Loan Disbursement:DISB-1'"),"HR_EMPLOYEE_LOAN_DISBURSEMENT_LOCKED")

insert_doc("Employee Loan","LOAN-2",0,{"employee":"EMP-2","company":"Demo","principal_amount":"5000000","currency":"VND"})
rejected(lambda: db.execute("UPDATE documents SET docstatus=1,status='Submitted' WHERE tenant_id='demo' AND doc_key='Employee Loan:LOAN-2'"),"HR_EMPLOYEE_LOAN_NOT_DISBURSED")

insert_doc("Employee Loan","LOAN-OTHER",0,{"employee":"EMP-X","company":"Other","principal_amount":"5000000","currency":"VND"},tenant="other")
insert_doc("Employee Loan Disbursement","DISB-OTHER",1,{"employee_loan":"LOAN-OTHER","payment_entry":"PAY-X","amount":"5000000"},tenant="other")
db.execute("UPDATE documents SET docstatus=1,status='Submitted' WHERE tenant_id='other' AND doc_key='Employee Loan:LOAN-OTHER'")
print("HRM loan disbursement migration regression: PASS")
