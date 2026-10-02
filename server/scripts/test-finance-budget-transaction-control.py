#!/usr/bin/env python3
"""SQLite regression for R8-B Finance Budget actual-aware transaction control."""

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
    """CREATE TABLE gl_entries(
      tenant_id TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      voucher_no TEXT NOT NULL,
      voucher_revision INTEGER NOT NULL,
      line_key TEXT NOT NULL,
      account TEXT NOT NULL,
      party_type TEXT,
      party TEXT,
      debit_minor INTEGER NOT NULL,
      credit_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      currency_scale INTEGER NOT NULL,
      cost_center TEXT,
      dimensions_json TEXT NOT NULL DEFAULT '{}',
      remarks TEXT,
      posting_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
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
      PRIMARY KEY(tenant_id,doctype)
    )"""
)
for doctype in ("Finance Budget", "Finance Budget Commitment"):
    db.execute(
        "INSERT INTO doctype_definitions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            "demo", doctype, "Accounts", 0, 1, 0, 1,
            json.dumps({"name": doctype, "fields": []}), 0, "seed", "2026-10-02T00:00:00Z",
        ),
    )

db.execute(
    """CREATE VIEW finance_historical_accounts AS
      SELECT tenant_id,name,json_extract(payload_json,'$.company') AS company,
             json_extract(payload_json,'$.root_type') AS root_type,
             COALESCE(CAST(json_extract(payload_json,'$.is_group') AS INTEGER),0) AS is_group
      FROM documents WHERE doctype='Account'"""
)
db.executescript((root / "migrations/tenant/0153_finance_budget_transaction_control.sql").read_text(encoding="utf-8"))
db.executescript((root / "migrations/tenant/0157_finance_budget_commitment_actualization.sql").read_text(encoding="utf-8"))
db.executescript((root / "migrations/tenant/0158_finance_budget_fiscal_distribution.sql").read_text(encoding="utf-8"))


def insert_doc(doctype, name, payload, docstatus=1):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            "demo", f"{doctype}:{name}", doctype, name, "qa@example.test", docstatus,
            "Submitted" if docstatus == 1 else "Draft", 1,
            "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z", json.dumps(payload),
        ),
    )


def ensure_voucher(doctype, name, company="Kairo", **payload):
    insert_doc(doctype, name, {"company": company, **payload})


def insert_gl(voucher_type, voucher_no, line_key, account, debit, credit, *,
              posting_at="2026-06-30T12:00:00Z", currency="VND", scale=0,
              cost_center=None, dimensions=None):
    db.execute(
        """INSERT INTO gl_entries(
          tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account,
          debit_minor,credit_minor,currency,currency_scale,cost_center,dimensions_json,posting_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            "demo", voucher_type, voucher_no, 1, line_key, account,
            debit, credit, currency, scale, cost_center, json.dumps(dimensions or {}), posting_at,
        ),
    )


def budget(name, account, amount, action="Stop", against="Company", **scope):
    insert_doc("Finance Budget", name, {
        "company": "Kairo", "account": account, "budget_against": against,
        "start_date": "2026-01-01", "end_date": "2026-12-31",
        "currency": "VND", "currency_scale": 0,
        "budget_amount_minor": amount, "control_action": action, **scope,
    })


def account(name, root_type="Expense"):
    insert_doc("Account", name, {"company": "Kairo", "root_type": root_type, "is_group": 0})


def expect_rejected(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected rejection: {marker}")


# Stop = actual + commitments <= effective budget, atomically on GL insert.
account("642")
budget("BUD-STOP", "642", 1000)
insert_doc("Purchase Order", "PO-STOP", {"company": "Kairo"})
insert_doc("Finance Budget Commitment", "COM-STOP", {
    "budget": "BUD-STOP", "posting_date": "2026-04-01",
    "commitment_type": "Reserve", "amount_minor": 200,
    "source_doctype": "Purchase Order", "source_name": "PO-STOP",
})
ensure_voucher("Journal Entry", "JE-BASE")
insert_gl("Journal Entry", "JE-BASE", "L1", "642", 700, 0)
ensure_voucher("Journal Entry", "JE-EDGE")
insert_gl("Journal Entry", "JE-EDGE", "L1", "642", 100, 0)
db.commit()
ensure_voucher("Journal Entry", "JE-OVER")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-OVER", "L1", "642", 1, 0
))

# Warn and Ignore are deliberately non-blocking.
for suffix, action in (("WARN", "Warn"), ("IGNORE", "Ignore")):
    acct = "643" if action == "Warn" else "644"
    account(acct)
    budget(f"BUD-{suffix}", acct, 100, action)
    ensure_voucher("Journal Entry", f"JE-{suffix}")
    insert_gl("Journal Entry", f"JE-{suffix}", "L1", acct, 150, 0)
db.commit()

# Scope isolation: another cost center must not consume this budget.
account("645")
budget("BUD-CC", "645", 100, against="Cost Center", cost_center="OPS", scope_key="Cost Center:OPS")
ensure_voucher("Journal Entry", "JE-OTHER-CC")
insert_gl("Journal Entry", "JE-OTHER-CC", "L1", "645", 500, 0, cost_center="SALES")
ensure_voucher("Journal Entry", "JE-OPS")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-OPS", "L1", "645", 101, 0, cost_center="OPS"
))

# Revisions are effective only through the transaction posting date.
account("646")
budget("BUD-REV", "646", 100)
insert_doc("Finance Budget Revision", "REV-PAST", {
    "budget": "BUD-REV", "posting_date": "2026-05-01", "delta_amount_minor": 50,
})
insert_doc("Finance Budget Revision", "REV-FUTURE", {
    "budget": "BUD-REV", "posting_date": "2026-12-01", "delta_amount_minor": 1000,
})
ensure_voucher("Journal Entry", "JE-REV")
insert_gl("Journal Entry", "JE-REV", "L1", "646", 150, 0)
ensure_voucher("Journal Entry", "JE-REV-OVER")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-REV-OVER", "L1", "646", 1, 0
))

# Income budget consumption is credit minus debit.
account("511", "Income")
budget("BUD-INCOME", "511", 100)
ensure_voucher("Journal Entry", "JE-INCOME")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-INCOME", "L1", "511", 0, 101
))

# Mixed currency/scale is rejected rather than compared as if values were homogeneous.
account("647")
budget("BUD-CURRENCY", "647", 100)
ensure_voucher("Journal Entry", "JE-USD")
db.commit()
expect_rejected("FINANCE_BUDGET_GL_CURRENCY_SCALE_MISMATCH", lambda: insert_gl(
    "Journal Entry", "JE-USD", "L1", "647", 1, 0, currency="USD", scale=2
))

# Period Closing Voucher GL is excluded from operational budget consumption.
account("648")
budget("BUD-CLOSE", "648", 10)
ensure_voucher("Period Closing Voucher", "PCV-001")
insert_gl("Period Closing Voucher", "PCV-001", "L1", "648", 9999, 0)
db.commit()



# Canonical Purchase Order commitment is consumed automatically by linked PI expense actual.
account("649")
budget("BUD-AUTO", "649", 1000)
insert_doc("Purchase Order", "PO-AUTO", {
    "company": "Kairo", "currency": "VND",
    "items": [{"row_id": "PO-ROW", "item_code": "ITEM-1", "material_request": "MR-AUTO"}],
})
insert_doc("Finance Budget Commitment", "COM-AUTO", {
    "budget": "BUD-AUTO", "posting_date": "2026-04-01",
    "commitment_type": "Reserve", "amount_minor": 1000,
    "source_doctype": "Purchase Order", "source_name": "PO-AUTO",
})
ensure_voucher(
    "Purchase Invoice", "PI-AUTO",
    against_purchase_order="PO-AUTO",
    items=[{
        "row_id": "PI-ROW", "item_code": "ITEM-1",
        "purchase_order": "PO-AUTO", "purchase_order_item_row_id": "PO-ROW",
        "material_request": "MR-AUTO",
    }],
)
# This would be 1600 if the raw commitment were double-counted. 0157 reduces the
# outstanding commitment to 400 inside the same INSERT that posts the 600 actual.
insert_gl("Purchase Invoice", "PI-AUTO", "EXPENSE-PI-ROW", "649", 600, 0)
db.commit()

ensure_voucher("Journal Entry", "JE-AUTO-OVER")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-AUTO-OVER", "L1", "649", 1, 0
))

# Exact cancellation reversal removes the actual and restores the original reservation.
insert_gl("Purchase Invoice", "PI-AUTO", "REV-EXPENSE-PI-ROW", "649", 0, 600)
db.commit()
ensure_voucher("Journal Entry", "JE-AUTO-AFTER-CANCEL")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-AUTO-AFTER-CANCEL", "L1", "649", 1, 0
))


# Expense Claim commitment is consumed by the claim's own budget-account GL.
account("650")
budget("BUD-EC-AUTO", "650", 300)
ensure_voucher("Expense Claim", "EC-AUTO")
insert_doc("Finance Budget Commitment", "COM-EC-AUTO", {
    "budget": "BUD-EC-AUTO", "posting_date": "2026-04-01",
    "commitment_type": "Reserve", "amount_minor": 300,
    "source_doctype": "Expense Claim", "source_name": "EC-AUTO",
})
insert_gl("Expense Claim", "EC-AUTO", "EXPENSE-1", "650", 200, 0)
db.commit()
ensure_voucher("Journal Entry", "JE-EC-AUTO-OVER")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-EC-AUTO-OVER", "L1", "650", 1, 0
))


# 0158 metadata exposes fiscal distribution and child-row evidence.
budget_meta = json.loads(db.execute(
    "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Finance Budget'"
).fetchone()[0])
budget_fields = {field["fieldname"]: field for field in budget_meta["fields"]}
assert budget_fields["fiscal_distribution_enabled"]["fieldtype"] == "Check"
assert budget_fields["budget_distribution"]["options"] == "Finance Budget Distribution"
assert db.execute(
    "SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Finance Budget Distribution'"
).fetchone()[0] == 1


def monthly_distribution(amount):
    rows = []
    for index in range(12):
        month = index + 1
        # Trigger validates continuity, not calendar frequency internals; controller owns
        # exact period generation. Use real month ends so this is canonical submitted evidence.
        import calendar
        end_day = calendar.monthrange(2026, month)[1]
        rows.append({
            "row_id": f"DIST-{month}",
            "start_date": f"2026-{month:02d}-01",
            "end_date": f"2026-{month:02d}-{end_day:02d}",
            "percent_bps": 834 if index < 4 else 833,
            "allocation_weight": 1,
            "amount_minor": amount // 12,
        })
    return rows


# Invalid submitted distribution cannot enter canonical documents directly.
account("651")
bad_rows = monthly_distribution(1200)
bad_rows[-1]["allocation_weight"] = 2
expect_rejected("FINANCE_BUDGET_DISTRIBUTION_INVALID", lambda: budget(
    "BUD-FISCAL-BAD", "651", 1200,
    fiscal_distribution_enabled=True,
    distribution_frequency="Monthly",
    distribute_equally=True,
    distribution_weight_total=12,
    budget_distribution=bad_rows,
))

# GL Stop uses accumulated distribution, then proportionally scales dated revisions.
rows = monthly_distribution(1200)
budget(
    "BUD-FISCAL-GL", "651", 1200,
    fiscal_distribution_enabled=True,
    distribution_frequency="Monthly",
    distribute_equally=True,
    distribution_weight_total=12,
    budget_distribution=rows,
)
db.commit()
ensure_voucher("Journal Entry", "JE-FISCAL-JAN")
insert_gl(
    "Journal Entry", "JE-FISCAL-JAN", "L1", "651", 100, 0,
    posting_at="2026-01-15T12:00:00Z",
)
db.commit()
ensure_voucher("Journal Entry", "JE-FISCAL-JAN-OVER")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-FISCAL-JAN-OVER", "L1", "651", 1, 0,
    posting_at="2026-01-16T12:00:00Z",
))

insert_doc("Finance Budget Revision", "REV-FISCAL", {
    "budget": "BUD-FISCAL-GL", "posting_date": "2026-07-01", "delta_amount_minor": 1200,
})
ensure_voucher("Journal Entry", "JE-FISCAL-AUG")
insert_gl(
    "Journal Entry", "JE-FISCAL-AUG", "L1", "651", 1500, 0,
    posting_at="2026-08-15T12:00:00Z",
)
db.commit()
ensure_voucher("Journal Entry", "JE-FISCAL-AUG-OVER")
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_gl(
    "Journal Entry", "JE-FISCAL-AUG-OVER", "L1", "651", 1, 0,
    posting_at="2026-08-16T12:00:00Z",
))

# Commitment-only mutation is checked against actual + outstanding at the same accumulated cap.
account("652")
budget(
    "BUD-FISCAL-COM", "652", 1200,
    fiscal_distribution_enabled=True,
    distribution_frequency="Monthly",
    distribute_equally=True,
    distribution_weight_total=12,
    budget_distribution=rows,
)
ensure_voucher("Journal Entry", "JE-FISCAL-COM-ACTUAL")
insert_gl(
    "Journal Entry", "JE-FISCAL-COM-ACTUAL", "L1", "652", 700, 0,
    posting_at="2026-08-01T12:00:00Z",
)
insert_doc("Purchase Order", "PO-FISCAL-COM", {"company": "Kairo"})
db.commit()
insert_doc("Finance Budget Commitment", "COM-FISCAL-EDGE", {
    "budget": "BUD-FISCAL-COM", "posting_date": "2026-08-03",
    "commitment_type": "Reserve", "amount_minor": 100,
    "source_doctype": "Purchase Order", "source_name": "PO-FISCAL-COM",
})
db.commit()
expect_rejected("FINANCE_BUDGET_TRANSACTION_EXCEEDED", lambda: insert_doc(
    "Finance Budget Commitment", "COM-FISCAL-OVER", {
        "budget": "BUD-FISCAL-COM", "posting_date": "2026-08-03",
        "commitment_type": "Reserve", "amount_minor": 1,
        "source_doctype": "Purchase Order", "source_name": "PO-FISCAL-COM",
    }
))

assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("FINANCE_BUDGET_TRANSACTION_CONTROL_PASS")
