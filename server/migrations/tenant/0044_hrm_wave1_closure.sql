-- HRM Wave 1 closure integrity.
-- Raw time logs remain immutable once consumed by submitted Attendance, hire/separation
-- closure documents remain one-to-one, and submitted Salary Slips are shared read-only
-- with the linked Employee user without widening doctype-wide payroll permissions.

CREATE TRIGGER IF NOT EXISTS hr_consumed_checkin_update_guard
BEFORE UPDATE OF doctype,name,docstatus,payload_json ON documents
WHEN OLD.doctype='Employee Checkin'
  AND OLD.docstatus=1
  AND EXISTS(
    SELECT 1
    FROM documents a
    WHERE a.tenant_id=OLD.tenant_id
      AND a.doctype='Attendance'
      AND a.docstatus=1
      AND json_valid(COALESCE(json_extract(a.payload_json,'$.checkin_refs_json'),'[]'))=1
      AND EXISTS(
        SELECT 1
        FROM json_each(COALESCE(json_extract(a.payload_json,'$.checkin_refs_json'),'[]')) r
        WHERE CAST(r.value AS TEXT)=OLD.name
      )
  )
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_CHECKIN_SOURCE_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS hr_consumed_checkin_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Employee Checkin'
  AND OLD.docstatus=1
  AND EXISTS(
    SELECT 1
    FROM documents a
    WHERE a.tenant_id=OLD.tenant_id
      AND a.doctype='Attendance'
      AND a.docstatus=1
      AND json_valid(COALESCE(json_extract(a.payload_json,'$.checkin_refs_json'),'[]'))=1
      AND EXISTS(
        SELECT 1
        FROM json_each(COALESCE(json_extract(a.payload_json,'$.checkin_refs_json'),'[]')) r
        WHERE CAST(r.value AS TEXT)=OLD.name
      )
  )
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_CHECKIN_SOURCE_LOCKED');
END;

-- One accepted offer can close only once. The Employee itself is intentionally NOT
-- unique here: a former employee may legitimately be rehired under a later Job Offer.
CREATE TRIGGER IF NOT EXISTS hr_hiring_completion_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Hiring Completion' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='Hiring Completion'
    AND d.docstatus=1
    AND json_extract(d.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_HIRING_COMPLETION_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_hiring_completion_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Hiring Completion' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='Hiring Completion'
    AND d.docstatus=1
    AND d.doc_key<>OLD.doc_key
    AND json_extract(d.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_HIRING_COMPLETION_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_final_settlement_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Employee Final Settlement' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='Employee Final Settlement'
    AND d.docstatus=1
    AND json_extract(d.payload_json,'$.separation')=json_extract(NEW.payload_json,'$.separation')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_FINAL_SETTLEMENT_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_final_settlement_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Employee Final Settlement' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='Employee Final Settlement'
    AND d.docstatus=1
    AND d.doc_key<>OLD.doc_key
    AND json_extract(d.payload_json,'$.separation')=json_extract(NEW.payload_json,'$.separation')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_FINAL_SETTLEMENT_DUPLICATE');
END;

-- Payslip self-service is a document share, not a doctype-wide Employee grant.
-- This preserves Payroll/HR full-list access while an Employee sees only the slips
-- explicitly shared with their linked user account.
CREATE TRIGGER IF NOT EXISTS hr_salary_slip_employee_share_insert
AFTER INSERT ON documents
WHEN NEW.doctype='Salary Slip' AND NEW.docstatus=1
BEGIN
  INSERT INTO document_shares(
    tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at
  )
  SELECT NEW.tenant_id,'Salary Slip',NEW.name,linked.employee_user,1,0,0,'hrm:auto-share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM (
    SELECT COALESCE(
      (
        SELECT NULLIF(trim(CAST(json_extract(e.payload_json,'$.user_id') AS TEXT)),'')
        FROM documents e
        WHERE e.tenant_id=NEW.tenant_id
          AND e.doctype='Employee'
          AND e.name=CAST(json_extract(NEW.payload_json,'$.employee') AS TEXT)
          AND e.docstatus<>2
        LIMIT 1
      ),
      (
        SELECT NULLIF(trim(CAST(json_extract(m.data_json,'$.user_id') AS TEXT)),'')
        FROM master_records m
        WHERE m.tenant_id=NEW.tenant_id
          AND m.record_type='Employee'
          AND m.name=CAST(json_extract(NEW.payload_json,'$.employee') AS TEXT)
        LIMIT 1
      )
    ) AS employee_user
  ) linked
  WHERE linked.employee_user IS NOT NULL AND linked.employee_user<>''
  ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=1;
END;

CREATE TRIGGER IF NOT EXISTS hr_salary_slip_employee_share_update
AFTER UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Salary Slip' AND NEW.docstatus=1
BEGIN
  INSERT INTO document_shares(
    tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at
  )
  SELECT NEW.tenant_id,'Salary Slip',NEW.name,linked.employee_user,1,0,0,'hrm:auto-share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM (
    SELECT COALESCE(
      (
        SELECT NULLIF(trim(CAST(json_extract(e.payload_json,'$.user_id') AS TEXT)),'')
        FROM documents e
        WHERE e.tenant_id=NEW.tenant_id
          AND e.doctype='Employee'
          AND e.name=CAST(json_extract(NEW.payload_json,'$.employee') AS TEXT)
          AND e.docstatus<>2
        LIMIT 1
      ),
      (
        SELECT NULLIF(trim(CAST(json_extract(m.data_json,'$.user_id') AS TEXT)),'')
        FROM master_records m
        WHERE m.tenant_id=NEW.tenant_id
          AND m.record_type='Employee'
          AND m.name=CAST(json_extract(NEW.payload_json,'$.employee') AS TEXT)
        LIMIT 1
      )
    ) AS employee_user
  ) linked
  WHERE linked.employee_user IS NOT NULL AND linked.employee_user<>''
  ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=1;
END;
