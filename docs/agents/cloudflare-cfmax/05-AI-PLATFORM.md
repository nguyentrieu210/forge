# CF05 — AI Gateway / Workers AI / Vectorize / AI Search

Status: READY
Branch: `cloudflare/cfmax-05-ai-platform`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authority: WS08 BI/semantic/AI
Security/quota authority: WS11
Risk: STANDARD for non-authoritative assist; CRITICAL for tool/action or sensitive-data paths

## Mission

Create one permission-aware, tenant-aware and cost-aware AI control plane for Forge so vertical apps stop coupling directly to a single model/provider, while preserving deterministic business commands and server authorization.

## Required reading

Common CFMAX docs plus:

- all Workers AI bindings and `AI.run` call sites;
- Alumdoor OCR/AI flows;
- BI/query/semantic packages;
- permission services and trusted identity;
- app action/tool contracts;
- control-plane entitlements/plan quotas;
- audit/logging/privacy sources;
- DMS/search/knowledge capabilities in capability map.

Provider references:

- AI Gateway spend/rate-limit/limits/changelog sources in CFMAX source lock;
- Vectorize sources in CFMAX source lock.

## Target boundary

```text
User/domain request
 -> Forge authorization + semantic/tool context
 -> Forge AI policy service
 -> AI Gateway
      -> Workers AI or approved external provider
 -> structured result
 -> validation/approval
 -> canonical Forge command if an action is requested
```

Model output never becomes permission.

## Owned scope

- current AI call-site inventory;
- provider-neutral Forge AI service contract;
- AI Gateway metadata allocation;
- model/provider policy;
- spend/rate-limit policy seams;
- caching/fallback policy;
- prompt/log redaction and retention policy;
- usage/cost integration with CF03;
- Vectorize/AI Search decision and permission-aware retrieval contract;
- tool/action approval boundary;
- tests against tenant/context leakage.

## Forbidden zone

Do not:

- allow model-generated direct SQL/D1 mutations;
- give AI unrestricted app-worker/service bindings;
- treat AI Gateway logs as business audit;
- put secrets/raw confidential payloads into metadata/logs;
- use Vectorize as canonical object store;
- disclose a retrieved object without rechecking canonical permission;
- silently fallback to a model/provider that violates tenant policy;
- deploy paid/provider changes without approval.

## AI inventory

Build matrix:

```text
call site | app/capability | model/provider | input sensitivity | permission context | output type | authoritative effect? | current cost control | current logs | migration target
```

Must inspect OCR/image extraction, summaries, matching/recommendation, search/RAG, content generation and any agent/tool paths.

## AI Gateway metadata budget

Current provider source lock notes a limited custom metadata slot count. Define a fixed encoding policy before implementation.

Candidate semantic dimensions:

- tenant;
- user/actor class;
- app;
- purpose/capability;
- request/correlation class.

If five concepts do not fit cleanly, encode stable compound values deliberately; do not scatter arbitrary keys per app.

## Model policy

Define:

- permitted providers/models by plan/capability;
- data sensitivity/residency restrictions;
- max input/output/token budgets;
- fallback graph;
- timeout/retry;
- deterministic temperature/config where required;
- cost/spend/rate-limit response;
- unavailable-model behavior;
- evaluation/versioning policy.

Spend limits are eventually consistent during bursts, so Forge must not market them as mathematically exact hard billing ceilings without an additional authoritative quota mechanism.

## Cache policy

AI caching allowed only if keying proves no cross-tenant/user leakage and content is safe to reuse. Default sensitive/action/tool requests to non-cache unless evidence supports otherwise.

## Vectorize / AI Search contract

Adopt only when a concrete capability exists.

Derived-index flow:

```text
canonical object/file
 -> permission-safe extraction/chunking
 -> tenant-scoped index metadata
 -> embedding/vector
 -> retrieval candidate
 -> canonical object fetch
 -> server permission recheck
 -> disclose allowed fields only
```

Must define:

- tenant partition/isolation;
- source object/version;
- freshness/re-index;
- delete/tombstone;
- ACL change propagation;
- chunk provenance;
- embedding model/version;
- stale index behavior;
- backup/rebuild strategy.

## Tool/action boundary

For AI proposing business actions:

1. model receives only allowed semantic/tool schema;
2. model returns structured proposal;
3. server validates schema/permission/current state;
4. high-impact action requires normal Forge approval rules;
5. canonical command executes with idempotency/audit;
6. model cannot claim action succeeded until command receipt exists.

## Implementation slices

### A — AI inventory and sensitivity map

### B — provider-neutral AI policy service

Small shared seam, no vertical business logic.

### C — AI Gateway integration for one representative existing call

Prefer an existing Workers AI path so behavior can be compared.

### D — usage/spend/rate-limit instrumentation

Coordinate with CF03/CF08.

### E — semantic retrieval proof only if capability/evidence justifies it

Do not force Vectorize into Wave A if search use case is not ready.

### F — action/tool safety contract

Even if no action agent is implemented, lock the boundary now.

## Acceptance gates

Before RC for AI Gateway seam:

- capability mapping;
- complete AI call-site inventory;
- provider/model policy;
- metadata budget;
- tenant/user leakage negative tests;
- permission regression;
- spend/rate-limit behavior test;
- fallback policy test;
- log redaction test;
- latency/cost comparison with previous direct path;
- no authoritative action bypass.

Vectorize/AI Search RC additionally requires tenant isolation, delete/ACL freshness, permission recheck and rebuild tests.

## Dependencies

- CF03 usage telemetry;
- CF04 edge/security/privacy policy;
- CF08 cost/resource governance;
- WS11 authoritative tenant plan/quotas;
- WS08 semantic/query authority.

## Completion record

Owner: —
Started from: —
Head: —
Status: READY
Capabilities: —
AI call sites: —
Gateway policy: —
Vector decision: —
Tests/evals: —
Cost evidence: —
Dependency requests: —
Gaps: —

## Startup prompt

Đọc handoff, Skill, CFMAX docs và exact AI call sites. Lập inventory + sensitivity/permission/cost map trước khi viết AI Gateway. Tạo một provider-neutral policy seam, không cho model quyền mutate dữ liệu. Vectorize/AI Search chỉ làm khi có capability thực và phải recheck canonical permission sau retrieval. Blocker ghi Dependency Request rồi tiếp tục. Dừng trước production provider/config/deploy.
