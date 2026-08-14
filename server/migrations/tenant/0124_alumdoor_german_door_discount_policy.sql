-- Canonical default commercial policy for Alumdoor German-door items.
-- Other item groups keep the pricing engine's default 0% unless another explicit rule applies.
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT DISTINCT
  tenant_id,
  'Pricing Rule:CHIET KHAU CUA DUC 15',
  'Pricing Rule',
  'CHIET KHAU CUA DUC 15',
  'migration-0124',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0124',
  json('{"title":"Chiết khấu mặc định Cửa Đức 15%","effect_type":"DISCOUNT_PERCENT","item_group":"Cửa CN Đức","discount_percentage":15,"priority":100,"disabled":false}')
FROM documents
WHERE doctype = 'Item Group' AND name = 'Cửa CN Đức'
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT DISTINCT
  tenant_id,
  'Pricing Rule',
  'CHIET KHAU CUA DUC 15',
  'Chiết khấu mặc định Cửa Đức 15%',
  'Cửa CN Đức; chiết khấu 15%',
  '2026-08-13T00:00:00.000Z'
FROM documents
WHERE doctype = 'Item Group' AND name = 'Cửa CN Đức'
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;
