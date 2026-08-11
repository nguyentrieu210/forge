# AlumDoor Pricing Variant + Adjustment Rule Implementation

Date: 2026-08-11  
Branch: `feat/alumdoor-price-variant-adjustment-rules`  
Draft PR: #802 -> `exp/alumdoor-pricing-policy`  
Capabilities: `C03-015` Price list, `C03-016` Pricing rule, `C03-018` Discount approval

## Business contract

AlumDoor keeps the existing independent selling Price Lists (`Đại lý`, `Bán lẻ`). `Có ray` / `Không ray` is **not** another Price List. It is an Item Price dimension.

Canonical Item Price identity becomes conceptually:

`Item + Price List + UOM + price_variant`

Variant codes are identifiers, not translated labels:

- `STANDARD` — backward-compatible default for every existing Item Price with no variant field;
- `NO_RAIL` — a configured commercial variant;
- `WITH_RAIL` — a configured commercial variant.

The shared runtime does not attach AlumDoor semantics to those codes. A requested non-standard variant must fail closed when no matching Item Price exists; it must never silently fall back to `STANDARD`.

## Backend slice implemented on this branch

### Pricing resolver

`clouderp-pricing` now accepts `priceVariant` and returns canonical `price_variant`.

- missing/blank variant resolves to `STANDARD`;
- legacy Item Price names and data remain valid as `STANDARD`;
- field-based lookup includes the variant dimension;
- multiple active records are rejected only within the same exact Price List + Item + UOM + variant;
- UOM fallback/conversion preserves the requested variant;
- variant IDs are bounded canonical codes (`A-Z`, `0-9`, `_`, `-`).

### Persisted adjustment rule loader

`clouderp-selling` now has a generic loader for persisted `Sales Adjustment Rule` records and a server-authoritative resolver that feeds the existing deterministic adjustment evaluator.

Expected persisted parent fields:

- `code`
- `description` / `rule_name`
- `currency`
- `basis`: `FIXED | AREA_SQM | LENGTH_M | SET_COUNT`
- `rate`
- `scope`: `LINE | ORDER | UNRESOLVED`
- `exclusive_group`
- `priority`
- `taxable`
- `discountable`
- `valid_from`
- `valid_upto` (or compatibility alias `valid_to`)
- `disabled`
- `conditions` child rows

Expected condition child fields:

- `field` (or compatibility alias `fieldname`)
- `operator` / `op`: `eq | neq | in | not_in | lt | lte | gt | gte`
- `value`, or `values[]` for `in` / `not_in`

The loader preserves the persisted record name and document version beside each runtime rule so the Sales Order snapshot can later record exactly which revision produced an adjustment.

No door type, finish name, ray name or AlumDoor surcharge amount exists in the loader/resolver.

## Integration still required before RC

1. **Metadata/schema**
   - add `price_variant` to `Item Price`;
   - add `price_variant` (operator label: `Phương án giá`) and a generic finish/option fact such as `finish_type` to Quotation/Sales Order Item;
   - add parent `Sales Adjustment Rule` plus condition child DocType in the shared Selling/Pricing catalogue;
   - effective-date/version/permission metadata must be explicit.
2. **Sales Order authority**
   - pass each line's selected `price_variant` into `resolveServerPrice`;
   - build server facts from trusted line + Item master data;
   - call `resolveSalesAdjustments`;
   - snapshot Item Price name/variant and applied adjustment rule name/version/basis/rate/amount on the line;
   - expose money discount amount/adjustment amount while retaining hidden/auditable discount basis data;
   - replace the current manual AlumDoor order-level `surcharge_amount` authority where rule-driven adjustments apply.
3. **Price matrix**
   - current generic pricing matrix keys cells by `Price List + UOM`; it cannot safely display two variants at the same intersection yet;
   - add a business-neutral dimension contract (or another generic representation) before exposing variant editing in the matrix.
4. **Verification**
   - server TypeScript build;
   - focused variant/adjustment tests;
   - full server unit suite;
   - metadata dry-run once generator integration is complete;
   - real AlumDoor data case with Đại lý/Bán lẻ + No Rail/With Rail + discount basis + persisted surcharge rule.

## Dependency Request — concurrent metadata/UI work

The base branch is concurrently replacing business-specific child-grid behavior with metadata-driven presentation and is actively editing the AlumDoor brief/import generator. This branch deliberately does **not** edit `server/scripts/build-alumdoor-v2-brief.mjs` during that work.

Required handoff after that session settles:

- rebase this branch onto the new `exp/alumdoor-pricing-policy` head;
- add the schema/field declarations through the canonical brief/import generator, not by hand-editing generated JSON;
- wire the new fields into the generic metadata child-grid surface without adding `AlumDoor`/`ray` branches to shared renderer code.

At PR creation the base had moved four additional commits after this branch point; those four changes were confined to generic client grid files, not the server pricing files changed here. Rebase is still required before final verification.

## Release boundary

This branch/PR does not authorize merge or deployment. It is not RC until the integration and verification gates above pass on one exact rebased head.
