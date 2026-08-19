-- Align BOM Rule navigation group and standard permissions with Alumdoor master data catalog.
--
-- BOM Rule is an engineering master catalog entity (analogous to Cutting Policy).
-- 1. Grant standard read/write permissions so permittedNav and read gates expose the master.
-- 2. Moving its navigation group to 'Danh mục' ensures it is routed to /master-data
--    and exposed in AlumdoorMasterDataScreen under "Bán hàng & sản xuất".

UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.permissions',
      json('[{"role":"System Manager","read":true,"write":true,"create":true,"delete":false,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":true,"export":true,"share":true,"permlevel":0},{"role":"Chủ xưởng","read":true,"write":true,"create":true,"delete":false,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":true,"create":true,"delete":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"delete":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"delete":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"permlevel":0},{"role":"Manufacturing Manager","read":true,"write":true,"create":true,"print":true,"email":true,"report":true,"import":true,"export":true,"share":true,"submit":true,"cancel":true,"permlevel":0},{"role":"Manufacturing User","read":true,"write":true,"create":true,"print":true,"email":true,"report":true,"import":true,"export":true,"share":true,"submit":false,"cancel":false,"permlevel":0}]')
    ),
    modified_by = 'migration-0140',
    modified_at = '2026-08-19T08:35:00.000Z'
WHERE doctype = 'BOM Rule'
  AND json_valid(metadata_json);

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
