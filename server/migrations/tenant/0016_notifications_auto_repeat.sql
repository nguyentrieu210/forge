-- Notification rules and Auto Repeat.
--
-- Both are "when X happens, do Y" declarations that Frappe stores as DocTypes and this
-- platform stores as tables, for the same reason DocType definitions are: they are
-- platform machinery read on a hot path, not tenant documents.

-- `notification_rules` ALREADY EXISTS, from 0004_frappe_platform.sql:
--
--   (tenant_id, name, document_type, event, enabled, rule_json, modified_by, modified_at)
--
-- It was created there and read by nothing — a dead table for exactly this feature. So
-- this migration gives it a reader rather than a rival: the rule body lives in
-- `rule_json` (condition, subject, message, channel, recipients).
--
-- An earlier draft of this file re-declared the table with separate columns. Being
-- `CREATE TABLE IF NOT EXISTS`, it silently did NOTHING on every database that already
-- had the 0004 shape — which is all of them — and the code written against those
-- columns failed at runtime with "no column named condition". A migration that appears
-- to define a schema and does not is worse than no migration: it makes the file lie
-- about what the database contains.
--
-- DELIBERATELY NOT EMAIL. No mail transport is configured here. A rule may declare
-- `channel: "Email"`; it is recorded and skipped, never treated as sent.
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
