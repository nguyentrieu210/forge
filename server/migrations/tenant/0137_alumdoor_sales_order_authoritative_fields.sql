-- Sales Order values whose authority belongs to the authenticated actor/pricing kernel.
-- Additive metadata update only; no business documents or master records are rewritten.

UPDATE doctype_definitions
SET metadata_json = json_set(
      json_remove(
        metadata_json,
        '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'responsible_person' LIMIT 1) || '].fetch_from'
      ),
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'responsible_person' LIMIT 1) || '].read_only', json('true'),
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'responsible_person' LIMIT 1) || '].valueSource', 'system',
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'responsible_person' LIMIT 1) || '].editMode', 'readonly',
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'responsible_person' LIMIT 1) || '].serverEnforced', json('true'),
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'responsible_person' LIMIT 1) || '].description', 'Tự lấy Nhân viên đang làm việc gắn với user đăng nhập.'
    ),
    revision = revision + 1,
    modified_by = 'migration',
    modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE doctype = 'Sales Order'
  AND json_valid(metadata_json)
  AND EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'responsible_person');

UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'rate' LIMIT 1) || '].read_only', json('true'),
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'rate' LIMIT 1) || '].valueSource', 'formula',
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'rate' LIMIT 1) || '].editMode', 'readonly',
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'rate' LIMIT 1) || '].serverEnforced', json('true'),
      '$.fields[' || (SELECT key FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'rate' LIMIT 1) || '].description', 'Đơn giá do server lấy từ bảng giá, Item, ĐVT bán và biến thể; người nhập không được sửa tay.'
    ),
    revision = revision + 1,
    modified_by = 'migration',
    modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE doctype = 'Sales Order Item'
  AND json_valid(metadata_json)
  AND EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') WHERE json_extract(value, '$.fieldname') = 'rate');

UPDATE doctype_definitions
SET metadata_json = json_set(metadata_json, '$.revision', revision)
WHERE doctype IN ('Sales Order', 'Sales Order Item')
  AND json_valid(metadata_json)
  AND COALESCE(json_extract(metadata_json, '$.revision'), -1) <> revision;
