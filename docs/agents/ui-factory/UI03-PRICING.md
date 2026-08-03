# UI03 — PRICING

Date: 2026-08-03
Baseline: `main@55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`
Branch: `agent/ui-03-pricing`
Role: pricing-domain projection/action boundary for Matrix

## Mission

Extract the business semantics currently embedded in the Alumdoor Item Price Manager into server-authoritative pricing-domain projection/actions that a generic Matrix renderer can call.

Do not redesign the renderer and do not move pricing rules into generic metadata/kernel code.

## Read first

1. exact branch/main/PR state;
2. `CURRENT_STATUS.md`, `NEXT_TASKS.md`;
3. `skills/forge-enterprise-completion/SKILL.md`;
4. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
5. current `client/packages/views/src/bulk/ItemPriceMatrixPanel.tsx` save/read behavior;
6. `server/packages/clouderp-pricing/**` and existing pricing authority;
7. Item/Price List/Item Price/UOM/UOM Conversion models/controllers/APIs;
8. permission/OCC/idempotency conventions in current server packages;
9. `server/docs/METAFORGE-BULK-VIEW-ARCHITECTURE-20260802.md`.

## Owned scope

Preferred ownership:

- `server/packages/clouderp-pricing/**`;
- narrowly related pricing server routes/actions/projections;
- pricing-specific tests/fixtures;
- no client renderer code.

If a truly generic action/projection primitive is missing in WS00-owned infrastructure, write a Dependency Request instead of moving pricing logic into kernel.

## Current debt to remove

The current React price manager directly:

- queries Price List, Item Group, Item, UOM, Item and Item Price;
- composes UOM conversions client-side;
- updates Item UOM conversion rows;
- disables Item Price records for removed UOMs;
- creates/updates Item Price rows;
- creates Price List records;
- coordinates optimistic concurrency through `modified` values.

That behavior proves the UX but is not the target authority boundary.

## Required read projection

Design a permission-aware, bounded read projection suitable for the Matrix reference. It should be able to provide, in a stable business-neutral shape consumed through a named source:

- price-list axis metadata;
- item-group/item navigation data or a bounded/searchable way to fetch it;
- selected item identity/details required by pricing;
- active/configured UOMs and conversion factors;
- sparse existing Item Price cells;
- server-derived capabilities/actions;
- version/OCC tokens required for safe commit.

Avoid a client pattern that requires one request per matrix cell.

## Required write action

Provide a compound server-authoritative action for a selected item/matrix change set. It must define and test:

- permission boundary;
- tenant scope from trusted context;
- Item/UOM/Price List/Item Price validation;
- currency/precision semantics using existing pricing authority;
- add/update/remove UOM behavior;
- create/update/disable price behavior;
- OCC/conflict detection;
- idempotency/retry behavior where duplicate effects are possible;
- atomicity vs explicit partial-failure semantics;
- audit/history expectations;
- stable error model for renderer feedback.

Do not silently mutate authoritative history where a domain correction path is required.

## Preserve existing authority

Reuse `clouderp-pricing` and canonical price resolution. Do not create a second price source of truth for Matrix convenience.

The generic Matrix renderer should only know a named read source and named actions. Pricing rules stay here.

## API/action design guidance

Prefer a small domain contract such as:

- `pricing.item_price_matrix.read`
- `pricing.item_price_matrix.commit`
- `pricing.price_list.create`
- optional `pricing.item_uom.add/remove` only if separation is cleaner

Names are illustrative, not mandatory. Follow existing package/action naming conventions found in exact repo state.

## Parallel boundary

META owns the generic metadata reference shape to named source/action.
RUNTIME owns how actions are displayed/invoked.
ALUM owns UX parity fixtures.
QA owns cross-domain proof/evidence.

Do not edit their hotspots.

## Tests/evidence

At minimum cover:

- no permission;
- wrong tenant isolation;
- stale OCC token;
- invalid/zero/negative conversion factor as applicable;
- invalid price value;
- disabled Price List semantics;
- add UOM + price in one change set;
- remove UOM with affected Item Prices;
- update existing price;
- create missing price;
- retry/idempotency behavior;
- bounded read/search behavior;
- no duplicate source of truth.

## Acceptance

Wave A is complete when:

- a clear projection/action contract exists;
- pricing correctness is server-authoritative;
- React no longer needs to own compound business rules in the target design;
- tests/evidence and remaining dependency requests are recorded;
- no generic runtime/kernel receives pricing-specific semantics;
- branch remains unmerged/un-deployed pending convergence approval.

Target maturity: `Foundation` to `Wired` for the pricing Matrix API boundary. It cannot be RC until integrated with metadata/runtime and Alumdoor parity.

## Prompt to start this agent

`Đọc docs/agents/ui-factory/UI03-PRICING.md và Forge Enterprise Completion Skill. Làm owner PRICING trên branch hiện tại: audit ItemPriceMatrixPanel và clouderp-pricing, kéo read projection + compound write semantics về server pricing authority, giữ permission/OCC/idempotency/tenant invariant. Không sửa generic renderer/meta contract. Nếu cần shared primitive ghi Dependency Request. Không merge/deploy.`

---

## Implementation evidence — 2026-08-03

Implemented in `server/packages/clouderp-pricing/src/matrix.ts`:

- named source `pricing.item_price_matrix.read`;
- named compound action `pricing.item_price_matrix.commit`;
- named action `pricing.price_list.create`;
- trusted context owns `tenantId` and `actor`; renderer input cannot select a tenant or identity;
- permission-aware record/query ports and mutation ports are explicit contracts rather than hidden client assumptions;
- bounded/searchable item navigation and sparse Item Price cells replace one-request-per-cell designs;
- projection returns Item/Item Price OCC versions plus server-derived capabilities;
- UOM conversion validation uses six-decimal fixed-point semantics;
- price normalization uses the canonical Currency master scale and never hard-codes VND;
- stock UOM cannot be removed or given a factor other than 1;
- removed non-stock UOMs clear affected Item defaults and disable active Item Price rows instead of deleting history;
- disabled Price Lists cannot receive a newly enabled price;
- duplicate active Item Price rows for the same `(price_list, item, uom)` fail closed rather than creating a second price authority;
- existing price edits require OCC unless the exact desired state is already present, which permits safe replay after a previous partial commit;
- writes are preflighted and then executed as ordered idempotent document-kernel operations through an adapter contract;
- because the current kernel command/store is aggregate-scoped, this slice does **not** pretend cross-document atomicity exists. If a later operation fails after earlier writes succeeded, the action returns `PRICING_MATRIX_PARTIAL_FAILURE` as retryable and the same `requestId` safely continues from the resulting state.

Package export added: `@cloudforge/clouderp-pricing/matrix`.

### Targeted verification

`server/tests/pricing-matrix-authority.test.mjs` covers 13 authority cases:

1. bounded/searchable read + sparse cells + OCC + capabilities;
2. read permission fail-closed;
3. trusted tenant isolation;
4. stale Item OCC;
5. invalid conversion factor and negative price;
6. disabled Price List semantics;
7. add UOM + create price in one change set;
8. remove UOM + clear defaults + disable affected price;
9. stale/current Item Price OCC and update without duplicate creation;
10. explicit partial failure + same-request retry;
11. replayed desired price is a no-op;
12. duplicate active business cell detection;
13. Price List creation with caller-selected currency/reference validation.

Local isolated strict-TypeScript compile using the repository compiler flags: PASS.
Local targeted Node test run: `13/13 PASS`.

### Atomicity/audit boundary

`PricingMatrixMutationPort` is deliberately an adapter contract, not a second store. Its implementation must route every create/update through the canonical Document kernel so normal audit, versioning, idempotency receipts and document invariants remain authoritative. The pricing package does not write D1/master projections directly.

## Dependency Request

Owner: `agent/ui-00-control` / WS00 shared Matrix source-action infrastructure

Need: a generic registered named-source/named-action adapter that can bind Matrix metadata/runtime calls to a domain service such as `@cloudforge/clouderp-pricing/matrix`, supplying permission-aware record access plus canonical Document-kernel mutations.

Why: exact repo state has Frappe resource/method dispatch and app-method dispatch, but no generic Matrix domain-source/action registry. Adding pricing-specific cases to the shared Frappe router would violate UI03 ownership and move domain semantics into platform infrastructure.

Blocked scope: exposing `pricing.item_price_matrix.read`, `pricing.item_price_matrix.commit` and `pricing.price_list.create` to META/RUNTIME, then removing the compound Item/UOM/Item Price save rules from `ItemPriceMatrixPanel.tsx`.

Can continue independently: yes — pricing authority contract, invariants and targeted regression are complete in UI03 ownership.

Next independent work: completed; integration belongs to WS00/META/RUNTIME/ALUM convergence and QA evidence.

## Handoff state

Current maturity: **Foundation** at the Matrix API/domain boundary. Server pricing semantics and tests exist, but the generic source/action adapter is not yet wired, so this cannot be called Wired/RC.

Risk class: **STANDARD** (server business behavior and money/UOM semantics, no ledger/schema/migration in this slice).

Merge/deploy: **blocked by policy**. This branch contains server business behavior, therefore it must go through PR/CI and remain unmerged/un-deployed until explicit convergence approval.
