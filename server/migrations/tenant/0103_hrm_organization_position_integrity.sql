-- HRM organization-position integrity after recruitment migration 0046.
-- Effective-dated position assignments are authoritative org-chart/headcount evidence.

CREATE TRIGGER IF NOT EXISTS hr_position_assignment_overlap_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Employee Position Assignment' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents a
  WHERE a.tenant_id=NEW.tenant_id
    AND a.doctype='Employee Position Assignment'
    AND a.docstatus=1
    AND json_extract(a.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(a.payload_json,'$.from_date')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.to_date'),''),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(COALESCE(NULLIF(json_extract(a.payload_json,'$.to_date'),''),'9999-12-31'))
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_POSITION_ASSIGNMENT_OVERLAP');
END;

CREATE TRIGGER IF NOT EXISTS hr_position_assignment_overlap_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Employee Position Assignment' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents a
  WHERE a.tenant_id=NEW.tenant_id
    AND a.doc_key<>OLD.doc_key
    AND a.doctype='Employee Position Assignment'
    AND a.docstatus=1
    AND json_extract(a.payload_json,'$.employee')=json_extract(NEW.payload_json,'$.employee')
    AND date(json_extract(a.payload_json,'$.from_date')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.to_date'),''),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(COALESCE(NULLIF(json_extract(a.payload_json,'$.to_date'),''),'9999-12-31'))
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_POSITION_ASSIGNMENT_OVERLAP');
END;

CREATE TRIGGER IF NOT EXISTS hr_position_assignment_capacity_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Employee Position Assignment' AND NEW.docstatus=1
AND (
  SELECT COUNT(*) FROM documents a
  WHERE a.tenant_id=NEW.tenant_id
    AND a.doctype='Employee Position Assignment'
    AND a.docstatus=1
    AND json_extract(a.payload_json,'$.position')=json_extract(NEW.payload_json,'$.position')
    AND date(json_extract(a.payload_json,'$.from_date')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.to_date'),''),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(COALESCE(NULLIF(json_extract(a.payload_json,'$.to_date'),''),'9999-12-31'))
) >= COALESCE((
  SELECT CAST(json_extract(p.payload_json,'$.planned_seats') AS INTEGER)
  FROM documents p
  WHERE p.tenant_id=NEW.tenant_id
    AND p.doctype='Organization Position'
    AND p.name=json_extract(NEW.payload_json,'$.position')
    AND p.docstatus<>2
  LIMIT 1
),0)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_POSITION_CAPACITY_EXCEEDED');
END;

CREATE TRIGGER IF NOT EXISTS hr_position_assignment_capacity_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Employee Position Assignment' AND NEW.docstatus=1
AND (
  SELECT COUNT(*) FROM documents a
  WHERE a.tenant_id=NEW.tenant_id
    AND a.doc_key<>OLD.doc_key
    AND a.doctype='Employee Position Assignment'
    AND a.docstatus=1
    AND json_extract(a.payload_json,'$.position')=json_extract(NEW.payload_json,'$.position')
    AND date(json_extract(a.payload_json,'$.from_date')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.to_date'),''),'9999-12-31'))
    AND date(json_extract(NEW.payload_json,'$.from_date')) <= date(COALESCE(NULLIF(json_extract(a.payload_json,'$.to_date'),''),'9999-12-31'))
) >= COALESCE((
  SELECT CAST(json_extract(p.payload_json,'$.planned_seats') AS INTEGER)
  FROM documents p
  WHERE p.tenant_id=NEW.tenant_id
    AND p.doctype='Organization Position'
    AND p.name=json_extract(NEW.payload_json,'$.position')
    AND p.docstatus<>2
  LIMIT 1
),0)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_POSITION_CAPACITY_EXCEEDED');
END;

CREATE TRIGGER IF NOT EXISTS hr_position_scope_lock_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN OLD.doctype='Organization Position'
AND EXISTS(
  SELECT 1 FROM documents a
  WHERE a.tenant_id=OLD.tenant_id
    AND a.doctype='Employee Position Assignment'
    AND a.docstatus=1
    AND json_extract(a.payload_json,'$.position')=OLD.name
)
AND (
  COALESCE(json_extract(OLD.payload_json,'$.company'),'')<>COALESCE(json_extract(NEW.payload_json,'$.company'),'')
  OR COALESCE(json_extract(OLD.payload_json,'$.branch'),'')<>COALESCE(json_extract(NEW.payload_json,'$.branch'),'')
  OR COALESCE(json_extract(OLD.payload_json,'$.department'),'')<>COALESCE(json_extract(NEW.payload_json,'$.department'),'')
  OR COALESCE(json_extract(OLD.payload_json,'$.designation'),'')<>COALESCE(json_extract(NEW.payload_json,'$.designation'),'')
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_POSITION_SCOPE_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS hr_position_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Organization Position'
AND EXISTS(
  SELECT 1 FROM documents a
  WHERE a.tenant_id=OLD.tenant_id
    AND a.doctype='Employee Position Assignment'
    AND a.docstatus=1
    AND json_extract(a.payload_json,'$.position')=OLD.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_POSITION_IN_USE');
END;
