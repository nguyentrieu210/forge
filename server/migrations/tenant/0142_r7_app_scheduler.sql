-- R7 / FRAPPE-10: state for app-declared Frappe-shaped scheduler_events.
--
-- The installed manifest remains the definition authority. This table stores execution
-- state only, so removing/upgrading an app cannot leave a second schedule definition.
CREATE TABLE IF NOT EXISTS app_scheduler_runs (
  tenant_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  method TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (
    frequency IN (
      'all','hourly','hourly_long','hourly_maintenance',
      'daily','daily_long','daily_maintenance',
      'weekly','weekly_long','monthly','monthly_long',
      'yearly','annual','cron'
    )
  ),
  cron_format TEXT,
  last_due_key TEXT NOT NULL,
  last_started_at TEXT NOT NULL,
  last_completed_at TEXT,
  last_status TEXT NOT NULL CHECK (last_status IN ('running','success','failed')),
  last_error TEXT,
  PRIMARY KEY (tenant_id, app_id, method),
  FOREIGN KEY (tenant_id, app_id)
    REFERENCES installed_apps(tenant_id, app_id) ON DELETE CASCADE,
  CHECK (
    (frequency='cron' AND cron_format IS NOT NULL AND length(trim(cron_format))>0)
    OR
    (frequency<>'cron' AND cron_format IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_app_scheduler_runs_status
  ON app_scheduler_runs(tenant_id,last_status,last_started_at);
