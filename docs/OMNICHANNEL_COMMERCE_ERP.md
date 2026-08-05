# Forge Omnichannel Commerce ERP

Ngày mở workstream: **2026-08-05**  
Branch: `feature/omnichannel-commerce-erp`  
Scope đầu: Shopee, Lazada, TikTok Shop; tái sử dụng Facebook/Social Commerce hiện có.

## 1. Product outcome

Forge quản trị bán hàng nhiều kênh trên một ERP authority thay vì tạo một database/ledger riêng cho từng sàn.

Flow mục tiêu:

`Marketplace/Social -> Integration Hub -> Channel Profile -> SKU Mapping -> canonical Sales Order -> Stock Reservation -> Delivery Note -> Invoice/Payment/Settlement -> BI`

Các sàn là **external channels**, không phải source of truth cho Stock, GL, Payment hay Customer master.

## 2. Authority map

| Concern | Authority | Omnichannel responsibility |
|---|---|---|
| Connector/OAuth/webhook/poll/retry/DLQ | WS10 Integration Hub + WS11/WS12 | Provider adapters normalize external records/events. |
| Channel configuration | Social Commerce app metadata | Map provider shop to Company/Warehouse/Customer/Currency/Price List. |
| SKU identity | Item master + `Marketplace SKU Mapping` | Map external SKU/variant to canonical Item. |
| Commercial order | canonical `Sales Order` / Document Kernel | Marketplace creates/replays a deterministic canonical order. |
| Available stock/reservation | WS04 Stock authority | One cross-channel reservation primitive; no marketplace stock ledger. |
| Fulfillment | canonical Delivery Note + logistics | Marketplace tracking is projection of canonical fulfillment. |
| Invoice/payment/fees/settlement | WS01 Finance authority | Fees, vouchers, COD/provider payout must reconcile to canonical finance. |
| Customer | WS02 CRM/Customer authority | External buyer identity maps to Customer when evidence/policy permits. |
| UI/PWA/offline | shared MetaForge/WS14 runtime | One operations cockpit; no vertical runtime fork. |

## 3. Current slice implemented on this branch

### 3.1 `Commerce Channel Profile`

Metadata-driven setup for each marketplace shop:

- provider: `shopee | lazada | tiktok_shop`;
- Integration Hub `connection_id` reference only;
- external shop ID;
- Company;
- default Warehouse;
- default Customer;
- Currency;
- channel Price List;
- sync-orders switch and disable state.

Secrets/tokens are intentionally absent. Credential lifecycle remains Integration Hub/IAM authority.

### 3.2 `Marketplace SKU Mapping`

Deterministic identity:

`{channel_profile}:{external_sku}:{external_variant_key}`

`external_variant_key=BASE` is used when the provider has no variant. The mapping resolves to canonical `Item` and may override the default fulfillment Warehouse.

### 3.3 Provider-neutral order contract

`server/packages/social-commerce/src/marketplace-order.ts`

Supported providers are normalized to one bounded contract. External order lineage uses SHA-256 of provider/shop/order identity so punctuation normalization or name truncation cannot create accidental collisions.

The provider total is **reconciliation evidence**, not a trusted item price. Forge resolves commercial pricing through the canonical Sales Order controller. A mismatch fails closed rather than silently booking a different amount.

### 3.4 Server-authoritative metadata resolution

`server/packages/social-commerce/src/marketplace-profile.ts`

Provider-facing input is limited to:

- configured channel profile;
- external order/status/time/buyer ID;
- external SKU/variant and quantity;
- optional provider merchandise total for reconciliation.

It cannot choose Company, Customer, Currency, Price List, Warehouse or canonical Item code. Those values are resolved from tenant metadata before canonical order creation.

### 3.5 Canonical order reuse

Marketplace conversion reuses the existing hardened Social Commerce -> canonical Sales Order bridge. A deterministic synthetic marketplace lineage key is passed through the legacy `social_*` lineage fields. This is a compatibility bridge, not a second source of truth.

A later shared contract may rename/generalize those fields to `commerce_channel_*`; that rename is not required to establish authority and should not be done casually while other workstreams depend on the existing Sales Order contract.

## 4. Required functional modules toward a sellable ERP

1. **Channel Center** — connect/health/re-auth shop, sync cursor, provider incidents.
2. **Catalog & SKU** — item mapping, variants, publish state, listing quality, missing mapping queue.
3. **Price & Promotion** — per-channel price list, seller/platform-funded promotion reconciliation, effective-dated campaign rules.
4. **Order Cockpit** — new/confirmed/packing/shipped/completed/cancel/return, SLA and exception queue.
5. **Omnichannel ATP** — actual stock minus atomic reservations across marketplace/social/POS/web.
6. **Fulfillment** — warehouse assignment, pick/pack, label, tracking, split shipment and return-to-sender.
7. **Returns/Refunds** — provider event -> canonical return/correction/reversal, never silent ledger edits.
8. **Settlement** — gross sales, seller discount, platform discount, commission, service fee, shipping subsidy/fee, tax/withholding, payout and variance.
9. **Customer 360** — identity linking with privacy/permission rules.
10. **BI** — GMV, net revenue, orders, cancellation, return, fulfillment SLA, stockout, margin and settlement variance by channel/SKU/shop.

## 5. Dependency Requests

### DR-COMMERCE-01 -> WS04: generic stock reservation / ATP

Need a generic, atomic reservation contract reusable by marketplace, social, POS and web orders. It must support reserve/commit/release/expiry/correction and prevent concurrent oversell. Existing vertical-specific reservation must not be copied into commerce.

Until this lands, marketplace Sales Order creation can be canonical but **cannot claim cross-channel no-oversell completeness**.

### DR-COMMERCE-02 -> WS01: marketplace financial settlement

Need canonical finance semantics for:

- provider payout;
- marketplace commission/service fees;
- shipping fee/subsidy;
- seller/platform vouchers;
- COD/payment allocation;
- refund/return reversal;
- settlement variance.

Commerce must not introduce a parallel payment/GL ledger.

### DR-COMMERCE-03 -> WS10/WS11/WS12: production provider adapters

Need real Shopee/Lazada/TikTok Shop adapters through the generic connector SDK, with credential references, OAuth/API-key lifecycle as appropriate, signed webhook/poll normalization, idempotency, retry/DLQ, cursor sync, health and audit.

This branch deliberately does not store provider secrets or duplicate connector infrastructure.

### DR-COMMERCE-04 -> WS02: customer identity linking

Need reusable evidence/policy for mapping masked marketplace buyer identities to canonical Customer while respecting provider privacy constraints and avoiding unsafe fuzzy merges.

## 6. Execution sequence

### Slice A — Channel + order authority

- channel metadata;
- deterministic SKU mapping;
- provider-neutral order contract;
- server-authoritative profile resolution;
- canonical Sales Order conversion;
- source-contract regression.

**Status on this branch: implemented, executable evidence pending exact-head CI.**

### Slice B — Production ingestion

- provider manifests/adapters;
- internal normalized-order ingress;
- webhook/poll replay and cursor recovery;
- connection health and sync observability.

Depends on WS10/WS11/WS12 production-shaped seams.

### Slice C — Stock/fulfillment

- generic reservation/ATP;
- warehouse allocation;
- Delivery Note/pick-pack/tracking;
- cancel/release/return behavior.

Depends on DR-COMMERCE-01.

### Slice D — Finance settlement

- Sales Invoice/Payment Entry linkage;
- fee/subsidy/promotion decomposition;
- payout statement import/match;
- deterministic variance/reversal.

Depends on DR-COMMERCE-02.

### Slice E — Operator UX and BI

- omnichannel dashboard;
- order and exception cockpit;
- mapping inbox;
- settlement reconciliation;
- channel/SKU profitability and SLA reports.

## 7. Acceptance invariants

A marketplace channel is not considered business-complete until all of the following are evidenced:

- same provider order replay produces one canonical Sales Order;
- cross-tenant access fails closed;
- unmapped/ambiguous SKU cannot silently create an order line;
- external amount mismatch is visible and fails/queues by frozen policy;
- concurrent last-unit orders cannot oversell;
- cancellation/return releases or reverses canonical stock/finance correctly;
- fulfilled quantity traces to canonical Delivery Note;
- provider payout and all fees reconcile to canonical finance;
- retries/out-of-order provider events do not regress lifecycle;
- every provider-to-ERP transition retains correlation/audit evidence.

## 8. Release boundary

This work is a **new product candidate**, not a change to the frozen Alumdoor pilot identity. No production provider credential, customer data, migration, deploy or pilot relock is authorized by this branch. Backend/business-rule merge or deploy remains an explicit approval boundary.
