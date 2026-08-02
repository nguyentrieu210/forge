-- Exact employee self-service shares for first-party HR documents.
-- This is append-only after 0044. It intentionally grants read-only document shares;
-- field permlevels remain authoritative for sensitive values.

CREATE TRIGGER IF NOT EXISTS hr_employee_profile_share_insert
AFTER INSERT ON documents
WHEN NEW.doctype='Employee'
  AND COALESCE(trim(CAST(json_extract(NEW.payload_json,'$.user_id') AS TEXT)),'')<>''
BEGIN
  INSERT INTO document_shares(tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at)
  VALUES(
    NEW.tenant_id,'Employee',NEW.name,trim(CAST(json_extract(NEW.payload_json,'$.user_id') AS TEXT)),
    1,0,0,'hrm:auto-share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  )
  ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=1;
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_profile_share_update
AFTER UPDATE OF payload_json ON documents
WHEN NEW.doctype='Employee'
  AND COALESCE(trim(CAST(json_extract(NEW.payload_json,'$.user_id') AS TEXT)),'')<>''
BEGIN
  INSERT INTO document_shares(tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at)
  VALUES(
    NEW.tenant_id,'Employee',NEW.name,trim(CAST(json_extract(NEW.payload_json,'$.user_id') AS TEXT)),
    1,0,0,'hrm:auto-share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  )
  ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=1;
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_facing_share_insert
AFTER INSERT ON documents
WHEN NEW.doctype IN ('Employment Contract','Attendance','Appraisal','Employee Final Settlement')
  AND NEW.docstatus=1
BEGIN
  INSERT INTO document_shares(tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at)
  SELECT NEW.tenant_id,NEW.doctype,NEW.name,linked.employee_user,1,0,0,'hrm:auto-share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM (
    SELECT COALESCE(
      (SELECT NULLIF(trim(CAST(json_extract(e.payload_json,'$.user_id') AS TEXT)),'')
       FROM documents e WHERE e.tenant_id=NEW.tenant_id AND e.doctype='Employee'
         AND e.name=CAST(json_extract(NEW.payload_json,'$.employee') AS TEXT) AND e.docstatus<>2 LIMIT 1),
      (SELECT NULLIF(trim(CAST(json_extract(m.data_json,'$.user_id') AS TEXT)),'')
       FROM master_records m WHERE m.tenant_id=NEW.tenant_id AND m.record_type='Employee'
         AND m.name=CAST(json_extract(NEW.payload_json,'$.employee') AS TEXT) LIMIT 1)
    ) AS employee_user
  ) linked
  WHERE linked.employee_user IS NOT NULL AND linked.employee_user<>''
  ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=1;
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_facing_share_update
AFTER UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype IN ('Employment Contract','Attendance','Appraisal','Employee Final Settlement')
  AND NEW.docstatus=1
BEGIN
  INSERT INTO document_shares(tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at)
  SELECT NEW.tenant_id,NEW.doctype,NEW.name,linked.employee_user,1,0,0,'hrm:auto-share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM (
    SELECT COALESCE(
      (SELECT NULLIF(trim(CAST(json_extract(e.payload_json,'$.user_id') AS TEXT)),'')
       FROM documents e WHERE e.tenant_id=NEW.tenant_id AND e.doctype='Employee'
         AND e.name=CAST(json_extract(NEW.payload_json,'$.employee') AS TEXT) AND e.docstatus<>2 LIMIT 1),
      (SELECT NULLIF(trim(CAST(json_extract(m.data_json,'$.user_id') AS TEXT)),'')
       FROM master_records m WHERE m.tenant_id=NEW.tenant_id AND m.record_type='Employee'
         AND m.name=CAST(json_extract(NEW.payload_json,'$.employee') AS TEXT) LIMIT 1)
    ) AS employee_user
  ) linked
  WHERE linked.employee_user IS NOT NULL AND linked.employee_user<>''
  ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=1;
END;

-- Backfill profile shares for existing employees.
INSERT INTO document_shares(tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at)
SELECT d.tenant_id,'Employee',d.name,trim(CAST(json_extract(d.payload_json,'$.user_id') AS TEXT)),1,0,0,'hrm:auto-share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM documents d
WHERE d.doctype='Employee' AND d.docstatus<>2
  AND COALESCE(trim(CAST(json_extract(d.payload_json,'$.user_id') AS TEXT)),'')<>''
ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=1;

-- Backfill historical submitted employee-facing documents, including Salary Slip from
-- the external payroll core. Future Salary Slips are handled by 0044 triggers.
INSERT INTO document_shares(tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at)
SELECT historical.tenant_id,historical.doctype,historical.name,historical.employee_user,1,0,0,'hrm:auto-share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM (
  SELECT d.tenant_id,d.doctype,d.name,
    COALESCE(
      (SELECT NULLIF(trim(CAST(json_extract(e.payload_json,'$.user_id') AS TEXT)),'')
       FROM documents e WHERE e.tenant_id=d.tenant_id AND e.doctype='Employee'
         AND e.name=CAST(json_extract(d.payload_json,'$.employee') AS TEXT) AND e.docstatus<>2 LIMIT 1),
      (SELECT NULLIF(trim(CAST(json_extract(m.data_json,'$.user_id') AS TEXT)),'')
       FROM master_records m WHERE m.tenant_id=d.tenant_id AND m.record_type='Employee'
         AND m.name=CAST(json_extract(d.payload_json,'$.employee') AS TEXT) LIMIT 1)
    ) AS employee_user
  FROM documents d
  WHERE d.doctype IN ('Salary Slip','Employment Contract','Attendance','Appraisal','Employee Final Settlement')
    AND d.docstatus=1
) historical
WHERE historical.employee_user IS NOT NULL AND historical.employee_user<>''
ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=1;
