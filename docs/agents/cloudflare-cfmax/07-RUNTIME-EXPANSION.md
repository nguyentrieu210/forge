# CF07 — Dynamic Workers / Containers-Sandbox / Hyperdrive / Pipelines

Status: READY
Branch: `cloudflare/cfmax-07-runtime-expansion`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authorities: WS00 architecture, WS09 App Factory, WS10 integrations, WS13 migration depending on primitive
Risk: CRITICAL

## Mission

Evaluate and, only when justified, prove Cloudflare runtime/data expansion primitives that can extend Forge beyond ordinary Workers without corrupting the current authoritative architecture.

This worker is **decision-first**. A correct result may be DEFERRED or REJECTED.

## Required reading

Common CFMAX docs plus:

- Workers for Platforms/dispatch code and provisioning scripts;
- app-registry/app-worker extension contracts;
- builder/App Factory action/rule/formula contracts;
- migration/import tooling;
- integration hub/connector code;
- BI/query/export workloads;
- security/IAM/service-binding rules;
- current Worker CPU/subrequest/size constraints and operational envelope.

Provider references from source lock:

- Dynamic Workers;
- Dynamic Workflows;
- Hyperdrive;
- Pipelines;
- Cloudflare runtime/container/sandbox docs discovered during exact audit.

## Primitive A — Dynamic Workers

### Candidate outcomes

- tenant-defined script/formula that metadata cannot safely express;
- AI-generated code execution/tool mode;
- custom automation/plugin execution;
- preview/prototype execution;
- user-installed extension code.

### Mandatory sandbox contract before any execution

Define:

- code provenance/hash/version;
- tenant ownership;
- module/import policy;
- binding allowlist;
- secret policy;
- D1/KV/R2 capability tokens or facades instead of broad raw bindings where possible;
- network allow/deny/intercept policy;
- CPU/subrequest/runtime limits;
- execution timeout;
- logs/telemetry;
- output schema and size;
- cancellation;
- code retention/deletion;
- abuse/quota policy;
- dependency/package strategy;
- vulnerability/update strategy.

Dynamic code must not receive a broad authoritative DB binding merely because that is convenient.

## Primitive B — Containers / Sandbox

### Candidate outcomes

Only for workloads Workers are poorly suited to:

- Python processing;
- DuckDB/large analytical transforms;
- large spreadsheet/document conversion;
- specialized binaries/tools;
- isolated code interpreter;
- long/heavy compute with local filesystem semantics.

### Rejection default

Ordinary ERP CRUD/API/controller/permission/ledger work stays on Workers.

Before adoption prove:

- actual workload cannot meet Workers constraints economically/reliably;
- startup/cold behavior is acceptable;
- data transfer into/out of container is bounded;
- secrets/network/filesystem are isolated;
- authoritative result is committed through normal Forge command/import boundary;
- cancellation/cleanup exists;
- cost model beats simpler alternatives.

## Primitive C — Hyperdrive

### Candidate outcomes

External/legacy SQL adapters for concrete Postgres/MySQL-compatible sources.

Mandatory contract:

```text
external source
 -> Hyperdrive
 -> read/import/connector adapter
 -> mapping/validation
 -> Forge canonical command/import
 -> reconciliation
```

Never assume external rows become Forge tenant authority merely because queries are fast.

For write-back integrations define explicit source-of-truth and conflict semantics.

Hyperdrive query caching may accelerate eligible reads, but cached external data cannot decide authoritative Forge write invariants unless freshness contract explicitly permits it.

## Primitive D — Pipelines

### Candidate outcomes

- high-volume telemetry/event stream;
- clickstream/product analytics;
- IoT/operational events;
- CDC-like analytical feed;
- durable transformation to R2 Iceberg/Parquet/JSON.

### Restrictions

- Pipelines is an analytical/event sink, not ERP command transaction path;
- open-beta provider status requires risk review;
- exactly-once delivery into analytical storage does not make the source canonical business state;
- schema evolution/partitioning/retention/replay must be explicit.

## Go/no-go scorecard

For each primitive produce:

```text
Primitive:
Concrete Forge capability:
Current blocker without primitive:
Alternative using existing Forge primitives:
Measured workload:
Reliability gain:
Security/isolation gain:
Latency/throughput gain:
Cost impact:
Operational burden:
Provider maturity/plan risk:
Authority boundary:
Decision: ADOPT / PROOF / DEFER / REJECT
Trigger to revisit:
```

## Threshold discipline

Do not invent fake thresholds before measurement. Where no real workload exists, define the metric to collect and defer adoption.

Examples of valid trigger categories:

- Worker CPU/wall/subrequest/resource failures under representative workload;
- migration dataset size/time beyond accepted SLO;
- repeated need for unsupported runtime/library;
- tenant-script demand that cannot be expressed by metadata/rules;
- external SQL integration demand with measurable connection latency/load;
- event volume making direct Analytics Engine/R2 writes operationally inefficient.

## Implementation slices

### A — current constraint/workload audit

Find real pain, not imagined future architecture.

### B — decision matrix

All four primitive families receive a decision with evidence.

### C — isolated proof

At most one or two primitives with strongest evidence should get proof code in first pass. Proof must have no production binding and no canonical data mutation.

### D — security/cost benchmark

Measure sandbox startup/runtime, binding restrictions and workload cost where proof exists.

### E — integration contract

If adoption recommended, specify how result returns through Forge authoritative seams.

## Acceptance gates

For any ADOPT recommendation:

- canonical capability mapping;
- measured current limitation;
- existing-primitive alternative comparison;
- threat model;
- tenant isolation;
- binding/network/secret policy;
- cost model;
- failure/cancel/cleanup;
- no source-of-truth duplication;
- proof tests if feasible;
- production deployment remains separate and approval-gated.

A DEFER/REJECT decision is complete when trigger/revisit conditions are explicit.

## Dependencies

- CF04 for sandbox/perimeter/security policy;
- CF08 for resource/config/cost governance;
- CF02 for Dynamic Workflows;
- CF03 for telemetry/event-volume evidence;
- WS09 for App Factory extension authority;
- WS10/WS13 for connector/migration consumers.

## Completion record

Owner: —
Started from: —
Head: —
Status: READY
Capabilities: —
Dynamic Workers decision: —
Containers/Sandbox decision: —
Hyperdrive decision: —
Pipelines decision: —
Proofs: —
Benchmarks: —
Dependency requests: —
Gaps/triggers: —

## Startup prompt

Đọc handoff, Skill, CFMAX source-lock và exact repo. Đây là decision-first lane: tìm workload thật trước, rồi so với primitive hiện có. Không adopt Cloudflare service chỉ vì nó mới hoặc mạnh. Dynamic code phải có sandbox/binding/network/secret/quota contract; external DB/Pipelines không được thành source of truth cạnh tranh. Proof code phải isolated và không mutate production/canonical data. Blocker ghi Dependency Request rồi tiếp tục. Dừng trước merge/deploy non-UI theo policy.
