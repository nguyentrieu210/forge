-- Supplier leftovers use canonical Material Transfer with reversed frozen warehouse bindings.
-- This adds metadata only; the transaction controller enforces per-BOM unconsumed balance.
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"subcontracting_material_return","label":"Return Supplier Materials","fieldtype":"Check","default":0}')),
    revision=revision+1, modified_by='migration-0163', modified_at='2026-10-04T00:00:00.000Z'
WHERE doctype='Stock Entry' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='subcontracting_material_return');
UPDATE doctype_definitions
SET metadata_json=json_set(metadata_json,'$.revision',revision)
WHERE doctype='Stock Entry' AND json_valid(metadata_json);
