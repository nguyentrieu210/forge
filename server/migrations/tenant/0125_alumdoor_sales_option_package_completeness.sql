-- Complete Alumdoor operator-facing Sales Options and full-set fulfillment packages.
--
-- The current catalogue still contains explicit full-set and split-item SKUs. Until those
-- historical SKUs are consolidated, this migration maps their existing commercial meaning
-- without inventing prices or copying manufacturing BOM rows into Sales Package.

-- Broad prototype options cannot distinguish the explicit full-set/split SKUs and previously
-- produced contradictory choices. Keep the non-German prototypes out of resolution.
UPDATE documents
SET payload_json = json_set(payload_json, '$.disabled', json('true')),
    version = version + 1,
    modified_at = '2026-08-13T00:00:00.000Z',
    modified_by = 'migration-0125'
WHERE doctype = 'Sales Option'
  AND name IN (
    'UC-KEO-TAY', 'UC-MOTOR-NGOAI',
    'DL-TACH-MON', 'DL-TRON-BO',
    'LUOI-CHUA-PHU-KIEN', 'LUOI-CO-PHU-KIEN'
  );

-- Cửa Đức has two group-level commercial choices. Price remains Item-specific, therefore
-- the UI only exposes WITH_RAIL when that selected Item has an active matching Item Price.
-- Package composition uses $SOURCE_ITEM so one shared definition can freeze the actual door
-- Item beside the common gift rail without duplicating Option/Package masters per SKU.
DELETE FROM document_search
WHERE doctype = 'Sales Option'
  AND name IN (
    SELECT name FROM documents
    WHERE doctype = 'Sales Option'
      AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
      AND json_extract(payload_json, '$.item_code') IS NOT NULL
      AND json_extract(payload_json, '$.price_variant') = 'WITH_RAIL'
  );

DELETE FROM documents
WHERE doctype = 'Sales Option'
  AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
  AND json_extract(payload_json, '$.item_code') IS NOT NULL
  AND json_extract(payload_json, '$.price_variant') = 'WITH_RAIL';

DELETE FROM document_search
WHERE doctype = 'Sales Package'
  AND name IN (
    SELECT name FROM documents
    WHERE doctype = 'Sales Package'
      AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
      AND json_extract(payload_json, '$.item_code') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM json_each(documents.payload_json, '$.items') component
        WHERE json_extract(component.value, '$.item_code') = 'PK_TANGRAY'
      )
  );

DELETE FROM documents
WHERE doctype = 'Sales Package'
  AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
  AND json_extract(payload_json, '$.item_code') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM json_each(documents.payload_json, '$.items') component
    WHERE json_extract(component.value, '$.item_code') = 'PK_TANGRAY'
  );

-- Remove group masters accidentally seeded into tenants that do not own any German-door Item.
DELETE FROM document_search
WHERE doctype IN ('Sales Option', 'Sales Package')
  AND name IN ('DUC-CHI-LA', 'DUC-TANG-RAY', 'PKG-DUC-TANG-RAY')
  AND NOT EXISTS (
    SELECT 1 FROM documents item
    WHERE item.tenant_id = document_search.tenant_id
      AND item.doctype = 'Item'
      AND json_extract(item.payload_json, '$.item_group') = 'Cửa CN Đức'
  );

DELETE FROM documents
WHERE doctype IN ('Sales Option', 'Sales Package')
  AND name IN ('DUC-CHI-LA', 'DUC-TANG-RAY', 'PKG-DUC-TANG-RAY')
  AND NOT EXISTS (
    SELECT 1 FROM documents item
    WHERE item.tenant_id = documents.tenant_id
      AND item.doctype = 'Item'
      AND json_extract(item.payload_json, '$.item_group') = 'Cửa CN Đức'
  );

INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:DUC-CHI-LA',
  'Sales Option',
  'DUC-CHI-LA',
  'migration-0125',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0125',
  json_object(
    'option_code', 'DUC-CHI-LA',
    'option_label', 'Chỉ lá',
    'item_group', 'Cửa CN Đức',
    'price_variant', 'STANDARD',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', 'Chỉ lá',
    'is_default', json('true'),
    'priority', 100,
    'disabled', json('false'),
    '_seed_source', 'migration-0125-german-group-option'
  )
FROM (
  SELECT DISTINCT tenant_id FROM documents
  WHERE doctype = 'Item' AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
) tenant_scope
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Package:PKG-DUC-TANG-RAY',
  'Sales Package',
  'PKG-DUC-TANG-RAY',
  'migration-0125',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0125',
  json_object(
    'package_code', 'PKG-DUC-TANG-RAY',
    'package_name', 'Cửa Đức – Tặng ray từ 8 m²',
    'item_group', 'Cửa CN Đức',
    'selection_mode', 'ALL',
    'valid_from', '2026-07-31',
    'items', json_array(
      json_object(
        'component_key', 'DOOR',
        'item_code', '$SOURCE_ITEM',
        'uom', 'm2',
        'qty_basis', 'AREA',
        'factor', 1,
        'required', json('true'),
        'default_selected', json('true'),
        'role', 'Mặt hàng cửa trên dòng đơn hàng'
      ),
      json_object(
        'component_key', 'GIFT_RAIL',
        'item_code', 'PK_TANGRAY',
        'uom', 'Mét',
        'qty_basis', 'HEIGHT',
        'factor', 2,
        'required', json('true'),
        'default_selected', json('true'),
        'role', 'Ray tặng, hai bên theo chiều cao'
      )
    ),
    'disabled', json('false'),
    '_seed_source', 'migration-0125-german-group-option'
  )
FROM (
  SELECT DISTINCT tenant_id FROM documents
  WHERE doctype = 'Item' AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
) tenant_scope
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:DUC-TANG-RAY',
  'Sales Option',
  'DUC-TANG-RAY',
  'migration-0125',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0125',
  json_object(
    'option_code', 'DUC-TANG-RAY',
    'option_label', 'Tặng ray từ 8 m²',
    'item_group', 'Cửa CN Đức',
    'conditions', json_array(json_object('field', 'billable_area_sqm', 'op', 'gte', 'value', 8)),
    'price_variant', 'WITH_RAIL',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', 'Tặng ray',
    'sales_package', 'PKG-DUC-TANG-RAY',
    'is_default', json('false'),
    'priority', 90,
    'disabled', json('false'),
    '_seed_source', 'migration-0125-german-group-option'
  )
FROM (
  SELECT DISTINCT tenant_id FROM documents
  WHERE doctype = 'Item' AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
) tenant_scope
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT tenant_id, 'Sales Option', 'DUC-CHI-LA',
  'Chỉ lá',
  'Cửa CN Đức; STANDARD; cách bán mặc định',
  '2026-08-13T00:00:00.000Z'
FROM (
  SELECT DISTINCT tenant_id FROM documents
  WHERE doctype = 'Item' AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
) tenant_scope
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;

INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT tenant_id, 'Sales Package', 'PKG-DUC-TANG-RAY',
  'Cửa Đức – Tặng ray từ 8 m²',
  'Cửa CN Đức; mặt hàng nguồn; PK_TANGRAY; tặng ray từ 8 m²',
  '2026-08-13T00:00:00.000Z'
FROM (
  SELECT DISTINCT tenant_id FROM documents
  WHERE doctype = 'Item' AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
) tenant_scope
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;

INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT tenant_id, 'Sales Option', 'DUC-TANG-RAY',
  'Tặng ray từ 8 m²',
  'Cửa CN Đức; WITH_RAIL; chiết khấu theo STANDARD; PKG-DUC-TANG-RAY',
  '2026-08-13T00:00:00.000Z'
FROM (
  SELECT DISTINCT tenant_id FROM documents
  WHERE doctype = 'Item' AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
) tenant_scope
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;

-- Full-set SKUs proven by the source catalogue:
--   * Australian finished doors (the 31/07/2026 sheet says the rate includes finishing parts),
--   * Taiwan-door SKUs whose canonical name explicitly says TRỌN BỘ,
--   * mesh-door SKUs whose canonical name explicitly says TRỌN BỘ.
-- The package contains the full-set stock Item itself. Component consumption remains BOM-owned;
-- separately sold rail/shaft/motor/accessories remain ordinary Sales Order lines.
WITH full_set_items AS (
  SELECT
    tenant_id,
    json_extract(payload_json, '$.item_code') AS item_code,
    json_extract(payload_json, '$.item_name') AS item_name,
    json_extract(payload_json, '$.item_group') AS item_group,
    json_extract(payload_json, '$.stock_uom') AS uom
  FROM documents
  WHERE doctype = 'Item'
    AND COALESCE(json_extract(payload_json, '$.disabled'), 0) = 0
    AND COALESCE(json_extract(payload_json, '$.is_sales_item'), 0) = 1
    AND (
      (
        json_extract(payload_json, '$.item_group') = 'Cửa tấm liền Úc'
        AND json_extract(payload_json, '$.material_stage') = 'Thành phẩm'
        AND upper(json_extract(payload_json, '$.item_name')) LIKE 'CỬA ÚC%'
      )
      OR (
        json_extract(payload_json, '$.item_group') IN ('Cửa Đài Loan', 'Cửa Lưới')
        AND upper(json_extract(payload_json, '$.item_name')) LIKE '%TRỌN BỘ%'
      )
    )
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Package:PKG-FULL:' || item_code,
  'Sales Package',
  'PKG-FULL:' || item_code,
  'migration-0125',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0125',
  json_object(
    'package_code', 'PKG-FULL:' || item_code,
    'package_name', item_name || ' – Trọn bộ',
    'item_code', item_code,
    'item_group', item_group,
    'selection_mode', 'ALL',
    'valid_from', '2026-07-31',
    'items', json_array(json_object(
      'component_key', 'FULL_SET',
      'item_code', item_code,
      'uom', uom,
      'qty_basis', CASE WHEN lower(uom) = 'm2' THEN 'AREA' ELSE 'SET_COUNT' END,
      'factor', 1,
      'required', json('true'),
      'default_selected', json('true'),
      'role', 'Mặt hàng trọn bộ theo SKU hiện hành'
    )),
    'disabled', json('false'),
    '_seed_source', 'migration-0125-catalogue-audit'
  )
FROM full_set_items
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

WITH full_set_items AS (
  SELECT
    tenant_id,
    json_extract(payload_json, '$.item_code') AS item_code,
    json_extract(payload_json, '$.item_name') AS item_name
  FROM documents
  WHERE doctype = 'Item'
    AND COALESCE(json_extract(payload_json, '$.disabled'), 0) = 0
    AND COALESCE(json_extract(payload_json, '$.is_sales_item'), 0) = 1
    AND (
      (
        json_extract(payload_json, '$.item_group') = 'Cửa tấm liền Úc'
        AND json_extract(payload_json, '$.material_stage') = 'Thành phẩm'
        AND upper(json_extract(payload_json, '$.item_name')) LIKE 'CỬA ÚC%'
      )
      OR (
        json_extract(payload_json, '$.item_group') IN ('Cửa Đài Loan', 'Cửa Lưới')
        AND upper(json_extract(payload_json, '$.item_name')) LIKE '%TRỌN BỘ%'
      )
    )
)
INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT
  tenant_id,
  'Sales Package',
  'PKG-FULL:' || item_code,
  item_name || ' – Trọn bộ',
  item_code || '; Trọn bộ; gói giao theo SKU hiện hành',
  '2026-08-13T00:00:00.000Z'
FROM full_set_items
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;

-- One deterministic full-set option per full-set Item. STANDARD is intentional because the
-- current catalogue stores full-set prices on those explicit SKUs rather than a FULL_SET variant.
WITH full_set_items AS (
  SELECT
    tenant_id,
    json_extract(payload_json, '$.item_code') AS item_code,
    json_extract(payload_json, '$.item_name') AS item_name,
    json_extract(payload_json, '$.item_group') AS item_group
  FROM documents
  WHERE doctype = 'Item'
    AND COALESCE(json_extract(payload_json, '$.disabled'), 0) = 0
    AND COALESCE(json_extract(payload_json, '$.is_sales_item'), 0) = 1
    AND (
      (
        json_extract(payload_json, '$.item_group') = 'Cửa tấm liền Úc'
        AND json_extract(payload_json, '$.material_stage') = 'Thành phẩm'
        AND upper(json_extract(payload_json, '$.item_name')) LIKE 'CỬA ÚC%'
      )
      OR (
        json_extract(payload_json, '$.item_group') IN ('Cửa Đài Loan', 'Cửa Lưới')
        AND upper(json_extract(payload_json, '$.item_name')) LIKE '%TRỌN BỘ%'
      )
    )
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:FULL:' || item_code,
  'Sales Option',
  'FULL:' || item_code,
  'migration-0125',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0125',
  json_object(
    'option_code', 'FULL:' || item_code,
    'option_label', 'Trọn bộ',
    'item_code', item_code,
    'item_group', item_group,
    'price_variant', 'STANDARD',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', 'Trọn bộ',
    'sales_package', 'PKG-FULL:' || item_code,
    'is_default', json('true'),
    'priority', 100,
    'disabled', json('false'),
    '_seed_source', 'migration-0125-catalogue-audit'
  )
FROM full_set_items
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

WITH full_set_items AS (
  SELECT
    tenant_id,
    json_extract(payload_json, '$.item_code') AS item_code,
    json_extract(payload_json, '$.item_name') AS item_name
  FROM documents
  WHERE doctype = 'Item'
    AND COALESCE(json_extract(payload_json, '$.disabled'), 0) = 0
    AND COALESCE(json_extract(payload_json, '$.is_sales_item'), 0) = 1
    AND (
      (
        json_extract(payload_json, '$.item_group') = 'Cửa tấm liền Úc'
        AND json_extract(payload_json, '$.material_stage') = 'Thành phẩm'
        AND upper(json_extract(payload_json, '$.item_name')) LIKE 'CỬA ÚC%'
      )
      OR (
        json_extract(payload_json, '$.item_group') IN ('Cửa Đài Loan', 'Cửa Lưới')
        AND upper(json_extract(payload_json, '$.item_name')) LIKE '%TRỌN BỘ%'
      )
    )
)
INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT
  tenant_id,
  'Sales Option',
  'FULL:' || item_code,
  'Trọn bộ – ' || item_name,
  item_code || '; Trọn bộ; STANDARD; PKG-FULL:' || item_code,
  '2026-08-13T00:00:00.000Z'
FROM full_set_items
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;

-- Split-item SKUs are priced and fulfilled independently, therefore they must never select a
-- full-set package. This covers explicit Taiwan/mesh split SKUs and the current super-long leaf
-- catalogue, whose source price sheet lists accessories separately.
WITH split_items AS (
  SELECT
    tenant_id,
    json_extract(payload_json, '$.item_code') AS item_code,
    json_extract(payload_json, '$.item_name') AS item_name,
    json_extract(payload_json, '$.item_group') AS item_group
  FROM documents item
  WHERE doctype = 'Item'
    AND COALESCE(json_extract(payload_json, '$.disabled'), 0) = 0
    AND COALESCE(json_extract(payload_json, '$.is_sales_item'), 0) = 1
    AND EXISTS (
      SELECT 1 FROM documents price
      WHERE price.tenant_id = item.tenant_id
        AND price.doctype = 'Item Price'
        AND json_extract(price.payload_json, '$.item_code') = json_extract(item.payload_json, '$.item_code')
        AND COALESCE(json_extract(price.payload_json, '$.disabled'), 0) = 0
    )
    AND (
      (
        json_extract(payload_json, '$.item_group') IN ('Cửa Đài Loan', 'Cửa Đài Loan Inox')
        AND upper(json_extract(payload_json, '$.item_name')) NOT LIKE '%TRỌN BỘ%'
      )
      OR (
        json_extract(payload_json, '$.item_group') = 'Cửa Lưới'
        AND upper(json_extract(payload_json, '$.item_name')) LIKE '%TÁCH MÓN%'
      )
      OR json_extract(payload_json, '$.item_group') = 'Cửa siêu trường'
    )
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_id,
  'Sales Option:SPLIT:' || item_code,
  'Sales Option',
  'SPLIT:' || item_code,
  'migration-0125',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0125',
  json_object(
    'option_code', 'SPLIT:' || item_code,
    'option_label', 'Tách món',
    'item_code', item_code,
    'item_group', item_group,
    'price_variant', 'STANDARD',
    'discount_basis_variant', 'STANDARD',
    'sales_mode', 'Tách món',
    'is_default', json('true'),
    'priority', 100,
    'disabled', json('false'),
    '_seed_source', 'migration-0125-catalogue-audit'
  )
FROM split_items
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

WITH split_items AS (
  SELECT
    tenant_id,
    json_extract(payload_json, '$.item_code') AS item_code,
    json_extract(payload_json, '$.item_name') AS item_name
  FROM documents item
  WHERE doctype = 'Item'
    AND COALESCE(json_extract(payload_json, '$.disabled'), 0) = 0
    AND COALESCE(json_extract(payload_json, '$.is_sales_item'), 0) = 1
    AND EXISTS (
      SELECT 1 FROM documents price
      WHERE price.tenant_id = item.tenant_id
        AND price.doctype = 'Item Price'
        AND json_extract(price.payload_json, '$.item_code') = json_extract(item.payload_json, '$.item_code')
        AND COALESCE(json_extract(price.payload_json, '$.disabled'), 0) = 0
    )
    AND (
      (
        json_extract(payload_json, '$.item_group') IN ('Cửa Đài Loan', 'Cửa Đài Loan Inox')
        AND upper(json_extract(payload_json, '$.item_name')) NOT LIKE '%TRỌN BỘ%'
      )
      OR (
        json_extract(payload_json, '$.item_group') = 'Cửa Lưới'
        AND upper(json_extract(payload_json, '$.item_name')) LIKE '%TÁCH MÓN%'
      )
      OR json_extract(payload_json, '$.item_group') = 'Cửa siêu trường'
    )
)
INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT
  tenant_id,
  'Sales Option',
  'SPLIT:' || item_code,
  'Tách món – ' || item_name,
  item_code || '; Tách món; STANDARD; không bung gói',
  '2026-08-13T00:00:00.000Z'
FROM split_items
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;
