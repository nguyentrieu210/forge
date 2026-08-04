# RC4-A13 — Manufacturing / QMS Progress

Status: VALIDATION PR READY — MERGE/DEPLOY APPROVAL REQUIRED  
Branch: `agent/rc4-13-manufacturing-qms`  
Baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: CRITICAL  
Date: 2026-08-04

## 1. Exact-state audit

A13 started from exact current `main` and retained the existing canonical Manufacturing/QMS authority chain. No new stock, costing, WIP or GL ledger is introduced.

Current main already contains strong manufacturing transaction-closure evidence:

- versioned/effective BOM and immutable Work Order BOM snapshot;
- partial manufacture, retry/idempotency, short/excess material guards and exact cancellation/correction;
- canonical Stock Entry / Stock Ledger authority;
- backdated manufacturing valuation audit;
- recovery-aware read-only manufacturing cost/variance decomposition;
- MRP, capacity, genealogy and actor-visible QMS APIs;
- first-party `manufacturing-qms` metadata package.

The previous Manufacturing closure recorded 56/56 focused tests passing on its exact tested head. A13 does not re-implement those primitives; it re-validates them on the RC4 head together with QMS lifecycle evidence.

## 2. A13 independent work completed

### 2.1 Cross-lifecycle QMS release-confidence regression

Added:

- `server/tests/rc4-a13-manufacturing-qms-release-confidence.test.mjs`

The new regression composes existing authoritative controllers and pins these invariants:

1. Quality Plan deterministically evaluates Numeric, Pass/Fail and Text parameters.
2. A persisted numeric Quality Inspection can reject a reading outside tolerance.
3. A rejected Quality Inspection can source an NCR.
4. A submitted NCR can source RCA.
5. CAPA closes only after implementation + Effective verification + closure evidence.
6. Submitted CAPA blocks cancellation of its NCR and RCA parents.
7. The current persisted Quality Inspection qualitative-reading gap is explicitly fail-closed rather than silently treated as supported.

This test is intentionally evidence-oriented. It does not bypass the document kernel, mutate stock/GL authority, or invent a second QMS ledger.

### 2.2 Exact-head RC4 validation workflow

Added:

- `.github/workflows/rc4-a13-manufacturing-qms.yml`

The workflow runs only for PRs from `agent/rc4-13-manufacturing-qms` and validates:

- locked dependency install;
- exact-head server dist emission while recording known full-server TypeScript baseline debt transparently;
- manufacturing transaction closure, costing, genealogy, MRP/netting and capacity regressions;
- QMS lifecycle/API/sampling regressions plus the new A13 cross-lifecycle regression;
- first-party metadata verification and `manufacturing-qms` package check.

No production deploy step exists in this workflow.

## 3. Capability evidence assessment

### Strongly revalidated by A13 gate when green

- `M01-001..M01-005`: BOM/version/effective-date authority already RC by current capability status.
- `M03-001`, `M03-003..M03-008`: Work Order and guarded production/correction paths already RC.
- `M04-001..M04-003`: manufacturing material/labor/machine evidence remains Wired; A13 does not claim posted costing.
- `Q01-001..Q01-010`: current status Wired; A13 adds one cross-lifecycle executable chain.
- `Q01-011`, `Q01-012`: preventive/CAPA implementation exists, but promotion above current status should wait for exact-head green evidence and convergence review.
- `Q01-015`, `Q01-016`: calibration/KPI implementation exists; A13 gate re-runs their targeted evidence.

No capability is promoted to Hardened from branch-local source presence alone.

## 4. Explicit residuals / Dependency Requests

### DR-A13-QI-01 — Persisted qualitative Quality Inspection contract

`Quality Plan` supports Numeric / Pass-Fail / Text evaluation, but the shared persisted `Quality Inspection` reading contract still requires numeric `value`. A13 pins this boundary fail-closed.

Required closure before claiming persisted qualitative inspection parity:

- widen shared Quality Inspection reading metadata/data contract for Pass-Fail and Text;
- preserve backward compatibility for numeric rows;
- deterministic acceptance semantics;
- generic UI metadata for qualitative readings;
- regression for create/submit/cancel, permissions and plan-driven persistence.

A13 does not silently encode qualitative values into numeric fields.

### DR-A13-REWORK-01 — Rework operating model decision

Still blocked by genuine product policy: rejected-FG input vs original Work Order reference vs dedicated rework BOM/routing vs incremental-only rework. No safe repo-derived universal choice exists.

### DR-A13-SUBCONTRACT-01 — Procurement / stock integration

Subcontracting requires supplier procurement, material-send/return and valuation contracts. A13 will not create a competing procurement or stock path.

### DR-A13-FIN-01 — Posted manufacturing operation cost / variance / period accounting

Actual material/FG evidence is canonical Stock Ledger-derived. Posted labor/machine/overhead and manufacturing variance require the Finance/period/GL authority owned outside A13. Current cost evidence remains explicitly read-only / `NOT_POSTED`.

### DR-A13-STOCK-01 — Backdated valuation repost completion

Manufacturing participates in canonical stock history and can detect stale outgoing valuation after backdated movement. Execution/reconciliation of the canonical repost remains the Inventory authority; A13 does not add a manufacturing-local repost engine.

### DR-A13-TRACE-01 — Finished good to customer genealogy

Raw-to-FG genealogy is available at Work Order group scope. FG-to-customer closure requires Selling/Delivery identity and permission boundaries.

## 5. Blast radius

- Backend business behavior changed: **no**.
- Schema/migration changed: **no**.
- Stock/GL authority changed: **no**.
- Production data mutation: **no**.
- New tests/workflow/evidence only: **yes**.
- Merge/deploy: **not performed**.

Even though this delta is validation-only, A13 is a CRITICAL manufacturing/QMS release-confidence workstream and remains PR-gated. Stop before merge/deploy until explicit approval.
