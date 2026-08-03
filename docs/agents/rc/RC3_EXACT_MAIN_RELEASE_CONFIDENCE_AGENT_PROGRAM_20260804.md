# RC3 — Exact-main Release Confidence Agent Program

Date: 2026-08-04  
Program branch: `program/rc3-exact-main-release-confidence-20260804`  
Exact seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Execution topology: **PROGRAM**  
Risk: mixed — documentation/evidence is STANDARD; any backend/schema/security/provider/production mutation is CRITICAL.  
Primary objective: turn the current implementation-heavy Forge mainline into an evidence-grounded release-confidence baseline without inventing maturity.

## 1. Why this program exists

WS09 Batch Productization has converged into exact current `main` through PR `#553`. Multiple earlier workstreams (Finance/VN, HCM/payroll, IAM/SaaS, SRE, migration/onboarding, transaction closure, CFMAX source convergence and UI/runtime slices) have also materially advanced the repository since the original RC-01 capability baseline.

The canonical capability status still represents an older evidence snapshot. Therefore the next correct step is not another broad horizontal feature wave. It is to re-audit all 956 capabilities against exact current `main`, reconcile stale status/backlog claims, identify the remaining evidence gaps, and produce the smallest defensible set of release-hardening tasks.

This program MUST distinguish:

- merged source from executable evidence;
- executable evidence from provider/live evidence;
- provider/live evidence from production evidence;
- `Wired` from `RC`;
- `RC` from `Hardened`.

No capability may be promoted merely because a branch was merged, a test file exists, or a document says it is complete.

## 2. Mandatory sources

Every agent starts by reading, in this order:

1. exact GitHub `main`, relevant branch/PR/diff state;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `CURRENT_STATUS.md`;
4. `NEXT_TASKS.md`;
5. `PROJECT_CONTEXT.md`;
6. `AI_HANDOFF.md` if present/relevant;
7. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
8. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
9. `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
10. relevant workstream/RC/transaction-closure/CFMAX evidence documents;
11. exact source, migrations, tests and release evidence for the assigned capability families.

If prose conflicts with exact source/migration/test/GitHub state, exact repository evidence wins.

## 3. Program invariants

### Capability denominator

- Denominator is exactly **956 unique capability IDs** from `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`.
- No missing ID, duplicate ID, unknown ID or denominator drift.
- Status vocabulary is exactly: `Missing`, `Foundation`, `Wired`, `RC`, `Hardened`.

### Evidence dimensions

Every capability assessment must consider, where applicable:

- source/runtime path;
- migration/schema state;
- permission/tenant isolation;
- focused executable tests;
- correction/cancel/reversal/retry/idempotency;
- reconciliation;
- UI/browser/mobile evidence;
- provider/non-production evidence;
- production exact-release evidence.

`none`, `not run`, `unproven`, `not applicable` and `deferred` must remain explicit. Never convert absence into PASS.

### Architectural authority

- Do not create a second GL, Payment Ledger, Stock Ledger, payroll ledger, auth authority, permission dialect, audit ledger, app registry or deployment control plane.
- Reuse current canonical authorities.
- Domain agents do not patch shared hotspots owned by another stream merely to close a scorecard.
- If a shared dependency is needed, write a `Dependency Request` and continue independent work.

### Production boundary

- No production deploy, migration, DNS, secret, WAF, Access, Turnstile, D1 replication, PITR, restore, rollback, customer-data mutation or provider resource change solely to improve the maturity score.
- Provider/live proof may only be executed in an already-approved non-production environment or under an explicit user authorization matching the operation.
- This program is non-UI governance/evidence work; it does **not** auto-merge into `main`.

## 4. No-stop rule

Agents do not stop for ordinary technical choices. Audit and choose the safest architecture-preserving option from repo evidence.

Stop and request input only when:

1. a business policy cannot be inferred from repository/spec evidence;
2. a shared contract owned by another workstream must change and cannot be isolated;
3. a destructive or production operation is required;
4. merge/deploy approval is required for non-UI work.

If one item is blocked, record the dependency and continue all independent items.

## 5. Agent topology

### RC3-A0 — Coordinator / Capability Truth Convergence

Branch: `agent/rc3-00-capability-convergence`  
Risk: STANDARD governance; CRITICAL if it attempts any runtime/schema mutation.  
Owns: denominator, evidence schema, maturity reconciliation, final status/backlog, blocker ranking, convergence.

Mission:

- freeze exact program seed and record subsequent main drift;
- audit `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` structure and validator;
- maintain the 956-ID registry contract;
- ingest findings from A1-A5;
- reject promotions without sufficient evidence;
- produce final maturity counts and delta from historical RC-01 baseline;
- update `CURRENT_STATUS.md` and `NEXT_TASKS.md` only after exact findings are reconciled;
- generate top blockers/tasks by capability ID + owner + evidence gap + risk.

Forbidden:

- domain implementation;
- provider/production mutation;
- blanket family promotions;
- changing another agent's source-of-truth assessment without evidence review.

Required outputs:

- `docs/agents/rc/RC3_CONVERGENCE_20260804.md`;
- updated `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
- validator output proving 956/956 exactly once;
- current maturity report and historical delta;
- top-30 release blockers;
- reconciled `CURRENT_STATUS.md` / `NEXT_TASKS.md` candidate changes.

### RC3-A1 — ERP Authority & Vietnam Compliance Evidence

Branch: `agent/rc3-01-erp-vn-evidence`  
Risk: CRITICAL audit boundary.  
Owns capability families: Finance/VN, Procurement, Inventory/WMS, Manufacturing/QMS, HCM/payroll and directly coupled ERP transaction authority.

Primary capability families:

- `F01..F07`, `V01..V04`;
- `P01..P02`;
- `W01..W02`;
- `M01..M04` and QMS families;
- HCM/payroll capability families.

Mission:

- re-audit exact current main after Finance/VN convergence, Transaction Closure, WS06 and WS09 Stock/BOM batch work;
- verify migration numbers and canonical migrations on current main rather than stale branch documents;
- identify which capabilities now have executable invariant evidence vs only source/tests present;
- verify correction/reversal/reconciliation boundaries for money, stock, payroll, BOM and period controls;
- classify statutory automation conservatively using official-source/version/effective-date requirements;
- explicitly supersede stale branch claims such as historical accounting r8 where current main already contains canonical work.

Expected focus:

- period locking/posting/cancel/scope move;
- AR/AP allocation/advances/reconciliation;
- cash/bank paths;
- finance budget and legal-rule/tax/e-invoice evidence;
- stock reconciliation/valuation/repost;
- BOM whole-table transaction and revision invariants;
- payroll statutory evaluator and accounting integration;
- procurement match/landed-cost authority gaps.

Output:

- `docs/agents/rc/RC3_A1_ERP_VN_EVIDENCE.md` with capability-ID-level promotion/demotion candidates and exact evidence.

Do not modify ERP runtime merely to make a capability score better. Any real implementation gap becomes a follow-up task with owner/risk.

### RC3-A2 — Platform, IAM, App Factory, Integration & Migration Evidence

Branch: `agent/rc3-02-platform-evidence`  
Risk: CRITICAL audit boundary.  
Owns: architecture/kernel capability families, IAM/security/SaaS, App Factory/BPM, Integration Hub, migration/onboarding/tooling.

Mission:

- audit current main for server-authoritative tenant/session/permission boundaries;
- re-evaluate MFA/session revocation/auth-time/native step-up/SSO foundations from WS11;
- verify SaaS lifecycle/entitlement/quota mechanism vs missing commercial policy;
- re-evaluate WS09 after Batch Productization: AppAction input tables, BatchAction/BatchTransaction, durable replay/idempotency, Stock/BOM consumers;
- audit app registry/compiler/builder/install/upgrade/rollback evidence;
- audit Integration Hub retry/DLQ/secret/provider seams on current main;
- audit migration journal/import/mapping/dry-run/retry/reconciliation/cutover evidence after WS13.

Special rule:

Do not mark MFA/SSO/support impersonation/privacy/quota `RC` merely because a seam or data model exists. Operational enforcement, provider lifecycle, attributable identity and policy evidence remain separate requirements.

Output:

- `docs/agents/rc/RC3_A2_PLATFORM_IAM_APPFACTORY_EVIDENCE.md`.

### RC3-A3 — SRE, Cloudflare & Production Evidence

Branch: `agent/rc3-03-sre-cloudflare-evidence`  
Risk: CRITICAL.  
Owns: release/recovery/observability/cost evidence and CFMAX provider-closure classification.

Mission:

- audit WS12 release, backup, restore, PITR, rollback, queue safety, observability and exact-release marker tooling on exact current main;
- distinguish tooling existence from executed proof;
- re-audit CFMAX source convergence after PR `#570`;
- classify each provider gap as `source done`, `non-production proof required`, `business decision required`, or `production authorization required`;
- prepare safe evidence plans for:
  - D1 replication/APAC/bookmark behavior;
  - Workflow retry/resume/terminate/idempotency/recovery;
  - Analytics Engine usage telemetry if adopted;
  - WAF/rate-limit/Turnstile/Access;
  - AI Gateway provider policy/privacy/spend;
  - Browser Run HTML→PDF;
  - desired-vs-observed Cloudflare inventory;
  - rollback/restore/PITR RTO/RPO evidence.

Forbidden without explicit authorization:

- enabling D1 read replication;
- deploying provider resources;
- modifying WAF/DNS/Access/Turnstile/secrets;
- running restore/PITR/rollback against production;
- generating fake provider PASS evidence.

Output:

- `docs/agents/rc/RC3_A3_SRE_CLOUDFLARE_EVIDENCE.md`;
- a provider-evidence queue with exact prerequisite, environment, command/probe, expected evidence and safety boundary.

### RC3-A4 — Frontend, Mobile, UX & Vertical Release Evidence

Branch: `agent/rc3-04-ui-mobile-release-evidence`  
Risk: STANDARD audit; UI-only fixes discovered later are separate FAST tasks owned by WS14/UI program.

Mission:

- audit exact current shared runtime, UI V3/V2 convergence, responsive/PWA/offline state and Alumdoor/reference vertical release state;
- identify which UI capabilities have only source evidence versus actual browser/mobile screenshots/E2E;
- verify current production release evidence uses exact SHA + bundle hash and does not rely on historical releases;
- classify stale open UI PRs versus merged/current source;
- define one minimal cross-device acceptance matrix for the next release-confidence promotion;
- keep offline write/background sync/conflict capabilities conservative until tenant/session/cache/OCC/release-freshness contracts are fully evidenced.

Required browser matrix for any RC recommendation involving UI:

- desktop;
- tablet;
- representative Android/mobile width;
- narrow 360px width;
- keyboard/focus/a11y where applicable;
- dark/reduced-motion where the capability claims it;
- exact release marker when production is claimed.

Output:

- `docs/agents/rc/RC3_A4_UI_MOBILE_RELEASE_EVIDENCE.md`.

### RC3-A5 — Independent QA / Validator / Blocker Prioritization

Branch: `agent/rc3-05-independent-qa`  
Risk: STANDARD evidence validation.  
Owns: independent consistency checks, not primary capability scoring.

Mission:

- run/review the capability validator on the converged candidate;
- detect missing/duplicate/unknown IDs;
- verify maturity arithmetic;
- spot-check promoted capabilities against exact cited source/test/migration/permission/reconciliation/UI/production evidence;
- reject circular evidence where one status document cites another status document instead of executable/source evidence;
- detect stale branch/PR references that are contradicted by main;
- produce prioritized blockers using business breadth, authority risk, dependency centrality and evidence deficit.

Top-30 ranking fields:

- capability ID(s);
- current maturity;
- target maturity;
- missing evidence/implementation;
- owner/workstream;
- dependency;
- risk class;
- whether executable locally/CI, provider non-production, business-policy, or production-authorized;
- why it blocks release confidence.

Output:

- `docs/agents/rc/RC3_A5_INDEPENDENT_QA.md`.

## 6. Dependency graph

A0 starts immediately and freezes methodology/denominator.  
A1, A2, A3 and A4 run in parallel from the exact same program seed.  
A5 may begin validator/static checks immediately but final spot-checking waits for A1-A4 evidence.  
A0 performs final convergence only after A1-A5 outputs are available.

Dependency flow:

`A0 foundation -> {A1, A2, A3, A4} -> A5 independent QA -> A0 final convergence`

No worker owns another worker's hotspot. Cross-owner needs become Dependency Requests.

## 7. Worker startup protocol

For every worker branch:

1. create branch from exact program seed `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7` unless coordinator has explicitly advanced program control first;
2. record agent alias, branch, exact seed and assigned capability families in the first commit/handoff;
3. compare current main before concluding work; main drift is classified as relevant/irrelevant rather than blindly merged;
4. search substantive legacy/open PRs in scope and classify `reuse / already integrated / superseded / reject / dependency`;
5. use exact source/migration/test evidence;
6. never report NOT RUN as PASS;
7. commit only owned evidence/docs/validator changes;
8. report branch head, files changed, tests/checks run, blockers and dependency requests.

## 8. Evidence promotion rules

### Missing -> Foundation

Requires a real contract/schema/service seam with a credible path. Documentation alone is insufficient.

### Foundation -> Wired

Requires a meaningful connected runtime path preserving authoritative permission/tenant boundaries.

### Wired -> RC

Requires, for the declared scope:

- main flow implemented;
- critical invariants explicit;
- focused executable regression evidence;
- failure/correction/retry behavior where applicable;
- permission/tenant boundary evidence;
- migration replay if schema changed;
- browser/mobile evidence if UI is material.

### RC -> Hardened

Requires production-grade evidence for the declared scope, including relevant failure/correction/security/reconciliation and exact-release/provider/production proof. Test count alone cannot promote to Hardened.

## 9. Program acceptance gates

RC3 is complete only when all are true:

1. exact current main at convergence is recorded;
2. validator proves **956/956 unique capability IDs exactly once**;
3. every maturity change has evidence and rationale;
4. stale claims in `CURRENT_STATUS.md` / `NEXT_TASKS.md` are reconciled;
5. historical RC-01 baseline delta is reported;
6. `Hardened` remains zero unless exact production-grade evidence genuinely supports promotion;
7. top-30 blockers are ranked and owned;
8. provider/production-dependent work is separated from code/evidence work;
9. no unauthorized production/provider mutation occurred;
10. final candidate diff contains only intended evidence/status/validator changes unless a separately owned implementation task was explicitly opened.

## 10. Merge boundary

This program is documentation/validation/governance and is not UI-only. Workers may commit to their branches and converge into the RC3 program branch after coordinator review.

**Do not merge the RC3 program branch to `main` without explicit user approval.**  
**Do not deploy production from RC3.**

## 11. Coordinator final report format

Final RC3 report must state:

- exact main seed and final compared main;
- agent count and branch heads;
- 956/956 validator result;
- old vs new maturity counts;
- capability promotions/demotions by evidence class;
- top-30 blockers;
- provider/non-production evidence queue;
- production evidence gaps;
- stale branches/PRs superseded;
- Dependency Requests;
- exact merge/deploy boundary.

The report must make it possible to answer one question without ambiguity:

> **What is the smallest next set of work that materially increases Forge release confidence, and what evidence is still missing before each affected capability can honestly be called RC or Hardened?**
