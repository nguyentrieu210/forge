# RC3 — Capability Truth Convergence

Date: 2026-08-04
Agent: **RC3-A0 — Coordinator / Capability Truth Convergence**
Branch: `agent/rc3-00-capability-convergence`
Program control branch: `program/rc3-exact-main-release-confidence-20260804`
Exact program seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`
Risk: **STANDARD governance/evidence**; any runtime/schema/security/provider/production mutation would be CRITICAL and is out of A0 scope.
Status: **RUNNING — FOUNDATION FROZEN; FINAL CONVERGENCE PENDING A1-A5 EVIDENCE**

## 1. A0 mission and boundary

A0 owns the denominator, evidence schema, maturity reconciliation, final capability status/backlog, blocker ranking and program convergence.

A0 does **not** own domain implementation and will not create runtime changes merely to improve a score. Provider or production mutation is forbidden in this lane. The final RC3 program remains non-UI and must not merge to `main` or deploy production without explicit user approval.

## 2. Exact seed and main-drift record

Startup source of truth:

- exact `main`: `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`;
- exact RC3 program seed: the same SHA;
- WS09 Batch Productization is already converged into this seed;
- no main drift exists between the declared RC3 seed and A0 bootstrap at branch creation.

Any later movement of `main` must be compared and classified as relevant/irrelevant before final maturity conclusions. A0 must not blindly rebase maturity evidence onto later prose.

## 3. Mandatory-source audit completed for foundation

A0 read the current program contract and the mandatory enterprise sources needed to freeze methodology:

- `skills/forge-enterprise-completion/SKILL.md`;
- `CURRENT_STATUS.md`;
- `NEXT_TASKS.md`;
- `PROJECT_CONTEXT.md`;
- `AI_HANDOFF.md`;
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
- `docs/agents/rc/RC-01-capability-truth.md`;
- `server/scripts/validate-enterprise-capability-status.mjs`.

Exact source/migration/test/GitHub evidence wins over status prose if later worker findings conflict.

## 4. Denominator contract — FROZEN

Canonical denominator: **956 unique capability IDs** from `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`.

Allowed maturity vocabulary only:

- `Missing`
- `Foundation`
- `Wired`
- `RC`
- `Hardened`

No worker may add an unknown ID, silently drop an ID, duplicate an ID or change the denominator during RC3. A capability-map change, if genuinely necessary, is a separate shared-contract task and cannot be smuggled into convergence.

## 5. Validator structural audit

Canonical validator: `server/scripts/validate-enterprise-capability-status.mjs`.

A0 verified the validator contract currently enforces:

1. `EXPECTED_TOTAL = 956`;
2. exact maturity label set `Missing/Foundation/Wired/RC/Hardened`;
3. capability IDs parsed from the canonical map;
4. inclusive same-family range expansion in the status registry;
5. registry marker presence;
6. duplicate map-ID detection;
7. missing status-ID detection;
8. unknown status-ID detection;
9. duplicate status assignment detection;
10. status unique count = 956;
11. map unique count = 956;
12. declared maturity counts match expanded registry counts when declared;
13. non-zero exit on mismatch.

This validator is adequate as the denominator/completeness gate for RC3. A5 remains responsible for independent final execution/review and arithmetic/spot-check validation of the converged candidate.

## 6. Historical RC-01 baseline — LOCKED INPUT, NOT CURRENT PROMOTION

RC-01 recorded the following historical baseline:

| Maturity | Historical count |
|---|---:|
| Hardened | 0 |
| RC | 4 |
| Wired | 448 |
| Foundation | 345 |
| Missing | 159 |
| **Total** | **956** |

Historical narrow RC IDs were:

- `I01-014`;
- `G02-001`;
- `VP01-007`;
- `VP01-008`.

RC3 does not inherit these labels by faith and does not demote them by age alone. Every retained promotion/demotion must survive exact-current evidence review.

### 6.1 Exact stale-registry proof

A0 compared the canonical RC-01 branch with exact RC3 seed/current main and found that the capability status registry itself has **not changed at all** despite substantial later implementation convergence:

- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
  - RC-01 branch blob SHA: `edd222b24dd9ac6870f91d326bec1c2a63cbea2a`;
  - exact RC3 seed/current-main blob SHA: `edd222b24dd9ac6870f91d326bec1c2a63cbea2a`;
- `server/scripts/validate-enterprise-capability-status.mjs`
  - RC-01 branch blob SHA: `39513c8aebb4722aee6826ce740f1e55e56c9700`;
  - exact RC3 seed/current-main blob SHA: `39513c8aebb4722aee6826ce740f1e55e56c9700`.

Therefore the RC-01 registry is a reproducible historical baseline, **not a current-main maturity assessment**. RC3 must recompute maturity from exact evidence rather than assume the old counts remain correct or bulk-promote families because later work merged.

## 7. Evidence-promotion lock

A0 freezes the following promotion policy for every worker input.

### Missing -> Foundation

Requires an actual contract/schema/service seam with a credible path. Documentation alone does not qualify.

### Foundation -> Wired

Requires a meaningful connected runtime path while preserving authoritative tenant and permission boundaries.

### Wired -> RC

Requires, for the declared scope:

- main flow implemented;
- critical invariants explicit;
- focused executable regression evidence;
- failure/correction/retry behavior where applicable;
- permission/tenant-boundary evidence;
- migration replay where schema changed;
- browser/mobile evidence where UI is material.

### RC -> Hardened

Requires production-grade evidence for the declared scope, including the relevant failure/correction/security/reconciliation and exact-release/provider/production proof. Test count, merged code, authored tests or a status document alone are insufficient.

`Hardened = 0` remains the conservative default until a capability satisfies this bar with exact evidence.

## 8. Evidence dimensions required per capability change

Each proposed maturity change must cite the applicable dimensions explicitly:

- source/runtime path;
- migration/schema;
- permission/tenant isolation;
- focused executable tests;
- correction/cancel/reversal/retry/idempotency;
- reconciliation;
- UI/browser/mobile;
- provider/non-production;
- production exact-release.

Allowed absence markers remain explicit: `none`, `not run`, `unproven`, `not applicable`, `deferred`.

A status document that only cites another status document is circular evidence and is rejected.

## 9. Worker ingestion schema

A0 will ingest A1-A4 findings using this minimum row shape:

| Field | Requirement |
|---|---|
| Capability ID(s) | exact canonical IDs |
| Historical maturity | RC-01 registry value |
| Proposed maturity | one allowed label |
| Direction | retain / promote / demote |
| Exact evidence | source/test/migration/permission/reconciliation/UI/provider/production pointers |
| Evidence class | source-only / executable / provider-nonprod / production |
| Rationale | why target level is justified |
| Owner | A1/A2/A3/A4 + workstream |
| Risk | FAST/STANDARD/CRITICAL |
| Dependency | exact Dependency Request or none |

A5 will independently spot-check the converged candidate rather than becoming a second scoring authority.

## 10. Program topology at A0 bootstrap

Execution topology: **PROGRAM**
Coordinator: **A0**
Worker agents: **5 (A1-A5)**
A0 coordinator branch: `agent/rc3-00-capability-convergence` — **RUNNING**
Control branch: `program/rc3-exact-main-release-confidence-20260804` from exact seed `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`.

| Agent | Branch | PR | Mission | Status | Dependency / blocker |
|---|---|---|---|---|---|
| A1 | `agent/rc3-01-erp-vn-evidence` | — | ERP authority + Vietnam compliance evidence | NOT BOOTSTRAPPED | A0 methodology frozen; branch/evidence pending |
| A2 | `agent/rc3-02-platform-evidence` | — | Platform/IAM/App Factory/Integration/Migration evidence | NOT BOOTSTRAPPED | A0 methodology frozen; branch/evidence pending |
| A3 | `agent/rc3-03-sre-cloudflare-evidence` | — | SRE/Cloudflare/provider/production evidence | NOT BOOTSTRAPPED | A0 methodology frozen; branch/evidence pending |
| A4 | `agent/rc3-04-ui-mobile-release-evidence` | — | Frontend/mobile/UX/vertical release evidence | BOOTSTRAPPED | bootstrap handoff exists; substantive evidence not yet ingested |
| A5 | `agent/rc3-05-independent-qa` | — | Independent validator/QA/blocker prioritization | NOT BOOTSTRAPPED | final spot-check depends on A1-A4 candidate evidence |

A4 currently contains only its bootstrap evidence document; branch existence alone is not treated as `RUNNING` under the Enterprise Completion Skill vocabulary.

## 11. Current status-registry decision

A0 deliberately makes **no maturity mutation in the bootstrap commit**.

Reason:

- the status registry is structurally valid historical RC-01 input;
- exact blob comparison proves that registry and validator are still the RC-01 artifacts;
- current main has materially advanced through later workstreams;
- family-level reassessment belongs to A1-A4;
- promoting from merge history before worker evidence would violate RC3's core truth rule.

Therefore `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` remains unchanged until evidence rows are reconciled.

## 12. CURRENT_STATUS / NEXT_TASKS decision

No candidate edits are made at A0 bootstrap. Those documents will be changed only after A1-A5 evidence is reconciled so RC3 does not replace stale prose with another speculative snapshot.

Known items requiring eventual reconciliation include:

- WS09 is now converged into current main and must be reflected in App Factory/Batch capability evidence rather than left as a future task;
- CFMAX source convergence must remain separate from provider/live proof;
- historical accounting/HRM/UI branch statements must be classified against current-main canonical source rather than copied forward;
- provider/production-dependent work must remain separated from executable code/evidence tasks.

## 13. Final convergence acceptance queue

A0 final convergence remains pending all of the following:

- [ ] A1 capability-level ERP/VN evidence delivered;
- [ ] A2 capability-level platform/IAM/App Factory/integration/migration evidence delivered;
- [ ] A3 SRE/Cloudflare/provider evidence and safe evidence queue delivered;
- [ ] A4 substantive UI/mobile/vertical release evidence delivered;
- [ ] A5 independent validator execution, arithmetic and spot-check report delivered;
- [ ] exact current `main` at final convergence recorded;
- [ ] 956/956 validator final result recorded;
- [ ] historical-to-current maturity delta computed;
- [ ] every promotion/demotion evidence-reviewed;
- [ ] `CURRENT_STATUS.md` candidate reconciled;
- [ ] `NEXT_TASKS.md` candidate reconciled;
- [ ] top-30 release blockers ranked by capability ID + owner + evidence gap + risk;
- [ ] provider/non-production queue separated from production-authorized work;
- [ ] no unauthorized provider/production mutation occurred.

## 14. Dependency Requests

None from A0 foundation at this time.

Missing worker evidence is an expected program dependency, not a shared-contract blocker.

## 15. Merge/deploy boundary

This branch is documentation/governance and **not UI-only**.

- A0 may commit and open a PR against the RC3 program/control branch.
- A0 does not merge itself.
- RC3 program branch must not merge to `main` without explicit user approval.
- No production deploy is part of A0.


<!-- RC3_FINAL_CONVERGENCE_START -->
## Final A0 convergence candidate

Exact seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`.

Accepted worker evidence: A1 #590, A2 #589, A3 #586, A4 #588, A5 #591. A5 independently accepted A1's 61 scoped RC promotions, all A2 7 promotions + 3 demotions, A3's 0/0 provider-conservative result and A4's 4 Wired promotions + Push demotion.

Final maturity candidate before validator:

| Maturity | RC-01 | RC3 | Delta |
|---|---:|---:|---:|
| Hardened | 0 | 0 | 0 |
| RC | 4 | 65 | +61 |
| Wired | 448 | 407 | -41 |
| Foundation | 345 | 327 | -18 |
| Missing | 159 | 157 | -2 |
| Total | 956 | 956 | 0 |

The duplicate `0110_*` numeric-prefix anomaly remains a tracked governance blocker; because the migration runner journals complete filenames, RC3 does not rename potentially applied migrations without environment applied-state evidence.

Required final structural gate: `node server/scripts/validate-enterprise-capability-status.mjs` must report 956 map IDs, 956 status IDs, zero missing/unknown/duplicate IDs and matching maturity arithmetic.

No production/provider mutation is part of this convergence.
<!-- RC3_FINAL_CONVERGENCE_END -->
