-- Account documents are canonical overrides, including cancelled tombstones.
-- Never revive a stale imported account as active posting/close authority.
DROP VIEW IF EXISTS finance_active_accounts;
CREATE VIEW finance_active_accounts AS
SELECT
  d.tenant_id,
  d.name,
  json_extract(d.payload_json,'$.company') AS company,
  json_extract(d.payload_json,'$.root_type') AS root_type,
  CASE WHEN lower(trim(CAST(json_extract(d.payload_json,'$.is_group') AS TEXT)))='true' THEN 1
    ELSE COALESCE(CAST(json_extract(d.payload_json,'$.is_group') AS INTEGER),0) END AS is_group
FROM documents d
WHERE d.doctype='Account'
  AND d.docstatus<>2
  AND COALESCE(CAST(json_extract(d.payload_json,'$.disabled') AS INTEGER),0)=0
  AND COALESCE(lower(trim(CAST(json_extract(d.payload_json,'$.disabled') AS TEXT))),'')<>'true'

UNION ALL

SELECT
  m.tenant_id,
  m.name,
  json_extract(m.data_json,'$.company') AS company,
  json_extract(m.data_json,'$.root_type') AS root_type,
  CASE WHEN lower(trim(CAST(json_extract(m.data_json,'$.is_group') AS TEXT)))='true' THEN 1
    ELSE COALESCE(CAST(json_extract(m.data_json,'$.is_group') AS INTEGER),0) END AS is_group
FROM master_records m
WHERE m.record_type='Account'
  AND m.disabled=0
  AND NOT EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.tenant_id=m.tenant_id
      AND d.doctype='Account'
      AND d.name=m.name
  );

-- Historical classification must normalize the same accepted checkbox encodings.
DROP VIEW IF EXISTS finance_historical_accounts;
CREATE VIEW finance_historical_accounts AS
SELECT d.tenant_id,d.name,json_extract(d.payload_json,'$.company') AS company,
  json_extract(d.payload_json,'$.root_type') AS root_type,
  CASE WHEN lower(trim(CAST(json_extract(d.payload_json,'$.is_group') AS TEXT)))='true' THEN 1
    ELSE COALESCE(CAST(json_extract(d.payload_json,'$.is_group') AS INTEGER),0) END AS is_group
FROM documents d WHERE d.doctype='Account'
UNION ALL
SELECT m.tenant_id,m.name,json_extract(m.data_json,'$.company'),
  json_extract(m.data_json,'$.root_type'),
  CASE WHEN lower(trim(CAST(json_extract(m.data_json,'$.is_group') AS TEXT)))='true' THEN 1
    ELSE COALESCE(CAST(json_extract(m.data_json,'$.is_group') AS INTEGER),0) END
FROM master_records m WHERE m.record_type='Account'
  AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.tenant_id=m.tenant_id
    AND d.doctype='Account' AND d.name=m.name);
