-- Tiền cọc là số tiền riêng trên đơn; tổng đơn không đổi, còn phải thu = tổng - cọc.
-- Migration chỉ bổ sung metadata, không reset/seed/import/xóa dữ liệu D1 hiện có.

UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"deposit_amount","label":"Tiền cọc","fieldtype":"Currency","default":0,"form_region":"full","form_width":"full","description":"Tiền khách đã đặt cọc cho đơn; không làm giảm doanh thu của đơn."}')
    ),
    revision = revision + 1,
    modified_by = 'migration-0135',
    modified_at = '2026-08-18T00:00:00.000Z'
WHERE doctype = 'Sales Order'
  AND json_valid(metadata_json)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(metadata_json, '$.fields') field
    WHERE json_extract(field.value, '$.fieldname') = 'deposit_amount'
  );

UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"outstanding_amount","label":"Còn phải thu","fieldtype":"Currency","read_only":true,"form_region":"full","form_width":"full"}')
    ),
    revision = revision + 1,
    modified_by = 'migration-0135',
    modified_at = '2026-08-18T00:00:00.000Z'
WHERE doctype = 'Sales Order'
  AND json_valid(metadata_json)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(metadata_json, '$.fields') field
    WHERE json_extract(field.value, '$.fieldname') = 'outstanding_amount'
  );

UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.fields[' || (
        SELECT key FROM json_each(metadata_json, '$.fields')
        WHERE json_extract(value, '$.fieldname') = 'grand_total'
        LIMIT 1
      ) || '].label',
      'Tiền phải trả'
    ),
    revision = revision + 1,
    modified_by = 'migration-0135',
    modified_at = '2026-08-18T00:00:00.000Z'
WHERE doctype = 'Sales Order'
  AND json_valid(metadata_json)
  AND EXISTS (
    SELECT 1 FROM json_each(metadata_json, '$.fields') field
    WHERE json_extract(field.value, '$.fieldname') = 'grand_total'
      AND COALESCE(json_extract(field.value, '$.label'), '') <> 'Tiền phải trả'
  );

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.form.fields[#]', 'deposit_amount'),
    revision = revision + 1,
    modified_by = 'migration-0135',
    modified_at = '2026-08-18T00:00:00.000Z'
WHERE doctype = 'Sales Order'
  AND json_valid(metadata_json)
  AND json_type(metadata_json, '$.form.fields') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM json_each(metadata_json, '$.form.fields') field
    WHERE field.value = 'deposit_amount'
  );

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.form.fields[#]', 'outstanding_amount'),
    revision = revision + 1,
    modified_by = 'migration-0135',
    modified_at = '2026-08-18T00:00:00.000Z'
WHERE doctype = 'Sales Order'
  AND json_valid(metadata_json)
  AND json_type(metadata_json, '$.form.fields') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM json_each(metadata_json, '$.form.fields') field
    WHERE field.value = 'outstanding_amount'
  );

UPDATE doctype_definitions
SET metadata_json = json_set(metadata_json, '$.revision', revision)
WHERE doctype = 'Sales Order'
  AND json_valid(metadata_json)
  AND COALESCE(json_extract(metadata_json, '$.revision'), -1) <> revision;
