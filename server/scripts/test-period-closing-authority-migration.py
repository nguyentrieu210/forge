from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "tenant" / "0151_period_closing_voucher.sql"

SCHEMA = """
CREATE TABLE doctype_definitions (
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
  PRIMARY KEY (tenant_id, doctype)
);
CREATE TABLE documents (
  tenant_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  doctype TEXT NOT NULL,
  name TEXT NOT NULL,
  docstatus INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, doc_key)
);
CREATE TABLE master_records (
  tenant_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, record_type, name)
);
CREATE TABLE accounting_period_locks (
  tenant_id TEXT NOT NULL,
  company TEXT NOT NULL,
  lock_date TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  modified_by TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, company)
);
CREATE TABLE gl_entries (
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
  PRIMARY KEY (tenant_id,voucher_type,voucher_no,voucher_revision,line_key)
);
"""


def connection() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    db.executescript(MIGRATION.read_text())
    db.executescript((ROOT / 'migrations/tenant/0152_period_close_scope_safety.sql').read_text())
    return db


def master(db: sqlite3.Connection, kind: str, name: str, payload: dict) -> None:
    db.execute(
        "INSERT INTO master_records VALUES(?,?,?,?,0)",
        ("demo", kind, name, json.dumps(payload)),
    )


def document(
    db: sqlite3.Connection,
    doctype: str,
    name: str,
    docstatus: int,
    payload: dict,
) -> None:
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?)",
        ("demo", f"{doctype}:{name}", doctype, name, docstatus, json.dumps(payload)),
    )


def gl(
    db: sqlite3.Connection,
    voucher: str,
    line: str,
    account: str,
    debit: int,
    credit: int,
) -> None:
    db.execute(
        """INSERT INTO gl_entries(
          tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account,
          party_type,party,debit_minor,credit_minor,currency,currency_scale,
          cost_center,dimensions_json,remarks,posting_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            "demo", "Journal Entry", voucher, 2, line, account,
            None, None, debit, credit, "USD", 2,
            None, "{}", None, "2026-06-30T09:00:00.000Z",
        ),
    )


def seed_source(db: sqlite3.Connection) -> None:
    for name, root in [
        ("Cash", "Asset"),
        ("Sales", "Income"),
        ("Rent", "Expense"),
        ("Retained Earnings", "Equity"),
    ]:
        master(db, "Account", name, {
            "company": "Demo",
            "root_type": root,
            "is_group": 0,
        })
    document(db, "Journal Entry", "JE-SALES", 1, {"company": "Demo"})
    document(db, "Journal Entry", "JE-RENT", 1, {"company": "Demo"})
    gl(db, "JE-SALES", "SALES", "Sales", 0, 10_000)
    gl(db, "JE-RENT", "RENT", "Rent", 6_000, 0)


def lock(db: sqlite3.Connection) -> None:
    db.execute(
        "INSERT INTO accounting_period_locks VALUES(?,?,?,?,?,?)",
        ("demo", "Demo", "2026-12-31", "2026-12-31T12:00:00Z", "tester", "year end"),
    )


def pcv_payload() -> dict:
    return {
        "company": "Demo",
        "fiscal_year": "2026",
        "posting_at": "2026-12-31T23:59:59.000Z",
        "closing_account": "Retained Earnings",
        "period_start_date": "2026-01-01",
        "period_end_date": "2026-12-31",
        "source_gl_row_count": 2,
        "source_debit_minor": 6_000,
        "source_credit_minor": 10_000,
    }


# Exact matching source + lock commits.
db = connection()
seed_source(db)
lock(db)
document(db, "Period Closing Voucher", "PCV-OK", 0, pcv_payload())
db.execute(
    "UPDATE documents SET docstatus=1 WHERE tenant_id='demo' AND doc_key='Period Closing Voucher:PCV-OK'"
)
assert db.execute(
    "SELECT docstatus FROM documents WHERE doc_key='Period Closing Voucher:PCV-OK'"
).fetchone() == (1,)

# Same active company/period/branch cannot close twice.
document(db, "Period Closing Voucher", "PCV-DUP", 0, pcv_payload())
try:
    db.execute(
        "UPDATE documents SET docstatus=1 WHERE tenant_id='demo' AND doc_key='Period Closing Voucher:PCV-DUP'"
    )
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("duplicate active period close was accepted")

# A GL append after planning changes the immutable source fingerprint and blocks commit.
db = connection()
seed_source(db)
lock(db)
document(db, "Period Closing Voucher", "PCV-RACE", 0, pcv_payload())
document(db, "Journal Entry", "JE-LATE", 1, {"company": "Demo"})
gl(db, "JE-LATE", "LATE", "Rent", 1, 0)
try:
    db.execute(
        "UPDATE documents SET docstatus=1 WHERE tenant_id='demo' AND doc_key='Period Closing Voucher:PCV-RACE'"
    )
except sqlite3.IntegrityError as exc:
    assert "PERIOD_CLOSE_SOURCE_CHANGED" in str(exc), exc
else:
    raise AssertionError("stale period-close source was accepted")

# Commit-time lock is mandatory even if a controller planned a valid-looking close.
db = connection()
seed_source(db)
document(db, "Period Closing Voucher", "PCV-NO-LOCK", 0, pcv_payload())
try:
    db.execute(
        "UPDATE documents SET docstatus=1 WHERE tenant_id='demo' AND doc_key='Period Closing Voucher:PCV-NO-LOCK'"
    )
except sqlite3.IntegrityError as exc:
    assert "PERIOD_CLOSE_REQUIRES_LOCK" in str(exc), exc
else:
    raise AssertionError("period close without lock was accepted")

# Migration replay is safe.
db.executescript(MIGRATION.read_text())

print("period closing authority migration: PASS")

def rejected(db, payload, expected):
    document(db, 'Period Closing Voucher', 'PCV-BLOCK', 0, payload)
    try:
        db.execute("UPDATE documents SET docstatus=1 WHERE doc_key='Period Closing Voucher:PCV-BLOCK'")
    except sqlite3.IntegrityError as exc:
        assert expected in str(exc), exc
    else:
        raise AssertionError(expected + ' guard did not fire')
    assert db.execute("SELECT docstatus FROM documents WHERE doc_key='Period Closing Voucher:PCV-BLOCK'").fetchone() == (0,)

db = connection(); seed_source(db); lock(db)
payload = pcv_payload(); payload['posting_at'] = '2026-12-31BAD'
rejected(db, payload, 'PERIOD_CLOSE_INVALID_POSTING_AT')

# Inactive historical balances must not silently disappear from retained earnings.
for kind in ['master', 'document']:
    db = connection(); seed_source(db); lock(db)
    if kind == 'master':
        db.execute("UPDATE master_records SET disabled=1 WHERE name='Rent'")
    else:
        document(db, 'Account', 'Rent', 0, {'company':'Demo', 'root_type':'Expense', 'is_group':0, 'disabled':1})
    payload = pcv_payload(); payload.update(source_gl_row_count=1, source_debit_minor=0)
    rejected(db, payload, 'PERIOD_CLOSE_INACTIVE_PNL_BALANCE')

# Whole-company and branch scopes overlap in both directions, including unequal periods.
for existing_branch, new_branch in [('A', ''), ('', 'A'), ('A', 'A')]:
    db = connection(); seed_source(db); lock(db)
    existing = pcv_payload(); existing['branch'] = existing_branch
    document(db, 'Period Closing Voucher', 'PCV-ACTIVE', 1, existing)
    payload = pcv_payload(); payload['branch'] = new_branch
    payload['period_start_date'] = '2026-06-01'
    rejected(db, payload, 'PERIOD_CLOSE_OVERLAPPING_SCOPE')

# Separate branches are allowed; cancelled closes and another company are not blockers.
db = connection(); seed_source(db); lock(db)
db.execute("UPDATE documents SET payload_json=json_set(payload_json,'$.branch','B') WHERE doctype='Journal Entry'")
existing = pcv_payload(); existing['branch'] = 'A'
document(db, 'Period Closing Voucher', 'PCV-A', 1, existing)
payload = pcv_payload(); payload['branch'] = 'B'
document(db, 'Period Closing Voucher', 'PCV-B', 0, payload)
db.execute("UPDATE documents SET docstatus=1 WHERE doc_key='Period Closing Voucher:PCV-B'")
assert db.execute("SELECT docstatus FROM documents WHERE name='PCV-B'").fetchone() == (1,)
db.execute("UPDATE documents SET docstatus=2 WHERE doctype='Period Closing Voucher'")
payload = pcv_payload()
document(db, 'Period Closing Voucher', 'PCV-REPLACEMENT', 0, payload)
db.execute("UPDATE documents SET docstatus=1 WHERE name='PCV-REPLACEMENT'")
db.executescript((ROOT / 'migrations/tenant/0152_period_close_scope_safety.sql').read_text())
print('period close scope/timestamp/inactive account safety: PASS')

# INSERT cannot bypass the new safety boundary used by submitted UPDATE.
for scenario, expected in [('timestamp','PERIOD_CLOSE_INVALID_POSTING_AT'),
                            ('scope','PERIOD_CLOSE_OVERLAPPING_SCOPE'),
                            ('inactive','PERIOD_CLOSE_INACTIVE_PNL_BALANCE')]:
    db = connection(); seed_source(db); lock(db); payload = pcv_payload()
    if scenario == 'timestamp':
        payload['posting_at'] = '2026-12-31BAD'
    elif scenario == 'scope':
        document(db, 'Period Closing Voucher', 'PCV-EXISTING', 1, pcv_payload())
    else:
        db.execute("UPDATE master_records SET disabled=1 WHERE name='Rent'")
    try:
        document(db, 'Period Closing Voucher', 'PCV-DIRECT', 1, payload)
    except sqlite3.IntegrityError as exc:
        assert expected in str(exc), exc
    else:
        raise AssertionError('direct INSERT bypassed '+expected)

db = connection(); seed_source(db); lock(db)
old = pcv_payload(); old.update(period_start_date='2025-01-01', period_end_date='2025-12-31', posting_at='2025-12-31T23:59:59Z')
document(db, 'Period Closing Voucher', 'PCV-2025', 1, old)
document(db, 'Period Closing Voucher', 'PCV-2026', 0, pcv_payload())
db.execute("UPDATE documents SET docstatus=1 WHERE name='PCV-2026'")
print('period close direct insert and non-overlapping periods: PASS')
