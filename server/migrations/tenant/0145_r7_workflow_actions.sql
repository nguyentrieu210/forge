-- R7 FRAPPE-16: durable Workflow Action lifecycle.
--
-- Frappe persists a Workflow Action when a document enters a state that has an
-- approvable outgoing transition, and completes the previous action when a transition
-- is taken. Forge keeps the same durable operational fact without making it a second
-- workflow authority: transition legality still comes exclusively from workflow
-- metadata + Document Kernel. These rows are an after-commit projection/audit surface.
CREATE TABLE IF NOT EXISTS workflow_actions (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  reference_doctype TEXT NOT NULL,
  reference_name TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  workflow_state TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version >= 1),
  source_event_id TEXT NOT NULL,
  permitted_roles_json TEXT NOT NULL DEFAULT '[]',
  email_requested INTEGER NOT NULL DEFAULT 0 CHECK (email_requested IN (0,1)),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Completed')),
  completed_by TEXT,
  completed_by_role TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, name),
  UNIQUE (tenant_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_actions_open_reference
  ON workflow_actions(tenant_id, reference_doctype, reference_name, status, modified_at);

CREATE INDEX IF NOT EXISTS idx_workflow_actions_state
  ON workflow_actions(tenant_id, workflow_name, workflow_state, status, modified_at);
