# CFMAX Usage Telemetry — Analytics Engine contract

Date: 2026-08-04  
Owner: CF03 / WS12 SRE  
Consumer authority: WS11 plan/quota/billing  
Status: implementation seam complete; production Analytics Engine binding/dataset NOT enabled  
Risk: STANDARD for operational telemetry; CRITICAL if used for quota or customer billing

## 1. Decision

Adoption decision: **RECOMMENDED**.

Forge should use Cloudflare Workers Analytics Engine as a per-tenant **operational usage and cost-attribution plane**. It must not become:

- the immutable audit ledger;
- the authoritative plan/quota counter;
- the source that directly creates customer invoices;
- a long-term compliance archive.

Current Forge already has Cloudflare native logs/traces and structured error/retry evidence. CF03 adds a deliberately separate usage signal because the existing observability plane does not expose a stable per-tenant metering contract.

The authoritative boundary remains:

```text
request / queue / workflow / AI event
        -> Analytics Engine operational sample
        -> deterministic reconciliation/checkpoint
        -> authoritative Forge usage record (WS11)
        -> quota / billing decision
```

The reconciliation/checkpoint and authoritative usage record are a WS11 dependency and are intentionally not invented in CF03.

## 2. Current-state audit

Existing evidence on the CF03 branch after synchronizing current main:

- Gateway, generated tenant, Query, Jobs, Control Plane and Social Ingress have Cloudflare observability enabled.
- Platform logs are 100% sampled and traces are enabled with a bounded head sampling rate.
- Gateway 5xx and queue retry paths emit structured metadata and deliberately avoid request bodies/tokens/raw external payloads.
- Gateway already resolves a trusted tenant before dispatch and already has plan information on the route record.
- Control Plane stores authoritative **plan entitlement policy/limits**, but `evaluateQuotaEntitlement` accepts `used` as an input; there is no CF03-owned authoritative usage counter to replace that input.
- No `writeDataPoint()` Analytics Engine usage plane existed before this CF03 slice.

Therefore CF03 instruments the trusted Gateway seam first rather than duplicating logs or writing telemetry inside every vertical app.

## 3. Provider constraints locked into design

Source lock verified 2026-08-04. Re-check official Cloudflare documentation before production enablement.

Design assumptions:

- one index per data point;
- at most 20 blobs and 20 doubles;
- Analytics Engine index limit: 96 bytes;
- total provider blob payload limit: 16 KB per data point;
- at most 250 data points per Worker invocation;
- retention: three months;
- Analytics Engine can sample high-volume indexes; queries must use `_sample_interval` weighting;
- `writeDataPoint()` is telemetry-side and must not be awaited on the correctness path.

Forge adds a stricter safety budget on top of provider limits:

- one tenant index only;
- max 512 bytes per dimension value;
- max 8 KB total blob payload;
- no raw URL path dimension.

## 4. Dataset and binding proposal

Proposed dataset name:

```text
forge_usage_v1
```

Proposed Gateway binding:

```jsonc
"analytics_engine_datasets": [
  { "binding": "USAGE_ANALYTICS", "dataset": "forge_usage_v1" }
]
```

This binding is **not enabled in this CF03 autonomous slice**. Reason:

1. production dataset/binding creation is an explicit infrastructure gate;
2. generated Wrangler binding types must be regenerated with the pinned toolchain when activation is approved;
3. keeping `USAGE_ANALYTICS` optional makes local/dev/test behavior deterministic and keeps telemetry failure outside the customer correctness path.

No secret is required for a Worker Analytics Engine binding.

## 5. Stable data-point schema

Implementation authority:

```text
server/packages/usage-telemetry/src/index.ts
```

### Index

| Field | Meaning | Cardinality | Sensitive | Rule |
|---|---|---:|---|---|
| `index1` | trusted `tenant_id` | tenant count | internal identifier | required; <=96 bytes; never truncated |

Tenant ID is the index because tenant-scoped queries dominate and Cloudflare sampling is index-aware. A too-long tenant identifier fails telemetry encoding rather than being truncated into an alias.

### Blob allocation

| Blob | Name | Cardinality expectation | Sensitive? | Rule |
|---|---|---:|---|---|
| `blob1` | `schema_version` | 1/version | no | `forge-usage-v1` |
| `blob2` | `event_family` | <10 | no | request/data/async/workflow/storage/ai/security |
| `blob3` | `service` | low | no | stable Worker/service name |
| `blob4` | `plan` | <=4 | no | free/pro/enterprise/unassigned |
| `blob5` | `route_family` | low | no | coarse route taxonomy only |
| `blob6` | `operation_class` | <=4 | no | read/write/command/other |
| `blob7` | `status_class` | <=10 | no | 2xx/4xx/5xx/etc. |
| `blob8` | `app_id` | bounded app catalog | internal | only trusted/verified app id |
| `blob9` | `capability_family` | bounded capability taxonomy | no | future sibling hook |
| `blob10` | `region` | provider region set | no | future provider evidence |
| `blob11` | `provider` | low | no | future AI/provider hook |
| `blob12` | `model_class` | low/bounded | no | never prompt/model response |
| `blob13` | `purpose` | bounded enum | no | future AI purpose taxonomy |
| `blob14` | `outcome` | low | no | ok/error/retry/etc. |
| `blob15` | `queue` | bounded queue catalog | no | future CF02/WS10 hook |
| `blob16` | `workflow` | bounded workflow catalog | no | future CF02 hook |
| `blob17` | `storage_class` | low | no | future storage/export hook |
| `blob18` | `source` | low | no | emitting seam |
| `blob19` | reserved | — | — | do not consume without schema version review |
| `blob20` | reserved | — | — | do not consume without schema version review |

### Double allocation

| Double | Name | Unit |
|---|---|---|
| `double1` | `latency_ms` | ms |
| `double2` | `request_bytes` | bytes |
| `double3` | `response_bytes` | bytes |
| `double4` | `d1_rows_read` | rows |
| `double5` | `d1_rows_written` | rows |
| `double6` | `queue_messages` | messages |
| `double7` | `workflow_steps` | steps |
| `double8` | `ai_input_tokens` | tokens |
| `double9` | `ai_output_tokens` | tokens |
| `double10` | `ai_cost_microusd` | micro-USD |
| `double11` | `storage_bytes` | bytes |
| `double12` | `retry_count` | retries |
| `double13` | `status_code` | HTTP status |
| `double14` | `cpu_ms_estimate` | ms, only when a trustworthy source exists |
| `double15..20` | reserved | — |

Unknown/absent measures are zero. CF03 does not fabricate D1/CPU/AI values when the emitting seam cannot observe them reliably.

## 6. Privacy / PII / secret policy

Never write any of the following into Analytics Engine:

- Authorization header, JWT, cookie, API key, password, secret;
- request or response body;
- raw prompt/model response;
- raw webhook/social payload;
- email, phone, address or free-form user text;
- document names/IDs merely because they appear in a URL;
- raw URL pathname when it can contain a document, file or customer identifier.

Gateway route telemetry uses a coarse classifier instead:

```text
/api/resource/... -> api.resource
/api/method/...   -> api.method
/api/...          -> api.other
/_app/...         -> app.callback
/files/...        -> files
/shop/...         -> client.shop
other client nav  -> client.shell
```

`app_id` is recorded only after the existing app-callback credential and trusted identity have been verified.

## 7. Gateway slice behavior

For a tenant-resolved request, Gateway records at most one request event after a response/outcome is known.

Captured today:

- trusted tenant;
- plan;
- coarse route family;
- operation class;
- status/status class;
- latency;
- Content-Length request/response sizes when present;
- trusted callback app id when applicable.

Not captured today:

- health requests before tenant resolution;
- unknown-host requests where no trusted tenant exists;
- body-derived byte counts when Content-Length is absent;
- D1 rows, CPU time, workflow/queue/AI metrics that Gateway cannot know authoritatively.

Telemetry failure is fail-open **for telemetry only**: missing binding, local development, invalid telemetry data, or provider write errors cannot alter the customer response.

## 8. Sampling-correct query recipes

Assume dataset `forge_usage_v1` and slot mapping above.

### Top tenants by request volume

```sql
SELECT
  index1 AS tenant_id,
  sum(_sample_interval) AS request_count
FROM forge_usage_v1
WHERE blob2 = 'request'
  AND timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY tenant_id
ORDER BY request_count DESC
LIMIT 50
```

### Error/status trend by tenant and service

Return status classes separately, then calculate the rate from weighted counts rather than using raw row counts:

```sql
SELECT
  index1 AS tenant_id,
  blob3 AS service,
  blob7 AS status_class,
  sum(_sample_interval) AS request_count
FROM forge_usage_v1
WHERE blob2 = 'request'
  AND timestamp >= NOW() - INTERVAL '1' HOUR
GROUP BY tenant_id, service, status_class
ORDER BY request_count DESC
```

### Weighted p95 latency by tenant/route

```sql
SELECT
  index1 AS tenant_id,
  blob5 AS route_family,
  quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_latency_ms
FROM forge_usage_v1
WHERE blob2 = 'request'
  AND timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY tenant_id, route_family
ORDER BY p95_latency_ms DESC
```

### Request and response volume

```sql
SELECT
  index1 AS tenant_id,
  sum(_sample_interval * double2) AS request_bytes,
  sum(_sample_interval * double3) AS response_bytes
FROM forge_usage_v1
WHERE blob2 = 'request'
  AND timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY tenant_id
ORDER BY response_bytes DESC
```

### Noisy-neighbor candidate

```sql
SELECT
  index1 AS tenant_id,
  sum(_sample_interval) AS requests,
  sum(_sample_interval * double3) AS response_bytes,
  quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_latency_ms
FROM forge_usage_v1
WHERE blob2 = 'request'
  AND timestamp >= NOW() - INTERVAL '15' MINUTE
GROUP BY tenant_id
ORDER BY requests DESC
LIMIT 50
```

This query produces an operational candidate list only. It must not suspend/throttle a tenant by itself.

### Tenant usage reconciliation candidate

For billing/quota reconciliation, query **one tenant at a time** for an explicit checkpoint window:

```sql
SELECT
  index1 AS tenant_id,
  blob5 AS route_family,
  blob6 AS operation_class,
  sum(_sample_interval) AS request_count
FROM forge_usage_v1
WHERE index1 = 'TENANT_ID'
  AND blob2 = 'request'
  AND timestamp >= toDateTime('2026-08-01 00:00:00')
  AND timestamp <  toDateTime('2026-09-01 00:00:00')
GROUP BY tenant_id, route_family, operation_class
```

The returned approximation must then be reconciled/checkpointed into a WS11-owned authoritative record before money or quota enforcement depends on it.

## 9. Cost model

Current CF03 Gateway design emits **one data point per tenant-resolved request** when the binding is enabled.

Published provider pricing/source lock on 2026-08-04:

- Workers Paid included writes: 10 million data points/month;
- published write overage: USD 0.25 per additional million data points;
- included SQL reads: 1 million queries/month;
- published read-query overage: USD 1 per additional million queries;
- Cloudflare currently states Analytics Engine billing is not yet active, while publishing the future pricing model.

Representative one-point-per-request envelope:

| Tenant-resolved requests/month | Data points | Published included/overage position | Published future write overage |
|---:|---:|---:|---:|
| 1M | 1M | within 10M | USD 0 |
| 10M | 10M | at included ceiling | USD 0 |
| 100M | 100M | 90M over included | ~USD 22.50 |
| 1B | 1B | 990M over included | ~USD 247.50 |

These are **planning estimates, not current invoices and not customer pricing**. Re-check provider pricing before activation or plan design.

Read-query costs should stay small if dashboards aggregate bounded windows and billing reconciliation queries one tenant/window at a time. Query volume must still be measured before a customer-facing usage dashboard is declared production-ready.

## 10. Performance contract

- `writeDataPoint()` is called once after outcome determination.
- no network request is manually issued by Gateway for the write;
- no telemetry promise is awaited;
- event construction uses bounded strings/numbers only;
- no request/response body is cloned or parsed for telemetry.

This architecture minimizes request-path overhead, but **no production p50/p95 overhead measurement is claimed yet**. Exact before/after remote evidence belongs to the activation gate.

## 11. Validation

Repository tests added:

```text
server/tests/cfmax-usage-telemetry.test.mjs
```

They cover:

- exactly one tenant index;
- fixed 20 blob / 20 double allocation;
- low-cardinality route classification;
- no raw document path in route dimension;
- 96-byte index fail-closed behavior without truncation;
- missing/failing telemetry writer never becoming a customer failure.

A local exact repository build/test has not been claimed where the pinned dependency graph/toolchain is unavailable. Merge readiness must use the normal Forge exact-head validation environment.

## 12. Dependency requests

### DR-CF03-01 — CF08 resource/cost taxonomy

```text
Dependency Request
ID: DR-CF03-01
Owner: CF08
Need: canonical Cloudflare resource/cost taxonomy and naming for cost attribution dimensions/checkpoints.
Why: CF08 owns production resource/config/cost governance.
Blocked scope: final cross-primitive cost rollup and budget dashboard labels.
Can continue independently: yes
Next independent work: request telemetry schema, privacy guards and Gateway instrumentation.
```

### DR-CF03-02 — WS11 authoritative usage reconciliation

```text
Dependency Request
ID: DR-CF03-02
Owner: WS11
Need: authoritative usage checkpoint/reconciliation record and exact quota/billing consumption contract.
Why: WS11 owns plan, quota, entitlement and billing authority; Analytics Engine is sampled telemetry.
Blocked scope: quota enforcement and customer billing from usage telemetry.
Can continue independently: yes
Next independent work: operational queries and metering seam.
```

### DR-CF03-03 — CF02 workflow metric contract

```text
Dependency Request
ID: DR-CF03-03
Owner: CF02
Need: stable workflow instance/step outcome metric envelope with no business payload.
Why: CF02 owns Workflow orchestration semantics.
Blocked scope: workflow event family instrumentation.
Can continue independently: yes
Next independent work: Gateway request family.
```

### DR-CF03-04 — CF05 AI usage dimensions

```text
Dependency Request
ID: DR-CF03-04
Owner: CF05
Need: authoritative provider/model/purpose/token/cost field source and redaction contract.
Why: CF05 owns AI policy/provider economics and must not leak prompts/private context.
Blocked scope: AI event family instrumentation.
Can continue independently: yes
Next independent work: request usage plane.
```

### DR-CF03-05 — CF04 security privacy taxonomy

```text
Dependency Request
ID: DR-CF03-05
Owner: CF04
Need: approved low-cardinality security outcome taxonomy suitable for operational telemetry.
Why: CF04 owns perimeter/security semantics and privacy implications.
Blocked scope: security event family instrumentation.
Can continue independently: yes
Next independent work: non-security request telemetry.
```

## 13. Activation / RC gate

Before enabling the production dataset/binding or claiming RC:

1. resolve/accept CF08 dimension/cost naming where it affects shared taxonomy;
2. add `analytics_engine_datasets` binding to the intended Worker config;
3. regenerate Wrangler binding types with the pinned repository toolchain;
4. exact-head TypeScript build + focused tests + repository guards PASS;
5. deploy only with explicit infrastructure authorization;
6. prove sample writes and tenant-separated queries against the exact dataset;
7. cross-tenant negative test any Forge API that exposes usage to customers;
8. measure request overhead before/after;
9. record actual data-point/query volume and revise cost estimate;
10. if quota/billing consumes the data, land WS11 deterministic checkpoint/reconciliation first;
11. do not claim customer SLA or production telemetry until exact deployment/query evidence exists.

Until those gates are satisfied, maturity is **Wired for the code seam / not production-proven**.
