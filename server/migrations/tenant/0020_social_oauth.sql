ALTER TABLE social_pages ADD COLUMN page_key_hmac TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_pages_directory_key
  ON social_pages(tenant_id, page_key_hmac);
