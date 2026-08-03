-- WS15 follow-up guards for update paths and temporal workplace records.

CREATE TRIGGER IF NOT EXISTS ws15_task_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Workplace Task'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.start_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.start_date')) IS NULL
      THEN RAISE(ABORT,'WORKPLACE_TASK_START_DATE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.due_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.due_date')) IS NULL
      THEN RAISE(ABORT,'WORKPLACE_TASK_DUE_DATE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.start_date'),'')<>''
      AND COALESCE(json_extract(NEW.payload_json,'$.due_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.due_date')) < date(json_extract(NEW.payload_json,'$.start_date'))
      THEN RAISE(ABORT,'WORKPLACE_TASK_DUE_BEFORE_START')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_task_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Workplace Task'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.start_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.start_date')) IS NULL
      THEN RAISE(ABORT,'WORKPLACE_TASK_START_DATE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.due_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.due_date')) IS NULL
      THEN RAISE(ABORT,'WORKPLACE_TASK_DUE_DATE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.start_date'),'')<>''
      AND COALESCE(json_extract(NEW.payload_json,'$.due_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.due_date')) < date(json_extract(NEW.payload_json,'$.start_date'))
      THEN RAISE(ABORT,'WORKPLACE_TASK_DUE_BEFORE_START')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_announcement_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Workplace Announcement'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.publish_from'),'')<>''
      AND datetime(json_extract(NEW.payload_json,'$.publish_from')) IS NULL
      THEN RAISE(ABORT,'ANNOUNCEMENT_PUBLISH_FROM_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.publish_until'),'')<>''
      AND datetime(json_extract(NEW.payload_json,'$.publish_until')) IS NULL
      THEN RAISE(ABORT,'ANNOUNCEMENT_PUBLISH_UNTIL_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.publish_from'),'')<>''
      AND COALESCE(json_extract(NEW.payload_json,'$.publish_until'),'')<>''
      AND datetime(json_extract(NEW.payload_json,'$.publish_until')) < datetime(json_extract(NEW.payload_json,'$.publish_from'))
      THEN RAISE(ABORT,'ANNOUNCEMENT_END_BEFORE_START')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_announcement_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Workplace Announcement'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.publish_from'),'')<>''
      AND datetime(json_extract(NEW.payload_json,'$.publish_from')) IS NULL
      THEN RAISE(ABORT,'ANNOUNCEMENT_PUBLISH_FROM_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.publish_until'),'')<>''
      AND datetime(json_extract(NEW.payload_json,'$.publish_until')) IS NULL
      THEN RAISE(ABORT,'ANNOUNCEMENT_PUBLISH_UNTIL_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.publish_from'),'')<>''
      AND COALESCE(json_extract(NEW.payload_json,'$.publish_until'),'')<>''
      AND datetime(json_extract(NEW.payload_json,'$.publish_until')) < datetime(json_extract(NEW.payload_json,'$.publish_from'))
      THEN RAISE(ABORT,'ANNOUNCEMENT_END_BEFORE_START')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_obligation_update_guard
BEFORE UPDATE OF tenant_id,payload_json ON documents
WHEN NEW.doctype='Contract Obligation'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents c
      WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Contract'
        AND c.name=json_extract(NEW.payload_json,'$.contract')
        AND c.docstatus<>2
    ) THEN RAISE(ABORT,'CONTRACT_OBLIGATION_CONTRACT_NOT_FOUND')
    WHEN date(json_extract(NEW.payload_json,'$.due_date')) IS NULL
      THEN RAISE(ABORT,'CONTRACT_OBLIGATION_DUE_DATE_REQUIRED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_amendment_update_guard
BEFORE UPDATE OF tenant_id,payload_json,docstatus ON documents
WHEN NEW.doctype='Contract Amendment'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents c
      WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Contract'
        AND c.name=json_extract(NEW.payload_json,'$.contract')
        AND c.docstatus=1
    ) THEN RAISE(ABORT,'CONTRACT_AMENDMENT_REQUIRES_ACTIVE_CONTRACT')
    WHEN date(json_extract(NEW.payload_json,'$.effective_date')) IS NULL
      THEN RAISE(ABORT,'CONTRACT_AMENDMENT_EFFECTIVE_DATE_REQUIRED')
  END;
END;
