-- WS01 Finance Budget permission alignment.
-- Purchase Manager may create/submit commitments from procurement, but cancellation
-- is a finance-control action and the authoritative controller restricts it to
-- accounting approvers. Keep metadata/UI aligned with server enforcement.

UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      (SELECT p.fullkey || '.cancel'
       FROM json_each(metadata_json,'$.permissions') AS p
       WHERE json_extract(p.value,'$.role')='Purchase Manager'
       LIMIT 1),
      json('false')
    ),
    revision=revision+1,
    modified_by='migration',
    modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='Finance Budget Commitment'
  AND EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.permissions') AS p
    WHERE json_extract(p.value,'$.role')='Purchase Manager'
      AND COALESCE(CAST(json_extract(p.value,'$.cancel') AS INTEGER),0)=1
  );
