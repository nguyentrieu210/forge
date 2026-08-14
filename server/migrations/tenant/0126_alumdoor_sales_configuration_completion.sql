-- Finish the audited Alumdoor selling configuration without inventing commercial data.
--
-- Full-set SKUs remain Item-specific Sales Options because the catalogue itself distinguishes
-- full-set and split-item SKUs. Their fulfillment shape is identical, so one dynamic package
-- per product family is enough; $SOURCE_ITEM freezes the exact ordered SKU in the snapshot.

-- Remove broad prototypes. They cannot distinguish the historical full-set/split SKUs and are
-- superseded by the deterministic Item-specific options created by migration 0125.
DELETE FROM document_search
WHERE doctype = 'Sales Option'
  AND name IN (
    'UC-KEO-TAY', 'UC-MOTOR-NGOAI',
    'DL-TACH-MON', 'DL-TRON-BO',
    'LUOI-CHUA-PHU-KIEN', 'LUOI-CO-PHU-KIEN'
  );

DELETE FROM documents
WHERE doctype = 'Sales Option'
  AND name IN (
    'UC-KEO-TAY', 'UC-MOTOR-NGOAI',
    'DL-TACH-MON', 'DL-TRON-BO',
    'LUOI-CHUA-PHU-KIEN', 'LUOI-CO-PHU-KIEN'
  );

-- Shared full-set packages. Package means the commercial delivery obligation represented by
-- the explicit full-set SKU. Manufacturing consumption remains BOM-owned.
WITH package_seed(package_code, package_name, item_group) AS (
  VALUES
    ('PKG-UC-FULL', 'Cửa Úc – Trọn bộ', 'Cửa tấm liền Úc'),
    ('PKG-DL-FULL', 'Cửa Đài Loan – Trọn bộ', 'Cửa Đài Loan'),
    ('PKG-LUOI-FULL', 'Cửa lưới – Trọn bộ', 'Cửa Lưới')
), tenant_package AS (
  SELECT DISTINCT option_doc.tenant_id, seed.package_code, seed.package_name, seed.item_group
  FROM package_seed seed
  JOIN documents option_doc
    ON option_doc.doctype = 'Sales Option'
   AND json_extract(option_doc.payload_json, '$.item_group') = seed.item_group
   AND option_doc.name LIKE 'FULL:%'
   AND COALESCE(json_extract(option_doc.payload_json, '$.disabled'), 0) = 0
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Package:' || package_code,
  'Sales Package',
  package_code,
  'migration-0126',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0126',
  json_object(
    'package_code', package_code,
    'package_name', package_name,
    'item_group', item_group,
    'selection_mode', 'ALL',
    'valid_from', '2026-07-31',
    'items', json_array(json_object(
      'component_key', 'FULL_SET',
      'item_code', '$SOURCE_ITEM',
      'uom', 'm2',
      'qty_basis', 'AREA',
      'factor', 1,
      'required', json('true'),
      'default_selected', json('true'),
      'role', 'Mặt hàng trọn bộ trên dòng đơn hàng'
    )),
    'disabled', json('false'),
    '_seed_source', 'migration-0126-shared-full-set-package'
  )
FROM tenant_package
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

WITH package_seed(package_code, package_name, item_group) AS (
  VALUES
    ('PKG-UC-FULL', 'Cửa Úc – Trọn bộ', 'Cửa tấm liền Úc'),
    ('PKG-DL-FULL', 'Cửa Đài Loan – Trọn bộ', 'Cửa Đài Loan'),
    ('PKG-LUOI-FULL', 'Cửa lưới – Trọn bộ', 'Cửa Lưới')
), tenant_package AS (
  SELECT DISTINCT option_doc.tenant_id, seed.package_code, seed.package_name, seed.item_group
  FROM package_seed seed
  JOIN documents option_doc
    ON option_doc.doctype = 'Sales Option'
   AND json_extract(option_doc.payload_json, '$.item_group') = seed.item_group
   AND option_doc.name LIKE 'FULL:%'
   AND COALESCE(json_extract(option_doc.payload_json, '$.disabled'), 0) = 0
)
INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT
  tenant_id,
  'Sales Package',
  package_code,
  package_name,
  item_group || '; trọn bộ; mặt hàng lấy động từ dòng đơn hàng',
  '2026-08-13T00:00:00.000Z'
FROM tenant_package
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;

-- Point every proven full-set Item option at its family package.
UPDATE documents
SET payload_json = json_set(
      payload_json,
      '$.sales_package',
      CASE json_extract(payload_json, '$.item_group')
        WHEN 'Cửa tấm liền Úc' THEN 'PKG-UC-FULL'
        WHEN 'Cửa Đài Loan' THEN 'PKG-DL-FULL'
        WHEN 'Cửa Lưới' THEN 'PKG-LUOI-FULL'
      END,
      '$._seed_source', 'migration-0126-shared-full-set-package'
    ),
    version = version + 1,
    modified_at = '2026-08-13T00:00:00.000Z',
    modified_by = 'migration-0126'
WHERE doctype = 'Sales Option'
  AND name LIKE 'FULL:%'
  AND json_extract(payload_json, '$.item_group') IN ('Cửa tấm liền Úc', 'Cửa Đài Loan', 'Cửa Lưới');

UPDATE document_search
SET content = substr(name, 6) || '; Trọn bộ; STANDARD; ' || (
      SELECT json_extract(option_doc.payload_json, '$.sales_package')
      FROM documents option_doc
      WHERE option_doc.tenant_id = document_search.tenant_id
        AND option_doc.doctype = 'Sales Option'
        AND option_doc.name = document_search.name
    ),
    modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Option'
  AND name LIKE 'FULL:%'
  AND EXISTS (
    SELECT 1 FROM documents option_doc
    WHERE option_doc.tenant_id = document_search.tenant_id
      AND option_doc.doctype = 'Sales Option'
      AND option_doc.name = document_search.name
      AND json_extract(option_doc.payload_json, '$.item_group') IN ('Cửa tấm liền Úc', 'Cửa Đài Loan', 'Cửa Lưới')
  );

-- Item-specific full packages are now redundant.
DELETE FROM document_search
WHERE doctype = 'Sales Package' AND name LIKE 'PKG-FULL:%';

DELETE FROM documents
WHERE doctype = 'Sales Package' AND name LIKE 'PKG-FULL:%';

-- Split-item families never expand a package.
UPDATE documents
SET payload_json = json_remove(payload_json, '$.sales_package'),
    version = version + 1,
    modified_at = '2026-08-13T00:00:00.000Z',
    modified_by = 'migration-0126'
WHERE doctype = 'Sales Option'
  AND name LIKE 'SPLIT:%'
  AND json_extract(payload_json, '$.item_group') IN (
    'Cửa Đài Loan', 'Cửa Đài Loan Inox', 'Cửa Lưới', 'Cửa siêu trường'
  );

-- The two AL70 hand-pull finished products have valid prices but are not full-set catalogue
-- SKUs. Give them an explicit no-package mode so the UI never falls back to a synthetic option.
WITH hand_pull_items AS (
  SELECT
    tenant_id,
    json_extract(payload_json, '$.item_code') AS item_code,
    json_extract(payload_json, '$.item_name') AS item_name,
    json_extract(payload_json, '$.item_group') AS item_group
  FROM documents
  WHERE doctype = 'Item'
    AND COALESCE(json_extract(payload_json, '$.disabled'), 0) = 0
    AND COALESCE(json_extract(payload_json, '$.is_sales_item'), 0) = 1
    AND json_extract(payload_json, '$.item_group') = 'Cửa tấm liền Úc'
    AND upper(json_extract(payload_json, '$.item_name')) LIKE 'CỬA ĐỨC KÉO TAY AL70%'
    AND EXISTS (
      SELECT 1 FROM documents price
      WHERE price.tenant_id = documents.tenant_id
        AND price.doctype = 'Item Price'
        AND json_extract(price.payload_json, '$.item_code') = json_extract(documents.payload_json, '$.item_code')
        AND COALESCE(json_extract(price.payload_json, '$.disabled'), 0) = 0
    )
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:HAND-PULL:' || item_code,
  'Sales Option',
  'HAND-PULL:' || item_code,
  'migration-0126',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0126',
  json_object(
    'option_code', 'HAND-PULL:' || item_code,
    'option_label', 'Kéo tay',
    'item_code', item_code,
    'item_group', item_group,
    'price_variant', 'STANDARD',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', 'Kéo tay',
    'is_default', json('true'),
    'priority', 100,
    'disabled', json('false'),
    '_seed_source', 'migration-0126-australian-group-hand-pull'
  )
FROM hand_pull_items
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

WITH hand_pull_items AS (
  SELECT
    tenant_id,
    json_extract(payload_json, '$.item_code') AS item_code,
    json_extract(payload_json, '$.item_name') AS item_name
  FROM documents
  WHERE doctype = 'Item'
    AND COALESCE(json_extract(payload_json, '$.disabled'), 0) = 0
    AND COALESCE(json_extract(payload_json, '$.is_sales_item'), 0) = 1
    AND json_extract(payload_json, '$.item_group') = 'Cửa tấm liền Úc'
    AND upper(json_extract(payload_json, '$.item_name')) LIKE 'CỬA ĐỨC KÉO TAY AL70%'
)
INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT
  tenant_id,
  'Sales Option',
  'HAND-PULL:' || item_code,
  'Kéo tay – ' || item_name,
  item_code || '; Kéo tay; STANDARD; không bung gói',
  '2026-08-13T00:00:00.000Z'
FROM hand_pull_items
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;

-- The only "Cửa kéo Đài Loan" Item is source-marked as purchased but has neither a sales price
-- nor a verified selling mode. Fail closed: keep it in stock/purchase data, hide it from sales.
UPDATE documents
SET payload_json = json_set(
      payload_json,
      '$.is_sales_item', json('false'),
      '$._sales_configuration_status', 'PRICE_AND_MODE_REQUIRED',
      '$._sales_configuration_note', 'Chưa có giá bán và chưa xác nhận cách bán trong nguồn 31/07/2026'
    ),
    version = version + 1,
    modified_at = '2026-08-13T00:00:00.000Z',
    modified_by = 'migration-0126'
WHERE doctype = 'Item'
  AND json_extract(payload_json, '$.item_code') = 'HH-CUAKEODL'
  AND NOT EXISTS (
    SELECT 1 FROM documents price
    WHERE price.tenant_id = documents.tenant_id
      AND price.doctype = 'Item Price'
      AND json_extract(price.payload_json, '$.item_code') = 'HH-CUAKEODL'
      AND COALESCE(json_extract(price.payload_json, '$.disabled'), 0) = 0
  );

DELETE FROM document_search
WHERE doctype = 'Sales Option'
  AND name IN (
    SELECT option_doc.name
    FROM documents option_doc
    WHERE option_doc.tenant_id = document_search.tenant_id
      AND option_doc.doctype = 'Sales Option'
      AND json_extract(option_doc.payload_json, '$.item_code') = 'HH-CUAKEODL'
  );

DELETE FROM documents
WHERE doctype = 'Sales Option'
  AND json_extract(payload_json, '$.item_code') = 'HH-CUAKEODL';
