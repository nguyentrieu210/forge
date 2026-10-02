-- R7 FRAPPE-15: durable Data Import control-plane state.
--
-- Frappe's Data Import document is a control record; row writes still flow through the
-- canonical Document Kernel. The job table stores only lifecycle/progress/error evidence
-- so polling and error downloads survive request boundaries and Worker restarts.
CREATE TABLE IF NOT EXISTS data_import_jobs (
  tenant_id TEXT NOT NULL,
  data_import_name TEXT NOT NULL,
  reference_doctype TEXT NOT NULL,
  import_type TEXT NOT NULL CHECK (import_type IN ('Insert New Records','Update Existing Records')),
  source_file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Success','Partial Success','Error','Timed Out')),
  payload_count INTEGER NOT NULL DEFAULT 0 CHECK (payload_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  results_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, data_import_name)
);

CREATE INDEX IF NOT EXISTS idx_data_import_jobs_status
  ON data_import_jobs(tenant_id, status, modified_at);

-- Make the control DocType available to both existing demo-style tenants and tenants
-- provisioned later from __standard__. This is deliberately a small platform control
-- document, not a shadow copy of Frappe's importer internals.
INSERT OR IGNORE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
) VALUES(
  '__standard__','Data Import','Core',0,0,0,1,
  '{"name":"Data Import","module":"Core","is_submittable":false,"is_child":false,"track_changes":true,"revision":1,"autoname":"DATA-IMPORT-.#####","title_field":"reference_doctype","search_fields":["reference_doctype","status"],"fields":[{"fieldname":"reference_doctype","label":"Reference DocType","fieldtype":"Data","required":true,"in_list_view":true},{"fieldname":"import_type","label":"Import Type","fieldtype":"Select","options":"Insert New Records\\nUpdate Existing Records","default":"Insert New Records","required":true,"in_list_view":true},{"fieldname":"import_file","label":"Import File","fieldtype":"Attach"},{"fieldname":"status","label":"Status","fieldtype":"Select","options":"Pending\\nSuccess\\nPartial Success\\nError\\nTimed Out","default":"Pending","read_only":true,"in_list_view":true},{"fieldname":"payload_count","label":"Payload Count","fieldtype":"Int","default":0,"read_only":true}],"permissions":[{"role":"System Manager","read":true,"write":true,"create":true,"report":true,"export":true}]}',
  0,'migration','2026-10-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT tenants.tenant_id, d.doctype,d.module,d.is_custom,d.is_submittable,d.is_child,d.revision,
       d.metadata_json,d.disabled,'migration','2026-10-02T00:00:00.000Z'
FROM (
  SELECT tenant_id FROM doctype_definitions WHERE tenant_id <> '__standard__'
  UNION
  SELECT 'demo'
) AS tenants
CROSS JOIN doctype_definitions AS d
WHERE d.tenant_id='__standard__' AND d.doctype='Data Import';
