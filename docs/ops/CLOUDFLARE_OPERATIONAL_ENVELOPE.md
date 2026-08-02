# Cloudflare Operational Envelope for Forge

> Provider envelope checked **2026-08-03** against current Cloudflare Workers, D1 and Queues documentation. These are infrastructure limits/cost inputs, not Forge customer SLA. Re-check provider documentation before changing production limits because quotas and pricing are external contracts.

## 1. Workers

Current provider envelope:

| Limit | Workers Free | Workers Paid |
|---|---:|---:|
| Requests | 100,000/day | no fixed request/day limit |
| Memory per isolate | 128 MB | 128 MB |
| CPU per HTTP request | 10 ms | configurable up to 5 min; default 30 sec |
| Subrequests per invocation | 50 | default 10,000; can be raised by config/provider limits |
| Simultaneous outgoing connections | 6 | 6 |
| Workers per account | 100 | 500; Workers for Platforms is the scale-out path |

Forge deliberately applies **lower per-tenant dispatch limits** in the Gateway than the provider maximum:

- free: `50 ms CPU / 100 subrequests`;
- pro: `100 ms / 500`;
- enterprise: `200 ms / 1000`;
- login raises CPU allowance to at least `400 ms` because password hashing is intentionally expensive.

This is an abuse/cost isolation boundary, not a promise that every request may consume the full budget.

Operational guard:
- do not raise tenant CPU/subrequest budgets merely because Cloudflare permits it;
- require a measured workload and cost/performance evidence first;
- treat repeated Worker resource-limit errors as a design/performance defect before raising limits.

## 2. D1

Current provider envelope:

| Limit | Free | Workers Paid |
|---|---:|---:|
| Databases/account | 10 | 50,000 |
| Max database size | 500 MB | 10 GB |
| Total storage/account | 5 GB | 1 TB |
| Time Travel history | 7 days | 30 days |
| Time Travel restores | 10 per 10 minutes/database | same provider limit |
| Queries per Worker invocation | 50 | 1000 |
| SQL query duration | 30 sec | 30 sec |
| Max SQL statement | 100 KB | 100 KB |
| Max bound parameters | 100 | 100 |
| Max row/string/BLOB | 2 MB | 2 MB |
| `d1 execute` import file | 5 GB | 5 GB |

A D1 database is single-threaded and executes queries one at a time. Throughput therefore depends heavily on query duration. Forge's one-D1-per-tenant architecture gives horizontal isolation, but an individual noisy tenant can still overload its own database.

### D1 design guards

1. **Tenant database headroom:** operational warning at 70% of the plan-specific database-size ceiling; critical at 85%. These are Forge engineering defaults, not Cloudflare limits or customer SLA.
2. **SQL statement headroom:** generated/imported statements should stay below 80 KB where practical. Existing backup restore rewriting uses this conservative boundary because the provider maximum is 100 KB.
3. **Long-query guard:** queries approaching the 30-second provider ceiling are already operational failures for interactive ERP. Fix query shape/indexing rather than treating 30 seconds as an acceptable budget.
4. **PITR:** provider Time Travel is always on for production storage, but PITR is destructive and remains an explicitly authorized operation. Forge captures a fresh export + replay verification before destructive PITR.
5. **Backup portability:** Time Travel is provider-local recovery; verified SQL exports remain the portable recovery evidence. Encrypted off-account retention is still a WS11 dependency.

### D1 paid-plan cost inputs

Current published paid-plan billing inputs:

- first 25 billion rows read/month included, then `$0.001 / million rows`;
- first 50 million rows written/month included, then `$1.00 / million rows`;
- first 5 GB storage included, then `$0.75 / GB-month`.

Cost review should therefore track **rows written** especially carefully: a write-heavy reconciliation/import loop can become materially more expensive than equivalent reads.

## 3. Queues

Current provider envelope:

| Limit | Value |
|---|---:|
| Queues/account | 10,000 |
| Message size | 128 KB |
| Maximum retries | 100 |
| Consumer batch size | 100 messages |
| Batch wait | 60 sec |
| Queue throughput | 5,000 messages/sec |
| Paid retention | configurable up to 14 days |
| Free retention | 24 hours |
| Backlog | 25 GB/queue |
| Concurrent push-consumer invocations | 250 |
| Consumer wall time | 15 min |
| Retry/send delay | up to 24 hours |

Forge source currently uses substantially smaller batch/retry settings and requires a distinct DLQ for every configured consumer.

### Queue design guards

1. Normal application event payloads should target **<=64 KB**. Provider maximum is 128 KB, but Queues billing counts each 64 KB chunk as an operation unit.
2. Do not raise retry counts toward the provider maximum without poison-message handling. More retries mean more reads/cost and can hide a deterministic failure.
3. Every consumer must have a DLQ. A DLQ prevents silent deletion; it does not define safe replay.
4. Replay/quarantine requires WS10's canonical event contract so tenant/idempotency/schema checks remain authoritative.
5. Backlog monitoring must alert before retention expiry. Exact age/error thresholds remain part of the future production SLO/alert policy; RTO/RPO are currently unset.

### Queue paid-plan cost inputs

Current published paid-plan model:

- first 1,000,000 operations/month included;
- additional operations: `$0.40 / million`;
- a normal delivered message usually costs roughly three operations: write + read + delete;
- retries add reads; moving an exhausted message to a DLQ adds another write;
- messages larger than 64 KB consume multiple operation units.

## 4. Load/performance evidence

`server/scripts/http-load-smoke.mjs` is intentionally bounded below provider ceilings:

- default localhost only;
- GET/HEAD only;
- remote requires explicit host confirmation;
- remote hard cap 500 requests and concurrency 10.

Those limits protect production from a test tool becoming the incident it was meant to detect.

## 5. What remains policy, not provider fact

The following are intentionally **UNSET** until production operating policy is approved from measured evidence:

- customer-facing availability SLA;
- p95/p99 latency SLO;
- RTO;
- RPO;
- alert delivery destinations/escalation chain;
- DR rehearsal cadence;
- tenant plan quotas/billing product policy.

Engineering smoke thresholds and provider hard limits must not be relabeled as customer commitments.

## Provider sources checked

- Cloudflare Workers limits — last updated 2026-07-05.
- Cloudflare D1 limits/pricing and Time Travel — current 2026 documentation.
- Cloudflare Queues limits, batching/retries and pricing — current 2026 documentation.
