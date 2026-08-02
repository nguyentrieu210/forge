-- HRM payroll-source immutability after a Salary Slip consumes operational inputs.
-- Once a submitted Salary Slip consumed an HR input, corrections must happen by cancelling/
-- amending the Salary Slip (and Payroll Entry if already batched), not by silently rewriting history.
CREATE TRIGGER IF NOT EXISTS hr_payroll_source_lock_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.docstatus=1 AND (NEW.docstatus<>OLD.docstatus OR NEW.payload_json IS NOT OLD.payload_json)
AND OLD.doctype IN ('Attendance','Leave Application','Overtime Request','Salary Structure Assignment','Additional Salary')
AND EXISTS(
  SELECT 1 FROM documents s
  WHERE s.tenant_id=OLD.tenant_id AND s.doctype='Salary Slip' AND s.docstatus=1
    AND json_extract(s.payload_json,'$.employee')=json_extract(OLD.payload_json,'$.employee')
    AND (
      (OLD.doctype='Attendance'
        AND date(json_extract(OLD.payload_json,'$.attendance_date')) BETWEEN date(json_extract(s.payload_json,'$.start_date')) AND date(json_extract(s.payload_json,'$.end_date')))
      OR (OLD.doctype='Leave Application'
        AND date(json_extract(OLD.payload_json,'$.from_date')) <= date(json_extract(s.payload_json,'$.end_date'))
        AND date(json_extract(s.payload_json,'$.start_date')) <= date(json_extract(OLD.payload_json,'$.to_date')))
      OR (OLD.doctype='Overtime Request'
        AND date(json_extract(OLD.payload_json,'$.overtime_date')) BETWEEN date(json_extract(s.payload_json,'$.start_date')) AND date(json_extract(s.payload_json,'$.end_date')))
      OR (OLD.doctype='Salary Structure Assignment'
        AND date(json_extract(OLD.payload_json,'$.from_date')) <= date(json_extract(s.payload_json,'$.end_date'))
        AND date(json_extract(s.payload_json,'$.start_date')) <= date(COALESCE(json_extract(OLD.payload_json,'$.to_date'),'9999-12-31')))
      OR (OLD.doctype='Additional Salary'
        AND (
          date(json_extract(OLD.payload_json,'$.payroll_date')) BETWEEN date(json_extract(s.payload_json,'$.start_date')) AND date(json_extract(s.payload_json,'$.end_date'))
          OR (
            json_extract(OLD.payload_json,'$.is_recurring')=1
            AND date(COALESCE(json_extract(OLD.payload_json,'$.from_date'),json_extract(OLD.payload_json,'$.payroll_date'))) <= date(json_extract(s.payload_json,'$.end_date'))
            AND date(json_extract(s.payload_json,'$.start_date')) <= date(COALESCE(json_extract(OLD.payload_json,'$.to_date'),'9999-12-31'))
          )
        ))
    )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_source_lock_delete_guard
BEFORE DELETE ON documents
WHEN OLD.docstatus=1
AND OLD.doctype IN ('Attendance','Leave Application','Overtime Request','Salary Structure Assignment','Additional Salary')
AND EXISTS(
  SELECT 1 FROM documents s
  WHERE s.tenant_id=OLD.tenant_id AND s.doctype='Salary Slip' AND s.docstatus=1
    AND json_extract(s.payload_json,'$.employee')=json_extract(OLD.payload_json,'$.employee')
    AND (
      (OLD.doctype='Attendance'
        AND date(json_extract(OLD.payload_json,'$.attendance_date')) BETWEEN date(json_extract(s.payload_json,'$.start_date')) AND date(json_extract(s.payload_json,'$.end_date')))
      OR (OLD.doctype='Leave Application'
        AND date(json_extract(OLD.payload_json,'$.from_date')) <= date(json_extract(s.payload_json,'$.end_date'))
        AND date(json_extract(s.payload_json,'$.start_date')) <= date(json_extract(OLD.payload_json,'$.to_date')))
      OR (OLD.doctype='Overtime Request'
        AND date(json_extract(OLD.payload_json,'$.overtime_date')) BETWEEN date(json_extract(s.payload_json,'$.start_date')) AND date(json_extract(s.payload_json,'$.end_date')))
      OR (OLD.doctype='Salary Structure Assignment'
        AND date(json_extract(OLD.payload_json,'$.from_date')) <= date(json_extract(s.payload_json,'$.end_date'))
        AND date(json_extract(s.payload_json,'$.start_date')) <= date(COALESCE(json_extract(OLD.payload_json,'$.to_date'),'9999-12-31')))
      OR (OLD.doctype='Additional Salary'
        AND (
          date(json_extract(OLD.payload_json,'$.payroll_date')) BETWEEN date(json_extract(s.payload_json,'$.start_date')) AND date(json_extract(s.payload_json,'$.end_date'))
          OR (
            json_extract(OLD.payload_json,'$.is_recurring')=1
            AND date(COALESCE(json_extract(OLD.payload_json,'$.from_date'),json_extract(OLD.payload_json,'$.payroll_date'))) <= date(json_extract(s.payload_json,'$.end_date'))
            AND date(json_extract(s.payload_json,'$.start_date')) <= date(COALESCE(json_extract(OLD.payload_json,'$.to_date'),'9999-12-31'))
          )
        ))
    )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED'); END;
