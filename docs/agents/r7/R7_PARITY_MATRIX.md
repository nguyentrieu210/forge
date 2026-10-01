# R7-A Frappe 16 Parity Matrix — Human Summary

Machine authority: `R7_FRAPPE_PARITY_MATRIX.json`.

The declared 28-domain audit is now fully classified. This means the audit denominator has no unknown domain; it does **not** mean Forge is fully Frappe-compatible.

## Current disposition

| Classification | Count |
|---|---:|
| SEMANTIC_PARITY | 9 |
| INTENTIONAL_DIFFERENCE | 5 |
| GAP | 13 |
| OUT_OF_SCOPE | 1 |
| UNRESOLVED | 0 |
| **Total** | **28** |

## Semantic parity

- FRAPPE-01 Metadata / DocType runtime
- FRAPPE-02 Document lifecycle
- FRAPPE-03 Naming
- FRAPPE-08 Query/list engine
- FRAPPE-13 Files/attachments
- FRAPPE-20 Desk boot/navigation
- FRAPPE-21 Form runtime
- FRAPPE-22 List/report/dashboard runtime
- FRAPPE-25 Audit/collaboration

## Intentional Cloudflare/Forge differences

- FRAPPE-07 Database abstraction — D1/DO instead of MariaDB/PostgreSQL abstraction.
- FRAPPE-12 Caching/locks — revision/cache keys + DO serialization instead of Redis semantics.
- FRAPPE-14 Print/PDF — HTML+CSS print; binary PDF generation intentionally unsupported on Workers.
- FRAPPE-18 Hooks/app composition — deterministic registries/outbox instead of arbitrary Python hooks/monkey patching.
- FRAPPE-27 Security boundaries — allowlisted DSLs and bounded Worker execution instead of Python safe_exec/raw-SQL/global-state behavior.

## Gaps

13 domains remain platform-closure blockers. Machine-readable details are in `R7_GAP_BACKLOG.json`; human closure order is in `R7_GAP_BACKLOG.md`.

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

Current expected state: **audit-complete passes; certify remains blocked by 13 gaps**.
