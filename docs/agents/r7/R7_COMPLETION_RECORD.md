# R7-A Completion Record

## Current decision

`R7-A NOT CLOSED`.

This branch establishes R7-00 control evidence and starts exact-main disposition work. It does not claim full Frappe platform parity.

## Exact identity

- Forge seed: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`.
- Current PR head observed while updating this record: `934664c365f139220ff26597dd7535b1001763a8`.
- Pull request: `#994`.
- Frappe: `v16.19.0` @ `ba18090b141740e75d52aa97bfc525ff2f831f6c`.
- Denominator: 28 domains from `server/docs/spec/source-exact/frappe-framework-domain-ledger.json`.

## Current matrix

| Classification | Count |
|---|---:|
| UNRESOLVED | 23 |
| GAP | 2 |
| INTENTIONAL_DIFFERENCE | 2 |
| OUT_OF_SCOPE | 1 |
| SEMANTIC_PARITY | 0 |
| EXACT_PARITY | 0 |
| FORGE_SUPERSET | 0 |
| **Total** | **28** |

Initial proven dispositions:

- FRAPPE-07 Database abstraction -> INTENTIONAL_DIFFERENCE.
- FRAPPE-14 Print/PDF -> INTENTIONAL_DIFFERENCE.
- FRAPPE-17 Notifications/communications -> GAP (no mail transport).
- FRAPPE-23 Website/portal -> GAP.
- FRAPPE-28 upstream testing framework -> OUT_OF_SCOPE with rationale.

Everything else remains unresolved until lane-specific evidence is sufficient.

## R7-00 deliverables

- program contract;
- Frappe 16 source-lock binding;
- 28-domain denominator;
- machine-readable parity matrix;
- human matrix summary;
- oracle/clean-room contract;
- dependency ledger;
- fail-closed audit/certification verifier;
- targeted regression test;
- npm audit/certification/test commands.

## Commands

From `server/`:

```bash
npm run test:r7-frappe
npm run r7:frappe:audit
npm run r7:frappe:certify
```

The certification command is expected to fail until `GAP + UNRESOLVED = 0`.

## Execution evidence boundary

GitHub currently reports no PR-triggered workflow runs or commit status checks for this R7 head. The repository intentionally does not use a general development Actions CI as a substitute for local risk-based gates.

Therefore this record does **not** claim the new commands were executed by GitHub Actions. Static source/matrix integrity was independently re-read through GitHub and confirmed as 28/28 IDs with no duplicate, missing or unknown domain IDs.

## Next convergence order

Prioritize ambiguities that contaminate ERPNext comparison:

1. metadata/document lifecycle;
2. permissions;
3. workflow;
4. query/list/report/API;
5. async/hooks/realtime;
6. files/audit/localization/security.

R7-B ERPNext closure should consume these verified platform contracts rather than compensate for Frappe-layer ambiguity.
