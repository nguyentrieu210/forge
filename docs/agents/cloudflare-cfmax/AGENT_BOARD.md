# CFMAX Agent Board

Program: Forge Cloudflare Maximization
Control branch: `cloudflare/cfmax-00-control`
Source baseline: `main@fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`
Status: bootstrap

Exact GitHub branch/PR/diff state always wins this board if it becomes stale.

## Status vocabulary

- `READY`: seeded branch exists, unclaimed.
- `CLAIMED`: worker has recorded alias/start SHA.
- `ACTIVE`: audit/implementation in progress.
- `BLOCKED`: only blocked subsection; worker continues independent scope.
- `REVIEW`: PR-ready evidence/handoff exists.
- `DONE`: merged + verified + canonical evidence updated.
- `DEFERRED`: conditional primitive has explicit trigger, no implementation now.
- `REJECTED`: adoption decision says no measurable value or violates architecture.

## Workers

| ID | Branch | Primary authority | Forge owners consumed | Risk | Immediate mission | Depends on |
|---|---|---|---|---|---|---|
| CF01 | `cloudflare/cfmax-01-d1-consistency` | D1 Sessions/read-replica/cache consistency | WS00, WS14 | CRITICAL | prove end-to-end bookmark/session policy and production-read-replica readiness | control |
| CF02 | `cloudflare/cfmax-02-workflows` | Workflows + durable orchestration contract | WS09, WS11, WS13, WS12 | CRITICAL | replace ad-hoc long-process orchestration only where Workflow semantics are superior | CF01 for consistency rules; control |
| CF03 | `cloudflare/cfmax-03-usage-observability` | Analytics Engine + usage/cost telemetry | WS12, WS11 | STANDARD/CRITICAL | design per-tenant operational usage plane and billing reconciliation seam | control; CF08 cost taxonomy |
| CF04 | `cloudflare/cfmax-04-edge-security` | WAF/rate-limit/Turnstile/Access perimeter | WS11 | CRITICAL | harden public/admin/service perimeter without weakening Forge authorization | control |
| CF05 | `cloudflare/cfmax-05-ai-platform` | AI Gateway + Workers AI + Vectorize/AI Search policy | WS08, WS11 | STANDARD/CRITICAL | centralize AI provider/cost/security/retrieval semantics | CF03 usage dimensions; CF04 security policy |
| CF06 | `cloudflare/cfmax-06-render-export` | Browser Run/PDF/R2 export delivery | WS14, WS12 | STANDARD | server-render print/export without replacing Print Format authority | CF04 security rules; control |
| CF07 | `cloudflare/cfmax-07-runtime-expansion` | Dynamic Workers/Containers/Hyperdrive/Pipelines decision lane | WS00, WS09, WS10, WS13 | CRITICAL | prove go/no-go thresholds before adopting optional runtime primitives | CF04 sandbox/security; CF08 governance |
| CF08 | `cloudflare/cfmax-08-prod-governance` | resource inventory/cost/drift/release/recovery | WS12, WS11 | CRITICAL | establish production resource/config/cost/recovery control plane | control |

## Ownership and forbidden zones

### CF01

Owns proposals/implementation around D1 session creation, bookmark transport, read-path policy and consistency observability.

Forbidden without dependency request:
- changing document/ledger business invariants;
- changing auth model;
- rewriting frontend shared state unrelated to bookmark transport;
- changing domain query semantics merely to improve benchmark numbers.

### CF02

Owns generic Workflow adapter/contract and selected platform orchestration slices.

Forbidden:
- direct finance/stock/payroll writes;
- owning domain reversal semantics;
- replacing Queue event fan-out blindly;
- implementing tenant-auth changes.

### CF03

Owns telemetry schemas, Analytics Engine binding/use, usage aggregation and observability query contracts.

Forbidden:
- declaring Analytics Engine the audit ledger;
- creating customer invoices directly from sampled telemetry without reconciliation contract;
- logging secrets/raw sensitive payloads.

### CF04

Owns perimeter/security rules and compatibility architecture.

Forbidden:
- replacing Forge server permission;
- silently changing tenant business auth semantics;
- production DNS/security-rule rollout without authorization;
- broad challenge rules that break APIs/mobile clients without evidence.

### CF05

Owns AI provider abstraction, AI Gateway policy and derived semantic retrieval architecture.

Forbidden:
- direct business mutation by model output;
- bypassing permission/approval;
- embedding secrets or unrestricted private data;
- treating Vectorize as canonical data.

### CF06

Owns rendering/export execution plane.

Forbidden:
- redesigning domain print formats;
- changing business document authority;
- arbitrary-url Browser Run surface without SSRF controls;
- exposing R2 objects outside permission-aware facade.

### CF07

Owns optional-runtime evaluation and isolated proofs only.

Forbidden:
- moving normal CRUD/API to Containers;
- granting broad dynamic-code bindings;
- making Hyperdrive/external SQL a canonical tenant store;
- routing authoritative transaction state through Pipelines.

### CF08

Owns resource inventory, config/drift/cost/recovery/release policy and supporting tooling.

Forbidden:
- destructive PITR;
- production secret/DNS mutation;
- taking ownership of other workers' implementation hotspots;
- inventing customer SLA without measured/approved policy.

## Dependency requests

Use exactly:

```text
Dependency Request
ID: DR-CFxx-NN
Owner: <target worker/workstream>
Need: <specific contract/evidence/change>
Why: <why target owns it>
Blocked scope: <exact subsection>
Can continue independently: yes/no
Next independent work: <what continues now>
```

No worker may copy another worker's logic locally to avoid a dependency if that creates a duplicate authority.

## Common evidence ledger

Each branch-local handoff must track:

- exact base/head;
- canonical Forge capability IDs;
- current maturity;
- source evidence;
- code/config evidence;
- tests;
- migration impact;
- permission/tenant isolation evidence;
- failure/retry/replay evidence;
- performance/cost evidence;
- production evidence, if any;
- dependency requests;
- adoption decision: REQUIRED/RECOMMENDED/CONDITIONAL/EXPERIMENTAL/REJECTED;
- remaining gaps.

## Parallel start rule

All eight workers may start **audit immediately**.

Implementation constraints:

- CF01/CF04/CF08 can implement independent seams first.
- CF02 may implement generic Workflow foundation after exact audit; consumers must not duplicate domain command logic.
- CF03 telemetry schema should coordinate dimension taxonomy with CF08.
- CF05 consumes CF03 usage/cost dimensions and CF04 security policy.
- CF06 can proceed if it preserves existing print authority and security facade.
- CF07 should stay decision/proof oriented until security/governance contracts exist.

## Convergence order

Default:

```text
CONTROL
  -> CF01
  -> CF04 + CF08
  -> CF02
  -> CF03
  -> CF05
  -> CF06
  -> CF07 only for approved/justified primitives
  -> CONTROL convergence audit
```

Independent PRs can review earlier, but shared authority merges in dependency order.

## Coordinator checklist

Before any worker is considered correctly bootstrapped:

1. branch starts from exact control baseline;
2. only branch-local handoff bootstrap differs from control;
3. no implementation from sibling worker leaked in;
4. startup prompt exists;
5. owned/forbidden zones are explicit;
6. risk and merge boundary are explicit;
7. worker can proceed without asking user ordinary technical questions.
