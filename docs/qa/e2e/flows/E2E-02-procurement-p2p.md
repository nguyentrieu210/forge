# E2E-02 — Procurement / Purchase-to-Receipt

## Persona
Purchase User / nhân viên mua hàng, non-admin.

## Business job
Create a supplier purchase transaction from the purchase workspace, receive the goods through the supported receiving path, and verify stock/supplier/history outcomes without jumping to developer or raw DocType tooling.

## Starting readiness
Preflight proves required Company, Supplier, purchase item/profile, UOM/conversion, buying price or permitted direct-price entry, target warehouse and any required order/receipt linkage.

## Operator steps
1. Complete E2E-00 as Purchase User.
2. Open `Mua hàng` through supported navigation.
3. Start a new purchase order/direct purchase transaction according to the declaration.
4. Select supplier using the real Link control.
5. Add item/profile and quantity/UOM.
6. Enter or verify unit price, tax/amount fields where in scope.
7. Verify target warehouse/context.
8. Save the purchase document.
9. Submit/confirm according to lifecycle.
10. Reopen and verify the saved document.
11. Enter the supported `Nhập hàng`/receipt flow from the purchase workspace.
12. Select/link the purchase order when required.
13. Enter received quantities/lots/FIFO data required by the selected receipt surface.
14. Preview when the declared flow supports preview.
15. Confirm receipt.
16. Reopen receipt and purchase order.
17. Verify received/outstanding state.
18. Verify stock/readback and supplier-related history/dashboard where applicable.
19. Verify transaction appears in purchase history/report.

## Happy-path assertions
- supplier/item/link controls work under Purchase User permissions;
- amount/UOM values remain correct after save/readback;
- purchase lifecycle advances once;
- receipt updates authoritative stock once;
- order received/outstanding state matches receipt;
- no hidden requirement forces the user into a different generic DocType route unless that route is explicitly the product workflow;
- no unexpected browser/network/red error.

## Required negative variants

### Over-receipt or invalid quantity
Attempt a quantity rejected by the canonical contract. Verify clear business rejection and no unintended stock mutation.

### Permission
A persona without submit/receipt authority must fail closed at the authoritative action.

### Retry/double submit
Repeat the receipt action safely and verify no duplicate stock receipt.

## FAIL examples
- purchase form opens but supplier/item links fail;
- save produces validation errors caused by undeclared hidden fields;
- receipt cannot resolve warehouse/UOM/order linkage after readiness READY;
- receipt succeeds visually but stock/readback is unchanged;
- duplicate receipt after retry;
- history/report cannot find the transaction.

## Exit condition
Purchase document and receipt are authoritative, order/receipt/stock states reconcile for the fixture, supplier/purchase history is readable, and no unexpected browser errors occurred.

## Evidence
Purchase document checkpoint, receipt checkpoint, reopened authoritative documents, stock/history checkpoint, browser/network summary, trace and exact candidate/package identity.
