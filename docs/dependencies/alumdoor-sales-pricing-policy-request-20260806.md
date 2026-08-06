# Dependency Request — Alumdoor Sales pricing policy evidence

Date: 2026-08-06
Owner needed: Sales/Pricing business source owner
Consumer: Alumdoor Sales Sheet

## Why this dependency exists

The current Sales Sheet client contains a presentation-side assumption that a German-door line may default to a 15% discount. Repository evidence does not establish that as a general pricing rule.

Current source evidence establishes:

- two imported selling Price Lists, `Giá niêm yết` and `Giá có ray`;
- Item Price records as the authoritative list-price source;
- Pricing Rule intentionally left empty because the available source files did not prove a safe generalized rule;
- at least one historical quotation containing a 15% discount, which is evidence for that quotation only, not a universal rule.

## Required business evidence

Before automatic discounting or automatic selection of `Giá có ray` can be made authoritative, provide a source-bound rule defining at minimum:

1. applicable item / item group / door type scope;
2. applicable customer or customer-group scope;
3. when `Giá niêm yết` vs `Giá có ray` is selected;
4. discount percentage or formula;
5. effective-from / effective-to dates;
6. whether discounts stack with another Pricing Rule / promotion;
7. rounding and currency semantics where relevant;
8. source document / owner approval.

## Safe behavior until resolved

- Item Price / canonical pricing remains authoritative for automatic `Đơn giá`.
- No new automatic numeric discount rule should be synthesized from one quotation.
- Discount remains explicit/operator-controlled unless an existing authoritative Pricing Rule resolves it.
- `Giá có ray` should not be guessed merely from UI wording or door geometry.

This dependency does not block independent fixes to Company/currency hydration, Customer context, Item/UOM hydration, immediate area display, Item Price lookup, request-race protection, amount calculation, stock preview or grid presentation.
