# A5 — WS09 Batch QA / Convergence Evidence

Date: **2026-08-04**  
Branch: `agent/ws09-batch-05-convergence`  
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`  
Main audited: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`  
Risk: **CRITICAL inherited** because the convergence program includes Stock Reconciliation and a commit-capable generic executor  
Production deployment: **NO**

## 1. Purpose

This document is the independent A5 evidence lane for WS09 Batch Productization. It records the exact baseline, ownership boundaries, external dependency truth, validation matrix and convergence gates before A1-A4 implementation is accepted.

It does **not** define a competing BatchAction contract and does **not** promote any capability maturity by itself.

## 2. Exact repository truth at baseline

### Program / main

- Program control branch baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`.
- Exact current `main`: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`.
- No newer `main` commit exists at this audit checkpoint.
- The `main` delta after Transaction Closure is presentation/docs only; no new server batch authority is inferred from it.

### Worker heads at first A5 audit

| Lane | PR | Head | State at audit | A5 disposition |
|---|---:|---|---|---|
| A1 contract | #548 | `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7` | draft, 1 commit, handoff only | **DEPENDENCY — implementation not yet present** |
| A2 executor | #549 | `c8e151d90211baa1fcc828ac1f4d6082c77b9d90` | draft, 1 commit, handoff only | **DEPENDENCY — implementation not yet present** |
| A3 inventory | #550 | `fa392897377fcef00643346329482636b7c371ee` | draft, 1 commit, handoff only | **DEPENDENCY — implementation not yet present** |
| A4 BOM | #551 | `d0a366cde0472baef7d8cbdea68862be4ab8c8cb` | draft, 1 commit, handoff only | **DEPENDENCY — implementation not yet present** |
| A5 QA | #552 | `d67632285dd9be2f0a41d7b00e2a2b46592f450e` before this evidence commit | draft | baseline/evidence work proceeds independently |

A5 therefore must **not** construct or claim a final convergence candidate yet. The NO-STOP rule still requires A5 to complete every independent audit and validation artifact now.

## 3. Current platform evidence to preserve

### 3.1 AppAction repeatable input seam

Current server/tooling already has a first-class repeatable input-table seam:

- `server/packages/app-registry/src/action-input-table.ts`
  - `AppActionInputTable` / column contract;
  - fail-closed parser;
  - field-name uniqueness;
  - supported control allowlist;
  - Link target validation;
  - 64-column and 500-row bounds;
  - legacy `BulkTransaction:<json>` decoder.
- `server/packages/app-registry/src/action-input-table-compat.ts`
  - lowers first-class `input_tables` to the legacy storage/wire compatibility field;
  - decorates installed actions back to first-class metadata;
  - clones instead of mutating the source package;
  - delegates canonical manifest validation/install authority to the existing parser/installer.

A1 must extend this architecture rather than replacing it with another manifest parser or vertical-specific contract.

### 3.2 Inventory authority

`StockReconciliationIntegrityController` remains domain authority for Stock Reconciliation integrity and delegates normal posting to the canonical controller/stock ledger path. Existing evidence includes:

- immutable reconciliation snapshot envelope after freeze;
- `(item_code, batch_no)` identity and duplicate/ambiguous-row guards;
- warehouse/company leaf-scope validation;
- explicit reversal authorization / separation-of-duties;
- accounting-period reversal guard;
- exact stock-ledger reversal and serial/batch-bundle usage reversal.

Transaction Closure explicitly keeps `stock_ledger_entries` as the only authoritative quantity/value movement source. A3 must adapt the shared batch primitive to this path; it must not create direct stock writes or a second reconciliation ledger.

Historical PR #267 remains **selective contract evidence only**, not a branch to merge wholesale. Its useful semantics are frozen snapshot, one canonical Stock Reconciliation draft, full row coverage and idempotent/OCC intent. Its shared-kernel preview changes remain non-canonical.

### 3.3 Manufacturing / BOM authority

Current main already has a bounded BOM bulk seam:

- `server/packages/clouderp-erpnext/src/manufacturing-bom-bulk.ts` builds a canonical BOM Draft shape, caps rows at 500, uses fixed-point normalization, produces a stable fingerprint and provides a pure preview.
- `server/apps/tenant-worker/src/manufacturing-bom-bulk-api.ts` enforces server-side create/read permission, rejects client tenant selectors, performs replay matching, and delegates the write to the ordinary canonical BOM resource path.

Important existing invariants:

- preview is pure;
- create is Draft-only;
- same business revision + same canonical payload may replay to the existing Draft;
- same revision with different payload/lifecycle fails closed;
- trusted tenant comes from server context;
- no Stock/GL posting is introduced by the bulk BOM seam.

A4 should consume/refactor this proven domain seam behind A1/A2 rather than create a second BOM batch implementation.

## 4. External dependency #542 — exact executable truth

Delivery PR #542 (`platform/ws09-appaction-input-table-native-20260804`) is still **open, draft, unmerged** at head `c8d2fa535ad39e683c2ceb6b4b6819d0f3df6cfc`.

The earlier prose saying no workflow run was observable is stale. GitHub now exposes:

- workflow: **WS09 AppAction Input Table Validation**;
- run: `30850149684`;
- job: `91807894696` (`validate`);
- result: **FAILURE**.

Step truth:

| Step | Result |
|---|---|
| checkout exact PR merge result | PASS |
| Node 22 setup | PASS |
| pnpm enable | PASS |
| locked dependency install | PASS |
| `@metaforge/core` typecheck | PASS |
| `@metaforge/views test:action-input-table` | **FAIL** |
| runtime production build | SKIPPED |

The failing `views` step stops during `tsc -b` before the targeted Node test executes. Reported errors are unresolved `@metaforge/charts` / `@metaforge/visual` declarations in existing dashboard/overview sources plus resulting implicit-any errors. Therefore:

- #542 is **NOT validated**;
- its targeted input-table regression is **NOT proven executed** by this run;
- the run does prove locked installation and core typecheck;
- this failure must not be rewritten as a batch-contract failure without a changed-source classification;
- A5 will not edit the WS14/client ownership surface to make this green.

### Dependency Request A5-DR-01 -> #542 / WS14 validation owner

**Need:** rerun the native input-table delivery gate with the required workspace dependency graph built/resolved before `@metaforge/views` typecheck, then execute `test:action-input-table` and runtime production build on the exact delivery head/merge candidate.

**Blocking:** yes for integrating #542 into final WS09 productization convergence; no for server-only A1-A4 contract/executor/domain evidence.

## 5. Ownership / duplicate-authority checklist

Every final A1-A4 exact diff must satisfy this checklist.

### A1 — canonical shared contract

Allowed:

- shared App Factory / app-registry metadata types and parsers;
- compiler/brief normalization and round-trip fixtures;
- generic BatchAction / BatchTransaction metadata/result declarations.

Reject / route back if A1 contains:

- `Stock Reconciliation`, warehouse, valuation, stock-ledger rules;
- BOM revision/costing/manufacturing business rules;
- generic execution engine beyond the minimum type/interface seam;
- client native renderer changes copied from #542;
- a second independent manifest parser instead of extending/reusing canonical validation.

### A2 — generic executor

Allowed:

- vertical-neutral orchestration;
- trusted context propagation;
- idempotency/replay guard;
- declared atomicity implementation;
- deterministic result ordering/envelope;
- audit correlation;
- generic failure/retry fixtures.

Reject / route back if A2 contains:

- Stock/BOM field names or lifecycle rules;
- direct stock/GL/BOM persistence;
- client-trusted tenant/user/role authority;
- a public contract that competes with A1;
- claimed all-or-nothing semantics without a real persistence/rollback boundary.

### A3 — Inventory consumer

Allowed:

- Stock Reconciliation adapter/declaration;
- mapping generic rows to canonical Stock Reconciliation data;
- domain preview using stock-owned calculations with zero authoritative writes;
- commit through existing document/controller/stock authority;
- inventory-specific permission, warehouse, reconciliation and correction tests.

Reject / route back if A3 contains:

- edits defining generic batch semantics owned by A1/A2;
- direct `stock_ledger_entries` writes outside canonical controller/ledger path;
- valuation/correction rule changes merely to fit batch UX;
- a duplicate cycle-count/reconciliation ledger.

### A4 — Manufacturing/BOM consumer

Allowed:

- adapter/declaration around existing `manufacturing-bom-bulk` behavior;
- parent/child/version mapping;
- pure preview and canonical Draft create/replay integration;
- BOM permission/version/collision/correction regressions.

Reject / route back if A4 contains:

- a competing shared batch primitive;
- silent active BOM/version overwrite;
- Stock/GL/cost posting not already required by canonical BOM authority;
- duplicate BOM bulk logic when the current bounded seam can be reused/refactored.

### #542 — client dependency

Allowed ownership is client core/views presentation/transport only. No server business authority should move into the client adapter.

## 6. Required cross-consumer validation matrix

Final convergence must record exact command, run/job, tested head and outcome for every applicable row. `NOT RUN` / `UNPROVEN` is acceptable evidence truth; it is not PASS.

| Gate | A1 | A2 | A3 Stock | A4 BOM | Final combined |
|---|---:|---:|---:|---:|---:|
| canonical contract parses / normalizes deterministically | REQUIRED | consume | consume | consume | REQUIRED |
| old AppAction / legacy input-table compatibility | REQUIRED | N/A | N/A | N/A | REQUIRED |
| source manifest/package not mutated | REQUIRED | N/A | N/A | N/A | REQUIRED |
| no vertical names in generic primitive | REQUIRED | REQUIRED | N/A | N/A | REQUIRED |
| bounded rows/payload | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| preview performs zero authoritative write | contract | REQUIRED | **CRITICAL** | REQUIRED | **CRITICAL** |
| deterministic item ordering/result correlation | contract | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| all-or-nothing semantics proven if declared | contract | **CRITICAL** | **CRITICAL** | as used | **CRITICAL** |
| independent-item semantics explicit if declared | contract | REQUIRED | as used | as used | REQUIRED |
| same idempotency key cannot duplicate commit | contract | **CRITICAL** | **CRITICAL** | REQUIRED | **CRITICAL** |
| retry after ambiguous transport failure deterministic | contract | **CRITICAL** | **CRITICAL** | REQUIRED | **CRITICAL** |
| audit correlation batch -> item -> domain op | contract | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| tenant context ignores/rejects client selector | contract | **CRITICAL** | **CRITICAL** | REQUIRED | **CRITICAL** |
| permission remains server-authoritative | contract | REQUIRED | **CRITICAL** | REQUIRED | **CRITICAL** |
| domain validation remains authoritative | N/A | REQUIRED | **CRITICAL** | REQUIRED | **CRITICAL** |
| positive/negative/zero reconciliation variance | N/A | N/A | **CRITICAL** | N/A | **CRITICAL** |
| reconciliation cancel/exact reversal | N/A | N/A | **CRITICAL** | N/A | **CRITICAL** |
| warehouse/company/tenant isolation | N/A | trusted context | **CRITICAL** | REQUIRED | **CRITICAL** |
| BOM parent + child + revision happy path | N/A | N/A | N/A | REQUIRED | REQUIRED |
| duplicate/different-payload revision collision | N/A | N/A | N/A | REQUIRED | REQUIRED |
| BOM preview fingerprint deterministic | N/A | N/A | N/A | REQUIRED | REQUIRED |
| canonical BOM Draft replay | N/A | N/A | N/A | REQUIRED | REQUIRED |
| migration replay | if migration | if migration | if migration | if migration | REQUIRED if any |
| package/typecheck/build gates | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| #542 native input-table client regression | external | external | external | external | REQUIRED before UI integration |
| runtime production dependency-graph build | external | external | external | external | REQUIRED before #542 integration |

## 7. Exact CI / executable proof pattern

### Worker candidate proof

For each A1-A4 head:

1. record exact head SHA and merge-base against `program/ws09-batch-productization-20260804`;
2. list changed files and classify authority/risk;
3. run the smallest locked-dependency job that builds the changed package dependency graph;
4. run targeted tests for changed authority;
5. record any full-repo baseline failure separately from changed-source failure;
6. record migrations and replay if any;
7. retain run ID + job ID + exact tested SHA in this document or worker completion record.

### Final convergence proof

The final candidate must be a new exact convergence head built only after accepted A1, then A2, then A3/A4 are replayed/combined in program order.

Minimum combined evidence:

- shared contract tests;
- executor success/failure/atomicity/idempotency/retry/tenant tests;
- Stock Reconciliation preview/commit/reversal/reconciliation tests;
- BOM preview/create/replay/version-collision tests;
- app-registry package gate;
- affected ERPNext/domain package gate;
- affected tenant-worker typecheck/build/test gate;
- migration replay if a migration is introduced;
- exact diff authority audit against current `main` immediately before convergence recommendation.

Temporary validation workflows may be used for evidence but must not be confused with production deploy workflows.

## 8. Baseline compatibility matrix

| Existing seam | Current state | Convergence requirement |
|---|---|---|
| server `AppAction.input_tables` | Wired server/tooling with legacy bridge | A1 extends/reuses; no replacement parser |
| legacy `BulkTransaction:<json>` | compatibility transport remains | old packages remain valid during rolling upgrade |
| client native input-table #542 | implemented but validation failed | remain external until exact green gate |
| Stock Reconciliation authority | canonical controller + Stock Ledger + exact reversal | A3 only adapts; no new ledger/valuation authority |
| historical bulk Stock Reconciliation #267 | selective semantics only | no whole-PR transplant |
| BOM bulk domain seam | pure preview + canonical Draft create/replay | A4 reuses/adapts rather than duplicates |
| BOM lifecycle/version authority | existing manufacturing controller | A4 cannot silently overwrite history |
| kernel mutation idempotency | existing canonical write primitive/evidence | A2 may compose but must not create conflicting write authority |

## 9. Capability IDs and maturity baseline

A5 uses the canonical capability-status baseline conservatively. Current relevant status is:

| Capability | Baseline maturity | A5 recommendation now |
|---|---|---|
| `B02-016` Action builder | Wired | **no promotion** |
| `W01-011` Stock Reconciliation | Wired | **no promotion** |
| `W02-009` Cycle count | Wired | **no promotion** |
| `W02-014` Inventory count freeze/snapshot | Wired | **no promotion** |
| `M01-001..M01-005` BOM parent/child/multi-level/version/effective behavior | Wired in canonical capability-status baseline | **no promotion** |

WS05/Transaction Closure contain stronger RC-candidate evidence for some manufacturing paths, but this A5 program must not promote the canonical registry until the batch-specific shared executor/consumer convergence is executed on an exact candidate.

No new capability ID is invented here. If A1 concludes that reusable batch execution requires a distinct permanent capability identifier rather than being evidence under `B02-016`, that capability-map change belongs to the shared contract owner and must be reviewed before convergence.

## 10. Current blocker / continuation state

### Blocking final convergence

1. A1 implementation head absent at first audit.
2. A2 implementation head absent at first audit.
3. A3 implementation head absent at first audit.
4. A4 implementation head absent at first audit.
5. #542 native client gate is red/unproven for `views` regression + runtime build.

### Independent A5 work completed despite blockers

- exact main/program/worker baseline recorded;
- current AppAction/input-table evidence audited;
- Inventory and BOM authority baselines audited;
- #542 executable status corrected from stale prose to exact failed run/job truth;
- ownership/duplicate-primitive checklist defined;
- cross-consumer validation matrix defined;
- CI/evidence pattern defined;
- affected capability IDs and conservative maturity baseline recorded.

## 11. Final convergence procedure when candidate heads arrive

1. Re-fetch exact A1-A4 PR heads; reject stale assumptions.
2. Diff every head against the shared program baseline and against each other for ownership overlap.
3. Accept A1 contract first; reject vertical/business authority leakage.
4. Verify A2 consumes that exact A1 contract and does not define a second public contract.
5. Verify A3 and A4 consume the same exact executor/contract revision.
6. Route substantive owner defects back through Dependency Request; do not patch Stock/BOM semantics in A5.
7. Construct a single replay/convergence candidate only from accepted heads.
8. Audit current `main` drift immediately before validation.
9. Run the combined matrix and record exact run/job/head evidence.
10. Recommend maturity changes only from executed evidence.
11. **Do not merge/deploy program output from A5.**

## 12. Completion record — baseline phase

Baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`  
Main audited: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`  
A1 head/PR: `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7` / #548 — bootstrap only at audit  
A2 head/PR: `c8e151d90211baa1fcc828ac1f4d6082c77b9d90` / #549 — bootstrap only at audit  
A3 head/PR: `fa392897377fcef00643346329482636b7c371ee` / #550 — bootstrap only at audit  
A4 head/PR: `d0a366cde0472baef7d8cbdea68862be4ab8c8cb` / #551 — bootstrap only at audit  
#542 status: draft/unmerged; run `30850149684`, job `91807894696` **FAIL** at views typecheck; targeted test not proven executed; runtime build skipped  
Convergence head/PR: **NOT YET — upstream candidate heads absent**  
Validation runs/jobs: #542 external run above only; no A1-A4 implementation run exists at baseline  
Tests executed by A5: no repository test execution claimed; static exact-source/PR/workflow audit only  
Tests not executed: final shared contract/executor/Stock/BOM combined matrix; migration replay if future migrations exist  
Migrations: none introduced by A5 baseline evidence  
Authority diff audit: baseline PASS for documentation-only A5 delta; final program authority audit pending upstream heads  
Recommended maturity changes: **none**  
Production deployment: **NO**
