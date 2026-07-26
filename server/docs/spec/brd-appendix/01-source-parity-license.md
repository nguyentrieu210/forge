# Source Parity, Provenance & License

## Target repositories
- `frappe/frappe` → CloudForge kernel.
- `frappe/erpnext` → CloudERP.
- `frappe/hrms` → CloudHR.
- `frappe/crm` → CloudCRM.
- `frappe/insights` → CloudInsights.

## Scanner coverage
DocTypes, child tables, fields, permissions, workflows, Python controllers/functions/hooks, whitelisted methods, scheduled jobs, reports, workspaces, print formats, JS/Vue routes/components, fixtures, patches, regional code, translations, tests and integrations.

## Status machine
`DISCOVERED → SPECIFIED → PORTED → ORACLE_GREEN`; `BLOCKED` and approved `WAIVED` carry owner/impact/expiry. `UNMAPPED` or critical waiver blocks release.

## Legal profiles
- Clean-room proprietary: implement public behavior/spec/tests without copying GPL/AGPL code.
- Direct-port open-source compliant: preserve notices/provenance/source obligations and obtain legal review.
