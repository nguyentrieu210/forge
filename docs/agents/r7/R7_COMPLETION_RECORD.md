# R7-A Completion Record

## Current decision

`R7-A NOT CLOSED`.

The 28-domain Frappe v16.19.0 audit is fully classified and fail-closed. Platform certification remains blocked by 9 concrete GAP domains.

## Exact identity

- Forge seed: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`.
- Pull request: `#994`, branch `codex/r7-frappe-platform-closure`.
- Frappe: `v16.19.0` @ `ba18090b141740e75d52aa97bfc525ff2f831f6c`.
- Denominator: 28 domains from `server/docs/spec/source-exact/frappe-framework-domain-ledger.json`.

## Current matrix

| Classification | Count |
|---|---:|
| UNRESOLVED | 0 |
| GAP | 9 |
| INTENTIONAL_DIFFERENCE | 6 |
| OUT_OF_SCOPE | 1 |
| SEMANTIC_PARITY | 12 |
| EXACT_PARITY | 0 |
| FORGE_SUPERSET | 0 |
| **Total** | **28** |

## Latest closure

FRAPPE-06 REST/RPC is classified `SEMANTIC_PARITY` after Forge implemented bounded Frappe v2 collection semantics on the canonical Document List authority, including permission-aware `group_by` aggregates and `as_dict=false` tuple output. Workerd regression coverage passed R7 GitHub Actions run `36909990405`.

## Gates

From `server/`:

```bash
npm run test:r7-frappe
npm run r7:frappe:audit
npm run r7:frappe:audit-complete
npm run r7:frappe:certify
```

`audit-complete` is expected to pass because `UNRESOLVED=0`. `certify` must continue to fail until `GAP=0`.

## Remaining convergence order

1. FRAPPE-05 authentication/session lifecycle.
2. FRAPPE-10/11 scheduler and realtime.
3. FRAPPE-15/16/17 data import, workflow, communications.
4. FRAPPE-19/23/26 migration, portal, integrations.

R7-B ERPNext closure should consume these verified platform contracts rather than compensate for Frappe-layer ambiguity.
