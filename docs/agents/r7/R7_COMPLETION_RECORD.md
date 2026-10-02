# R7-A Completion Record

## Current decision

`R7-A NOT CLOSED`.

The 28-domain Frappe v16.19.0 audit is fully classified and fail-closed. Platform certification remains blocked by 7 concrete GAP domains.

## Exact identity

- Forge seed: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`.
- Pull request: `#994`, branch `codex/r7-frappe-platform-closure`.
- Frappe: `v16.19.0` @ `ba18090b141740e75d52aa97bfc525ff2f831f6c`.
- Denominator: 28 domains from `server/docs/spec/source-exact/frappe-framework-domain-ledger.json`.

## Current matrix

| Classification | Count |
|---|---:|
| UNRESOLVED | 0 |
| GAP | 7 |
| INTENTIONAL_DIFFERENCE | 8 |
| OUT_OF_SCOPE | 1 |
| SEMANTIC_PARITY | 12 |
| EXACT_PARITY | 0 |
| FORGE_SUPERSET | 0 |
| **Total** | **28** |

## Latest closures

- FRAPPE-06 REST/RPC: permission-aware Frappe v2 `group_by`, tuple-shape output and canonical v2 envelopes.
- FRAPPE-05 Authentication & Sessions: Frappe User API keys with `token`/`Basic`, stable api_key + rotating one-time secret, `frappe.auth.get_logged_user`, and reason-bound audited cookie impersonation with signed original-operator attribution. Final R7 run `36960547760` passed.
- FRAPPE-10 Scheduler: installed-app `scheduler_events` for all/hourly/daily/weekly/monthly/yearly/annual and bounded five-field cron, tenant timezone evaluation, jobs-worker fan-out, D1 claim-before-execute dedupe, failure state and stale-state pruning. R7 run `36961538818` passed.

Forge intentionally does not embed Frappe's Python/Redis scheduler or croniter-only extensions. Generic app cadence is executed through bounded app Workers and D1 state.

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

1. FRAPPE-11 realtime.
2. FRAPPE-15/16/17 data import, workflow and communications.
3. FRAPPE-19/23/26 migration, portal and integrations.

R7-B ERPNext closure should consume these verified platform contracts rather than compensate for Frappe-layer ambiguity.
