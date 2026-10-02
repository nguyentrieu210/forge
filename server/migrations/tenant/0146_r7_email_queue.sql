-- R7 FRAPPE-17: durable provider-neutral Email Queue.
--
-- Notification and Workflow code enqueue intent only. Physical delivery is a separate,
-- retryable after-commit concern driven by tenant maintenance. Secrets/provider responses
-- are never persisted; only safe delivery evidence and the provider message id are kept.
CREATE TABLE IF NOT EXISTS email_queue (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('notification','workflow')),
  source_name TEXT NOT NULL,
  recipient_user TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sender_email TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_doctype TEXT,
  reference_name TEXT,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Sending','Sent','Error')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  send_after TEXT NOT NULL,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  sent_at TEXT,
  PRIMARY KEY (tenant_id, name),
  UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_email_queue_due
  ON email_queue(tenant_id, status, send_after, created_at);

CREATE INDEX IF NOT EXISTS idx_email_queue_reference
  ON email_queue(tenant_id, reference_doctype, reference_name, created_at);
