-- Frappe Core Beta: enforceable user permissions and richer collaboration indexes.
CREATE TABLE IF NOT EXISTS user_permissions (
  tenant_id TEXT NOT NULL,
  user TEXT NOT NULL,
  allow_doctype TEXT NOT NULL,
  allow_name TEXT NOT NULL,
  applicable_for_doctype TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  hide_descendants INTEGER NOT NULL DEFAULT 0 CHECK (hide_descendants IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,user,allow_doctype,allow_name,applicable_for_doctype)
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_scope
  ON user_permissions(tenant_id,user,applicable_for_doctype,allow_doctype,allow_name);

CREATE INDEX IF NOT EXISTS idx_document_shares_lookup
  ON document_shares(tenant_id,doctype,user,can_read,name);
CREATE INDEX IF NOT EXISTS idx_versions_document
  ON versions(tenant_id,doc_key,version DESC);
