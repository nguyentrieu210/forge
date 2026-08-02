#!/usr/bin/env python3
"""SQLite regression for Finance Budget migrations 0052-0053."""

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
    """CREATE TABLE doctype_definitions(
      tenant_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      module TEXT NOT NULL,
      is_custom INTEGER NOT NULL,
      is_submittable INTEGER NOT NULL,
      is_child INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      disabled INTEGER NOT NULL,
      modified_by TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id, doctype)
    )"""
)
for migration in (
    "0052_finance_budget_commitment.sql",
    "0053_finance_budget_submission_closure.sql",
):
    db.executescript((root / "migrations/tenant" / migration).read_text(encoding="utf-8"))


def insert(doctype, name, payload, docstatus=1, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            tenant, f"{doctype}:{name}", doctype, name, "qa@example.test", docstatus,
            "Submitted" if docstatus == 1 else "Draft", 1,
            "2026-08-03T00:00:00Z", "2026-08-03T00:00:00Z", json.dumps(payload),
        ),
    )


def update_submit(doctype, name, payload, tenant="demo"):
    db.execute(
        "UPDATE documents SET docstatus=1,status='Submitted',payload_json=?,version=version+1 WHERE tenant_id=? AND doc_key=?",
        (json.dumps(payload), tenant, f"{doctype}:{name}"),
    )


def update_payload(doctype, name, payload, tenant="demo"):
    db.execute(
        "UPDATE documents SET payload_json=?,version=version+1 WHERE tenant_id=? AND doc_key=?",
        (json.dumps(payload), tenant, f"{doctype}:{name}"),
    )


def expect_rejected(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected rejection: {marker}")


for doctype in ("Finance Budget", "Finance Budget Revision", "Finance Budget Commitment"):
    row = db.execute("SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype=?", (doctype,)).fetchone()
    assert row, doctype
    meta = json.loads(row[0])
    assert meta["is_submittable"] is True
    assert meta["module"] == "Accounts"

budget = {
    "company": "Kairo", "account": "642-KAIRO", "budget_against": "Cost Center", "cost_center": "OPS",
    "scope_key": "Cost Center:OPS", "start_date": "2026-01-01", "end_date": "2026-12-31",
    "currency": "VND", "currency_scale": 0, "budget_amount_minor": 1_000_000, "budget_amount": "1000000",
    "control_action": "Stop",
}
insert("Finance Budget", "BUD-001", budget)
insert("Purchase Order", "PO-001", {"company": "Kairo"})
insert("Purchase Order", "PO-OTHER", {"company": "Other"})
db.commit()

expect_rejected("FINANCE_BUDGET_OVERLAP", lambda: insert(
    "Finance Budget", "BUD-OVERLAP", {**budget, "start_date": "2026-06-01", "budget_amount_minor": 500_000, "budget_amount": "500000"}
))

# Reserve 800k through the real draft -> submit path.
reserve = {
    "budget": "BUD-001", "posting_date": "2026-08-03", "commitment_type": "Reserve", "amount_minor": 800_000,
    "amount": "800000", "source_doctype": "Purchase Order", "source_name": "PO-001",
}
insert("Finance Budget Commitment", "COM-001", reserve, docstatus=0)
update_submit("Finance Budget Commitment", "COM-001", reserve)
db.commit()

# A revision cannot reduce effective budget below the 800k commitment.
revision_bad = {
    "budget": "BUD-001", "posting_date": "2026-08-03", "delta_amount_minor": -300_000, "delta_amount": "-300000",
    "reason": "Reduce",
}
insert("Finance Budget Revision", "REV-BAD", revision_bad, docstatus=0)
db.commit()
expect_rejected("FINANCE_BUDGET_REVISION_BELOW_COMMITMENTS", lambda: update_submit(
    "Finance Budget Revision", "REV-BAD", revision_bad
))

revision_good = {**revision_bad, "delta_amount_minor": 200_000, "delta_amount": "200000", "reason": "Increase"}
insert("Finance Budget Revision", "REV-OK", revision_good, docstatus=0)
update_submit("Finance Budget Revision", "REV-OK", revision_good)
db.commit()

# Effective budget 1.2m, so another 500k reserve would exceed the cap (1.3m total).
over = {**reserve, "amount_minor": 500_000, "amount": "500000"}
insert("Finance Budget Commitment", "COM-OVER", over, docstatus=0)
db.commit()
expect_rejected("FINANCE_BUDGET_COMMITMENT_EXCEEDED", lambda: update_submit(
    "Finance Budget Commitment", "COM-OVER", over
))

# Cannot release more than reserved for a source.
release_too_much = {**reserve, "commitment_type": "Release", "amount_minor": 900_000, "amount": "900000"}
insert("Finance Budget Commitment", "COM-REL-BAD", release_too_much, docstatus=0)
db.commit()
expect_rejected("FINANCE_BUDGET_RELEASE_EXCEEDS_SOURCE", lambda: update_submit(
    "Finance Budget Commitment", "COM-REL-BAD", release_too_much
))

# Cross-company source is rejected before it can consume budget.
cross_company = {**reserve, "source_name": "PO-OTHER", "amount_minor": 1, "amount": "1"}
insert("Finance Budget Commitment", "COM-CROSS", cross_company, docstatus=0)
db.commit()
expect_rejected("FINANCE_BUDGET_SOURCE_COMPANY_MISMATCH", lambda: update_submit(
    "Finance Budget Commitment", "COM-CROSS", cross_company
))

# Valid release leaves 500k committed against 1.2m budget.
release_ok = {**reserve, "commitment_type": "Release", "amount_minor": 300_000, "amount": "300000"}
insert("Finance Budget Commitment", "COM-REL-OK", release_ok, docstatus=0)
update_submit("Finance Budget Commitment", "COM-REL-OK", release_ok)
db.commit()

# Submitted artifacts are immutable except explicit docstatus 1 -> 2 cancel with unchanged payload.
expect_rejected("FINANCE_BUDGET_IMMUTABLE", lambda: update_payload("Finance Budget", "BUD-001", {**budget, "budget_amount_minor": 2_000_000}))
expect_rejected("FINANCE_BUDGET_REVISION_IMMUTABLE", lambda: update_payload("Finance Budget Revision", "REV-OK", {**revision_good, "reason": "changed"}))
expect_rejected("FINANCE_BUDGET_COMMITMENT_IMMUTABLE", lambda: update_payload("Finance Budget Commitment", "COM-001", {**reserve, "amount_minor": 700_000}))

assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("FINANCE_BUDGET_0052_0053_PASS")
