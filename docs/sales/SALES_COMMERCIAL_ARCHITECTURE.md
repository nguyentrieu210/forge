# Forge Sales Commercial Architecture

**Status:** LOCKED FOR IMPLEMENTATION PLANNING  
**Decision date:** 2026-08-11  
**Scope:** shared Forge Selling/Pricing core; AlumDoor is the reference vertical  
**Risk:** CRITICAL where authoritative money, stock, migration or fulfillment is changed

## 1. Problem statement

AlumDoor exposes several business choices that currently look similar on one Sales Order row but are not the same domain concern:

- dimensions and billable area;
- dealer vs retail price;
- with-rail vs without-rail price;
- full-set vs split-item selling;
- discount policy;
- wood-grain / special-color / size surcharge;
- which physical components must be delivered;
- which raw materials must be consumed in manufacturing.

Treating these as one rule system causes authority overlap. Treating each as a hard-coded UI field causes vertical logic to leak into shared runtime. The target architecture therefore separates the concerns into explicit authorities and composes them through a single server-owned commercial pipeline.

## 2. Architectural principles

This design follows the Forge completion rules:

- authoritative calculations execute server-side;
- money uses fixed-point/scaled integer semantics;
- runtime stays business-neutral;
- vertical values are configuration/data unless they are genuine vertical algorithms;
- accepted commercial documents snapshot the rules and values that produced the agreed result;
- physical fulfillment and financial pricing are related but distinct;
- manufacturing BOM is not a sales bundle;
- correction/amendment/reprice is explicit and auditable;
- no downstream flow silently reinterprets an already accepted commercial agreement.

## 3. Six authorities

### 3.1 Measurement / Cutting Policy — geometry authority

Owns geometry and derived quantity facts, for example:

- measured width/height;
- customer-specific measurement basis when legitimately part of the product formula;
- cut width;
- leaf/slat count;
- billable area;
- minimum billable area;
- production geometry facts;
- sales mode inputs such as `Trọn bộ` / `Tách món` where they affect the measurement formula.

It does **not** own:

- selling price;
- discount percentage;
- surcharge amount;
- physical sales-package composition;
- manufacturing raw-material composition.

### 3.2 Item Price — base-price authority

Owns the base commercial rate for one effective intersection:

```text
Price List + Item + UOM + Price Variant + effective date
```

Target key semantics:

```text
price_list
item_code
uom
price_variant
currency
rate
valid_from / valid_upto (when supported by the canonical pricing contract)
disabled
version / OCC
```

Legacy records without `price_variant` resolve as `STANDARD` only for backward compatibility.

Item Price does **not** own discounts, conditional surcharges or sales-package component lists.

### 3.3 Pricing Rule — single commercial-adjustment authority

`Pricing Rule` is the one reusable policy system for conditional commercial effects.

Target conditions may include business-neutral facts such as:

```text
price_list
item_code
item_group
party / customer
customer_group
sales_option
price_variant
finish_type
color
qty
area_sqm
length_m
set_count
posting_date
```

Target effect types:

```text
RATE_OVERRIDE
DISCOUNT_PERCENT
DISCOUNT_AMOUNT
ADJUSTMENT
```

Adjustment bases:

```text
FIXED
PRICED_QTY
AREA_SQM
LENGTH_M
SET_COUNT
```

Rules may additionally carry:

- priority/specificity;
- exclusive group;
- effective dates;
- taxable flag;
- discountable flag;
- disabled/status;
- audit/version metadata.

The shared evaluator may be code, but rule values and vertical conditions are records/configuration. Shared TypeScript must not contain hard-coded AlumDoor amounts or door names.

`Sales Adjustment Rule` is **not** a second permanent authority. Prototype logic from PR #802 can be folded into `Pricing Rule` and its generic evaluator.

### 3.4 Sales Option — operator-choice authority

A Sales Option is the user-visible commercial configuration choice for an Item. Examples:

- `Không ray`;
- `Có ray`;
- `Trọn bộ`;
- `Tách món`.

The operator should not manually coordinate hidden fields such as:

```text
sales_mode
price_variant
sales_package
```

Instead a selected Sales Option deterministically resolves those values.

Conceptual contract:

```text
code
label
item/item_group applicability
price_variant
sales_mode
sales_package (optional)
default flag
active/effective state
```

Implementation may initially use an Item child configuration rather than a global master if that avoids unnecessary authority proliferation. What matters is the deterministic contract, not the storage shape.

Sales Option does **not** calculate discounts or surcharge amounts. It selects the commercial/fulfillment configuration that becomes part of the pricing facts.

### 3.5 Sales Package — fulfillment-composition authority

Sales Package answers:

> When this commercial line is sold under this option, which physical items must be delivered and in what quantities?

Target package component quantity bases are business-neutral and may include:

```text
FIXED
HEIGHT
WIDTH
CUT_WIDTH
AREA
SET_COUNT
LEAF_COUNT
```

A package component can carry:

```text
component_item
uom
qty_basis
factor
required
default_selected
deduct_from_parent
deduct_from_discount_basis
sales_option (optional, for a separately priced selectable child)
role
warehouse/fulfillment hints when legitimate
```

A Sales Package is versioned/effective-dated and must be snapshotted on an accepted/order commercial line so later package edits do not mutate historical fulfillment obligations.

`selection_mode = ALL` represents one priced commercial parent with all physical obligations. `selection_mode = SELECTABLE` represents split-item selling: selected components are priced through their own Item Price/Pricing Rule, retain parent/component provenance, and their configured gross value is allocated out of the full-set parent so revenue is not counted twice. Sales Package still never stores price.

Sales Package does **not** describe manufacturing consumption.

### 3.6 BOM — manufacturing-consumption authority

BOM answers:

> What materials/subassemblies/operations are consumed to manufacture this Item?

BOM remains under Manufacturing/MRP authority with its existing revision, effective date, Work Order snapshot, consumption and stock-posting invariants.

A component delivered with a door is not automatically a BOM material. If a rail is taken from stock and delivered next to a door, Sales Package owns that fulfillment relationship. If that rail itself must be manufactured, the rail Item may have its own BOM.

## 4. Quantity taxonomy — mandatory separation

The implementation must not use one `qty` concept for all downstream concerns.

At minimum distinguish:

```text
billable_qty / priced_qty
physical_fulfillment_qty
production_qty
stock_qty
```

Definitions:

- **billable/priced quantity** — quantity multiplied by selling rate;
- **physical fulfillment quantity** — quantity that must be delivered for the commercial promise;
- **production quantity** — quantity a Work/Production Order must create;
- **stock quantity** — canonical stock-ledger quantity after UOM conversion.

These values may coincide for simple Items but must never be assumed identical by shared code.

For dimensional doors this is critical: a customer-specific billable width or minimum area can change revenue without changing the physical door being manufactured or the inventory unit being produced.

## 5. Canonical commercial pipeline

The target server flow for one Sales/Quotation line is:

```text
Customer
  -> resolve Customer Group / Price List

Item + Sales Option + entered dimensions
  -> Measurement/Cutting Policy
  -> canonical commercial facts

Sales Option
  -> price_variant
  -> sales_mode
  -> optional sales_package

Item Price
  -> base selling rate for Price List + Item + UOM + Price Variant

Pricing Rule
  -> rate override / discount / adjustment(s)

Commercial arithmetic
  -> gross
  -> discount basis
  -> discount amount
  -> adjustment amount(s)
  -> net before tax

Tax authority
  -> tax/VAT

Commercial snapshot
  -> persisted on Quotation/Sales Order line
```

The client only renders projections and editable business inputs. It never owns final discount, surcharge or line total calculations.

## 6. One server pricing resolver

Target domain API concept:

```text
resolveCommercialLine(context)
```

It is the one server-owned calculation path used by:

- Quotation preview/save/submit;
- Sales Order save/submit;
- explicit Reprice action;
- downstream mapping when commercial snapshot is intentionally refreshed;
- UI preview endpoint/projection.

The existing split where UI context independently reads Item Price while Sales Order normalization applies another pricing path must converge on this one resolver.

The resolver result should expose a traceable snapshot rather than only a final rate:

```text
price_list
item_price
price_variant
base_rate
selling_rate
gross_amount
discount_basis_rate
discount_basis_amount
discount_effect
pricing_rule_ids / versions
discount_amount
adjustments[]
adjustment_amount
net_before_tax
currency / scale
pricing_as_of
```

## 7. Discount semantics

Line discount must be computed server-side from authoritative facts and rule data.

The server must not merely attach `discount_percentage` and trust a client-supplied aggregate `discount_amount`.

The model must support an independent discount basis when required. Example:

```text
selling price variant: WITH_RAIL
selling rate:          1,701,000 / m²
discount basis variant: NO_RAIL or BASELINE
discount basis rate:   1,626,000 / m²
discount policy:       15%
```

For 10 m²:

```text
gross                 = 17,010,000
discount basis amount = 16,260,000
discount amount       =  2,439,000
net before adjustment = 14,571,000
```

The operator UI may hide the percentage and show only `Tiền CK`, but the authoritative snapshot retains rule source and basis for audit/explainability.

## 8. Adjustment / surcharge semantics

Surcharge is a commercial effect evaluated by `Pricing Rule`, not an arbitrary header amount supplied by the client.

Examples expressible as configuration:

```text
finish_type = WOOD_GRAIN
-> ADJUSTMENT / AREA_SQM / configured rate

item_group = target rail group AND finish_type = OTHER_COLOR
-> ADJUSTMENT / LENGTH_M / configured rate

door class = Australian AND area_per_set_sqm within configured interval
-> ADJUSTMENT / SET_COUNT / configured rate
```

Multiple adjustments may stack unless their exclusive-group rules say otherwise. Tie behavior must fail closed, not pick an arbitrary rule.

## 9. Price variant semantics

Price Variant is a dimension of Item Price. It selects a base rate; it does not itself cause physical stock movement.

Examples:

```text
STANDARD
NO_RAIL
WITH_RAIL
FULL_SET
SPLIT
```

The values are data/configuration. Shared renderer/pricing code does not branch on the literal names.

The target Item Price matrix becomes conceptually:

```text
row axis    = Price Variant x UOM
column axis = Price List
cell        = Rate
```

This preserves independent Dealer/Retail Price Lists without multiplying Price Lists for every product option.

## 10. Sales Option and Sales Package relationship

Sales Option selects both money and fulfillment configuration but does not calculate either itself.

Example:

```text
Sales Option: WITH_RAIL
  -> price_variant = WITH_RAIL
  -> sales_package = GERMAN_DOOR_WITH_RAIL
```

Sales Package then expands physical obligations:

```text
Door item     x package-defined basis
Rail item     x HEIGHT / other canonical fact
```

A Pricing Rule may react to `sales_option` as a fact for discounts/adjustments, but a Pricing Rule must not silently replace the physical package as a side effect of rule priority.

Promotion/gift programs that legitimately add free goods should be modeled as an explicit promotion/fulfillment effect with its own traceability, not hidden inside a monetary discount action.

## 11. Quotation -> Sales Order commercial freeze

Once a Quotation reaches the accepted/customer-agreed state, its commercial snapshot is frozen.

Conversion to Sales Order copies the accepted snapshot, including at least:

- dimensions and formula policy/version;
- sales option;
- price variant and Item Price source;
- base/selling rate;
- discount basis and discount money;
- adjustment breakdown and rule versions;
- package identity/revision/checksum and component snapshot when package support is active;
- currency/tax context required to reproduce the agreed amount.

A later change to Price List, Pricing Rule, Sales Package or Cutting Policy must not silently alter the accepted commercial agreement.

If business wants current pricing, expose an explicit `Reprice` action with:

- permission/approval;
- reason;
- before/after snapshot;
- audit event;
- deterministic recalculation at a declared `as_of` time.

## 12. Fulfillment identity

Fulfillment must bind to a source commercial line, not only `item_code`.

Minimum identity:

```text
sales_order
sales_order_line_key
package_component_key (when package-expanded)
item_code
qty
```

This prevents two rows of the same Item with different color/size/options from consuming each other's delivered/billed quantities.

The same identity is required for:

- partial delivery;
- partial billing;
- return;
- warranty trace;
- package component reconciliation;
- COGS roll-up.

## 13. Delivery, invoice and COGS model

For a commercial parent line sold as a package:

- Sales Order / customer-facing Invoice may show one commercial line;
- Delivery Note/stock ledger posts the physical package components;
- revenue stays attached to the commercial line;
- COGS comes from physical stock/component valuation and is rolled up to the commercial line for margin reporting.

Target reconciliation:

```text
Commercial line revenue
- sum(component COGS)
= gross margin for the sold package
```

Package expansion must not duplicate revenue on child components unless the business explicitly prices them as independent lines.

## 14. Production orchestration

A Sales Package component can be:

- available stock;
- procurement demand;
- manufacturable demand.

Production orchestration decides how to satisfy the component. If manufacturable, it resolves the Item's BOM and creates/links the proper Production/Work Order according to the manufacturing domain contract.

Sales Package never embeds the BOM rows directly.

## 15. Tax boundary

Pricing Rule owns commercial price effects. Tax/VAT belongs to the tax/totals authority.

The current AlumDoor `vat_rate` / manual surcharge compatibility path may remain temporarily for migration, but the target is:

```text
commercial net
+/- rule-driven adjustments
-> tax engine/template/rule
-> grand total
```

Tax configuration must remain version/effective-date aware where required by compliance scope.

## 16. Approval and manual override

Manual price/rate/discount override is an exception, not a second pricing model.

Required behavior:

- compare manual override against authoritative resolved snapshot;
- flag approval requirement server-side;
- restrict submit to authorized role when policy requires;
- preserve before/after amount and reason;
- never overwrite the master Item Price because one order was manually approved.

## 17. Correction semantics

### Draft

May recalculate when operator changes customer, option, dimensions or date.

### Submitted Sales Order

No silent historical mutation. Changes use amendment/correction semantics.

### Accepted Quotation

Frozen unless explicit reprice/amend workflow is invoked.

### Delivery / Invoice / Return

Must reference the exact source-line/component snapshot used for fulfillment. Cancellation/reversal returns the original ledger/fulfillment effect rather than recalculating current rules.

## 18. Compatibility and migration principles

- legacy Item Price with no `price_variant` => `STANDARD`;
- existing Sales Order rows without commercial snapshot remain readable and use an explicit legacy path; do not invent historical rule provenance;
- new documents after migration must persist the new snapshot contract;
- migration scripts are append-only/idempotent and must be replay-tested;
- no data rewrite may silently change historical monetary totals;
- any backfill that cannot prove the original business fact must mark provenance as legacy/unknown rather than guessing.

## 19. Rejected anti-patterns

### A. Four Price Lists for rail combinations

Rejected because each new option multiplies the Price List dimension.

### B. Hard-coded rail/door/discount branches in shared controller

Rejected because shared runtime gains vertical literals and policy changes require deploys.

### C. `Sales Adjustment Rule` as parallel authority

Rejected because `Pricing Rule` already owns conditional price policy; two rule systems create ambiguous precedence and audit.

### D. BOM as Sales Package

Rejected because delivery composition and manufacturing consumption are different state machines and have different correction/ledger consequences.

### E. Client-calculated final money

Rejected because authoritative money must be deterministic and server-verified.

### F. Repricing accepted quotation during conversion

Rejected because it changes an agreed commercial contract without explicit user action.

## 20. Target maturity gates

The architecture is not considered production-ready until all of these are evidenced:

- one authoritative pricing resolver used by preview and submit;
- server-derived line discount/adjustment money;
- no AlumDoor-specific discount/price literals in shared Sales/Pricing runtime;
- price-variant Item Price lookup with fail-closed ambiguity behavior;
- source-line-key fulfillment;
- accepted quotation freeze + explicit reprice action;
- Sales Package version/snapshot and component fulfillment;
- partial delivery/billing/return tests;
- BOM remains manufacturing-only;
- permission/approval tests;
- migration replay/idempotency;
- fixed-point money tests;
- end-to-end AlumDoor Golden Flows in the companion test plan.
