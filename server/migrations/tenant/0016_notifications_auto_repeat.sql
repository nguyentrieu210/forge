-- Notification rules and Auto Repeat.
--
-- Both are "when X happens, do Y" declarations that Frappe stores as DocTypes and this
-- platform stores as tables, for the same reason DocType definitions are: they are
-- platform machinery read on a hot path, not tenant documents.

-- A rule that raises an in-app alert when a document event matches.
--
-- DELIBERATELY NOT EMAIL. This platform has no mail transport configured, and a rule
-- that claimed to send mail would be a promise about something a user believes
-- happened. `channel` exists so a rule can say what it wanted, and anything other than
-- 'Notification' is recorded and skipped rather than silently treated as sent.
CREATE TABLE IF NOT EXISTS notification_rules (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  -- The domain event suffix this rule reacts to: 'created', 'saved', 'submitted',
  -- 'cancelled'. Kept as text rather than an enum so a new event type does not need a
  -- migration to become subscribable.
  event TEXT NOT NULL,
  -- Restricted grammar, the same one `mandatory_depends_on` uses. An expression that
  -- does not parse is refused when the rule is SAVED, so a rule can never be stored
  -- that will silently never fire.
  condition TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'Notification',
  -- JSON array. Each entry is {"kind":"user","value":"…"} or {"kind":"field","value":"…"}
  -- — the latter reads a user id out of the document, which is how "notify the approver"
  -- works without hard-coding a person into a rule.
  recipients_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  modified_by TEXT NOT NULL DEFAULT '',
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_notification_rules_target
  ON notification_rules(tenant_id, document_type, event, enabled);

-- A document that should be recreated on a schedule.
--
-- Rows are per SOURCE DOCUMENT, not per doctype: "repeat THIS order monthly" is the
-- thing a user asks for, and it must stop when that order is cancelled.
CREATE TABLE IF NOT EXISTS auto_repeat (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  reference_doctype TEXT NOT NULL,
  reference_name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('Daily','Weekly','Monthly','Yearly')),
  start_date TEXT NOT NULL,
  -- NULL means "until stopped". An end date in the past simply never fires again.
  end_date TEXT,
  -- Advanced only after a successful creation, so a failure retries the SAME period
  -- instead of skipping it. This is what keeps a missed run from losing a document.
  next_schedule_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Stopped','Completed')),
  -- Guards against a double-create when two sweeps overlap: the created document's name
  -- is recorded before the next date is advanced.
  last_created_name TEXT,
  last_error TEXT,
  owner TEXT NOT NULL DEFAULT '',
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_auto_repeat_due
  ON auto_repeat(tenant_id, status, next_schedule_date);
-- One schedule per source document: two rows would silently produce two copies every
-- period, and the duplicate would look like a user error rather than a config one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_repeat_reference
  ON auto_repeat(tenant_id, reference_doctype, reference_name);
