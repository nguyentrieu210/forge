# WS05 — Manufacturing / MRP II / QMS

Status: **ACTIVE — WS05-A READY FOR REVIEW**  
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

- Initial audit observed `main` at `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`.
- Final WS05-A pre-PR check observed `main` at `27fb7273593d1bae1013aa7c8e03b02827eea40b`.
- Merge base remains Forge 0.2.0 baseline `862636e6239c91eab657c619d8c55345ed71a6d8`.
- WS05 branch is intentionally not rebased over coordination/release/UI-only drift. Final compare shows current main drift touches workflow cleanup, status/evidence, runtime PWA/AppShell and WS14 docs; no Manufacturing/QMS backend/schema file changed since the merge base.
- Therefore no source-relevant main transplant is required for WS05-A before review. Exact main must be checked again immediately before any approved merge.

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
| `M01-001/002/004/005` BOM + child + version + effective date | **RC** | Canonical versioned BOM controller, checksum, overlap/circular guards and immutable WO snapshot. WS05-A adds a bounded bulk Draft input seam without changing activation authority. |
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

No capability is promoted to Hardened by this slice.

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
- **WS00:** authoritative read-only controller/kernel preview is still a platform seam. WS05-A preview stays structural until a canonical `DocumentKernel.preview()`-equivalent exists on main; commit remains authoritative and fail-closed.
- **WS09:** existing `BulkTransaction:<json>` compatibility transport can be consumed, but first-class AppAction input-table/compiler contract remains WS09 ownership.
- **WS14:** current shared `ActionScreen` clamps BulkTransaction `maxRows` to **200** while WS05-A backend accepts **500** BOM rows. Raising/generalizing that renderer limit belongs to WS09/WS14; WS05 does not patch the shared runtime from this branch.
- **WS17:** Alumdoor/Plastic/cutting-specific process logic remains vertical; WS05 only extracts reusable invariants. Any vertical action sidecar wiring should be added by the owning app/workstream rather than hard-coded into generic manufacturing.

## WS05-A — BOM parent + child/version Bulk Transaction

### Implemented backend contract

Changed files:
- `server/packages/clouderp-erpnext/src/manufacturing-bom-bulk.ts`
- `server/packages/clouderp-erpnext/src/index.ts`
- `server/apps/tenant-worker/src/manufacturing-bom-bulk-api.ts`
- `server/apps/tenant-worker/src/index.ts`
- `server/tests/manufacturing-bom-bulk.test.mjs`
- `server/tests/manufacturing-bom-bulk-api.test.mjs`

Behavior:
- one request describes one BOM parent/revision plus a pasted child component table;
- max **500** backend rows;
- fixed-point decimal normalization, valid effective interval, positive quantity/revision, supported quantity basis and direct self-consumption guard happen before any write;
- `preview_bulk_bom` is pure and returns normalized Draft shape + stable SHA-256 fingerprint; it does not create a document;
- `create_bulk_bom_draft` requires BOM create + read permission, rejects client-selected tenant scope, and creates **Draft only**;
- replay lookup goes through canonical Frappe BOM list/get routes, therefore User Permission/read scope is not bypassed for convenience;
- exact sequential retry is recognized by `(company,item,revision)` plus semantic payload comparison against the controller-expanded Draft. Same payload returns the existing name with `replayed=true`; changed payload on the same revision fails closed;
- the actual write is forwarded to ordinary `POST /api/resource/Bill of Materials`, preserving existing naming series, Frappe permission, registered BOM controller, UOM normalization, checksum and kernel command path;
- no custom D1 insert, no alternate stock/manufacturing ledger, no submit, no Work Order creation, no stock/GL effects are introduced by the bulk seam;
- activation remains the ordinary submit path under `VersionedBillOfMaterialsController`, where active-overlap and circular-BOM guards remain authoritative.

### Known hardening debt

1. **Preview authority:** structural preview does not yet execute full controller master/reference validation. Invalid Item/UOM/Warehouse still fails at canonical create before the Draft is committed. A shared read-only kernel preview seam is preferable to duplicating controller logic in WS05.
2. **Concurrent first-create race:** sequential lost-response retry is idempotent, but two genuinely simultaneous first requests for the same `(company,item,revision)` are not serialized by a business-key lock. Worst current outcome is duplicate **Draft** BOMs, not ledger duplication; activation overlap guards still prevent silently activating conflicting revisions. Harden before calling this path Hardened.
3. **UI row cap:** shared BulkTransaction renderer caps at 200 rows. Backend 500-row contract is ready, but a generic 500-row Desk action needs WS09/WS14 renderer ownership.
4. **No generic action sidecar added here:** there is no reason to inject vertical Alumdoor/Plastic metadata into generic Manufacturing. API contract is available for the owning app/metadata workstream.

### Verification authored

`manufacturing-bom-bulk.test.mjs` covers:
- Draft-only parent/child normalization;
- stable revision key and fingerprint;
- canonical replay matching with controller-expanded UOM defaults;
- changed quantity/UOM conflict;
- 500 accepted / 501 rejected;
- direct self-consumption rejection;
- effective interval, quantity basis and non-positive quantity rejection.

`manufacturing-bom-bulk-api.test.mjs` covers:
- create + read permission gate;
- pure Frappe-shaped preview;
- exact replay without second write;
- conflicting same-revision payload fails closed;
- canonical Draft delegation + D1 bookmark preservation;
- tenant selector rejected before permission/lookup.

**Execution note:** tests are authored but were not executed in this environment because no usable Forge checkout/dependency tree is available locally and the attempted local clone path could not reach GitHub. Repository GitHub Actions are not being repurposed as ad-hoc development CI. Full repo build/typecheck/unit suite therefore remains required review evidence before merge.

## Next functional slice after WS05-A review

Preferred order remains:
1. MRP explosion + material requirement/netting;
2. capacity requirement + scheduling;
3. shop-floor/WIP closure;
4. actual manufacturing cost + variance using WS01/WS04 contracts;
5. genealogy query closure;
6. QMS NCR/RCA/CAPA.

## Risk and merge/deploy rule

- WS05-A is backend/business behavior, even though it is Draft-only and ledger-free.
- No migration/schema change.
- No deploy performed.
- Per project protocol: open PR, review evidence, then **STOP before merge/deploy until explicit user approval**.

## Guard

Đặc thù nhôm/cửa/cắt tối ưu giữ ở WS17; chỉ extract primitive nếu dùng chung được.

## Handoff

Workstream: WS05  
Branch: `agent/ent-05-manufacturing-qms`  
Owner: ChatGPT-WS05  
Status: ACTIVE — WS05-A READY FOR REVIEW  
Capabilities: `M01-M04`, `Q01`  
Changed zones: workstream evidence + clouderp-erpnext BOM bulk domain + tenant-worker bounded API + targeted tests  
Tests: 13 targeted regression cases authored; **not executed locally**  
Migration: none  
Ledger effect: none from WS05-A; canonical BOM controller ledger is empty and bulk creates Draft only  
Dependency requests: WS00 read-only preview; WS09/WS14 first-class/500-row BulkTransaction UI; WS04/WS01 later MRP/costing; WS17 vertical sidecar boundary  
Legacy PR disposition: #201 selective CHERRY-PICK; #208 generic-concept CHERRY-PICK only  
Known WS05-A gaps: preview reference authority, simultaneous first-create business-key lock, generic UI action wiring  
Known broader gaps: MRP/capacity, canonical actual costing, WIP closure, full genealogy queries, NCR/CAPA  
Merge/deploy: **not authorized yet**; PR/review only.
