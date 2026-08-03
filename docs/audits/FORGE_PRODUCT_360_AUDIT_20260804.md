# FORGE PRODUCT 360 AUDIT — 2026-08-04

Status: AUDIT SNAPSHOT / NON-UI / NOT MERGED

Exact audited main: `7626576feb67a4428e3c9bbfd41ad40e1f0c4641`

This audit was re-anchored after concurrent main drift merged RC-020 Finance (`#443`) and RC-024/025 Inventory (`#441`) while the audit was being written.

## Executive verdict

Forge is no longer a prototype with a module-count problem. It is an implementation-heavy enterprise platform whose dominant gap is evidence and closure.

The current capability baseline is conservative and defensible: 956/956 IDs accounted for, with `Hardened=0`, `RC=4`, `Wired=448`, `Foundation=345`, `Missing=159`. These counts are an evidence baseline, not a live automatic recomputation after every merge. RC-020 and RC-024/025 landing on main improve source truth but do not automatically promote capability maturity without exact post-merge validation/reconciliation/production evidence.

The shortest path to product completion is:

`platform proof -> authority closure -> cross-ledger reconciliation -> migration/release proof -> UX/mobile completion -> App Factory/BI/AI moat`

Do not open new verticals or broad feature families until these closure gates move.

## Sources audited

- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `PROJECT_CONTEXT.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `validation/rc-gates.json`
- `docs/agents/AGENT_BOARD.md`
- WS08, WS09, WS11, WS12, WS13, WS14 handoffs
- `.github/workflows/alu-build-deploy.yml`
- current RC PR/workflow state
- proposed but unmerged RC hardening blueprint on `docs/repo-zero-open-prs-20260803`
- concurrent main drift through merged RC-020 (`#443`) and RC-024/025 (`#441`)

## Audit by product layer

### 1. Product / capability truth

Assessment: STRONG FOUNDATION, EVIDENCE-CONSERVATIVE.

Strengths:
- 956/956 capability denominator exists and is validator-backed.
- maturity vocabulary is strict: Missing/Foundation/Wired/RC/Hardened.
- evidence bundles distinguish source, test, migration, permission, correction/reconciliation, UI and production proof.

Gaps:
- capability status is a point-in-time baseline and must be re-audited after the current RC wave lands.
- the canonical RC hardening plan referenced by several tasks is still absent from current main. It exists only in open PR #428 / branch `docs/repo-zero-open-prs-20260803`.
- `docs/agents/AGENT_BOARD.md` is stale relative to the current RC wave and should not be treated as live execution truth.

Verdict: keep the conservative maturity model; converge the control-plane documentation before the next large wave.

### 2. Domain authority / source of truth

Assessment: ARCHITECTURE IS MOSTLY RIGHT; FINANCE/INVENTORY AUTHORITY HAS ADVANCED, SUBLEDGER CLOSURE REMAINS.

Good boundaries already established:
- document mutation authority remains DocumentKernel / Durable Object / D1 path.
- `gl_entries` is the accounting authority.
- Payment Entry / Payment Allocation remain settlement authority.
- `stock_ledger_entries` remains stock authority.
- Warehouse Cash is operational and must not become a competing financial ledger.
- BI/AI is explicitly prevented from becoming a raw-schema or parallel authoritative path.

New exact-main state:
- RC-020 Finance is merged on main and hardens accounting-period authority, immutable GL and tenant/company/branch-scoped reconciliation/query behavior.
- RC-024/025 Inventory is merged on main and hardens Stock Reconciliation reversal plus backdate/repost/valuation authority.

Still open / dependent:
- RC-021 AR remains open and must consume the merged RC-020 period/GL contract before merge.
- RC-022 AP remains open and requires exact-head validation plus audit against the merged Finance contract.
- RC-023 Cash/Bank remains open and must rebase onto merged RC-020.

Major convergence risk:
- RC-020 has now landed migration numbers in the `0110/0111` range while RC-023 explicitly reported concurrent reuse of those prefixes. RC-023 must rebase and deterministically renumber/reorder its migration before merge if the filenames now collide in ordering/dependency semantics.

Verdict: no new finance/stock ledger or balance authority. Finish subledger/cash reconciliation against the now-merged GL authority.

### 3. End-to-end workflow / correction / reconciliation

Assessment: WIRED BREADTH, INCOMPLETE CROSS-DOMAIN CLOSURE.

Forge has many main-path workflows, but enterprise maturity is blocked by the negative path:
- cancel/reversal/correction;
- partial allocation/fulfillment;
- backdate/repost;
- duplicate/retry/idempotency;
- tenant/company/branch scope moves;
- cross-ledger reconciliation.

Inventory reversal/repost behavior is now on main, but its downstream historical COGS/expense/accounting-dimension restatement still belongs to Finance and remains a dependency before full valuation closure can be called Hardened.

The most important cross-domain acceptance remains:

`Sales -> Production -> Inventory -> Delivery -> Finance -> Daily Ledger -> Warranty`

Promote it only when every authoritative side effect can be traced, reversed/corrected, and reconciled.

Verdict: measure progress by closed business lifecycles, not screen count.

### 4. Security / IAM / SaaS control plane

Assessment: STRONG RBAC FOUNDATION, ENTERPRISE IAM INCOMPLETE.

Strengths:
- signed session boundary, tenant binding, session epoch and revocation foundation.
- server-side DocPerm/role/owner/share/User Permission enforcement.
- privileged IAM recent-auth hardening exists on the Frappe mutation surface.

Critical gaps:
- native privileged routes still have a separate trusted-identity path without the same strong recent-auth / authentication-strength contract.
- MFA is not production-complete.
- OIDC/SAML SSO and SCIM are not production-complete.
- tenant subscription/quota/feature lifecycle, suspension/deletion and audited support impersonation remain incomplete.
- sensitive employee field/permlevel hardening remains a stated blocker.
- credential vault/rotation/revocation/audited-use maturity remains incomplete.

Verdict: no Hardened security claim until privileged control surfaces converge and MFA/SSO/SCIM/control-plane lifecycle are implemented and verified.

### 5. UX / frontend / mobile

Assessment: GOOD GENERIC RUNTIME, PRODUCT EXPERIENCE STILL WIRED.

Strengths:
- metadata-first generic runtime for list/form/report/action/workspace/overview/import.
- global search and command palette are wired.
- mobile shell/a11y improvements, installable PWA metadata, pull-to-refresh stabilization and some touch-friendly child-grid behavior have merged.
- PDF-heavy dependencies are already lazy-loaded in the right direction.

Important gaps:
- `/page/:page` and `/dashboard/:page` still use `DeskFallback` because there is no frozen first-class shared Page/Dashboard contract.
- base `ChildGrid.tsx` remains table-first on narrow screens and mixes domain-specific behavior into a nearly 2,000-line shared component.
- domain-specific child-grid profiles remain inside shared views and should move to metadata/vertical ownership.
- `U01-003..007` offline read/write/background sync/conflict remain Missing.
- browser/mobile acceptance evidence is missing for several merged UI slices.
- exact-current production release proof for those UI slices is unproven.

Verdict: rebuild layout/design only while preserving metadata/runtime boundaries. Next UX architecture: Page/Dashboard contract -> base ChildGrid decomposition -> metadata-driven domain profiles -> browser/mobile evidence -> true offline.

### 6. App Factory / BPM moat

Assessment: PROMISING DIFFERENTIATOR, NOT YET ENTERPRISE-COMPLETE.

Strengths:
- manifest/dependency/version/install foundation.
- workflow state/transition/delegation foundations.
- visual workflow editor exists for the state-transition subset.
- first-class AppAction input-table work is moving repeatable input out of compatibility JSON transport.

Missing or incomplete enterprise primitives:
- parallel approval/quorum.
- persisted approval-step instance engine / full approval matrix execution.
- escalation, SLA/timer and scheduled BPM action.
- generic versioned rule/formula lifecycle.
- process analytics/bottleneck model.
- app rollback.
- marketplace signing/trust lifecycle.
- full builder depth for form/list/report/dashboard/print/permission.

Verdict: this is one of Forge's strongest strategic moats, but harden it after platform/authority evidence is stable.

### 7. BI / semantic / AI

Assessment: SAFE ARCHITECTURAL DIRECTION, MOSTLY FOUNDATION/WIRED.

Strengths:
- semantic query design is permission-aware and tenant-bound.
- exact scaled values are kept away from SQLite REAL for authoritative money semantics.
- AI proposals cannot inject tenant/raw SQL and are intended to query through semantic registry + permission + audit.
- planning/forecast/feed/subscription seams are designed not to become authoritative write paths.

Gaps:
- semantic model registration is not fully wired through app manifests/runtime.
- dashboard/executive cockpit and saved BI views are incomplete.
- semantic scheduled reports still need job/runtime integration.
- trusted Daily Detailed Ledger semantic source depends on finance/kernel authority closure.
- AI write/action proposal/preview/approval depends on AppAction/BPM + deterministic domain tools.

Verdict: keep AI read-first and tool-gated. Do not add autonomous authoritative writes before deterministic action/approval contracts exist.

### 8. Migration / onboarding / customer success

Assessment: GOOD CORE DESIGN, RUNTIME/CUTOVER INCOMPLETE.

Strengths:
- existing Data Import writes through canonical kernel.
- durable migration journal/retry/recovery design exists.
- deterministic source fingerprint/plan/row identity and reconciliation concepts exist.
- MISA/ERPNext mapping foundations exist.
- setup/go-live/training/customer-success evidence models exist.

Gaps:
- current Data Import API is not fully wired to the durable migration journal executor.
- concrete finance/stock/HR opening providers are pending.
- migration crash-window/content-identity hardening remains a shared SRE/migration dependency.
- mapping/correction UX is incomplete.
- no current production cutover rehearsal proves the full path.

Verdict: migration is a sales enabler and should move ahead of speculative new vertical development.

### 9. SRE / release / backup / observability

Assessment: SOURCE-CONTROLLED SAFETY IS STRONG; PRODUCTION DR PROOF IS INCOMPLETE.

Strengths:
- one canonical `ALU Build and Deploy` workflow.
- UI-only automatic lane is guarded against non-UI changes.
- full release is manual and requires merged-main target.
- backup verification precedes migration.
- exact Gateway UI release marker is verified.
- bounded retry/DLQ/structured observability and guarded PITR/rollback tooling exist.

Important gaps:
- release marker proves Gateway UI SHA/hash, not every Worker/storage component identity.
- production restore/PITR/rollback drills are not current-main proven.
- off-account encrypted backup retention/RTO/RPO/rehearsal cadence remain incomplete.
- DLQ inspect/quarantine/replay still depends on Integration Hub event contract.
- app-worker observability coverage is not fully converged.

Verdict: SRE source is ahead of production evidence. Do not call the platform Hardened until current release/restore/rollback evidence exists.

### 10. Validation / CI truth

Assessment: POLICY IS GOOD, EXECUTION IS INCONSISTENT.

`validation/rc-gates.json` correctly defines FAST/STANDARD/CRITICAL and conditional promotion evidence.

Observed RC exact-head evidence during this audit:
- RC-021 AR (#440): exact-head `RC-021 Critical Validation` run `30836700173` = SUCCESS.
- RC-020 (#443): no workflow run was observable at its audited PR head before it merged.
- RC-022 (#439): no workflow run observable at current audited head.
- RC-023 (#442): no workflow run observable at current audited head.
- RC-024/025 (#441): no workflow run was observable at its audited PR head before it merged.

Because RC-020 and RC-024/025 are now on main, post-merge exact-main validation should be recorded rather than assuming mergeability or source tests equal a CRITICAL gate PASS.

A current RC-021 validation note also reports inherited full-server/full-worker TypeScript baseline failures outside its changed files (MRP/QMS/CRM/App Registry/Frappe-model/quotation debt). Treat this as repository health debt, not something focused green tests should hide.

Verdict: keep focused gates, but add one reproducible exact-main baseline lane that exposes inherited compile/type debt and ownership without turning every PR into a huge monolithic CI job.

## Highest-priority blockers

### P0 — control/evidence plane

1. Converge a canonical RC hardening plan/task ledger; current main still lacks it.
2. Archive/replace stale WS board state with current RC program state.
3. Standardize exact-head validation availability for every CRITICAL PR.
4. Run/record exact-main post-merge CRITICAL evidence for newly merged RC-020 and RC-024/025.
5. Establish current-main production identity proof beyond Gateway UI where required.
6. Establish reproducible repository typecheck/build health baseline and debt ownership.

### P0 — authority/integrity

7. Treat merged RC-020 as the frozen Finance period/GL authority.
8. Rebase/revalidate RC-021/022/023 against RC-020 before merge.
9. Resolve RC-023 migration numbering/order against the now-landed Finance migrations.
10. Close Stock Ledger <-> GL historical valuation restatement/reconciliation after merged RC-024/025.
11. Close AR/AP/Cash control reconciliation as explicit exact-main evidence.

### P1 — enterprise platform

12. Unify recent-auth/authentication-strength across Frappe + native privileged APIs.
13. Implement MFA then OIDC/SAML/SCIM lifecycle.
14. Complete subscription/quota/feature/suspend/delete/support-impersonation control-plane lifecycle.
15. Complete migration journal API wiring + opening providers + cutover reconciliation.
16. Close DLQ inspect/quarantine/replay and migration content-identity/crash-window contracts.

### P1 — UX/productization

17. Freeze generic Page/Dashboard compatibility contract.
18. Decompose base ChildGrid and move domain profiles to metadata/vertical config.
19. Add browser/mobile acceptance lane and capture exact-current UI evidence.
20. Implement offline only after tenant/session/cache/OCC/revoke-purge/release-freshness contracts are frozen.
21. Run one current-main Alumdoor end-to-end acceptance covering business flow + reconciliation + release evidence.

### P2 — moat after core closure

22. AppAction input-table end-to-end UI/runtime rollout.
23. BPM quorum/approval-instance/timer/escalation/process analytics.
24. App rollback + marketplace trust/signing.
25. Semantic models registered through App Factory manifests.
26. Executive dashboard/planning/report subscription runtime.
27. AI deterministic tool proposal -> preview -> approval -> authoritative action.

## Recommended execution sequence from current main

1. Control docs/evidence convergence.
2. Post-merge RC-020 + RC-024/025 exact-main evidence and cross-ledger audit.
3. Rebase and rerun RC-021/022/023 against merged RC-020; renumber migration conflicts before merge.
4. Security privileged-auth convergence.
5. Migration/SRE data-safety convergence.
6. UX shared-contract closure + browser/mobile evidence.
7. App Factory/BPM and semantic runtime wiring.
8. Current-main Alumdoor golden enterprise acceptance.

Do not merge remaining CRITICAL finance PRs out of order merely because GitHub reports them mergeable.

## Product completion definition

Forge should only be called product-complete for a declared scope when:

- the business flow runs end-to-end;
- every write goes through one authoritative path;
- cancel/reverse/correct/backdate/retry behavior is explicit;
- tenant/company/branch permission is server enforced;
- finance/stock/payroll/data results reconcile;
- migration/onboarding has preview, recovery and post-cutover reconciliation;
- browser/mobile behavior is proven for real user actors;
- release/backup/restore/rollback evidence is current;
- App Factory extends the product without forking shared runtime;
- AI uses permission-aware semantic/tool/action contracts and never becomes a source of truth.

## Final product diagnosis

Forge has enough implementation breadth to justify stopping horizontal expansion for now.

The product's main bottleneck is no longer `feature missing`; it is `enterprise closure missing`.

Therefore the next phase should optimize for fewer open authorities, fewer unproven claims, fewer shared-contract ambiguities, and more exact-main/production evidence.
