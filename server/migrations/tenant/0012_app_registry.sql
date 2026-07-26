-- App registry: an app is DATA, so installing one is a metadata write rather than
-- a deploy. No build, no restart, no downtime.

CREATE TABLE IF NOT EXISTS installed_apps (
  tenant_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  app_name TEXT NOT NULL,
  version TEXT NOT NULL,
  -- Hash of the installed package. Re-installing the identical bytes is a no-op;
  -- a changed hash at the same version means the package was edited in place,
  -- which is exactly the situation a version number hides.
  content_hash TEXT NOT NULL CHECK (length(content_hash)=64),
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  installed_by TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, app_id)
);

-- Which app owns which object.
--
-- Without ownership, uninstalling could not tell an app's DocType from one the
-- customer built by hand, and would either orphan objects or delete the
-- customer's own work.
CREATE TABLE IF NOT EXISTS app_objects (
  tenant_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('DocType','Workflow','Print Format','Role','Master Record')),
  object_name TEXT NOT NULL,
  -- Master records are keyed by (type, name), so the record type is carried too.
  object_scope TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, object_type, object_scope, object_name),
  FOREIGN KEY (tenant_id, app_id) REFERENCES installed_apps(tenant_id, app_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_app_objects_app ON app_objects(tenant_id, app_id, object_type);

-- The PRIMARY KEY above is on the OBJECT, not on (app, object): two apps must not
-- both claim the same DocType. If they could, uninstalling either would remove a
-- definition the other still depends on.
