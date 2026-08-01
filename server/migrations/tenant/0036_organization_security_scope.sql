-- G03: effective organization scopes are a projection of submitted
-- Organization Assignment documents. The source document remains the audit truth;
-- this table exists so every permission check can use an indexed, fail-closed query.

CREATE TABLE IF NOT EXISTS erp_organization_scope_grants (
  tenant_id TEXT NOT NULL,
  assignment_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  allow_doctype TEXT NOT NULL CHECK (allow_doctype IN ('Company','Branch','Department')),
  allow_name TEXT NOT NULL CHECK (length(trim(allow_name)) > 0),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, assignment_name, allow_doctype, allow_name)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_erp_org_scope_user_effective
  ON erp_organization_scope_grants(tenant_id, user_id, effective_from, effective_to, allow_doctype, allow_name);

CREATE TRIGGER IF NOT EXISTS erp_org_scope_assignment_insert
AFTER INSERT ON documents
WHEN NEW.doctype='Organization Assignment'
BEGIN
  INSERT INTO erp_organization_scope_grants(
    tenant_id,assignment_name,user_id,allow_doctype,allow_name,
    effective_from,effective_to,source_version,modified_at
  )
  SELECT NEW.tenant_id,NEW.name,json_extract(NEW.payload_json,'$.user'),scope.allow_doctype,
         scope.allow_name,json_extract(NEW.payload_json,'$.effective_from'),
         NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),NEW.version,NEW.modified_at
  FROM (
    SELECT 'Company' AS allow_doctype, json_extract(NEW.payload_json,'$.company') AS allow_name
    UNION ALL SELECT 'Branch', json_extract(NEW.payload_json,'$.branch')
    UNION ALL SELECT 'Department', json_extract(NEW.payload_json,'$.department')
  ) AS scope
  WHERE NEW.docstatus=1
    AND json_extract(NEW.payload_json,'$.workflow_state')='Published'
    AND length(trim(COALESCE(scope.allow_name,'')))>0;
END;

CREATE TRIGGER IF NOT EXISTS erp_org_scope_assignment_update
AFTER UPDATE ON documents
WHEN NEW.doctype='Organization Assignment' OR OLD.doctype='Organization Assignment'
BEGIN
  DELETE FROM erp_organization_scope_grants
  WHERE tenant_id=OLD.tenant_id AND assignment_name=OLD.name;

  INSERT INTO erp_organization_scope_grants(
    tenant_id,assignment_name,user_id,allow_doctype,allow_name,
    effective_from,effective_to,source_version,modified_at
  )
  SELECT NEW.tenant_id,NEW.name,json_extract(NEW.payload_json,'$.user'),scope.allow_doctype,
         scope.allow_name,json_extract(NEW.payload_json,'$.effective_from'),
         NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),NEW.version,NEW.modified_at
  FROM (
    SELECT 'Company' AS allow_doctype, json_extract(NEW.payload_json,'$.company') AS allow_name
    UNION ALL SELECT 'Branch', json_extract(NEW.payload_json,'$.branch')
    UNION ALL SELECT 'Department', json_extract(NEW.payload_json,'$.department')
  ) AS scope
  WHERE NEW.doctype='Organization Assignment'
    AND NEW.docstatus=1
    AND json_extract(NEW.payload_json,'$.workflow_state')='Published'
    AND length(trim(COALESCE(scope.allow_name,'')))>0;
END;

CREATE TRIGGER IF NOT EXISTS erp_org_scope_assignment_delete
AFTER DELETE ON documents
WHEN OLD.doctype='Organization Assignment'
BEGIN
  DELETE FROM erp_organization_scope_grants
  WHERE tenant_id=OLD.tenant_id AND assignment_name=OLD.name;
END;

-- Effective Role Policy changes must invalidate every open session held by the
-- affected role. This also forces the Desk to rebuild its cached capabilities.
CREATE TRIGGER IF NOT EXISTS erp_role_policy_revoke_sessions_insert
AFTER INSERT ON documents
WHEN NEW.doctype='Role Policy' AND NEW.docstatus=1
  AND json_extract(NEW.payload_json,'$.workflow_state')='Published'
BEGIN
  UPDATE users SET session_epoch=session_epoch+1,modified_at=NEW.modified_at
  WHERE tenant_id=NEW.tenant_id AND EXISTS(
    SELECT 1 FROM user_roles ur
    WHERE ur.tenant_id=NEW.tenant_id AND ur.user_id=users.user_id
      AND ur.role=json_extract(NEW.payload_json,'$.role')
  );
END;

CREATE TRIGGER IF NOT EXISTS erp_role_policy_revoke_sessions_update
AFTER UPDATE ON documents
WHEN (NEW.doctype='Role Policy' OR OLD.doctype='Role Policy')
  AND (
    (NEW.docstatus=1 AND json_extract(NEW.payload_json,'$.workflow_state')='Published')
    OR (OLD.docstatus=1 AND json_extract(OLD.payload_json,'$.workflow_state')='Published')
  )
BEGIN
  UPDATE users SET session_epoch=session_epoch+1,modified_at=NEW.modified_at
  WHERE tenant_id=NEW.tenant_id AND EXISTS(
    SELECT 1 FROM user_roles ur
    WHERE ur.tenant_id=NEW.tenant_id AND ur.user_id=users.user_id
      AND ur.role IN (
        json_extract(NEW.payload_json,'$.role'),
        json_extract(OLD.payload_json,'$.role')
      )
  );
END;

CREATE TRIGGER IF NOT EXISTS erp_role_policy_revoke_sessions_delete
AFTER DELETE ON documents
WHEN OLD.doctype='Role Policy' AND OLD.docstatus=1
  AND json_extract(OLD.payload_json,'$.workflow_state')='Published'
BEGIN
  UPDATE users SET session_epoch=session_epoch+1,modified_at=OLD.modified_at
  WHERE tenant_id=OLD.tenant_id AND EXISTS(
    SELECT 1 FROM user_roles ur
    WHERE ur.tenant_id=OLD.tenant_id AND ur.user_id=users.user_id
      AND ur.role=json_extract(OLD.payload_json,'$.role')
  );
END;

-- Projection rows cannot be hand-edited. Only the document triggers may change them;
-- application code receives no CRUD route for this physical table.
