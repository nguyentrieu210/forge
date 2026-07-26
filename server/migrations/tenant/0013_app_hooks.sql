-- App hook delivery log.
--
-- An app's own logic lives in its own Worker (Workers for Platforms), not in the
-- kernel — an app cannot ship code into the platform. Delivery is therefore a
-- cross-Worker call, which can fail, so each attempt is recorded and retried
-- independently per app.
--
-- Deliberately AFTER-COMMIT. A synchronous before-commit hook would put a
-- third-party Worker inside the aggregate's write path: one slow or broken app
-- would stall every write to that aggregate, and a timeout mid-transaction would
-- leave the platform unable to say whether the write happened. Validation that
-- must block a write is expressed as metadata (mandatory_depends_on, DocPerm,
-- workflow) — never as a hook.

CREATE TABLE IF NOT EXISTS app_hook_deliveries (
  tenant_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','delivered','failed','abandoned')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  -- Next attempt time. NULL once the delivery reaches a terminal state, so the
  -- sweep query never has to re-read finished rows.
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  -- One row per (app, event): the queue delivers at least once, and without this
  -- a redelivered event would run an app's side effects a second time.
  PRIMARY KEY (tenant_id, app_id, event_id),
  FOREIGN KEY (tenant_id, app_id) REFERENCES installed_apps(tenant_id, app_id) ON DELETE CASCADE
);

-- The sweep looks for work by time, and only among rows that still have work.
CREATE INDEX IF NOT EXISTS idx_app_hook_due
  ON app_hook_deliveries(tenant_id, next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_hook_event ON app_hook_deliveries(tenant_id, event_id);

-- A delivery in a terminal state must not keep a retry time, or the sweep would
-- pick it up forever.
CREATE TRIGGER IF NOT EXISTS app_hook_terminal_clears_schedule
BEFORE UPDATE ON app_hook_deliveries
WHEN NEW.status IN ('delivered','abandoned') AND NEW.next_attempt_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'HOOK_TERMINAL_MUST_NOT_RESCHEDULE');
END;
