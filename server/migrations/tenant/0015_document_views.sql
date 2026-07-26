-- Who has opened a document (`track_seen`).
--
-- Held in its own table, never on the document. Frappe keeps a `_seen` list on the
-- row itself, which means every READ mutates the record: the version advances, a
-- revision appears in the history, and an audit shows an edit that nobody made.
-- Opening a document is not a change to it.

CREATE TABLE IF NOT EXISTS document_views (
  tenant_id TEXT NOT NULL,
  doctype TEXT NOT NULL,
  name TEXT NOT NULL,
  viewer TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count > 0),
  -- One row per viewer, so the list is "who has seen this" rather than a log that
  -- grows without bound every time somebody refreshes.
  PRIMARY KEY (tenant_id, doctype, name, viewer),
  FOREIGN KEY (tenant_id, doctype, name) REFERENCES documents(tenant_id, doctype, name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_views_doc ON document_views(tenant_id, doctype, name, last_seen_at DESC);
