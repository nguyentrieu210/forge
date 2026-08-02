# WS05 — Manufacturing / MRP II / QMS

Status: **ACTIVE**  
Owner: **ChatGPT-WS05**  
Branch: `agent/ent-05-manufacturing-qms`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `64af79ea0d9f3695a73f5e34678f93bcfc5c8d12`  
Claim commit: `10d830dc11f2d282ae31db47523726ca495718fe`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Nâng Manufacturing từ BOM/WO/Plan/Job Card RC thành MRP II + costing + traceability + QMS, đồng thời rút primitive generic từ Alumdoor thay vì copy logic ngành.

## Capability families

`M01-M04` và `Q01` trong capability map.

## Own

BOM version/effective date/alternate/substitute/phantom, routing/operation/workstation, MRP/demand/material planning, capacity/scheduling, WO/Job Card/WIP/scrap/rework/subcontract, manufacturing cost/variance, genealogy/traceability, quality plan/inspection/NCR/CAPA/calibration.

## Exact-state audit — 2026-08-03

### Branch vs current main

- Current `main` observed: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`.
- WS05 claim head before this audit: `10d830dc11f2d282ae31db47523726ca495718fe`.
- Merge base remains Forge 0.2.0 baseline `862636e6239c91eab657c619d8c55345ed71a6d8`.
- Current `main` drift since baseline is coordination/status/deploy-cleanup plus a tiny Alumdoor UI role change; no Manufacturing/QMS backend/schema source changed in that drift.
- Therefore this audit does not transplant operational/release-only commits into WS05. Before executable implementation, exact main must be checked again and source-relevant drift incorporated.

### Canonical manufacturing evidence already on main

- `manufacturing-lifecycle.ts` has versioned BOM revision/status/effective interval, output/row UOM normalization, deterministic checksum, self-consumption guard, overlapping-active revision guard and circular-BOM guard.
- Work Order release selects the effective BOM and captures an immutable manufacturing snapshot with BOM checksum/revision/effective interval and normalized required rows.
- `manufacturing-stock-guard.ts` enforces cumulative issue/consumption caps by BOM row, exact issue reversal on cancel, stable progress keys and scrap/offcut value conservation without creating a competing stock ledger.
- `ProductionPlanController` validates submitted BOM/item/company rows but does not perform MRP explosion, netting or capacity planning.
- `JobCardController` has authoritative Work Order linkage, cumulative completion guard and time logs, but no canonical actual-cost aggregation on current main.
- `QualityInspectionController` exists for Incoming/Outgoing/In Process inspections and readings. No current evidence found yet for full NCR/RCA/CAPA/sampling/calibration lifecycle.
- Historical Manufacturing Slice C merge `a4a966dbe57e3d25ec1b3644e91252d9731faaff` is canonical evidence for BOM/WO snapshot, partial issue/manufacture, concurrency, reversal and offcut/scrap value guards.

### Capability maturity snapshot

| Capability | Current maturity | Evidence / gap |
|---|---|---|
| `M01-001/002/004/005` BOM + child + version + effective date | **RC** | Canonical versioned BOM controller, checksum, overlap/circular guards and immutable WO snapshot. |
| `M01-003/006/007/008` multi-level / alternate / phantom / substitute | **Foundation/Missing** | Graph guard exists, but no canonical planning/explosion behavior for these semantics. |
| `M01-009..012` routing / operation / workstation / calendar | **Foundation/Wired** | Masters and Job Card references exist; capacity-calendar scheduling is not closed end-to-end. |
| `M02-001` Production Plan | **Wired** | Server-authoritative validation exists. |
| `M02-002..010` forecast / MRP / material requirement / MTO-MTS / capacity / scheduling | **Missing/Foundation** | No canonical MRP explosion/netting/finite-capacity engine found on current main. |
| `M03-001` Work Order | **RC** | Immutable BOM snapshot and quantity/UOM guards. |
| `M03-002/003` Job Card / time log | **Wired** | WO linkage, cumulative completion and time normalization exist. |
| `M03-004..008` WIP/material issue/transfer/FG/scrap | **Wired/RC by path** | Stock Entry manufacturing path, partial progress, reversal and scrap/offcut controls exist; dedicated WIP closure/reporting remains incomplete. |
| `M03-009/010` rework / subcontracting | **Missing/Foundation** | No complete canonical lifecycle evidence found. |
| `M04-001..007` manufacturing cost / standard / actual / variance | **Foundation** | Stock valuation primitives exist, but current main has no canonical `manufacturing-costing.ts`; actual-cost/variance legacy work remains unmerged. |
| `M04-008..010` genealogy / raw-to-FG / FG-to-customer | **Foundation/Wired** | Manufacturing entries and physical/batch references provide seams; full query/report closure is not yet evidenced. |
| `Q01-003/004/005/007` inspections/readings | **Wired** | Quality Inspection controller supports Incoming/Outgoing/In Process and readings. |
| `Q01-001/002/006/008..016` plan/template/sampling/NCR/RCA/CAPA/supplier/customer/calibration/KPI | **Missing/Foundation** | No authoritative end-to-end evidence found in current audit. |

No capability is promoted to Hardened by this audit.

## Legacy PR disposition

### PR #201 — actual manufacturing costing

Disposition: **CHERRY-PICK selectively; do not REUSE branch directly.**

Why:
- strong generic concepts: effective-dated Manufacturing Cost Rate, Work Order standard-cost snapshot, actual material from canonical Stock Ledger, operation cost from Job Card, standard-vs-actual variance, immutable Cost Sheet/freeze/append-only adjustment;
- branch is materially stale against current main (`behind 211` when audited) and carries migration/API/UI/sidecar integration tied to its older base;
- its own body still identifies WIP as proportional estimate and valuation-delta posting as unfinished;
- current WS05 must re-derive migration number, current permission/API seams and WS01/WS04 posting contracts before taking executable code.

Candidate reuse: costing domain calculations, immutable snapshot/fingerprint model, targeted tests and Job Card costing semantics after rebase/transplant review.

Reject direct transplant of stale migration number, unrelated shared-kernel changes, and vertical-only UI wiring as canonical WS05 source.

### PR #208 — Plastic ERP Production Run / shop floor

Disposition: **CHERRY-PICK generic concepts/tests only; keep Plastic-specific artifacts vertical.**

Why:
- valuable generic concepts: server-authoritative run lifecycle, machine/tool assignment, exclusive resource overlap, downtime, lot genealogy, exact reconciliation to canonical Work Order + Manufacture Stock Entry, reversal-before-cancel guard;
- branch is materially stale against current main (`behind 215` when audited);
- most changed artifacts are `plastic-erp` DocTypes/app metadata plus `plastic-production.ts`, so copying them into Forge Manufacturing would violate the WS05/WS17 vertical boundary;
- no competing stock ledger is a contract worth preserving.

Candidate generic extraction: production-run state/invariants, resource-overlap guard, run-to-WO/Stock Entry reconciliation and genealogy test cases. Plastic recipe/process naming and Plastic DocTypes stay vertical.

## Contract direction

1. **BOM:** revision/effective-date/checksum remains canonical; alternate/phantom/substitute must compose with this model, not create a second BOM authority.
2. **MRP:** planning is read/plan authority only until an approved conversion creates Purchase Request/Work Order; MRP must not write stock ledger.
3. **Capacity:** workstation calendar/resource availability is planning state; shop-floor execution must reconcile back to WO/Job Card and cannot silently over-complete.
4. **WIP/backflush:** all material/FG value remains in canonical stock/valuation path with explicit reversal/correction.
5. **Costing:** standard snapshot at release + actual canonical stock/Job Card sources; Cost Sheet can be immutable/auditable but must not become a competing GL/stock ledger.
6. **Traceability:** genealogy references canonical batch/serial/physical movements and production documents.
7. **QMS:** inspection -> NCR -> RCA -> corrective/preventive action must have explicit lifecycle, audit and close/reopen/correction semantics; quality rejection must not mutate stock silently.

## Dependency requests / boundaries

- **WS04:** stock availability/netting, valuation, WIP/repost/backdate and stock reconciliation contracts are dependencies for MRP/costing closure. WS05 will not change WS04 stock primitives directly.
- **WS01:** actual manufacturing variance -> GL/period posting contract must be agreed before posting any valuation/cost variance. WS05 will not direct-write GL as a workaround.
- **WS09:** existing `BulkTransaction:<json>` compatibility transport can be consumed, but first-class AppAction input-table/compiler contract remains WS09 ownership.
- **WS14:** shared shop-floor/mobile renderer remains WS14; WS05 should expose metadata/API/state, not hard-code domain schema into shared React runtime.
- **WS17:** Alumdoor/Plastic/cutting-specific process logic remains vertical; WS05 only extracts reusable invariants.

## Next implementation slice

### WS05-A — BOM parent + child/version Bulk Transaction

Reason: this is the explicit current `NEXT_TASKS.md` item for WS05 and sits before deeper MRP/costing dependencies.

Target contract:
- metadata/controller-backed bulk input for BOM parent + child rows/revision fields;
- preview validates required rows, UOM/item references and duplicate payload shape before write;
- commit creates **Draft** canonical BOM documents only; it does not submit, consume stock, create Work Orders or post ledger;
- exact retry must be idempotent; conflicting replay must fail closed;
- submitted activation still flows through existing `VersionedBillOfMaterialsController`, preserving effective-date overlap, circular BOM and checksum invariants;
- no shared `ActionScreen`/compiler modification unless WS09 accepts a dependency request;
- no Alumdoor/Plastic-specific fields in generic contract.

After WS05-A, preferred functional order remains MRP explosion/material requirement -> capacity -> WIP/shop-floor closure -> actual costing/variance -> genealogy -> NCR/CAPA.

## Risk and verification

Risk: **CRITICAL** whenever stock/costing/production mutation is touched; BOM bulk draft creation itself is **STANDARD** only if it remains draft-only and ledger-free.

Required evidence by slice:
- targeted controller/unit regression;
- permission/tenant isolation;
- idempotency/conflict replay for bulk create;
- effective-date/circular-BOM submit regression remains green;
- no stock/GL/manufacturing ledger side effects from draft-only bulk action;
- if schema/migration is introduced later: new migration number from exact current main + replay evidence;
- backend/business-rule work stops before merge/deploy for user approval.

## Phase B priority

BOM/version -> MRP/material plan -> capacity -> shop-floor completion/WIP -> cost variance -> traceability -> QMS NCR/CAPA.

## Guard

Đặc thù nhôm/cửa/cắt tối ưu giữ ở WS17; chỉ extract primitive nếu dùng chung được.

## Handoff

Workstream: WS05  
Branch: `agent/ent-05-manufacturing-qms`  
Owner: ChatGPT-WS05  
Status: ACTIVE  
Capabilities: `M01-M04`, `Q01`  
Changed zones so far: workstream evidence only  
Tests: audit only; no executable WS05 change yet  
Migration: none  
Dependency requests: WS04/WS01/WS09/WS14/WS17 boundaries recorded above  
Legacy PR disposition: #201 selective CHERRY-PICK; #208 generic-concept CHERRY-PICK only  
Known gaps: MRP/capacity, canonical actual costing, WIP closure, full genealogy queries, NCR/CAPA  
Recommended merge order: respect WS00/WS04/WS01 dependencies; draft-only WS05-A may proceed independently if it does not change shared contracts.
