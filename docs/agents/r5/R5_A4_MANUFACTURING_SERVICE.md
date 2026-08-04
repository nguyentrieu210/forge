# R5-04 — Manufacturing + Service

Status: **PR VALIDATION PENDING — NON-UI MERGE/DEPLOY APPROVAL REQUIRED**  
Date: **2026-08-04**  
Branch: `agent/r5-04-manufacturing-service`  
Baseline: `main@30346e08eabb7074f8623eeedae09efec25da072`  
Risk: **CRITICAL validation/evidence** at stock/cost/warranty boundaries

## 1. Mission and authority boundary

R5-04 proves the integrated Manufacturing/MRP/QMS + Service/Warranty paths used by the Alumdoor reference pilot without reopening broad feature work.

Canonical authorities are preserved:

- BOM / Production Plan / Work Order / Job Card: Manufacturing;
- material issue / transfer / finished-goods receipt / valuation: canonical Stock Entry + Stock Ledger;
- GL / posted operation cost / manufacturing variance: Finance;
- Delivery: Selling / Delivery Note + Stock Ledger;
- Warranty Claim / Service Order: WS07 Maintenance;
- Alumdoor: reference consumer only, not a fork of those authorities.

No second stock ledger, costing ledger, service billing ledger, migration, schema or production mutation is introduced by R5-04.

## 2. Exact-main audit result

R5-04 started from exact `main@30346e08eabb7074f8623eeedae09efec25da072`, the RC4 post-integration closure head.

The audit found the following already integrated and canonical:

### Manufacturing / MRP / QMS

- Transaction Closure Manufacturing: BOM/version/effective selection, immutable Work Order BOM snapshot, partial manufacture, retry/idempotency, short/excess material guards, exact cancel/correction, backdated valuation audit and recovery-aware read-only costing.
- WS05: multi-level gross MRP, Material Request Draft conversion, bounded on-hand-not-ATP preview, routing/capacity/downtime, canonical genealogy, Manufacturing/QMS metadata and QMS lifecycle APIs.
- RC4-A13 PR #603 is merged; it added exact-head release-confidence coverage and retained genuine gaps instead of inventing rework/subcontract/cost posting rules.

### Project / Service / Warranty

- Transaction Closure Warranty/Service: exact Delivery Note / Serial No provenance, duplicate/correction lineage, reciprocal Warranty Claim <-> Service Order closure, Stock Entry evidence for parts/returns/replacement, Sales Invoice evidence for billable service.
- RC4-A14 PR #613 is merged; maintenance package is `1.5.1` and server-side lifecycle validation is hardened without replacing stock/finance authority.
- RC4-A18 exact-release Alumdoor evidence is integrated: delivery-only Warranty Claim lookup uses the exact linked Delivery Note and unrelated deliveries are excluded.

### Alumdoor reference lineage

The existing read-only Golden Order verifier already requires:

`Sales Order -> Production Request -> Work Order -> sales_order_row_id -> Delivery Note -> Stock Ledger -> Sales Invoice -> Payment Entry -> Accounts Receivable -> optional Warranty Claim`.

That means R5-04 does not need a new production orchestration primitive merely to prove the pilot lineage.

## 3. Residual decision

No new runtime defect was established strongly enough on exact main to justify changing authoritative Manufacturing, Stock, Finance or Service behavior.

R5-04 therefore performs an **integration-confidence closure**:

1. add a focused regression that joins existing Alumdoor manufacturing/delivery lineage with exact Warranty -> Service reciprocal validation;
2. add an exact-head workflow that executes the existing Manufacturing/QMS, Warranty/Service, Alumdoor Golden Order and cross-ledger regression families together;
3. keep all unresolved shared/business-policy gaps explicit instead of patching them locally.

Artifacts:

- `server/tests/r5-04-manufacturing-service-integration.test.mjs`;
- `.github/workflows/r5-04-manufacturing-service.yml`;
- this handoff.

## 4. New integrated R5-04 regression

`server/tests/r5-04-manufacturing-service-integration.test.mjs` pins three cross-domain invariants:

1. **Happy lineage**: one exact Sales Order row is represented by Production Request -> Work Order -> delivered `sales_order_row_id` -> Delivery Note -> Stock Ledger -> Warranty Claim, then the WS07 validator accepts the reciprocal Service Order for that same delivery/customer/item/serial.
2. **Delivery provenance fail-closed**: Warranty/Service cannot switch the Maintenance Request to an unrelated Delivery Note while claiming closure against the delivered source.
3. **Reciprocal service fail-closed**: a Service Order pointing at another Warranty Claim cannot close the target claim.

The test consumes existing authorities; it does not create a second implementation of them.

## 5. Exact-head validation gate

`.github/workflows/r5-04-manufacturing-service.yml` is branch-scoped to `agent/r5-04-manufacturing-service` and contains no deploy step.

The gate runs:

### Manufacturing transaction / planning / costing

- Alumdoor manufacturing lifecycle;
- transaction-closure manufacture/cancel/retry/backdate;
- issue-line identity and output-UOM scaling;
- read-only cost evidence + API permission boundary;
- genealogy + actor-visible API;
- multi-level MRP + API;
- on-hand-not-ATP netting + fail-closed API;
- capacity planning + API.

### QMS

- QMS lifecycle;
- QMS API;
- sampling;
- RC4-A13 cross-lifecycle release-confidence regression.

### Warranty / service / reference vertical

- maintenance package regression;
- transaction-closure warranty/service;
- reciprocal warranty linkage;
- RC4-A14 failure/correction regression;
- Alumdoor Golden Order read-only regression;
- new R5-04 integrated lineage regression.

### Reconciliation / package integrity

- RC4 cross-ledger reconciliation auditor compile + `--self-test`;
- `manufacturing-qms` package check;
- `maintenance` package check;
- exact PR-head assertion + diff hygiene.

The workflow emits server `dist` even if the known repository-wide TypeScript baseline is non-zero, then executes exact emitted code. A non-zero global baseline must remain visible and is not represented as a global TypeScript PASS.

## 6. Pilot-scope readiness matrix

| Pilot concern | Current evidence on baseline | R5-04 disposition |
|---|---|---|
| BOM parent/child/version/effective | `M01-001..005` RC | READY for selected pilot flow |
| Routing / operation / workstation / calendar | `M01-009..012` Wired | READY source path; no Hardened claim |
| Production Plan / MRP / material requirement | `M02-001/003/004` Wired | READY source path |
| Work Order | `M03-001` RC | READY |
| Job Card / time | `M03-002` Wired | READY for existing path |
| Issue / transfer / FG / scrap / correction | `M03-003..008` RC | READY; canonical Stock authority retained |
| Actual material / cost evidence | `M04-001..003` Wired | READY as read-only evidence, not posted Finance |
| QMS core inspection/NCR/RCA flow | `Q01-001..010` Wired | READY for supported numeric/current contract |
| CAPA / calibration / KPI depth | `Q01-011..016` Foundation | usable source depth; no promotion here |
| Sales row -> manufacture -> Delivery lineage | Alumdoor Golden Order source evidence | READY source-level |
| Delivery -> Warranty Claim | exact Delivery Note / Serial provenance | READY source-level |
| Warranty Claim -> Service Order | reciprocal WS07 closure | READY source-level |
| Parts/return/replacement evidence | submitted canonical Stock Entry/Delivery Note required | READY manual-authority path |
| Billable service evidence | submitted canonical Sales Invoice required | READY manual-authority path |
| Cross-ledger compatibility | RC4 A22 read-only auditor includes Manufacturing Stock Ledger progress | gate replays self-test |

No maturity row is promoted by R5-04 before exact-head executable evidence is green and later convergence accepts the evidence.

## 7. Explicit gaps / Dependency Requests

### DR-R5-04-01 — Persisted qualitative Quality Inspection contract

**Owner:** shared QMS/document contract + generic renderer owner.

Quality Plan can evaluate Numeric / Pass-Fail / Text, but persisted shared `Quality Inspection` reading still has a numeric-oriented contract. Do not encode qualitative results into numeric fields.

Blocks: persisted qualitative inspection parity.  
Does not block: numeric/current Alumdoor pilot QMS checkpoints.

### DR-R5-04-02 — Backdated valuation repost + stock/finance restatement

**Owner:** Inventory/valuation + Finance convergence (`R5-03` / `R5-02`).

Manufacturing can detect stale outgoing valuation after backdated movement. Canonical repost execution and downstream Finance reconciliation remain outside Manufacturing authority.

Blocks: full backdated valuation/accounting hardening.  
Does not block: normal-order manufacturing pilot path.

### DR-R5-04-03 — Posted labor/machine/overhead + manufacturing variance

**Owner:** Finance (`R5-02`) consuming Manufacturing evidence.

Current material/FG evidence is Stock Ledger-derived; posted operation cost and period/variance accounting remain Finance policy. R5-04 keeps `NOT_POSTED` semantics.

Blocks: full `M04-004..010` closure.  
Does not block: physical production and read-only cost evidence.

### DR-R5-04-04 — Rework operating model

**Owner:** product/business policy, then Manufacturing.

Repository evidence does not determine whether rework consumes rejected FG, references the original WO, uses a dedicated BOM/routing or records incremental-only work. R5-04 does not invent a universal rule.

Blocks: `M03-009`.  
Pilot disposition: outside selected base flow unless an explicit Alumdoor rework requirement is introduced.

### DR-R5-04-05 — Subcontract manufacturing

**Owner:** Procurement/Inventory (`R5-03`) + Manufacturing consumer contract.

Needs supplier, send/return material and valuation authority. No local substitute is added.

Blocks: `M03-010`.  
Pilot disposition: outside selected base flow.

### DR-R5-04-06 — Automatic service stock commands and billing/credit orchestration

**Owner:** Inventory/Commercial (`R5-03`) + Finance (`R5-02`).

Current Service closure safely requires already-submitted canonical Stock Entry / Delivery Note / Sales Invoice evidence. Automatic idempotent creation/reversal remains an owner contract, not a Service-local ledger.

Blocks: fully automatic after-sales stock/billing orchestration.  
Does not block: authoritative manual-document pilot path.

### DR-R5-04-07 — Assignment-based READ row policy

**Owner:** IAM/kernel policy owner.

WS07 mutation assignment scope is server-enforced; full confidentiality hardening still needs canonical read-row policy for assigned tasks/orders/claims.

Blocks: assignment confidentiality Hardening.  
Does not block: current tenant/DocPerm mutation-safety evidence.

### DR-R5-04-08 — Authenticated same-order production evidence

**Owner:** R6 pilot/release evidence lane.

Historical production does not prove current source. Exact-current authenticated Golden Order / Warranty-Service evidence belongs to approved R6 staging/production evidence, not R5 source convergence.

Blocks: Hardened/current-production claim.  
Does not block: R5 source candidate.

## 8. Capability truth retained

Current RC4 capability baseline remains authoritative:

- `M01-001..005` RC; `M01-009..012` Wired; `M01-006` Foundation; `M01-007/008` Missing.
- `M02-001/003/004/007..010` Wired; `M02-005/006` Foundation; `M02-002` Missing.
- `M03-001/003..008` RC; `M03-002/011/012` Wired; `M03-013/014` Foundation; `M03-009/010` Missing.
- `M04-001..003` Wired; `M04-004..007` Foundation; `M04-008..010` Missing.
- `Q01-001..010` Wired; `Q01-011..016` Foundation.
- `S02-001..004/009/012` Wired; `S02-008/010/011` Foundation; `S02-005..007/013` Missing.

R5-04 does not alter `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` before independent exact-head execution/convergence evidence.

## 9. Safety / merge boundary

R5-04 delta is validation/evidence-only but exercises CRITICAL Manufacturing/Stock/Service boundaries.

- runtime business authority change: **none**;
- schema/migration: **none**;
- stock/GL authority: **none**;
- production/customer/provider mutation: **none**;
- deploy step: **none**;
- merge/deploy: **STOP before merge/deploy pending explicit authorization**.

Final status must be updated with the exact PR head and workflow run conclusion. Authored tests alone are not PASS.
