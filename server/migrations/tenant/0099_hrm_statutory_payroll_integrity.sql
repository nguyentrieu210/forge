-- HRM statutory payroll evaluator integrity hardening.
--
-- This migration follows 0041 payroll-rule integrity and 0042 VN accounting-period
-- hardening without rewriting either applied migration. It tightens the formula
-- envelope, covers both master storage paths used by Forge, protects typed statutory
-- assignment inputs, and prevents one statutory output from being double-counted.

DROP TRIGGER IF EXISTS hr_payroll_rule_validate_insert_guard;
DROP TRIGGER IF EXISTS hr_payroll_rule_validate_update_guard;

CREATE TRIGGER hr_payroll_rule_validate_insert_guard
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
  OR NOT EXISTS (
    SELECT 1 FROM json_each(json_extract(json_extract(NEW.data_json,'$.formula_json'),'$.outputs'))
  )
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_INVALID');
END;

CREATE TRIGGER hr_payroll_rule_validate_update_guard
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
  OR NOT EXISTS (
    SELECT 1 FROM json_each(json_extract(json_extract(NEW.data_json,'$.formula_json'),'$.outputs'))
  )
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_INVALID');
END;

-- User-created first-party master DocTypes may live in documents while seeded masters
-- live in master_records. The same tenant/name must never exist in both stores.
CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_master_shadow_insert_guard
BEFORE INSERT ON master_records
WHEN NEW.record_type='VN Payroll Rule'
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='VN Payroll Rule'
    AND d.name=NEW.name
    AND d.docstatus<>2
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_PAYROLL_RULE_DUPLICATE_STORAGE');
END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_master_shadow_update_guard
BEFORE UPDATE OF record_type,name ON master_records
WHEN NEW.record_type='VN Payroll Rule'
AND EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id
    AND d.doctype='VN Payroll Rule'
    AND d.name=NEW.name
    AND d.docstatus<>2
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_PAYROLL_RULE_DUPLICATE_STORAGE');
END;

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
  OR NOT EXISTS (
    SELECT 1 FROM json_each(json_extract(json_extract(NEW.payload_json,'$.formula_json'),'$.outputs'))
  )
  OR EXISTS(
    SELECT 1 FROM master_records m
    WHERE m.tenant_id=NEW.tenant_id
      AND m.record_type='VN Payroll Rule'
      AND m.name=NEW.name
  )
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_INVALID');
END;

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
  OR NOT EXISTS (
    SELECT 1 FROM json_each(json_extract(json_extract(NEW.payload_json,'$.formula_json'),'$.outputs'))
  )
  OR EXISTS(
    SELECT 1 FROM master_records m
    WHERE m.tenant_id=NEW.tenant_id
      AND m.record_type='VN Payroll Rule'
      AND m.name=NEW.name
  )
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_document_immutable_update_guard
BEFORE UPDATE OF doctype,name,docstatus,payload_json ON documents
WHEN OLD.doctype='VN Payroll Rule'
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
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS hr_payroll_rule_document_immutable_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='VN Payroll Rule'
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
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_RULE_IMMUTABLE');
END;

-- Statutory inputs are typed child rows, not executable expressions. Duplicate keys
-- in one assignment are rejected at the database boundary. Keep key syntax aligned
-- with the evaluator so direct database writes cannot bypass controller validation.
CREATE TRIGGER IF NOT EXISTS hr_statutory_input_insert_guard
BEFORE INSERT ON document_children
WHEN NEW.fieldname='statutory_inputs'
AND (
  NEW.child_doctype<>'Payroll Rule Input Value'
  OR COALESCE(json_extract(NEW.payload_json,'$.input_key'),'')=''
  OR length(json_extract(NEW.payload_json,'$.input_key'))>64
  OR substr(json_extract(NEW.payload_json,'$.input_key'),1,1) NOT GLOB '[A-Za-z]'
  OR json_extract(NEW.payload_json,'$.input_key') GLOB '*[^A-Za-z0-9_]*'
  OR COALESCE(json_type(NEW.payload_json,'$.value'),'') NOT IN ('text','integer','real','true','false')
  OR (json_type(NEW.payload_json,'$.value')='text' AND trim(json_extract(NEW.payload_json,'$.value'))='')
  OR EXISTS(
    SELECT 1 FROM document_children c
    WHERE c.tenant_id=NEW.tenant_id
      AND c.parent_key=NEW.parent_key
      AND c.fieldname='statutory_inputs'
      AND json_extract(c.payload_json,'$.input_key')=json_extract(NEW.payload_json,'$.input_key')
  )
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_STATUTORY_INPUT_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS hr_statutory_input_update_guard
BEFORE UPDATE OF parent_key,fieldname,child_doctype,payload_json ON document_children
WHEN OLD.fieldname='statutory_inputs' OR NEW.fieldname='statutory_inputs'
BEGIN
  SELECT CASE
    WHEN NEW.fieldname<>'statutory_inputs'
      OR NEW.child_doctype<>'Payroll Rule Input Value'
      OR COALESCE(json_extract(NEW.payload_json,'$.input_key'),'')=''
      OR length(json_extract(NEW.payload_json,'$.input_key'))>64
      OR substr(json_extract(NEW.payload_json,'$.input_key'),1,1) NOT GLOB '[A-Za-z]'
      OR json_extract(NEW.payload_json,'$.input_key') GLOB '*[^A-Za-z0-9_]*'
      OR COALESCE(json_type(NEW.payload_json,'$.value'),'') NOT IN ('text','integer','real','true','false')
      OR (json_type(NEW.payload_json,'$.value')='text' AND trim(json_extract(NEW.payload_json,'$.value'))='')
      THEN RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_STATUTORY_INPUT_INVALID')
    WHEN EXISTS(
      SELECT 1 FROM document_children c
      WHERE c.tenant_id=NEW.tenant_id
        AND c.parent_key=NEW.parent_key
        AND c.fieldname='statutory_inputs'
        AND c.row_id<>OLD.row_id
        AND json_extract(c.payload_json,'$.input_key')=json_extract(NEW.payload_json,'$.input_key')
    ) THEN RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_STATUTORY_INPUT_INVALID')
  END;
END;

-- A child statutory input is part of the consumed Salary Structure Assignment source.
-- Freeze only the exact assignment named by a submitted Salary Slip, rather than every
-- overlapping assignment for the employee/company.
CREATE TRIGGER IF NOT EXISTS hr_statutory_input_freeze_insert_guard
BEFORE INSERT ON document_children
WHEN NEW.fieldname='statutory_inputs'
AND EXISTS(
  SELECT 1 FROM documents a
  JOIN documents s ON s.tenant_id=a.tenant_id
  WHERE a.tenant_id=NEW.tenant_id
    AND a.doc_key=NEW.parent_key
    AND a.doctype='Salary Structure Assignment'
    AND a.docstatus=1
    AND s.doctype='Salary Slip'
    AND s.docstatus=1
    AND json_extract(s.payload_json,'$.salary_structure_assignment')=a.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS hr_statutory_input_freeze_update_guard
BEFORE UPDATE ON document_children
WHEN (OLD.fieldname='statutory_inputs' OR NEW.fieldname='statutory_inputs')
AND (
  EXISTS(
    SELECT 1 FROM documents a
    JOIN documents s ON s.tenant_id=a.tenant_id
    WHERE a.tenant_id=OLD.tenant_id
      AND a.doc_key=OLD.parent_key
      AND a.doctype='Salary Structure Assignment'
      AND a.docstatus=1
      AND s.doctype='Salary Slip'
      AND s.docstatus=1
      AND json_extract(s.payload_json,'$.salary_structure_assignment')=a.name
  )
  OR EXISTS(
    SELECT 1 FROM documents a
    JOIN documents s ON s.tenant_id=a.tenant_id
    WHERE a.tenant_id=NEW.tenant_id
      AND a.doc_key=NEW.parent_key
      AND a.doctype='Salary Structure Assignment'
      AND a.docstatus=1
      AND s.doctype='Salary Slip'
      AND s.docstatus=1
      AND json_extract(s.payload_json,'$.salary_structure_assignment')=a.name
  )
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS hr_statutory_input_freeze_delete_guard
BEFORE DELETE ON document_children
WHEN OLD.fieldname='statutory_inputs'
AND EXISTS(
  SELECT 1 FROM documents a
  JOIN documents s ON s.tenant_id=a.tenant_id
  WHERE a.tenant_id=OLD.tenant_id
    AND a.doc_key=OLD.parent_key
    AND a.doctype='Salary Structure Assignment'
    AND a.docstatus=1
    AND s.doctype='Salary Slip'
    AND s.docstatus=1
    AND json_extract(s.payload_json,'$.salary_structure_assignment')=a.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_PAYROLL_SOURCE_LOCKED');
END;

-- Payroll-rule output mappings use the same key grammar as evaluator outputs. A
-- statutory output is one legal amount, so mapping it twice would double-count it.
CREATE TRIGGER IF NOT EXISTS hr_salary_structure_rule_output_validate_insert_guard
BEFORE INSERT ON document_children
WHEN NEW.fieldname='components'
  AND NEW.child_doctype='Salary Structure Component'
  AND json_extract(NEW.payload_json,'$.amount_type')='Payroll Rule Output'
  AND (
    COALESCE(json_extract(NEW.payload_json,'$.rule_output_key'),'')=''
    OR length(json_extract(NEW.payload_json,'$.rule_output_key'))>64
    OR substr(json_extract(NEW.payload_json,'$.rule_output_key'),1,1) NOT GLOB '[A-Za-z]'
    OR json_extract(NEW.payload_json,'$.rule_output_key') GLOB '*[^A-Za-z0-9_]*'
  )
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_PAYROLL_RULE_OUTPUT_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS hr_salary_structure_rule_output_validate_update_guard
BEFORE UPDATE OF parent_key,fieldname,child_doctype,payload_json ON document_children
WHEN NEW.fieldname='components'
  AND NEW.child_doctype='Salary Structure Component'
  AND json_extract(NEW.payload_json,'$.amount_type')='Payroll Rule Output'
  AND (
    COALESCE(json_extract(NEW.payload_json,'$.rule_output_key'),'')=''
    OR length(json_extract(NEW.payload_json,'$.rule_output_key'))>64
    OR substr(json_extract(NEW.payload_json,'$.rule_output_key'),1,1) NOT GLOB '[A-Za-z]'
    OR json_extract(NEW.payload_json,'$.rule_output_key') GLOB '*[^A-Za-z0-9_]*'
  )
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_PAYROLL_RULE_OUTPUT_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS hr_salary_structure_rule_output_unique_insert_guard
BEFORE INSERT ON document_children
WHEN NEW.fieldname='components'
  AND NEW.child_doctype='Salary Structure Component'
  AND json_extract(NEW.payload_json,'$.amount_type')='Payroll Rule Output'
  AND EXISTS(
    SELECT 1 FROM document_children c
    WHERE c.tenant_id=NEW.tenant_id
      AND c.parent_key=NEW.parent_key
      AND c.fieldname='components'
      AND c.child_doctype='Salary Structure Component'
      AND json_extract(c.payload_json,'$.amount_type')='Payroll Rule Output'
      AND json_extract(c.payload_json,'$.rule_output_key')=json_extract(NEW.payload_json,'$.rule_output_key')
  )
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_PAYROLL_RULE_OUTPUT_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_salary_structure_rule_output_unique_update_guard
BEFORE UPDATE OF parent_key,fieldname,child_doctype,payload_json ON document_children
WHEN NEW.fieldname='components'
  AND NEW.child_doctype='Salary Structure Component'
  AND json_extract(NEW.payload_json,'$.amount_type')='Payroll Rule Output'
  AND EXISTS(
    SELECT 1 FROM document_children c
    WHERE c.tenant_id=NEW.tenant_id
      AND c.parent_key=NEW.parent_key
      AND c.fieldname='components'
      AND c.child_doctype='Salary Structure Component'
      AND c.row_id<>OLD.row_id
      AND json_extract(c.payload_json,'$.amount_type')='Payroll Rule Output'
      AND json_extract(c.payload_json,'$.rule_output_key')=json_extract(NEW.payload_json,'$.rule_output_key')
  )
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_PAYROLL_RULE_OUTPUT_DUPLICATE');
END;
