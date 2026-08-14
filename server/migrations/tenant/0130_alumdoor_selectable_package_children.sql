-- Selectable Sales Package children for Alumdoor split-item selling.
-- The parent keeps the standard/full-set Item. Selected components are priced through their
-- own Item Price/Pricing Rule and linked to the parent; no component price is stored in Package.

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"display_label","label":"Tên hiển thị","fieldtype":"Data","in_list_view":true}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Package Item' AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'display_label');

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"sales_option","label":"Chính sách bán của món","fieldtype":"Link","options":"Sales Option","description":"Để trống khi mặt hàng chỉ có một phương án giá hợp lệ."}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Package Item' AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'sales_option');

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"deduct_from_parent","label":"Trừ khỏi giá bộ","fieldtype":"Check","default":1,"description":"Khi tích món, trừ giá gộp hiện hành của món khỏi giá dòng bộ cha."}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Package Item' AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'deduct_from_parent');

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"deduct_from_discount_basis","label":"Trừ khỏi cơ sở chiết khấu","fieldtype":"Check","default":0,"description":"Dùng khi món được tách là một phần của cơ sở chiết khấu của dòng bộ."}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Package Item' AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'deduct_from_discount_basis');

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"inherit_color","label":"Theo màu dòng bộ","fieldtype":"Check","default":0}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Package Item' AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'inherit_color');

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"inherit_dimensions","label":"Theo kích thước dòng bộ","fieldtype":"Check","default":0}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Package Item' AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'inherit_dimensions');

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"inherit_set_count","label":"Theo số bộ dòng bộ","fieldtype":"Check","default":0}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype = 'Sales Package Item' AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'inherit_set_count');

-- Stable parent/child provenance and frozen allocation amounts on commercial lines.
UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"sales_package_group_key","label":"Khóa dòng bộ","fieldtype":"Data","read_only":true,"hidden":true,"surface":"internal"}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype IN ('Quotation Item', 'Sales Order Item', 'Sales Invoice Item') AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'sales_package_group_key');

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"sales_package_parent_key","label":"Khóa dòng bộ cha","fieldtype":"Data","read_only":true,"hidden":true,"surface":"internal"}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype IN ('Quotation Item', 'Sales Order Item', 'Sales Invoice Item') AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'sales_package_parent_key');

UPDATE doctype_definitions
SET metadata_json = json_insert(metadata_json, '$.fields[#]', json('{"fieldname":"sales_package_component_key","label":"Mã món trong gói","fieldtype":"Data","read_only":true,"hidden":true,"surface":"internal"}')),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype IN ('Quotation Item', 'Sales Order Item', 'Sales Invoice Item') AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'sales_package_component_key');

UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]', json('{"fieldname":"sales_package_full_set_amount","label":"Giá bộ trước khi tách","fieldtype":"Currency","read_only":true,"hidden":true,"surface":"internal"}'),
      '$.fields[#]', json('{"fieldname":"sales_package_component_deduction","label":"Giá món đã tách","fieldtype":"Currency","read_only":true,"hidden":true,"surface":"internal"}')
    ),
    revision = revision + 1, modified_by = 'migration-0130', modified_at = '2026-08-13T00:00:00.000Z'
WHERE doctype IN ('Quotation Item', 'Sales Order Item', 'Sales Invoice Item') AND json_valid(metadata_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(metadata_json, '$.fields') f WHERE json_extract(f.value, '$.fieldname') = 'sales_package_full_set_amount');

-- Materialize one selectable package from every proven legacy full-set -> split SKU bridge.
-- More components can be added to the same Package by master data without changing runtime code.
WITH split_sources AS (
  SELECT option_doc.tenant_id,
         option_doc.name AS option_name,
         json_extract(option_doc.payload_json, '$.item_code') AS source_item,
         json_extract(option_doc.payload_json, '$.target_item_code') AS target_item,
         'PKG-SPLIT:' || json_extract(option_doc.payload_json, '$.item_code') AS package_name
  FROM documents option_doc
  WHERE option_doc.doctype = 'Sales Option'
    AND lower(json_extract(option_doc.payload_json, '$.sales_mode')) = lower('Tách món')
    AND COALESCE(json_extract(option_doc.payload_json, '$.target_item_code'), '') <> ''
), package_rows AS (
  SELECT source.tenant_id, source.option_name, source.source_item, source.target_item, source.package_name,
         COALESCE(json_extract(target.payload_json, '$.default_sales_uom'), json_extract(target.payload_json, '$.stock_uom')) AS target_uom,
         COALESCE(json_extract(target.payload_json, '$.item_name'), source.target_item) AS target_label,
         (
           SELECT child_option.name
           FROM documents child_option
           WHERE child_option.tenant_id = source.tenant_id
             AND child_option.doctype = 'Sales Option'
             AND json_extract(child_option.payload_json, '$.item_code') = source.target_item
             AND lower(json_extract(child_option.payload_json, '$.sales_mode')) = lower('Tách món')
             AND COALESCE(json_extract(child_option.payload_json, '$.disabled'), 0) NOT IN (1, '1', 'true')
           ORDER BY COALESCE(json_extract(child_option.payload_json, '$.priority'), 0) DESC, child_option.name
           LIMIT 1
         ) AS child_sales_option
  FROM split_sources source
  JOIN documents target
    ON target.tenant_id = source.tenant_id
   AND target.doctype = 'Item'
   AND json_extract(target.payload_json, '$.item_code') = source.target_item
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT tenant_id,
       'Sales Package:' || package_name,
       'Sales Package', package_name, 'migration-0130', 0, 'Draft', 1,
       '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', 'migration-0130',
       json_object(
         'package_code', package_name,
         'package_name', 'Tách món · ' || source_item,
         'item_code', source_item,
         'selection_mode', 'SELECTABLE',
         'disabled', json('false'),
         'items', json_array(json_object(
           'component_key', 'SPLIT-MAIN',
           'display_label', target_label,
           'item_code', target_item,
           'uom', target_uom,
           'qty_basis', CASE WHEN lower(replace(target_uom, '²', '2')) IN ('m2', 'sqm') THEN 'AREA' ELSE 'SET_COUNT' END,
           'factor', 1,
           'required', json('false'),
           'default_selected', json('false'),
           'deduct_from_parent', json('true'),
           'deduct_from_discount_basis', json('true'),
           'inherit_color', json('true'),
           'inherit_dimensions', json('true'),
           'inherit_set_count', json('true'),
           'sales_option', child_sales_option,
           'role', 'Món tách'
         )),
         '_seed_source', 'migration-0130-selectable-package-children'
       )
FROM package_rows
WHERE target_uom IS NOT NULL AND target_uom <> ''
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  version = documents.version + 1,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by;

-- Sales Option now selects the package; target_item_code is no longer a UI navigation command.
UPDATE documents
SET payload_json = json_remove(
      json_set(
        payload_json,
        '$.sales_package', 'PKG-SPLIT:' || json_extract(payload_json, '$.item_code'),
        '$._seed_source', 'migration-0130-selectable-package-children'
      ),
      '$.target_item_code'
    ),
    version = version + 1,
    modified_at = '2026-08-13T00:00:00.000Z',
    modified_by = 'migration-0130'
WHERE doctype = 'Sales Option'
  AND lower(json_extract(payload_json, '$.sales_mode')) = lower('Tách món')
  AND COALESCE(json_extract(payload_json, '$.target_item_code'), '') <> '';

INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT tenant_id, 'Sales Package', name,
       json_extract(payload_json, '$.package_name'),
       json_extract(payload_json, '$.item_code') || '; tách món; chọn component theo gói',
       '2026-08-13T00:00:00.000Z'
FROM documents
WHERE doctype = 'Sales Package'
  AND json_extract(payload_json, '$._seed_source') = 'migration-0130-selectable-package-children'
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title, content = excluded.content, modified_at = excluded.modified_at;

UPDATE doctype_definitions
SET metadata_json = json_set(metadata_json, '$.revision', revision)
WHERE doctype IN ('Sales Package Item', 'Quotation Item', 'Sales Order Item', 'Sales Invoice Item')
  AND json_valid(metadata_json)
  AND COALESCE(json_extract(metadata_json, '$.revision'), -1) <> revision;
