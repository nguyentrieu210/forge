# CF03 — Analytics Engine / Usage / Observability

Status: REVIEW — request usage seam complete; production binding/live-query evidence gated
Branch: `cloudflare/cfmax-03-usage-observability`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Latest main synchronized: `c10e8d9ec5da740910c4b995e03ea9529fa726b4` via internal PR `#532`
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

Canonical CF03 allocation now lives in `docs/ops/CFMAX_USAGE_TELEMETRY.md` and `server/packages/usage-telemetry/src/index.ts`.

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

Sampling-correct request queries and a tenant reconciliation candidate are now documented in `docs/ops/CFMAX_USAGE_TELEMETRY.md`. Queue/Workflow/AI/security families remain dependency-owned hooks rather than duplicated local implementations.

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

Exact audit confirmed current Control Plane entitlement code stores policy/limits while quota evaluation receives `used` as an input. CF03 does not replace that input with sampled Analytics Engine data.

## Implementation slices

### A — telemetry inventory — COMPLETE

Audited platform Worker observability, structured logs/traces, Gateway tenant/plan routing and WS11 entitlement policy. Existing logs/traces remain provider observability authority; Analytics Engine fills the per-tenant usage-contract gap.

### B — event schema package/helper — COMPLETE for v1

Added `server/packages/usage-telemetry/src/index.ts`:

- one trusted tenant index;
- fixed 20 blob / 20 double map;
- coarse route/operation/status classifiers;
- 96-byte index guard without truncation;
- stricter Forge blob budgets;
- fail-open telemetry writer wrapper that cannot fail customer requests.

### C — gateway/tenant request instrumentation — COMPLETE as dormant seam

Gateway now constructs one bounded request event after a trusted tenant route is known and an outcome is available. It records plan, coarse route family, operation/status class, latency, Content-Length byte counts and trusted callback app id where applicable.

`USAGE_ANALYTICS` remains optional and is intentionally not added to production Wrangler config in this autonomous pass. No dataset or binding has been provisioned/deployed.

### D — async/AI hooks — DEPENDENCY REQUESTS RECORDED

CF02 owns Workflow metrics, CF05 owns AI provider/cost semantics, CF04 owns security-event privacy, and CF08 owns common resource/cost taxonomy. CF03 leaves explicit slots/interfaces instead of copying sibling authority.

### E — query/runbook evidence — COMPLETE for request family

`docs/ops/CFMAX_USAGE_TELEMETRY.md` contains sampling-aware SQL for tenant volume, status/error breakdown, weighted p95 latency, bandwidth, noisy-neighbor candidates and one-tenant reconciliation windows.

### F — cost model — COMPLETE for request family planning

One Gateway data point per tenant-resolved request is modeled against the provider source lock. The runbook clearly separates current provider billing state, published future pricing, Forge cost planning and customer pricing.

## Acceptance gates

Before RC:

- [x] capability mapping: `O01-003` Metrics + `T01-008` Usage metering; `T01-009` Quota remains WS11 authority;
- [x] typed schema/dimension budget;
- [x] PII/secret review;
- [x] cardinality/load estimate for one-point-per-request slice;
- [x] targeted unit test source added around writer/schema/privacy classifiers;
- [ ] exact-head repository build/test PASS in a usable pinned dependency environment;
- [ ] sample dataset queries return expected tenant separation;
- [ ] cross-tenant query negative test at Forge API layer if telemetry is exposed to users;
- [ ] production before/after performance overhead measurement;
- [x] cost estimate at representative traffic volumes;
- [x] billing reconciliation boundary documented;
- [x] no customer SLA invented;
- [x] no production claim without exact dataset/deploy evidence.

Maturity interpretation:

- `O01-003 Metrics`: remains **Wired**; existing provider metrics plus CF03 per-tenant usage seam, still no new production AE evidence.
- `T01-008 Usage metering`: **Foundation**; schema/writer/Gateway seam/query contract exist, but binding/live dataset/reconciliation are not yet end-to-end.
- `T01-009 Quota`: unchanged; CF03 creates no competing quota authority.

## Dependencies

### DR-CF03-01 — CF08 resource/cost taxonomy

```text
Dependency Request
ID: DR-CF03-01
Owner: CF08
Need: canonical Cloudflare resource/cost taxonomy and naming for shared cost attribution.
Why: CF08 owns production resource/config/cost governance.
Blocked scope: final cross-primitive cost rollup and budget labels.
Can continue independently: yes
Next independent work: request usage seam/query evidence.
```

### DR-CF03-02 — WS11 authoritative usage reconciliation

```text
Dependency Request
ID: DR-CF03-02
Owner: WS11
Need: authoritative usage checkpoint/reconciliation record and exact quota/billing consumption contract.
Why: WS11 owns plan/quota/entitlement/billing authority; Analytics Engine is sampled telemetry.
Blocked scope: quota enforcement and customer billing from CF03 telemetry.
Can continue independently: yes
Next independent work: operational metering and queries.
```

### DR-CF03-03 — CF02 Workflow metrics

```text
Dependency Request
ID: DR-CF03-03
Owner: CF02
Need: stable workflow instance/step metric envelope without business payload.
Why: CF02 owns Workflow orchestration semantics.
Blocked scope: workflow event family instrumentation.
Can continue independently: yes
Next independent work: request family.
```

### DR-CF03-04 — CF05 AI usage/cost dimensions

```text
Dependency Request
ID: DR-CF03-04
Owner: CF05
Need: authoritative provider/model/purpose/token/cost source and redaction contract.
Why: CF05 owns AI policy/provider economics.
Blocked scope: AI event family instrumentation.
Can continue independently: yes
Next independent work: request family.
```

### DR-CF03-05 — CF04 security telemetry privacy

```text
Dependency Request
ID: DR-CF03-05
Owner: CF04
Need: approved low-cardinality security outcome taxonomy.
Why: CF04 owns perimeter/security semantics and privacy implications.
Blocked scope: security event family instrumentation.
Can continue independently: yes
Next independent work: non-security request telemetry.
```

## Completion record

Owner: ChatGPT-CF03  
Started from: synchronized worker branch on `main@d651a3c43a7841cb82cf47561cfae7a89a276b88` via `#524`, then resynchronized exact latest `main@c10e8d9ec5da740910c4b995e03ea9529fa726b4` via `#532`  
Implementation checkpoint before this handoff update: `606cd497b3b3fb1233653c21a74237ec5a0fc1eb`  
Status: REVIEW — request-family implementation complete to non-UI merge/infrastructure activation gate  
Capabilities: `O01-003` Wired (enhanced), `T01-008` Foundation, `T01-009` unchanged/WS11-owned  
Dataset: proposed `forge_usage_v1`; **NOT created/enabled/deployed**  
Dimension allocation: fixed 1 index + 20 blob + 20 double contract in code/runbook  
Tests/queries: `server/tests/cfmax-usage-telemetry.test.mjs` added; sampling-aware SQL documented; exact full repository execution not claimed  
Cost estimate: one point/tenant-resolved Gateway request; representative 1M/10M/100M/1B monthly planning table documented  
Dependency requests: DR-CF03-01..05  
Production evidence: NONE; no dataset/binding/deploy/secret/DNS/customer-data mutation  
Gaps: pinned exact-head build/test, binding/type regeneration, live tenant separation query, performance measurement, WS11 reconciliation, sibling event families  

## Startup prompt

Đọc handoff, Skill, CFMAX docs và exact source. Audit telemetry hiện có trước khi thêm Analytics Engine. Thiết kế dimension/cardinality/PII/cost trước code. Giữ Analytics Engine là operational telemetry; nếu chạm billing/quota phải có deterministic reconciliation và WS11 authority. Blocker ghi Dependency Request rồi tiếp tục. Không deploy production dataset/binding khi chưa được duyệt.
