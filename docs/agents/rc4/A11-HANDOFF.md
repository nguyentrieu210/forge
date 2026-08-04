# RC4-A11 — Procurement / P2P

Status: READY
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-11-procurement-p2p
PR: #600
Risk: STANDARD/CRITICAL
Merge/deploy: NOT PERFORMED — non-UI approval required

## Mission

Close source-to-pay residuals around supplier lifecycle, RFQ/quote comparison, PO/Purchase Invoice commercial contract, 3-way match, landed-cost handoff, returns/corrections and procurement reporting while preserving the existing Transaction Closure P2P authority.

## Exact-state audit

Current `main` already contains the canonical Transaction Closure Procurement/P2P implementation merged through PR #519. A11 therefore does not rebuild or fork:

- RFQ / Supplier Quotation integrity;
- quotation comparison + Supplier Selection;
- PO-vs-quotation commercial checks;
- partial Purchase Receipt / partial Purchase Invoice progress;
- Purchase Invoice three-way match, quantity/price tolerance and pre-posting Hold;
- multi-PO Purchase Invoice;
- AP/Payment Ledger/GL authority;
- Stock Return vs Debit Note correction boundary;
- landed-cost allocation planning;
- supplier price history and spend analytics.

The residual found on exact A11 baseline was supplier-governance cancellation integrity:

1. Supplier Qualification / Supplier Contract / Supplier Rating required Purchase Manager on submit but not on cancel.
2. Supplier Contract could be cancelled while a submitted Purchase Order still referenced it, unlike Supplier Selection which already protected downstream submitted POs.

## Implementation

Changed `server/packages/clouderp-core/src/supplier-lifecycle-controllers.ts`:

- supplier lifecycle `cancel` now requires Purchase Manager / System Manager / Administrator;
- Supplier Contract cancel scans tenant-scoped Purchase Orders and fails closed while any submitted PO references the contract;
- no schema/migration, AP ledger, Stock Ledger, valuation, payment or UI authority added.

Added `server/tests/procurement-rc4-supplier-lifecycle-permissions.test.mjs` covering:

- Purchase User cannot cancel submitted Supplier Qualification;
- Purchase User cannot cancel submitted Supplier Rating;
- Purchase Manager can perform the governed cancellation;
- submitted PO blocks Supplier Contract cancellation;
- after PO cancellation, Supplier Contract cancellation succeeds.

## Verification

Exact candidate `9affaebb19fa324acbb42c6c7e31ce79d15257a0`:

- GitHub Actions run `30868233834`: SUCCESS;
- job `91864577582` — `RC4 A11 Procurement CRITICAL gate`: SUCCESS;
- changed-zone TypeScript gate: PASS;
- supplier lifecycle + RFQ/selection/contract + procurement analytics + P2P/landed-cost + ERP regressions: PASS;
- procurement metadata package gate: PASS;
- scope/authority audit: PASS;
- no `server/migrations/**` or `client/**` delta.

The temporary validation workflow is PR evidence only and must be removed before merge. Removing that workflow does not alter the verified server/test blobs.

## Dependency Requests

### DR-RC4-A11-01 -> A12 Inventory / valuation

Need: authoritative Inventory-owned command/controller that consumes approved landed-cost allocations and applies/reverses Stock Ledger valuation with Stock/GL reconciliation.

A11 action: retains the existing side-effect-free Procurement landed-cost planner; no competing valuation path created.

Blocking: yes for `P01-016 Landed Cost` full end-to-end RC/Hardened claim; no for this A11 supplier-governance hardening.

### DR-RC4-A11-02 -> A9 kernel / Purchase Allocation

Need: row-level Purchase Invoice allocation against `purchase_order_item_row_id` for ambiguous duplicate same-item PO rows with different approved prices.

A11 action: retains current canonical PO+item aggregate compatibility behavior; does not invent a second invoice-allocation ledger.

Blocking: yes before Hardened parity for ambiguous same-item split-price PO matching; no for normal current P2P flows or this hardening slice.

## Maturity / release recommendation

This pass strengthens cancellation/permission evidence for supplier lifecycle and preserves the already-validated Transaction Closure P2P authority. It does not claim global Procurement Hardened status and does not promote cross-owner landed-cost or ambiguous row-allocation gaps.

Because this is a non-UI business-rule change, PR #600 must stop before merge/deploy until explicit user approval.
