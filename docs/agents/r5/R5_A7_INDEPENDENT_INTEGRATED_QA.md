# R5-07 — Independent Integrated QA

Date: 2026-08-04  
Branch: `agent/r5-07-independent-integrated-qa`  
Seed: `main@8316d2a5f24863d3347cf9f92ec5987145b8dc9e`  
Risk: STANDARD QA/evidence; no business/runtime authority change

## Verdict

**BLOCKED_PRECONDITION — no explicit integrated R5 candidate SHA exists yet.**

R5-07 does not manufacture a candidate by cherry-picking R5 worker branches. Per the R5-07 contract, independent setup/audit continues on exact current `main`, while candidate-dependent integrated replay remains blocked until R5 Integration Control publishes one immutable integrated candidate SHA.

This is not a product FAIL and it is not an integrated PASS. It is a fail-closed QA state caused by a missing prerequisite.

## Exact state audited

Current `main` is `8316d2a5f24863d3347cf9f92ec5987145b8dc9e`. The latest main change is the documentation cleanup after RC4 integrated closure. No R5-01..R5-06 worker implementation has been merged into `main`.

Open R5 lanes at audit time:

| Lane | PR | Current disposition | Independent R5-07 reading |
|---|---:|---|---|
| R5-00 Integration Control | #629 | Draft, mergeable | `GO_WAVE_1`; still no explicit integrated R5 candidate SHA |
| R5-01 Package + Capability Profile | #634 | Draft, mergeable | Exact merge-candidate validation reported green; shared backend/schema change remains unmerged |
| R5-02 Finance + HCM | #632 | Draft, mergeable | Exact candidate validation reported green; critical Finance/HCM change remains unmerged |
| R5-03 Commercial + Supply Chain | #636 | Draft, mergeable | Exact-head validation reported green; critical shared quantity contract remains unmerged |
| R5-04 Manufacturing + Service | #628 | Draft; currently not mergeable against moving main | Technical validation reported green; candidate disposition not integrated |
| R5-05 Integration + BI + Workplace + Logistics | #630 | Draft; currently not mergeable | BLOCKED on shared scheduler registration and R5-01 capability interaction |
| R5-06 Package / Migration Rehearsal | #635 | Draft, mergeable | Harness mostly green on current-main baseline; full rehearsal blocked on owner dependencies and missing integrated candidate |

Worker self-verdicts are provenance only. R5-07 will not convert them into integrated evidence until the exact combined candidate is replayed.

## Exact precondition gap

Required before integrated replay:

1. R5-01..R5-06 final dispositions are stable.
2. Integration Control publishes one explicit immutable candidate SHA.
3. That SHA contains only accepted worker deltas and reconciliations; no stale RC4 replay or synthetic branch composition.
4. Candidate provenance identifies the exact source heads and conflict resolutions used.
5. R5-06 package/migration rehearsal has a candidate-bound rerun or an explicit candidate-bound blocker record.

Current gap is item 2, with item 5 consequently incomplete.

### Dependency Request — DR-R5-A7-01

**Owner:** R5-00 Integration Control  
**Need:** publish one explicit integrated R5 candidate SHA after worker dispositions stabilize.  
**Acceptance:** immutable SHA, source-head list, merge/reconciliation order, migration collision check, and no unresolved authority overlap.

R5-07 will then replay exactly that SHA; it will not accept a branch name alone.

## Owner defects/dependencies observed; not fixed in QA

R5-07 records these only to define the candidate gate. Substantive fixes remain with owners.

- **R5-01 / package version contract:** minimum dependency version syntax/semantics must be canonical and fail closed; too-old versions must not satisfy the declared minimum.
- **R5-02 / HRM package integrity:** HRM `Salary Bank Batch.bank_account` package dependency on `Bank Account` must satisfy the canonical external-DocType contract.
- **R5-03 + R5-02 / landed cost:** receipt-targeted valuation identity and historical Stock/COGS -> GL propagation remain a joint authority dependency.
- **R5-05 / scheduler:** canonical maintenance scheduler must register Workplace scheduled notifications without introducing a second scheduler.
- **R5-05 + R5-01 / activation:** hooks/jobs/integrations/provider dispatch must consume the canonical effective capability state rather than raw installed-manifest state.
- **R5-06 / full rehearsal:** fresh-install/upgrade/profile lifecycle replay must be rerun on the one integrated candidate SHA.

## Independent QA matrix prepared

Once `candidate_sha` is non-null, every lane below must execute on the same SHA.

| QA lane | Required evidence | Current state |
|---|---|---|
| Exact candidate identity | checkout/assert immutable SHA; exact diff/provenance | BLOCKED_PRECONDITION |
| Build/type gates | locked dependencies; emitted server/client artifacts; changed-authority diagnostics fail closed | READY_TO_RUN |
| IAM/session/tenant/permission | MFA/session revoke/revalidation, tenant isolation, DocPerm/role negative paths | READY_TO_RUN |
| Package/profile | dependency resolution, min version, required/disabled/blocked, activate/deactivate, server permission | BLOCKED_ON_CANDIDATE |
| Sales/O2C | quote/order/delivery/invoice/payment lineage + correction/retry | READY_TO_RUN |
| Procurement/P2P | supplier/PO/receipt/invoice/AP lineage + correction/retry | READY_TO_RUN |
| Inventory/valuation | reservation/stock ledger/valuation/repost/scanner identity | READY_TO_RUN |
| Manufacturing/QMS | demand -> WO -> material/FG -> delivery; QMS lifecycle | READY_TO_RUN |
| Finance/HCM/payroll | GL/Payment Ledger, employee loan, payroll/statutory bounded scope, reversals | READY_TO_RUN |
| Warranty/Service | exact Delivery provenance and reciprocal warranty/service lineage | READY_TO_RUN |
| Cross-ledger reconciliation | independent A22 auditor self-test + candidate evidence replay | READY_TO_RUN |
| Migration/checksum | SQL verification, append-only governance, filename/checksum identity | READY_TO_RUN |
| Browser/mobile/PWA | desktop/tablet/mobile current-V2 smoke, accessibility/PWA release semantics | BLOCKED_ON_CANDIDATE |
| Representative performance | deterministic regression + 100k-row local envelope; no provider/live claim | READY_TO_RUN |
| Authority contamination | no duplicate ledger/scheduler/profile authority; no stale branch replay | BLOCKED_ON_CANDIDATE |

`READY_TO_RUN` means the repository already contains reusable test machinery; it does not mean PASS on the future R5 candidate.

## Fail-closed rules

R5-07 will treat all of the following as non-PASS:

- branch-local worker PASS;
- skipped jobs/tests;
- authored tests without execution;
- source/config presence without executable evidence;
- historical RC4 or production evidence used as proof of the R5 candidate;
- browser evidence from another release SHA;
- provider/live claims inferred from desired configuration;
- candidate SHA drift between QA lanes.

## Setup delivered on this branch

- this independent precondition audit;
- `docs/agents/r5/R5_A7_QA_EVIDENCE_MANIFEST.json` as machine-readable QA state;
- `.github/workflows/r5-07-independent-integrated-qa.yml` to validate the QA branch setup and current immutable RC4/main baseline without claiming integrated R5 PASS.

The workflow is deliberately a **setup gate** while `candidate_sha` is null. Candidate-bound package/profile/browser/integrated assertions are not marked green by setup execution.

## Safety / merge boundary

R5-07 changes QA/evidence only. It does not change business runtime, schema, migration, provider state, production data, DNS/secrets or customer data.

This is non-UI QA/governance work. Keep the PR Draft and **stop before merge/deploy pending explicit user authorization**.