# Dependency Request — Alumdoor Item pricing detail tab

Date: 2026-08-07
Requester: Alumdoor procurement / pricing UX candidate
PR: #784
Risk: STANDARD + NEW_CANDIDATE

## Owner

UI01 / META + UI02 / RUNTIME convergence owner.

## Need

Provide a generic, app-scoped detail-tab/view extension for an existing external DocType so an installed app can attach a named business view to `Item` without adding `if (doctype === "Item")` or an Alumdoor method literal to shared React routing.

The extension needs to support, at minimum:

- a stable tab key + translated label;
- explicit permission boundary;
- binding to the current document identity;
- a generic named projection/action or other already-approved runtime surface;
- deterministic mobile behavior;
- fail-closed behavior when the app/view provider is unavailable.

For the pricing side, prefer the existing pricing authority / Matrix convergence path instead of creating another client-owned Item Price mutation implementation.

## Why

Forge North Star requires App Factory / vertical apps to add behavior without forking runtime. UI02 explicitly forbids business-name routing in shared runtime, and UI03 records the current direct React Item Price mutation flow as debt to be moved behind pricing-domain projection/actions.

The current PR prototype proves the requested Item UX, but wiring it through `DoctypeWorkspace` with an `Item` special case is not acceptable as the final shared-runtime contract.

## Blocked scope

Only the final merge-ready implementation of:

`Mặt hàng -> tab Giá -> existing sales-price manager + purchase-price history`

The requested purchase-history read model itself is independent and already implemented without a new ledger/schema.

## Can continue independently

Yes.

Independent work completed in PR #784:

- company-scoped canonical purchase-price history read model;
- exact `supplier + item_code` latest-price lookup;
- generic read-only `row_reference` contract for rich action tables;
- `Mua hàng` metadata wiring that shows `Giá mua gần nhất` without writing into `rate`;
- regression tests for supplier/company scope and PO/receipt de-duplication;
- parser regression tests for the row-reference contract.

## Merge / deploy

Do not merge or deploy the Item detail-tab prototype until the shared extension boundary is resolved or an existing canonical app-scoped detail-view mechanism is identified and used.
