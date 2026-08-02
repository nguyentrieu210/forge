-- One Employee record represents one employment cycle.
-- Rehire must create a new Employee record so immutable joining/user lineage stays intact.

DROP TRIGGER IF EXISTS hr_hiring_completion_unique_insert_guard;
DROP TRIGGER IF EXISTS hr_hiring_completion_unique_update_guard;

CREATE TRIGGER hr_hiring_completion_unique_insert_guard
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

CREATE TRIGGER hr_hiring_completion_unique_update_guard
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
