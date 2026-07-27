-- Persistent login throttling. Keys are salted hashes, never raw IP addresses or logins.
CREATE TABLE IF NOT EXISTS login_rate_limits (
  tenant_id TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('ip','account')),
  subject_hash TEXT NOT NULL CHECK (length(subject_hash)=64),
  window_start TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, dimension, subject_hash, window_start)
);
CREATE INDEX IF NOT EXISTS idx_login_rate_limits_expiry
  ON login_rate_limits(tenant_id, window_start);

-- Short-window burst protection for the anonymous Web Form write surface.
CREATE TABLE IF NOT EXISTS web_form_rate_limits (
  tenant_id TEXT NOT NULL,
  form_name TEXT NOT NULL,
  visitor TEXT NOT NULL CHECK (length(visitor)=64),
  window_start TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, form_name, visitor, window_start)
);
CREATE INDEX IF NOT EXISTS idx_web_form_rate_limits_expiry
  ON web_form_rate_limits(tenant_id, window_start);
