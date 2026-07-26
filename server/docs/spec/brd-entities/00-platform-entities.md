# Platform & Framework Entities

| Entity | Fields tối thiểu | Storage | Invariant |
|---|---|---|---|
| Tenant | id, slug, name, status, region, plan, release_channel, created_at | Control D1 | isolation/provision |
| TenantBinding | tenant_id, kind, binding_name, resource_id, region | Control D1 | D1/R2/DO/Queue binding |
| AppRelease | app, version, source_pin, artifact_hash, license_profile, status | Control D1/R2 | immutable release |
| DocTypeMeta | name, module, version, flags, naming, storage_plan | Tenant D1 | schema source |
| DocFieldMeta | doctype, fieldname, type, options, constraints, dependencies, permlevel | Tenant D1 | field contract |
| Policy | resource, action, role, field, row_expression, effect, priority | Tenant D1 | server authorization |
| Document | id, name, owner, docstatus, version, data_json, timestamps | Tenant D1 | canonical business doc |
| ChildDocument | id, parent_id, parentfield, idx, data_json | Tenant D1 | child rows |
| AuditEvent | event_id, actor, action, resource, before_hash, after_hash, evidence | Tenant D1/R2 archive | canonical audit |
| OutboxEvent | event_id, aggregate, version, type, payload, status, attempts | Tenant D1 | atomic side effect |
| JobRun | job_id, type, status, idempotency_key, progress, evidence | Tenant D1 | async control |
| FileObject | file_id, r2_key, hash, size, mime, privacy, attached_to | Tenant D1+R2 | attachment |
| SourceRelease | app, repo, branch_tag, commit, license, dependencies, scanned_at | Control D1 | parity pin |
| SourceArtifact | artifact_key, app, kind, path, symbol, hash, deps, status | Control D1/R2 | zero-unmapped registry |
| ParityEvidence | artifact_key, spec_ref, implementation_ref, fixture, oracle_result | Control D1/R2 | release proof |
