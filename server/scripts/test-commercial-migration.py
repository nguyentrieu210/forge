#!/usr/bin/env python3
"""Exercise the v0.5 commercial accounting migration against a pre-v0.5 schema."""
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for migration in [
    root / "migrations/tenant/0001_core.sql",
    root / "migrations/tenant/0002_o2c_projections.sql",
]:
    db.executescript(migration.read_text())

# A production-shaped pre-v0.5 single-currency invoice/payment history.
db.execute(
    """INSERT INTO payment_ledger_entries
    (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    ("demo", "Sales Invoice", "SI-HIST", 2, "RECEIVABLE", "Receivable", "Customer", "CUST-1", "Debtors", 10000, "USD", 2, "Sales Invoice", "SI-HIST", "2026-07-01"),
)
db.execute(
    """INSERT INTO payment_ledger_entries
    (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    ("demo", "Payment Entry", "PE-HIST", 2, "ALLOC", "Receivable", "Customer", "CUST-1", "Debtors", -4000, "USD", 2, "Sales Invoice", "SI-HIST", "2026-07-02"),
)
db.commit()

db.executescript((root / "migrations/tenant/0003_commercial_accounting.sql").read_text())
columns = {row[1] for row in db.execute("PRAGMA table_info(payment_ledger_entries)")}
assert "base_amount_minor" in columns
rows = db.execute(
    "SELECT amount_minor,base_amount_minor FROM payment_ledger_entries WHERE tenant_id='demo' ORDER BY voucher_type"
).fetchall()
assert rows == [(-4000, -4000), (10000, 10000)], rows
projection = db.execute(
    "SELECT outstanding_minor,base_outstanding_minor FROM receivable_outstanding WHERE tenant_id='demo' AND against_voucher_no='SI-HIST'"
).fetchone()
assert projection == (6000, 6000), projection

try:
    db.execute(
        """INSERT INTO payment_ledger_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("demo", "Payment Entry", "PE-BAD", 2, "ALLOC", "Receivable", "Customer", "CUST-1", "Debtors", -6000, "USD", 2, "Sales Invoice", "SI-HIST", "2026-07-03", -6001),
    )
    raise AssertionError("base outstanding guard did not protect migrated history")
except sqlite3.DatabaseError as error:
    assert "BASE_OUTSTANDING_EXCEEDED" in str(error), error

print("COMMERCIAL_ACCOUNTING_MIGRATION_DRY_RUN_PASS")
