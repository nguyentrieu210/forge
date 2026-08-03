-- WS11 / G01-011: opt-in TOTP MFA with encrypted seeds and single-use recovery codes.
--
-- The seed is NEVER stored in plaintext. `secret_ciphertext` is an AES-GCM envelope
-- encrypted under an operator-managed MFA_KEK named by `kek_id`. Recovery codes are
-- high-entropy one-time values; only their SHA-256 digests are stored.
CREATE TABLE IF NOT EXISTS user_mfa_factors (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  factor_id TEXT NOT NULL,
  factor_type TEXT NOT NULL CHECK(factor_type='totp'),
  status TEXT NOT NULL CHECK(status IN ('pending','enabled','disabled')),
  secret_ciphertext TEXT NOT NULL,
  kek_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  disabled_at TEXT,
  activation_event_id TEXT,
  disable_event_id TEXT,
  last_used_step INTEGER,
  PRIMARY KEY (tenant_id,user_id,factor_id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,user_id) ON DELETE CASCADE,
  CHECK(json_valid(secret_ciphertext)),
  CHECK(
    (status='pending' AND confirmed_at IS NULL AND disabled_at IS NULL
      AND activation_event_id IS NULL AND disable_event_id IS NULL)
    OR (status='enabled' AND confirmed_at IS NOT NULL AND disabled_at IS NULL
      AND activation_event_id IS NOT NULL AND disable_event_id IS NULL)
    OR (status='disabled' AND disabled_at IS NOT NULL AND disable_event_id IS NOT NULL
      AND ((confirmed_at IS NULL AND activation_event_id IS NULL)
        OR (confirmed_at IS NOT NULL AND activation_event_id IS NOT NULL)))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mfa_one_current_totp
  ON user_mfa_factors(tenant_id,user_id)
  WHERE factor_type='totp' AND status IN ('pending','enabled');

CREATE INDEX IF NOT EXISTS idx_user_mfa_enabled
  ON user_mfa_factors(tenant_id,user_id,status);

CREATE TABLE IF NOT EXISTS user_mfa_recovery_codes (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  factor_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT,
  use_event_id TEXT,
  PRIMARY KEY (tenant_id,user_id,factor_id,code_hash),
  FOREIGN KEY (tenant_id,user_id,factor_id)
    REFERENCES user_mfa_factors(tenant_id,user_id,factor_id) ON DELETE CASCADE,
  CHECK(
    (used_at IS NULL AND use_event_id IS NULL)
    OR (used_at IS NOT NULL AND use_event_id IS NOT NULL AND length(trim(use_event_id))>0)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_recovery_unused
  ON user_mfa_recovery_codes(tenant_id,user_id,factor_id,used_at);

CREATE TRIGGER IF NOT EXISTS user_mfa_factor_identity_immutable
BEFORE UPDATE OF tenant_id,user_id,factor_id,factor_type,created_at ON user_mfa_factors
BEGIN
  SELECT RAISE(ABORT, 'MFA_FACTOR_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS user_mfa_factor_status_transition
BEFORE UPDATE OF status ON user_mfa_factors
WHEN NOT (
  (OLD.status='pending' AND NEW.status IN ('enabled','disabled'))
  OR (OLD.status='enabled' AND NEW.status='disabled')
  OR OLD.status=NEW.status
)
BEGIN
  SELECT RAISE(ABORT, 'MFA_STATUS_TRANSITION_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS user_mfa_activation_immutable
BEFORE UPDATE OF confirmed_at,activation_event_id ON user_mfa_factors
WHEN OLD.confirmed_at IS NOT NULL AND (
  NEW.confirmed_at IS NOT OLD.confirmed_at OR NEW.activation_event_id IS NOT OLD.activation_event_id
)
BEGIN
  SELECT RAISE(ABORT, 'MFA_ACTIVATION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS user_mfa_disable_immutable
BEFORE UPDATE OF disabled_at,disable_event_id ON user_mfa_factors
WHEN OLD.disabled_at IS NOT NULL AND (
  NEW.disabled_at IS NOT OLD.disabled_at OR NEW.disable_event_id IS NOT OLD.disable_event_id
)
BEGIN
  SELECT RAISE(ABORT, 'MFA_DISABLE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS user_mfa_recovery_use_immutable
BEFORE UPDATE OF used_at,use_event_id ON user_mfa_recovery_codes
WHEN OLD.used_at IS NOT NULL AND (
  NEW.used_at IS NOT OLD.used_at OR NEW.use_event_id IS NOT OLD.use_event_id
)
BEGIN
  SELECT RAISE(ABORT, 'MFA_RECOVERY_USE_IMMUTABLE');
END;
