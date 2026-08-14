-- Make "Cách bán" a real operator choice for catalogue families whose legacy import used
-- separate Item codes for each commercial mode. Selecting an alternative switches to the
-- correct priced Item; the Sales Order always stores that final Item code.

-- Optional UI navigation fields. The shared server resolver ignores them and continues to
-- validate the final Item + Sales Option + Item Price combination authoritatively.
UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]', json('{"fieldname":"target_item_code","label":"Mặt hàng khi chọn","fieldtype":"Link","options":"Item","description":"Đổi sang đúng mã hàng thương mại khi người dùng chọn cách bán này."}'),
      '$.fields[#]', json('{"fieldname":"target_item_rules","label":"Quy tắc chọn mặt hàng","fieldtype":"JSON","description":"Danh sách mã hàng đích theo bậc diện tích tính giá."}')
    ),
    revision = revision + 1,
    modified_by = 'migration-0127',
    modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Option'
  AND json_valid(metadata_json)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(metadata_json, '$.fields') field
    WHERE json_extract(field.value, '$.fieldname') = 'target_item_code'
  );

UPDATE doctype_definitions
SET metadata_json = json_set(metadata_json, '$.revision', revision)
WHERE doctype = 'Sales Option'
  AND json_valid(metadata_json)
  AND COALESCE(json_extract(metadata_json, '$.revision'), -1) <> revision;

-- Australian doors: the imported KT/MTN Items are two modes of the same thickness family.
UPDATE documents
SET payload_json = json_set(
      payload_json,
      '$.option_label', CASE
        WHEN json_extract(payload_json, '$.item_code') LIKE 'TP-UC KT %' THEN 'Kéo tay'
        ELSE 'Motor ngoài'
      END,
      '$.sales_mode', CASE
        WHEN json_extract(payload_json, '$.item_code') LIKE 'TP-UC KT %' THEN 'Kéo tay'
        ELSE 'Motor ngoài'
      END,
      '$._seed_source', 'migration-0127-real-sales-mode-switch'
    ),
    version = version + 1,
    modified_at = '2026-08-13T00:00:00.000Z',
    modified_by = 'migration-0127'
WHERE doctype = 'Sales Option'
  AND name LIKE 'FULL:%'
  AND json_extract(payload_json, '$.item_group') = 'Cửa tấm liền Úc'
  AND (
    json_extract(payload_json, '$.item_code') LIKE 'TP-UC KT %'
    OR json_extract(payload_json, '$.item_code') LIKE 'TP-UC MTN %'
  );

WITH australian_pairs(left_item, left_label, right_item, right_label) AS (
  VALUES
    ('TP-UC KT 4D', 'Kéo tay', 'TP-UC MTN 4D', 'Motor ngoài'),
    ('TP-UC KT 4.6D', 'Kéo tay', 'TP-UC MTN 4.6D', 'Motor ngoài'),
    ('TP-UC KT 5.5D', 'Kéo tay', 'TP-UC MTN 5.5D', 'Motor ngoài'),
    ('TP-UC KT 6D STĐ MSK', 'Kéo tay', 'TP-UC MTN 6D STD MSK', 'Motor ngoài')
), switches AS (
  SELECT left_item AS source_item, right_item AS target_item, right_label AS target_label FROM australian_pairs
  UNION ALL
  SELECT right_item, left_item, left_label FROM australian_pairs
), tenant_switches AS (
  SELECT source.tenant_id, switches.*
  FROM switches
  JOIN documents source
    ON source.doctype = 'Item'
   AND json_extract(source.payload_json, '$.item_code') = switches.source_item
  JOIN documents target
    ON target.tenant_id = source.tenant_id
   AND target.doctype = 'Item'
   AND json_extract(target.payload_json, '$.item_code') = switches.target_item
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:SWITCH:' || source_item || ':' || target_label,
  'Sales Option',
  'SWITCH:' || source_item || ':' || target_label,
  'migration-0127', 0, 'Draft', 1,
  '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', 'migration-0127',
  json_object(
    'option_code', 'SWITCH:' || source_item || ':' || target_label,
    'option_label', target_label,
    'item_code', source_item,
    'item_group', 'Cửa tấm liền Úc',
    'target_item_code', target_item,
    'price_variant', 'STANDARD',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', target_label,
    'sales_package', 'PKG-UC-FULL',
    'is_default', json('false'),
    'priority', 90,
    'disabled', json('false'),
    '_seed_source', 'migration-0127-real-sales-mode-switch'
  )
FROM tenant_switches
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

-- Mesh doors: pair each full-set SKU with its split-item SKU.
WITH mesh_pairs(full_item, split_item) AS (
  VALUES
    ('TP-LUOIMV-INOX- TRONBO', 'TP-LUOIMV-INOX- TM'),
    ('TP-LUOI-MV-STD - TRONBO', 'TP-LUOI-MV-STD - TM'),
    ('TP-LUOI-SN13x26-STD - TRONBO', 'TP-LUOI-SN13x26-STD - TACHMON'),
    ('TP-LUOI-SN13x26-INOX - TRONBO', 'TP-LUOI-SN13x26-INOX - TACHMON'),
    ('TP-LUOI-SN-STD - TRONBO', 'TP-LUOI-SN-STD - TM'),
    ('TP-LUOI-SNPHI19-INOX - TRONBO', 'TP-LUOI-SNPHI19-INOX - TM')
), switches AS (
  SELECT full_item AS source_item, split_item AS target_item, 'Tách món' AS target_label, NULL AS sales_package FROM mesh_pairs
  UNION ALL
  SELECT split_item, full_item, 'Trọn bộ', 'PKG-LUOI-FULL' FROM mesh_pairs
), tenant_switches AS (
  SELECT source.tenant_id, switches.*
  FROM switches
  JOIN documents source
    ON source.doctype = 'Item'
   AND json_extract(source.payload_json, '$.item_code') = switches.source_item
  JOIN documents target
    ON target.tenant_id = source.tenant_id
   AND target.doctype = 'Item'
   AND json_extract(target.payload_json, '$.item_code') = switches.target_item
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:SWITCH:' || source_item || ':' || target_label,
  'Sales Option',
  'SWITCH:' || source_item || ':' || target_label,
  'migration-0127', 0, 'Draft', 1,
  '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', 'migration-0127',
  json_patch(json_object(
    'option_code', 'SWITCH:' || source_item || ':' || target_label,
    'option_label', target_label,
    'item_code', source_item,
    'item_group', 'Cửa Lưới',
    'target_item_code', target_item,
    'price_variant', 'STANDARD',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', target_label,
    'is_default', json('false'),
    'priority', 90,
    'disabled', json('false'),
    '_seed_source', 'migration-0127-real-sales-mode-switch'
  ), CASE WHEN sales_package IS NULL THEN json('{}') ELSE json_object('sales_package', sales_package) END)
FROM tenant_switches
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

-- Taiwan doors: map every full-set area-tier SKU back to its split base Item.
WITH taiwan_families(split_item, full_prefix) AS (
  VALUES
    ('NVL-TON-DL9.2Dx124-XNVK', 'TP-CUADL1LY '),
    ('NVL-TON-DL5.2Dx124-XNVK', 'TP-CUADL6D '),
    ('NVL-TON-DL6.2Dx124-XNVK', 'TP-CUADL7D '),
    ('NVL-TON-DL7.2Dx124-XNVK', 'TP-CUADL8D '),
    ('TP-TOLEKEM124_1.2LY', 'TP-TOLEKEM124_1LY_TRONBO'),
    ('TP-TOLEKEM124_8D', 'TP-TOLEKEM124_8D_TRONBO'),
    ('TP-TOLEKEM124_6D', 'TP-TOLEKEM124_6D_TRONBO')
), full_to_split AS (
  SELECT full_item.tenant_id,
         json_extract(full_item.payload_json, '$.item_code') AS source_item,
         family.split_item AS target_item
  FROM taiwan_families family
  JOIN documents full_item
    ON full_item.doctype = 'Item'
   AND json_extract(full_item.payload_json, '$.item_group') = 'Cửa Đài Loan'
   AND json_extract(full_item.payload_json, '$.item_code') LIKE family.full_prefix || '%'
  JOIN documents split_item
    ON split_item.tenant_id = full_item.tenant_id
   AND split_item.doctype = 'Item'
   AND json_extract(split_item.payload_json, '$.item_code') = family.split_item
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:SWITCH:' || source_item || ':Tách món',
  'Sales Option',
  'SWITCH:' || source_item || ':Tách món',
  'migration-0127', 0, 'Draft', 1,
  '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', 'migration-0127',
  json_object(
    'option_code', 'SWITCH:' || source_item || ':Tách món',
    'option_label', 'Tách món',
    'item_code', source_item,
    'item_group', 'Cửa Đài Loan',
    'target_item_code', target_item,
    'price_variant', 'STANDARD',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', 'Tách món',
    'is_default', json('false'),
    'priority', 90,
    'disabled', json('false'),
    '_seed_source', 'migration-0127-real-sales-mode-switch'
  )
FROM full_to_split
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

-- The reverse Taiwan switch uses the current billed area to select the correct legacy price tier.
WITH taiwan_families(split_item, full_prefix) AS (
  VALUES
    ('NVL-TON-DL9.2Dx124-XNVK', 'TP-CUADL1LY '),
    ('NVL-TON-DL5.2Dx124-XNVK', 'TP-CUADL6D '),
    ('NVL-TON-DL6.2Dx124-XNVK', 'TP-CUADL7D '),
    ('NVL-TON-DL7.2Dx124-XNVK', 'TP-CUADL8D '),
    ('TP-TOLEKEM124_1.2LY', 'TP-TOLEKEM124_1LY_TRONBO'),
    ('TP-TOLEKEM124_8D', 'TP-TOLEKEM124_8D_TRONBO'),
    ('TP-TOLEKEM124_6D', 'TP-TOLEKEM124_6D_TRONBO')
), tier_rows AS (
  SELECT split_item.tenant_id,
         family.split_item AS source_item,
         json_extract(full_item.payload_json, '$.item_code') AS target_item,
         CASE
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%>10m²%' THEN 10
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_9-10m²%' THEN 9
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_8-9m²%' THEN 8
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_7-8m²%' THEN 7
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_6-7m²%' THEN 6
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_5-6m²%' THEN 5
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_4-5m²%' THEN 4
           ELSE 0
         END AS min_exclusive_area_sqm,
         CASE
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%>10m²%' THEN NULL
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_9-10m²%' THEN 10
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_8-9m²%' THEN 9
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_7-8m²%' THEN 8
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_6-7m²%' THEN 7
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_5-6m²%' THEN 6
           WHEN json_extract(full_item.payload_json, '$.item_code') LIKE '%_4-5m²%' THEN 5
           ELSE 4
         END AS max_inclusive_area_sqm
  FROM taiwan_families family
  JOIN documents split_item
    ON split_item.doctype = 'Item'
   AND json_extract(split_item.payload_json, '$.item_code') = family.split_item
  JOIN documents full_item
    ON full_item.tenant_id = split_item.tenant_id
   AND full_item.doctype = 'Item'
   AND json_extract(full_item.payload_json, '$.item_group') = 'Cửa Đài Loan'
   AND json_extract(full_item.payload_json, '$.item_code') LIKE family.full_prefix || '%'
), tier_maps AS (
  SELECT tenant_id, source_item,
         json_group_array(json_object(
           'item_code', target_item,
           'min_exclusive_area_sqm', min_exclusive_area_sqm,
           'max_inclusive_area_sqm', max_inclusive_area_sqm
         )) AS target_item_rules
  FROM tier_rows
  GROUP BY tenant_id, source_item
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:SWITCH:' || source_item || ':Trọn bộ',
  'Sales Option',
  'SWITCH:' || source_item || ':Trọn bộ',
  'migration-0127', 0, 'Draft', 1,
  '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', 'migration-0127',
  json_object(
    'option_code', 'SWITCH:' || source_item || ':Trọn bộ',
    'option_label', 'Trọn bộ',
    'item_code', source_item,
    'item_group', 'Cửa Đài Loan',
    'target_item_rules', json(target_item_rules),
    'price_variant', 'STANDARD',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', 'Trọn bộ',
    'sales_package', 'PKG-DL-FULL',
    'is_default', json('false'),
    'priority', 90,
    'disabled', json('false'),
    '_seed_source', 'migration-0127-real-sales-mode-switch'
  )
FROM tier_maps
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

-- Search rows for every switch option created above.
INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT
  tenant_id,
  'Sales Option',
  name,
  json_extract(payload_json, '$.option_label'),
  json_extract(payload_json, '$.item_code') || '; ' || json_extract(payload_json, '$.option_label') || '; đổi đúng mã hàng thương mại',
  '2026-08-13T00:00:00.000Z'
FROM documents
WHERE doctype = 'Sales Option'
  AND json_extract(payload_json, '$._seed_source') = 'migration-0127-real-sales-mode-switch'
  AND 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;
