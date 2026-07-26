-- Desk view state: kanban boards and the notification log.
--
-- Both are per-user working state rather than business data, which is why they are
-- their own tables and not documents: they must not appear in lists, reports or
-- the audit trail of the business the tenant runs.

CREATE TABLE IF NOT EXISTS kanban_boards (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  reference_doctype TEXT NOT NULL,
  -- The Select field whose options become the columns.
  field_name TEXT NOT NULL,
  -- Column definitions, in display order.
  columns_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(columns_json)),
  private INTEGER NOT NULL DEFAULT 0 CHECK (private IN (0,1)),
  owner TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_kanban_boards_doctype ON kanban_boards(tenant_id, reference_doctype);

-- Card order within a column.
--
-- Held separately from the document so reordering a board never writes to the
-- business record: dragging a card must not bump a document's version, produce a
-- new revision in its history, or look like an edit in an audit.
CREATE TABLE IF NOT EXISTS kanban_card_order (
  tenant_id TEXT NOT NULL,
  board TEXT NOT NULL,
  column_name TEXT NOT NULL,
  document_name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, board, document_name),
  FOREIGN KEY (tenant_id, board) REFERENCES kanban_boards(tenant_id, name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_kanban_order ON kanban_card_order(tenant_id, board, column_name, position);

CREATE TABLE IF NOT EXISTS notification_log (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  for_user TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  notification_type TEXT NOT NULL DEFAULT 'Alert',
  document_type TEXT,
  document_name TEXT,
  read INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0,1)),
  from_user TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, name)
);
-- The unread badge is the hottest read on the Desk, so it gets its own partial index.
CREATE INDEX IF NOT EXISTS idx_notification_unread
  ON notification_log(tenant_id, for_user, created_at DESC)
  WHERE read = 0;
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification_log(tenant_id, for_user, created_at DESC);
