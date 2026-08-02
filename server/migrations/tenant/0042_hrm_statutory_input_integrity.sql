-- Statutory payroll assignment inputs are typed child rows, not free-form executable code.
-- Keys are unique within one assignment and consumed rows cannot be mutated while a
-- submitted Salary Slip depends on the assignment period.

CREATE TRIGGER IF NOT EXISTS hr_statutory_input_insert_guard
BEFORE INSERT ON document_children
WHEN NEW.fieldname='statutory_inputs'
AND (
  NEW.child_doctype<>'Payroll Rule Input Value'
  OR COALESCE(json_extract(NEW.payload_json,'$.input_key'),'')=''
  OR json_extract(NEW.payload_json,'$.value') IS NULL
  OR EXISTS(SELECT 1 FROM document_children c WHERE c.tenant_id=NEW.tenant_id AND c.parent_key=NEW.parent_key AND c.fieldname='statutory_inputs' AND json_extract(c.payload_json,'$.input_key')=json_extract(NEW.payload_json,'$.input_key'))
)
BEGIN SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_STATUTORY_INPUT_INVALID'); END;

CREATE TRIGGER IF NOT EXISTS hr_statutory_input_update_guard
BEFORE UPDATE OF parent_key,fieldname,child_doctype,payload_json ON document_children
WHEN OLD.fieldname='statutory_inputs' OR NEW.fieldname='statutory_inputs'
BEGIN
  SELECT CASE
    WHEN NEW.fieldname<>'statutory_inputs' OR NEW.child_doctype<>'Payroll Rule Input Value' OR COALESCE(json_extract(NEW.payload_json,'$.input_key'),'')='' OR json_extract(NEW.payload_json,'$.value') IS NULL
      THEN RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_STATUTORY_INPUT_INVALID')
    WHEN EXISTS(SELECT 1 FROM document_children c WHERE c.tenant_id=NEW.tenant_id AND c.parent_key=NEW.parent_key AND c.fieldname='statutory_inputs' AND c.row_id<>OLD.row_id AND json_extract(c.payload_json,'$.input_key')=json_extract(NEW.payload_json,'$.input_key'))
      THEN RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_STATUTORY_INPUT_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS hr_statutory_input_freeze_insert_guard
BEFORE INSERT ON document_children
WHEN NEW.fieldname='statutory_inputs'
AND EXISTS(
  SELECT 1 FROM documents a JOIN documents s ON s.tenant_id=a.tenant_id
  WHERE a.tenant_id=NEW.tenant_id AND a.doc_key=NEW.parent_key AND a.doctype='Salary Structure Assignment' AND a.docstatus=1
    AND s.doctype='Salary Slip' AND s.docstatus=1
    AND json_extract(s.payload_json,'$.employee')=json_extract(a.payload_json,'$.employee')
    AND json_extract(s.payload_json,'$.company')=json_extract(a.payload_json,'$.company')
    AND date(json_extract(a.payload_json,'$.from_date')) <= date(json_extract(s.payload_json,'$.end_date'))
    AND date(json_extract(s.payload_json,'$.start_date')) <= date(COALESCE(json_extract(a.payload_json,'$.to_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS hr_statutory_input_freeze_update_guard
BEFORE UPDATE ON document_children
WHEN OLD.fieldname='statutory_inputs'
AND EXISTS(
  SELECT 1 FROM documents a JOIN documents s ON s.tenant_id=a.tenant_id
  WHERE a.tenant_id=OLD.tenant_id AND a.doc_key=OLD.parent_key AND a.doctype='Salary Structure Assignment' AND a.docstatus=1
    AND s.doctype='Salary Slip' AND s.docstatus=1
    AND json_extract(s.payload_json,'$.employee')=json_extract(a.payload_json,'$.employee')
    AND json_extract(s.payload_json,'$.company')=json_extract(a.payload_json,'$.company')
    AND date(json_extract(a.payload_json,'$.from_date')) <= date(json_extract(s.payload_json,'$.end_date'))
    AND date(json_extract(s.payload_json,'$.start_date')) <= date(COALESCE(json_extract(a.payload_json,'$.to_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS hr_statutory_input_freeze_delete_guard
BEFORE DELETE ON document_children
WHEN OLD.fieldname='statutory_inputs'
AND EXISTS(
  SELECT 1 FROM documents a JOIN documents s ON s.tenant_id=a.tenant_id
  WHERE a.tenant_id=OLD.tenant_id AND a.doc_key=OLD.parent_key AND a.doctype='Salary Structure Assignment' AND a.docstatus=1
    AND s.doctype='Salary Slip' AND s.docstatus=1
    AND json_extract(s.payload_json,'$.employee')=json_extract(a.payload_json,'$.employee')
    AND json_extract(s.payload_json,'$.company')=json_extract(a.payload_json,'$.company')
    AND date(json_extract(a.payload_json,'$.from_date')) <= date(json_extract(s.payload_json,'$.end_date'))
    AND date(json_extract(s.payload_json,'$.start_date')) <= date(COALESCE(json_extract(a.payload_json,'$.to_date'),'9999-12-31'))
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED'); END;
