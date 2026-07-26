# CloudForge v0.7.0 Feature Matrix

Status meanings:

- **Hardened subset** — protected by commercial O2C accounting/security tests, still promotion-gated.
- **Beta** — implemented with source/unit/schema/integration specifications; requires clean Workerd, frontend, staging and operations evidence before external production use.
- **Preview** — implemented with source/unit/schema tests; no ERPNext parity or commercial claim.
- **Foundation only** — schema/API seam exists but runtime behavior is incomplete.
- **Missing** — not implemented.

| Area | Status | Included | Important gaps |
|---|---|---|---|
| Tenant/security kernel | Hardened subset | JWT gateway, signed trusted identity, WfP dispatch, tenant isolation, secrets tooling | external assessment, exact-release production promotion |
| Mutation kernel | Hardened subset | DO serialization, OCC, actor-bound idempotency, atomic D1 batch, audit/outbox/receipt | high-volume workload benchmark and multi-region recovery drill |
| O2C | Hardened subset | SO→DN→SI→customer receipt, tax subset, multicurrency, AR/Stock Balance, reconciliation | returns, advances, write-offs, pricing breadth, valuation/COGS |
| Metadata registry | Beta | tenant DocType/DocField registry, standard catalog, revisioned metadata | full Frappe property setters/custom fields migration semantics |
| Generic documents | Beta | create/save/submit/cancel, defaults/types/Link/Table validation | hooks/scripts, amendment, recursive Dynamic Link parity |
| Permission V2 | Beta | role actions, if-owner, enforced read/write shares, user-permission Link scopes, field permlevels, list/GET/mutation redaction | hierarchy descendants, permission-query scripts, role/user administration UI breadth |
| Generic Meta Desk | Beta | metadata list/form, document-context readonly fields, workflow actions, versions, comments, assignments, shares, files, CSV import/export | kanban/tree/calendar/dashboard, polished child-grid/link picker, full admin builders |
| Versioning/audit | Beta | immutable snapshots, timeline summaries, historical read | diff UI, restore-as-new workflow, retention policy |
| Workflow | Beta | state/transition/role actions and generic lifecycle application | conditions, delegation, SLA, notifications and explicit-domain workflow parity |
| Collaboration | Beta | comments, assignments, share grants and timeline | mentions, email threading, assignment notifications, share revocation UI |
| Files | Beta when R2 bound | permission-checked private attachment upload/download/delete, active-content blocking | malware scanning, image optimization, object lifecycle/versioning, public portal delivery |
| Import/export | Beta | bounded CSV preview/apply, per-row outcomes, permission-scoped CSV export | XLSX, queued large import, update mode, error workbook, rollback tooling |
| Print | Preview | safe bounded HTML template interpolation | Jinja sandbox, PDF, letterhead, print builder and localization |
| Naming | Preview | tenant/doctype series allocation | all Frappe autoname expressions, rename/merge |
| Notifications | Foundation only | definitions/storage seam | scheduler, condition evaluation, templates, delivery/retry/admin console |
| Journal Entry | Preview | balanced fixed-point GL posting | dimensions, templates, specialized entry types, oracle parity |
| Buying/P2P | Preview | PO→PR→PI→supplier payment | RFQ, taxes/returns, landed cost, supplier portal |
| Stock Entry | Preview | material receipt/issue/transfer | valuation layers, repost, serial/batch and manufacturing modes |
| AP/GL/Trial Balance | Preview | query definitions | full aging/statements/close/consolidation |
| Manufacturing | Missing | — | BOM, Work Order, Job Card, planning, WIP |
| Assets | Missing | — | capitalization, depreciation, movement/disposal |
| Projects | Missing | — | task/timesheet/costing/billing |
| Quality/Support/POS | Missing | — | complete modules |
| HR/Payroll/regional | Missing | — | separate apps and statutory packs |
