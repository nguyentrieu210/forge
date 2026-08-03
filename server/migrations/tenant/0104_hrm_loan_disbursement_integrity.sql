-- HRM employee-loan disbursement integrity after organization-position migration 0047.
-- A loan may only become submitted/active after one submitted disbursement evidence row.
-- Finance Payment Entry correction remains owned by the finance workstream.

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_disbursement_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Employee Loan Disbursement' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='Employee Loan Disbursement'
    AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee_loan')=json_extract(NEW.payload_json,'$.employee_loan')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_EMPLOYEE_LOAN_DISBURSEMENT_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_disbursement_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Employee Loan Disbursement' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doc_key<>OLD.doc_key
    AND d.doctype='Employee Loan Disbursement'
    AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee_loan')=json_extract(NEW.payload_json,'$.employee_loan')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_EMPLOYEE_LOAN_DISBURSEMENT_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_requires_disbursement_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Employee Loan' AND NEW.docstatus=1
AND NOT EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='Employee Loan Disbursement'
    AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee_loan')=NEW.name
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_EMPLOYEE_LOAN_NOT_DISBURSED');
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_requires_disbursement_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Employee Loan' AND NEW.docstatus=1
AND NOT EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='Employee Loan Disbursement'
    AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee_loan')=NEW.name
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_EMPLOYEE_LOAN_NOT_DISBURSED');
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_disbursement_lock_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.doctype='Employee Loan Disbursement' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents l
  WHERE l.tenant_id=OLD.tenant_id
    AND l.doctype='Employee Loan'
    AND l.docstatus=1
    AND l.name=json_extract(OLD.payload_json,'$.employee_loan')
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_EMPLOYEE_LOAN_DISBURSEMENT_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_disbursement_lock_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Employee Loan Disbursement' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents l
  WHERE l.tenant_id=OLD.tenant_id
    AND l.doctype='Employee Loan'
    AND l.docstatus=1
    AND l.name=json_extract(OLD.payload_json,'$.employee_loan')
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_EMPLOYEE_LOAN_DISBURSEMENT_LOCKED');
END;
