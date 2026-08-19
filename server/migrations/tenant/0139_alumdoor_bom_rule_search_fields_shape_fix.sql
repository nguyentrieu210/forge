-- Repair BOM Rule metadata created by 0134.
-- Canonical Forge DocType metadata stores search_fields as an array. The Frappe
-- facade converts that array to a comma-separated string only on the wire.
--
-- Keep this as a forward repair rather than rewriting already-applied 0134/0138.

UPDATE doctype_definitions
SET revision = CASE WHEN revision < 4 THEN 4 ELSE revision END,
    metadata_json = json_set(
      json(metadata_json),
      '$.search_fields', json('["rule_code","rule_name","description","source_formula_text"]'),
      '$.revision', 4
    ),
    modified_by = 'migration-0139',
    modified_at = '2026-08-19T08:26:00.000Z'
WHERE doctype = 'BOM Rule'
  AND json_valid(metadata_json)
  AND json_type(metadata_json, '$.search_fields') <> 'array';
