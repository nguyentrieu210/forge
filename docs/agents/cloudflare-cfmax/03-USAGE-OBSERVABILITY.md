# CF03 — Analytics Engine / Usage / Observability

Status: READY
Branch: `cloudflare/cfmax-03-usage-observability`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authority: WS12 SRE
Consumer authority: WS11 plan/quota/billing
Risk: STANDARD for telemetry; CRITICAL if used for customer billing enforcement

## Mission

Build a deliberate per-tenant operational usage plane using Cloudflare Analytics Engine and existing logs/traces, without confusing sampled telemetry with Forge's authoritative audit or financial records.

## Required reading

Common CFMAX docs plus:

- all Worker `observability` configs;
- SRE runbooks/alert policy/operational envelope;
- control-plane entitlement/plan/quota code;
- request routing/gateway identity context;
- jobs/query/queue metrics seams;
- Workers AI usage paths;
- existing audit/event tables.

Provider references:

- `https://developers.cloudflare.com/analytics/analytics-engine/recipes/usage-based-billing-for-your-saas-product/`
- `https://developers.cloudflare.com/analytics/analytics-engine/limits/`
- `https://developers.cloudflare.com/analytics/analytics-engine/pricing/`

## Owned scope

- telemetry event taxonomy;
- Analytics Engine dataset/binding proposal;
- cardinality and PII policy;
- per-tenant usage data points;
- query recipes for tenant health/cost/usage;
- reconciliation seam for billing/quotas;
- workflow/queue/AI metrics contracts consumed from sibling lanes;
- alert/SLO evidence inputs, without inventing customer SLA.

## Forbidden zone

Do not:

- store secrets, tokens, passwords, raw authorization headers or arbitrary business payloads;
- use Analytics Engine as immutable audit;
- generate customer accounting invoices from sampled telemetry without deterministic reconciliation;
- create a second entitlement/billing authority;
- promise unlimited retention;
- deploy production datasets/bindings without approval.

## Design constraints

Current provider constraints from source lock include:

- one index per data point;
- up to 20 blobs and 20 doubles;
- total blob payload <=16 KB per data point;
- max 250 data points per Worker invocation;
- three-month retention.

Design around these limits instead of discovering them after instrumentation spreads everywhere.

## Event model

Prefer a small set of stable event families:

1. `request` — route family, worker, status class, latency;
2. `data` — D1/query class rows read/written if observable safely;
3. `async` — queue publish/consume/retry/DLQ;
4. `workflow` — instance/step outcome classes, not sensitive payload;
5. `storage` — upload/download/export size classes;
6. `ai` — provider/model/purpose/token/cost classes;
7. `security` — edge/auth abuse outcome class, subject to privacy policy.

Recommended index: tenant/customer identifier where per-tenant queries dominate.

## Dimension budget

Before code write a fixed allocation table:

```text
field slot | meaning | cardinality expectation | sensitive? | required? | example
```

Do not casually consume five AI Gateway metadata slots and twenty Analytics blobs with overlapping dimensions.

## Required queries

At minimum prove query recipes for:

- top tenants by request/operation volume;
- error rate by tenant and worker;
- latency distribution proxy by route family;
- queue retry/DLQ trend;
- Workflow failure/step trend when CF02 exists;
- AI cost/usage by tenant/app/purpose when CF05 exists;
- storage/export volume;
- tenant plan usage reconciliation candidate;
- noisy-neighbor detection.

## Billing/entitlement boundary

If product billing or quota enforcement consumes telemetry, define:

```text
metered event
 -> Analytics Engine operational aggregate
 -> deterministic reconciliation/checkpoint
 -> authoritative Forge usage/billing record
 -> invoice/entitlement decision
```

The exact authoritative record belongs to WS11. Analytics Engine may provide an approximation signal, not legal/financial truth by itself.

## Implementation slices

### A — telemetry inventory

List current logs/traces/audit/events and identify duplication/gaps.

### B — event schema package/helper

If needed, create one tiny typed writer seam so every Worker does not invent blob/double positions independently.

### C — gateway/tenant request instrumentation

Start with bounded high-value events and prove overhead.

### D — async/AI hooks

Consume clean metric events from queues/workflows/AI rather than importing their internals.

### E — query/runbook evidence

Add SQL/query examples and operational interpretation.

### F — cost model

Estimate data points/request rate and future provider cost under representative tenants.

## Acceptance gates

Before RC:

- capability mapping;
- typed schema/dimension budget;
- PII/secret review;
- cardinality/load estimate;
- targeted unit/integration test around writer;
- sample queries return expected tenant separation;
- cross-tenant query negative test at Forge API layer if telemetry is exposed to users;
- performance overhead measurement;
- cost estimate at low/medium/high tenant traffic;
- billing reconciliation boundary documented;
- no customer SLA invented;
- no production claim without exact dataset/deploy evidence.

## Dependencies

- CF08 for canonical resource/cost taxonomy;
- CF02 for workflow metrics;
- CF05 for AI dimensions/cost fields;
- CF04 for security event privacy policy;
- WS11 for authoritative usage/entitlement records.

## Completion record

Owner: —
Started from: —
Head: —
Status: READY
Capabilities: —
Datasets: —
Dimension allocation: —
Tests/queries: —
Cost estimate: —
Dependency requests: —
Gaps: —

## Startup prompt

Đọc handoff, Skill, CFMAX docs và exact source. Audit telemetry hiện có trước khi thêm Analytics Engine. Thiết kế dimension/cardinality/PII/cost trước code. Giữ Analytics Engine là operational telemetry; nếu chạm billing/quota phải có deterministic reconciliation và WS11 authority. Blocker ghi Dependency Request rồi tiếp tục. Không deploy production dataset/binding khi chưa được duyệt.
