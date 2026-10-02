# R7-A Frappe 16 Parity Matrix — Human Summary

Machine authority: `R7_FRAPPE_PARITY_MATRIX.json`.

The declared 28-domain audit is fully classified. This means the audit denominator has no unknown domain; it does **not** mean Forge is fully Frappe-compatible.

## Current disposition

| Classification | Count |
|---|---:|
| SEMANTIC_PARITY | 12 |
| INTENTIONAL_DIFFERENCE | 7 |
| GAP | 8 |
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
- FRAPPE-12 — Caching and locks
- FRAPPE-14 — Print and PDF
- FRAPPE-18 — Hooks and app composition
- FRAPPE-27 — Security boundaries

FRAPPE-05 Authentication & Sessions left the GAP backlog after GitHub Actions run `36960220755` proved Frappe-style User API keys (`token` and `Basic`), stable-key/rotating-secret behavior, logged-user identity, and audited cookie-only impersonation. Forge intentionally externalizes OAuth authorization-server/auth-hook behavior; connected-app lifecycle remains tracked in FRAPPE-26.

## Gaps

8 domains remain platform-closure blockers. Machine-readable details are in `R7_GAP_BACKLOG.json`; human closure order is in `R7_GAP_BACKLOG.md`.

## Gates

From `server/`:

```bash
npm run r7:frappe:audit
npm run r7:frappe:audit-complete
npm run r7:frappe:certify
```

- `audit`: matrix/source-lock structural validity.
- `audit-complete`: additionally requires `UNRESOLVED=0`.
- `certify`: additionally requires `GAP=0`.

Current expected state: **audit-complete passes; certify remains blocked by 8 gaps**.
