-- WS15 collaboration integrity.
--
-- Assign/share state points at tenant-local login identities. These rows are operational
-- access/work context, so creating a NEW active relationship to a missing, disabled or
-- Website-only account is never useful and is usually a typo that otherwise survives
-- forever as a ghost assignee/share.
--
-- Existing historical assignment rows are not rewritten. Closed/Cancelled rows may keep
-- pointing at a now-disabled System User so the audit trail still says who was assigned.

CREATE TRIGGER IF NOT EXISTS ws15_assignment_assignee_insert_guard
BEFORE INSERT ON assignments
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.assigned_to
    ) THEN RAISE(ABORT,'ASSIGNEE_NOT_FOUND')
    WHEN NEW.status='Open' AND NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.assigned_to
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'ASSIGNEE_NOT_ACTIVE_SYSTEM_USER')
    WHEN NEW.status='Open' AND EXISTS(
      SELECT 1 FROM assignments a
      WHERE a.tenant_id=NEW.tenant_id
        AND a.doctype=NEW.doctype
        AND a.name=NEW.name
        AND a.assigned_to=NEW.assigned_to
        AND a.status='Open'
    ) THEN RAISE(ABORT,'DUPLICATE_OPEN_ASSIGNMENT')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_assignment_assignee_update_guard
BEFORE UPDATE OF tenant_id,doctype,name,assigned_to,status ON assignments
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.assigned_to
    ) THEN RAISE(ABORT,'ASSIGNEE_NOT_FOUND')
    WHEN NEW.status='Open' AND NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.assigned_to
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'ASSIGNEE_NOT_ACTIVE_SYSTEM_USER')
    WHEN NEW.status='Open' AND EXISTS(
      SELECT 1 FROM assignments a
      WHERE a.tenant_id=NEW.tenant_id
        AND a.doctype=NEW.doctype
        AND a.name=NEW.name
        AND a.assigned_to=NEW.assigned_to
        AND a.status='Open'
        AND a.assignment_id<>OLD.assignment_id
    ) THEN RAISE(ABORT,'DUPLICATE_OPEN_ASSIGNMENT')
  END;
END;

-- Validate the ACTIVE state that predates this migration by routing a no-op write through
-- the same update trigger. Closed/Cancelled history is deliberately untouched. If an old
-- tenant has a ghost/disabled/duplicate Open assignment, rollout stops for explicit
-- reconciliation instead of grandfathering invalid live state.
UPDATE assignments
SET assigned_to=assigned_to
WHERE status='Open';

-- Race-safe invariant after the preflight above. The index prevents two concurrent
-- writers from both observing "no duplicate" and inserting an Open assignment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_one_open_per_user_document
ON assignments(tenant_id,doctype,name,assigned_to)
WHERE status='Open';

CREATE TRIGGER IF NOT EXISTS ws15_document_share_user_insert_guard
BEFORE INSERT ON document_shares
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.user
    ) THEN RAISE(ABORT,'SHARE_USER_NOT_FOUND')
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.user
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'SHARE_USER_NOT_ACTIVE_SYSTEM_USER')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_document_share_user_update_guard
BEFORE UPDATE OF tenant_id,user ON document_shares
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.user
    ) THEN RAISE(ABORT,'SHARE_USER_NOT_FOUND')
    WHEN NOT EXISTS(
      SELECT 1 FROM users u
      WHERE u.tenant_id=NEW.tenant_id AND u.user_id=NEW.user
        AND u.enabled=1 AND u.user_type='System User'
    ) THEN RAISE(ABORT,'SHARE_USER_NOT_ACTIVE_SYSTEM_USER')
  END;
END;

-- Shares are live access grants, not historical rows, so every pre-existing share is
-- validated. No-op update keeps the grant unchanged while making invalid legacy targets
-- fail migration explicitly.
UPDATE document_shares
SET user=user;
