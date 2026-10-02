# R7-A Frappe 16 Gap Backlog

Audit state: **complete** for the declared 28-domain denominator. Platform closure state: **blocked** until every GAP below is resolved or reclassified with reviewed evidence.

| Domain | Gap summary | Closure evidence |
|---|---|---|
| FRAPPE-15 — Data import/export | Frappe background/queued Data Import status lifecycle is not exposed on the facade.<br>Large import/error-workbook/update-mode parity remains incomplete. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-16 — Workflow | Workflow email/action delivery is not complete because mail transport is absent.<br>Exact Frappe condition/evaluation and all workflow side-effect semantics require closure. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-17 — Notifications and communications | Frappe Email notification delivery/queue semantics are not implemented because no mail transport is configured; Email intents are recorded with skipped_reason. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-19 — Migrations and patches | Remote migration ledger crash-window/content-identity closure remains open; an applied migration must be durably and immutably attributable to exact content.<br>Workers-for-Platforms tenant/app rollback remains partial at provider evidence level; compatible source redeploy exists, but canonical provider rollback is not yet proven. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-23 — Website and portal | Complete website runtime parity and customer/supplier portal/self-service flows remain open. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-26 — Integrations | Generic API-key/service-account/OAuth connected-app lifecycle is not fully wired.<br>Generic webhook/event subscription and provider-neutral production queue lifecycle remain Foundation in current evidence. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |

## Closure order

1. **Data/workflow communication** — FRAPPE-15 Data import/export, FRAPPE-16 Workflow, FRAPPE-17 Notifications/communications.
2. **Migration/product/integration surface** — FRAPPE-19 Migrations/patches, FRAPPE-23 Website/portal, FRAPPE-26 Integrations.

FRAPPE-11 Realtime left this backlog after room authorization, durable sequence ordering, source-event dedupe and reconnect replay passed Workerd in GitHub Actions run `36964256721`.

## Rule

A GAP can leave this file only when the matrix row is updated in the same change with concrete evidence. Presence of a class, route, schema or UI alone is insufficient.
