# E2E-01 — Sales / Order-to-Cash Entry

## Persona
Sales User / nhân viên bán hàng, non-admin.

## Business job
A customer requests an Alumdoor product using customer-facing dimensions. The salesperson must identify the customer/product, enter dimensions/quantity, understand the derived technical result, price and stock availability, and confirm an authoritative order without needing implementation knowledge.

## Starting readiness
According to the exact package/declaration, preflight must prove the required Company/currency, customer/customer group, selling price source, warehouse, sellable product/item, cutting/door policy, BOM/material mapping, UOM conversion and sufficient happy-path ATP/lot stock.

If a prerequisite is intentionally resolved by the Sales UI itself, it is not removed from the acceptance test by fixture setup.

## Operator steps
1. Complete E2E-00 as Sales User.
2. Click `Bán hàng` through the supported navigation.
3. Start a new sales transaction/composer.
4. Select the customer through the real Link/selection control.
5. Select product/system/configuration required by the declared Sales surface.
6. Enter customer-facing width/height dimensions.
7. Enter rail/leaf/configuration values required by the product.
8. Enter quantity.
9. Observe derived technical values such as phủ bì/lọt lòng/số lá or equivalent declared outputs.
10. Observe selling price/amount and verify expected calculation/rounding.
11. Observe ATP/material availability and warehouse/lot decision surfaced to Sales.
12. Add another line/set when the surface supports multi-item/multi-door order composition.
13. Save/create the Sales Order.
14. Confirm/submit/reserve through the supported business action.
15. Reopen the authoritative Sales Order through UI.
16. Verify entered and derived values survived readback.
17. Verify reservation/ATP/downstream status expected by the declared flow.
18. Verify the order appears in the relevant queue/history/report surface.

## Happy-path assertions
- all required controls are real usable controls, not dead placeholders;
- decimal/number/date input preserves operator intent;
- no unexplained configuration error appears after readiness is `READY`;
- derived dimensions/leaf count match the deterministic policy for the fixture;
- selling price and total match declared pricing/rounding;
- ATP result is based on authoritative stock and is understandable to Sales;
- one intentional confirmation creates one authoritative order/reservation effect;
- reopening returns the same business values;
- history/report can find the order under the persona's permission scope;
- zero unexpected page errors, console errors, 4xx/5xx and red-error UI.

## Required negative variants

### Insufficient stock
1. Use a fixture/request exceeding available ATP.
2. Attempt confirmation.
3. Verify the action is blocked for the correct business reason.
4. Verify no reservation/order state is falsely advanced.
5. Verify the UI tells Sales what is unavailable and what action is possible next.

### Permission
A user without sales-submit authority must not be able to perform the authoritative confirmation even if client controls are manipulated.

### Retry/double click
Repeat the confirm action or simulate safe retry according to the supported contract. Verify no duplicate order/reservation authority.

## FAIL examples
- red error due to missing Company/price/BOM/policy after preflight READY;
- a valid decimal is silently transformed;
- blank price with no actionable explanation;
- ATP cannot load or contradicts authoritative readback;
- save succeeds visually but record cannot reopen;
- retry creates duplicate reservation/order;
- admin-only workaround is required.

## Exit condition
Authoritative Sales Order exists in the intended lifecycle state, derived/pricing/ATP values are correct, reservation/downstream state is correct, and the transaction is visible in history/report without unexplained browser errors.

## Evidence
Final order screenshot, calculated/ATP checkpoint, authoritative reopened record, history/report checkpoint, network/browser summary, trace, safe document reference and exact candidate/package identity.
