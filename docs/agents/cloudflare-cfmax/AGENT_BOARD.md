# CFMAX Agent Board

Program: Forge Cloudflare Maximization
Original control branch: `cloudflare/cfmax-00-control`
Original bootstrap baseline: `main@fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`
R2 takeover baseline: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
R2 convergence branch: `cloudflare/cfmax-09-convergence-r2`
Draft convergence PR: `#570` -> `main`
Status: **CONVERGENCE REVIEW READY — provider/production evidence pending**

Exact GitHub branch/PR/diff/CI state always wins this board if it becomes stale.

## Status vocabulary

- `READY`: seeded branch exists, unclaimed.
- `CLAIMED`: worker has recorded alias/start SHA.
- `ACTIVE`: audit/implementation in progress.
- `BLOCKED`: only blocked subsection; worker continues independent scope.
- `REVIEW`: source/audit work reached its allowed non-production review boundary with evidence.
- `DONE`: merged to canonical target + verified + canonical evidence updated. **No CFMAX lane is called DONE merely because a worker said it finished.**
- `DEFERRED`: conditional primitive has an explicit revisit trigger and no implementation is justified now.
- `REJECTED`: adoption decision says no measurable value or violates architecture.

## Coordinator takeover record

The original worker sessions stopped at mixed GitHub states. The coordinator re-audited exact branches instead of trusting chat-level completion claims.

Findings:

- CF02 original branch was still `READY` with no implementation/test head;
- CF01 and CF04 contained useful work but were stale against current main and could not safely converge as-is;
- CF03/05/06/08 had reusable implementation with different verification/provider gaps;
- CF07 correctly completed as a decision lane whose result was DEFER.

Takeover actions:

1. create `cloudflare/cfmax-09-convergence-r2` from exact then-current main;
2. create fresh R2 branches for CF01, CF02 and CF04;
3. finish CF02 implementation from zero on R2;
4. replay CF01/CF04 onto current source instead of overwriting newer code;
5. synchronize reusable lanes to current main before internal convergence;
6. reconcile CF08 source-governance blob pins after Cloudflare config convergence;
7. run one integrated exact-head gate on the common candidate.

No worker was merged to `main` and no production Cloudflare resource was mutated during takeover.

## Current worker state

| ID | Authoritative execution branch for convergence | Status | Result / maturity truth | Primary evidence |
|---|---|---|---|---|
| CF01 | `cloudflare/cfmax-01-d1-consistency-r2` | **REVIEW** | D1 Sessions/bookmark source is **Wired**; remote replica/latency proof pending | PR `#567`; run `30853819015` PASS; integrated real-workerd 9/9 |
| CF02 | `cloudflare/cfmax-02-workflows-r2` | **REVIEW** | durable route-index Workflow is **Wired**; remote Workflow/recovery proof pending | PR `#555`; run `30852724589` PASS |
| CF03 | `cloudflare/cfmax-03-usage-observability` | **REVIEW** | `O01-003` Wired; `T01-008` Foundation; Analytics Engine remains dormant | PR `#536`; integrated telemetry build/tests PASS |
| CF04 | `cloudflare/cfmax-04-edge-security-r2` | **REVIEW** | perimeter source contract **Wired**; provider activation pending | PR `#566`; run `30853280402` PASS |
| CF05 | `cloudflare/cfmax-05-ai-platform-r2` | **REVIEW** | AI policy/Gateway seam source complete; provider/cost dependencies remain | PR `#531`; run `30849757932` PASS |
| CF06 | `cloudflare/cfmax-06-render-export` | **REVIEW** | Browser Run render/export source **Wired**; remote proof pending | PR `#534`; run `30849817637` PASS |
| CF07 | `cloudflare/cfmax-07-runtime-expansion` | **DEFERRED** | Dynamic Workers, Containers/Sandbox, Hyperdrive and Pipelines all deferred by evidence | PR `#528`; decision record complete |
| CF08 | `cloudflare/cfmax-08-prod-governance` | **REVIEW** | source governance complete; remote desired-vs-observed state unverified | PR `#539`; integrated governance validator PASS |

The original `cloudflare/cfmax-01-d1-consistency`, `cloudflare/cfmax-02-workflows`, `cloudflare/cfmax-04-edge-security` and `cloudflare/cfmax-05-ai-platform` branches are **superseded for convergence** by the R2 branches listed above.

No worker remains `READY` or `ACTIVE` for source work after coordinator takeover.

## Integrated convergence gate

Source-equivalent convergence head before the final evidence/board documentation commits:

`1d7a4adb8eafd3d2f49b39ce87314f871d267395`

GitHub Actions run `30854610958`: **SUCCESS**.

Passed in one candidate:

- locked monorepo install;
- focused CF01 TypeScript;
- focused CF02 Workflow build;
- focused CF03 telemetry build;
- focused CF05 AI build;
- CF06 charts/visual/views build chain;
- Query Worker real-workerd D1 suite: 9/9;
- combined CFMAX Node regressions: 28/28;
- CF08 source/blob/config governance validator;
- canonical Gateway runtime + warehouse PWA build/stage/check;
- Gateway Wrangler dry-run bundle;
- Tenant Worker Wrangler dry-run bundle;
- Query Wrangler binding/type parse;
- Workflow Worker Wrangler dry-run bundle.

Detailed convergence evidence: `docs/agents/cloudflare-cfmax/CFMAX_R2_CONVERGENCE_20260804.md`.

## Baseline debt evidence

An earlier convergence attempt intentionally tried the repository-wide server TypeScript build. It failed in existing Manufacturing, CRM, App Factory, QMS and Frappe-model files.

`main -> CFMAX R2` diff was checked and those failure files are outside CFMAX changes.

The integrated gate therefore uses blast-radius compilation plus Worker bundle/dry-run validation. The baseline-wide build failure is recorded as debt, not hidden and not falsely reported as PASS.

## Ownership / authority invariants retained

### CF01

Owns D1 session creation, bookmark transport, replica-safe report policy and consistency observability.

Must not change business ledger/document invariants, weaken OCC/idempotency, or use replica state as authoritative validation.

### CF02

Owns generic durable Workflow orchestration and selected platform long-process slices.

Queue remains independent fan-out/delivery. Workflow never becomes database authority and does not own domain reversal semantics.

### CF03

Owns operational usage telemetry and Analytics Engine schema/query contracts.

Analytics Engine is not immutable audit or authoritative billing. Deterministic reconciliation belongs to WS11 before quota/invoice enforcement.

### CF04

Owns perimeter/security compatibility policy.

Cloudflare perimeter does not replace Forge authentication or server-side authorization. Provider apply/drift/rollback remains CF08 authority.

### CF05

Owns hosted AI provider/model/cost/privacy policy seams.

AI output remains advisory; model output does not directly mutate D1 or bypass permission/approval.

### CF06

Owns server render/export execution.

Print Format/document authority remains canonical Forge metadata/business logic. Browser Run receives only already-authorized render input.

### CF07

Owns optional-runtime evaluation only until proof gates are crossed.

Do not adopt optional primitives merely to collect bindings.

### CF08

Owns resource inventory, source/config drift, compatibility, cost/recovery/release governance.

Remote state must remain `unverified` until a real read-only provider inventory is performed.

## Remaining provider / production gates

These are not autonomous source-work blockers and must not be fabricated:

- D1 actual read-replica enablement, observed region/primary evidence and APAC benchmark;
- deployed non-production Workflow instance with retry/restart/terminate recovery proof;
- Analytics Engine dataset/binding and tenant-separated live query evidence;
- WAF/rate-limit/Turnstile/Access provider proof and measured false-positive behavior where adopted;
- AI Gateway provider resource/config/spend-policy activation;
- live Browser Run provider execution evidence where still absent;
- remote desired-vs-observed Cloudflare resource inventory;
- production rollback/PITR/recovery exercise;
- canonical RC/Hardened maturity promotion after merge/provider evidence.

## Merge / deploy boundary

`#570` is the only current CFMAX convergence candidate for `main`.

It remains **draft**.

Do not merge to `main`, deploy, enable D1 replicas, create Workflow/Analytics/AI Gateway resources, mutate WAF/Access/Turnstile/DNS/secrets, run PITR, or touch customer data without explicit user approval and the required provider evidence.
