-- HRM workforce/employee-finance integrity after statutory payroll migration 0043.
-- Preserve payroll replayability: any benefit/loan source consumed by a submitted
-- Salary Slip becomes historical evidence and corrections must use cancel/amend/rerun.

CREATE TRIGGER IF NOT EXISTS hr_benefit_consumed_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.doctype='Employee Benefit Enrollment' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1
  FROM documents s, json_each(json_extract(s.payload_json,'$.rule_trace_json'),'$.benefit_enrollments') b
  WHERE s.tenant_id=OLD.tenant_id
    AND s.doctype='Salary Slip'
    AND s.docstatus=1
    AND json_extract(b.value,'$.name')=OLD.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS hr_benefit_consumed_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Employee Benefit Enrollment' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1
  FROM documents s, json_each(json_extract(s.payload_json,'$.rule_trace_json'),'$.benefit_enrollments') b
  WHERE s.tenant_id=OLD.tenant_id
    AND s.doctype='Salary Slip'
    AND s.docstatus=1
    AND json_extract(b.value,'$.name')=OLD.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_consumed_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.doctype='Employee Loan' AND OLD.docstatus=1
AND (
  EXISTS(
    SELECT 1
    FROM documents s, json_each(json_extract(s.payload_json,'$.rule_trace_json'),'$.employee_loans') l
    WHERE s.tenant_id=OLD.tenant_id
      AND s.doctype='Salary Slip'
      AND s.docstatus=1
      AND json_extract(l.value,'$.name')=OLD.name
  )
  OR EXISTS(
    SELECT 1 FROM documents r
    WHERE r.tenant_id=OLD.tenant_id
      AND r.doctype='Employee Loan Repayment'
      AND r.docstatus=1
      AND json_extract(r.payload_json,'$.employee_loan')=OLD.name
  )
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_EMPLOYEE_LOAN_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_consumed_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Employee Loan' AND OLD.docstatus=1
AND (
  EXISTS(
    SELECT 1
    FROM documents s, json_each(json_extract(s.payload_json,'$.rule_trace_json'),'$.employee_loans') l
    WHERE s.tenant_id=OLD.tenant_id
      AND s.doctype='Salary Slip'
      AND s.docstatus=1
      AND json_extract(l.value,'$.name')=OLD.name
  )
  OR EXISTS(
    SELECT 1 FROM documents r
    WHERE r.tenant_id=OLD.tenant_id
      AND r.doctype='Employee Loan Repayment'
      AND r.docstatus=1
      AND json_extract(r.payload_json,'$.employee_loan')=OLD.name
  )
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_EMPLOYEE_LOAN_LOCKED');
END;

-- A manual loan repayment can be cancelled/changed until a later submitted Salary Slip
-- has consumed the resulting outstanding balance. After that, payroll correction owns
-- the reversal sequence so historical net pay cannot silently change.
CREATE TRIGGER IF NOT EXISTS hr_employee_loan_repayment_consumed_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.doctype='Employee Loan Repayment' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1
  FROM documents s, json_each(json_extract(s.payload_json,'$.rule_trace_json'),'$.employee_loans') l
  WHERE s.tenant_id=OLD.tenant_id
    AND s.doctype='Salary Slip'
    AND s.docstatus=1
    AND date(json_extract(s.payload_json,'$.end_date')) >= date(json_extract(OLD.payload_json,'$.posting_date'))
    AND json_extract(l.value,'$.name')=json_extract(OLD.payload_json,'$.employee_loan')
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_LOAN_REPAYMENT_CONSUMED');
END;

CREATE TRIGGER IF NOT EXISTS hr_employee_loan_repayment_consumed_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Employee Loan Repayment' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1
  FROM documents s, json_each(json_extract(s.payload_json,'$.rule_trace_json'),'$.employee_loans') l
  WHERE s.tenant_id=OLD.tenant_id
    AND s.doctype='Salary Slip'
    AND s.docstatus=1
    AND date(json_extract(s.payload_json,'$.end_date')) >= date(json_extract(OLD.payload_json,'$.posting_date'))
    AND json_extract(l.value,'$.name')=json_extract(OLD.payload_json,'$.employee_loan')
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_LOAN_REPAYMENT_CONSUMED');
END;

-- Only one submitted workforce plan is authoritative for a company/fiscal year.
CREATE TRIGGER IF NOT EXISTS hr_workforce_plan_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Workforce Plan' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents p
  WHERE p.tenant_id=NEW.tenant_id
    AND p.doctype='Workforce Plan'
    AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
    AND json_extract(p.payload_json,'$.fiscal_year')=json_extract(NEW.payload_json,'$.fiscal_year')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_WORKFORCE_PLAN_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_workforce_plan_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Workforce Plan' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents p
  WHERE p.tenant_id=NEW.tenant_id
    AND p.doc_key<>OLD.doc_key
    AND p.doctype='Workforce Plan'
    AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
    AND json_extract(p.payload_json,'$.fiscal_year')=json_extract(NEW.payload_json,'$.fiscal_year')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_WORKFORCE_PLAN_DUPLICATE');
END;

-- A payroll run may have one submitted bank-transfer control batch. The batch itself
-- never posts GL/payment ledgers; Payment Entry/finance settlement remains authoritative.
CREATE TRIGGER IF NOT EXISTS hr_salary_bank_batch_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Salary Bank Batch' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents b
  WHERE b.tenant_id=NEW.tenant_id
    AND b.doctype='Salary Bank Batch'
    AND b.docstatus=1
    AND json_extract(b.payload_json,'$.payroll_entry')=json_extract(NEW.payload_json,'$.payroll_entry')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_SALARY_BANK_BATCH_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_salary_bank_batch_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Salary Bank Batch' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents b
  WHERE b.tenant_id=NEW.tenant_id
    AND b.doc_key<>OLD.doc_key
    AND b.doctype='Salary Bank Batch'
    AND b.docstatus=1
    AND json_extract(b.payload_json,'$.payroll_entry')=json_extract(NEW.payload_json,'$.payroll_entry')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_SALARY_BANK_BATCH_DUPLICATE');
END;
