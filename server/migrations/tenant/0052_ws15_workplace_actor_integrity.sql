-- WS15 actor/recipient integrity.
--
-- User-facing workplace records carry user ids in JSON for display/filtering, but the
-- canonical document owner is the authenticated actor recorded by the kernel. Whenever a
-- record represents "my request", "my meeting" or "my notification preference", those
-- identities must agree or a caller could write state on somebody else's behalf.

CREATE TRIGGER IF NOT EXISTS ws15_internal_request_owner_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Internal Request'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.requester'),'')<>NEW.owner
      THEN RAISE(ABORT,'INTERNAL_REQUEST_REQUESTER_MUST_MATCH_OWNER')
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.owner
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'INTERNAL_REQUEST_OWNER_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_internal_request_owner_update_guard
BEFORE UPDATE OF owner,payload_json ON documents
WHEN NEW.doctype='Internal Request'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.requester'),'')<>NEW.owner
      THEN RAISE(ABORT,'INTERNAL_REQUEST_REQUESTER_MUST_MATCH_OWNER')
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.owner
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'INTERNAL_REQUEST_OWNER_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_workplace_meeting_owner_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Workplace Meeting'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.organizer'),'')<>NEW.owner
      THEN RAISE(ABORT,'WORKPLACE_MEETING_ORGANIZER_MUST_MATCH_OWNER')
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.owner
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'WORKPLACE_MEETING_OWNER_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_workplace_meeting_owner_update_guard
BEFORE UPDATE OF owner,payload_json ON documents
WHEN NEW.doctype='Workplace Meeting'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.organizer'),'')<>NEW.owner
      THEN RAISE(ABORT,'WORKPLACE_MEETING_ORGANIZER_MUST_MATCH_OWNER')
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.owner
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'WORKPLACE_MEETING_OWNER_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_notification_preference_owner_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Notification Preference'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.user_id'),'')<>NEW.owner
      THEN RAISE(ABORT,'NOTIFICATION_PREFERENCE_USER_MUST_MATCH_OWNER')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_notification_preference_owner_update_guard
BEFORE UPDATE OF owner,payload_json,docstatus ON documents
WHEN NEW.doctype='Notification Preference' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.user_id'),'')<>NEW.owner
      THEN RAISE(ABORT,'NOTIFICATION_PREFERENCE_USER_MUST_MATCH_OWNER')
  END;
END;

-- Task/obligation assignees are operational actors, not free-form labels. Empty is
-- permitted for an unassigned task, but a named recipient must be an active System User
-- in this tenant. This is storage-level because integrations and app workers can write
-- without going through the Desk picker.
CREATE TRIGGER IF NOT EXISTS ws15_workplace_task_assignee_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Workplace Task'
  AND COALESCE(json_extract(NEW.payload_json,'$.assigned_to'),'')<>''
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM users u
    WHERE u.tenant_id=NEW.tenant_id
      AND u.user_id=json_extract(NEW.payload_json,'$.assigned_to')
      AND u.enabled=1 AND u.user_type='System User'
  ) THEN RAISE(ABORT,'WORKPLACE_TASK_ASSIGNEE_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_workplace_task_assignee_update_guard
BEFORE UPDATE OF tenant_id,payload_json ON documents
WHEN NEW.doctype='Workplace Task'
  AND COALESCE(json_extract(NEW.payload_json,'$.assigned_to'),'')<>''
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM users u
    WHERE u.tenant_id=NEW.tenant_id
      AND u.user_id=json_extract(NEW.payload_json,'$.assigned_to')
      AND u.enabled=1 AND u.user_type='System User'
  ) THEN RAISE(ABORT,'WORKPLACE_TASK_ASSIGNEE_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_obligation_owner_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Contract Obligation'
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM users u
    WHERE u.tenant_id=NEW.tenant_id
      AND u.user_id=json_extract(NEW.payload_json,'$.owner_user')
      AND u.enabled=1 AND u.user_type='System User'
  ) THEN RAISE(ABORT,'CONTRACT_OBLIGATION_OWNER_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_obligation_owner_update_guard
BEFORE UPDATE OF tenant_id,payload_json ON documents
WHEN NEW.doctype='Contract Obligation'
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM users u
    WHERE u.tenant_id=NEW.tenant_id
      AND u.user_id=json_extract(NEW.payload_json,'$.owner_user')
      AND u.enabled=1 AND u.user_type='System User'
  ) THEN RAISE(ABORT,'CONTRACT_OBLIGATION_OWNER_INVALID') END;
END;
