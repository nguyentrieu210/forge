# RC4-A17 — Logistics / POS / Commerce Evidence

Date: 2026-08-04
Baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Branch: `agent/rc4-17-logistics-pos-commerce`
PR: `#601`
Risk: STANDARD, security-sensitive; stock/payment dependencies remain CRITICAL under their owners.

## Exact-state audit

1. Historical WS16 branch is fully behind current `main`; no legacy commit remains a direct cherry-pick candidate.
2. POS exact cancellation is already present on current `main` via `pos-cancel-exact.ts`: cancellation reads committed voucher revision evidence and reverses exact GL/stock instead of recomputing FIFO. A17 did not duplicate that authority.
3. Social cart conversion already commits a canonical Sales Order; shipment is a projection of a submitted canonical Delivery Note; COD accounting remains explicitly unposted pending WS01.
4. Residual permission gap found in `server/packages/social-commerce/src/api.ts`:
   - Social summary/pages/events/carts performed tenant reads without a Social Commerce role gate at the route boundary;
   - keyword-rule mutation used the generic sales writer gate although rule administration is manager scope;
   - shipment projection used the generic sales writer gate instead of fulfillment/stock scope;
   - COD reconciliation used the generic sales writer gate instead of finance/COD scope.

## Implemented slice

- Gate Social Commerce read endpoints before D1 access.
- Restrict rule administration to `System Manager`, `Social Commerce Manager`, or `Sales Manager`.
- Permit shipment projection only for manager or stock roles (`Stock Manager` / `Stock User`).
- Permit COD reconciliation only for manager or accounts roles (`Accounts Manager` / `Accounts User`); generic `Sales User` no longer has COD reconcile permission.
- Keep cart conversion/order cancellation on existing canonical sales-writer path.
- Preserve canonical Sales Order, Delivery Note, Stock and Finance authorities; no schema/migration/ledger was added.
- Add WS16 source-contract regression for the route-class permission boundary.

## Verification

- Exact PR diff audit: PASS; changed behavior is limited to Social Commerce route permission gates and its targeted source-contract test.
- Branch compare at implementation checkpoint before evidence commit: `ahead 3 / behind 0` against baseline main.
- GitHub Actions on implementation head `9c143cff8b50d1a6c45686f4fbd01989968e58a4`:
  - `CFMAX R2 Integrated Validation` run `30868269543`: job skipped by workflow/path conditions; not A17 execution evidence.
  - `RC-021 Critical Validation` run `30868269570`: skipped; not A17 execution evidence.
- `server/tests/ws16-omnichannel-source-contract.test.mjs`: authored/updated, **NOT RUN in a development test lane** from this PR environment.
- No RC/Hardened maturity promotion is claimed from source presence or skipped CI.

## Dependency Requests

### DR-A17-01 -> A4 / WS01 Finance

Need canonical receivable/payment allocation for POS partial payment and COD collected -> Sales Invoice/Payment Entry posting. A17 must not create a parallel payment ledger.

### DR-A17-02 -> A12 / WS04 Inventory

Need generic Sales Order/channel stock reservation with atomic guard, release/correction and reconciliation. Existing vertical reservation must not be generalized implicitly.

### DR-A17-03 -> A12 + kernel/Finance touchpoint

Need atomic POS return quantity commitment so concurrent refunds cannot over-return. A17 will not implement a race-prone scan-based return ledger.

### DR-A17-04 -> A6 / WS14 UI runtime

Need dedicated POS/browser/mobile/offline execution evidence. Offline cart/draft may be provisional; stock commitment, ledger posting and closing reconciliation remain online/server-authoritative.

## Merge / deploy boundary

This PR changes backend authorization behavior. Per Forge completion skill it must stop before merge/deploy until explicit user approval. No production mutation, migration, secret/DNS change, provider mutation or customer-data mutation was performed.
