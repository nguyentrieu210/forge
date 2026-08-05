# WS16 — Omnichannel Marketplace ERP checkpoint

Date: **2026-08-05**  
Branch: `feature/omnichannel-commerce-erp`  
PR: `#675`  
Base target: `main`

## Outcome

WS16 extends Forge as a consumer/orchestrator of existing ERP authorities rather than introducing a second ERP runtime or marketplace-specific business ledger.

Current candidate covers Shopee, Lazada and TikTok Shop, while reusing the existing Facebook/Social Commerce surface.

## Implemented engineering scope

- canonical channel, SKU mapping and connection metadata;
- provider adapters, OAuth, encrypted credentials, token refresh and sync health;
- canonical Sales Order ingestion with shared ATP/reservation;
- exact CRM marketplace-customer identity;
- monotonic provider event evidence and read-only SKU mapping exception inbox;
- canonical Delivery Note/Stock Return fulfillment and COD evidence;
- settlement evidence with canonical Invoice/Payment verification;
- operator search/filter, mapping inbox, provider diagnostics and settlement workspace;
- `Marketplace SLA Policy` per channel with explicit target/warning minutes and no default business threshold;
- server-derived order-to-fulfillment SLA using immutable order acceptance and first canonical-shipment evidence, excluding provider status and mutable order timestamps;
- read-only SLA queue with attention/breach/unconfigured views;
- migration `0123_marketplace_sla_context.sql` binds provider evidence to immutable channel policy scope.

## Authority guard

No parallel authority was introduced for Stock, GL/Payment, Customer, SKU mapping, credentials, OAuth state, fulfillment/provider lifecycle, sync scheduler/lease or tenant routing. SLA policy is explicit metadata; SLA observations are read-only projections.

## Validation policy

Commerce CI watches WS16 source/UI/migrations/tests and commerce governance documents. Exact-head merge/promotion evidence requires Commerce CI plus R6 production builds, migration/PITR, Workerd lifecycle/auth/provisioning, Golden Flow, release safety, queue/observability, Alumdoor/E18 and read-only pilot evidence.

The PR body owns the validated SHA/run IDs to avoid self-referential source-doc commits.

## Remaining external / product work

External readiness:
- live developer apps, Worker/provider secrets and redirect URLs;
- real seller authorization;
- provider certification/live webhooks;
- provider-specific production operational/DLQ requirements;
- controlled production promotion.

Product scope:
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