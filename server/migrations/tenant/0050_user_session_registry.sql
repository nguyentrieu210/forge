-- WS11 / G01-017: per-session inventory and revocation.
--
-- Existing signed sid cookies remain valid when they do not carry a session_id; this
-- table applies to newly issued sessions and therefore rolls out without a forced global
-- logout. The user's session_epoch remains the authoritative all-sessions kill switch.
CREATE TABLE IF NOT EXISTS user_sessions (
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  revoke_reason TEXT,
  revocation_event_id TEXT,
  PRIMARY KEY (tenant_id, session_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, user_id) ON DELETE CASCADE,
  CHECK(revoked_by IS NULL OR length(revoked_by) <= 320),
  CHECK(revoke_reason IS NULL OR length(revoke_reason) <= 500),
  CHECK(revocation_event_id IS NULL OR length(revocation_event_id) <= 160),
  CHECK(
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL AND revocation_event_id IS NULL)
    OR
    (revoked_at IS NOT NULL AND length(revoked_at) > 0
      AND revoked_by IS NOT NULL AND length(trim(revoked_by)) > 0
      AND revoke_reason IS NOT NULL AND length(trim(revoke_reason)) > 0
      AND revocation_event_id IS NOT NULL AND length(trim(revocation_event_id)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON user_sessions(tenant_id, user_id, revoked_at, expires_at DESC);

-- Session identity cannot be reassigned after issuance. Mutable lifecycle fields are
-- limited to last_seen/expiry extension and a single one-way revocation transition.
CREATE TRIGGER IF NOT EXISTS user_sessions_identity_immutable
BEFORE UPDATE OF tenant_id,session_id,user_id,issued_at ON user_sessions
BEGIN
  SELECT RAISE(ABORT, 'SESSION_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS user_sessions_revocation_immutable
BEFORE UPDATE OF revoked_at,revoked_by,revoke_reason,revocation_event_id ON user_sessions
WHEN OLD.revoked_at IS NOT NULL AND (
  NEW.revoked_at IS NOT OLD.revoked_at
  OR NEW.revoked_by IS NOT OLD.revoked_by
  OR NEW.revoke_reason IS NOT OLD.revoke_reason
  OR NEW.revocation_event_id IS NOT OLD.revocation_event_id
)
BEGIN
  SELECT RAISE(ABORT, 'SESSION_REVOCATION_IMMUTABLE');
END;
