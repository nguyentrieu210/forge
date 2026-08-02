-- WS09 App Factory revision history.
--
-- `installed_apps` is intentionally the one ACTIVE row per app. Upgrades overwrite it,
-- which is correct for reads and wrong for rollback: once the row moves, the exact older
-- parsed manifest is gone. This append-only sidecar preserves every package view that became
-- active without changing the install transaction or creating a second activation authority.
--
-- Deliberately no `recorded_by`: `installed_apps.installed_by` is the ORIGINAL installer and
-- is not updated on upgrade. Copying it here would fabricate an audit actor. Actor attribution
-- can be added only when the installer supplies the real modifier explicitly.

CREATE TABLE IF NOT EXISTS app_revisions (
  tenant_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash)=64),
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, app_id, revision_no),
  UNIQUE (tenant_id, app_id, content_hash, manifest_json)
);

CREATE INDEX IF NOT EXISTS idx_app_revisions_lookup
  ON app_revisions(tenant_id, app_id, revision_no DESC);

-- Existing tenants already have a live package but no history. Preserve it as revision 1
-- before the triggers start watching future changes.
INSERT OR IGNORE INTO app_revisions(
  tenant_id,app_id,revision_no,version,content_hash,manifest_json,recorded_at
)
SELECT tenant_id,app_id,1,version,content_hash,manifest_json,modified_at
FROM installed_apps;

-- A new install participates in the SAME D1 transaction as the installed_apps insert because
-- this trigger executes inside that statement. No post-commit history write can be lost.
CREATE TRIGGER IF NOT EXISTS trg_installed_apps_revision_insert
AFTER INSERT ON installed_apps
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM app_revisions
  WHERE tenant_id=NEW.tenant_id AND app_id=NEW.app_id
    AND content_hash=NEW.content_hash AND manifest_json=NEW.manifest_json
)
BEGIN
  INSERT INTO app_revisions(
    tenant_id,app_id,revision_no,version,content_hash,manifest_json,recorded_at
  )
  VALUES(
    NEW.tenant_id,NEW.app_id,
    COALESCE((
      SELECT MAX(revision_no) FROM app_revisions
      WHERE tenant_id=NEW.tenant_id AND app_id=NEW.app_id
    ),0)+1,
    NEW.version,NEW.content_hash,NEW.manifest_json,NEW.modified_at
  );
END;

-- Record an upgrade or parser-materialization change only when the active package view really
-- changed. Rewriting unrelated installed_apps columns must not manufacture revisions.
CREATE TRIGGER IF NOT EXISTS trg_installed_apps_revision_update
AFTER UPDATE OF version,content_hash,manifest_json ON installed_apps
FOR EACH ROW
WHEN (
  OLD.version<>NEW.version OR OLD.content_hash<>NEW.content_hash OR OLD.manifest_json<>NEW.manifest_json
) AND NOT EXISTS (
  SELECT 1 FROM app_revisions
  WHERE tenant_id=NEW.tenant_id AND app_id=NEW.app_id
    AND content_hash=NEW.content_hash AND manifest_json=NEW.manifest_json
)
BEGIN
  INSERT INTO app_revisions(
    tenant_id,app_id,revision_no,version,content_hash,manifest_json,recorded_at
  )
  VALUES(
    NEW.tenant_id,NEW.app_id,
    COALESCE((
      SELECT MAX(revision_no) FROM app_revisions
      WHERE tenant_id=NEW.tenant_id AND app_id=NEW.app_id
    ),0)+1,
    NEW.version,NEW.content_hash,NEW.manifest_json,NEW.modified_at
  );
END;
