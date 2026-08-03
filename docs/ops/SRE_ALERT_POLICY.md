# Forge SRE Alert Policy

> Source-level operational policy. Alert delivery destinations, credentials and escalation identities are intentionally not embedded here; those are governed with WS11. This file defines **what is actionable** and what the first safe response is.

## Principles

1. An alert must correspond to an operator action. Logs that nobody can act on are evidence, not alerts.
2. Security/data-integrity/release-convergence failures fail closed regardless of traffic volume.
3. Do not put customer payloads, auth material, cookies or secrets in alert bodies.
4. Provider limits and engineering thresholds are not customer SLA.
5. One failed tenant/queue must not suppress evidence for others.
6. Destructive recovery (PITR/rollback affecting production) is never automatic from an alert.

## Signals

| Signal | Severity | Trigger | First safe action |
|---|---|---|---|
| Auth boundary changed | Critical | SRE health snapshot sees unauthenticated boot status other than `403` | stop release/promotion; inspect Gateway/Tenant auth path; do not mutate data |
| Exact release did not converge | Critical during release | `/health`/root/release marker fails after bounded convergence attempts or SHA/hash mismatches | stop promotion; identify deployed Gateway version; no data action |
| Backup replay verification failed | Critical before migration/PITR | manifest/checksum/replay/quick-check/FK/tenant-scope verification fails | abort migration/PITR; preserve evidence and backup file; investigate source export |
| PITR provider bookmark mismatch | Critical | provider restore response/post-restore bookmark differs from exact target/preflight expectation | stop further recovery actions; preserve current/previous bookmarks and evidence |
| Queue message exhausted retries | High | any configured DLQ receives a message | inspect typed envelope/error evidence; quarantine until WS10-approved replay path is applicable |
| Queue retry pressure | Warning | repeated structured retry events for same queue/tenant/job/event | diagnose dependency/provider/domain failure before increasing retries |
| Tenant maintenance sweep failure | High when persistent | `TENANT_MAINTENANCE_SWEEP.failed > 0` across repeated sweeps | identify failed tenant route/worker; confirm other tenants continue to sweep |
| Worker server fault | High when sustained/spiking | structured 5xx/resource-limit evidence materially exceeds recent baseline | inspect trace/logs; identify release or resource regression before raising limits |
| D1 storage headroom | Warning / High | engineering warning at 70% / critical at 85% of plan-specific database-size ceiling | measure growth source; archive/optimize/plan migration before provider hard limit |
| Queue retention risk | High | oldest backlog age reaches 50% of configured retention window | resolve consumer/replay blockage before messages approach expiry |
| Restore/rollback duration regression | Warning | measured drill duration materially exceeds prior evidence | inspect data size/provider/query growth before setting or changing RTO |

## Release alerts are gates, not background noise

The canonical ALU workflow uses `sre-health-snapshot.mjs` as a release gate. A failed convergence job must leave the release failed. Do not add `continue-on-error` to health/auth/release checks to keep a deployment green.

## Queue alerts

Provider queue metrics/backlog are the monitoring source. Forge structured retry logs provide diagnosis fields:
- service/queue scope;
- tenant id where applicable;
- event/job id;
- attempt count;
- retry delay;
- safe error code/name.

Alert payload must never include raw Facebook/social bodies or arbitrary queue message payload.

DLQ depth `>0` is actionable by definition because a message has exhausted the normal delivery contract. It does **not** authorize blind replay.

## D1/storage alerts

The 70%/85% database-size thresholds are Forge engineering headroom defaults. They are intentionally below Cloudflare's hard limit and may be tuned from measured growth, but changing them does not change customer SLA.

For Time Travel, retention length is a provider capability, not Forge RPO. RPO remains unset until approved as an operating policy.

## Delivery ownership

WS12 emits/defines operational evidence. WS11 owns the protected destination/credential/governance boundary for notification channels. Until that dependency is closed:
- workflow failures remain visible in GitHub Actions;
- Cloudflare logs/traces/metrics remain provider evidence;
- no source file should embed webhook URLs, tokens, phone numbers or email credentials.

## Escalation boundary

No automatic alert handler may:
- execute D1 PITR;
- delete/replace a production database;
- replay a DLQ blindly;
- rollback a Worker version;
- rotate secrets/DNS;
- migrate customer data.

Those are explicit production operations with their own preflight/confirmation contract.
