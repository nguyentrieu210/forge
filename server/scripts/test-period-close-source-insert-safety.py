"""Real SQLite backstop tests for direct submitted insert and malformed P&L history."""
from pathlib import Path
import runpy
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'scripts/test-period-closing-authority-migration.py'))


def connection():
    db = helpers['connection']()
    db.executescript((ROOT / 'migrations/tenant/0166_period_close_source_insert_safety.sql').read_text())
    return db


for case in ['valid', 'no-lock', 'row-count', 'debit', 'credit', 'late-source', 'malformed', 'invalid-calendar']:
    db = connection()
    helpers['seed_source'](db)
    if case != 'no-lock':
        helpers['lock'](db)
    payload = helpers['pcv_payload']()
    if case == 'row-count': payload['source_gl_row_count'] += 1
    if case == 'debit': payload['source_debit_minor'] += 1
    if case == 'credit': payload['source_credit_minor'] += 1
    if case == 'late-source':
        helpers['document'](db, 'Journal Entry', 'JE-LATE', 1, {'company': 'Demo'})
        helpers['gl'](db, 'JE-LATE', 'LATE', 'Rent', 1, 0)
    if case in ['malformed', 'invalid-calendar']:
        bad = '2026-06-30BAD' if case == 'malformed' else '2026-02-30T12:00:00Z'
        db.execute("UPDATE gl_entries SET posting_at=? WHERE account='Sales'", (bad,))
    expected = 'PERIOD_CLOSE_REQUIRES_LOCK' if case == 'no-lock' else (
        'PERIOD_CLOSE_INVALID_SOURCE_DATE' if case in ['malformed', 'invalid-calendar'] else 'PERIOD_CLOSE_SOURCE_CHANGED')
    try:
        helpers['document'](db, 'Period Closing Voucher', 'PCV-DIRECT', 1, payload)
    except sqlite3.IntegrityError as exc:
        assert case != 'valid' and expected in str(exc), (case, exc)
        assert db.execute("SELECT COUNT(*) FROM documents WHERE name='PCV-DIRECT'").fetchone() == (0,)
    else:
        assert case == 'valid', case + ' escaped direct insert guard'

# UPDATE must also fail closed on malformed historical source, including impossible dates.
for malformed in ['2026-06-30BAD', '2026-02-30T12:00:00Z']:
    db = connection(); helpers['seed_source'](db); helpers['lock'](db)
    helpers['document'](db, 'Period Closing Voucher', 'PCV-UPDATE', 0, helpers['pcv_payload']())
    db.execute("UPDATE gl_entries SET posting_at=? WHERE account='Sales'", (malformed,))
    try:
        db.execute("UPDATE documents SET docstatus=1 WHERE name='PCV-UPDATE'")
    except sqlite3.IntegrityError as exc:
        assert 'PERIOD_CLOSE_INVALID_SOURCE_DATE' in str(exc), exc
        assert db.execute("SELECT docstatus FROM documents WHERE name='PCV-UPDATE'").fetchone() == (0,)
    else:
        raise AssertionError('malformed source escaped submit UPDATE')

# Scoped malformed history in another company/branch does not poison this company's close.
for scope in ['company', 'branch']:
    db = connection(); helpers['seed_source'](db); helpers['lock'](db)
    helpers['document'](db, 'Journal Entry', 'JE-BAD-OTHER', 1,
                        {'company': 'Other' if scope == 'company' else 'Demo', 'branch': 'Other'})
    helpers['gl'](db, 'JE-BAD-OTHER', 'BAD', 'Sales', 0, 1)
    db.execute("UPDATE gl_entries SET posting_at='BAD' WHERE voucher_no='JE-BAD-OTHER'")
    payload = helpers['pcv_payload']()
    if scope == 'branch':
        payload['branch'] = 'A'
        db.execute("UPDATE documents SET payload_json=json_set(payload_json,'$.branch','A') WHERE name IN ('JE-SALES','JE-RENT')")
    helpers['document'](db, 'Period Closing Voucher', 'PCV-SCOPED', 1, payload)
    db.executescript((ROOT / 'migrations/tenant/0166_period_close_source_insert_safety.sql').read_text())
print('period close direct submitted source/lock/date authority: PASS')

# Zero-net inactive history is still historical evidence, but not an active-source fingerprint.
for zero_net in [True, False]:
    db = connection(); helpers['seed_source'](db); helpers['lock'](db)
    if zero_net:
        helpers['gl'](db, 'JE-SALES', 'SALES-REVERSE', 'Sales', 10000, 0)
    db.execute("UPDATE master_records SET disabled=1 WHERE name='Sales'")
    payload = helpers['pcv_payload']()
    payload.update(source_gl_row_count=1, source_debit_minor=6000, source_credit_minor=0)
    try:
        helpers['document'](db, 'Period Closing Voucher', 'PCV-INACTIVE-HISTORY', 1, payload)
    except sqlite3.IntegrityError as exc:
        assert not zero_net and 'PERIOD_CLOSE_INACTIVE_PNL_BALANCE' in str(exc), exc
    else:
        assert zero_net, 'nonzero inactive P&L escaped guard'
print('period close inactive history active fingerprint alignment: PASS')

# Large prior offsets net to exactly zero; gross amounts fit SQLite's integer accumulator.
db = connection(); helpers['seed_source'](db); helpers['lock'](db)
helpers['document'](db, 'Journal Entry', 'JE-PRIOR-EXACT', 1, {'company': 'Demo'})
for index, debit, credit in [(1, 9007199254740991, 0), (2, 2, 0),
                             (3, 0, 9007199254740991), (4, 0, 2)]:
    helpers['gl'](db, 'JE-PRIOR-EXACT', str(index), 'Rent', debit, credit)
db.execute("UPDATE gl_entries SET posting_at='2025-06-30T09:00:00Z' WHERE voucher_no='JE-PRIOR-EXACT'")
helpers['document'](db, 'Period Closing Voucher', 'PCV-EXACT-PRIOR', 1, helpers['pcv_payload']())
print('period close exact prior residual accumulation: PASS')
