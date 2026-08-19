-- Expose reusable BOM Rule as a first-class Alumdoor manufacturing catalog.
--
-- 0134 created the DocType and dedicated TSX editor, but the installed Alumdoor app manifest
-- still did not contain a navigation entry, so users could only reach the screen by a direct URL.
-- Keep this migration idempotent: repeated local/bootstrap migrations must never duplicate menu rows.

UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.label', 'Quy tắc BOM',
      '$.title_field', 'rule_name',
      '$.search_fields', 'rule_code,rule_name,description,source_formula_text'
    ),
    modified_by = 'migration-0135',
    modified_at = '2026-08-19T07:27:00.000Z'
WHERE doctype = 'BOM Rule'
  AND json_valid(metadata_json);

UPDATE installed_apps
SET manifest_json = json_set(
      manifest_json,
      '$.nav',
      json_insert(
        COALESCE(json_extract(manifest_json, '$.nav'), json('[]')),
        '$[#]',
        json('{"key":"BOM Rule","label":"Quy tắc BOM","kind":"doctype","icon":"list-tree","group":"Sản xuất"}')
      )
    ),
    modified_at = '2026-08-19T07:27:00.000Z'
WHERE app_id = 'alumdoor'
  AND json_valid(manifest_json)
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(COALESCE(json_extract(installed_apps.manifest_json, '$.nav'), json('[]')))
    WHERE json_extract(value, '$.key') = 'BOM Rule'
  );
