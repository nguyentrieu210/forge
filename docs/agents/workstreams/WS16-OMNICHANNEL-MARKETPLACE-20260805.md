# WS16 — Omnichannel Marketplace ERP checkpoint

Date: **2026-08-05**  
Branch: `feature/omnichannel-commerce-erp`  
Base: `main@5db9b0dff0c1aade9b807bf0977311127b4fb956`

## Outcome

Opened the marketplace extension as a WS16 consumer of existing Forge authorities rather than a new ERP codebase.

Implemented independent scope:

- Shopee/Lazada/TikTok Shop provider-neutral order contract;
- collision-resistant deterministic external-order lineage;
- `Commerce Channel Profile` metadata;
- deterministic `Marketplace SKU Mapping` metadata;
- server-side resolution of Company/Customer/Currency/Price List/Warehouse/Item from tenant metadata;
- canonical Sales Order conversion through the existing DocumentKernel/O2C bridge;
- fail-closed provider merchandise-total reconciliation;
- source-contract regression;
- product architecture and dependency map in `docs/OMNICHANNEL_COMMERCE_ERP.md`.

## Authority guard

No Stock, GL, Payment or provider credential source of truth was added. Marketplace state remains channel/orchestration evidence around canonical ERP documents.

The current compatibility bridge uses deterministic marketplace lineage through the existing `social_*` Sales Order lineage fields. Generalizing those shared fields is optional future cleanup and was not taken here because it would widen the shared contract blast radius without being required for authority correctness.

## Dependencies

- `DR-COMMERCE-01 / WS04`: generic atomic stock reservation/ATP.
- `DR-COMMERCE-02 / WS01`: provider payout/fee/voucher/shipping/refund settlement into canonical finance.
- `DR-COMMERCE-03 / WS10+WS11+WS12`: production provider adapters, credential lifecycle, queue/DLQ/replay/health.
- `DR-COMMERCE-04 / WS02`: customer identity linking policy.

Independent implementation continues to be valid without inventing substitutes for these dependencies.

## Validation state

Source-contract test added at:

`server/tests/ws16-marketplace-order-source-contract.test.mjs`

Executable exact-head build/test evidence is required before merge. Do not infer PASS from authored tests alone.

## Release classification

- Engineering risk: **STANDARD** for this isolated slice.
- Release impact: **NEW_CANDIDATE**.
- Frozen Alumdoor R6/Pilot baseline: unchanged.
- Production mutation/deploy: none.
- Merge/deploy: explicit approval boundary.
