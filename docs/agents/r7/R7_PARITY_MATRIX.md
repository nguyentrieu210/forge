# R7-A Frappe 16 Parity Matrix — Human Summary

Machine authority: `R7_FRAPPE_PARITY_MATRIX.json`.

The declared 28-domain audit is fully classified. This means the audit denominator has no unknown domain; it does **not** mean Forge is fully Frappe-compatible.

## Current disposition

| Classification | Count |
|---|---:|
| SEMANTIC_PARITY | 12 |
| INTENTIONAL_DIFFERENCE | 6 |
| GAP | 9 |
| OUT_OF_SCOPE | 1 |
| UNRESOLVED | 0 |
| **Total** | **28** |

## Semantic parity

- FRAPPE-01 Metadata and DocType runtime
- FRAPPE-02 Document lifecycle
- FRAPPE-03 Naming
- FRAPPE-06 REST and RPC
- FRAPPE-08 Query and list engine
- FRAPPE-09 Background jobs
- FRAPPE-13 Files and attachments
- FRAPPE-20 Desk boot and navigation
- FRAPPE-21 Form runtime
- FRAPPE-22 List/report/dashboard runtime
- FRAPPE-24 Localization
- FRAPPE-25 Audit and collaboration

## Intentional Cloudflare/Forge differences

- FRAPPE-04 Permissions — Forge implements DocPerm, owner/share, permlevel, User Permission Link scopes and Frappe 16 tree-descendant expansion, but intentionally does not execute arbitrary Python permission_query_conditions/has_permission hooks. Dynamic restrictions are expressed through bounded/versioned Role Policy and organization-scope authorities instead. The user-visible descendant behavior is now pinned by Workerd regression and passed R7 CI.
- FRAPPE-07 Database abstraction — Forge intentionally targets Cloudflare D1/Durable Objects rather than reproducing Frappe's MariaDB/PostgreSQL abstraction. R7 requires equivalent atomicity/race/replay safety, not engine compatibility.
- FRAPPE-12 Caching and locks — Forge intentionally does not reproduce Frappe Redis internals. Cache invalidation is revision-driven and authoritative write locking/serialization uses D1/DO semantics; R7 compares observable invalidation and mutual-exclusion outcomes.
- FRAPPE-14 Print and PDF — Forge deliberately does not expose Frappe's binary download_pdf on Workers; it exposes rendered HTML+CSS and fails unsupported PDF generation explicitly instead of returning a fake success.
- FRAPPE-18 Hooks and app composition — Forge intentionally does not execute arbitrary Python hooks/monkey patches. Controller overrides, ordered document events and app composition are represented by versioned registries and deterministic pre-commit/outbox phases.
- FRAPPE-27 Security boundaries — Forge intentionally refuses arbitrary Python safe_exec/raw SQL/implicit global state in Workers and replaces them with allowlisted DSLs, typed errors, trusted tenant identity, server-side authorization and bounded execution.

## Gaps

9 domains remain platform-closure blockers. Machine-readable details are in `R7_GAP_BACKLOG.json`; human closure order is in `R7_GAP_BACKLOG.md`.

FRAPPE-06 REST/RPC is no longer a blocker: v2 `group_by` aggregates and `as_dict=false` are implemented on the canonical permission-aware list authority and passed R7 GitHub Actions run `36909990405`.

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

Current expected state: **audit-complete passes; certify remains blocked by 9 gaps**.
