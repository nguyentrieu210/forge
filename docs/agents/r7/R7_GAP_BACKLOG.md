# R7-A Frappe 16 Gap Backlog

Audit state: **complete** for the declared 28-domain denominator. Platform closure state: **blocked** until every GAP below is resolved or reclassified with reviewed evidence.

| Domain | Gap summary | Closure evidence |
|---|---|---|
| FRAPPE-04-PERMISSIONS — Permissions | Frappe permission_query_conditions / has_permission hook semantics are not implemented as compatible dynamic hook authorities.<br>Hierarchy/descendant semantics still require exact Frappe differential coverage. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-05-AUTHENTICATION-AND-SESSIONS — Authentication and sessions | Audited support impersonation is explicitly missing.<br>Generic Frappe OAuth/API-key/token lifecycle parity is not closed; provider-specific and connector seams do not equal the full Frappe auth contract. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-06-REST-AND-RPC — REST and RPC | Frappe v2 document API parity is not exposed; current canonical facade is /api/resource and /api/method plus Forge/MetaForge extensions. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-09-BACKGROUND-JOBS — Background jobs | Generic failed-job/dead-letter/quarantine/recovery semantics remain incomplete; current evidence describes dead-letter handling as Foundation. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-10-SCHEDULER — Scheduler | Generic merged Frappe cron/all/daily/hourly app scheduler event semantics are not implemented; current scheduled handler primarily runs Forge maintenance. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-11-REALTIME — Realtime | Generic frappe.publish_realtime-compatible room authorization/order/reconnect behavior is not proven as a platform-wide authority. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-15-DATA-IMPORT-EXPORT — Data import/export | Frappe background/queued Data Import status lifecycle is not exposed on the facade.<br>Large import/error-workbook/update-mode parity remains incomplete. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-16-WORKFLOW — Workflow | Workflow email/action delivery is not complete because mail transport is absent.<br>Exact Frappe condition/evaluation and all workflow side-effect semantics require closure. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-17-NOTIFICATIONS-AND-COMMUNICATIONS — Notifications and communications | Frappe Email notification delivery/queue semantics are not implemented because no mail transport is configured; Email intents are recorded with skipped_reason. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-19-MIGRATIONS-AND-PATCHES — Migrations and patches | Generic reversible schema/data migration and repair semantics are not complete.<br>Materialized app rollback remains intentionally blocked without explicit reverse migration/reconciliation. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-23-WEBSITE-AND-PORTAL — Website and portal | Complete website runtime parity and customer/supplier portal/self-service flows remain open. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-24-LOCALIZATION — Localization | Exact Frappe 16 timezone/language/translation runtime behavior is not closed end-to-end.<br>Some server/domain code still owns bounded timezone assumptions rather than deriving every behavior from the same site/user locale contract. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |
| FRAPPE-26-INTEGRATIONS — Integrations | Generic API-key/service-account/OAuth connected-app lifecycle is not fully wired.<br>Generic webhook/event subscription and provider-neutral production queue lifecycle remain Foundation in current evidence. | Pinned Frappe 16 source/runtime fixture + Forge regression/differential + updated matrix |

## Closure order

1. **Identity/permission/API correctness** — FRAPPE-04, 05, 06.
2. **Execution fabric** — FRAPPE-09, 10, 11.
3. **Data/workflow communication** — FRAPPE-15, 16, 17.
4. **Migration/product surface** — FRAPPE-19, 23, 24, 26.

This order minimizes false ERPNext failures: business-domain oracle work should not compensate for unresolved framework permission, scheduler, communication or migration semantics.

## Rule

A GAP can leave this file only when the matrix row is updated in the same change with concrete evidence. Presence of a class, route, schema or UI alone is insufficient.
