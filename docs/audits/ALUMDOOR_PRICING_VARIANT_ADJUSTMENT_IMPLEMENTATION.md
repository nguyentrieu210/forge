# AlumDoor Pricing Variant + Adjustment Rule Implementation

Date: 2026-08-11  
Branch: `feat/alumdoor-price-variant-adjustment-rules`  
Draft PR: #802 -> `exp/alumdoor-pricing-policy`  
Capabilities: `C03-015` Price list, `C03-016` Pricing rule, `C03-018` Discount approval

## Business contract

AlumDoor keeps the existing independent selling Price Lists (`Đại lý`, `Bán lẻ`). `Có ray` / `Không ray` is **not** another Price List. It is an Item Price dimension.

Canonical Item Price identity becomes conceptually:

`Item + Price List + UOM + price_variant`

Vertical apps may configure identifiers such as `NO_RAIL` and `WITH_RAIL`, but the shared pricing schema/runtime knows only the generic variant contract. `STANDARD` is the compatibility default for every existing Item Price with no variant field.

A requested non-standard variant must fail closed when no matching Item Price exists; it must never silently fall back to `STANDARD`.

## Implemented on this branch

### 1. Variant-aware Item Price authority

`clouderp-pricing` accepts `priceVariant` and returns canonical `price_variant`.

- missing/blank variant resolves to `STANDARD`;
- legacy Item Price names and data remain valid as `STANDARD`;
- field-based lookup includes the variant dimension;
- multiple active records are rejected only within the same exact Price List + Item + UOM + variant;
- UOM fallback/conversion preserves the requested variant;
- variant IDs are bounded canonical codes (`A-Z`, `0-9`, `_`, `-`).

Migration `0117_pricing_variants_adjustment_rules.sql` appends the generic `price_variant` field to the shared `Item Price` DocType with default `STANDARD`. No existing document rewrite is needed because runtime compatibility treats a missing legacy value as `STANDARD`.

### 2. Persisted Sales Adjustment Rule DocTypes

Migration `0117_pricing_variants_adjustment_rules.sql` also creates shared Selling metadata for:

- `Sales Adjustment Rule` master DocType;
- `Sales Adjustment Condition` child DocType.

The parent owns:

- `code`
- `rule_name` / description
- `currency`
- `basis`: `FIXED | AREA_SQM | LENGTH_M | SET_COUNT`
- `rate`
- `scope`: `LINE | ORDER | UNRESOLVED`
- `exclusive_group`
- `priority`
- `taxable`
- `discountable`
- `valid_from`
- `valid_upto`
- `disabled`
- `conditions` child rows

Condition rows own:

- `field`
- `operator`: `eq | neq | in | not_in | lt | lte | gt | gte`
- typed JSON `value`, or `values[]` for `in` / `not_in`.

Sales Manager/System Manager can maintain rules; Sales User is read-only. The shared migration contains no AlumDoor product names, ray names, finish names or surcharge amounts.

### 3. Persisted adjustment loader + canonical revision snapshot

`clouderp-selling` converts active, effective-dated rule documents into the existing fixed-point deterministic evaluator.

`listMasterRecordData()` correctly exposes only `{name,data}`. Therefore, after matching a money-changing rule, `resolveSalesAdjustments()` re-reads the exact `Sales Adjustment Rule:<name>` through the Document Kernel and snapshots its canonical document `version`. An applied rule without a canonical active document fails closed.

This keeps transaction explanation anchored to a real versioned business-rule document rather than an anonymous seed payload.

### 4. Commercial line resolver

`resolveCommercialLine()` now composes the generic authorities:

1. resolve actual selling Item Price by `price_variant`;
2. optionally resolve an independent Item Price variant as the discount basis;
3. resolve persisted adjustment rules from trusted commercial facts;
4. calculate gross, discount-basis money, discount money, adjustment money and net-before-tax using fixed-point arithmetic;
5. return snapshot-ready Item Price and applied-rule identities/revisions.

The shared resolver has no knowledge of `Cửa Đức`, `Cửa Úc`, `ray`, `sơn vân gỗ` or any AlumDoor surcharge amount.

A focused contract test covers the required shape where a line sells using a higher configured variant while the discount basis remains `STANDARD`, then adds a persisted area-based adjustment.

### 5. Sales line snapshot contract

Shared `SalesItem` now has fields for:

- selected `price_variant`;
- `discount_basis_item_price` and `discount_basis_variant`;
- discount-basis rate;
- discount money;
- adjustment money;
- applied adjustment rule snapshots containing rule name/version/basis/rate/amount.

This is the storage contract needed for historical reconstruction once Sales Order normalization is wired to the resolver.

## Integration still required before RC

### Sales Order / Quotation authority

- pass each line's selected `price_variant` through the commercial-line resolver;
- decide the discount-basis variant from server-owned customer/pricing policy, not from client money fields;
- build adjustment facts from trusted line + Item master data;
- persist the returned price/discount/adjustment snapshots;
- expose money discount/adjustment values while retaining hidden/auditable percentage and basis fields;
- transition the current manual AlumDoor order-level `surcharge_amount` path where rule-driven line adjustments apply.

### AlumDoor metadata/UI

The concurrent base session currently owns `build-alumdoor-v2-brief.mjs`, `alumdoor-v2.json` and the generic metadata child-grid convergence. This branch deliberately does not edit those sources while they are moving.

After that work settles:

- rebase onto the exact latest `exp/alumdoor-pricing-policy` head;
- declare Sales/Quotation line `price_variant` through the canonical brief/import generator with operator label such as `Phương án giá`;
- declare generic commercial fact field(s), for example a finish/option classification, through metadata;
- show `discount_amount` / `adjustment_amount` as required by the operator view;
- do not add `AlumDoor`, `ray` or finish-specific branches to shared renderer code.

### Item Price matrix

The current generic Item Price matrix keys a cell by `Price List + UOM`; it cannot represent two independent variants at one intersection without ambiguity. Add a business-neutral dimension contract (or another generic representation) before exposing variant editing in the matrix. Do not encode `ray` as a renderer-specific axis.

## Verification state

Implemented test assets:

- variant resolver tests;
- persisted adjustment-rule loader tests;
- canonical adjustment revision tests;
- commercial-line resolver tests;
- migration idempotency/metadata test, included in `test:sql`.

A standalone in-memory SQLite smoke of the migration logic passed during implementation. **The exact branch has not yet produced a GitHub Actions/local-runner verification run**, so server TypeScript build, full unit suite, full SQL suite and metadata dry-run are not claimed green.

Final gates still required on one exact rebased head:

- server TypeScript build;
- focused pricing/adjustment tests;
- full server unit suite;
- full SQL suite;
- metadata dry-run after generator integration;
- real AlumDoor case covering independent Đại lý/Bán lẻ Price Lists, selected price variant, discount basis and persisted surcharge rule.

## Dependency Request — concurrent metadata/UI work

At the latest comparison, `exp/alumdoor-pricing-policy` had advanced 13 commits from this branch's merge base. Those commits are confined to generic client child-grid presentation plus AlumDoor `v2` brief/generator work; they do not modify this branch's server pricing/selling/migration files. Ownership remains separable, but final rebase is required before verification and PR readiness.

## Release boundary

This branch/PR does not authorize merge or deployment. It is not RC until the integration and verification gates above pass on one exact rebased head.