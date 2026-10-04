"""Exercise the exact D1 entitlement migration with independently prepared writes."""
import json
import sqlite3
import tempfile
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[1] / 'migrations/tenant/0165_subcontracting_commit_entitlement.sql'
Q = 1_000_000

def document(db, kind, name, data, status=0, tenant='demo'):
    db.execute('INSERT INTO documents VALUES(?,?,?,?,?)', (tenant, kind, name, status, json.dumps(data)))
    db.commit()

def submit(db, kind, name):
    db.execute('UPDATE documents SET docstatus=1 WHERE doctype=? AND name=?', (kind, name))
    db.commit()

def cancel(db, kind, name):
    db.execute('UPDATE documents SET docstatus=2 WHERE doctype=? AND name=?', (kind, name))
    db.commit()

def rejected(db, action):
    try:
        action()
    except sqlite3.IntegrityError as error:
        assert 'Subcontracting source snapshot or material entitlement changed' in str(error), error
        db.rollback()
    else:
        raise AssertionError('stale mutation unexpectedly committed')

def order(qty=2*Q):
    return dict(purchase_order='PO', purchase_order_row_id='SERVICE', service_item='SERVICE',
                production_item='FG', company='Demo', supplier='Supplier', currency='USD',
                supplier_warehouse='External', target_warehouse='Finished', qty_micros=qty,
                service_amount_minor=1000, supplied_items=[dict(bom_row_id='BOM-RAW', item_code='RAW',
                required_qty_micros=4*Q, source_warehouse='Raw')])

def transfer(qty, returned=False, order_name='ORDER'):
    return dict(subcontracting_order=order_name, company='Demo', purpose='Material Transfer',
                subcontracting_material_return=returned, items=[dict(bom_row_id='BOM-RAW', item_code='RAW',
                qty_micros=qty, source_warehouse='External' if returned else 'Raw',
                target_warehouse='Raw' if returned else 'External')])

def receipt(qty, consumed, cost=500):
    frozen = order()
    return {key: frozen[key] for key in ['purchase_order','purchase_order_row_id','service_item',
            'production_item','company','supplier','currency','supplier_warehouse','target_warehouse']} | dict(
            subcontracting_order='ORDER', received_qty_micros=qty, service_cost_minor=cost,
            supplied_items=[dict(bom_row_id='BOM-RAW', item_code='RAW', consumed_qty_micros=consumed)])

with tempfile.TemporaryDirectory() as temporary:
    path = str(Path(temporary) / 'entitlement.sqlite')
    db = sqlite3.connect(path)
    db.execute('CREATE TABLE documents(tenant_id TEXT,doctype TEXT,name TEXT,docstatus INTEGER,payload_json TEXT, PRIMARY KEY(tenant_id,doctype,name))')
    db.executescript(MIGRATION.read_text())
    db.executescript(MIGRATION.read_text())
    document(db, 'Purchase Order', 'PO', dict(company='Demo', supplier='Supplier', currency='USD',
            is_subcontracted=True, items=[dict(row_id='SERVICE',item_code='SERVICE',qty_micros=2*Q)]),1)
    document(db, 'Subcontracting Order', 'ORDER', order(),1)
    peer = sqlite3.connect(path)

    # Both writers prepared their supply against the same zero balance.
    document(db,'Stock Entry','SEND-A',transfer(3*Q))
    document(peer,'Stock Entry','SEND-B',transfer(3*Q))
    submit(db,'Stock Entry','SEND-A')
    rejected(peer,lambda: submit(peer,'Stock Entry','SEND-B'))
    document(db,'Stock Entry','SEND-REST',transfer(Q),1)

    # Both returns were prepared against four available units. Second loses atomically.
    document(db,'Stock Entry','RETURN-A',transfer(3*Q,True))
    document(peer,'Stock Entry','RETURN-B',transfer(3*Q,True))
    submit(db,'Stock Entry','RETURN-A')
    rejected(peer,lambda: submit(peer,'Stock Entry','RETURN-B'))
    rejected(db,lambda: cancel(db,'Stock Entry','SEND-A'))
    cancel(db,'Stock Entry','RETURN-A')

    # Two receipts prepared before the first commit cannot both consume > supplied.
    document(db,'Subcontracting Receipt','RECEIPT-A',receipt(Q,3*Q))
    document(peer,'Subcontracting Receipt','RECEIPT-B',receipt(Q,3*Q))
    submit(db,'Subcontracting Receipt','RECEIPT-A')
    rejected(peer,lambda: submit(peer,'Subcontracting Receipt','RECEIPT-B'))
    document(peer,'Stock Entry','RETURN-CONSUMED',transfer(2*Q,True))
    rejected(peer,lambda: submit(peer,'Stock Entry','RETURN-CONSUMED'))
    rejected(db,lambda: cancel(db,'Stock Entry','SEND-A'))
    rejected(db,lambda: cancel(db,'Subcontracting Order','ORDER'))
    rejected(db,lambda: cancel(db,'Purchase Order','PO'))

    # A pending receipt cannot submit after its order was cancelled by another writer.
    cancel(db,'Subcontracting Receipt','RECEIPT-A')
    cancel(db,'Stock Entry','SEND-A')
    cancel(db,'Stock Entry','SEND-REST')
    cancel(db,'Subcontracting Order','ORDER')
    rejected(peer,lambda: submit(peer,'Subcontracting Receipt','RECEIPT-B'))
    db.execute("UPDATE documents SET docstatus=1 WHERE doctype='Subcontracting Order' AND name='ORDER'")
    db.commit()
    document(db,'Stock Entry','SEND-NEW',transfer(4*Q),1)

    # Snapshot tampering and unknown BOM rows fail even when physical stock is pooled.
    wrong=transfer(Q); wrong['items'][0]['source_warehouse']='Other'
    document(peer,'Stock Entry','WRONG-WAREHOUSE',wrong)
    rejected(peer,lambda: submit(peer,'Stock Entry','WRONG-WAREHOUSE'))
    wrong=receipt(Q,2*Q); wrong['supplied_items'][0]['item_code']='OTHER'
    document(peer,'Subcontracting Receipt','WRONG-ITEM',wrong)
    rejected(peer,lambda: submit(peer,'Subcontracting Receipt','WRONG-ITEM'))
    document(peer,'Subcontracting Receipt','TOO-MUCH-FG',receipt(3*Q,2*Q))
    rejected(peer,lambda: submit(peer,'Subcontracting Receipt','TOO-MUCH-FG'))
    document(peer,'Subcontracting Receipt','TOO-MUCH-SERVICE',receipt(Q,2*Q,1001))
    rejected(peer,lambda: submit(peer,'Subcontracting Receipt','TOO-MUCH-SERVICE'))
    document(peer,'Subcontracting Order','OVER-ORDER',order())
    rejected(peer,lambda: submit(peer,'Subcontracting Order','OVER-ORDER'))

    # Valid return, replacement supply and dependent reversals remain executable.
    document(db,'Stock Entry','RETURN-VALID',transfer(2*Q,True),1)
    document(peer,'Stock Entry','REPLACE',transfer(2*Q),1)
    rejected(db,lambda: cancel(db,'Stock Entry','RETURN-VALID'))
    cancel(peer,'Stock Entry','REPLACE')
    cancel(db,'Stock Entry','RETURN-VALID')
    document(db,'Subcontracting Receipt','VALID-1',receipt(Q,2*Q),1)
    document(peer,'Subcontracting Receipt','VALID-2',receipt(Q,2*Q),1)
    assert db.execute('SELECT net_sent_qty_micros, consumed_qty_micros FROM subcontracting_commit_materials').fetchone()==(4*Q,4*Q)
    assert db.execute('SELECT count(*) FROM subcontracting_commit_violations').fetchone()[0]==0
    assert peer.execute("SELECT docstatus FROM documents WHERE name='SEND-B'").fetchone()[0]==0
    db.close(); peer.close()
print('Subcontract D1 commit entitlement: competing supply/return/receipt, snapshots, source cancellation and valid reversals passed')
