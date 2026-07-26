-- Frappe compatibility: cookie sessions need a user store, and the framework
-- fields the kernel was missing (who wrote last, what a document amends) become
-- real columns rather than payload keys so they can be indexed and guarded.

-- Users live in their OWN table, never in `documents`.
-- A row in `documents` is served to clients through the read APIs; a credential
-- stored in payload_json would eventually be handed to a browser. Keeping the
-- hash out of the document store makes that class of leak impossible rather
-- than merely unlikely.
CREATE TABLE IF NOT EXISTS users (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  user_type TEXT NOT NULL DEFAULT 'System User' CHECK (user_type IN ('System User','Website User')),
  -- `pbkdf2-sha256$iterations$salt$hash`. Empty means "no password login".
  password_hash TEXT NOT NULL DEFAULT '',
  -- Bumping the epoch invalidates every outstanding session for this user,
  -- which is how logout-everywhere and forced revocation work without a
  -- session table on the hot path.
  session_epoch INTEGER NOT NULL DEFAULT 1 CHECK (session_epoch > 0),
  language TEXT NOT NULL DEFAULT '',
  time_zone TEXT NOT NULL DEFAULT '',
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_users_enabled ON users(tenant_id, enabled, user_id);

CREATE TABLE IF NOT EXISTS roles (
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  desk_access INTEGER NOT NULL DEFAULT 1 CHECK (desk_access IN (0,1)),
  is_standard INTEGER NOT NULL DEFAULT 0 CHECK (is_standard IN (0,1)),
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, role)
);

CREATE TABLE IF NOT EXISTS user_roles (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, role),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(tenant_id, role, user_id);

-- A role must exist before it can be granted; otherwise a typo silently creates
-- a permission that no DocPerm will ever match, and the user appears to have
-- been granted access they do not have.
CREATE TRIGGER IF NOT EXISTS user_roles_require_role
BEFORE INSERT ON user_roles
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(SELECT 1 FROM roles r WHERE r.tenant_id=NEW.tenant_id AND r.role=NEW.role)
      THEN RAISE(ABORT,'ROLE_NOT_FOUND')
    WHEN (SELECT disabled FROM roles r WHERE r.tenant_id=NEW.tenant_id AND r.role=NEW.role)=1
      THEN RAISE(ABORT,'ROLE_DISABLED')
  END;
END;

-- Who wrote last. The kernel stored `owner` only, so an audit could establish
-- who created a document but not who changed it.
ALTER TABLE documents ADD COLUMN modified_by TEXT NOT NULL DEFAULT '';

-- Frappe's amend chain: a cancelled document is corrected by creating a new one
-- that points back at it. Held as a column (not a payload key) so the chain can
-- be indexed and the one-amendment-per-source rule enforced in SQL.
ALTER TABLE documents ADD COLUMN amended_from TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_amended_from ON documents(tenant_id, doctype, amended_from);

-- Only a cancelled document may be amended, and only once. Both halves matter:
-- amending a live document would duplicate an active voucher, and amending the
-- same cancelled document twice would fork the chain into two successors that
-- each believe they are authoritative.
CREATE TRIGGER IF NOT EXISTS documents_amend_guard
BEFORE INSERT ON documents
WHEN NEW.amended_from IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.doctype AND d.name=NEW.amended_from AND d.docstatus=2)
      THEN RAISE(ABORT,'AMEND_SOURCE_NOT_CANCELLED')
    WHEN EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.doctype AND d.amended_from=NEW.amended_from AND d.name<>NEW.name)
      THEN RAISE(ABORT,'AMEND_SOURCE_ALREADY_AMENDED')
  END;
END;

-- Tags (`_user_tags` in Frappe).
CREATE TABLE IF NOT EXISTS document_tags (
  tenant_id TEXT NOT NULL,
  doctype TEXT NOT NULL,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, doctype, name, tag)
);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tenant_id, tag, doctype, name);

-- Global search index.
-- Denormalised text with a LIKE probe rather than FTS5: the ranking is
-- predictable, it needs no extension, and the row count per tenant is bounded by
-- the document count. Search still runs through the permission layer — this
-- table is a candidate source, never an authorisation bypass.
CREATE TABLE IF NOT EXISTS document_search (
  tenant_id TEXT NOT NULL,
  doctype TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, doctype, name),
  FOREIGN KEY (tenant_id, doctype, name) REFERENCES documents(tenant_id, doctype, name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_search_scan ON document_search(tenant_id, doctype, modified_at DESC);

-- Translation catalogue. The client has a translator core but no source of
-- strings; this is that source.
CREATE TABLE IF NOT EXISTS translations (
  tenant_id TEXT NOT NULL,
  language TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, language, context, source_text)
);
CREATE INDEX IF NOT EXISTS idx_translations_language ON translations(tenant_id, language);
