-- HRM Wave 1 closure integrity.
-- Raw time logs remain immutable once consumed by submitted Attendance, and the
-- hire/separation closure documents remain one-to-one at the database boundary.

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

CREATE TRIGGER IF NOT EXISTS hr_hiring_completion_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Hiring Completion' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='Hiring Completion'
    AND d.docstatus=1
    AND (
      json_extract(d.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
      OR json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    )
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
    AND (
      json_extract(d.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
      OR json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    )
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
