# Dependency Request — Alumdoor Sales pricing policy evidence

Date: 2026-08-06  
Updated: 2026-08-07  
Owner needed: Sales/Pricing business source owner  
Consumer: Alumdoor Sales Sheet  
Status: **PARTIALLY RESOLVED**

## Resolution recorded 2026-08-07

The owner instruction for the Sales Sheet now establishes these operator-facing rules:

1. `Cửa Đức` defaults the line discount to **15%**.
2. The 15% value is a **default**, not a lock: the operator may explicitly override it on the order line.
3. `Đại lý / Khách lẻ` is selectable on the current Sales Order as an order snapshot; changing it does **not** write back to the Customer master.
4. Customer type must immediately re-resolve the measurement vocabulary from the vertical domain authority. For the current Cửa Đức policy this means `Đại lý -> Phủ bì nhựa`, `Lẻ -> Phủ bì ray`; height input likewise comes from the policy context rather than a React constant.
5. Changing a semantic measurement basis invalidates the old entered dimension so the same number is never silently reinterpreted.

This decision supersedes the older sentence in `docs/ALUMDOOR-BAN-HANG-WIZARD.md` §5.2 that prohibited manual `customer_group` selection. The Customer record remains the default source, but the current order may override the `Đại lý / Khách lẻ` snapshot without mutating the master.

The runtime therefore may auto-fill the German-door 15% default from `alumdoor.sales.production_line_context`. React remains a projection and does not own the numeric rule.

## Why this dependency existed

The prior Sales Sheet client contained a presentation-side assumption that a German-door line may default to a 15% discount. Repository evidence at that time did not establish that as a general pricing rule.

Prior source evidence established:

- two imported selling Price Lists, `Giá niêm yết` and `Giá có ray`;
- Item Price records as the authoritative list-price source;
- Pricing Rule intentionally left empty because the available source files did not prove a safe generalized rule;
- at least one historical quotation containing a 15% discount, which was evidence for that quotation only.

## Still unresolved

The 2026-08-07 decision does **not** establish an automatic `Giá có ray` selection rule or a generalized stacking/effective-date pricing engine. Those still require source-bound evidence defining, where relevant:

1. applicable item / item group / door type scope for `Giá có ray`;
2. when `Giá niêm yết` vs `Giá có ray` is selected;
3. effective-from / effective-to dates;
4. whether another Pricing Rule / promotion stacks with the operator line discount;
5. rounding and currency semantics where they differ from canonical Sales Order behavior.

## Safe behavior after partial resolution

- Item Price / canonical pricing remains authoritative for automatic `Đơn giá`.
- `Cửa Đức` may receive the domain-provided 15% operator default.
- Manual line discount remains editable and is persisted in the current order calculation.
- `Giá có ray` is not guessed from UI wording or geometry.
- Independent Company/currency hydration, Customer context, Item/UOM hydration, live area/amount display, stock preview and grid presentation remain unblocked.
