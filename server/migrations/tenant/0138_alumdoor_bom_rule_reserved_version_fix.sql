-- Repair BOM Rule metadata created by 0134.
-- `version` is a reserved Frappe/Forge document field name; reusable BOM Rule
-- revisions use `rule_version` instead. Keep BOM Item.bom_rule_version unchanged.

UPDATE doctype_definitions
SET revision = CASE WHEN revision < 3 THEN 3 ELSE revision END,
    metadata_json = json_set(
      json(replace(metadata_json, '"fieldname":"version"', '"fieldname":"rule_version"')),
      '$.revision',
      3
    ),
    modified_by = 'migration-0138',
    modified_at = '2026-08-19T08:16:00.000Z'
WHERE doctype = 'BOM Rule'
  AND json_valid(metadata_json)
  AND instr(metadata_json, '"fieldname":"version"') > 0;
