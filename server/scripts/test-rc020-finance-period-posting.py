#!/usr/bin/env python3
"""RC-020 regression: posting periods, immutable GL, reversal and audit authority."""

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
      tenant_id TEXT NOT NULL,
      doc_key TEXT NOT NULL,
      doctype TEXT NOT NULL,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      docstatus INTEGER NOT NULL CHECK(docstatus IN (0,1,2)),
      status TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      modified_by TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(tenant_id, doc_key),
      UNIQUE(tenant_id, doctype, name)
    );

    CREATE TABLE user_roles(
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY(tenant_id,user_id,role)
    );

    CREATE TABLE versions(
      tenant_id TEXT NOT NULL,
      doc_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      command_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,doc_key,version)
    );

    CREATE TABLE mutation_receipts(
      tenant_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      name TEXT NOT NULL,
      aggregate_version INTEGER NOT NULL,
      payload_hash TEXT NOT NULL,
      committed_at TEXT NOT NULL,
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      PRIMARY KEY(tenant_id,command_id)
    );

    CREATE TABLE gl_entries(
      tenant_id TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      voucher_no TEXT NOT NULL,
      voucher_revision INTEGER NOT NULL,
      line_key TEXT NOT NULL,
      account TEXT NOT NULL,
      party_type TEXT,
      party TEXT,
      debit_minor INTEGER NOT NULL DEFAULT 0 CHECK(debit_minor>=0),
      credit_minor INTEGER NOT NULL DEFAULT 0 CHECK(credit_minor>=0),
      currency TEXT NOT NULL,
      currency_scale INTEGER NOT NULL,
      cost_center TEXT,
      dimensions_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(dimensions_json)),
      remarks TEXT,
      posting_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key),
      CHECK(NOT(debit_minor>0 AND credit_minor>0))
    );
    """
)

for migration in (
    "0042_vn_accounting_period_hardening.sql",
    "0110_rc020_finance_posting_period_integrity.sql",
):
    DB.executescript((ROOT / "migrations/tenant" / migration).read_text(encoding="utf-8"))


def payload(**values):
    return values


def insert_doc(
    doctype: str,
    name: str,
    docstatus: int,
    data: dict,
    *,
    tenant: str = "demo",
    actor: str = "general@example.test",
    version: int = 1,
):
    DB.execute(
        """INSERT INTO documents(
          tenant_id,doc_key,doctype,name,owner,docstatus,status,version,
          created_at,modified_at,payload_json,modified_by
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            tenant,
            f"{doctype}:{name}",
            doctype,
            name,
            actor,
            docstatus,
            "Submitted" if docstatus == 1 else "Cancelled" if docstatus == 2 else "Draft",
            version,
            "2026-08-03T00:00:00Z",
            "2026-08-03T00:00:00Z",
            json.dumps(data, separators=(",", ":")),
            actor,
        ),
    )


def update_doc(
    doctype: str,
    name: str,
    *,
    tenant: str = "demo",
    actor: str,
    docstatus: int | None = None,
    data: dict | None = None,
):
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
            row["version"] + 1,
            "2026-08-03T01:00:00Z",
            next_payload,
            actor,
            tenant,
            f"{doctype}:{name}",
        ),
    )


def expect_rejected(marker: str, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        DB.rollback()
    else:
        raise AssertionError(f"expected database rejection: {marker}")


def grant(user: str, role: str, tenant: str = "demo"):
    DB.execute("INSERT INTO user_roles VALUES(?,?,?)", (tenant, user, role))


CHIEF = "chief.accountant@example.test"
MANAGER = "accounts.manager@example.test"
GENERAL = "general.accountant@example.test"
SYSTEM = "system.manager@example.test"
for user, role in (
    (CHIEF, "Chief Accountant"),
    (MANAGER, "Accounts Manager"),
    (GENERAL, "General Accountant"),
    (SYSTEM, "System Manager"),
):
    grant(user, role)
DB.commit()

# Seed posted vouchers before the period is locked so cancel/scope-move can be tested.
insert_doc("Journal Entry", "JV-JULY-POSTED", 1, payload(company="ALUMDOOR", posting_at="2026-07-15T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-JULY-MOVE-OUT", 1, payload(company="ALUMDOOR", posting_at="2026-07-16T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-OTHER-COMPANY", 1, payload(company="OTHERCO", posting_at="2026-07-17T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-C3-HN", 1, payload(company="C3", branch="HN", posting_at="2026-10-10T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-C3-HCM", 1, payload(company="C3", branch="HCM", posting_at="2026-10-10T08:00:00Z"), actor=GENERAL)
DB.commit()

insert_doc(
    "VN Accounting Period",
    "KY-07-HARD",
    1,
    payload(company="ALUMDOOR", start_date="2026-07-01", end_date="2026-07-31", close_state="Hard Locked", allow_approved_adjustments=0),
    actor=CHIEF,
)
insert_doc(
    "VN Accounting Period",
    "KY-08-SOFT-HN",
    1,
    payload(company="ALUMDOOR", branch="HN", start_date="2026-08-01", end_date="2026-08-31", close_state="Soft Closed", allow_approved_adjustments=1),
    actor=CHIEF,
)
insert_doc(
    "VN Accounting Period",
    "KY-09-SOFT-NO-ADJ",
    1,
    payload(company="ALUMDOOR", start_date="2026-09-01", end_date="2026-09-30", close_state="Soft Closed", allow_approved_adjustments=0),
    actor=CHIEF,
)
insert_doc(
    "VN Accounting Period",
    "KY-10-C3-HN",
    1,
    payload(company="C3", branch="HN", start_date="2026-10-01", end_date="2026-10-31", close_state="Hard Locked", allow_approved_adjustments=0),
    actor=CHIEF,
)
DB.commit()

# Hard Locked blocks direct submitted posting, draft -> submit, backdate and cancellation.
expect_rejected(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: insert_doc("Journal Entry", "JV-HARD-NEW", 1, payload(company="ALUMDOOR", posting_at="2026-07-20T08:00:00Z"), actor=CHIEF),
)
insert_doc("Journal Entry", "JV-HARD-DRAFT", 0, payload(company="ALUMDOOR", posting_at="2026-07-20T08:00:00Z"), actor=GENERAL)
DB.commit()
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc("Journal Entry", "JV-HARD-DRAFT", actor=CHIEF, docstatus=1))
expect_rejected("ACCOUNTING_PERIOD_HARD_LOCKED", lambda: update_doc("Journal Entry", "JV-JULY-POSTED", actor=CHIEF, docstatus=2))

# Moving posting date / company / branch into or out of a hard-locked scope is blocked.
expect_rejected(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_doc("Journal Entry", "JV-JULY-MOVE-OUT", actor=CHIEF, data=payload(company="ALUMDOOR", posting_at="2026-11-16T08:00:00Z")),
)
insert_doc("Journal Entry", "JV-NOV-MOVE-IN", 1, payload(company="ALUMDOOR", posting_at="2026-11-16T08:00:00Z"), actor=GENERAL)
DB.commit()
expect_rejected(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_doc("Journal Entry", "JV-NOV-MOVE-IN", actor=CHIEF, data=payload(company="ALUMDOOR", posting_at="2026-07-16T08:00:00Z")),
)
expect_rejected(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_doc("Journal Entry", "JV-JULY-MOVE-OUT", actor=CHIEF, data=payload(company="OTHERCO", posting_at="2026-07-16T08:00:00Z")),
)
expect_rejected(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_doc("Journal Entry", "JV-OTHER-COMPANY", actor=CHIEF, data=payload(company="ALUMDOOR", posting_at="2026-07-17T08:00:00Z")),
)
expect_rejected(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_doc("Journal Entry", "JV-C3-HN", actor=CHIEF, data=payload(company="C3", branch="HCM", posting_at="2026-10-10T08:00:00Z")),
)
expect_rejected(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: update_doc("Journal Entry", "JV-C3-HCM", actor=CHIEF, data=payload(company="C3", branch="HN", posting_at="2026-10-10T08:00:00Z")),
)

# Company/branch/tenant isolation: unrelated scopes stay writable.
insert_doc("Journal Entry", "JV-COMPANY-ISOLATED", 1, payload(company="OTHERCO", posting_at="2026-07-21T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-BRANCH-ISOLATED", 1, payload(company="C3", branch="HCM", posting_at="2026-10-21T08:00:00Z"), actor=GENERAL)
insert_doc("Journal Entry", "JV-TENANT-ISOLATED", 1, payload(company="ALUMDOOR", posting_at="2026-07-21T08:00:00Z"), tenant="other", actor=GENERAL)
DB.commit()

# Soft Closed rejects normal posting and, critically, rejects a forged client
# adjustment_approved_by when authenticated modified_by lacks close authority.
expect_rejected(
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
    lambda: insert_doc("Journal Entry", "JV-SOFT-NORMAL", 1, payload(company="ALUMDOOR", branch="HN", posting_at="2026-08-05T08:00:00Z"), actor=CHIEF),
)
expect_rejected(
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
    lambda: insert_doc(
        "Journal Entry",
        "JV-SOFT-FORGED",
        1,
        payload(
            company="ALUMDOOR",
            branch="HN",
            posting_at="2026-08-05T08:00:00Z",
            approved_adjustment=1,
            adjustment_reason="Client claims a chief accountant approved this",
            adjustment_approved_by=CHIEF,
        ),
        actor=GENERAL,
    ),
)
expect_rejected(
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
    lambda: insert_doc(
        "Journal Entry",
        "JV-SOFT-NO-REASON",
        1,
        payload(company="ALUMDOOR", branch="HN", posting_at="2026-08-06T08:00:00Z", approved_adjustment=1, adjustment_approved_by=CHIEF),
        actor=CHIEF,
    ),
)

# A valid adjustment is authorized by framework-owned modified_by + tenant user_roles.
insert_doc(
    "Journal Entry",
    "JV-SOFT-ADJ",
    1,
    payload(
        company="ALUMDOOR",
        branch="HN",
        posting_at="2026-08-07T08:00:00Z",
        approved_adjustment=1,
        adjustment_reason="Approved accrual correction",
        adjustment_approved_by=CHIEF,
    ),
    actor=CHIEF,
)
DB.commit()

# Cancelling/reversing a Soft Closed adjustment needs current authenticated authority too.
expect_rejected("ACCOUNTING_PERIOD_SOFT_CLOSED", lambda: update_doc("Journal Entry", "JV-SOFT-ADJ", actor=GENERAL, docstatus=2))
update_doc("Journal Entry", "JV-SOFT-ADJ", actor=MANAGER, docstatus=2)
DB.commit()

# Period-level allow_approved_adjustments remains authoritative.
expect_rejected(
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
    lambda: insert_doc(
        "Journal Entry",
        "JV-SOFT-DISABLED",
        1,
        payload(
            company="ALUMDOOR",
            posting_at="2026-09-05T08:00:00Z",
            approved_adjustment=1,
            adjustment_reason="Still not allowed by this period",
            adjustment_approved_by=CHIEF,
        ),
        actor=CHIEF,
    ),
)

# Authoritative GL is append-only. Simulate submit revision + exact cancel revision
# and prove the report/reconciliation arithmetic nets to zero while both histories remain.
GL_ROWS = (
    ("demo", "Journal Entry", "JV-REVERSAL", 1, "ROW-1", "1110", None, None, 125000, 0, "VND", 0, None, "{}", "submit", "2026-11-01T08:00:00Z"),
    ("demo", "Journal Entry", "JV-REVERSAL", 1, "ROW-2", "3310", None, None, 0, 125000, "VND", 0, None, "{}", "submit", "2026-11-01T08:00:00Z"),
    ("demo", "Journal Entry", "JV-REVERSAL", 2, "REV-ROW-1", "1110", None, None, 0, 125000, "VND", 0, None, "{}", "cancel", "2026-11-01T08:00:00Z"),
    ("demo", "Journal Entry", "JV-REVERSAL", 2, "REV-ROW-2", "3310", None, None, 125000, 0, "VND", 0, None, "{}", "cancel", "2026-11-01T08:00:00Z"),
)
DB.executemany("INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", GL_ROWS)
DB.executemany(
    "INSERT INTO versions VALUES(?,?,?,?,?,?,?,?)",
    (
        ("demo", "Journal Entry:JV-REVERSAL", 1, "cmd-submit", CHIEF, "submit", json.dumps({"docstatus": 1}), "2026-11-01T08:00:00Z"),
        ("demo", "Journal Entry:JV-REVERSAL", 2, "cmd-cancel", MANAGER, "cancel", json.dumps({"docstatus": 2}), "2026-11-01T09:00:00Z"),
    ),
)
DB.executemany(
    "INSERT INTO mutation_receipts VALUES(?,?,?,?,?,?,?,?,?)",
    (
        ("demo", "cmd-submit", CHIEF, "Journal Entry", "JV-REVERSAL", 1, "a" * 64, "2026-11-01T08:00:00Z", "{}"),
        ("demo", "cmd-cancel", MANAGER, "Journal Entry", "JV-REVERSAL", 2, "b" * 64, "2026-11-01T09:00:00Z", "{}"),
    ),
)
DB.commit()

expect_rejected("GL_ENTRY_IMMUTABLE", lambda: DB.execute("UPDATE gl_entries SET debit_minor=1 WHERE voucher_no='JV-REVERSAL'"))
expect_rejected("GL_ENTRY_IMMUTABLE", lambda: DB.execute("DELETE FROM gl_entries WHERE voucher_no='JV-REVERSAL'"))

reconciliation = DB.execute(
    """SELECT account,SUM(debit_minor) AS debit,SUM(credit_minor) AS credit,
              SUM(debit_minor-credit_minor) AS net,COUNT(*) AS row_count
       FROM gl_entries WHERE tenant_id='demo' AND voucher_type='Journal Entry' AND voucher_no='JV-REVERSAL'
       GROUP BY account ORDER BY account"""
).fetchall()
assert len(reconciliation) == 2
assert all(row["net"] == 0 and row["row_count"] == 2 for row in reconciliation)
assert DB.execute("SELECT COUNT(*) FROM gl_entries WHERE voucher_no='JV-REVERSAL'").fetchone()[0] == 4
assert DB.execute("SELECT COUNT(*) FROM versions WHERE doc_key='Journal Entry:JV-REVERSAL'").fetchone()[0] == 2
assert DB.execute("SELECT COUNT(*) FROM mutation_receipts WHERE name='JV-REVERSAL'").fetchone()[0] == 2

# Exact source-contract checks: no competing ledger, cancel calls reverseGl, audit +
# receipt + GL are committed in one D1 batch, and retries resolve from the receipt.
controllers = (ROOT / "packages/clouderp-core/src/controllers.ts").read_text(encoding="utf-8")
kernel = (ROOT / "packages/document-kernel/src/kernel.ts").read_text(encoding="utf-8")
store = (ROOT / "packages/document-kernel/src/d1-store.ts").read_text(encoding="utf-8")
assert 'context.command.action === "cancel" ? reverseGl(lines) : lines' in controllers
assert 'const previousReceipt = await this.store.getReceipt(command.tenant_id, command.command_id);' in kernel
assert 'if (previousReceipt)' in kernel and 'return previousReceipt;' in kernel
assert "INSERT INTO versions" in store
assert "INSERT INTO gl_entries" in store
assert "INSERT INTO mutation_receipts" in store
assert "await database.batch(statements)" in store
assert "getVoucherGlEntries" in store and "FROM gl_entries" in store

print("RC020_FINANCE_PERIOD_POSTING_PASS")
