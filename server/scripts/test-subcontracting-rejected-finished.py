"""Rejected-unit opt-in and quantity constraints apply to every D1 document writer."""
import json
import sqlite3
from pathlib import Path

migration = Path(__file__).resolve().parents[1] / 'migrations/tenant/0168_subcontracting_rejected_finished.sql'
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE documents(tenant_id TEXT,doctype TEXT,name TEXT,docstatus INTEGER,payload_json TEXT)')
db.execute('CREATE TABLE doctype_definitions(doctype TEXT,metadata_json TEXT,revision INTEGER,modified_by TEXT,modified_at TEXT)')
db.execute('INSERT INTO doctype_definitions VALUES(?,?,1,NULL,NULL)', ('Subcontracting Receipt', json.dumps({'fields': [{'fieldname': 'received_qty', 'label': 'Received Quantity'}], 'revision': 1})))
db.executescript(migration.read_text())
first = db.execute('SELECT metadata_json,revision FROM doctype_definitions').fetchone()
db.executescript(migration.read_text())
assert db.execute('SELECT metadata_json,revision FROM doctype_definitions').fetchone() == first
fields = json.loads(first[0])['fields']
assert len(fields) == 6 and len({row['fieldname'] for row in fields}) == 6
assert fields[0]['label'] == 'Total Completed Quantity (Accepted + Rejected)'
base = dict(received_qty_micros=2000000, accepted_qty_micros=1500000,
            rejected_qty_micros=500000, rejected_service_policy='Pay Full Service',
            rejected_warehouse='Rejected', target_warehouse='Finished', supplier_warehouse='Supplier')

def insert(name, payload, status=1):
    db.execute('INSERT INTO documents VALUES(?,?,?,?,?)', ('demo','Subcontracting Receipt',name,status,json.dumps(payload)))

def reject(action):
    db.execute('SAVEPOINT bad')
    try:
        action()
    except sqlite3.IntegrityError as error:
        assert 'Subcontracting rejected quantity or payment policy is invalid' in str(error)
    else:
        raise AssertionError('invalid receipt committed')
    finally:
        db.execute('ROLLBACK TO bad')
        db.execute('RELEASE bad')

insert('valid',base)
insert('legacy',dict(received_qty_micros=2000000))
insert('all-rejected',base | dict(accepted_qty_micros=0,rejected_qty_micros=2000000))
for delta in [dict(rejected_qty_micros=-1), dict(rejected_qty_micros=2000001),
              dict(rejected_qty_micros='500000'), dict(rejected_qty_micros=None),
              dict(rejected_service_policy=None), dict(rejected_service_policy='Credit Supplier'),
              dict(rejected_warehouse='Finished'),dict(rejected_warehouse='Supplier'),
              dict(rejected_warehouse=' '),dict(accepted_qty_micros=2000000)]:
    reject(lambda delta=delta: insert('invalid',base | delta))
    reject(lambda delta=delta: db.execute('UPDATE documents SET payload_json=? WHERE name=?', (json.dumps(base | delta),'valid')))
# Saving an incomplete draft remains possible, but submission cannot bypass opt-in.
insert('draft',base | dict(rejected_service_policy=None),0)
reject(lambda: db.execute("UPDATE documents SET docstatus=1 WHERE name='draft'"))
# Cancellation does not strand an invalid submitted row: it leaves the active projection.
db.execute("UPDATE documents SET docstatus=2 WHERE name='valid'")
assert db.execute('SELECT COUNT(*) FROM subcontracting_rejected_violations').fetchone()[0] == 0
print('subcontracting rejected-finished migration: repeat apply, legacy, full/mixed rejection, insert/update/draft guards passed')
