-- WS15 Digital Workplace / DMS / Contract domain integrity.
-- Metadata gives the generic client forms and workflows; these guards protect the same
-- invariants from every write path, including app callbacks and future integrations.

CREATE TRIGGER IF NOT EXISTS ws15_meeting_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Workplace Meeting'
BEGIN
  SELECT CASE
    WHEN datetime(json_extract(NEW.payload_json,'$.start_at')) IS NULL
      OR datetime(json_extract(NEW.payload_json,'$.end_at')) IS NULL
      THEN RAISE(ABORT,'WORKPLACE_MEETING_DATETIME_REQUIRED')
    WHEN datetime(json_extract(NEW.payload_json,'$.end_at')) < datetime(json_extract(NEW.payload_json,'$.start_at'))
      THEN RAISE(ABORT,'WORKPLACE_MEETING_END_BEFORE_START')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_meeting_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Workplace Meeting'
BEGIN
  SELECT CASE
    WHEN datetime(json_extract(NEW.payload_json,'$.start_at')) IS NULL
      OR datetime(json_extract(NEW.payload_json,'$.end_at')) IS NULL
      THEN RAISE(ABORT,'WORKPLACE_MEETING_DATETIME_REQUIRED')
    WHEN datetime(json_extract(NEW.payload_json,'$.end_at')) < datetime(json_extract(NEW.payload_json,'$.start_at'))
      THEN RAISE(ABORT,'WORKPLACE_MEETING_END_BEFORE_START')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_retention_policy_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Retention Policy'
BEGIN
  SELECT CASE
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.retention_days'),-1) AS INTEGER) < 0
      THEN RAISE(ABORT,'RETENTION_DAYS_INVALID')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.archive_after_days'),0) AS INTEGER) < 0
      THEN RAISE(ABORT,'ARCHIVE_AFTER_DAYS_INVALID')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.archive_after_days'),0) AS INTEGER)
       > CAST(COALESCE(json_extract(NEW.payload_json,'$.retention_days'),-1) AS INTEGER)
      THEN RAISE(ABORT,'ARCHIVE_AFTER_RETENTION')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_retention_policy_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Retention Policy'
BEGIN
  SELECT CASE
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.retention_days'),-1) AS INTEGER) < 0
      THEN RAISE(ABORT,'RETENTION_DAYS_INVALID')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.archive_after_days'),0) AS INTEGER) < 0
      THEN RAISE(ABORT,'ARCHIVE_AFTER_DAYS_INVALID')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.archive_after_days'),0) AS INTEGER)
       > CAST(COALESCE(json_extract(NEW.payload_json,'$.retention_days'),-1) AS INTEGER)
      THEN RAISE(ABORT,'ARCHIVE_AFTER_RETENTION')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_managed_document_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Managed Document'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.effective_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.effective_date')) IS NULL
      THEN RAISE(ABORT,'DOCUMENT_EFFECTIVE_DATE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.expiry_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.expiry_date')) IS NULL
      THEN RAISE(ABORT,'DOCUMENT_EXPIRY_DATE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.effective_date'),'')<>''
      AND COALESCE(json_extract(NEW.payload_json,'$.expiry_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.expiry_date')) < date(json_extract(NEW.payload_json,'$.effective_date'))
      THEN RAISE(ABORT,'DOCUMENT_EXPIRY_BEFORE_EFFECTIVE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_managed_document_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Managed Document'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.effective_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.effective_date')) IS NULL
      THEN RAISE(ABORT,'DOCUMENT_EFFECTIVE_DATE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.expiry_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.expiry_date')) IS NULL
      THEN RAISE(ABORT,'DOCUMENT_EXPIRY_DATE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.effective_date'),'')<>''
      AND COALESCE(json_extract(NEW.payload_json,'$.expiry_date'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.expiry_date')) < date(json_extract(NEW.payload_json,'$.effective_date'))
      THEN RAISE(ABORT,'DOCUMENT_EXPIRY_BEFORE_EFFECTIVE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Contract'
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_date')) IS NULL
      OR date(json_extract(NEW.payload_json,'$.end_date')) IS NULL
      THEN RAISE(ABORT,'CONTRACT_DATES_REQUIRED')
    WHEN date(json_extract(NEW.payload_json,'$.end_date')) < date(json_extract(NEW.payload_json,'$.effective_date'))
      THEN RAISE(ABORT,'CONTRACT_END_BEFORE_EFFECTIVE')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.contract_value'),0) AS REAL) < 0
      THEN RAISE(ABORT,'CONTRACT_VALUE_NEGATIVE')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.renewal_notice_days'),0) AS INTEGER) < 0
      THEN RAISE(ABORT,'CONTRACT_RENEWAL_NOTICE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.parent_contract'),'')=NEW.name
      THEN RAISE(ABORT,'CONTRACT_PARENT_SELF_REFERENCE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_update_guard
BEFORE UPDATE OF name,payload_json ON documents
WHEN NEW.doctype='Contract'
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_date')) IS NULL
      OR date(json_extract(NEW.payload_json,'$.end_date')) IS NULL
      THEN RAISE(ABORT,'CONTRACT_DATES_REQUIRED')
    WHEN date(json_extract(NEW.payload_json,'$.end_date')) < date(json_extract(NEW.payload_json,'$.effective_date'))
      THEN RAISE(ABORT,'CONTRACT_END_BEFORE_EFFECTIVE')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.contract_value'),0) AS REAL) < 0
      THEN RAISE(ABORT,'CONTRACT_VALUE_NEGATIVE')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.renewal_notice_days'),0) AS INTEGER) < 0
      THEN RAISE(ABORT,'CONTRACT_RENEWAL_NOTICE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.parent_contract'),'')=NEW.name
      THEN RAISE(ABORT,'CONTRACT_PARENT_SELF_REFERENCE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_obligation_insert_guard
BEFORE INSERT ON documents
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

CREATE TRIGGER IF NOT EXISTS ws15_contract_amendment_insert_guard
BEFORE INSERT ON documents
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

-- One preference per user/event. The user still owns ordinary document permissions,
-- but duplicate preference rows would make notification delivery nondeterministic.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws15_notification_preference_user_event
ON documents(
  tenant_id,
  json_extract(payload_json,'$.user_id'),
  json_extract(payload_json,'$.event_type')
)
WHERE doctype='Notification Preference' AND docstatus<>2;

CREATE TRIGGER IF NOT EXISTS ws15_notification_preference_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Notification Preference'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id
        AND u.user_id=json_extract(NEW.payload_json,'$.user_id')
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'NOTIFICATION_PREFERENCE_USER_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_notification_preference_update_guard
BEFORE UPDATE OF payload_json,docstatus ON documents
WHEN NEW.doctype='Notification Preference' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id
        AND u.user_id=json_extract(NEW.payload_json,'$.user_id')
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'NOTIFICATION_PREFERENCE_USER_INVALID')
  END;
END;
