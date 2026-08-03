# CF08 — Cloudflare Production Governance / Cost / Drift / Recovery

Status: READY
Branch: `cloudflare/cfmax-08-prod-governance`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authority: WS12 SRE
SaaS governance authority: WS11
Risk: CRITICAL

## Mission

Make Cloudflare infrastructure an auditable, reproducible and cost-governed production substrate for Forge: exact resource inventory, source/config authority, drift detection, capacity limits, recovery, rollout and per-tenant economics.

This lane governs infrastructure truth. It does not take over sibling implementation hotspots.

## Required reading

Common CFMAX docs plus:

- every `wrangler*.jsonc` and deploy/provision script;
- release workflows and release evidence conventions;
- `docs/ops/CLOUDFLARE_OPERATIONAL_ENVELOPE.md`;
- SRE runbook/alerts;
- D1 PITR/export/migrate scripts;
- Queue/DLQ configs;
- R2/KV/D1/dispatch/service bindings;
- control-plane entitlement/plan/quota store;
- environment/secret examples and Git ignore rules;
- current production evidence files, without treating stale evidence as live state.

## Owned scope

- Cloudflare resource inventory by environment;
- configuration source-of-truth map;
- config/resource drift detection proposal/tooling;
- compatibility-date/flags policy;
- resource naming and ownership conventions;
- limits/quota/capacity registry;
- cost attribution model by tenant/plan/capability;
- release dependency order;
- backup/PITR/export/restore safety;
- Queue/DLQ/Workflow recovery policy;
- R2 retention/lifecycle policy;
- AI spend/Analytics cost governance integration;
- emergency disable/rollback and feature-flag seams;
- exact production evidence format for CFMAX.

## Forbidden zone

Do not:

- perform production PITR;
- mutate DNS/routes/secrets/resources in production without explicit approval;
- rotate credentials;
- invent customer SLA/RTO/RPO from provider limits;
- move business logic into infrastructure scripts;
- duplicate worker-owned code just to centralize it;
- commit secrets, backup data, tokens or private production exports.

## Resource inventory

Create a machine-readable or clearly parseable inventory source covering at minimum:

```text
resource_type | logical_name | env | binding | owner worker | purpose | tenant/shared | source config | sensitive identifiers? | backup/recovery | cost dimension | production evidence
```

Resource families:

- Workers;
- Workers Assets;
- dispatch namespaces / Workers for Platforms;
- service bindings;
- D1 databases;
- Durable Object namespaces/classes/migrations;
- KV namespaces;
- R2 buckets;
- Queues + DLQs;
- cron triggers;
- Workflows when CF02 adds them;
- Analytics Engine datasets when CF03 adds them;
- AI Gateway/Workers AI bindings when CF05 converges them;
- Browser Run bindings when CF06 adds them;
- Dynamic Workers/Containers/Hyperdrive/Pipelines if CF07 recommends adoption;
- public/custom domains and route ownership, without exposing secret credentials.

## Config authority / drift

For each resource/config classify:

- source-controlled declarative;
- generated from source-controlled manifest;
- provisioned by script/API;
- dashboard-only/manual;
- secret runtime state;
- production evidence only.

Goal: every non-secret production configuration has one declared authority or an explicit reason it remains dashboard-managed.

Define drift checks that can compare desired versus observed state without mutating production.

## Compatibility-date policy

Audit Worker compatibility dates/flags across services.

Define:

- update cadence;
- testing matrix before bump;
- whether all Workers advance together or by service family;
- rollback procedure;
- source-lock trigger for behavior-changing Cloudflare releases.

Do not mass-bump dates merely to be current.

## Cost model

Build cost dimensions by primitive:

```text
primitive | billing unit | included allowance | variable unit | tenant attribution possible? | main cost driver | guardrail | telemetry source
```

Then model representative tenant classes:

- idle/small;
- typical SMB;
- busy/large;
- pathological/noisy tenant;
- AI-heavy tenant;
- import/report-heavy tenant.

The model must identify which limits are provider hard limits, Forge engineering defaults, and customer product quotas. Never mix them.

## Capacity/SLO evidence

Provider maximum is not acceptable application latency.

Define engineering gates for:

- Worker CPU/subrequests;
- D1 size/query/rows/statement count;
- DO queue wait;
- Queue backlog/age/retry/DLQ;
- Workflow failure/stuck duration once present;
- R2 bytes/objects/exports;
- AI spend/tokens/requests;
- Analytics data-point volume;
- Browser Run render duration/failure.

Customer-facing SLO/SLA remains unset until approved from measured evidence.

## Recovery model

### D1

- Time Travel/PITR is provider-local and destructive;
- retain verified portable exports as separate recovery evidence;
- restore flow requires fresh backup/export + explicit authorization + post-restore reconciliation.

### Queues/DLQ

Define quarantine/replay idempotency and age/retention monitoring. DLQ existence alone is not a recovery plan.

### Workflows

Consume CF02 state/retry/cancel semantics and define operator recovery/alert path.

### R2

Define retention/lifecycle, tenant deletion/export and generated-artifact cleanup.

### AI/Analytics

Define what is ephemeral/telemetry versus retained business evidence. Provider logs/telemetry are not canonical business backup.

## Release topology

Document resource dependency order such as:

```text
schema/migration validation
 -> shared/control resources
 -> tenant/runtime workers
 -> app workers
 -> gateway/assets
 -> smoke/release marker
```

Adjust from exact current release flow. CFMAX additions must state where bindings/resources are provisioned before code that depends on them.

## Implementation slices

### A — exact resource/config inventory

No production mutation.

### B — desired-state/drift validator

Read-only comparison preferred. If Cloudflare API access is unavailable in test environment, build schema/config validator and document remote evidence gap rather than guessing.

### C — cost/capacity model

Use current source-lock/provider docs and mark externally changing prices/limits with verified dates.

### D — recovery/convergence runbook

Unify existing D1/Queue/release evidence, do not duplicate runbooks unnecessarily.

### E — CFMAX production evidence contract

Define exact evidence required before each lane can claim production deployment.

## Acceptance gates

Before RC:

- canonical capability mapping;
- complete source resource inventory;
- each config has an authority classification;
- drift detection/validation exists or exact access gap documented;
- no secrets leaked;
- compatibility-date policy;
- cost model across representative tenants;
- hard-limit vs engineering-guard vs customer-quota separation;
- backup/PITR/DLQ/Workflow/R2 recovery matrix;
- release dependency graph;
- rollback/emergency disable strategy;
- no destructive production action performed.

Hardened requires remote production inventory evidence, drift-free checks, rehearsed recovery evidence and measured capacity/alert behavior.

## Dependencies

- CF01 for D1 session/read-replica rollout config;
- CF02 for Workflow resource/recovery semantics;
- CF03 for usage/cost telemetry;
- CF04 for security-config authority;
- CF05 for AI spend/resource policy;
- CF06 for Browser Run/R2 export resources;
- CF07 for any new optional primitives.

## Completion record

Owner: —
Started from: —
Head: —
Status: READY
Capabilities: —
Resource inventory: —
Drift checks: —
Cost model: —
Recovery evidence: —
Release topology: —
Production mutations: none unless explicitly authorized
Dependency requests: —
Gaps: —

## Startup prompt

Đọc handoff, Skill, CFMAX docs và exact Wrangler/deploy/SRE code. Xây resource/config authority inventory trước, rồi drift/cost/recovery/release model. Phân biệt rõ provider hard limit, Forge engineering guard và customer quota. Không invent SLA, không commit secret, không PITR/DNS/secret/resource mutation production. Blocker ghi Dependency Request rồi tiếp tục. Dừng trước merge/deploy non-UI khi policy yêu cầu user duyệt.
