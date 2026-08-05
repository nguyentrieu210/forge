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

Order polling uses D1 checkpoint state with:

- compare-and-swap lease/cursor updates;
- bounded page loops;
- retry/backoff;
- cursor advance only after canonical ingest;
- fair least-recently-synced tenant maintenance;
- per-shop failure isolation;
- TikTok update-time high-watermark + overlap replay protection.

Connection UI exposes read-only state, attempts, checkpoint, completion/retry time and bounded error code. Provider cursor and lease/run IDs stay server-side; UI cannot mutate scheduler state.

### 3.7 Provider event watermark

`marketplace_provider_order_state` keeps external lifecycle **evidence**, not ERP lifecycle authority.

For each canonical provider/shop/order source identity it records latest provider status/time plus event, stale, duplicate and equal-time conflict counters.

Rules:

- only a newer provider timestamp may advance the external watermark;
- stale retries cannot overwrite the latest external status;
- same-time duplicates are counted;
- same-time conflicting statuses are counted and the accepted value is preserved;
- provider status never mutates Sales Order, Delivery Note, Stock Return or Finance state.

The fulfillment UI surfaces this evidence so operators can diagnose out-of-order/replay behavior without creating a second lifecycle control.

### 3.8 SKU mapping exception evidence and inbox

Mapping failures remain fail-closed. Structured reasons are limited to:

- `missing`;
- `disabled`;
- `channel_mismatch`;
- `sku_mismatch`;
- `variant_mismatch`.

`marketplace_mapping_exceptions` stores tenant/channel/provider/SKU/variant, first/last seen, occurrence count and resolution time only. It does not store buyer/order payload or credentials and cannot create/edit a mapping.

A failed resolution opens/reopens the exact exception. When the same exact SKU/variant later resolves through authoritative metadata, that exception is marked resolved. The authenticated Marketplace Connection projection exposes open exceptions read-only.

MetaForge mounts a manager-only `Lỗi SKU` tab that shows provider, channel profile, external SKU/variant, bounded reason, occurrence count and latest observation. The UI has no mutation call for the exception projection and only links operators to the canonical `Marketplace SKU Mapping` DocType. The inbox therefore cannot auto-map or choose ERP Item codes.

### 3.9 Customer identity

Marketplace buyer identity is reduced to provider/shop-scoped opaque fingerprints and linked through CRM external identity authority. Raw marketplace buyer IDs are not persisted in canonical customer lineage. Reassignment/revocation follows CRM audit policy and submitted Sales Orders keep their historical Customer.

### 3.10 Fulfillment, return and COD

Marketplace fulfillment UI reuses canonical operations:

- cancel through Sales Order lifecycle;
- shipment registration only from an existing Delivery Note belonging to the canonical Sales Order;
- server-validated shipment transitions;
- return only from an existing canonical Stock Return;
- marketplace reservation commit/release follows canonical fulfillment paths.

COD reconciliation is constrained by canonical Delivery Note amount and records evidence only. It does not auto-post GL or create Payment Entry.

### 3.11 Settlement / Finance evidence

Settlement evidence decomposes provider payout, fee, voucher, refund and subsidy components without creating a marketplace GL/payment ledger.

The settlement exception workspace is mounted in Social Commerce `Đối soát`. Optional Finance verification requires:

- canonical Sales Invoice billing the canonical Sales Order; and
- canonical Payment Entry allocation equal to the provider payout

before cash evidence can be marked verified.

Live provider settlement statement certification/import remains external integration work.

### 3.12 Operator order cockpit

The `Đơn sàn` candidate UI adds local operator controls over the bounded order page already loaded from the existing read endpoint:

- search by marketplace order ID, canonical Sales Order or Customer;
- filter by provider;
- filter by observed operational status;
- highlight/filter orders missing canonical Sales Order or Customer links;
- retain the existing canonical identity and fulfillment actions;
- show a policy-driven SLA queue for `Cần chú ý`, `Vi phạm`, `Chưa cấu hình` and `Tất cả`.

These controls are observational/client-side only and introduce no lifecycle mutation route. SLA state, due time and fulfillment time are calculated server-side from explicit policy metadata and canonical timestamps; browser code does not calculate thresholds.

### 3.13 Marketplace SLA policy

`Marketplace SLA Policy` is one metadata document per `Commerce Channel Profile`. The first supported metric is `order_to_fulfillment`.

Policy fields are explicit:

- `target_minutes` — breach threshold;
- `warning_minutes` — warning window before target;
- `disabled` — no SLA assertion while disabled.

There is deliberately **no default business threshold**. The controller requires positive target minutes and `warning_minutes < target_minutes`, and keeps channel profile/metric immutable after creation.

SLA observation uses:

- start: immutable `social_orders.created_at`, when Forge accepted the marketplace order;
- stop: first `social_shipments.created_at`, which is only created through the canonical Delivery Note fulfillment path;
- cancelled/returned orders: `not_applicable`;
- no policy/disabled policy: no SLA assertion;
- malformed policy: `policy_invalid` evidence.

Provider external status and `social_orders.modified_at` are intentionally excluded from the SLA clock. Migration `0123_marketplace_sla_context.sql` binds provider order evidence to its channel profile for policy scope. Existing pre-migration evidence may have a null channel profile until that provider order is replayed; Forge does not guess or reverse a one-way source hash to backfill policy scope.

## 4. Sellable ERP module status

| Module | Candidate status |
|---|---|
| Channel Center | Implemented: connection metadata, OAuth/re-auth, credential health, sync health. Live seller authorization/certification pending. |
| Catalog & SKU | Implemented: deterministic mapping + fail-closed mapping exception evidence + dedicated manager inbox UI. Rich listing/publish management is future scope. |
| Price & Promotion | Canonical price-list authority and amount reconciliation implemented; full outbound listing/promotion management is future scope. |
| Order Cockpit | Canonical order list, search/provider/status/missing-link filters, identity, fulfillment/return, provider-event diagnostics and metadata-driven SLA queue implemented. |
| Omnichannel ATP | Generic reservation/ATP lifecycle implemented for marketplace candidate. |
| Fulfillment | Canonical Delivery Note/tracking/return integration implemented. Provider label/certification-specific behavior remains external/provider work. |
| Returns/Refunds | Canonical Stock Return boundary implemented; provider-specific refund APIs remain external integration. |
| Settlement | Evidence, variance UX and canonical Finance verification implemented; real provider statement certification pending. |
| Customer 360 | Exact CRM identity authority implemented. |
| BI | Core operational/SLA data is available; dedicated profitability/SLA report pack remains future product work. |

## 5. Dependency request status

### DR-COMMERCE-01 -> WS04: generic stock reservation / ATP

**Engineering status: satisfied on this branch.** Shared commercial reservation is used; no marketplace-specific stock ledger was introduced.

### DR-COMMERCE-02 -> WS01: marketplace financial settlement

**Engineering authority boundary: satisfied.** Settlement/COD evidence and canonical Invoice/Payment verification are implemented without parallel Finance authority. Live provider statement certification remains external integration.

### DR-COMMERCE-03 -> WS10/WS11/WS12: production provider adapters

**Production-shaped code seams: implemented. External readiness: pending.** Adapters, signatures, OAuth exchange, encrypted credential lifecycle, polling, retry and health exist. Remaining work requires real developer apps, seller accounts, redirect URLs, provider certification/live webhooks and provider-specific operational/DLQ requirements.

### DR-COMMERCE-04 -> WS02: customer identity linking

**Engineering status: satisfied.** Exact, privacy-safe CRM external identity authority is reused; no fuzzy marketplace customer merge was introduced.

## 6. Execution status

### Slice A — Channel + order authority

**Implemented and CI-evidenced.**

### Slice B — Production-shaped ingestion

**Engineering implementation complete for polling/OAuth/credential/sync seams.** Live provider app registration, seller authorization, certification and webhook verification are pending external work.

### Slice C — Stock/fulfillment

**Implemented and CI-evidenced** through shared reservation + canonical Delivery Note/Stock Return boundaries.

### Slice D — Finance settlement

**Implemented at evidence/reconciliation authority boundary.** Live provider settlement statement certification remains pending.

### Slice E — Operator UX and BI

**Operator UX substantially implemented.** Connection/sync health, dedicated SKU mapping exception inbox, order search/provider/status/missing-link filters, metadata-driven order-to-fulfillment SLA queue, fulfillment/return, provider-event diagnostics and settlement workspace are live in MetaForge candidate UI. Dedicated profitability/SLA BI remains future product work.

## 7. Acceptance invariants

Engineering tests on this candidate enforce:

- same provider order replay produces one canonical Sales Order;
- cross-tenant/auth boundaries fail closed;
- unmapped/invalid SKU cannot silently create an order line;
- external amount mismatch fails closed against canonical price;
- reservation precedes canonical conversion and cancel/failure releases appropriately;
- fulfillment traces to canonical Delivery Note and return to canonical Stock Return;
- settlement/COD cannot manufacture Finance truth;
- retries/out-of-order provider events cannot regress canonical lifecycle because provider status is evidence-only and external watermark is monotonic;
- mapping incidents retain exact bounded SKU/variant evidence without gaining mapping authority;
- mapping inbox remains read-only and cannot create/edit canonical mappings;
- order cockpit search/filters are observational and cannot create lifecycle mutations;
- SLA thresholds come only from `Marketplace SLA Policy`, while SLA clocks use order acceptance and canonical shipment evidence rather than provider status or mutable order timestamps;
- provider-to-ERP transitions retain deterministic correlation/audit evidence.

Production/business-complete status still additionally requires real provider credentials, seller authorization, certification/live webhook evidence and controlled deployment proof.

## 8. Release boundary

This work is a **new product candidate**, not a change to the frozen Alumdoor pilot identity. No production provider credential, customer data, migration, deploy or pilot relock is authorized by this branch.

PR #675 remains Draft. Merge or production promotion requires explicit approval.