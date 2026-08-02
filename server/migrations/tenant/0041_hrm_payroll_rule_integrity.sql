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
  OR json_extract(json_extract(NEW.data_json,'$.formula_json'),'$.schema_version')<>1
  OR COALESCE(json_extract(json_extract(NEW.data_json,'$.formula_json'),'$.currency'),'')=''
  OR json_type(json_extract(NEW.data_json,'$.formula_json'),'$.outputs')<>'object'
  OR NOT EXISTS (SELECT 1 FROM json_each(json_extract(json_extract(NEW.data_json,'$.formula_json'),'$.outputs')))
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
  OR json_extract(json_extract(NEW.data_json,'$.formula_json'),'$.schema_version')<>1
  OR COALESCE(json_extract(json_extract(NEW.data_json,'$.formula_json'),'$.currency'),'')=''
  OR json_type(json_extract(NEW.data_json,'$.formula_json'),'$.outputs')<>'object'
  OR NOT EXISTS (SELECT 1 FROM json_each(json_extract(json_extract(NEW.data_json,'$.formula_json'),'$.outputs')))
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

-- User-created first-party master DocTypes may live in `documents` while seeded masters
-- live in `master_records`. Payroll rule integrity must cover both storage paths and must
-- not allow one path to shadow the other with the same tenant/name.
CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_master_shadow_insert_guard
BEFORE INSERT ON master_records
WHEN NEW.record_type='VN Payroll Rule'
AND EXISTS(SELECT 1 FROM documents d WHERE d.tenant_id=NEW.tenant_id AND d.doctype='VN Payroll Rule' AND d.name=NEW.name AND d.docstatus<>2)
BEGIN SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_PAYROLL_RULE_DUPLICATE_STORAGE'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_master_shadow_update_guard
BEFORE UPDATE OF record_type,name ON master_records
WHEN NEW.record_type='VN Payroll Rule'
AND EXISTS(SELECT 1 FROM documents d WHERE d.tenant_id=NEW.tenant_id AND d.doctype='VN Payroll Rule' AND d.name=NEW.name AND d.docstatus<>2)
BEGIN SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_PAYROLL_RULE_DUPLICATE_STORAGE'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_document_validate_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Payroll Rule' AND NEW.docstatus<>2
AND (
  COALESCE(json_extract(NEW.payload_json,'$.rule_code'),'')=''
  OR json_extract(NEW.payload_json,'$.rule_code')<>NEW.name
  OR COALESCE(json_extract(NEW.payload_json,'$.legal_document_no'),'')=''
  OR COALESCE(json_extract(NEW.payload_json,'$.source_url'),'')=''
  OR COALESCE(json_extract(NEW.payload_json,'$.approved_by'),'')=''
  OR COALESCE(json_extract(NEW.payload_json,'$.approved_at'),'')=''
  OR date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
  OR (
    COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
    AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
  )
  OR json_valid(json_extract(NEW.payload_json,'$.formula_json'))<>1
  OR json_type(json_extract(NEW.payload_json,'$.formula_json'))<>'object'
  OR json_extract(json_extract(NEW.payload_json,'$.formula_json'),'$.schema_version')<>1
  OR COALESCE(json_extract(json_extract(NEW.payload_json,'$.formula_json'),'$.currency'),'')=''
  OR json_type(json_extract(NEW.payload_json,'$.formula_json'),'$.outputs')<>'object'
  OR NOT EXISTS (SELECT 1 FROM json_each(json_extract(json_extract(NEW.payload_json,'$.formula_json'),'$.outputs')))
  OR EXISTS(SELECT 1 FROM master_records m WHERE m.tenant_id=NEW.tenant_id AND m.record_type='VN Payroll Rule' AND m.name=NEW.name)
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_INVALID'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_document_validate_update_guard
BEFORE UPDATE OF doctype,name,docstatus,payload_json ON documents
WHEN NEW.doctype='VN Payroll Rule' AND NEW.docstatus<>2
AND (
  COALESCE(json_extract(NEW.payload_json,'$.rule_code'),'')=''
  OR json_extract(NEW.payload_json,'$.rule_code')<>NEW.name
  OR COALESCE(json_extract(NEW.payload_json,'$.legal_document_no'),'')=''
  OR COALESCE(json_extract(NEW.payload_json,'$.source_url'),'')=''
  OR COALESCE(json_extract(NEW.payload_json,'$.approved_by'),'')=''
  OR COALESCE(json_extract(NEW.payload_json,'$.approved_at'),'')=''
  OR date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
  OR (
    COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
    AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
  )
  OR json_valid(json_extract(NEW.payload_json,'$.formula_json'))<>1
  OR json_type(json_extract(NEW.payload_json,'$.formula_json'))<>'object'
  OR json_extract(json_extract(NEW.payload_json,'$.formula_json'),'$.schema_version')<>1
  OR COALESCE(json_extract(json_extract(NEW.payload_json,'$.formula_json'),'$.currency'),'')=''
  OR json_type(json_extract(NEW.payload_json,'$.formula_json'),'$.outputs')<>'object'
  OR NOT EXISTS (SELECT 1 FROM json_each(json_extract(json_extract(NEW.payload_json,'$.formula_json'),'$.outputs')))
  OR EXISTS(SELECT 1 FROM master_records m WHERE m.tenant_id=NEW.tenant_id AND m.record_type='VN Payroll Rule' AND m.name=NEW.name)
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_INVALID'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_document_immutable_update_guard
BEFORE UPDATE OF doctype,name,docstatus,payload_json ON documents
WHEN OLD.doctype='VN Payroll Rule'
AND (
  EXISTS(SELECT 1 FROM documents d WHERE d.tenant_id=OLD.tenant_id AND d.docstatus=1 AND d.doctype IN ('Salary Structure','Salary Structure Assignment') AND json_extract(d.payload_json,'$.payroll_rule')=OLD.name)
  OR EXISTS(SELECT 1 FROM documents s WHERE s.tenant_id=OLD.tenant_id AND s.doctype='Salary Slip' AND s.docstatus IN (1,2) AND json_extract(json_extract(s.payload_json,'$.rule_trace_json'),'$.payroll_rule.name')=OLD.name)
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_document_immutable_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='VN Payroll Rule'
AND (
  EXISTS(SELECT 1 FROM documents d WHERE d.tenant_id=OLD.tenant_id AND d.docstatus=1 AND d.doctype IN ('Salary Structure','Salary Structure Assignment') AND json_extract(d.payload_json,'$.payroll_rule')=OLD.name)
  OR EXISTS(SELECT 1 FROM documents s WHERE s.tenant_id=OLD.tenant_id AND s.doctype='Salary Slip' AND s.docstatus IN (1,2) AND json_extract(json_extract(s.payload_json,'$.rule_trace_json'),'$.payroll_rule.name')=OLD.name)
)
BEGIN SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_IMMUTABLE'); END;
