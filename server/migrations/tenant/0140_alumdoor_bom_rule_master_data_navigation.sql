-- Align BOM Rule navigation group with Alumdoor master data catalog.
--
-- BOM Rule is an engineering master catalog entity (analogous to Cutting Policy).
-- Moving its navigation group to 'Danh mục' ensures it is routed to /master-data
-- and exposed in AlumdoorMasterDataScreen under "Bán hàng & sản xuất".

UPDATE installed_apps
SET manifest_json = (
      SELECT json_set(
        installed_apps.manifest_json,
        '$.nav[' || json_each.key || '].group',
        'Danh mục'
      )
      FROM json_each(installed_apps.manifest_json, '$.nav')
      WHERE json_extract(value, '$.key') = 'BOM Rule'
    ),
    modified_at = '2026-08-19T08:35:00.000Z'
WHERE app_id = 'alumdoor'
  AND json_valid(manifest_json)
  AND EXISTS (
    SELECT 1
    FROM json_each(installed_apps.manifest_json, '$.nav')
    WHERE json_extract(value, '$.key') = 'BOM Rule'
  );

UPDATE installed_apps
SET manifest_json = json_set(
      manifest_json,
      '$.nav',
      json_insert(
        COALESCE(json_extract(manifest_json, '$.nav'), json('[]')),
        '$[#]',
        json('{"key":"BOM Rule","label":"Quy tắc BOM","kind":"doctype","icon":"list-tree","group":"Danh mục"}')
      )
    ),
    modified_at = '2026-08-19T08:35:00.000Z'
WHERE app_id = 'alumdoor'
  AND json_valid(manifest_json)
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(COALESCE(json_extract(installed_apps.manifest_json, '$.nav'), json('[]')))
    WHERE json_extract(value, '$.key') = 'BOM Rule'
  );
