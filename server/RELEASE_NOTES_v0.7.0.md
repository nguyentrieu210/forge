# CloudForge v0.7.0 — Frappe Core Beta

## Security and permissions

- Added tenant-scoped User Permission records and migration `0006_frappe_core_beta.sql`.
- Enforced `if_owner`, document read/write/share grants, Link-value user permissions and field permlevels.
- Applied the same document scope to list/count, direct GET, workflow, timeline, comments, assignments, shares, print, export and attachments.
- Document reads redact inaccessible fields; metadata responses omit permission rows and mark non-writable fields read-only for the current create/save/share context.
- Share write access is restricted to permlevel zero and never grants submit/cancel automatically.

## Collaboration and document history

- Added immutable version summaries to timeline and historical-version retrieval.
- Added assignment update semantics for owner/assignee/manager, with document access re-checked on every update so revoked role/share/User Permission access takes effect immediately.
- Added permission-checked comment, assignment and share flows.
- Added permission-checked R2 attachment download/delete and blocked active web/executable uploads.

## Import/export and Meta Desk

- CSV import apply now reports every row as imported or failed and returns HTTP 207 for partial success, preventing silent committed-prefix ambiguity.
- Added bounded permission-scoped CSV export with spreadsheet formula-injection protection.
- Expanded the reusable CloudForge adapter and Meta Desk for workflow actions, version history, comments, assignments, shares, attachments and CSV import/export.
- Historical snapshots are view-only in Meta Desk until the current document is reloaded.

## Verification

- 88 Node/domain tests.
- migrations 0001–0006 and SQL/race suites.
- strict core and Worker integration source TypeScript.
- browser-client standalone strict TypeScript and TSX syntax transpilation.
- source parser and repository/secret verifiers.

## Non-claims

This release is not full Frappe or ERPNext. Workerd runtime, Vite production build, R2 smoke, staging, load/security tests and operations drills remain required before beta features are exposed to external production tenants. O2C remains the only hardened commercial subset.
