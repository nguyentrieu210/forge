-- HRM hire-to-retire closure integrity after workforce finance migration 0044.
-- Hiring completion is the immutable lineage proof for one hire cycle. Final settlement
-- is the immutable closure proof for one separation once its submitted evidence exists.

CREATE TRIGGER IF NOT EXISTS hr_hiring_completion_unique_offer_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Hiring Completion' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents h
  WHERE h.tenant_id=NEW.tenant_id AND h.doctype='Hiring Completion' AND h.docstatus=1
    AND json_extract(h.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
)
BEGIN SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_HIRING_COMPLETION_DUPLICATE_OFFER'); END;

CREATE TRIGGER IF NOT EXISTS hr_hiring_completion_unique_employee_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Hiring Completion' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents h
  WHERE h.tenant_id=NEW.tenant_id AND h.doctype='Hiring Completion' AND h.docstatus=1
    AND json_extract(h.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
)
BEGIN SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_HIRING_COMPLETION_DUPLICATE_EMPLOYEE'); END;

CREATE TRIGGER IF NOT EXISTS hr_hiring_completion_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Hiring Completion' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents h
  WHERE h.tenant_id=NEW.tenant_id AND h.doc_key<>OLD.doc_key
    AND h.doctype='Hiring Completion' AND h.docstatus=1
    AND (
      json_extract(h.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
      OR json_extract(h.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    )
)
BEGIN SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_HIRING_COMPLETION_DUPLICATE'); END;

CREATE TRIGGER IF NOT EXISTS hr_hiring_source_lock_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.docstatus=1 AND OLD.doctype IN ('Job Offer','Employment Contract','Employee Onboarding')
AND EXISTS(
  SELECT 1 FROM documents h
  WHERE h.tenant_id=OLD.tenant_id AND h.doctype='Hiring Completion' AND h.docstatus=1
    AND (
      (OLD.doctype='Job Offer' AND json_extract(h.payload_json,'$.job_offer')=OLD.name)
      OR (OLD.doctype='Employment Contract' AND json_extract(h.payload_json,'$.employment_contract')=OLD.name)
      OR (OLD.doctype='Employee Onboarding' AND json_extract(h.payload_json,'$.employee_onboarding')=OLD.name)
    )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_HIRING_SOURCE_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS hr_hiring_source_lock_delete_guard
BEFORE DELETE ON documents
WHEN OLD.docstatus=1 AND OLD.doctype IN ('Job Offer','Employment Contract','Employee Onboarding')
AND EXISTS(
  SELECT 1 FROM documents h
  WHERE h.tenant_id=OLD.tenant_id AND h.doctype='Hiring Completion' AND h.docstatus=1
    AND (
      (OLD.doctype='Job Offer' AND json_extract(h.payload_json,'$.job_offer')=OLD.name)
      OR (OLD.doctype='Employment Contract' AND json_extract(h.payload_json,'$.employment_contract')=OLD.name)
      OR (OLD.doctype='Employee Onboarding' AND json_extract(h.payload_json,'$.employee_onboarding')=OLD.name)
    )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_HIRING_SOURCE_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS hr_final_settlement_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Employee Final Settlement' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents f
  WHERE f.tenant_id=NEW.tenant_id AND f.doctype='Employee Final Settlement' AND f.docstatus=1
    AND json_extract(f.payload_json,'$.separation')=json_extract(NEW.payload_json,'$.separation')
)
BEGIN SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_FINAL_SETTLEMENT_DUPLICATE'); END;

CREATE TRIGGER IF NOT EXISTS hr_final_settlement_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Employee Final Settlement' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents f
  WHERE f.tenant_id=NEW.tenant_id AND f.doc_key<>OLD.doc_key
    AND f.doctype='Employee Final Settlement' AND f.docstatus=1
    AND json_extract(f.payload_json,'$.separation')=json_extract(NEW.payload_json,'$.separation')
)
BEGIN SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_FINAL_SETTLEMENT_DUPLICATE'); END;

CREATE TRIGGER IF NOT EXISTS hr_final_settlement_source_lock_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.docstatus=1 AND OLD.doctype IN ('Employee Separation','Salary Slip')
AND EXISTS(
  SELECT 1 FROM documents f
  WHERE f.tenant_id=OLD.tenant_id AND f.doctype='Employee Final Settlement' AND f.docstatus=1
    AND (
      (OLD.doctype='Employee Separation' AND json_extract(f.payload_json,'$.separation')=OLD.name)
      OR (OLD.doctype='Salary Slip' AND json_extract(f.payload_json,'$.final_salary_slip')=OLD.name)
    )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_FINAL_SETTLEMENT_SOURCE_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS hr_final_settlement_source_lock_delete_guard
BEFORE DELETE ON documents
WHEN OLD.docstatus=1 AND OLD.doctype IN ('Employee Separation','Salary Slip')
AND EXISTS(
  SELECT 1 FROM documents f
  WHERE f.tenant_id=OLD.tenant_id AND f.doctype='Employee Final Settlement' AND f.docstatus=1
    AND (
      (OLD.doctype='Employee Separation' AND json_extract(f.payload_json,'$.separation')=OLD.name)
      OR (OLD.doctype='Salary Slip' AND json_extract(f.payload_json,'$.final_salary_slip')=OLD.name)
    )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_FINAL_SETTLEMENT_SOURCE_LOCKED'); END;
