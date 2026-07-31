-- Append-only tenant audit for access-administration mutations.
--
-- The application writes this row in the same D1 batch as the permission/user
-- mutation. Passwords, hashes, cookies, tokens and trusted identity envelopes are
-- deliberately absent from the schema and must never be placed in before/after JSON.

CREATE TABLE IF NOT EXISTS rbac_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  actor_user_id TEXT NOT NULL CHECK (length(trim(actor_user_id)) > 0),
  target_user_id TEXT,
  before_json TEXT NOT NULL DEFAULT 'null' CHECK (json_valid(before_json)),
  after_json TEXT NOT NULL DEFAULT 'null' CHECK (json_valid(after_json)),
  reason TEXT,
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  trace_id TEXT NOT NULL CHECK (length(trim(trace_id)) > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS rbac_audit_events_tenant_time
  ON rbac_audit_events(tenant_id, created_at DESC, event_id);

CREATE INDEX IF NOT EXISTS rbac_audit_events_target_time
  ON rbac_audit_events(tenant_id, target_user_id, created_at DESC, event_id)
  WHERE target_user_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS rbac_audit_events_no_update
BEFORE UPDATE ON rbac_audit_events
BEGIN
  SELECT RAISE(ABORT, 'RBAC_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS rbac_audit_events_no_delete
BEFORE DELETE ON rbac_audit_events
BEGIN
  SELECT RAISE(ABORT, 'RBAC_AUDIT_APPEND_ONLY');
END;

-- Database-level backstop for concurrent admin mutations. Application guards give
-- actionable errors; these triggers make two simultaneous requests unable to both
-- remove the final enabled tenant administrator.
CREATE TRIGGER IF NOT EXISTS users_keep_last_tenant_admin
BEFORE UPDATE OF enabled ON users
WHEN OLD.enabled=1 AND NEW.enabled=0
 AND (
   OLD.user_id='Administrator'
   OR EXISTS (
     SELECT 1 FROM user_roles ur
     JOIN roles r ON r.tenant_id=ur.tenant_id AND r.role=ur.role
     WHERE ur.tenant_id=OLD.tenant_id AND ur.user_id=OLD.user_id
       AND ur.role IN ('Administrator','System Manager') AND r.disabled=0
   )
 )
 AND (
   SELECT COUNT(*) FROM users u
   WHERE u.tenant_id=OLD.tenant_id AND u.enabled=1
     AND (
       u.user_id='Administrator'
       OR EXISTS (
         SELECT 1 FROM user_roles ur2
         JOIN roles r2 ON r2.tenant_id=ur2.tenant_id AND r2.role=ur2.role
         WHERE ur2.tenant_id=u.tenant_id AND ur2.user_id=u.user_id
           AND ur2.role IN ('Administrator','System Manager') AND r2.disabled=0
       )
     )
 ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'RBAC_LAST_ADMIN_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS user_roles_keep_last_tenant_admin
BEFORE DELETE ON user_roles
WHEN OLD.role IN ('Administrator','System Manager')
 AND OLD.user_id<>'Administrator'
 AND EXISTS (
   SELECT 1 FROM users u
   WHERE u.tenant_id=OLD.tenant_id AND u.user_id=OLD.user_id AND u.enabled=1
 )
 AND NOT EXISTS (
   SELECT 1 FROM user_roles other
   JOIN roles r ON r.tenant_id=other.tenant_id AND r.role=other.role
   WHERE other.tenant_id=OLD.tenant_id AND other.user_id=OLD.user_id
     AND other.role IN ('Administrator','System Manager')
     AND other.role<>OLD.role AND r.disabled=0
 )
 AND (
   SELECT COUNT(*) FROM users u
   WHERE u.tenant_id=OLD.tenant_id AND u.enabled=1
     AND (
       u.user_id='Administrator'
       OR EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r2 ON r2.tenant_id=ur.tenant_id AND r2.role=ur.role
         WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.user_id
           AND ur.role IN ('Administrator','System Manager') AND r2.disabled=0
       )
     )
 ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'RBAC_LAST_ADMIN_REQUIRED');
END;
