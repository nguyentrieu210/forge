-- Alumdoor remaining data import part 1/9.
-- Generated at statement boundaries for Cloudflare D1 remote execution.
UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000001'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000002'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000003'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000004'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000005'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000006'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000007'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000008'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000009'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000010'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000011'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000012'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000013'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000014'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000015'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000016'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000017'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000018'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000019'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000020'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000021'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000022'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000023'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000024'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000025'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000026'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000027'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000028'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000029'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000030'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000031'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000032'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000033'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000034'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000035'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000036'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000037'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000038'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000039'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000040'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000041'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000042'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000043'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000044'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000045'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000046'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000047'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000048'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000049'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000050'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000051'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000052'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000053'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000054'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000055'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000056'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000057'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000058'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000059'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000060'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000061'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000062'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000063'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000064'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000065'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000066'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000067'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000068'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000069'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000070'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000071'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000072'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000073'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000074'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000075'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000076'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000077'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000078'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000079'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000080'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000081'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000082'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000083'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000084'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000085'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000086'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000087'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000088'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000089'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000090'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000091'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000092'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000093'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000094'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000095'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000096'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000097'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000098'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000099'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000100'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000101'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000102'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000103'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000104'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000105'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000106'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000107'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000108'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000109'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000110'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000111'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000112'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000113'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000114'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000115'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000116'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000117'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000118'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000119'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000120'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000121'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000122'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000123'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000124'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000125'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000126'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000127'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000128'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000129'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000130'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000131'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000132'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000133'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000134'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":"NHẬP"}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000135'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000136'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000137'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000138'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000139'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000140'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000141'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000142'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000143'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000144'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000145'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000146'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000147'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000148'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000149'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000150'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"SẮP HẾT","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000151'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000152'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000153'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;

UPDATE documents
SET payload_json=json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}')),
    modified_at='2026-07-29T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doc_key='Aluminium Lot:LN-MIG-000154'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$._migration_source')='alumdoor-current-lots-2026'
  AND json_patch(payload_json,json('{"stock_state":"TỒN","selected_for_cut":false,"intake_note":""}'))<>payload_json;
