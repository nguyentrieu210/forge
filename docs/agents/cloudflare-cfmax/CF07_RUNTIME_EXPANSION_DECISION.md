# CF07 Runtime Expansion Decision Record

Date: 2026-08-04
Lane: `CFMAX-07`
Branch: `cloudflare/cfmax-07-runtime-expansion`
Risk: CRITICAL for dynamic-code, external-data and production-runtime boundaries
Decision mode: decision-first; no production binding, deploy or canonical-data mutation

## Executive decision

Exact Forge and provider audit does **not** justify a proof implementation for any CF07 primitive at this time.

| Primitive | Decision now | Why now | Revisit trigger |
|---|---|---|---|
| Dynamic Workers | **DEFER** | Forge now has bounded metadata/formula execution and no accepted workload that requires arbitrary tenant code. Sandbox/perimeter/cost contracts are not yet converged. | At least one accepted Forge capability cannot be expressed safely by current metadata/rule/formula/action primitives and has a representative code-execution workload. |
| Containers / Sandbox | **DEFER** | No measured Worker resource failure or required Python/DuckDB/Linux-tool workload exists in the authoritative runtime. Current Excel decoding remains browser/CLI and ordinary ERP/import work fits Worker-oriented contracts. | A representative workload repeatedly cannot meet Worker runtime/resource/compatibility requirements, or requires a full Linux/runtime/filesystem dependency that cannot be replaced by a bounded service/Worker path. |
| Hyperdrive | **DEFER** | Current Integration Hub is HTTP/event/provider-adapter oriented. Migration declares generic SQL as a source kind but no concrete Postgres/MySQL customer/source workload, latency baseline or origin connection-pressure evidence exists. | A named Postgres/MySQL-compatible source becomes an approved connector/migration requirement and direct Worker-to-origin measurements establish a real latency/connection/load problem. |
| Pipelines | **DEFER** | Forge has no measured event volume requiring a streaming analytical lake path; canonical async remains Queue/outbox and telemetry direction is Analytics Engine/R2. Pipelines remains open beta. | A real telemetry/clickstream/IoT/CDC-like stream exceeds the approved operational envelope of the simpler Queue/Analytics Engine/R2 path or requires durable streaming transforms to analytical R2 formats. |

`DEFER` is a complete CF07 outcome: triggers, authority boundaries and proof gates are explicit. No capability maturity is promoted by this decision record.

## Exact-state audit

### Git state

- Exact current `main` audited: `d651a3c43a7841cb82cf47561cfae7a89a276b88`.
- CF07 worker branch was seeded from the CFMAX control baseline and is intentionally behind current main while other parallel lanes/workstreams moved forward.
- Current main code/docs were read as authority; no stale branch implementation was treated as canonical.
- Because CF07 produces only decision/evidence docs in this pass, no rebase is required to create the record. Any future implementation must start from/rebase onto the then-current integration baseline and re-run the audit.

### Forge evidence used

1. `skills/forge-enterprise-completion/SKILL.md`
   - CloudForge/document kernel remains authoritative.
   - non-UI/backend/infrastructure work stops before merge/deploy.
2. `CURRENT_STATUS.md`
   - Forge production architecture is already Cloudflare-native; current unfinished work is not blocked on CF07 primitives.
3. `server/docs/spec/technical/cloudflare-kernel-fit.md`
   - current Worker/D1/DO/Queue architecture is a valid fit;
   - current scaling risks are query shape, broad scans, mutation size and coordination evidence, not missing container/SQL-stream infrastructure.
4. `docs/ops/CLOUDFLARE_OPERATIONAL_ENVELOPE.md`
   - Forge deliberately keeps per-tenant Worker budgets below provider maxima;
   - resource-budget increases require measured workload evidence.
5. `server/docs/spec/technical/cloudflare-resource-map.md`
   - Containers/Sandbox and Hyperdrive are candidate primitives for heavy analytics/external SQL, not current canonical authorities.
6. `server/packages/app-registry/src/bpm-formula.ts`
   - current main already has a bounded, versioned/effective-dated formula rule set with fixed-point arithmetic, cycle detection and validation;
   - arbitrary code is not required for ordinary formula execution.
7. `client/packages/builder/src/formula/formula-rule.ts`
   - current main includes an authoring contract for bounded formula rules.
8. `docs/agents/workstreams/WS09-bpm-app-factory.md`
   - App Factory still has enterprise gaps around rules/actions/preview, but these are metadata/runtime contract gaps before they are arbitrary-code requirements.
9. `docs/agents/workstreams/WS10-integration-hub.md`
   - generic connector platform already covers HTTPS target policy, mapping, provider adapters, sync cursors, retry/DLQ/idempotency contracts;
   - no current concrete external Postgres/MySQL connector is established.
10. `docs/agents/workstreams/WS13-migration-implementation.md`
    - migration architecture is source-adapter -> mapping/preview -> canonical command -> reconciliation;
    - Excel/workbook decoding remains browser/CLI and the Worker-side migration core is workbook-neutral;
    - generic SQL source support is demand-driven, not evidence of a Hyperdrive need.
11. repository search
    - no `worker_loaders` wiring found;
    - no first-party Hyperdrive binding/driver wiring found;
    - no first-party Pipelines wiring found.

## Provider facts re-checked

Provider documentation was re-checked during this audit because runtime products and pricing/maturity can change independently of Forge.

### Dynamic Workers

Official docs:

- `https://developers.cloudflare.com/dynamic-workers/`
- `https://developers.cloudflare.com/dynamic-workers/usage/bindings/`
- `https://developers.cloudflare.com/dynamic-workers/usage/egress-control/`
- `https://developers.cloudflare.com/dynamic-workers/usage/limits/`
- `https://developers.cloudflare.com/dynamic-workers/pricing/`

Relevant facts:

- runtime-loaded code can be isolated behind host-controlled bindings;
- outbound network can be blocked/intercepted;
- CPU/subrequest limits can be set per dynamic invocation;
- pricing includes dynamic-worker creation plus Worker request/CPU dimensions;
- stable IDs/code versions matter to creation cost.

Provider capability therefore exists; the missing piece is a Forge workload and Forge security/governance contract, not Cloudflare feasibility.

### Containers / Sandbox

Official docs:

- `https://developers.cloudflare.com/containers/`
- `https://developers.cloudflare.com/sandbox/`
- Cloudflare changelog: Containers and Sandboxes generally available since 2026-04-13.

Relevant facts:

- full Linux/container execution is available for resource-intensive or runtime/filesystem-dependent workloads;
- Sandbox is intended for isolated untrusted code and Python/Node/shell/data-analysis use cases;
- outbound access can be mediated through Worker-side handlers/bindings.

Provider GA status alone is not adoption evidence.

### Hyperdrive

Official docs:

- `https://developers.cloudflare.com/hyperdrive/`
- `https://developers.cloudflare.com/hyperdrive/concepts/query-caching/`
- `https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/`

Relevant facts:

- Hyperdrive targets existing PostgreSQL/MySQL-compatible databases;
- it pools origin connections and can cache eligible read queries;
- writes are not cached, but cached reads still require Forge freshness/authority policy.

### Pipelines

Official docs:

- `https://developers.cloudflare.com/pipelines/`
- `https://developers.cloudflare.com/pipelines/sinks/available-sinks/r2/`

Relevant facts:

- Pipelines is currently open beta;
- it ingests streaming events, applies SQL transforms and delivers exactly-once into R2 analytical formats including Iceberg/Parquet/JSON;
- it is a fit for logs/mobile events/IoT/clickstream, not ERP command transactions.

## Primitive A — Dynamic Workers

### Concrete Forge capabilities

Potential consumers only:

- `B01-013` Business rule;
- `B01-014` Formula rule;
- `B01-015` Webhook/external action;
- `B02-014` Rule builder;
- `B02-015` Formula builder;
- `B02-022` Preview/test app.

These capability IDs do **not** imply arbitrary code is the correct implementation.

### Current blocker without primitive

No current blocker proven.

Current main already supports a bounded formula AST with:

- explicit operators;
- fixed-point arithmetic;
- cycle detection;
- expression node/depth limits;
- effective dates and versions;
- field validation.

That is safer and more portable than arbitrary tenant code for ordinary formulas.

### Existing-primitive alternative

Prefer, in order:

1. metadata field/workflow/action contract;
2. bounded rule/formula AST;
3. provider connector/tool capability with server-side permission;
4. static first-party Worker/service binding;
5. only then Dynamic Worker when the requirement truly is user/runtime-defined code.

### Mandatory sandbox contract before any future proof

Dynamic code receives **no raw authoritative bindings by default**.

Required contract:

- code identity: tenant ID + code hash + immutable version + provenance + created/approved actor;
- module policy: allowlisted bundled modules only; no ambient package install unless separately approved;
- capability bindings: narrow RPC/service capabilities, never broad D1/R2/KV/secret objects for convenience;
- network: deny by default (`globalOutbound = null` equivalent), allow/intercept only named endpoints through host policy;
- secrets: secrets resolved/injected by trusted host capability, never exposed as generic environment values;
- resource limits: explicit CPU/subrequest limits per execution class;
- input: typed/schema-bounded payload with size limit;
- output: typed/schema-bounded result with size limit;
- timeout/cancellation: host-enforced and observable;
- observability: run ID, tenant, code hash/version, capability calls, resource use, outcome/error; no secret payload logging;
- retention/deletion: code/result/log retention and tenant deletion semantics;
- abuse/quota: per-tenant execution rate and cost attribution;
- dependency/vulnerability policy: bundled dependency allowlist + upgrade/revocation procedure.

### Trigger metrics

Collect before proof:

- `blocked_capability_count`: accepted capabilities blocked specifically because bounded metadata/rule/formula/action cannot express them;
- `candidate_code_runs_per_tenant_day`;
- `candidate_code_size_bytes`;
- `candidate_cpu_ms`, `candidate_subrequests`, outbound destination count;
- capability binding set required by each workload;
- expected code-version churn per tenant/day;
- failure/timeout/cancel frequency in a local isolated harness.

Reopen CF07 Dynamic Workers when `blocked_capability_count >= 1` with a concrete approved consumer and the owner has documented why promoting a reusable metadata primitive is not the better design.

### Decision

**DEFER**. No proof code in this pass.

## Primitive B — Containers / Sandbox

### Concrete Forge capabilities

Potential consumers:

- `IM02-002` Excel import;
- `IM02-016` Legacy SQL/API migration;
- future heavy analytical/export tooling where a canonical capability owner establishes the need.

### Current blocker without primitive

No measured blocker.

Important exact-state evidence:

- current migration design intentionally keeps workbook decoding in browser/CLI;
- Worker-side migration logic consumes normalized tabular data;
- ordinary ERP command/API/controller/ledger work is already Worker/D1/DO oriented;
- no current first-party Python/DuckDB/Linux-binary runtime is required for authoritative application execution.

### Existing-primitive alternative

- Worker for API/controller/validation;
- Queue/Workflow for asynchronous or long orchestration;
- R2 for staged large artifacts;
- browser/CLI preprocessing for workbook formats where server execution is not required;
- Browser Run for render/PDF concerns owned by CF06.

### Mandatory future container contract

- one tenant/run isolation identity;
- bounded input artifact set, content hash and R2/object provenance;
- no direct canonical D1 mutation from container;
- authoritative results return through Forge command/import boundary;
- no raw production secrets in filesystem/env;
- outbound deny/allow policy mediated by Worker where practical;
- filesystem lifecycle: ephemeral by default; snapshot only with explicit retention contract;
- CPU/memory/disk/runtime duration observation;
- cancellation/cleanup and orphan detection;
- result checksum/schema/size validation;
- per-tenant cost attribution.

### Trigger metrics

Collect:

- repeated Worker CPU/memory/subrequest/resource failures for the same representative workload;
- required runtime/library unavailable in Workers;
- input bytes/rows, transform duration, peak memory, temporary disk requirement;
- cold/start behavior and end-to-end completion latency;
- bytes transferred Worker/R2 <-> container;
- failure/cancel/cleanup behavior;
- cost per representative job compared with Worker/Workflow/CLI alternatives.

Reopen only when a real workload cannot meet accepted requirements with existing primitives or requires a Linux/runtime/filesystem dependency that is itself part of the approved product outcome.

### Decision

**DEFER**. Provider is capable and GA; Forge demand is unproven.

## Primitive C — Hyperdrive

### Concrete Forge capabilities

Potential consumers:

- `I01-007` Connector SDK;
- `I01-008` Mapping/transformation;
- `IM02-016` Legacy SQL/API migration;
- source-specific migration/connectivity capabilities only when a real external SQL source is approved.

### Current blocker without primitive

No current Postgres/MySQL connector blocker proven.

Current WS10 integration foundation is provider/API/event focused. WS13 has a generic SQL source kind but deliberately requires source-specific demand before an adapter is created.

### Required authority contract

```text
external Postgres/MySQL source
  -> Hyperdrive
  -> read/import connector adapter
  -> mapping/validation
  -> Forge canonical command/import
  -> reconciliation
```

Rules:

- external SQL never becomes Forge tenant canonical storage by accident;
- connector credentials are tenant-bound `secret_ref`/vault material, not committed config;
- prefer read-only origin credentials for import/replication-style flows;
- cached reads cannot decide Forge write invariants unless a freshness contract explicitly permits it;
- write-back, if ever required, must define source-of-truth, conflict, retry and reconciliation semantics separately.

### Trigger metrics

For a named source, collect a direct-baseline and Hyperdrive proof under the same representative query set:

- connection setup latency;
- p50/p95 query latency;
- origin active connection count/connection churn;
- query/error/retry rate;
- rows/bytes per sync page;
- cache eligibility/freshness requirement;
- import reconciliation result;
- cost/operational burden.

Do not set an arbitrary percentage improvement target before the source/SLO exists. Proof is justified when the direct path has a measured problem and Hyperdrive materially improves it without weakening source-of-truth/freshness rules.

### Decision

**DEFER**. No source-specific proof code.

## Primitive D — Pipelines

### Concrete Forge capability

No current canonical Forge capability requires Cloudflare Pipelines specifically. CF03 telemetry/usage work owns the operational telemetry taxonomy. CF07 must consume that taxonomy rather than invent a second analytics authority.

### Current blocker without primitive

No measured streaming-volume blocker.

Current simpler primitives already cover:

- Queue/outbox for post-commit application events;
- Analytics Engine candidate for operational usage telemetry;
- R2 for retained/export/archive objects.

### Required analytical-sink contract

If adopted later:

```text
canonical/operational event producer
  -> non-authoritative event envelope
  -> Pipeline ingest
  -> versioned SQL transform
  -> R2 Iceberg/Parquet/JSON
  -> analytical query/BI consumer
```

Rules:

- no ERP command waits on Pipeline delivery to become committed;
- no Pipeline output is a ledger/document permission authority;
- schema version, partitioning, retention and replay/backfill semantics are explicit;
- PII/sensitive fields are minimized before ingest;
- tenant key and deletion/export obligations are preserved;
- open-beta production dependency requires explicit risk approval.

### Trigger metrics

Collect from CF03/CF08/current event paths:

- events/second and events/day by tenant and event class;
- average/p95 event bytes;
- Queue/Analytics Engine/R2 write operations and cost;
- backlog/ingest delay/failure rate;
- transform complexity and downstream analytical format requirement;
- retention/backfill/replay volume;
- cross-tenant isolation and deletion implications.

Reopen when measured event volume or transformation/analytical-storage needs make the simpler current path operationally inadequate under an approved SLO/cost policy.

### Decision

**DEFER**. Pipelines remains conditional/experimental and no production proof is justified.

## Go/no-go scorecards

### Dynamic Workers

```text
Primitive: Dynamic Workers
Concrete Forge capability: conditional extension for B01/B02 rule/formula/action/preview capabilities
Current blocker without primitive: none proven
Alternative using existing Forge primitives: metadata + bounded formula/rule/action + static Worker/service binding
Measured workload: absent
Reliability gain: unproven
Security/isolation gain: potentially strong vs unsafe in-process eval, but Forge already avoids unsafe arbitrary eval
Latency/throughput gain: unproven
Cost impact: new creation/request/CPU dimensions; unmeasured
Operational burden: high (code lifecycle, sandbox, abuse, dependency policy)
Provider maturity/plan risk: current Workers Paid feature; provider capability available
Authority boundary: capability RPC only; no broad canonical DB binding
Decision: DEFER
Trigger to revisit: accepted capability blocked by bounded metadata primitives + representative workload + CF04/CF08 contracts
```

### Containers / Sandbox

```text
Primitive: Containers / Sandbox
Concrete Forge capability: heavy transform/code execution only when Worker semantics are insufficient
Current blocker without primitive: none proven
Alternative using existing Forge primitives: Worker + Queue/Workflow + R2 + browser/CLI preprocessing
Measured workload: absent
Reliability gain: unproven
Security/isolation gain: useful for untrusted/full-runtime code, but no approved consumer
Latency/throughput gain: unproven
Cost impact: unmeasured
Operational burden: container image/runtime/filesystem/lifecycle + cleanup
Provider maturity/plan risk: GA on Workers Paid; provider capability available
Authority boundary: result returns through canonical Forge command/import seam
Decision: DEFER
Trigger to revisit: repeatable Worker incompatibility/resource failure or required Linux/runtime dependency
```

### Hyperdrive

```text
Primitive: Hyperdrive
Concrete Forge capability: external Postgres/MySQL connector/import
Current blocker without primitive: no named SQL source
Alternative using existing Forge primitives: HTTP/API/file adapters; direct SQL proof only when source exists
Measured workload: absent
Reliability gain: unproven
Security/isolation gain: connection management benefit possible; secret/tenant contract still required
Latency/throughput gain: unproven
Cost impact: unmeasured
Operational burden: origin DB credentials, freshness/cache policy, connection/query observability
Provider maturity/plan risk: provider capability available for PostgreSQL/MySQL-compatible databases
Authority boundary: external source -> adapter -> canonical Forge command/import -> reconciliation
Decision: DEFER
Trigger to revisit: approved external SQL source + direct baseline proving connection/latency/load problem
```

### Pipelines

```text
Primitive: Pipelines
Concrete Forge capability: high-volume analytical event stream to R2
Current blocker without primitive: none measured
Alternative using existing Forge primitives: Queue/outbox + Analytics Engine + R2
Measured workload: absent
Reliability gain: exactly-once analytical sink is attractive but not required by current workload
Security/isolation gain: neutral unless schema/data-minimization contract is correct
Latency/throughput gain: unproven
Cost impact: beta pricing/operational model not suitable for commitment without CF08 review
Operational burden: schema/transform/partition/retention/replay management
Provider maturity/plan risk: open beta
Authority boundary: analytical sink only, never ERP transaction state
Decision: DEFER
Trigger to revisit: measured stream/transform/storage need exceeds approved simpler-path envelope
```

## Dependency Requests

### DR-CF07-01 -> CF04

```text
Dependency Request
ID: DR-CF07-01
Owner: CF04 edge security
Need: reusable untrusted-code perimeter contract covering default-deny egress, allowlist/intercept policy, service/capability binding identity and secret injection rules
Why: CF04 owns perimeter/security policy; CF07 must not invent a competing network/secret authority
Blocked scope: any future Dynamic Worker or Sandbox proof that can reach network/private capabilities
Can continue independently: yes
Next independent work: decision/trigger record is complete; no proof starts until a real workload exists
```

### DR-CF07-02 -> CF08

```text
Dependency Request
ID: DR-CF07-02
Owner: CF08 production governance/cost
Need: quota/cost/config inventory contract for Dynamic Worker creation/request/CPU, Sandbox/Container runtime resources, Hyperdrive config and Pipeline production-risk tracking
Why: CF08 owns resource/config/cost governance
Blocked scope: production adoption and economic proof gates
Can continue independently: yes
Next independent work: keep primitives deferred until a concrete workload triggers a proof
```

These dependency requests are prerequisites for future proof/adoption; they are not reasons to start speculative implementation now.

## Proof decision

No isolated proof code is added in this pass.

Reason:

1. CF07 explicitly requires real workload before proof;
2. no primitive has a measured current blocker;
3. Dynamic Workers/Sandbox proofs without CF04/CF08 contracts would create misleading security evidence;
4. Hyperdrive proof without a real source would benchmark a synthetic database unrelated to Forge demand;
5. Pipelines proof without real event volume would only prove provider tutorial wiring.

Tutorial/demo code would increase repository surface without improving a Forge capability or adoption decision.

## Acceptance-gate result

| Gate | Result |
|---|---|
| Canonical capability mapping | PASS for conditional consumers; no new capability taxonomy invented |
| Measured current limitation | **NO** for all four primitives; therefore no ADOPT/PROOF |
| Existing-primitive alternative | PASS |
| Threat model / tenant isolation contract | Defined for future Dynamic Workers/Sandbox/Hyperdrive/Pipelines |
| Binding/network/secret policy | Contract defined; CF04 dependency recorded |
| Cost model | Billable dimensions/metrics identified; CF08 dependency recorded; no fake numeric commitment |
| Failure/cancel/cleanup | Required semantics defined for future proof |
| Source-of-truth duplication | Explicitly prohibited |
| Proof tests | Not applicable because proof threshold not met |
| Production deployment | NONE; prohibited in this lane without explicit approval |

## Validation

This pass is documentation/decision-only.

Performed:

- exact current-main audit;
- exact CF07 branch/control documents audit;
- exact WS09/WS10/WS13 evidence audit;
- exact formula evaluator/builder audit;
- repository searches for Dynamic Worker loader, Hyperdrive and Pipelines wiring;
- official Cloudflare documentation re-check for all four primitive families.

Not performed/claimed:

- no runtime benchmark because there is no approved representative workload;
- no Cloudflare resource creation;
- no production config mutation;
- no D1/customer-data mutation;
- no build/test claim from documentation-only changes;
- no RC/Hardened capability promotion.

## Final lane result

CF07 is ready for review as a **decision-complete / implementation-deferred** lane.

Final decisions:

- Dynamic Workers: **DEFER**;
- Containers/Sandbox: **DEFER**;
- Hyperdrive: **DEFER**;
- Pipelines: **DEFER**;
- proof code: **NONE — correctly omitted because no workload crossed the proof gate**.

Future work starts from the trigger metrics in this record, not from provider feature availability.