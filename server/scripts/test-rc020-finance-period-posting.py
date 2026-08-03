#!/usr/bin/env python3
"""RC-020 regression: posting periods, scoped GL, reversal, audit and reconciliation."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = sqlite3.connect(":memory:")
DB.row_factory = sqlite3.Row

DB.executescript(
    """
    CREATE TABLE documents(
      tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL,
      owner TEXT NOT NULL, docstatus INTEGER NOT NULL CHECK(docstatus IN (0,1,2)), status TEXT NOT NULL,
      version INTEGER NOT NULL, created_at TEXT NOT NULL, modified_at TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), modified_by TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(tenant_id,doc_key), UNIQUE(tenant_id,doctype,name)
    );
    CREATE TABLE user_roles(
      tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY(tenant_id,user_id,role)
    );
    CREATE TABLE versions(
      tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, version INTEGER NOT NULL,
      command_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
      snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), created_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,doc_key,version)
    );
    CREATE TABLE mutation_receipts(
      tenant_id TEXT NOT NULL, command_id TEXT NOT NULL, actor_user_id TEXT NOT NULL,
      doctype TEXT NOT NULL, name TEXT NOT NULL, aggregate_version INTEGER NOT NULL,
      payload_hash TEXT NOT NULL, committed_at TEXT NOT NULL,
      result_json TEXT NOT NULL CHECK(json_valid(result_json)), PRIMARY KEY(tenant_id,command_id)
    );
    CREATE TABLE gl_entries(
      tenant_id TEXT NOT NULL, voucher_type TEXT NOT NULL, voucher_no TEXT NOT NULL,
      voucher_revision INTEGER NOT NULL, line_key TEXT NOT NULL, account TEXT NOT NULL,
      party_type TEXT, party TEXT, debit_minor INTEGER NOT NULL DEFAULT 0 CHECK(debit_minor>=0),
      credit_minor INTEGER NOT NULL DEFAULT 0 CHECK(credit_minor>=0), currency TEXT NOT NULL,
      currency_scale INTEGER NOT NULL, cost_center TEXT,
      dimensions_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(dimensions_json)), remarks TEXT,
      posting_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key),
      CHECK(NOT(debit_minor>0 AND credit_minor>0))
    );
    """
)

for migration in (
    "0042_vn_accounting_period_hardening.sql",
    "0110_rc020_finance_posting_period_integrity.sql",
    "0111_rc020_finance_gl_scope_reconciliation.sql",
):
    DB.executescript((ROOT / "migrations/tenant" / migration).read_text(encoding="utf-8"))


def payload(**values):
    return values


def insert_doc(doctype, name, docstatus, data, *, tenant="demo", actor="general@example.test", version=1):
    DB.execute(
        """INSERT INTO documents(
          tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json,modified_by
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            tenant, f"{doctype}:{name}", doctype, name, actor, docstatus,
            "Submitted" if docstatus == 1 else "Cancelled" if docstatus == 2 else "Draft",
            version, "2026-08-03T00:00:00Z", "2026-08-03T00:00:00Z",
            json.dumps(data, separators=(",", ":")), actor,
        ),
    )


def update_doc(doctype, name, *, tenant="demo", actor, docstatus=None, data=None):
    row = DB.execute(
        "SELECT docstatus,payload_json,version FROM documents WHERE tenant_id=? AND doc_key=?",
        (tenant, f"{doctype}:{name}"),
    ).fetchone()
    assert row is not None
    next_status = row["docstatus"] if docstatus is None else docstatus
    next_payload = row["payload_json"] if data is None else json.dumps(data, separators=(",", ":"))
    DB.execute(
        """UPDATE documents SET docstatus=?,status=?,version=?,modified_at=?,payload_json=?,modified_by=?
           WHERE tenant_id=? AND doc_key=?""",
        (
            next_status,
            "Submitted" if next_status == 1 else "Cancelled" if next_status == 2 else "Draft",
            row["version"] + 1, "2026-08-03T01:00:00Z", next_payload, actor,
            tenant, f"{doctype}:{name}",
        ),
    )


def expect_rejected(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        DB.rollback()
    else:
        raise AssertionError(f"expected database rejection: {marker}")


def grant(user, role, tenant="demo"):
    DB.execute("INSERT INTO user_roles VALUES(?,?,?)", (tenant, user, role))


def raw_gl(
    voucher_no,
    line_key,
    debit,
    credit,
    *,
    voucher_type="Journal Entry",
    tenant="demo",
    revision=1,
    dimensions="{}",
    posting_at="2026-11-01T08:00:00Z",
    account="1110",
):
    DB.execute(
        """INSERT INTO gl_entries(
          tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account,party_type,party,
          debit_minor,credit_minor,currency,currency_scale,cost_center,dimensions_json,remarks,posting_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            tenant, voucher_type, voucher_no, revision, line_key, account, None, None,
            debit, credit, "VND", 0, None, dimensions, None, posting_at,
        ),
    )


CHIEF = "chief.accountant@example.test"
MANAGER = "accounts.manager@example.test"
GENERAL = "general.accountant@example.test"
SYSTEM = "system.manager@example.test"
for user, role in (
    (CHIEF, "Chief Accountant"), (MANAGER, "Accounts Manager"),
    (GENERAL, "General Accountant"), (SYSTEM, "System Manager"),
):
    grant(user, role)
DB.commit()

# Seed already-posted vouchers before periods close so cancel/backdate/scope moves are testable.
for name, company, branch, posting in (
    ("JV-JULY-POSTED", "ALUMDOOR", "", "2026-07-15T08:00:00Z"),
    ("JV-JULY-MOVE-OUT", "ALUMDOOR", "", "2026-07-16T08:00:00Z"),
    ("JV-OTHER-COMPANY", "OTHERCO", "", "2026-07-17T08:00:00Z"),
    ("JV-C3-HN", "C3", "HN", "2026-10-10T08:00:00Z"),
    ("JV-C3-HCM", "C3", "HCM", "2026-10-10T08:00:00Z"),
):
    insert_doc("Journal Entry", name, 1, payload(company=company, branch=branch, posting_at=posting), actor=GENERAL)
DB.commit()

for name, company, branch, start, end, state, allow in (
    ("KY-07-HARD", "ALUMDOOR", "", "2026-07-01", "2026-07-31", "Hard Locked", 0),
    ("KY-08-SOFT-HN", "ALUMDOOR", "HN", "2026-08-01", "2026-08-31", "Soft Closed", 1),
    ("KY-09-SOFT-NO-ADJ", "ALUMDOOR", "", "2026-09-01", "2026-09-30", "Soft Closed", 0),
    ("KY-10-C3-HN", "C3", "HN", "2026-10-01", "2026-10-31", "Hard Locked", 0),
):
    insert_doc(
        "VN Accounting Period", name, 1,
        payload(company=company, branch=branch, start_date=start, end_date=end,
                close_state=state, allow_approved_adjustments=allow),
        actor=CHIEF,
    )
DB.commit()

# Hard lock: new posting, draft submit, cancel and backdate/scope rewrites all fail closed.
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: insert_doc(
    "Journal Entry", "JV-HARD-NEW", 1, payload(company="ALUMDOOR", posting_at="2026-07-20T08:00:00Z"), actor=CHIEF,
))
insert_doc("Journal Entry", "JV-HARD-DRAFT", 0, payload(company="ALUMDOOR", posting_at="2026-07-20T08:00:00Z"), actor=GENERAL)
DB.commit()
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc("Journal Entry", "JV-HARD-DRAFT", actor=CHIEF, docstatus=1))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc("Journal Entry", "JV-JULY-POSTED", actor=CHIEF, docstatus=2))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc(
    "Journal Entry", "JV-JULY-MOVE-OUT", actor=CHIEF,
    data=payload(company="ALUMDOOR", posting_at="2026-11-16T08:00:00Z"),
))
insert_doc("Journal Entry", "JV-NOV-MOVE-IN", 1, payload(company="ALUMDOOR", posting_at="2026-11-16T08:00:00Z"), actor=GENERAL)
DB.commit()
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc(
    "Journal Entry", "JV-NOV-MOVE-IN", actor=CHIEF,
    data=payload(company="ALUMDOOR", posting_at="2026-07-16T08:00:00Z"),
))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc(
    "Journal Entry", "JV-JULY-MOVE-OUT", actor=CHIEF,
    data=payload(company="OTHERCO", posting_at="2026-07-16T08:00:00Z"),
))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc(
    "Journal Entry", "JV-OTHER-COMPANY", actor=CHIEF,
    data=payload(company="ALUMDOOR", posting_at="2026-07-17T08:00:00Z"),
))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc(
    "Journal Entry", "JV-C3-HN", actor=CHIEF,
    data=payload(company="C3", branch="HCM", posting_at="2026-10-10T08:00:00Z"),
))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc(
    "Journal Entry", "JV-C3-HCM", actor=CHIEF,
    data=payload(company="C3", branch="HN", posting_at="2026-10-10T08:00:00Z"),
))

# Tenant/company/branch isolation: closed scope never leaks to an unrelated legal scope.
insert_doc("Journal Entry", "JV-COMPANY-ISOLATED", 1, payload(company="OTHERCO", posting_at="2026-07-21T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-BRANCH-ISOLATED", 1, payload(company="C3", branch="HCM", posting_at="2026-10-21T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-TENANT-ISOLATED", 1, payload(company="ALUMDOOR", posting_at="2026-07-21T08:00:00Z"), tenant="other", actor=GENERAL)
DB.commit()

# Soft close: client-declared approver is never authority. Current authenticated
# modified_by must hold close authority inside the same tenant and reason is mandatory.
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: insert_doc(
    "Journal Entry", "JV-SOFT-NORMAL", 1,
    payload(company="ALUMDOOR", branch="HN", posting_at="2026-08-05T08:00:00Z"), actor=CHIEF,
))
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: insert_doc(
    "Journal Entry", "JV-SOFT-FORGED", 1,
    payload(company="ALUMDOOR", branch="HN", posting_at="2026-08-05T08:00:00Z",
            approved_adjustment=1, adjustment_reason="Forged client approval", adjustment_approved_by=CHIEF),
    actor=GENERAL,
))
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: insert_doc(
    "Journal Entry", "JV-SOFT-NO-REASON", 1,
    payload(company="ALUMDOOR", branch="HN", posting_at="2026-08-06T08:00:00Z",
            approved_adjustment=1, adjustment_approved_by=CHIEF), actor=CHIEF,
))
insert_doc(
    "Journal Entry", "JV-SOFT-ADJ", 1,
    payload(company="ALUMDOOR", branch="HN", posting_at="2026-08-07T08:00:00Z",
            approved_adjustment=1, adjustment_reason="Approved accrual correction", adjustment_approved_by=GENERAL),
    actor=CHIEF,
)
DB.commit()
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: update_doc("Journal Entry", "JV-SOFT-ADJ", actor=GENERAL, docstatus=2))
update_doc("Journal Entry", "JV-SOFT-ADJ", actor=MANAGER, docstatus=2)
DB.commit()
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: insert_doc(
    "Journal Entry", "JV-SOFT-DISABLED", 1,
    payload(company="ALUMDOOR", posting_at="2026-09-05T08:00:00Z", approved_adjustment=1,
            adjustment_reason="Period disallows adjustments", adjustment_approved_by=CHIEF), actor=CHIEF,
))

# Canonical GL boundary is a universal backstop. Credit Note is intentionally not
# in 0042's document-trigger list, so a future/new GL controller cannot bypass
# RC-020 merely by having a different doctype name.
insert_doc("Credit Note", "CN-HARD", 1, payload(company="ALUMDOOR", posting_at="2026-07-22T08:00:00Z"), actor=CHIEF)
DB.commit()
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: raw_gl(
    "CN-HARD", "ROW-1", 100, 0, voucher_type="Credit Note", posting_at="2026-07-22T08:00:00Z",
))
insert_doc("Credit Note", "CN-SOFT-FORGED", 1, payload(
    company="ALUMDOOR", branch="HN", posting_at="2026-08-22T08:00:00Z",
    approved_adjustment=1, adjustment_reason="Forged GL-boundary adjustment", adjustment_approved_by=CHIEF,
), actor=GENERAL)
DB.commit()
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: raw_gl(
    "CN-SOFT-FORGED", "ROW-1", 100, 0, voucher_type="Credit Note", posting_at="2026-08-22T08:00:00Z",
))
insert_doc("Credit Note", "CN-SOFT-VALID", 1, payload(
    company="ALUMDOOR", branch="HN", posting_at="2026-08-23T08:00:00Z",
    approved_adjustment=1, adjustment_reason="Authorized GL-boundary adjustment", adjustment_approved_by=GENERAL,
), actor=CHIEF)
DB.commit()
raw_gl("CN-SOFT-VALID", "ROW-1", 100, 0, voucher_type="Credit Note", posting_at="2026-08-23T08:00:00Z", account="1110")
raw_gl("CN-SOFT-VALID", "ROW-2", 0, 100, voucher_type="Credit Note", posting_at="2026-08-23T08:00:00Z", account="3310")
DB.commit()

# Canonical GL source scope is mandatory for every new ledger row.
expect_rejected("GL_COMPANY_SCOPE_REQUIRED", lambda: raw_gl("JV-NO-SOURCE", "ROW-1", 1, 0))
insert_doc("Journal Entry", "JV-BR-MISMATCH", 2, payload(company="REPORTCO", branch="HN", posting_at="2026-11-01T08:00:00Z"), actor=MANAGER)
DB.commit()
expect_rejected("GL_BRANCH_SCOPE_MISMATCH", lambda: raw_gl(
    "JV-BR-MISMATCH", "ROW-1", 1, 0, dimensions=json.dumps({"branch": "HCM"}),
))

# Submit + exact cancel reversal stay as separate immutable revisions. Reports and
# reconciliation read those same rows, not a projection that can drift.
insert_doc("Journal Entry", "JV-REVERSAL", 2,
           payload(company="REPORTCO", branch="HN", posting_at="2026-11-01T08:00:00Z"), actor=MANAGER, version=2)
insert_doc("Journal Entry", "JV-OTHER-BRANCH", 1,
           payload(company="REPORTCO", branch="HCM", posting_at="2026-11-02T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-OTHER-TENANT", 1,
           payload(company="REPORTCO", branch="HN", posting_at="2026-11-02T08:00:00Z"), tenant="other", actor=GENERAL)
DB.commit()

GL_ROWS = (
    ("demo", "Journal Entry", "JV-REVERSAL", 1, "ROW-1", "1110", None, None, 125000, 0, "VND", 0, None, "{}", "submit", "2026-11-01T08:00:00Z"),
    ("demo", "Journal Entry", "JV-REVERSAL", 1, "ROW-2", "3310", None, None, 0, 125000, "VND", 0, None, "{}", "submit", "2026-11-01T08:00:00Z"),
    ("demo", "Journal Entry", "JV-REVERSAL", 2, "REV-ROW-1", "1110", None, None, 0, 125000, "VND", 0, None, "{}", "cancel", "2026-11-01T09:00:00Z"),
    ("demo", "Journal Entry", "JV-REVERSAL", 2, "REV-ROW-2", "3310", None, None, 125000, 0, "VND", 0, None, "{}", "cancel", "2026-11-01T09:00:00Z"),
    ("demo", "Journal Entry", "JV-OTHER-BRANCH", 1, "ROW-1", "1110", None, None, 90000, 0, "VND", 0, None, "{}", None, "2026-11-02T08:00:00Z"),
    ("demo", "Journal Entry", "JV-OTHER-BRANCH", 1, "ROW-2", "3310", None, None, 0, 90000, "VND", 0, None, "{}", None, "2026-11-02T08:00:00Z"),
    ("other", "Journal Entry", "JV-OTHER-TENANT", 1, "ROW-1", "1110", None, None, 70000, 0, "VND", 0, None, "{}", None, "2026-11-02T08:00:00Z"),
    ("other", "Journal Entry", "JV-OTHER-TENANT", 1, "ROW-2", "3310", None, None, 0, 70000, "VND", 0, None, "{}", None, "2026-11-02T08:00:00Z"),
)
DB.executemany("INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", GL_ROWS)
DB.executemany("INSERT INTO versions VALUES(?,?,?,?,?,?,?,?)", (
    ("demo", "Journal Entry:JV-REVERSAL", 1, "cmd-submit", CHIEF, "submit", json.dumps({"docstatus": 1}), "2026-11-01T08:00:00Z"),
    ("demo", "Journal Entry:JV-REVERSAL", 2, "cmd-cancel", MANAGER, "cancel", json.dumps({"docstatus": 2}), "2026-11-01T09:00:00Z"),
))
DB.executemany("INSERT INTO mutation_receipts VALUES(?,?,?,?,?,?,?,?,?)", (
    ("demo", "cmd-submit", CHIEF, "Journal Entry", "JV-REVERSAL", 1, "a" * 64, "2026-11-01T08:00:00Z", "{}"),
    ("demo", "cmd-cancel", MANAGER, "Journal Entry", "JV-REVERSAL", 2, "b" * 64, "2026-11-01T09:00:00Z", "{}"),
))
DB.commit()

expect_rejected("GL_ENTRY_IMMUTABLE", lambda: DB.execute("UPDATE gl_entries SET debit_minor=1 WHERE voucher_no='JV-REVERSAL'"))
expect_rejected("GL_ENTRY_IMMUTABLE", lambda: DB.execute("DELETE FROM gl_entries WHERE voucher_no='JV-REVERSAL'"))

assert DB.execute("SELECT COUNT(*) FROM gl_entries WHERE tenant_id='demo' AND voucher_no='JV-REVERSAL'").fetchone()[0] == 4
assert DB.execute("SELECT COUNT(*) FROM versions WHERE tenant_id='demo' AND doc_key='Journal Entry:JV-REVERSAL'").fetchone()[0] == 2
assert DB.execute("SELECT COUNT(*) FROM mutation_receipts WHERE tenant_id='demo' AND name='JV-REVERSAL'").fetchone()[0] == 2

# Reversal nets to zero, but history remains four rows and two balanced revisions.
per_account = DB.execute(
    """SELECT account,SUM(debit_minor-credit_minor) AS net,COUNT(*) AS row_count
       FROM gl_entries WHERE tenant_id='demo' AND voucher_no='JV-REVERSAL'
       GROUP BY account ORDER BY account"""
).fetchall()
assert len(per_account) == 2 and all(row["net"] == 0 and row["row_count"] == 2 for row in per_account)
revisions = DB.execute(
    """SELECT voucher_revision,difference_minor,line_count FROM finance_gl_reconciliation
       WHERE tenant_id='demo' AND company='REPORTCO' AND branch='HN' AND voucher_no='JV-REVERSAL'
       ORDER BY voucher_revision"""
).fetchall()
assert [(row["voucher_revision"], row["difference_minor"], row["line_count"]) for row in revisions] == [(1, 0, 2), (2, 0, 2)]

# General Ledger and Trial Balance retain canonical tenant/company/branch scope.
gl_hn = DB.execute(
    "SELECT COUNT(*) FROM general_ledger_report WHERE tenant_id='demo' AND company='REPORTCO' AND branch='HN'"
).fetchone()[0]
gl_hcm = DB.execute(
    "SELECT COUNT(*) FROM general_ledger_report WHERE tenant_id='demo' AND company='REPORTCO' AND branch='HCM'"
).fetchone()[0]
gl_other_tenant = DB.execute(
    "SELECT COUNT(*) FROM general_ledger_report WHERE tenant_id='other' AND company='REPORTCO' AND branch='HN'"
).fetchone()[0]
assert (gl_hn, gl_hcm, gl_other_tenant) == (4, 2, 2)
trial_hn = DB.execute(
    """SELECT account,balance FROM trial_balance
       WHERE tenant_id='demo' AND company='REPORTCO' AND branch='HN' ORDER BY account"""
).fetchall()
assert len(trial_hn) == 2 and all(row["balance"] == 0 for row in trial_hn)
assert DB.execute("SELECT COUNT(*) FROM finance_gl_integrity_exceptions").fetchone()[0] == 0

# Exact source-of-truth / retry / permission / audit contract checks.
controllers = (ROOT / "packages/clouderp-core/src/controllers.ts").read_text(encoding="utf-8")
kernel = (ROOT / "packages/document-kernel/src/kernel.ts").read_text(encoding="utf-8")
store = (ROOT / "packages/document-kernel/src/d1-store.ts").read_text(encoding="utf-8")
query = (ROOT / "packages/query/src/index.ts").read_text(encoding="utf-8")
period_meta = (ROOT / "apps-src/vn-accounting/doctypes/vn-accounting-period.json").read_text(encoding="utf-8")
assert 'context.command.action === "cancel" ? reverseGl(lines) : lines' in controllers
assert 'const previousReceipt = await this.store.getReceipt(command.tenant_id, command.command_id);' in kernel
assert 'if (previousReceipt)' in kernel and 'return previousReceipt;' in kernel
assert 'this.permission.assert({' in kernel
assert "INSERT INTO versions" in store and "INSERT INTO gl_entries" in store and "INSERT INTO mutation_receipts" in store
assert "await database.batch(statements)" in store
assert store.index("INSERT INTO documents") < store.index("INSERT INTO gl_entries")
assert "getVoucherGlEntries" in store and "FROM gl_entries" in store
assert '"General Ledger"' in query and '"Trial Balance"' in query
for role in ("Chief Accountant", "Accounts Manager", "System Manager"):
    assert role in period_meta

print("RC020_FINANCE_PERIOD_POSTING_PASS")
