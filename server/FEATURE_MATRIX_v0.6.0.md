# CloudForge v0.6.0 Feature Matrix

Status meanings:

- **Hardened subset** — protected by commercial O2C accounting/security tests, but still needs promotion evidence.
- **Preview** — implemented with source/unit/schema tests; not yet a commercial or ERPNext-parity claim.
- **Foundation only** — schema/API groundwork exists but behavior is incomplete.
- **Missing** — not implemented.

| Area | Status | Included | Important gaps |
|---|---|---|---|
| Tenant/security kernel | Hardened subset | JWT gateway, signed trusted identity, WfP dispatch, tenant isolation, secrets tooling | full external security assessment, production promotion |
| Mutation kernel | Hardened subset | DO serialization, OCC, idempotency, D1 atomic batch, audit/outbox/receipt | high-volume production benchmark |
| O2C | Hardened subset | SO, DN, SI, customer receipt, tax subset, multicurrency, AR/Stock Balance | returns, advances, write-offs, broad pricing/localization |
| Metadata registry | Preview | DocType/DocField storage, standard catalog, validation | complete Frappe schema semantics and migrations |
| Generic documents | Preview | create/save/submit/cancel, defaults, types, Link/Table validation | controller hooks/scripts, recursive parity, amendment |
| Generic UI | Preview | metadata catalog/list/form Meta Desk | calendar/kanban/tree/dashboard, full Desk collaboration |
| Permissions | Preview | metadata roles/actions and static domain policy | field permlevel, if-owner, user permissions, enforced shares |
| Workflow | Preview | generic state/transition checks | delegation, history/notifications, explicit-domain integration |
| Naming | Preview | tenant/doctype series allocation | all Frappe autoname patterns and rename/merge |
| Print | Preview | safe bounded template replacement | Jinja/PDF/letterhead/print builder |
| Import | Preview | bounded CSV preview/apply | XLSX, queued bulk import, error workbook, updates/rename |
| Files | Foundation only | R2 PUT/GET contract | attachment model, permissions, versioning, virus scanning |
| Comments/assignments/shares | Foundation only | record APIs/timeline | complete UI and share permission enforcement |
| Notifications | Foundation only | storage schema | scheduler, conditions, templates, delivery/retry |
| Journal Entry | Preview | balanced GL posting | templates, dimensions, specialized entry types, oracle parity |
| Buying/P2P | Preview | PO→PR→PI→supplier payment | RFQ, purchase taxes/returns, landed cost, supplier portal |
| Stock Entry | Preview | receipt, issue, transfer | valuation layers, repost, serial/batch, manufacturing modes |
| AP/GL/Trial Balance | Preview | query definitions | complete aging, statements, period close, consolidation |
| Manufacturing | Missing | — | BOM, Work Order, Job Card, planning, WIP |
| Assets | Missing | — | capitalization, depreciation, movement/disposal |
| Projects | Missing | — | task/timesheet/costing/billing |
| Quality/Support/POS | Missing | — | complete modules |
| HR/Payroll/regional | Missing | — | separate app/module and statutory packs |
