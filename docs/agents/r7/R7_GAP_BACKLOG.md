# R7-A Frappe 16 Gap Backlog

Audit state: **complete** for the declared 28-domain denominator. Platform closure state: **blocked** until every GAP below is resolved or reclassified with reviewed evidence.

| Domain | Gap summary | Closure evidence |
|---|---|---|
| FRAPPE-10 — Scheduler | Generic merged Frappe cron/all/daily/hourly app scheduler event semantics are not implemented; current scheduled handler primarily runs Forge maintenance. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-11 — Realtime | Generic frappe.publish_realtime-compatible room authorization/order/reconnect behavior is not proven as a platform-wide authority. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-15 — Data import/export | Frappe background/queued Data Import status lifecycle is not exposed on the facade.<br>Large import/error-workbook/update-mode parity remains incomplete. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-16 — Workflow | Workflow email/action delivery is not complete because mail transport is absent.<br>Exact Frappe condition/evaluation and all workflow side-effect semantics require closure. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-17 — Notifications and communications | Frappe Email notification delivery/queue semantics are not implemented because no mail transport is configured; Email intents are recorded with skipped_reason. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-19 — Migrations and patches | Remote migration ledger crash-window/content-identity closure remains open; an applied migration must be durably and immutably attributable to exact content.<br>Workers-for-Platforms tenant/app rollback remains partial at provider evidence level; compatible source redeploy exists, but canonical provider rollback is not yet proven. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-23 — Website and portal | Complete website runtime parity and customer/supplier portal/self-service flows remain open. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-26 — Integrations | Generic API-key/service-account/OAuth connected-app lifecycle is not fully wired.<br>Generic webhook/event subscription and provider-neutral production queue lifecycle remain Foundation in current evidence. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |

## Closure order

1. **Execution fabric** — FRAPPE-10 Scheduler, FRAPPE-11 Realtime.
2. **Data/workflow communication** — FRAPPE-15 Data import/export, FRAPPE-16 Workflow, FRAPPE-17 Notifications/communications.
3. **Migration/product/integration surface** — FRAPPE-19 Migrations/patches, FRAPPE-23 Website/portal, FRAPPE-26 Integrations.

FRAPPE-05 Authentication & Sessions left this backlog after Frappe `token`/`Basic` API-key semantics and audited impersonation passed R7 GitHub Actions run `36960220755`.

## Rule

A GAP can leave this file only when the matrix row is updated in the same change with concrete evidence. Presence of a class, route, schema or UI alone is insufficient.
