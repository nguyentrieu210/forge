# R7-A Frappe 16 Parity Matrix — Human Summary

Machine authority: `R7_FRAPPE_PARITY_MATRIX.json`.

The declared 28-domain audit is fully classified. This means the audit denominator has no unknown domain; it does **not** mean Forge is fully Frappe-compatible.

## Current disposition

| Classification | Count |
|---|---:|
| SEMANTIC_PARITY | 12 |
| INTENTIONAL_DIFFERENCE | 9 |
| GAP | 6 |
| OUT_OF_SCOPE | 1 |
| UNRESOLVED | 0 |
| **Total** | **28** |

## Semantic parity

- FRAPPE-01 — Metadata and DocType runtime
- FRAPPE-02 — Document lifecycle
- FRAPPE-03 — Naming
- FRAPPE-06 — REST and RPC
- FRAPPE-08 — Query and list engine
- FRAPPE-09 — Background jobs
- FRAPPE-13 — Files and attachments
- FRAPPE-20 — Desk boot and navigation
- FRAPPE-21 — Form runtime
- FRAPPE-22 — List/report/dashboard runtime
- FRAPPE-24 — Localization
- FRAPPE-25 — Audit and collaboration

## Intentional Cloudflare/Forge differences

- FRAPPE-04 — Permissions
- FRAPPE-05 — Authentication and sessions
- FRAPPE-07 — Database abstraction
- FRAPPE-10 — Scheduler
- FRAPPE-11 — Realtime
- FRAPPE-12 — Caching and locks
- FRAPPE-14 — Print and PDF
- FRAPPE-18 — Hooks and app composition
- FRAPPE-27 — Security boundaries

FRAPPE-05 Authentication & Sessions is closed on the Forge auth boundary. FRAPPE-10 Scheduler is closed on the jobs-worker/app-worker execution fabric.

FRAPPE-11 Realtime is now closed as an intentional Cloudflare architecture difference: authenticated same-origin WebSocket sessions use a tenant RealtimeHub Durable Object; doctype/doc room joins reuse canonical DocPerm; committed domain events emit Frappe-shaped `list_update`/`docinfo_update`; D1 sequence watermarks preserve live ordering and reconnect replay. Forge deliberately does not embed Frappe's Socket.IO/Redis server or arbitrary Python realtime handlers.

## Gaps

6 domains remain platform-closure blockers. Machine-readable details are in `R7_GAP_BACKLOG.json`; human closure order is in `R7_GAP_BACKLOG.md`.

## Gates

From `server/`:

```bash
npm run r7:frappe:audit
npm run r7:frappe:audit-complete
npm run r7:frappe:certify
```

Current expected state: **audit-complete passes; certify remains blocked by 6 gaps**.
