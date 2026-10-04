"""Real SQLite proof: cancelled canonical accounts cannot revive imported close authority."""
from pathlib import Path
import runpy
import sqlite3
from itertools import product

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'scripts/test-period-closing-authority-migration.py'))
for zero_net, kind in product((False, True), ("cancelled", "string-disabled")):
    db = helpers['connection']()
    db.executescript((ROOT / 'migrations/tenant/0166_period_close_source_insert_safety.sql').read_text())
    db.executescript((ROOT / 'migrations/tenant/0170_period_close_account_tombstone.sql').read_text())
    helpers['seed_source'](db)
    helpers['lock'](db)
    # Imported Sales remains active; the cancelled document is its canonical tombstone.
    helpers['document'](db, 'Account', 'Sales', 2 if kind == 'cancelled' else 0,
                        {'company': 'Demo', 'root_type': 'Income', 'is_group': 0,
                         'disabled': ' TRUE ' if kind == 'string-disabled' else 0})
    assert db.execute("SELECT COUNT(*) FROM finance_active_accounts WHERE tenant_id='demo' AND name='Sales'").fetchone() == (0,)
    if zero_net:
        helpers['gl'](db, 'JE-SALES', 'SALES-REVERSE', 'Sales', 10000, 0)
    payload = helpers['pcv_payload']()
    payload.update(source_gl_row_count=1, source_debit_minor=6000, source_credit_minor=0)
    try:
        helpers['document'](db, 'Period Closing Voucher', 'PCV-TOMBSTONE', 1, payload)
    except sqlite3.IntegrityError as exc:
        assert not zero_net and 'PERIOD_CLOSE_INACTIVE_PNL_BALANCE' in str(exc), exc
        assert db.execute("SELECT COUNT(*) FROM documents WHERE name='PCV-TOMBSTONE'").fetchone() == (0,)
    else:
        assert zero_net, 'cancelled nonzero P&L escaped guard'
    # Corrective migration remains repeatable without breaking dependent triggers.
    db.executescript((ROOT / 'migrations/tenant/0170_period_close_account_tombstone.sql').read_text())
print('period close cancelled account tombstone / atomic inactive residual: PASS')
