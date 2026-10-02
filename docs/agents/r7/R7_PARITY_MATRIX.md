# R7-A Frappe 16 Parity Matrix — Human Summary

Machine authority: `R7_FRAPPE_PARITY_MATRIX.json`.

The declared 28-domain Frappe v16.19.0 denominator has **0 GAP and 0 UNRESOLVED**. Closure does not mean identical implementation: Cloudflare/Forge differences remain explicit and evidence-backed.

## Current disposition

| Classification | Count |
|---|---:|
| SEMANTIC_PARITY | 12 |
| INTENTIONAL_DIFFERENCE | 15 |
| OUT_OF_SCOPE | 1 |
| GAP | 0 |
| UNRESOLVED | 0 |
| **Total** | **28** |

## Semantic parity

- FRAPPE-01-METADATA-AND-DOCTYPE-RUNTIME — Metadata and DocType runtime
- FRAPPE-02-DOCUMENT-LIFECYCLE — Document lifecycle
- FRAPPE-03-NAMING — Naming
- FRAPPE-06-REST-AND-RPC — REST and RPC
- FRAPPE-08-QUERY-AND-LIST-ENGINE — Query and list engine
- FRAPPE-09-BACKGROUND-JOBS — Background jobs
- FRAPPE-13-FILES-AND-ATTACHMENTS — Files and attachments
- FRAPPE-20-DESK-BOOT-AND-NAVIGATION — Desk boot and navigation
- FRAPPE-21-FORM-RUNTIME — Form runtime
- FRAPPE-22-LIST-REPORT-DASHBOARD-RUNTIME — List/report/dashboard runtime
- FRAPPE-24-LOCALIZATION — Localization
- FRAPPE-25-AUDIT-AND-COLLABORATION — Audit and collaboration

## Intentional differences

- FRAPPE-04-PERMISSIONS — Permissions
- FRAPPE-05-AUTHENTICATION-AND-SESSIONS — Authentication and sessions
- FRAPPE-07-DATABASE-ABSTRACTION — Database abstraction
- FRAPPE-10-SCHEDULER — Scheduler
- FRAPPE-11-REALTIME — Realtime
- FRAPPE-12-CACHING-AND-LOCKS — Caching and locks
- FRAPPE-14-PRINT-AND-PDF — Print and PDF
- FRAPPE-15-DATA-IMPORT-EXPORT — Data import/export
- FRAPPE-16-WORKFLOW — Workflow
- FRAPPE-17-NOTIFICATIONS-AND-COMMUNICATIONS — Notifications and communications
- FRAPPE-18-HOOKS-AND-APP-COMPOSITION — Hooks and app composition
- FRAPPE-19-MIGRATIONS-AND-PATCHES — Migrations and patches
- FRAPPE-23-WEBSITE-AND-PORTAL — Website and portal
- FRAPPE-26-INTEGRATIONS — Integrations
- FRAPPE-27-SECURITY-BOUNDARIES — Security boundaries

The final three dispositions are deliberate rather than papered-over parity:

- **FRAPPE-19:** exact-content reservation + evidence reconciliation replaces an atomicity guarantee Wrangler cannot provide across remote SQL transport and journal completion.
- **FRAPPE-23:** bounded data-defined Website/owner portal APIs replace arbitrary Python/Jinja/dynamic routing; unsafe/unversioned delete and single-entry races return 501.
- **FRAPPE-26:** backend OAuth client-credentials is implemented, while dynamic safe_eval/Jinja webhooks and browser-expanded provider discovery/revocation are intentionally excluded in favor of trusted config + durable fixed-envelope delivery.

## Out of scope

- FRAPPE-28-TESTING-FRAMEWORK — Testing framework

## Gates

From `server/`:

```bash
npm run r7:frappe:audit
npm run r7:frappe:audit-complete
npm run r7:frappe:certify
```

The R7 GitHub workflow now runs `r7:frappe:certify`, not only the audit-complete gate. The exact candidate head must pass CI before the completion record is promoted to `FRAPPE_PLATFORM_CLOSED`.
