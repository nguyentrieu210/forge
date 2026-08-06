# Forge Omnichannel Commerce ERP

Ngày mở workstream: **2026-08-05**  
Branch: `feature/omnichannel-commerce-erp`  
Scope: Shopee, Lazada, TikTok Shop; tái sử dụng Facebook/Social Commerce hiện có.

## Product outcome

Forge quản trị bán hàng nhiều kênh trên một ERP authority. Marketplace/Social đi qua Integration Hub, channel metadata and SKU mapping, then canonical Sales Order, shared stock reservation, Delivery Note and canonical Finance evidence.

Marketplace is not source of truth for Stock, GL, Payment, Customer master, fulfillment lifecycle or SKU mapping.

## Implemented candidate

- `Commerce Channel Profile`, deterministic `Marketplace SKU Mapping`, canonical `Marketplace Connection`.
- Shopee/Lazada/TikTok adapters, request signing, OAuth, encrypted credential vault, token refresh and sync health.
- Provider-neutral canonical Sales Order ingestion with deterministic source identity and idempotent replay.
- Shared ATP/reservation; no marketplace stock ledger.
- Exact CRM external-customer identity; no fuzzy merge.
- Monotonic provider-event evidence and mapping-exception inbox; neither controls ERP lifecycle/mapping authority.
- Canonical cancel/Delivery Note shipment/Stock Return and COD evidence.
- Settlement variance/evidence with canonical Sales Invoice + Payment Entry verification; no parallel Finance ledger.
- Manager `Lỗi SKU` inbox, order search/provider/status/missing-link filters and provider-event diagnostics.
- `Marketplace SLA Policy`, one per `Commerce Channel Profile`, metric `order_to_fulfillment`, with explicit `target_minutes` and `warning_minutes` and no default business threshold.
- SLA starts from immutable `social_orders.created_at`, stops at first `social_shipments.created_at` backed by canonical Delivery Note evidence, excludes provider status and mutable `modified_at`, and is exposed through a read-only SLA queue.
- Migration `0123_marketplace_sla_context.sql` binds provider evidence to immutable channel policy scope; historical unscoped rows remain unasserted until safe replay rather than guessed backfill.

## Authority guard

No parallel authority for Stock, GL/Payment, Customer, SKU mapping, credentials, OAuth state, fulfillment lifecycle, provider lifecycle, sync lease/scheduler or tenant routing. SLA thresholds are explicit metadata policy and SLA observations are read-only projections.

## Remaining external readiness

- register live Shopee/Lazada/TikTok developer apps and redirect URLs;
- configure production Worker/provider secrets;
- authorize real seller accounts;
- complete provider certification and live webhook verification;
- implement provider-specific production operational/DLQ requirements where certification requires them;
- controlled production promotion.

## Remaining product scope

- outbound listing/price/promotion management;
- provider-specific refund/label flows;
- dedicated BI profitability/SLA report pack.

## Release boundary

This is a new product candidate, not a mutation of the frozen Alumdoor pilot. PR #675 remains Draft. Merge or production promotion requires explicit approval.