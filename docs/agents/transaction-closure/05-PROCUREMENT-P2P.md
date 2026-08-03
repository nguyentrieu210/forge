# AGENT 05 — PROCUREMENT / SOURCE-TO-PAY CLOSURE

Status: **REVIEW / PR-READY AFTER CRITICAL GATES**
Branch: `rc/transaction-closure-05-procurement-p2p`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Merge base observed: `main@a99af64b6509477238bc9dc848e226828531b599`
Latest `main` audited during finalization: `fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`
Risk: **CRITICAL**
Merge/deploy: **NOT PERFORMED — explicit user approval required**

## Mission

Close the canonical supplier transaction lifecycle:

`Purchase Request/Material Request -> RFQ/Quotation -> approval/selection -> Purchase Order -> partial/full Purchase Receipt -> Purchase Invoice -> three-way match/variance -> Supplier Payment/Advance -> Return/Adjustment -> AP Reconciliation`

Capability focus: `P01-001..P01-020`, relevant `P02`, consume existing `F03` authority.

## Authority kept intact

1. **Purchase Order / procurement policy** owns commercial approval and match tolerance.
2. **Purchase Receipt + canonical Stock Ledger** remains physical receipt/stock authority.
3. **Purchase Invoice + Payment Ledger + GL** remains AP posting authority.
4. **Payment Entry / Payment Allocation** remains supplier payment/advance settlement authority.
5. **Stock Return** remains physical supplier-return authority.
6. **Debit Note** remains Purchase Invoice/AP correction authority.
7. **AP Supplier Statement/Reconciliation** remains Finance-owned read/control model.
8. **Landed-cost allocation math** reuses Inventory's exact fixed-point allocator; Procurement does not create a second valuation ledger.

No shadow payable, stock balance, valuation ledger or frontend-only settlement state was introduced.

## Exact-state audit

### Existing source-to-pay foundation reused

Historical merged procurement foundation PR `#347` already provides:

- RFQ / Supplier Quotation integrity;
- quotation comparison and supplier selection;
- PO-vs-quotation checks;
- Supplier Contract enforcement;
- partial Purchase Receipt linkage;
- pure deterministic `evaluateThreeWayMatch()` engine.

The material gap was not the absence of a match formula. The pure engine existed but **was not wired into authoritative Purchase Invoice submit**.

### Existing Purchase Invoice gap

Before this branch, `PurchaseInvoiceController`:

- posted canonical Expense/Tax/Supplier Payable GL;
- posted canonical Supplier Payment Ledger outstanding;
- checked PO billing only when one header `against_purchase_order` existed;
- did not use per-line `purchase_order` references;
- did not compare invoice quantity with received quantity;
- did not enforce invoice price variance against the approved PO;
- did not persist procurement match evidence.

### Existing AP/Finance authority consumed

Merged `RC-022` already proves and owns:

- partial/multiple supplier payments;
- supplier advance and later allocation;
- exact payment cancellation/reversal;
- Debit Note AP correction;
- Payment Ledger/GL AP reconciliation;
- Supplier Statement and AP reconciliation reports;
- tenant/company/report permission boundaries.

Closure 05 does **not** duplicate any of those ledgers or controllers.

### Existing Inventory authority consumed

Current Inventory authority already provides:

- canonical Purchase Receipt stock posting;
- Stock Return physical reversal path;
- fixed-point landed-cost allocator in `clouderp-stock/src/landed-cost.ts`;
- canonical valuation/repost controllers.

The stock-side landed-cost **application contract** is still missing; see Dependency Requests.

## Implementation on Closure 05

### 1. Three-way match wired into Purchase Invoice

Added:

- `server/packages/clouderp-core/src/procurement-p2p-controllers.ts`
- `server/packages/clouderp-core/src/procurement-p2p-rollout-controllers.ts`

On submitted PO, procurement freezes versioned match policy:

- `purchase_match_policy_version = 1`;
- `receipt_match_required`;
- quantity tolerance in basis points;
- price tolerance in basis points.

On Purchase Invoice submit:

1. build the existing Finance-owned Purchase Invoice plan;
2. resolve header/per-line PO references;
3. require submitted PO and matching Supplier/Company/Currency;
4. read cumulative Receipt/Billing facts from authoritative procurement progress;
5. normalize quantity to canonical stock quantity;
6. compare effective net rate per canonical stock unit;
7. execute the existing deterministic `evaluateThreeWayMatch()`;
8. **Hold before commit** on receipt/quantity/price variance;
9. only after Match, delegate the unchanged AP/GL plan to the kernel;
10. persist immutable match evidence on the Purchase Invoice document and write Billing progress.

A held invoice therefore cannot leave GL, Payment Ledger or procurement-progress side effects.

### 2. Multi-PO Purchase Invoice

Purchase Receipt already supported line-level `PurchaseItem.purchase_order`; Purchase Invoice did not.

Closure 05 now supports:

- one Purchase Invoice with lines belonging to different submitted Purchase Orders;
- per-line Billing progress against the correct PO;
- exact Billing progress reversal on Purchase Invoice cancel.

This removes the historical header-only single-PO limitation without creating a new billing ledger.

### 3. Backward-compatible match-policy cutover

Existing regression behavior allows an API-created PO to be invoiced up to approved PO quantity even when only partially received. A blanket server cutover would silently break existing integrations.

Policy:

- first-party procurement metadata sends `receipt_match_required = 1` by default;
- legacy/API PO payloads that **omit** the field retain two-way PO/Invoice behavior;
- policy is still snapshotted so future edits cannot mutate historical meaning;
- approved PO quantity remains a **hard billing ceiling**, even when quantity tolerance is non-zero.

Tolerance is therefore allowed for receipt measurement/timing, not as permission to create payable quantity above an approved PO.

### 4. Procurement metadata

Updated `server/apps-src/procurement/app.json` to version `0.2.1` with PO controls:

- `receipt_match_required`;
- `invoice_quantity_tolerance_pct`;
- `invoice_price_tolerance_pct`.

Server caps:

- quantity tolerance: max 50%;
- price tolerance: max 100%;
- all authoritative policy is snapshotted in integer basis points.

### 5. Return / AP correction boundary

Regression now proves the intended two-authority correction flow:

`Purchase Receipt -> Purchase Invoice -> Stock Return -> Debit Note`

- Stock Return reduces physical stock and leaves Purchase Invoice outstanding untouched;
- Debit Note reduces Supplier payable/outstanding and leaves stock untouched;
- cancelling Debit Note restores payable only;
- cancelling Stock Return restores stock only.

This consumes existing Inventory/Finance authority instead of making Procurement a hidden stock/AP owner.

### 6. Landed-cost procurement seam

Added:

- `server/packages/clouderp-core/src/procurement-landed-cost.ts`

`planProcurementLandedCost()`:

- accepts only submitted Purchase Receipts;
- requires common Company/Currency/currency scale;
- supports explicit `amount`, canonical `quantity`, or measured `weight` basis;
- reuses Inventory's exact largest-remainder fixed-point allocator;
- reconciles every allocated minor unit to the source total;
- returns source/allocation evidence only;
- emits **no Stock Ledger and no GL**.

This closes Procurement-owned orchestration without stealing Inventory-owned valuation authority.

## Regression source added

- `server/tests/procurement-p2p-closure.test.mjs`
  - PO match-policy snapshot;
  - invoice-before-receipt Hold;
  - cumulative partial receipt/invoice;
  - exact Billing progress reversal;
  - price variance Hold;
  - proves held invoice leaves no document/GL/Payment Ledger/procurement progress;
  - multi-PO Purchase Invoice;
  - backward-compatible legacy API cutover;
  - hard PO billing ceiling despite tolerance.

- `server/tests/procurement-p2p-correction-boundary.test.mjs`
  - physical Purchase Return vs AP Debit Note authority separation;
  - exact independent reversals.

- `server/tests/procurement-landed-cost.test.mjs`
  - exact amount allocation;
  - canonical quantity basis;
  - measured-weight basis;
  - draft/cross-company/cross-currency fail-closed behavior;
  - explicit proof that allocation plan creates no Stock/GL authority.

- `server/tests/procurement-app-source.test.mjs`
  - procurement app version/custom-field contract.

Existing Finance/Inventory regression remains canonical evidence for supplier advance/allocation, AP reconciliation, stock return, valuation and ledger invariants.

## Required scenario status

| Scenario | Closure 05 status |
| --- | --- |
| RFQ / quotation / supplier selection / PO | Existing wired foundation retained |
| Partial Purchase Receipt | Existing authority retained + consumed by match |
| Partial/multiple Purchase Invoice | Added cumulative match/progress evidence |
| Multi-PO Purchase Invoice | Added |
| Quantity mismatch | Hold before authoritative commit |
| Price mismatch | Hold before authoritative commit |
| Supplier payment / partial payment | Consume RC-022 Finance authority |
| Supplier advance / later allocation | Consume RC-022 Finance authority |
| Purchase Return | Consume Stock Return physical authority |
| AP return correction | Consume Debit Note authority |
| AP reconciliation | Consume RC-022 Payment Ledger vs GL control |
| Landed-cost basis/allocation | Added procurement orchestration |
| Landed-cost stock-value application | **BLOCKED on Inventory contract** |
| Duplicate/retry/idempotency | Existing kernel mutation receipt/ledger keys; no new bypass introduced |
| Tenant/company isolation | Existing trusted tenant reader + explicit PO/receipt Company checks retained |
| Warehouse isolation | Existing Purchase Receipt/Stock Return inventory guards retained |

## Dependency Requests

### DR-C05-001 -> Inventory / valuation owner — authoritative landed-cost application

**Need:** one canonical Inventory-owned command/controller contract that consumes approved landed-cost allocations and applies them to Stock Ledger/valuation/repost with exact reversal and Stock/GL reconciliation.

**Current evidence:** Inventory has exact allocation math and valuation/repost primitives, but no source-document contract accepting Procurement landed-cost allocations.

**Closure 05 action completed:** source receipt validation + deterministic basis/allocation evidence only.

**Forbidden workaround:** Procurement must not write a shadow valuation ledger or directly mutate historical stock value.

**Blocking:** yes for `P01-016 Landed Cost` reaching full Wired/RC end-to-end; no for three-way match/P2P invoice closure.

### DR-C05-002 -> Purchase Allocation / kernel owner — row-level invoice allocation for ambiguous duplicate PO item pricing

**Need:** authoritative Purchase Invoice row allocation to `purchase_order_item_row_id`, symmetric with the existing Purchase Receipt allocation model, if one PO contains the same item on multiple rows with materially different approved rates.

**Current behavior:** compatibility procurement progress is PO + item aggregated. Closure 05 therefore compares an effective weighted PO rate for that aggregate rather than inventing an invoice-row ledger.

**Blocking:** no for normal one-price-per-item PO flows and current RC slice; yes before claiming Hardened parity for ambiguous same-item split-price POs.

## Main drift / convergence audit

The branch merge base is `a99af64b6509477238bc9dc848e226828531b599`.

At finalization, current `main` was `fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`. The intervening five commits modify UI V3 shell/builder/auth/data-surface/client documentation only. No `server/packages/clouderp-core`, procurement app, Finance AP or Inventory source overlap was found in that drift.

Do not rebase/churn the CRITICAL worker branch merely for cosmetic SHA freshness. Recheck exact compare immediately before merge.

## Validation status

Risk: **CRITICAL**.

Source/evidence audit completed on exact GitHub state, but this execution environment does not have a runnable Forge checkout. Therefore:

- TypeScript build: **NOT RUN**;
- targeted Node regressions: **NOT RUN**;
- full unit suite: **NOT RUN**;
- SQL suite: no migration added; **NOT RUN**;
- permission/tenant regression suite: existing authority audited, new targeted execution **NOT RUN**;
- production deploy: **NOT PERFORMED**.

Do not convert absence of a red GitHub status into a green gate.

Required PR-head gates before merge:

```bash
cd server
npm run build
node --test \
  tests/procurement-decisions.test.mjs \
  tests/procurement-app-source.test.mjs \
  tests/procurement-p2p-closure.test.mjs \
  tests/procurement-p2p-correction-boundary.test.mjs \
  tests/procurement-landed-cost.test.mjs \
  tests/erp-core.test.mjs \
  tests/erpnext-core.test.mjs
```

Then run the repository CRITICAL validation profile required by the Forge Skill, including permission/tenant isolation, failure/retry/idempotency, correction/reversal and reconciliation evidence.

## Maturity recommendation

Only after exact PR-head CRITICAL gates pass:

- recommend **RC** for the scoped P2P match/variance slice `P01-011`, `P01-013`, `P01-014`, `P01-017`, `P01-018`, `P01-019`;
- keep `P01-016 Landed Cost` at **Foundation** until DR-C05-001 closes authoritative stock-value application/reversal/reconciliation;
- do not claim Hardened for duplicate same-item split-price invoice matching until DR-C05-002 closes;
- do not promote Supplier Payment/AP capabilities from Procurement; those remain Finance-owned evidence.

## Completion record

Implemented the independent Closure 05 work, recorded cross-owner blockers, and prepared the branch for PR review. No shared Finance/Stock authority was forked. No merge or deploy was performed.
