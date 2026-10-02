# R7-A Completion Record

## Current decision

`R7-A NOT CLOSED`.

The 28-domain Frappe v16.19.0 audit is fully classified and fail-closed. Platform certification remains blocked by 3 concrete GAP domains.

## Exact identity

- Forge seed: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`.
- Pull request: `#994`, branch `codex/r7-frappe-platform-closure`.
- Frappe: `v16.19.0` @ `ba18090b141740e75d52aa97bfc525ff2f831f6c`.
- Denominator: 28 domains from `server/docs/spec/source-exact/frappe-framework-domain-ledger.json`.

## Current matrix

| Classification | Count |
|---|---:|
| UNRESOLVED | 0 |
| GAP | 3 |
| INTENTIONAL_DIFFERENCE | 12 |
| OUT_OF_SCOPE | 1 |
| SEMANTIC_PARITY | 12 |
| EXACT_PARITY | 0 |
| FORGE_SUPERSET | 0 |
| **Total** | **28** |

## Latest closures

- FRAPPE-05 Authentication & Sessions — final R7 auth run `36960547760`.
- FRAPPE-10 Scheduler — app scheduler composition, cadence/dedupe and Workerd run `36961538818`.
- FRAPPE-11 Realtime — same-origin session auth, automatic Frappe rooms, DocPerm-gated doctype/doc rooms, task/progress and open-doc presence, committed `list_update`/`docinfo_update`, D1 monotonic sequence, deterministic live ordering, reconnect replay and duplicate-source suppression. R7 run `36964256721` passed.
- FRAPPE-15 Data import/export — durable Data Import document lifecycle, preview/start/status/error-download/update-existing and permission-aware export; classified `INTENTIONAL_DIFFERENCE` only for XLS/XLSX normalization outside the Worker runtime. R7 run `36967357569` passed.
- FRAPPE-16 Workflow — bounded transition conditions, state update side effects, durable Workflow Action lifecycle and durable workflow-email intent; arbitrary Python transition tasks and Guest action links remain intentional platform-security differences. R7 run `36969406334` passed.
- FRAPPE-17 Notifications/communications — authorized Notification delivery plus durable Email Queue, deterministic dedupe, retry/backoff, stale-claim recovery, provider evidence and Workflow Action email enqueue; HTTPS relay replaces SMTP internals. R7 run `36970284103` passed.

Forge intentionally uses Durable Objects + D1 + raw JSON WebSocket rather than Frappe Socket.IO + Redis. The semantic room/order/reconnect contract is closed; arbitrary Python/app realtime handlers are not a Forge kernel extension surface.

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

1. FRAPPE-19 migrations and patches.
2. FRAPPE-23/26 website/portal and integrations.

R7-B ERPNext closure should consume these verified platform contracts rather than compensate for Frappe-layer ambiguity.


## Continued convergence — 2026-10-02

Migration SHA256 journal and explicit evidence-bound reconciliation, conditional Website cache, authenticated owner Web Form read/list/update, atomic durable webhook fanout and tenant-maintenance delivery, Connected App state/PKCE/encrypted cache/refresh/disconnect, and integration API authorization are implemented. Source-runtime verification passed 66 targeted tests; the workflow now compiles the changed authorities and runs the runtime suite plus Workerd facade regressions. The new Workerd scenario withholds event ACK on fanout failure and proves retry uses original committed source bytes.

FRAPPE-19/23/26 remain GAP for the exact residual contracts in the synchronized backlog. Source implementation and fake-provider tests do not constitute live provider or production evidence. `certify` stays fail-closed.

Verified implementation head: `bf5457ff295efaacdbda4e5578a23d5abe202e66`. GitHub Actions R7 run `36972661090` passed the changed-authority TypeScript guard, 6 control tests, 60 runtime safety tests and Workerd Frappe facade regression. This evidence verifies the source continuation; it does not change the three GAP dispositions or authorize production operations.
