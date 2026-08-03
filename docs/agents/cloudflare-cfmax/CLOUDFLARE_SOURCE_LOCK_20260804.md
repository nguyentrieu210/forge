# CFMAX Cloudflare Source Lock — 2026-08-04

Status: program source lock
Purpose: freeze the provider facts used for CFMAX architecture decisions. Re-check official Cloudflare documentation before production capacity, pricing or plan commitments.

This file is not a promise that Forge will adopt every listed product.

## Source authority rule

For provider behavior/limits/features:

1. official `developers.cloudflare.com` product docs;
2. official Cloudflare changelog for newly released behavior;
3. exact Forge code/tests for what Forge actually uses.

Provider docs do not override Forge business invariants. Exact Forge code/migrations/tests do not override provider hard limits.

## Locked sources

| Primitive | Official source | Verified | Provider fact relevant to Forge | CFMAX stance |
|---|---|---:|---|---|
| D1 read replication / Sessions | https://developers.cloudflare.com/d1/best-practices/read-replication/ | 2026-08-04 | Read replication requires Sessions API; bookmarks preserve sequential consistency across sessions; writes still execute on primary; result metadata exposes `served_by_region` / `served_by_primary`. | REQUIRED evidence/hardening |
| Workers for Platforms | https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/ | 2026-08-04 | Multi-tenant isolated Worker execution with platform-controlled bindings. | Already architectural core; audit/harden, do not replace |
| Dynamic Workers | https://developers.cloudflare.com/dynamic-workers/ | 2026-08-04 | Runtime-created Workers for arbitrary/untrusted code; bindings/network/limits are controlled by host platform. | CONDITIONAL/EXPERIMENTAL until sandbox policy exists |
| Dynamic Workflows | https://developers.cloudflare.com/dynamic-workers/usage/dynamic-workflows/ | 2026-08-04 | Durable workflows can run inside Dynamic Workers and survive isolate recycling; fit tenant-defined automations. | CONDITIONAL after static Workflow foundation |
| Workflows | https://developers.cloudflare.com/workflows/ | 2026-08-04 | Durable multi-step execution with persisted steps, retry/wait/event semantics. | REQUIRED for long-running orchestration candidates after exact-state audit |
| Analytics Engine usage-based billing recipe | https://developers.cloudflare.com/analytics/analytics-engine/recipes/usage-based-billing-for-your-saas-product/ | 2026-08-04 | Designed for per-customer SaaS usage analytics and approximate billing/observability patterns. | RECOMMENDED; not authoritative billing ledger |
| Analytics Engine limits | https://developers.cloudflare.com/analytics/analytics-engine/limits/ | 2026-08-04 | Max 20 blobs, 20 doubles, one index per data point; blob payload <=16 KB; max 250 data points per Worker invocation; retention three months. | REQUIRED design constraint if adopted |
| Analytics Engine pricing | https://developers.cloudflare.com/analytics/analytics-engine/pricing/ | 2026-08-04 | Pricing model is based on data points written and read queries; docs currently state billing is not yet active while future pricing is published. | Cost model must not assume permanent free usage |
| AI Gateway spend limits | https://developers.cloudflare.com/ai-gateway/features/spend-limits/ | 2026-08-04 | Budgets can be scoped by provider/model/custom metadata; over-budget requests are blocked or can route to cheaper fallback; enforcement is eventually consistent during bursts. | RECOMMENDED for multi-tenant AI economics |
| AI Gateway rate limiting | https://developers.cloudflare.com/ai-gateway/features/rate-limiting/ | 2026-08-04 | Request-rate control separate from spend/cost control. | RECOMMENDED |
| AI Gateway limits | https://developers.cloudflare.com/ai-gateway/reference/limits/ | 2026-08-04 | Gateway/log/custom metadata constraints apply; current docs list five custom metadata entries per request. | REQUIRED design constraint if adopted |
| AI Gateway REST API | https://developers.cloudflare.com/ai-gateway/changelog/ | 2026-08-04 | Current platform exposes unified REST API across Cloudflare-hosted and external model providers. | Prefer provider-neutral Forge AI seam |
| Vectorize | https://developers.cloudflare.com/vectorize/get-started/intro/ | 2026-08-04 | GA vector database for semantic search/recommendation/classification/anomaly detection/context retrieval. | CONDITIONAL derived index only |
| Vectorize + Workers AI | https://developers.cloudflare.com/vectorize/get-started/embeddings/ | 2026-08-04 | Native Worker binding flow for embeddings and similarity search. | CONDITIONAL |
| Browser Run PDF | https://developers.cloudflare.com/browser-run/quick-actions/pdf-endpoint/ | 2026-08-04 | Server-side PDF from URL or HTML via REST or Workers binding; relevant to invoices/reports/certificates. | RECOMMENDED for print/export plane |
| WAF | https://developers.cloudflare.com/waf/ | 2026-08-04 | Edge filtering of incoming web/API requests using rulesets. | REQUIRED audit; adoption depends plan/config |
| WAF custom rules | https://developers.cloudflare.com/waf/custom-rules/ | 2026-08-04 | Custom expressions can block/challenge/skip traffic by request properties. | RECOMMENDED defense-in-depth |
| WAF rate limiting | https://developers.cloudflare.com/waf/rate-limiting-rules/ | 2026-08-04 | Protect login/API endpoints and expensive operations against abuse/resource exhaustion. | RECOMMENDED/REQUIRED for exposed sensitive routes after compatibility test |
| Cloudflare Access service tokens | https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/ | 2026-08-04 | Machine-to-machine access policy with revocable service credentials. | CONDITIONAL for administrative/internal surfaces |
| Cloudflare One / Zero Trust | https://developers.cloudflare.com/cloudflare-one/ | 2026-08-04 | Identity/context-based least-privilege perimeter controls. | CONDITIONAL for staff/support/admin perimeter, never ERP authorization replacement |
| Hyperdrive | https://developers.cloudflare.com/hyperdrive/ | 2026-08-04 | Accelerates external PostgreSQL/MySQL access from Workers. | CONDITIONAL for legacy/external SQL connectors |
| Hyperdrive connection pooling | https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/ | 2026-08-04 | Managed connection pools to origin databases. | Conditional design input |
| Hyperdrive query caching | https://developers.cloudflare.com/hyperdrive/concepts/query-caching/ | 2026-08-04 | Eligible read queries can be cached; writes are not cached. | Never use cache to decide authoritative write invariants |
| Pipelines | https://developers.cloudflare.com/pipelines/ | 2026-08-04 | Open beta; streaming ingest/SQL transform/exactly-once delivery into R2 Iceberg/Parquet/JSON. | EXPERIMENTAL/CONDITIONAL analytical sink only |

## Locked architecture interpretations

### D1

- Enable/read from replicas only through explicit session policy.
- Authoritative command reads start primary-first or from a bookmark with sufficient freshness.
- Read-only/report paths may use replica-friendly sessions if product semantics tolerate the consistency model.
- `served_by_region` and `served_by_primary` are useful evidence fields, not business state.

### Workflows

- Workflows are orchestration state, not ERP state.
- A workflow step may call a Forge command; the command remains idempotent and authoritative.
- Queue remains appropriate for independent event delivery/fan-out.
- Durable Objects remain coordination/serialization authorities for invariants they already own.

### Analytics Engine

- Telemetry is sampled/operational, not legal/audit truth.
- Three-month retention means it is unsuitable as the only long-lived evidence store.
- Usage-based customer billing must include reconciliation/contract semantics outside Analytics Engine if monetary invoices depend on it.

### AI Gateway

- Spend-limit enforcement may be eventually consistent under concurrent bursts; Forge should not promise a mathematically exact hard ceiling from that primitive alone.
- Custom metadata slots are limited; tenant/user/app/purpose dimensions require a deliberate encoding policy.
- Provider/model fallback cannot silently violate data residency, cost, capability or model-policy constraints.

### Vectorize / AI Search

- Semantic indexes are derived.
- Canonical object permission must be rechecked at disclosure/action time.
- Deletion, tenant isolation, source freshness and re-index semantics are mandatory before RC.

### Browser Run

- Rendering arbitrary user-supplied URLs can create SSRF/exfiltration risk; Forge should prefer controlled HTML or allowlisted origins.
- Render success does not bypass permission checks for source data or generated artifact download.

### WAF / Access / Turnstile

- Perimeter security does not replace Forge auth or authorization.
- Machine/browser/API compatibility must be tested before challenge/rate-limit enforcement.
- Internal admin/support surfaces may justify stronger Access policies than tenant-facing product traffic.

### Dynamic Workers

- Host platform must control bindings, network access and limits.
- No dynamic code receives broad DB/R2/secret bindings by default.
- Dynamic Workflows are not adopted until Dynamic Worker sandbox policy and static Workflow contracts are stable.

### Hyperdrive

- It accelerates an external database; it does not make that external database part of Forge canonical tenant authority automatically.
- Query caching must not decide mutable business invariants.

### Pipelines

- Suitable for telemetry/clickstream/CDC-like analytical feeds.
- Not suitable as the canonical ERP command transaction path.
- Open-beta status requires explicit production risk review before reliance.

## Re-check triggers

Re-open this source lock when any of these occur:

1. compatibility date bump crosses a major provider behavior change;
2. Cloudflare product moves beta/GA/deprecation;
3. limits or billing materially change;
4. Forge introduces a new plan/SLA that depends on provider quotas;
5. a CFMAX worker needs a provider feature not listed here;
6. production incident evidence contradicts an assumed provider behavior.
