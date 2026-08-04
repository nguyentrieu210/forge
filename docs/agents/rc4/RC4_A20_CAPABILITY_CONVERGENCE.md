# RC4-A20 — 956-Capability Convergence

Date: **2026-08-04**  
Branch: `agent/rc4-20-capability-convergence`  
Exact snapshot baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Status: **CONVERGING — validator/PR gate pending**  
Risk: **STANDARD governance/evidence; inherited CRITICAL claims remain evidence-gated**

## Mission

Converge RC4 A1-A19 evidence into the canonical 956-capability truth without treating branch existence, PR existence, authored tests, skipped CI or source presence as maturity evidence.

A20 owns only capability status/evidence/tooling. It does not implement domain runtime, change ledgers, mutate provider state or bypass another lane's authority.

## Snapshot rule

This is a point-in-time convergence snapshot. It records GitHub state observed through PR `#606`; A19 independent run `30868619676` was still **in progress** at the cutoff.

Later worker commits, PRs or successful runs do not silently change this record. They require a new manifest revision and must pass the same provenance/maturity validator before affecting the canonical registry.

Machine-readable snapshot: `docs/agents/rc4/RC4_A20_EVIDENCE_MANIFEST.json`.

## Canonical denominator and maturity decision

The canonical registry remains exactly **956/956** capabilities.

| Maturity | RC3 baseline | RC4-A20 candidate | Delta |
|---|---:|---:|---:|
| Hardened | 0 | 0 | 0 |
| RC | 65 | 65 | 0 |
| Wired | 407 | 407 | 0 |
| Foundation | 327 | 327 | 0 |
| Missing | 157 | 157 | 0 |
| **Total** | **956** | **956** | **0** |

**A20 accepts zero maturity changes in this snapshot.**

That is deliberate, not a claim that RC4 workers produced no value. Several lanes materially strengthened implementation or executable evidence, but none clears the full capability-specific promotion boundary at this convergence cutoff.

## A1-A19 convergence table

| Lane | PR/head at snapshot | Actual status | Evidence class | A20 maturity acceptance | Reason |
|---|---|---|---|---|---|
| A1 IAM/privacy | #597 `47bb2b8` | READY | exact executable | NO | Backend IAM gate is green, but A1 explicitly keeps MFA/session Wired pending A6 browser/device evidence; provider/privacy gaps remain. |
| A2 SRE/provider | #596 `6efa89b` | BLOCKED | audit-only | NO | Remote Cloudflare observation remains `unverified`; lane explicitly reports zero promotions/demotions. |
| A3 migration/cutover | #599 `792f7f3` | READY | exact executable | NO | Durable/retry path is green, but domain reconciliation, restore/PITR/cutover and applied-state evidence still block RC promotion. |
| A4 Finance/VN | #602 `84f25a8` | BLOCKED | partial executable | NO | SQLite migration replay is green; focused Node execution/provider/shared-ledger dependencies remain open; lane makes no promotion. |
| A5 HCM/payroll | #604 `1baaf38` | BLOCKED | source/static | NO | PIT source-lock and regressions exist; exact execution and complete BHXH/BHYT/BHTN legal numeric authority remain open. |
| A6 UI/mobile/offline | #598 `0075722` | BLOCKED | harness-only | NO | Browser matrices exist but no accepted exact worker browser run; offline authority remains Missing. |
| A7 App Factory | #606 `4998c7d` | RUNNING | source/static | NO | Persisted approval runtime candidate is substantive, but its own PR says capability promotion remains evidence-gated; exact gate not accepted at cutoff. |
| A8 integration/provider | no final PR pinned | RUNNING | source/static | NO | Provider/DLQ code exists without accepted immutable final head + executable provider/retry evidence. |
| A9 architecture/kernel | no final PR pinned | BOOTSTRAPPED | bootstrap | NO | Branch/handoff only at observed checkpoint. |
| A10 CRM/revenue | no final PR pinned | BOOTSTRAPPED | bootstrap | NO | Branch/handoff only at observed checkpoint. |
| A11 procurement/P2P | #600 `27c616c`; validated `a157f4a` | READY | exact executable | NO | Supplier cancellation/permission hardening is green, but it does not prove whole Supplier Rating/Contract capability depth or cross-owner landed-cost/allocation closure. |
| A12 inventory/WMS | no final PR pinned | BOOTSTRAPPED | bootstrap | NO | Branch/handoff only at observed checkpoint. |
| A13 manufacturing/QMS | #603 `d6b7a50` | RUNNING | source/static | NO | Release-confidence workflow/tests exist, but exact run was not accepted at cutoff and rework/subcontract/cost/repost dependencies remain. |
| A14 project/service/field | no final PR pinned | BOOTSTRAPPED | bootstrap | NO | Branch/handoff only at observed checkpoint. |
| A15 BI/semantic/AI | no final PR pinned | RUNNING | source/static | NO | Substantive semantic/AI code/tests exist without accepted immutable final PR head/execution at cutoff. |
| A16 workplace/DMS/collab | no final PR pinned | BOOTSTRAPPED | bootstrap | NO | Branch/handoff only at observed checkpoint. |
| A17 logistics/POS/commerce | #601 `f250406` | BLOCKED | source/static | NO | Authorization hardening exists, but focused execution is unaccepted; skipped CI is not evidence and Finance/Inventory/UI dependencies remain. |
| A18 Alumdoor vertical | no final PR pinned | BOOTSTRAPPED | bootstrap | NO | Bootstrap only; historical production evidence cannot prove the current RC4 candidate. |
| A19 adversarial QA | #605 `102f887` | RUNNING | independent QA in progress | NO | Run `30868619676` is still in progress; A19 additionally requires second exact-converged-head replay before RC4 promotion. |

## Strong evidence retained without inflation

### A1

Exact worker run `30867988724` is accepted as direct backend IAM evidence. It strengthens confidence in MFA/session/recent-auth/security paths but does not substitute for A6 browser/device evidence or complete OIDC/SAML/SCIM/privacy lifecycle evidence.

### A3

Exact worker run `30868113636` is accepted as direct migration-runtime evidence. It proves the changed durable import/retry/journal scope, not non-production restore/PITR, opening-data reconciliation, applied migration inventory or production cutover.

### A11

Exact worker run `30868323326` validates candidate `a157f4aab5d5a5a0ee867bee77aedbe4af812436`; the final branch later removes the temporary workflow and updates handoff documentation. A20 accepts that test result for the narrow changed server/test blobs, but does not reinterpret narrow cancellation hardening as complete `P02-004` or `P02-007` maturity.

### A2 / A4 / A5 / A6 / A7 / A13 / A17 / A19

These lanes are intentionally held at their declared evidence boundary. In particular:

- provider `unverified` is not production/provider PASS;
- isolated migration/static evidence is not whole capability RC;
- authored Playwright/Node tests are not PASS until executed;
- skipped default workflows are not PASS;
- an in-progress independent QA run is not PASS;
- a PR that says promotion remains evidence-gated cannot be promoted by A20 merely because its code is substantive.

## New machine gate

`server/scripts/validate-rc4-capability-convergence.mjs` adds RC4-specific controls on top of `server/scripts/validate-enterprise-capability-status.mjs`.

It enforces:

1. canonical map/status denominator = exactly `956` unique IDs;
2. zero missing, unknown or duplicate capability assignments;
3. every registry evidence reference resolves to exactly one Evidence Index bundle and every bundle is used;
4. manifest baseline/candidate maturity totals both reconcile to 956;
5. candidate maturity counts equal the canonical registry;
6. A1-A19 appear exactly once with valid status/provenance;
7. PR-backed evidence records carry immutable 40-character head SHAs;
8. `BOOTSTRAPPED`, `audit-only`, `source-static`, `harness-only` and in-progress QA cannot be accepted as promotion evidence;
9. any future accepted maturity lane must have exact validated head, successful workflow-run provenance, explicit capability IDs and direct evidence paths;
10. circular evidence through A20's own convergence files is rejected;
11. maturity changes must reference an accepted lane, a known capability and a defined Evidence Index bundle;
12. maturity arithmetic from baseline -> candidate must reconcile exactly.

When run in PR CI, `RC4_EXPECTED_MAIN_SHA` pins the manifest snapshot to the actual PR base SHA so a stale A20 snapshot fails closed if `main` advances.

## Immediate blocker order after convergence

A20 does not rewrite the canonical Top-30 registry queue in this snapshot because no maturity changed. For RC4 execution, the highest-impact evidence dependencies are:

1. **A19 independent gate + second converged-head replay** before accepting any cross-branch RC4 promotion.
2. **A6 exact browser/device execution** for current V2, MFA/session UX and PWA evidence; it must not invent offline authority.
3. **A2 non-production provider/recovery evidence** for D1/Workflow/restore/PITR/rollback/edge/provider claims.
4. **A3 domain opening-data reconciliation + cutover drill + applied migration inventory**.
5. **A4 shared authoritative ledger aggregate** for year-end close/revaluation/budget-actual and Stock↔GL dependent closure.
6. **A5 clause-complete BHXH/BHYT/BHTN effective-dated legal numeric matrix + exact execution**.
7. **A12 landed-cost, historical stock repost/replay, WMS persisted task/cycle-count authority**, required by Finance/Procurement/Commerce/Manufacturing consumers.
8. **A8 exact DLQ/replay/provider execution + provider-safe evidence**.
9. **A7 exact persisted approval-runtime gate + A3/A2 dependency closure** before BPM/App rollback promotion.
10. **A13/A17 exact execution plus cross-owner dependencies** before manufacturing/QMS or Commerce residual claims are promoted.

## Dependency Requests

### DR-RC4-A20-01 -> A19 / coordinator

Complete A19 independent replay, then replay the eventual accepted **converged candidate head**. Worker-head PASS alone is insufficient for final RC4 convergence because integration can change the effective tree.

### DR-RC4-A20-02 -> A1-A18 owners

For any requested promotion, provide an immutable final head and capability-specific direct evidence matching the Forge maturity model. A20 will not infer promotion from implementation volume, PR count or a generic test suite.

### DR-RC4-A20-03 -> A21 / environment owner

Resolve migration-number/identity governance only with applied-state evidence. A20 will keep migration-dependent claims below their target level while duplicate historical prefixes and applied-state uncertainty remain.

### DR-RC4-A20-04 -> A22 / domain owners

Provide read-only cross-ledger reconciliation evidence for Finance/Stock/Payroll/Procurement/Manufacturing claims that require authoritative reconciliation before RC/Hardened.

### DR-RC4-A20-05 -> A24

Final RC4 release-confidence QA must consume the A20 manifest/validator and reject any later maturity change that bypasses the provenance contract.

## Validation commands

```bash
node server/scripts/validate-enterprise-capability-status.mjs
node --check server/scripts/validate-rc4-capability-convergence.mjs
node server/scripts/validate-rc4-capability-convergence.mjs
```

PR CI additionally supplies `RC4_EXPECTED_MAIN_SHA=<pull_request.base.sha>`.

## Merge / deploy boundary

A20 is non-UI governance/evidence tooling.

- Branch + PR + exact-head validation are allowed.
- **Do not merge or deploy without explicit user approval.**
- No production/provider/data/schema/ledger/business-runtime mutation is performed by A20.
