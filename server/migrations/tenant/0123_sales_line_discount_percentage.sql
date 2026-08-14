-- Operator-entered line discount percentage. The commercial resolver recalculates the
-- authoritative discount amount and marks non-policy overrides for approval.
UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"discount_percentage","label":"Chiết khấu (%)","fieldtype":"Percent","default":0,"non_negative":true,"surface":"expanded","description":"Phần trăm chiết khấu nhập trên từng dòng; server tính lại số tiền chiết khấu."}')
    ),
    revision = revision + 1,
    modified_by = 'migration-0123',
    modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Order Item'
  AND json_valid(metadata_json)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(metadata_json,'$.fields') f
    WHERE json_extract(f.value,'$.fieldname')='discount_percentage'
  );

UPDATE doctype_definitions
SET metadata_json=json_set(metadata_json,'$.revision',revision)
WHERE doctype = 'Sales Order Item'
  AND json_valid(metadata_json)
  AND COALESCE(json_extract(metadata_json,'$.revision'),-1)<>revision;
