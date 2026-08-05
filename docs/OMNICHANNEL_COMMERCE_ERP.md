# Forge Omnichannel Commerce ERP

Ngày mở workstream: **2026-08-05**  
Branch: `feature/omnichannel-commerce-erp`  
Scope: Shopee, Lazada, TikTok Shop; tái sử dụng Facebook/Social Commerce hiện có.

## 1. Product outcome

Forge quản trị bán hàng nhiều kênh trên một ERP authority thay vì tạo database/ledger riêng cho từng sàn.

Flow hiện tại:

`Marketplace/Social -> Integration Hub -> Channel Profile -> SKU Mapping -> canonical Sales Order -> shared Stock Reservation -> Delivery Note -> Finance evidence/Settlement -> BI`

Các sàn là **external channels**. Chúng không phải source of truth cho Stock, GL, Payment, Customer master, fulfillment lifecycle hay SKU mapping.

## 2. Authority map

| Concern | Authority | Omnichannel responsibility |
|---|---|---|
| Connector/OAuth/poll/retry | WS10 Integration Hub + WS11/WS12 | Provider adapters normalize external records; signed requests and secrets stay inside credential boundaries. |
| OAuth state | existing control-plane `oauth_transactions` | Single-use, tenant/actor/connection-bound authorization transaction; no seller token persistence in control D1. |
| Channel configuration | Social Commerce app metadata | Map provider shop to Company/Warehouse/Customer/Currency/Price List. |
| SKU identity | Item master + `Marketplace SKU Mapping` | Deterministically map external SKU/variant to canonical Item. |
| Commercial order | canonical `Sales Order` / Document Kernel | Marketplace creates/replays one deterministic canonical order. |
| Available stock/reservation | WS04 shared Stock authority | Cross-channel reserve/commit/release; no marketplace stock ledger. |
| Fulfillment | canonical Delivery Note + Stock Return | Marketplace tracking/return UI is a projection around canonical evidence. |
| SLA policy | `Marketplace SLA Policy` metadata | Per-channel business threshold for order-to-fulfillment observation; UI never invents a default threshold. |
| Invoice/payment/fees/settlement | WS01 Finance authority | Marketplace stores reconciliation evidence only; GL/Payment truth stays canonical. |
| Customer | WS02 CRM/Customer authority | Exact provider/shop-scoped identity fingerprints link to canonical Customer under CRM policy. |
| Provider event state | marketplace operational evidence | Monotonic external-status watermark for audit only; never drives ERP lifecycle. |
| Sync checkpoint | Integration Hub operational state | CAS cursor/lease/retry timing only; not business truth. |
| Mapping exception inbox | marketplace operational evidence | Read-only missing/invalid mapping queue; `Marketplace SKU Mapping` remains sole authority. |
| UI/PWA | shared MetaForge runtime | One operations cockpit; no vertical runtime fork. |

## 3. Implemented candidate on this branch

### 3.1 Channel and mapping metadata

`Commerce Channel Profile` defines provider/shop, canonical Company, Warehouse, default Customer, Currency, Price List, `connection_id`, sync enablement and disabled state.

`Marketplace SKU Mapping` has deterministic identity:

`{channel_profile}:{external_sku}:{external_variant_key}`

`external_variant_key=BASE` is used when the provider has no variant. Provider input cannot select canonical Item/Company/Warehouse/Customer/Price List.

### 3.2 Canonical order ingestion

`server/packages/social-commerce/src/marketplace-order.ts` and `marketplace-profile.ts` normalize bounded provider input and resolve ERP-controlled metadata server-side.

External order lineage uses SHA-256 of provider/shop/order identity. Replays return the existing canonical Sales Order. Provider merchandise totals are reconciliation evidence; canonical pricing remains authoritative and mismatch fails closed.

### 3.3 Generic ATP / reservation

Marketplace order creation reuses shared commercial stock reservation before canonical conversion. Reservation is released on failed/cancel paths and committed through canonical Delivery Note lifecycle. Physical stock truth remains the canonical stock ledger.

This closes the original DR-COMMERCE-01 engineering dependency for this candidate; live concurrency/volume certification remains part of production readiness.

### 3.4 Marketplace Connection and credential lifecycle

`Marketplace Connection` is canonical metadata for provider/config/status and stores only `secret_ref`.

Seller credentials are AES-GCM encrypted in the tenant marketplace credential vault with tenant/connection/provider/secret-ref AAD binding. Shopee/Lazada/TikTok token refresh is automatic before expiry and ciphertext writes use compare-and-swap semantics so concurrent admin rotation cannot be overwritten.

Browser APIs expose non-secret credential health only.

### 3.5 OAuth and provider adapters

Shopee, Lazada and TikTok Shop have provider adapters, signing boundaries, server-side authorization-code exchange and refresh support.

OAuth reuses the existing control-plane transaction authority with SHA-256 state identity, 10-minute TTL, consume-once callback and canonical tenant/actor/connection binding. Seller token material goes directly to the tenant encrypted vault and is never returned to the browser.

Live developer app registration, real seller authorization, provider certification and live webhook verification remain external deployment/integration work.

### 3.6 Sync runner and operational health

Order polling uses D1 checkpoint state with compare-and-swap lease/cursor updates, bounded page loops, retry/backoff, cursor advance only after canonical ingest, fair least-recently-synced tenant maintenance, per-shop failure isolation and TikTok update-time high-watermark + overlap replay protection.

### 3.7 Provider event watermark

Provider external lifecycle remains evidence only. Newer timestamps advance the external watermark; stale/duplicate/conflicting events are counted without mutating canonical Sales Order, Delivery Note, Stock Return or Finance state.

### 3.8 SKU mapping exception inbox

Mapping failures remain fail-closed. `marketplace_mapping_exceptions` records bounded channel/provider/SKU/variant evidence only. MetaForge exposes a manager-only read-only `Lỗi SKU` tab linking back to canonical `Marketplace SKU Mapping`.

### 3.9 Customer identity

Marketplace buyer identity is reduced to provider/shop-scoped opaque fingerprints and linked through CRM external identity authority. Raw marketplace buyer IDs are not persisted in canonical customer lineage.

### 3.10 Fulfillment, return and COD

Marketplace fulfillment UI reuses canonical Sales Order, Delivery Note and Stock Return operations. COD reconciliation is constrained by canonical Delivery Note amount and records evidence only.

### 3.11 Settlement / Finance evidence

Settlement evidence decomposes provider payout, fees, vouchers, refunds and subsidies without creating a marketplace GL/payment ledger. Optional verification requires canonical Sales Invoice and Payment Entry evidence.

### 3.12 Operator order cockpit

The `Đơn sàn` UI supports search by marketplace order ID/Sales Order/Customer, provider/status/missing-link filters, canonical identity/fulfillment operations and a policy-driven SLA queue.

### 3.13 Marketplace SLA policy

`Marketplace SLA Policy` is one metadata document per `Commerce Channel Profile`. The first metric is `order_to_fulfillment` with explicit `target_minutes` and `warning_minutes` and no default business threshold.

SLA starts at immutable `social_orders.created_at` and stops at the first `social_shipments.created_at` backed by canonical Delivery Note evidence. Provider status and `social_orders.modified_at` are excluded. Migration `0123_marketplace_sla_context.sql` binds provider-order evidence to channel policy scope.

## 4. Sellable ERP module status

| Module | Candidate status |
|---|---|
| Channel Center | Implemented; live seller authorization/certification pending. |
| Catalog & SKU | Deterministic mapping + fail-closed exception inbox implemented. |
| Price & Promotion | Canonical price-list/amount authority present; outbound management remains future scope. |
| Order Cockpit | Search/filter, canonical operations, provider diagnostics and metadata-driven SLA queue implemented. |
| Omnichannel ATP | Generic reservation/ATP implemented. |
| Fulfillment | Canonical Delivery Note/tracking/return boundary implemented. |
| Returns/Refunds | Canonical Stock Return boundary implemented; provider-specific refund APIs remain external. |
| Settlement | Evidence/variance + canonical Finance verification implemented. |
| Customer 360 | Exact CRM identity authority implemented. |
| BI | Core operational/SLA data exists; dedicated profitability/SLA pack remains future scope. |

## 5. Dependency request status

- DR-COMMERCE-01 / WS04: engineering satisfied.
- DR-COMMERCE-02 / WS01: authority boundary satisfied; live statement certification remains external.
- DR-COMMERCE-03 / WS10+WS11+WS12: production-shaped code seams implemented; live apps/certification/webhooks remain external.
- DR-COMMERCE-04 / WS02: engineering satisfied.

## 6. Acceptance invariants

Tests enforce replay idempotency, tenant/auth isolation, fail-closed SKU mapping/amount reconciliation, reservation ordering, canonical fulfillment/return/finance evidence, monotonic provider event evidence, read-only mapping/SLA surfaces and explicit metadata-driven SLA clocks.

## 7. Release boundary

This work is a **new product candidate**, not a change to the frozen Alumdoor pilot identity. No production provider credential, customer data, migration, deploy or pilot relock is authorized by this branch.

PR #675 remains Draft. Merge or production promotion requires explicit approval.