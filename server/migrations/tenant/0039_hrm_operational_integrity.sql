-- HRM operational integrity controls.
-- Metadata and controllers own business UX/validation; these triggers are the race-safe
-- authority for interval uniqueness and payroll-source immutability.

CREATE INDEX IF NOT EXISTS idx_hr_contract_employee_period
ON documents(tenant_id, doctype, json_extract(payload_json,'$.employee'), json_extract(payload_json,'$.start_date'), json_extract(payload_json,'$.end_date'))
WHERE doctype='Employment Contract' AND docstatus=1;

CREATE INDEX IF NOT EXISTS idx_hr_shift_employee_period
ON documents(tenant_id, doctype, json_extract(payload_json,'$.employee'), json_extract(payload_json,'$.start_date'), json_extract(payload_json,'$.end_date'))
WHERE doctype='Shift Assignment' AND docstatus=1;

CREATE INDEX IF NOT EXISTS idx_hr_leave_allocation_employee_period
ON documents(tenant_id, doctype, json_extract(payload_json,'$.employee'), json_extract(payload_json,'$.leave_type'), json_extract(payload_json,'$.from_date'), json_extract(payload_json,'$.to_date'))
WHERE doctype='Leave Allocation' AND docstatus=1;

CREATE INDEX IF NOT EXISTS idx_hr_leave_employee_period
ON documents(tenant_id, doctype, json_extract(payload_json,'$.employee'), json_extract(payload_json,'$.from_date'), json_extract(payload_json,'$.to_date'))
WHERE doctype='Leave Application' AND docstatus=1;

CREATE INDEX IF NOT EXISTS idx_hr_checkin_employee_time
ON documents(tenant_id, doctype, json_extract(payload_json,'$.employee'), json_extract(payload_json,'$.time'))
WHERE doctype='Employee Checkin' AND docstatus=1;

CREATE INDEX IF NOT EXISTS idx_hr_salary_assignment_employee_period
ON documents(tenant_id, doctype, json_extract(payload_json,'$.employee'), json_extract(payload_json,'$.from_date'), json_extract(payload_json,'$.to_date'))
WHERE doctype='Salary Structure Assignment' AND docstatus=1;

CREATE INDEX IF NOT EXISTS idx_hr_salary_slip_employee_period
ON documents(tenant_id, doctype, json_extract(payload_json,'$.employee'), json_extract(payload_json,'$.start_date'), json_extract(payload_json,'$.end_date'))
WHERE doctype='Salary Slip' AND docstatus=1;

CREATE TRIGGER IF NOT EXISTS hr_contract_overlap_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Employment Contract' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Employment Contract' AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(d.payload_json,'$.start_date')) <= date(COALESCE(json_extract(NEW.payload_json,'$.end_date'),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.start_date')) <= date(COALESCE(json_extract(d.payload_json,'$.end_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_CONTRACT_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_contract_overlap_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Employment Contract' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Employment Contract' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(d.payload_json,'$.start_date')) <= date(COALESCE(json_extract(NEW.payload_json,'$.end_date'),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.start_date')) <= date(COALESCE(json_extract(d.payload_json,'$.end_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_CONTRACT_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_shift_overlap_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Shift Assignment' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Shift Assignment' AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(d.payload_json,'$.start_date')) <= date(COALESCE(json_extract(NEW.payload_json,'$.end_date'),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.start_date')) <= date(COALESCE(json_extract(d.payload_json,'$.end_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_SHIFT_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_shift_overlap_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Shift Assignment' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Shift Assignment' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(d.payload_json,'$.start_date')) <= date(COALESCE(json_extract(NEW.payload_json,'$.end_date'),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.start_date')) <= date(COALESCE(json_extract(d.payload_json,'$.end_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_SHIFT_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_leave_allocation_overlap_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Leave Allocation' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Leave Allocation' AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND json_extract(d.payload_json,'$.leave_type')=json_extract(NEW.payload_json,'$.leave_type')
    AND date(json_extract(d.payload_json,'$.from_date')) <= date(json_extract(NEW.payload_json,'$.to_date'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(json_extract(d.payload_json,'$.to_date'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_LEAVE_ALLOCATION_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_leave_allocation_overlap_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Leave Allocation' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Leave Allocation' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND json_extract(d.payload_json,'$.leave_type')=json_extract(NEW.payload_json,'$.leave_type')
    AND date(json_extract(d.payload_json,'$.from_date')) <= date(json_extract(NEW.payload_json,'$.to_date'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(json_extract(d.payload_json,'$.to_date'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_LEAVE_ALLOCATION_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_leave_overlap_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Leave Application' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Leave Application' AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(d.payload_json,'$.from_date')) <= date(json_extract(NEW.payload_json,'$.to_date'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(json_extract(d.payload_json,'$.to_date'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_LEAVE_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_leave_overlap_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Leave Application' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Leave Application' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(d.payload_json,'$.from_date')) <= date(json_extract(NEW.payload_json,'$.to_date'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(json_extract(d.payload_json,'$.to_date'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_LEAVE_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_overtime_duplicate_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Overtime Request' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Overtime Request' AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND json_extract(d.payload_json,'$.overtime_date')=json_extract(NEW.payload_json,'$.overtime_date')
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_OVERTIME_DUPLICATE'); END;

CREATE TRIGGER IF NOT EXISTS hr_overtime_duplicate_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Overtime Request' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Overtime Request' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND json_extract(d.payload_json,'$.overtime_date')=json_extract(NEW.payload_json,'$.overtime_date')
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_OVERTIME_DUPLICATE'); END;

CREATE TRIGGER IF NOT EXISTS hr_checkin_duplicate_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Employee Checkin' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Employee Checkin' AND d.docstatus=1
    AND (
      (COALESCE(json_extract(NEW.payload_json,'$.external_id'),'')<>'' AND json_extract(d.payload_json,'$.external_id')=json_extract(NEW.payload_json,'$.external_id'))
      OR (
        json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
        AND json_extract(d.payload_json,'$.time')=json_extract(NEW.payload_json,'$.time')
        AND json_extract(d.payload_json,'$.log_type')=json_extract(NEW.payload_json,'$.log_type')
      )
    )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_CHECKIN_DUPLICATE'); END;

CREATE TRIGGER IF NOT EXISTS hr_checkin_duplicate_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Employee Checkin' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Employee Checkin' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND (
      (COALESCE(json_extract(NEW.payload_json,'$.external_id'),'')<>'' AND json_extract(d.payload_json,'$.external_id')=json_extract(NEW.payload_json,'$.external_id'))
      OR (
        json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
        AND json_extract(d.payload_json,'$.time')=json_extract(NEW.payload_json,'$.time')
        AND json_extract(d.payload_json,'$.log_type')=json_extract(NEW.payload_json,'$.log_type')
      )
    )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_CHECKIN_DUPLICATE'); END;

CREATE TRIGGER IF NOT EXISTS hr_salary_assignment_overlap_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Salary Structure Assignment' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Salary Structure Assignment' AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(d.payload_json,'$.from_date')) <= date(COALESCE(json_extract(NEW.payload_json,'$.to_date'),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(COALESCE(json_extract(d.payload_json,'$.to_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_SALARY_ASSIGNMENT_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_salary_assignment_overlap_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Salary Structure Assignment' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Salary Structure Assignment' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(d.payload_json,'$.from_date')) <= date(COALESCE(json_extract(NEW.payload_json,'$.to_date'),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(COALESCE(json_extract(d.payload_json,'$.to_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_SALARY_ASSIGNMENT_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_period_overlap_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Payroll Period' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Payroll Period' AND d.docstatus=1
    AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
    AND COALESCE(json_extract(d.payload_json,'$.branch'),'')=COALESCE(json_extract(NEW.payload_json,'$.branch'),'')
    AND date(json_extract(d.payload_json,'$.start_date')) <= date(json_extract(NEW.payload_json,'$.end_date'))
    AND date(json_extract(NEW.payload_json,'$.start_date')) <= date(json_extract(d.payload_json,'$.end_date'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_PERIOD_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_period_overlap_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Payroll Period' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Payroll Period' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
    AND COALESCE(json_extract(d.payload_json,'$.branch'),'')=COALESCE(json_extract(NEW.payload_json,'$.branch'),'')
    AND date(json_extract(d.payload_json,'$.start_date')) <= date(json_extract(NEW.payload_json,'$.end_date'))
    AND date(json_extract(NEW.payload_json,'$.start_date')) <= date(json_extract(d.payload_json,'$.end_date'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_PERIOD_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_salary_slip_overlap_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Salary Slip' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Salary Slip' AND d.docstatus=1
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
    AND date(json_extract(d.payload_json,'$.start_date')) <= date(json_extract(NEW.payload_json,'$.end_date'))
    AND date(json_extract(NEW.payload_json,'$.start_date')) <= date(json_extract(d.payload_json,'$.end_date'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_SALARY_SLIP_OVERLAP'); END;

CREATE TRIGGER IF NOT EXISTS hr_salary_slip_overlap_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Salary Slip' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Salary Slip' AND d.docstatus=1 AND d.doc_key<>NEW.doc_key
    AND json_extract(d.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
    AND date(json_extract(d.payload_json,'$.start_date')) <= date(json_extract(NEW.payload_json,'$.end_date'))
    AND date(json_extract(NEW.payload_json,'$.start_date')) <= date(json_extract(d.payload_json,'$.end_date'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_SALARY_SLIP_OVERLAP'); END;

