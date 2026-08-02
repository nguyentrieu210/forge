#!/usr/bin/env python3
"""Focused SQLite regression for HRM organization-position migration 0047."""
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
db.executescript((root / "migrations/tenant/0047_hrm_organization_position_integrity.sql").read_text(encoding="utf-8"))
NOW="2026-08-03T00:00:00Z"

def insert_doc(doctype,name,docstatus,payload,tenant="demo"):
    db.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",(tenant,f"{doctype}:{name}",doctype,name,"qa",docstatus,"Submitted" if docstatus==1 else "Draft",1,NOW,NOW,json.dumps(payload)))

def rejected(fn,marker):
    db.execute("SAVEPOINT fail")
    try: fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error),(marker,str(error)); db.execute("ROLLBACK TO fail"); db.execute("RELEASE fail"); return
    db.execute("ROLLBACK TO fail"); db.execute("RELEASE fail"); raise AssertionError(marker)

insert_doc("Organization Position","ENG",0,{"company":"Demo","branch":"BR-A","department":"OPS","designation":"Engineer","planned_seats":1,"active":1})
insert_doc("Employee Position Assignment","PA-1",1,{"employee":"EMP-1","position":"ENG","from_date":"2026-01-01","to_date":"2026-12-31"})
rejected(lambda: insert_doc("Employee Position Assignment","PA-2",1,{"employee":"EMP-1","position":"ENG","from_date":"2026-06-01","to_date":"2026-06-30"}),"HR_POSITION_ASSIGNMENT_OVERLAP")
rejected(lambda: insert_doc("Employee Position Assignment","PA-3",1,{"employee":"EMP-2","position":"ENG","from_date":"2026-06-01","to_date":"2026-06-30"}),"HR_POSITION_CAPACITY_EXCEEDED")
rejected(lambda: db.execute("UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doc_key='Organization Position:ENG'",(json.dumps({"company":"Demo","branch":"BR-B","department":"OPS","designation":"Engineer","planned_seats":1}),)),"HR_POSITION_SCOPE_LOCKED")
rejected(lambda: db.execute("DELETE FROM documents WHERE tenant_id='demo' AND doc_key='Organization Position:ENG'"),"HR_POSITION_IN_USE")

insert_doc("Organization Position","ENG2",0,{"company":"Demo","branch":"BR-A","department":"OPS","designation":"Engineer","planned_seats":2,"active":1})
insert_doc("Employee Position Assignment","PA-A",1,{"employee":"EMP-A","position":"ENG2","from_date":"2026-01-01","to_date":"2026-03-31"})
insert_doc("Employee Position Assignment","PA-B",1,{"employee":"EMP-B","position":"ENG2","from_date":"2026-04-01","to_date":"2026-12-31"})
print("HRM organization position migration regression: PASS")
