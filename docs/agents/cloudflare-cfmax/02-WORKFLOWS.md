# CF02 — Cloudflare Workflows / Durable Orchestration

Status: READY
Branch: `cloudflare/cfmax-02-workflows`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authority: WS09 orchestration/BPM contract
Consumers: WS11 tenant lifecycle, WS13 migration/import, WS12 recovery/observability
Risk: CRITICAL

## Mission

Introduce a single durable orchestration contract for long-running/multi-step platform processes where Cloudflare Workflows materially improves reliability over cron/script/queue choreography, while keeping D1/document kernel/domain commands authoritative.

## Required reading

Read common CFMAX sources plus:

- current jobs/query/control-plane workers;
- provisioning/deploy/migration/import/export scripts;
- outbox/queue packages and tests;
- app-registry installer/upgrade/revision paths;
- migration journal;
- BPM/App Factory workflow metadata contracts;
- SRE recovery docs.

Provider references:

- `https://developers.cloudflare.com/workflows/`
- `https://developers.cloudflare.com/dynamic-workers/usage/dynamic-workflows/`

## Core boundary

```text
Queue     = independent event delivery / fan-out
Workflow  = durable step orchestration / waits / retries
DO        = coordination / serialization
D1        = authoritative Forge state
```

A workflow may invoke an authoritative Forge command. It does not directly invent a second mutation model.

## Owned scope

- exact inventory of long processes and current failure/retry semantics;
- generic Workflow adapter/instance identity contract;
- tenant/actor/idempotency context carried into workflow instances;
- one representative system workflow vertical slice;
- status/progress/cancel/retry/recovery contract;
- versioning of workflow input/step state;
- Workflow/Queue boundary;
- future Dynamic Workflow contract for tenant-defined BPM, decision-only unless sandbox policy is ready.

## Forbidden zone

Do not:

- direct-write finance/stock/payroll tables from workflow steps;
- duplicate outbox event semantics;
- replace every Queue consumer with Workflows;
- own domain-specific reversal/compensation semantics;
- deploy/enable production workflow resources without approval;
- let in-flight workflow code upgrade silently without version strategy.

## Audit inventory

Classify candidates:

```text
process | current runner | steps | max duration | retry | state store | idempotency | human wait | external wait | failure recovery | Workflow fit
```

Mandatory candidates to inspect:

- tenant provision;
- tenant app install/upgrade;
- remote D1 migration;
- import wizard / large imports;
- report/export generation;
- backup/recovery rehearsal;
- jobs-worker cron maintenance;
- query prepared reports;
- any domain repost/rebuild operation that already exposes canonical commands.

## Workflow contract

Define before implementation:

- `workflow_type` and schema version;
- `instance_id`;
- `tenant_id`;
- `actor_id` or system actor rationale;
- originating request/command id;
- idempotency key;
- input schema;
- step output schema;
- retry class: transient / deterministic / manual intervention;
- wait/event token semantics;
- cancellation semantics;
- compensation versus authoritative reversal semantics;
- progress/status projection;
- audit link to Forge entity/job/import/migration record;
- data retention and deletion behavior;
- in-flight version compatibility.

## Representative first slice selection

Choose using evidence, not preference. Score candidates on:

1. existing multi-step complexity;
2. failure/retry pain;
3. ability to keep domain writes behind canonical commands;
4. testability without production mutation;
5. reuse across multiple flows.

Tenant provisioning or import/migration are likely candidates, but the worker must prove the best choice from current code.

## Implementation slices

### A — process topology audit

Map cron/scripts/queues and identify duplicate orchestration logic.

### B — generic Workflow seam

Small platform package/helper owned by WS09 authority. It must not know finance/stock domain logic.

### C — representative vertical slice

End-to-end:

```text
start -> persisted step -> Forge command/service -> wait/retry -> next step -> result projection
```

### D — failure injection

At minimum test failure:

- before command;
- after authoritative command succeeds but before step acknowledgement;
- transient external failure;
- deterministic invalid input;
- cancellation while waiting;
- replay of start request.

### E — status/recovery

Define how operator and tenant-facing UI/API inspect state without exposing internal secrets.

### F — Dynamic Workflows decision record

Determine what additional sandbox/binding/version contracts are required before allowing tenant-defined automation code.

## Acceptance gates

Before RC:

- canonical capability mapping;
- one generic Workflow authority;
- exact Queue-vs-Workflow decision table;
- representative end-to-end test;
- duplicate/replay idempotency test;
- resume after injected failure;
- tenant isolation;
- permission/system actor policy;
- cancellation/recovery test;
- versioned input/state contract;
- cost/step-count estimate;
- no direct ledger/document bypass;
- no production deployment claim without evidence.

Hardened requires production workflow evidence, operator recovery runbook, alerting/usage telemetry and proven in-flight upgrade strategy.

## Dependencies

Likely:

- CF01 for D1 consistency in step-side reads;
- CF03 for workflow telemetry;
- CF04 for public callback/event security if used;
- CF08 for resource/config/recovery policy;
- WS11/WS13 for consumer-specific authoritative commands.

## Completion record

Owner: —
Started from: —
Head: —
Status: READY
Capabilities: —
Representative workflow selected: —
Changed zones: —
Tests: —
Dependency requests: —
Remaining gaps: —

## Startup prompt

Đọc handoff, Skill, CFMAX program/source-lock và exact repo. Audit toàn bộ long-process topology trước khi chọn slice. Thiết kế một Workflow authority dùng chung, không biến Workflow thành database/ledger và không thay Queue nếu chỉ cần fan-out. Tự quyết định kỹ thuật theo evidence; blocker cục bộ ghi Dependency Request rồi tiếp tục. Verify failure/replay/cancel/tenant isolation theo CRITICAL. Dừng trước merge/deploy production.
