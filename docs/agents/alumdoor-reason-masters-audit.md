# Alumdoor operational reason masters — audit decision

Baseline: `main@85cfe7255de474706f05da8c49da1283004d0e2a`.

## Decision

Keep the two existing canonical masters separate:

- `Lý do huỷ` owns cancellation/release reason codes and transaction scope.
- `Nguyên nhân chênh lệch` owns Stock Reconciliation variance reason codes and `Thừa`/`Thiếu` applicability.

Do not add a generic `Operational Reason`: current metadata already has distinct schemas, permissions and Link consumers, so a third authority would duplicate semantics.

## Existing authority found on main

- `Cut Order.cancel_reason -> Lý do huỷ`.
- `Stock Reservation.released_reason -> Lý do huỷ`.
- `Stock Reconciliation.cancel_reason -> Lý do huỷ`.
- `Stock Reconciliation Item.variance_reason -> Nguyên nhân chênh lệch`.
- Stock Reconciliation remains the canonical counted-vs-book correction path and Stock Ledger remains quantity/value authority.

## Gaps closed by this branch

- initial active fixture catalogs were absent;
- backend previously accepted free-text codes without checking active master/scope/direction;
- the `Nhả giữ chỗ` AppAction still exposed free text despite the document field being a Link;
- `Khác` note enforcement used display text rather than canonical code;
- exact-head CI did not explicitly gate reason master composition.

## Out-of-scope stale metadata

`Stock Entry.adjust_reason` is declared for `Điều chỉnh tồn`, but the canonical `AdvancedStockEntryController` accepts only `Material Receipt`, `Material Issue`, `Material Transfer`, and `Manufacture`. This branch does not create a new adjustment workflow or change Stock Entry ledger semantics. Stock Reconciliation remains the active variance authority.

## Safety

No production mutation, Cloudflare operation, ledger authority change, or merge is included. Historical documents retain their stored reason codes; disabled master rows are rejected only for new mutations through the normal active-master reader.
