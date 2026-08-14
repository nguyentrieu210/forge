-- Keep selectable Sales Package components out of the Sales Order parent Item picker.
-- They remain enabled sales Items and are priced normally when materialized as child rows.

UPDATE doctype_definitions AS item_meta
SET metadata_json = json_set(
      item_meta.metadata_json,
      '$.fields',
      json((
        SELECT json_group_array(json(field_json))
        FROM (
          SELECT CAST(field.value AS TEXT) AS field_json, CAST(field.key AS INTEGER) AS ordinal
          FROM json_each(item_meta.metadata_json, '$.fields') field
          WHERE json_extract(field.value, '$.fieldname') <> 'is_sales_package_component'
          UNION ALL
          SELECT '{"fieldname":"is_sales_package_component","label":"Món tách của gói bán","fieldtype":"Check","default":0,"read_only":true,"hidden":true,"in_standard_filter":true,"surface":"internal","description":"Mặt hàng được chọn ở dòng Món tách; không gợi ý làm dòng bộ chính trên Sales Order."}', 1000000
          ORDER BY ordinal
        )
      ))
    ),
    revision = revision + 1,
    modified_by = 'migration-0131',
    modified_at = '2026-08-13T00:00:00.000Z'
WHERE item_meta.doctype = 'Item'
  AND json_valid(item_meta.metadata_json)
  AND (
    (SELECT COUNT(*) FROM json_each(item_meta.metadata_json, '$.fields') field
      WHERE json_extract(field.value, '$.fieldname') = 'is_sales_package_component') <> 1
    OR COALESCE((SELECT json_extract(field.value, '$.in_standard_filter')
      FROM json_each(item_meta.metadata_json, '$.fields') field
      WHERE json_extract(field.value, '$.fieldname') = 'is_sales_package_component'
      LIMIT 1), 0) <> 1
  );

-- Materialize the exact role on every Item so equality filters are deterministic for legacy
-- rows. Re-running the migration does not bump unchanged documents.
UPDATE documents AS item
SET payload_json = json_set(
      item.payload_json,
      '$.is_sales_package_component',
      json(CASE WHEN EXISTS (
        SELECT 1
        FROM documents package,
             json_each(package.payload_json, '$.items') component
        WHERE package.tenant_id = item.tenant_id
          AND package.doctype = 'Sales Package'
          AND json_extract(package.payload_json, '$.selection_mode') = 'SELECTABLE'
          AND json_extract(component.value, '$.item_code') = json_extract(item.payload_json, '$.item_code')
      ) THEN 'true' ELSE 'false' END)
    ),
    version = item.version + 1,
    modified_by = 'migration-0131',
    modified_at = '2026-08-13T00:00:00.000Z'
WHERE item.doctype = 'Item'
  AND (json_type(item.payload_json, '$.is_sales_package_component') IS NULL
    OR COALESCE(json_extract(item.payload_json, '$.is_sales_package_component'), 0) <> CASE WHEN EXISTS (
    SELECT 1
    FROM documents package,
         json_each(package.payload_json, '$.items') component
    WHERE package.tenant_id = item.tenant_id
      AND package.doctype = 'Sales Package'
      AND json_extract(package.payload_json, '$.selection_mode') = 'SELECTABLE'
      AND json_extract(component.value, '$.item_code') = json_extract(item.payload_json, '$.item_code')
  ) THEN 1 ELSE 0 END);

UPDATE doctype_definitions
SET metadata_json = json_set(metadata_json, '$.revision', revision)
WHERE doctype = 'Item'
  AND json_valid(metadata_json)
  AND COALESCE(json_extract(metadata_json, '$.revision'), -1) <> revision;
