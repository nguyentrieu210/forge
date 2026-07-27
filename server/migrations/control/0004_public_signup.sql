CREATE TABLE IF NOT EXISTS signup_verifications (
  signup_id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  desired_slug TEXT NOT NULL,
  signup_payload_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK(status IN ('pending_verification','verified','expired','cancelled')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signup_verifications_email_created
  ON signup_verifications(email_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signup_verifications_ip_created
  ON signup_verifications(ip_hash, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_verifications_pending_slug
  ON signup_verifications(desired_slug)
  WHERE status = 'pending_verification';

CREATE INDEX IF NOT EXISTS idx_signup_verifications_expiry
  ON signup_verifications(status, expires_at);
