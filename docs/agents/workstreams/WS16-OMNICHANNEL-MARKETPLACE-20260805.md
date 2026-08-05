# WS16 — Omnichannel Marketplace ERP checkpoint

Date: **2026-08-05**  
Branch: `feature/omnichannel-commerce-erp`  
PR: `#675`  
Base target: `main`

## Outcome

WS16 extends Forge as a consumer/orchestrator of existing ERP authorities rather than introducing a second ERP runtime or marketplace-specific business ledger.

Current candidate covers Shopee, Lazada and TikTok Shop, while reusing the existing Facebook/Social Commerce surface.

## Implemented engineering scope

### Channel / connector authority

- metadata-driven `Commerce Channel Profile`;
- deterministic `Marketplace SKU Mapping`;
- canonical `Marketplace Connection` metadata with one-connection-per-channel guard;
- Shopee/Lazada/TikTok provider adapters and signed-request boundaries;
- encrypted tenant credential vault with `secret_ref` only in metadata;
- server-side OAuth code exchange and token refresh lifecycle;
- existing control-plane `oauth_transactions` reused for single-use OAuth state;
- browser connection health and re-authorization without browser access to seller secrets.

### Order / inventory authority

- provider-neutral bounded order contract;
- collision-resistant SHA-256 external-order lineage;
- server-side Company/Customer/Currency/Price List/Warehouse/Item resolution;
- fail-closed provider merchandise-total reconciliation;
- canonical Sales Order conversion through DocumentKernel/O2C;
- generic shared commercial ATP/reservation before conversion;
- reservation release on failure/cancel and commit through canonical fulfillment;
- no marketplace-specific physical stock ledger.

### Sync / operational evidence

- D1 CAS sync checkpoint/lease state;
- bounded page loops and retry/backoff;
- cursor advances only after canonical ingest;
- fair least-recently-synced tenant polling with per-shop failure isolation;
- TikTok update-time high-watermark + overlap replay protection;
- read-only connection sync health with attempts/checkpoint/retry/error visibility;
- monotonic provider-order external-status watermark with stale/duplicate/conflict counters;
- provider event state remains evidence-only and cannot drive canonical lifecycle;
- migration `0123_marketplace_sla_context.sql` binds provider-order evidence to immutable `channel_profile` policy scope; historical rows remain unscoped until safe provider replay rather than guessed backfill.

### Mapping exception evidence

- exact structured mapping failure reasons: missing, disabled, channel mismatch, SKU mismatch, variant mismatch;
- tenant/channel/provider/SKU/variant exception inbox with first/last seen and occurrence count;
- exact exception is resolved automatically once authoritative metadata resolution succeeds;
- no buyer/order payload or credential material is stored;
- exception state cannot create/edit `Marketplace SKU Mapping` or choose canonical Item.

### Customer / fulfillment / finance

- exact provider/shop-scoped CRM external customer identity authority;
- submitted Sales Order customer history preserved on replay/reassignment;
- cancel through canonical Sales Order lifecycle;
- shipment registration requires existing canonical Delivery Note;
- return registration requires existing canonical Stock Return;
- server-enforced shipment transitions;
- COD reconciliation constrained by canonical Delivery Note amount;
- settlement evidence/variance workspace for payout, fee, voucher, refund and subsidy;
- optional canonical Sales Invoice + Payment Entry evidence verification;
- no marketplace GL, Payment Ledger or Finance source of truth.

### SLA policy authority

- canonical metadata DocType `Marketplace SLA Policy`, one policy per `Commerce Channel Profile`;
- first metric: `order_to_fulfillment`;
- explicit `target_minutes` and `warning_minutes`, with **no default business threshold**;
- controller requires `target_minutes > 0`, `warning_minutes < target_minutes`, and immutable channel/metric identity;
- SLA clock starts at immutable `social_orders.created_at` when Forge accepts the marketplace order;
- SLA clock stops at the first `social_shipments.created_at`, which exists only after canonical Delivery Note evidence is accepted;
- provider external status and mutable order `modified_at` are excluded from SLA timing;
- cancelled/returned orders are not applicable; missing/disabled policy makes no SLA assertion; malformed policy is surfaced as invalid evidence;
- SLA observation is read-only and cannot mutate order, fulfillment, stock or finance lifecycle.

### MetaForge operator surfaces

- Marketplace Connection credential + sync health cards;
- seller OAuth/re-auth entry points;
- dedicated manager-only `Lỗi SKU` inbox sourced from read-only mapping exception evidence;
- mapping inbox links to canonical `Marketplace SKU Mapping` and has no auto-map/write route;
- marketplace order search by provider order ID, Sales Order or Customer;
- local provider/status filters and a missing-canonical-link filter;
- policy-driven SLA queue for `Cần chú ý`, `Vi phạm`, `Chưa cấu hình` and `Tất cả`;
- SLA UI consumes server-derived state/due/fulfillment timestamps and never calculates thresholds in the browser;
- marketplace order identity + fulfillment/return actions;
- provider external-event health shown in fulfillment panel as evidence only;
- settlement exception workspace in `Đối soát`.

## Authority guard

No parallel authority was introduced for:

- Stock / ATP physical truth;
- GL / Payment / settlement ledger;
- Customer master;
- SKU mapping;
- credential material;
- OAuth state;
- fulfillment lifecycle;
- provider lifecycle;
- sync scheduler/lease;
- tenant routing.

Marketplace remains orchestration and operational evidence around canonical Forge authorities. Provider/browser input cannot choose ERP master data, stock truth, finance truth, tenant identity, actor identity, credential scope or canonical lifecycle state. SLA thresholds are explicit metadata policy; SLA observations are projections only and cannot create fulfillment truth.

## Dependency status

- `DR-COMMERCE-01 / WS04`: **engineering satisfied** — shared commercial reservation/ATP is reused.
- `DR-COMMERCE-02 / WS01`: **authority boundary satisfied** — settlement/COD evidence links to canonical Finance without parallel ledger; live provider statement certification remains external.
- `DR-COMMERCE-03 / WS10+WS11+WS12`: **production-shaped code seams implemented** — real developer apps, seller authorization, redirect URLs, certification/live webhooks and provider-specific operational/DLQ requirements remain external.
- `DR-COMMERCE-04 / WS02`: **engineering satisfied** — exact privacy-safe CRM identity authority is reused.

## Validation policy

Commerce validation is owned by `.github/workflows/commerce-ci.yml` and watches WS16 source, UI, migrations, tests and the two commerce governance documents.

Required exact-head evidence before merge/promotion:

- Omnichannel Commerce CI success;
- production-equivalent CloudForge + MetaForge builds;
- migration/restore/PITR safety;
- Workerd ERP lifecycle;
- auth/CSRF/tenant isolation;
- tenant provisioning;
- R6 Golden Flow;
- release-safety / observability / queue safety;
- Alumdoor composition/E18 authority;
- read-only pilot evidence.

The PR body is the authoritative location for the current validated SHA and workflow run IDs so this source checkpoint does not create a self-referential documentation commit loop.

## Remaining external / product work

External readiness:

- register real Shopee/Lazada/TikTok developer apps;
- configure Worker/provider secrets and redirect URLs;
- authorize real seller accounts;
- complete provider certification and live webhook verification;
- implement provider-specific production operational/DLQ requirements where certification requires them;
- controlled production promotion.

Product polish/future scope:

- outbound listing/price/promotion management;
- provider-specific refund/label flows;
- dedicated BI profitability/SLA report pack.

## Release classification

- Engineering risk: **STANDARD**.
- Release impact: **NEW_CANDIDATE**.
- Frozen Alumdoor R6/Pilot baseline: unchanged.
- Production mutation/deploy: none.
- PR #675 remains Draft.
- Merge/deploy: explicit approval boundary.