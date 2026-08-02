-- VN Payroll Rule validation and append-only audit integrity.
-- A legal payroll rule remains a master for backward compatibility, but once it is
-- referenced by an approved salary structure or a submitted/cancelled Salary Slip
-- it becomes immutable. Corrections require a new rule record with a new effective period.

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_validate_insert_guard
BEFORE INSERT ON master_records
WHEN NEW.record_type='VN Payroll Rule'
AND (
  COALESCE(json_extract(NEW.data_json,'$.rule_code'),'')=''
  OR json_extract(NEW.data_json,'$.rule_code')<>NEW.name
  OR COALESCE(json_extract(NEW.data_json,'$.legal_document_no'),'')=''
  OR COALESCE(json_extract(NEW.data_json,'$.source_url'),'')=''
  OR COALESCE(json_extract(NEW.data_json,'$.approved_by'),'')=''
  OR COALESCE(json_extract(NEW.data_json,'$.approved_at'),'')=''
  OR date(json_extract(NEW.data_json,'$.effective_from')) IS NULL
  OR (
    COALESCE(json_extract(NEW.data_json,'$.effective_to'),'')<>''
    AND date(json_extract(NEW.data_json,'$.effective_to')) < date(json_extract(NEW.data_json,'$.effective_from'))
  )
  OR json_valid(json_extract(NEW.data_json,'$.formula_json'))<>1
  OR json_type(json_extract(NEW.data_json,'$.formula_json'))<>'object'
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_INVALID'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_validate_update_guard
BEFORE UPDATE OF record_type,name,data_json ON master_records
WHEN NEW.record_type='VN Payroll Rule'
AND (
  COALESCE(json_extract(NEW.data_json,'$.rule_code'),'')=''
  OR json_extract(NEW.data_json,'$.rule_code')<>NEW.name
  OR COALESCE(json_extract(NEW.data_json,'$.legal_document_no'),'')=''
  OR COALESCE(json_extract(NEW.data_json,'$.source_url'),'')=''
  OR COALESCE(json_extract(NEW.data_json,'$.approved_by'),'')=''
  OR COALESCE(json_extract(NEW.data_json,'$.approved_at'),'')=''
  OR date(json_extract(NEW.data_json,'$.effective_from')) IS NULL
  OR (
    COALESCE(json_extract(NEW.data_json,'$.effective_to'),'')<>''
    AND date(json_extract(NEW.data_json,'$.effective_to')) < date(json_extract(NEW.data_json,'$.effective_from'))
  )
  OR json_valid(json_extract(NEW.data_json,'$.formula_json'))<>1
  OR json_type(json_extract(NEW.data_json,'$.formula_json'))<>'object'
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_INVALID'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_immutable_update_guard
BEFORE UPDATE OF record_type,name,data_json,disabled ON master_records
WHEN OLD.record_type='VN Payroll Rule'
AND (
  EXISTS(
    SELECT 1 FROM documents d
    WHERE d.tenant_id=OLD.tenant_id
      AND d.docstatus=1
      AND d.doctype IN ('Salary Structure','Salary Structure Assignment')
      AND json_extract(d.payload_json,'$.payroll_rule')=OLD.name
  )
  OR EXISTS(
    SELECT 1 FROM documents s
    WHERE s.tenant_id=OLD.tenant_id
      AND s.doctype='Salary Slip'
      AND s.docstatus IN (1,2)
      AND json_extract(json_extract(s.payload_json,'$.rule_trace_json'),'$.payroll_rule.name')=OLD.name
  )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_immutable_delete_guard
BEFORE DELETE ON master_records
WHEN OLD.record_type='VN Payroll Rule'
AND (
  EXISTS(
    SELECT 1 FROM documents d
    WHERE d.tenant_id=OLD.tenant_id
      AND d.docstatus=1
      AND d.doctype IN ('Salary Structure','Salary Structure Assignment')
      AND json_extract(d.payload_json,'$.payroll_rule')=OLD.name
  )
  OR EXISTS(
    SELECT 1 FROM documents s
    WHERE s.tenant_id=OLD.tenant_id
      AND s.doctype='Salary Slip'
      AND s.docstatus IN (1,2)
      AND json_extract(json_extract(s.payload_json,'$.rule_trace_json'),'$.payroll_rule.name')=OLD.name
  )
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_IMMUTABLE'); END;
