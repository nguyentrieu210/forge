# CFMAX — Forge Cloudflare Maximization Program

Date: 2026-08-04
Status: PROGRAM bootstrap / control-plane specification
Repository: `nguyentrieu210/forge`
Program branch: `cloudflare/cfmax-00-control`
Exact source baseline: `main@fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`
Classification: `PROGRAM`
Risk mix: STANDARD + CRITICAL
Merge boundary: non-UI/shared/backend/infrastructure work stops before merge/deploy for explicit user approval.

## 1. Mission

Turn Forge from a system that already runs deeply on Cloudflare into a deliberately optimized Cloudflare-native enterprise SaaS platform.

The program is **not** a service-collection exercise. A Cloudflare product is adopted only when it improves at least one measurable property:

1. correctness/consistency;
2. isolation/security;
3. latency/throughput;
4. failure recovery/durability;
5. SaaS economics/cost attribution;
6. operational visibility;
7. tenant extensibility;
8. development velocity without creating a second source of truth.

The target is to maximize the useful Cloudflare surface while preserving Forge architecture:

```text
Browser / API client
        |
        v
Cloudflare Edge Security
(WAF / Rate Limit / Turnstile / Access where appropriate)
        |
        v
Gateway Worker + Workers Assets
        |
        +--> ROUTES KV
        +--> Control-plane service binding
        +--> Workers for Platforms dispatcher
        |
        v
Tenant Worker / App Worker
        |
        +--> D1 + Sessions/read replicas
        +--> Durable Objects for coordination
        +--> Queues for event delivery
        +--> Workflows for durable orchestration
        +--> R2 for blobs/exports
        +--> Analytics Engine for usage telemetry
        +--> AI Gateway -> Workers AI / external providers
        +--> Vectorize / AI Search when semantic retrieval is justified
        +--> Browser Run for server rendering/PDF
        +--> Dynamic Workers for untrusted/runtime-defined code
        +--> Containers/Sandbox only for workloads that exceed Worker semantics
        +--> Hyperdrive only for external Postgres/MySQL sources
        +--> Pipelines only for streaming analytical/event sinks
```

## 2. Mandatory reading and authority

Every CFMAX worker must read, in order:

1. exact branch head and exact current `main`;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `docs/agents/AUTO_AGENT_ORCHESTRATION.md`;
4. `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`;
5. `CURRENT_STATUS.md`;
6. `NEXT_TASKS.md`;
7. `PROJECT_CONTEXT.md`;
8. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
9. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
10. `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
11. `server/docs/spec/technical/cloudflare-kernel-fit.md`;
12. `server/docs/spec/technical/cloudflare-resource-map.md`;
13. `docs/ops/CLOUDFLARE_OPERATIONAL_ENVELOPE.md`;
14. branch-local CFMAX handoff.

If documents disagree, code + migrations + tests + exact GitHub state win.

## 3. Architecture invariants CFMAX may not break

### 3.1 Authoritative writes

- CloudForge document kernel remains the business write authority.
- No Cloudflare primitive may bypass Durable Object/document-kernel invariants for document, stock, finance, payroll, audit, outbox or receipt writes.
- Workflows orchestrate commands; they do not become a competing ledger/database.
- Analytics Engine is telemetry, never the authoritative audit ledger.
- Vectorize is a derived retrieval index, never a permission or business source of truth.
- R2 is blob/object storage, not the canonical document store.

### 3.2 Tenant isolation

Every new primitive must define:

- tenant key/namespace;
- authentication boundary;
- permission context;
- resource quota/cost boundary;
- deletion/export/restore implications;
- cross-tenant negative tests.

### 3.3 Permission

Edge security reduces attack surface but never replaces Forge server-side authorization. WAF/Access/Turnstile cannot be used to justify weaker DocPerm/role/share/user-permission enforcement.

### 3.4 Failure semantics

Any async/durable primitive must define:

- idempotency key;
- retry policy;
- poison/dead-letter behavior where relevant;
- timeout/cancellation semantics;
- replay safety;
- state inspection;
- recovery/runbook.

### 3.5 Cost as an architecture constraint

A design is incomplete until it states:

- billable dimensions;
- high-cardinality dimensions;
- maximum per-tenant blast radius;
- plan quota seam;
- whether cost can be estimated/reconciled;
- what happens when a budget is exhausted.

## 4. Existing baseline — do not rebuild what already exists

Current Forge already contains meaningful Cloudflare-native architecture:

- Gateway Worker serving Assets and dispatching tenants;
- Workers for Platforms dispatch namespace;
- D1 per tenant plus control/jobs databases;
- Durable Object command coordination;
- Queues + DLQ + outbox patterns;
- R2 file storage;
- KV routing;
- service bindings;
- scheduled jobs;
- observability logs/traces;
- Workers AI in at least one vertical worker;
- D1 Sessions architecture and primary-first command semantics documented in kernel-fit;
- D1 PITR/backup/release operational material.

CFMAX workers must first classify each target as:

`already-good / evidence-gap / wiring-gap / architecture-gap / optional / reject`

Do not rewrite a working primitive just to attach the CFMAX label.

## 5. Adoption decision model

Each primitive receives one of five decisions:

### REQUIRED
Required for the target Forge platform architecture and should reach RC/Hardened evidence.

### RECOMMENDED
High-value but can land after critical consistency/orchestration work.

### CONDITIONAL
Only implement when a concrete Forge capability requires it.

### EXPERIMENTAL
Run isolated proof/benchmark; no production authority.

### REJECTED
Not useful or creates a competing authority/cost/complexity with no measurable value.

No worker may mark a primitive REQUIRED simply because Cloudflare offers it.

## 6. Program lanes

### CFMAX-01 — D1 Sessions, read replication and consistency architecture

Owner authority: WS00 architecture/kernel, with WS14 client seam consultation.
Risk: CRITICAL.

Scope:

- exact audit of every D1 access path;
- command-side `first-primary`/authoritative session rules;
- bookmark propagation after writes;
- client bookmark transport/storage semantics;
- read-only/report session policy;
- read-replica enablement policy and rollout evidence;
- `served_by_region` / `served_by_primary` observability;
- stale-read risk classification per route;
- removal of accidental direct DB access that bypasses the session policy;
- KV/Cache API use only for stale-tolerant metadata/flags, never permission/ledger correctness.

Required proof before Hardened:

1. write -> bookmark -> subsequent request read-your-write integration;
2. command path cannot validate against unconstrained replica state;
3. report/read path can demonstrate replica serving when enabled;
4. stale bookmark/invalid bookmark behavior is fail-safe;
5. browser multi-tab/session behavior is documented/tested;
6. tenant isolation and cross-tenant bookmark misuse test;
7. p50/p95 regional read evidence before/after rollout.

### CFMAX-02 — Workflows and durable orchestration

Owner authority: WS09 BPM/App Factory for orchestration contract; WS11 SaaS lifecycle; WS13 migration/import consumers; WS12 recovery/observability.
Risk: CRITICAL.

Boundary:

```text
Queue     = event delivery/fan-out
Workflow  = durable multi-step orchestration
DO        = coordination/serialization
D1        = authoritative business/platform state
```

Candidate system workflows:

- tenant provision;
- tenant suspend/resume/delete preparation;
- app install/upgrade/rollback preparation;
- large import;
- tenant migration/reconciliation;
- long report/export;
- backup/restore rehearsal;
- repost/rebuild operations that already have authoritative domain commands.

Dynamic Workflows are a later App Factory capability for tenant-defined durable automations and require sandbox/binding policy before adoption.

Required contract:

- workflow instance identity;
- tenant and actor context;
- command idempotency key;
- step payload/version schema;
- retry/backoff semantics;
- wait/event semantics;
- cancellation;
- compensation versus authoritative reversal distinction;
- progress/status API;
- audit linkage to Forge state;
- observability and cost attribution;
- version upgrade semantics for in-flight workflows.

Forbidden:

- direct workflow mutation of finance/stock/payroll tables outside canonical commands;
- treating workflow step persistence as business ledger;
- silent infinite retries.

### CFMAX-03 — Analytics Engine, telemetry and SaaS usage plane

Owner authority: WS12 SRE; WS11 plan/quota/billing contract.
Risk: STANDARD/CRITICAL depending on billing use.

Purpose:

- per-tenant operational telemetry;
- usage attribution;
- endpoint/app/capability behavior;
- latency/error distributions;
- queue/workflow/AI usage signals;
- plan/quota evidence;
- capacity/cost analysis.

Data point design must explicitly budget Analytics Engine's field/index limits and cardinality.

Candidate dimensions:

- tenant_id as the indexed customer dimension;
- plan;
- worker/service;
- route family;
- app_id;
- capability family;
- operation class;
- status class;
- region;
- AI provider/model class where allowed.

Candidate measures:

- request count sampling weight;
- latency;
- approximate CPU duration bucket;
- D1 rows read/written if available;
- queue messages;
- workflow steps;
- bytes uploaded/downloaded;
- AI token/cost fields supplied by authoritative provider response where available.

Rules:

- no raw secrets/tokens/prompts/passwords;
- avoid sensitive document identifiers unless explicitly justified;
- Analytics Engine may support approximate usage billing but canonical invoice generation requires a deterministic billing/reconciliation seam owned by WS11;
- three-month telemetry retention is not compliance archive.

### CFMAX-04 — Edge security and identity perimeter

Owner authority: WS11 security/IAM/SaaS.
Risk: CRITICAL.

Audit and design:

- WAF managed/custom rules;
- rate limiting for login, public API, webhook and expensive routes;
- Turnstile for public anonymous abuse-prone forms where it improves abuse resistance;
- Cloudflare Access for internal/admin/support surfaces where appropriate;
- Access service tokens or mTLS for selected machine-to-machine administrative surfaces where they add defense in depth;
- custom-domain onboarding security implications;
- bot/challenge behavior compatibility with APIs/PWA;
- origin bypass prevention;
- security event evidence and rollback.

Required separation:

```text
Cloudflare perimeter control
        !=
Forge authentication
        !=
Forge authorization
```

No edge policy may cause authenticated API/mobile clients to become flaky without an explicit compatibility contract.

### CFMAX-05 — AI control plane, semantic retrieval and AI economics

Owner authority: WS08 BI/AI with WS11 security/quotas.
Risk: STANDARD/CRITICAL depending on data/tool permissions.

Target architecture:

```text
Forge capability/tool service
        -> permission-filtered context
        -> AI policy service
        -> AI Gateway
             -> Workers AI
             -> external provider(s)
        -> structured result/tool proposal
        -> Forge approval/command boundary
```

Scope:

- central AI Gateway instead of app-specific provider coupling;
- per-tenant/app/user custom metadata for cost/usage policy, constrained by provider limits;
- spend limits and rate limits;
- provider/model policy and fallback;
- caching policy only for safe deterministic/non-sensitive requests;
- log redaction/data retention policy;
- Workers AI migration seam;
- Vectorize for permission-aware derived semantic search where justified;
- AI Search/managed RAG only after source ownership, freshness, tenant isolation and deletion semantics are proven;
- prompt/tool injection defense and tool approval rules.

Vector search must re-check server permission on retrieved canonical objects before disclosing content.

### CFMAX-06 — Browser Run, PDF/rendering and export delivery

Owner authority: WS14 frontend/render contract + WS12 operational runtime; domain print definitions remain domain/metadata-owned.
Risk: STANDARD.

Target:

- preserve existing Print Format metadata as the presentation authority;
- produce deterministic server-side HTML;
- Browser Run `/pdf` or Worker binding renders PDF;
- persist large/generated artifacts to R2 when retention/re-download is required;
- permission-aware download endpoint;
- async Queue/Workflow for long/batch exports where appropriate;
- checksum/content-type/filename/audit metadata;
- expiry and retention policy.

Evidence:

- invoice/order/report fixture parity;
- Vietnamese font/render correctness using platform-supported fonts only;
- timeout/failure retry path;
- no arbitrary internal URL SSRF surface;
- authorization before render and before download;
- deterministic test artifact hash where practical.

### CFMAX-07 — Runtime expansion: Dynamic Workers, Containers/Sandbox, Hyperdrive, Pipelines

Owner authority: WS00 shared runtime contract, WS09 extensibility, WS10 integrations, WS13 migration depending on primitive.
Risk: CRITICAL for sandbox/external-data boundaries.

This lane is explicitly **decision-first**, not implementation-first.

#### Dynamic Workers

Candidate uses:

- tenant-defined safe scripts/formulas that cannot be expressed in metadata;
- AI-generated code execution;
- custom automation tools;
- isolated previews.

Must define binding allowlist, network policy, CPU/subrequest limits, code provenance, logs and tenant identity before code is executed.

#### Containers/Sandbox

Candidate uses only when Workers semantics are insufficient:

- Python/data tooling;
- DuckDB/large local analytical transforms;
- complex document conversion;
- isolated long/heavy tasks.

Do not move ordinary ERP CRUD/services into containers.

#### Hyperdrive

Conditional for external Postgres/MySQL sources/adapters. It is not a replacement for D1 tenant authority.

#### Pipelines

Conditional for high-volume event/telemetry/CDC-style analytical data into R2 Iceberg/Parquet. Never route authoritative ERP command state through Pipelines.

Required output is a go/no-go matrix with measurable trigger thresholds.

### CFMAX-08 — Production governance, cost, drift, release and recovery

Owner authority: WS12 SRE + WS11 SaaS governance.
Risk: CRITICAL.

Scope:

- complete Cloudflare resource inventory by environment;
- Wrangler/config/source-of-truth audit;
- resource-ID versus secret handling;
- config drift detection;
- deploy order/dependency graph;
- compatibility-date policy;
- limits/quota registry;
- per-tenant cost attribution model;
- production resource naming and tagging convention where supported;
- D1 backup/PITR/export policy;
- Queue DLQ recovery;
- Workflow failure recovery;
- R2 retention/lifecycle;
- AI spend guard;
- Analytics retention limitations;
- load/performance/capacity gates;
- emergency disable/feature flag strategy;
- rollback evidence.

No destructive PITR/DNS/secret/customer-data operation is allowed in CFMAX implementation without explicit user authorization.

## 7. Program-level capability matrix

Workers do not invent an alternative Forge capability taxonomy.

For every implementation item, the worker must:

1. locate the relevant canonical capability IDs in `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
2. record current maturity from `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
3. attach source/test/migration/permission/reconciliation/UI/production evidence as applicable;
4. request capability-map additions only if no canonical capability can represent the outcome;
5. never promote maturity merely because a binding/config exists.

CFMAX local IDs (`CFMAX-01`, etc.) are execution lanes, not product capability IDs.

## 8. Shared acceptance gates

A CFMAX lane cannot call itself RC merely because Wrangler accepts configuration.

Minimum gates:

### Architecture

- one source of truth;
- dependency boundary documented;
- tenant and actor context defined;
- no duplicate primitive with existing package/service;
- failure/cost semantics explicit.

### Security

- server permission remains authoritative;
- secrets excluded from Git/docs/logs;
- cross-tenant negative test;
- abuse/resource exhaustion scenario;
- internal callbacks/service bindings authenticate correctly.

### Reliability

- duplicate/retry/replay test for async paths;
- deterministic timeout/failure behavior;
- recovery runbook;
- observable status/error evidence.

### Performance/cost

- benchmark representative workload;
- billable dimensions identified;
- per-tenant blast radius bounded;
- do not increase provider limits to mask architecture defects.

### Production truth

- local/test wiring != production deployment;
- release evidence must identify exact SHA/config/environment;
- capability maturity only updates after exact evidence.

## 9. Dependency graph

```text
CFMAX-00 CONTROL
  |
  +--> CFMAX-01 D1 consistency
  |
  +--> CFMAX-04 edge security
  |
  +--> CFMAX-08 production governance
  |
  +--> CFMAX-02 orchestration
  |       +--> WS11 tenant lifecycle consumers
  |       +--> WS13 migration/import consumers
  |       +--> WS09 Dynamic Workflows later
  |
  +--> CFMAX-03 usage plane
  |       +--> CFMAX-08 cost/SLO
  |       +--> CFMAX-05 AI cost attribution
  |
  +--> CFMAX-05 AI control plane
  |
  +--> CFMAX-06 rendering/export
  |
  +--> CFMAX-07 runtime expansion decision matrix
```

CFMAX-01/04/08 may proceed immediately. CFMAX-02/03/05/06/07 may audit immediately but must consume shared contracts rather than duplicate them.

## 10. Merge order

Default convergence order:

1. control/spec/source lock only;
2. CFMAX-01 consistency foundation;
3. CFMAX-04 perimeter/security and CFMAX-08 governance when independent;
4. CFMAX-02 durable orchestration foundation;
5. CFMAX-03 telemetry/usage;
6. CFMAX-05 AI control plane;
7. CFMAX-06 rendering/export;
8. CFMAX-07 optional runtime primitives only after decision gates;
9. coordinator final convergence + capability/status evidence.

This order may change based on exact diffs/dependencies. Merge order is based on authority, not completion time.

## 11. Explicit non-goals

CFMAX does not:

- replace Forge with Cloudflare-managed products;
- remove D1 because another database product exists;
- convert every async event into a Workflow;
- move every computation into a Container;
- place every document into Vectorize;
- use Access as an ERP permission system;
- use Analytics Engine as legal audit/accounting ledger;
- create an AI agent that can mutate enterprise data without Forge authorization and approval;
- enable paid/Enterprise-only Cloudflare features without a documented value/cost decision;
- perform production DNS, secrets, PITR or destructive tenant mutation during bootstrap.

## 12. Exit criteria

CFMAX program reaches REVIEW only when:

- all eight workers have exact-state audit and capability mapping;
- REQUIRED primitives have implementation/evidence or explicit dependency blockers;
- CONDITIONAL primitives have objective go/no-go thresholds;
- source lock reflects current official Cloudflare docs and provider limitations;
- no duplicate source of truth exists;
- exact branch diffs show clean ownership;
- shared acceptance gates are met per risk class;
- cost/security/recovery implications are documented;
- coordinator audits final integrated diff against current `main`;
- non-UI merge/deploy waits for explicit user approval.

## 13. Coordinator rule

The control branch owns coordination artifacts only. It must not become a convenient dumping ground for worker implementation.

If a worker needs another stream's contract, it writes a Dependency Request and continues independent work. The coordinator routes the request and prevents overlapping authority.
