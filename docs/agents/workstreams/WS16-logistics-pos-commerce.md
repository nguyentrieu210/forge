# WS16 — Logistics / POS / Retail / Omnichannel Commerce

Status: **ACTIVE**  
Owner: **ChatGPT WS16**  
Branch: `agent/ent-16-logistics-pos-commerce`  
Claimed from head: `745cd1418ec1c74ed13960d112ae5c3104cc775d`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Hoàn thiện execution ngoài ERP backoffice: shipment/route/delivery, retail/POS, online/social/marketplace omnichannel với stock và finance thống nhất.

## Own

shipment/carrier/vehicle/driver/trip/POD/freight/returns logistics; POS opening/invoice/refund/exchange/closing/offline/store/loyalty/promotion; catalog/cart/checkout/order tracking/marketplace/social commerce orchestration và omnichannel stock/customer/price domain.

## Capability map

- POS / retail: `R01-001..R01-017`.
- E-commerce / omnichannel: `R02-001..R02-019`.
- Transportation: `L01-001..L01-011`.
- Cross-domain source of truth: WS04 stock, WS01 finance/COGS/payment, WS02 customer/CRM, WS10 connectors, WS14 offline/mobile.

## Phase A audit — 2026-08-03

### Exact code evidence

- POS canonical controllers existed in `server/packages/clouderp-erpnext/src/suite-controllers.ts` for Opening Entry, POS Invoice and Closing Entry.
- Baseline POS Invoice already reused server pricing, stock valuation/tracking, GL/COGS and POS sales projection; selling after a closed session was blocked.
- Baseline opening blocked a second open session for the same profile; closing derived totals from canonical POS sales projection.
- `server/docs/spec/business-rules/erp/pos-invoice.md` requires payment reconciliation and discrepancy reasons, but baseline accepted a non-zero closing difference without a reason and accepted invoice/closing timestamps before opening.
- Dedicated production `/erp/pos` client implementation was not found; current route evidence is specification-only. Shared UI/offline belongs WS14.
- `DeliveryNoteController` existed, but Forge had no WS16-owned POD/freight vertical slice.
- Social Commerce Wave 1 existed, but `/carts/:id/convert` only created a local `social_orders` row, hardcoded VND, accepted client COD and never wrote canonical Sales Order/reservation. Shipment/COD were local rows only.

### Legacy PR disposition

- `docs/agents/LEGACY_PR_INBOX.md` has no substantive PR assigned to WS16.
- POS/logistics/social-commerce searches revealed no open substantive WS16 PR suitable for reuse/cherry-pick.
- Disposition: **no direct legacy candidate**; current main is the implementation baseline.

## Completed branch slices

### 1. POS session / cashier / payment-mode hardening

`server/packages/clouderp-erpnext/src/pos-session-hardening.ts`

- Invoice/closing cannot predate opening; closing cash cannot be negative.
- Opening binds cashier from trusted actor and honors POS Profile applicable users.
- Opening balances can be supplied by Mode of Payment; account/type are server-resolved and Cash opening total is derived.
- POS Invoice payment rows are server-resolved from Mode of Payment + company account; duplicate/negative rows fail closed.
- Split payment replaces the legacy single Cash GL debit; income/tax/COGS/stock remain canonical controller output.
- Overpayment creates explicit change against a configured/matched payment account.
- Closing reconciles opening + submitted POS Invoice payments per mode, subtracts change, and requires closing amount per mode.
- Any non-zero closing discrepancy requires a trimmed reason.
- Cashier impersonation inside another user's open session fails except explicit manager/system override.
- Partial-payment profile does **not** invent receivable state: underpayment fails closed pending WS01 canonical receivable/payment-ledger integration.

Regression source:
- `server/tests/pos-session-hardening.test.mjs`
- `server/tests/pos-payments-reconciliation.test.mjs`

### 2. Delivery Trip + Proof of Delivery

`server/packages/clouderp-erpnext/src/logistics-controllers.ts`

- Delivery Trip requires company/vehicle/departure/stops; submit requires Driver + submitted Delivery Notes.
- Driver identity is server-derived; stop Delivery Note/customer/company lineage is validated.
- Duplicate Delivery Notes, invalid route time order and negative distance fail closed; total distance is derived.
- Client cannot mutate `visited`; submitted trip is immutable under normal Forge lifecycle.
- `Proof of Delivery` is a separate submittable evidence aggregate per `trip + stop`.
- Delivered/Partial/Failed outcomes require the appropriate recipient/proof/exception/failure evidence.
- POD cannot predate departure and revalidates Delivery Note/company/customer lineage.
- Correction is cancel + amend using the existing kernel amendment chain; no history deletion.

First-party app metadata:
- `server/apps-src/logistics/app.json`
- `server/apps-src/logistics/roles.json`
- `server/apps-src/logistics/doctypes/proof-of-delivery.json`

`Proof of Delivery` uses server `format:POD-{delivery_trip}-{stop_row_id}` autoname. Delivery Trip/Delivery Note/Customer remain external canonical DocTypes; WS16 does not fork them.

Regression source:
- `server/tests/logistics-pod.test.mjs`

### 3. Social cart -> canonical Sales Order

`server/packages/social-commerce/src/canonical-order.ts`
`server/packages/social-commerce/src/api.ts`

- Local `social_orders` is now orchestration/read-model state, not the commercial source of truth.
- Conversion requires canonical company/customer/currency/selling price list and reads item+qty from committed social cart rows.
- Sales Order name is deterministic from cart; prices are resolved by the Sales Order controller from the server price list instead of trusting social/client rates.
- Uses `DocumentKernel`, standard O2C/controller registry, metadata permissions and organization-security.
- Cross-store conversion is repairable/idempotent: local order starts `draft`, canonical Sales Order commits, then social row stores `sales_order_name` and cart becomes converted.
- COD expected amount is derived from canonical document total, not client input.
- No generic stock reservation is faked; response records the WS04 reservation dependency.

### 4. Social shipment -> canonical Delivery Note projection

- Social shipment creation requires a submitted Delivery Note that fulfills the canonical Sales Order and matches company/customer/currency.
- `shipment_id` is the Delivery Note name, so lineage is persistent without a competing migration/table contract.
- COD expected amount is derived from the Delivery Note total; duplicate shipment retry is idempotent only when order/carrier/tracking/amount match.
- COD reconcile revalidates the Delivery Note and refuses amount mismatch instead of silently marking it reconciled.
- Finance posting remains false until canonical Sales Invoice/Payment Entry allocation exists.

Source-contract regression:
- `server/tests/ws16-omnichannel-source-contract.test.mjs`

## Maturity snapshot after current branch work

| Capability | Maturity | Evidence / remaining gap |
|---|---|---|
| `R01-002` POS opening/session | Wired+ | cashier/profile/opening-balance/session chronology hardened; dedicated POS UX/offline still WS14 |
| `R01-005` POS Invoice | Wired+ | pricing + stock + COGS + GL + split payment/change/session guard; partial receivable + refund remain dependencies |
| `R01-015` Cash closing | Wired+ | per-mode reconcile + discrepancy evidence; UI/report execution evidence still absent |
| `R01-011..012` refund/exchange | Blocked dependency | generic atomic POS return commitment does not exist; scan-based over-return check would race |
| `R01-014` offline POS | Dependency | WS14 sync-safe/offline substrate required; ledger/close must stay online |
| `R02-004..009` cart/order ingestion | Wired+ | social cart now creates canonical Sales Order; generic reservation + UI confirmation remain dependencies |
| `R02-010` omnichannel inventory | Dependency | WS04 generic reservation primitive missing; Alumdoor reservation is not generic |
| `R02-013/018` Facebook/social inbox | Wired | Wave 1 exists; external Meta activation remains outside source-only completion |
| `L01-006/008` trip/POD | Wired | controller + metadata + evidence/correction path added; execution evidence NOT RUN |
| `L01-001/002/009..011` shipment/carrier/freight/contracts | Foundation | Delivery Note projection exists; richer TMS/freight settlement still follow-up |

## Dependency Requests

### DR-WS16-01 — POS partial payment / COD finance posting -> WS01

Need a canonical way for POS/social to create receivable/payment allocation without another payment ledger. Required for:
- POS partial payment / store credit semantics;
- COD collected -> Sales Invoice/Payment Entry posting;
- financial reconciliation of COD mismatch/fees.

WS16 currently fails closed and does not post fake cash/payment state.

### DR-WS16-02 — Generic stock reservation -> WS04

Current `Stock Reservation` controller is Alumdoor batch/length-specific (`batch_no`, `min_length_m`, vertical statuses). It is not safe to reuse for generic retail/social inventory. Need a generic Sales Order/channel reservation contract with atomic stock guard and correction/release semantics. Social conversion currently commits canonical Sales Order and explicitly leaves reservation pending.

### DR-WS16-03 — Atomic POS return commitment -> WS00 + WS04 (+ WS01 touchpoint)

Existing shared `ReturnEntry` does not model POS Invoice. A WS16-only scan of prior returns is race-prone: two concurrent refunds can both observe remaining quantity and over-return. Need an atomic reference-quantity commitment/guard that can cover POS Invoice return lineage and finance reversal. Until then WS16 will not manufacture a parallel return ledger.

### DR-WS16-04 — POS/offline/cashier UI -> WS14

No production `/erp/pos` implementation was found. WS14 owns shared runtime/views/offline substrate. WS16 domain rules specify sync-safe boundary: provisional cart may be offline; ledger posting and closing reconciliation must be online/server-authoritative.

## Verification

- Branch began from `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` after explicit sync.
- Subsequent main drift checked during work was WS14/shared frontend work and did not overlap WS16 backend/domain paths at those checkpoints; exact compare must be repeated before merge.
- Local executable verification is unavailable because this runtime cannot resolve/checkout GitHub and repository CI is not a development test lane.
- All newly authored executable tests are therefore **NOT RUN**. Source-contract test is authored but also **NOT RUN**.
- Do not claim RC/Hardened until exact branch test/typecheck/build evidence exists.

## Remaining autonomous queue

1. Audit/harden exact POS cancellation so cancellation reverses historical payment/stock/GL evidence rather than recomputing values when required by current ledger APIs.
2. Audit promotion/loyalty/gift-card coverage; implement only if canonical pricing/payment contracts already support it without new shared SoT.
3. Audit social/cart permission + provider shipment/COD lifecycle for cancellation/retry gaps.
4. Add package/meta/source checks for logistics/social artifacts where current test infrastructure supports them.
5. Re-compare exact main, update PR checkpoint, and continue until only non-UI merge/deploy or unresolved shared dependencies remain.

## Guards

- Do not create inventory/COGS/payment source of truth inside POS/commerce.
- External order ingestion must remain idempotent.
- WS04 owns stock invariants; WS01 owns finance/COGS/payment; WS10 owns connector platform; WS14 owns shared UI/offline/mobile; WS02 owns customer/CRM contracts.
- Backend/business-rule changes require approval before merge/deploy. PR is only a checkpoint, not a work stop.
