-- Lets an app OWN Custom Fields, the same way it owns a DocType.
--
-- An industry app almost never needs a new doctype for its products; it needs the
-- standard Item with four more fields on it — a photo, a pack size, whether the product
-- is published to the public site. Today the only way to get those is to write them by
-- hand after installing, which means they are not part of the package: a second tenant
-- gets the app without them, an upgrade cannot change them, and an uninstall leaves them
-- behind on a standard doctype where nobody can tell who put them there.
--
-- `app_objects.object_type` is a CHECK constraint, and SQLite cannot alter one in place,
-- so the table is rebuilt. The rows are copied first and the constraint only widens, so
-- nothing that was valid before becomes invalid.
CREATE TABLE app_objects_new (
  tenant_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('DocType','Workflow','Print Format','Role','Master Record','Custom Field')),
  object_name TEXT NOT NULL,
  object_scope TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, object_type, object_scope, object_name),
  FOREIGN KEY (tenant_id, app_id) REFERENCES installed_apps(tenant_id, app_id) ON DELETE CASCADE
);

INSERT INTO app_objects_new(tenant_id, app_id, object_type, object_name, object_scope)
SELECT tenant_id, app_id, object_type, object_name, object_scope FROM app_objects;

DROP TABLE app_objects;
ALTER TABLE app_objects_new RENAME TO app_objects;

CREATE INDEX IF NOT EXISTS idx_app_objects_app ON app_objects(tenant_id, app_id, object_type);
