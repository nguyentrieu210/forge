-- R7 / FRAPPE-05: Frappe-compatible per-user API key/secret lifecycle.
--
-- The raw secret is NEVER persisted. Frappe exposes the generated secret once; Forge
-- stores only a salted SHA-256 digest because generated secrets carry high entropy.
-- Re-generating keys rotates the previous active credential, matching Frappe User's
-- single api_key/api_secret pair rather than silently accumulating credentials.
CREATE TABLE IF NOT EXISTS user_api_credentials (
  tenant_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  secret_salt TEXT NOT NULL,
  secret_hash TEXT NOT NULL CHECK (length(secret_hash)=64),
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  revoke_reason TEXT,
  PRIMARY KEY (tenant_id, credential_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, user_id) ON DELETE CASCADE,
  CHECK (length(api_key) BETWEEN 15 AND 128),
  CHECK (length(secret_salt) BETWEEN 16 AND 128),
  CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR
    (revoked_at IS NOT NULL
      AND revoked_by IS NOT NULL AND length(trim(revoked_by)) > 0
      AND revoke_reason IS NOT NULL AND length(trim(revoke_reason)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_credentials_one_active
  ON user_api_credentials(tenant_id,user_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_credentials_key_active
  ON user_api_credentials(tenant_id,api_key)
  WHERE revoked_at IS NULL;

CREATE TRIGGER IF NOT EXISTS user_api_credentials_identity_immutable
BEFORE UPDATE OF tenant_id,credential_id,user_id,api_key,secret_salt,secret_hash,created_at
ON user_api_credentials
BEGIN
  SELECT RAISE(ABORT, 'API_CREDENTIAL_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS user_api_credentials_revocation_immutable
BEFORE UPDATE OF revoked_at,revoked_by,revoke_reason ON user_api_credentials
WHEN OLD.revoked_at IS NOT NULL AND (
  NEW.revoked_at IS NOT OLD.revoked_at
  OR NEW.revoked_by IS NOT OLD.revoked_by
  OR NEW.revoke_reason IS NOT OLD.revoke_reason
)
BEGIN
  SELECT RAISE(ABORT, 'API_CREDENTIAL_REVOCATION_IMMUTABLE');
END;
