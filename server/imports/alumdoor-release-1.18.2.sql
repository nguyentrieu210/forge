-- Alumdoor data release metadata 1.18.2.
-- No DocType shape changes: version/hash follow the verified master-data migration.

UPDATE installed_apps
SET version='1.18.2',
    content_hash='b49ebf7b59a6bfcef4f0d985ff4d33ea287255a1e02cd97c995962f494ca3760',
    manifest_json=json_set(manifest_json,'$.version','1.18.2'),
    modified_at='2026-07-28T14:45:00.000Z'
WHERE tenant_id='alu'
  AND app_id='alumdoor'
  AND version IN ('1.18.1', '1.18.2');
