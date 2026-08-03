#!/usr/bin/env python3
"""RC-023 focused D1 migration/invariant regression.

Exercises the cash/bank authority boundary introduced by migration 0110 without
pretending a provider-specific bank feed exists. GL stays authoritative; statement
rows and reconciliation are evidence/control state.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
DB = sqlite3.connect(":memory:")
DB.execute("PRAGMA foreign_keys=ON")

for number, name in [
    (1, "core"),
    (2, "o2c_projections"),
    (3, "commercial_accounting"),
    (4, "frappe_platform"),
    (5, "erp_core"),
    (6, "frappe_core_beta"),
    (7, "erpnext_core"),
    (8, "erpnext_breadth"),
    (9, "business_suite"),
]:
    DB.executescript((ROOT / f"migrations/tenant/{number:04d}_{name}.sql").read_text())

# Replay the current accounting-period DB authority before RC-023.
DB.executescript((ROOT / "migrations/tenant/0042_vn_accounting_period_hardening.sql").read_text())
DB.executescript((ROOT / "migrations/tenant/0110_rc023_cash_bank_reconciliation.sql").read_text())
DB.commit()

NOW = "2026-07-10T09:00:00.000Z"


def insert_doc(
    tenant: str,
    doctype: str,
    name: str,
    docstatus: int,
    payload: dict,
    *,
    version: int = 2,
) -> None:
    DB.execute(
        """INSERT INTO documents
        (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (
            tenant,
            f"{doctype}:{name}",
            doctype,
            name,
            "Administrator",
            docstatus,
            "Submitted" if docstatus == 1 else ("Cancelled" if docstatus == 2 else "Draft"),
            version,
            NOW,
            NOW,
            json.dumps(payload, separators=(",", ":")),
        ),
    )


def insert_gl(
    tenant: str,
    voucher_type: str,
    voucher_no: str,
    line_key: str,
    account: str,
    debit_minor: int,
    credit_minor: int,
    *,
    currency: str = "USD",
    scale: int = 2,
    revision: int = 2,
) -> None:
    DB.execute(
        """INSERT INTO gl_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account,debit_minor,credit_minor,
         currency,currency_scale,dimensions_json,posting_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            tenant,
            voucher_type,
            voucher_no,
            revision,
            line_key,
            account,
            debit_minor,
            credit_minor,
            currency,
            scale,
            "{}",
            NOW,
        ),
    )


def insert_reconciliation(
    owner: str,
    line_key: str,
    bank_transaction: str,
    against_type: str,
    against_no: str,
    amount_minor: int,
    bank_account: str,
    *,
    tenant: str = "demo",
    currency: str = "USD",
    scale: int = 2,
    revision: int = 2,
) -> None:
    DB.execute(
        """INSERT INTO bank_reconciliation_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,bank_account,bank_transaction,
         against_voucher_type,against_voucher_no,amount_minor,currency,currency_scale,posting_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            tenant,
            "Bank Reconciliation",
            owner,
            revision,
            line_key,
            bank_account,
            bank_transaction,
            against_type,
            against_no,
            amount_minor,
            currency,
            scale,
            NOW,
        ),
    )


def bank_transaction(
    name: str,
    bank_account: str,
    gl_account: str,
    transaction_type: str,
    amount_minor: int,
    *,
    tenant: str = "demo",
    company: str = "Demo",
    currency: str = "USD",
    scale: int = 2,
    source_kind: str | None = None,
    source_provider: str | None = None,
    source_row_id: str | None = None,
) -> None:
    payload = {
        "bank_account": bank_account,
        "company": company,
        "currency": currency,
        "currency_scale": scale,
        "gl_account": gl_account,
        "posting_at": NOW,
        "transaction_type": transaction_type,
        "amount_minor": amount_minor,
        "signed_amount_minor": amount_minor if transaction_type == "Deposit" else -amount_minor,
    }
    if source_kind is not None:
        payload["source_kind"] = source_kind
    if source_provider is not None:
        payload["source_provider"] = source_provider
    if source_row_id is not None:
        payload["source_row_id"] = source_row_id
    insert_doc(tenant, "Bank Transaction", name, 1, payload)


def expect_db_error(token: str, action: Callable[[], None]) -> None:
    DB.execute("SAVEPOINT rc023_expected_failure")
    try:
        action()
    except sqlite3.DatabaseError as error:
        message = str(error)
        DB.execute("ROLLBACK TO rc023_expected_failure")
        DB.execute("RELEASE rc023_expected_failure")
        assert token in message, (token, message)
        return
    DB.execute("ROLLBACK TO rc023_expected_failure")
    DB.execute("RELEASE rc023_expected_failure")
    raise AssertionError(f"Expected database error containing {token}")


# ---- Permission and import/provider boundary ---------------------------------

bt_meta = json.loads(
    DB.execute(
        "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Bank Transaction'"
    ).fetchone()[0]
)
bt_fields = {row["fieldname"] for row in bt_meta["fields"]}
assert {"source_kind", "source_provider", "source_row_id", "source_batch_id"} <= bt_fields
bt_accounts_user = next(row for row in bt_meta["permissions"] if row["role"] == "Accounts User")
assert bt_accounts_user["create"] is True
assert bt_accounts_user["import"] is True
assert bt_accounts_user["submit"] is False

bank_meta = json.loads(
    DB.execute(
        "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype='Bank Account'"
    ).fetchone()[0]
)
bank_accounts_user = next(row for row in bank_meta["permissions"] if row["role"] == "Accounts User")
assert bank_accounts_user["read"] is True
assert bank_accounts_user["write"] is False
assert bank_accounts_user["create"] is False
assert bank_accounts_user["import"] is False

bank_transaction(
    "BT-EXT-1",
    "BANK-B",
    "Bank-B",
    "Deposit",
    10_000,
    source_kind="Statement Import",
    source_provider="VietBank",
    source_row_id="ROW-1",
)
DB.commit()

expect_db_error(
    "uq_bank_transaction_external_source",
    lambda: bank_transaction(
        "BT-EXT-DUP",
        "BANK-B",
        "Bank-B",
        "Deposit",
        10_000,
        source_kind="Statement Import",
        source_provider="vietbank",
        source_row_id="ROW-1",
    ),
)
expect_db_error(
    "BANK_TRANSACTION_SOURCE_ID_REQUIRED",
    lambda: bank_transaction(
        "BT-BAD-IMPORT",
        "BANK-B",
        "Bank-B",
        "Deposit",
        10_000,
        source_kind="Statement Import",
    ),
)

# Same external identity is tenant-scoped, not global.
bank_transaction(
    "BT-EXT-1",
    "BANK-B",
    "Bank-B",
    "Deposit",
    10_000,
    tenant="tenant-2",
    source_kind="Statement Import",
    source_provider="VietBank",
    source_row_id="ROW-1",
)
DB.commit()

# A failed transactional batch rolls back the earlier row. This is the generic
# import boundary; a concrete bank adapter may map any file/feed to these fields.
try:
    with DB:
        bank_transaction(
            "BT-BATCH-GOOD",
            "BANK-B",
            "Bank-B",
            "Deposit",
            1_000,
            source_kind="Statement Import",
            source_provider="FileImport",
            source_row_id="BATCH-1",
        )
        bank_transaction(
            "BT-BATCH-BAD",
            "BANK-B",
            "Bank-B",
            "Deposit",
            1_000,
            source_kind="Statement Import",
            source_row_id="BATCH-2",
        )
    raise AssertionError("invalid import batch unexpectedly committed")
except sqlite3.DatabaseError as error:
    assert "BANK_TRANSACTION_SOURCE_ID_REQUIRED" in str(error)
assert (
    DB.execute(
        "SELECT COUNT(*) FROM documents WHERE tenant_id='demo' AND name='BT-BATCH-GOOD'"
    ).fetchone()[0]
    == 0
)


# ---- Journal Entry internal transfer remains financial authority -------------

insert_doc("demo", "Journal Entry", "JE-XFER", 1, {"company": "Demo", "posting_at": NOW})
insert_gl("demo", "Journal Entry", "JE-XFER", "FROM", "Bank-A", 0, 10_000)
insert_gl("demo", "Journal Entry", "JE-XFER", "TO", "Bank-B", 10_000, 0)
debit, credit = DB.execute(
    """SELECT SUM(debit_minor),SUM(credit_minor) FROM gl_entries
       WHERE tenant_id='demo' AND voucher_type='Journal Entry' AND voucher_no='JE-XFER'"""
).fetchone()
assert debit == credit == 10_000

bank_transaction("BT-W", "BANK-A", "Bank-A", "Withdrawal", 10_000)
bank_transaction("BT-D", "BANK-B", "Bank-B", "Deposit", 10_000)

insert_reconciliation("BREC-W-1", "MATCH-1", "BT-W", "Journal Entry", "JE-XFER", 6_000, "BANK-A")
assert DB.execute(
    "SELECT SUM(amount_minor) FROM bank_reconciliation_entries WHERE tenant_id='demo' AND bank_transaction='BT-W'"
).fetchone()[0] == 6_000
insert_reconciliation("BREC-W-2", "MATCH-1", "BT-W", "Journal Entry", "JE-XFER", 4_000, "BANK-A")
insert_reconciliation("BREC-D-1", "MATCH-1", "BT-D", "Journal Entry", "JE-XFER", 10_000, "BANK-B")

# Same statement row cannot be matched beyond its statement amount.
expect_db_error(
    "BANK_RECONCILIATION_OVER_ALLOCATED",
    lambda: insert_reconciliation("BREC-W-OVER", "MATCH-1", "BT-W", "Journal Entry", "JE-XFER", 1, "BANK-A"),
)

# A submitted voucher from the same company is insufficient: it must have an
# actual authoritative GL movement on the exact bank-side account/direction.
insert_doc("demo", "Journal Entry", "JE-WRONG", 1, {"company": "Demo", "posting_at": NOW})
insert_gl("demo", "Journal Entry", "JE-WRONG", "D", "Expense", 1_000, 0)
insert_gl("demo", "Journal Entry", "JE-WRONG", "C", "Other", 0, 1_000)
bank_transaction("BT-WRONG", "BANK-B", "Bank-B", "Deposit", 1_000)
expect_db_error(
    "BANK_RECONCILIATION_NO_BANK_GL",
    lambda: insert_reconciliation(
        "BREC-WRONG", "MATCH-1", "BT-WRONG", "Journal Entry", "JE-WRONG", 1_000, "BANK-B"
    ),
)

# Company boundary is checked independently from bank-account/GL matching.
insert_doc("demo", "Journal Entry", "JE-OTHER-CO", 1, {"company": "Other", "posting_at": NOW})
insert_gl("demo", "Journal Entry", "JE-OTHER-CO", "D", "Bank-B", 1_000, 0)
insert_gl("demo", "Journal Entry", "JE-OTHER-CO", "C", "Sales", 0, 1_000)
bank_transaction("BT-COMPANY", "BANK-B", "Bank-B", "Deposit", 1_000)
expect_db_error(
    "BANK_RECONCILIATION_COMPANY_MISMATCH",
    lambda: insert_reconciliation(
        "BREC-COMPANY", "MATCH-1", "BT-COMPANY", "Journal Entry", "JE-OTHER-CO", 1_000, "BANK-B"
    ),
)

# Two different statement rows cannot consume the same bank-side GL movement twice.
insert_doc("demo", "Journal Entry", "JE-ONE", 1, {"company": "Demo", "posting_at": NOW})
insert_gl("demo", "Journal Entry", "JE-ONE", "D", "Bank-C", 10_000, 0)
insert_gl("demo", "Journal Entry", "JE-ONE", "C", "Sales", 0, 10_000)
bank_transaction("BT-C1", "BANK-C", "Bank-C", "Deposit", 6_000)
bank_transaction("BT-C2", "BANK-C", "Bank-C", "Deposit", 6_000)
insert_reconciliation("BREC-C1", "MATCH-1", "BT-C1", "Journal Entry", "JE-ONE", 6_000, "BANK-C")
expect_db_error(
    "BANK_RECONCILIATION_VOUCHER_OVER_ALLOCATED",
    lambda: insert_reconciliation("BREC-C2", "MATCH-1", "BT-C2", "Journal Entry", "JE-ONE", 6_000, "BANK-C"),
)


# ---- Reverse/unreconcile and cancellation ordering ---------------------------

# A reconciled statement row cannot disappear first.
expect_db_error(
    "BANK_TRANSACTION_ACTIVE_RECONCILIATION",
    lambda: DB.execute(
        "UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doctype='Bank Transaction' AND name='BT-C1'"
    ),
)

# A reconciled posting cannot be cancelled first either.
expect_db_error(
    "BANK_RECONCILIATION_ACTIVE_VOUCHER",
    lambda: DB.execute(
        "UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doctype='Journal Entry' AND name='JE-ONE'"
    ),
)

# Explicit negative reconciliation is the correction path. Once net control state
# is zero, both source evidence and authoritative posting are cancellable.
insert_reconciliation(
    "BREC-C1", "REV-MATCH-1", "BT-C1", "Journal Entry", "JE-ONE", -6_000, "BANK-C", revision=3
)
assert DB.execute(
    "SELECT SUM(amount_minor) FROM bank_reconciliation_entries WHERE tenant_id='demo' AND bank_transaction='BT-C1'"
).fetchone()[0] == 0
DB.execute(
    "UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doctype='Bank Transaction' AND name='BT-C1'"
)
DB.execute(
    "UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doctype='Journal Entry' AND name='JE-ONE'"
)


# ---- Cancelled Payment Entry regression --------------------------------------

insert_doc("demo", "Payment Entry", "PE-1", 1, {"company": "Demo", "posting_at": "2026-06-15T09:00:00Z"})
insert_gl("demo", "Payment Entry", "PE-1", "BANK", "Bank-D", 5_000, 0)
insert_gl("demo", "Payment Entry", "PE-1", "PARTY", "Debtors", 0, 5_000)
bank_transaction("BT-PE", "BANK-D", "Bank-D", "Deposit", 5_000)
insert_reconciliation("BREC-PE", "MATCH-1", "BT-PE", "Payment Entry", "PE-1", 5_000, "BANK-D")

expect_db_error(
    "BANK_RECONCILIATION_ACTIVE_VOUCHER",
    lambda: DB.execute(
        "UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doctype='Payment Entry' AND name='PE-1'"
    ),
)
insert_reconciliation(
    "BREC-PE", "REV-MATCH-1", "BT-PE", "Payment Entry", "PE-1", -5_000, "BANK-D", revision=3
)
DB.execute(
    "UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doctype='Payment Entry' AND name='PE-1'"
)
bank_transaction("BT-PE-2", "BANK-D", "Bank-D", "Deposit", 5_000)
expect_db_error(
    "BANK_RECONCILIATION_VOUCHER_NOT_SUBMITTED",
    lambda: insert_reconciliation("BREC-PE-2", "MATCH-1", "BT-PE-2", "Payment Entry", "PE-1", 5_000, "BANK-D"),
)


# ---- Accounting-period interaction -------------------------------------------

insert_doc(
    "demo",
    "VN Accounting Period",
    "PERIOD-JUL",
    1,
    {
        "company": "Demo",
        "start_date": "2026-07-01",
        "end_date": "2026-07-31",
        "close_state": "Hard Locked",
    },
)

# A late statement import is evidence only and is allowed in a closed accounting
# period. Reconciliation is not: applying control state to that period is blocked.
bank_transaction(
    "BT-LATE",
    "BANK-LATE",
    "Bank-Late",
    "Deposit",
    1_000,
    source_kind="Statement Import",
    source_provider="GenericCSV",
    source_row_id="LATE-1",
)
expect_db_error(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: insert_doc(
        "demo",
        "Bank Reconciliation",
        "BREC-LATE",
        1,
        {
            "bank_account": "BANK-LATE",
            "company": "Demo",
            "currency": "USD",
            "currency_scale": 2,
            "posting_at": NOW,
            "entries": [],
        },
    ),
)

# Cancellation/reverse-reconcile is also blocked when the original reconciliation
# date later falls inside a hard-locked period.
insert_doc(
    "demo",
    "Bank Reconciliation",
    "BREC-JUN",
    1,
    {
        "bank_account": "BANK-D",
        "company": "Demo",
        "currency": "USD",
        "currency_scale": 2,
        "posting_at": "2026-06-15T09:00:00Z",
        "entries": [],
    },
)
insert_doc(
    "demo",
    "VN Accounting Period",
    "PERIOD-JUN",
    1,
    {
        "company": "Demo",
        "start_date": "2026-06-01",
        "end_date": "2026-06-30",
        "close_state": "Hard Locked",
    },
)
expect_db_error(
    "ACCOUNTING_PERIOD_HARD_LOCKED",
    lambda: DB.execute(
        "UPDATE documents SET docstatus=2 WHERE tenant_id='demo' AND doctype='Bank Reconciliation' AND name='BREC-JUN'"
    ),
)

# Soft-close behavior stays aligned with the canonical 0042 adjustment contract.
insert_doc(
    "demo",
    "VN Accounting Period",
    "PERIOD-AUG",
    1,
    {
        "company": "Demo",
        "start_date": "2026-08-01",
        "end_date": "2026-08-31",
        "close_state": "Soft Closed",
        "allow_approved_adjustments": 1,
    },
)
expect_db_error(
    "ACCOUNTING_PERIOD_SOFT_CLOSED",
    lambda: insert_doc(
        "demo",
        "Bank Reconciliation",
        "BREC-AUG-NO-APPROVAL",
        1,
        {
            "bank_account": "BANK-D",
            "company": "Demo",
            "posting_at": "2026-08-10T09:00:00Z",
            "entries": [],
        },
    ),
)
insert_doc(
    "demo",
    "Bank Reconciliation",
    "BREC-AUG-APPROVED",
    1,
    {
        "bank_account": "BANK-D",
        "company": "Demo",
        "posting_at": "2026-08-10T09:00:00Z",
        "approved_adjustment": 1,
        "adjustment_reason": "Late bank statement control reconciliation",
        "adjustment_approved_by": "chief-accountant@example.com",
        "entries": [],
    },
)


# ---- Fixed-point report and GL-derived position -------------------------------

insert_doc("demo", "Journal Entry", "JE-KWD", 1, {"company": "Demo", "posting_at": "2026-05-01T09:00:00Z"})
insert_gl("demo", "Journal Entry", "JE-KWD", "D", "Bank-K", 1_250, 0, currency="KWD", scale=3)
insert_gl("demo", "Journal Entry", "JE-KWD", "C", "Sales-K", 0, 1_250, currency="KWD", scale=3)
bank_transaction("BT-KWD", "BANK-K", "Bank-K", "Deposit", 1_250, currency="KWD", scale=3)
insert_reconciliation(
    "BREC-KWD",
    "MATCH-1",
    "BT-KWD",
    "Journal Entry",
    "JE-KWD",
    1_250,
    "BANK-K",
    currency="KWD",
    scale=3,
)
minor, display = DB.execute(
    """SELECT reconciled_amount_minor,reconciled_amount
       FROM bank_reconciliation_summary
       WHERE tenant_id='demo' AND bank_transaction='BT-KWD'"""
).fetchone()
assert minor == 1_250
assert display == 1.25, display

DB.execute(
    "INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at) VALUES(?,?,?,?,?,?)",
    ("demo", "Bank Account", "BANK-B", 0, '{"company":"Demo","account":"Bank-B","currency":"USD"}', NOW),
)
insert_doc(
    "demo",
    "Warehouse Cash Fund",
    "FUND-1",
    0,
    {
        "company": "Demo",
        "cash_account": "Cash",
        "currency": "USD",
        "currency_scale": 2,
        "disabled": 0,
        # Deliberately forged/non-authoritative field. The projection must ignore it.
        "balance_minor": 999_999_999,
    },
    version=1,
)
insert_doc("demo", "Warehouse Cash Voucher", "WCV-1", 1, {"company": "Demo", "posting_date": "2026-05-01"})
insert_gl("demo", "Warehouse Cash Voucher", "WCV-1", "CASH", "Cash", 3_000, 0)
insert_gl("demo", "Warehouse Cash Voucher", "WCV-1", "COUNTER", "Equity", 0, 3_000)

bank_position = DB.execute(
    """SELECT gl_balance_minor,reconciled_statement_minor,unreconciled_statement_minor
       FROM cash_bank_position
       WHERE tenant_id='demo' AND position_type='Bank' AND source_name='BANK-B'"""
).fetchone()
assert bank_position is not None
expected_bank_gl = DB.execute(
    "SELECT COALESCE(SUM(debit_minor-credit_minor),0) FROM gl_entries WHERE tenant_id='demo' AND account='Bank-B' AND currency='USD'"
).fetchone()[0]
assert bank_position[0] == expected_bank_gl
assert bank_position[1] >= 0
assert bank_position[2] >= 0

cash_position = DB.execute(
    """SELECT gl_balance_minor FROM cash_bank_position
       WHERE tenant_id='demo' AND position_type='Cash' AND source_name='FUND-1'"""
).fetchone()
assert cash_position == (3_000,), cash_position

# Reconciliation summary is itself a projection over the append-only reconciliation
# ledger, not a competing mutable balance.
summary_minor = DB.execute(
    """SELECT reconciled_amount_minor FROM bank_reconciliation_summary
       WHERE tenant_id='demo' AND bank_transaction='BT-W'"""
).fetchone()[0]
ledger_minor = DB.execute(
    """SELECT SUM(amount_minor) FROM bank_reconciliation_entries
       WHERE tenant_id='demo' AND bank_transaction='BT-W'"""
).fetchone()[0]
assert summary_minor == ledger_minor

DB.commit()
print("RC023_CASH_BANK_RECONCILIATION_PASS")
