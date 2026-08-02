-- Allow Employee users to open the Salary Slip list without granting broad payroll read.
-- Salary Slips are normally owned by Payroll, so the owner-only grant returns an empty
-- list until 0044/0045 has created exact read-only document shares for that employee.

UPDATE doctype_definitions
SET
  metadata_json = json_set(
    metadata_json,
    '$.revision', revision + 1,
    '$.permissions', json_insert(
      COALESCE(json_extract(metadata_json,'$.permissions'), json('[]')),
      '$[#]',
      json_object('role','Employee','read',json('true'),'if_owner',json('true'))
    )
  ),
  revision = revision + 1,
  modified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE doctype='Salary Slip'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(COALESCE(json_extract(doctype_definitions.metadata_json,'$.permissions'), json('[]'))) p
    WHERE json_extract(p.value,'$.role')='Employee'
      AND COALESCE(json_extract(p.value,'$.read'),0)=1
      AND COALESCE(json_extract(p.value,'$.if_owner'),0)=1
  );
