-- Generic selling price variants and configurable commercial adjustments.
--
-- This migration intentionally contains no AlumDoor product, finish or surcharge values.
-- Vertical apps provide their own Price Variant values and Sales Adjustment Rule records;
-- the shared catalogue owns only the metadata contract and STANDARD compatibility default.

-- Existing Item Price records remain STANDARD without a data rewrite. The runtime treats a
-- missing/blank price_variant exactly as STANDARD; the metadata default applies to new rows.
UPDATE doctype_definitions
SET
  metadata_json = json_set(
    json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"price_variant","label":"Price Variant","fieldtype":"Data","default":"STANDARD","in_list_view":true,"in_standard_filter":true,"description":"Canonical commercial price variant code. Blank legacy records resolve as STANDARD."}')
    ),
    '$.revision',
    revision + 1
  ),
  revision = revision + 1,
  modified_by = 'migration-0117',
  modified_at = '2026-08-11T00:00:00.000Z'
WHERE doctype = 'Item Price'
  AND json_valid(metadata_json)
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(metadata_json, '$.fields') AS field
    WHERE json_extract(field.value, '$.fieldname') = 'price_variant'
  );

-- Sales Adjustment Rule is a reusable Selling master. The runtime reads these records through
-- listMasterRecordData and evaluates them with fixed-point money/quantity arithmetic.
WITH tenants AS (
  SELECT DISTINCT tenant_id FROM doctype_definitions
)
INSERT OR IGNORE INTO doctype_definitions(
  tenant_id, doctype, module, is_custom, is_submittable, is_child, revision,
  metadata_json, disabled, modified_by, modified_at
)
SELECT
  tenant_id,
  'Sales Adjustment Rule',
  'Selling',
  0,
  0,
  0,
  1,
  '{"name":"Sales Adjustment Rule","module":"Selling","is_submittable":false,"is_child":false,"track_changes":true,"revision":1,"autoname":"field:code","title_field":"rule_name","search_fields":["code","rule_name","exclusive_group"],"sort_field":"modified_at","sort_order":"DESC","fields":[{"fieldname":"code","label":"Rule Code","fieldtype":"Data","required":true,"unique":true,"in_list_view":true,"search_index":true},{"fieldname":"rule_name","label":"Rule Name","fieldtype":"Data","required":true,"in_list_view":true,"search_index":true},{"fieldname":"description","label":"Description","fieldtype":"Small Text"},{"fieldname":"currency","label":"Currency","fieldtype":"Link","options":"Currency","required":true,"in_list_view":true,"in_standard_filter":true},{"fieldname":"basis","label":"Calculation Basis","fieldtype":"Select","options":"FIXED\nAREA_SQM\nLENGTH_M\nSET_COUNT","required":true,"in_list_view":true,"in_standard_filter":true},{"fieldname":"rate","label":"Adjustment Rate","fieldtype":"Currency","required":true,"non_negative":true,"in_list_view":true},{"fieldname":"scope","label":"Scope","fieldtype":"Select","options":"LINE\nORDER\nUNRESOLVED","default":"LINE","required":true,"in_standard_filter":true},{"fieldname":"exclusive_group","label":"Exclusive Group","fieldtype":"Data","in_standard_filter":true},{"fieldname":"priority","label":"Priority","fieldtype":"Int","default":0},{"fieldname":"taxable","label":"Taxable","fieldtype":"Check","default":1},{"fieldname":"discountable","label":"Discountable","fieldtype":"Check","default":0},{"fieldname":"valid_from","label":"Valid From","fieldtype":"Date","in_list_view":true,"in_standard_filter":true},{"fieldname":"valid_upto","label":"Valid Upto","fieldtype":"Date"},{"fieldname":"disabled","label":"Disabled","fieldtype":"Check","default":0,"in_list_view":true,"in_standard_filter":true},{"fieldname":"conditions","label":"Conditions","fieldtype":"Table","options":"Sales Adjustment Condition"}],"permissions":[{"role":"Sales Manager","read":true,"write":true,"create":true,"print":true,"email":true,"report":true,"import":true,"export":true,"share":true},{"role":"Sales User","read":true,"write":false,"create":false,"print":true,"email":false,"report":true,"import":false,"export":true,"share":false},{"role":"System Manager","read":true,"write":true,"create":true,"print":true,"email":true,"report":true,"import":true,"export":true,"share":true}],"custom":false}',
  0,
  'migration-0117',
  '2026-08-11T00:00:00.000Z'
FROM tenants;

-- Conditions are data, not controller branches. JSON value fields preserve scalar/array types,
-- so numeric/boolean comparisons do not have to be encoded as strings in business code.
WITH tenants AS (
  SELECT DISTINCT tenant_id FROM doctype_definitions
)
INSERT OR IGNORE INTO doctype_definitions(
  tenant_id, doctype, module, is_custom, is_submittable, is_child, revision,
  metadata_json, disabled, modified_by, modified_at
)
SELECT
  tenant_id,
  'Sales Adjustment Condition',
  'Selling',
  0,
  0,
  1,
  1,
  '{"name":"Sales Adjustment Condition","module":"Selling","is_submittable":false,"is_child":true,"track_changes":false,"revision":1,"fields":[{"fieldname":"field","label":"Fact Field","fieldtype":"Data","required":true,"in_list_view":true},{"fieldname":"operator","label":"Operator","fieldtype":"Select","options":"eq\nneq\nin\nnot_in\nlt\nlte\ngt\ngte","required":true,"in_list_view":true},{"fieldname":"value","label":"Value","fieldtype":"JSON","depends_on":"eval:doc.operator != `in` && doc.operator != `not_in`"},{"fieldname":"values","label":"Values","fieldtype":"JSON","depends_on":"eval:doc.operator == `in` || doc.operator == `not_in`"}],"permissions":[],"custom":false}',
  0,
  'migration-0117',
  '2026-08-11T00:00:00.000Z'
FROM tenants;
