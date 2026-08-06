# E2E-03 — Inventory Operations

## Persona
Stock User / thủ kho, non-admin.

## Business job
Complete the inventory operations exposed by the active Alumdoor workspace: receive/issue/transfer and the representative aluminium cutting operation where in scope, then verify authoritative stock movement and history.

## Preconditions
Declared warehouses, item/profile, UOM/conversion, lot/batch/serial requirements, source stock and stock/cutting policies are `READY`.

## Happy-path steps
1. Complete E2E-00 as Stock User.
2. Open `Kho` through supported navigation.
3. Execute one representative stock movement using real controls.
4. Verify item, source/target warehouse, quantity/UOM and lot/batch values before confirmation.
5. Preview when the action contract exposes preview.
6. Confirm the movement.
7. Reopen/read back the source document or action result.
8. Verify authoritative quantity change and stock-ledger/history readback.
9. For Alumdoor cutting scope, execute the declared cut-preview/action with a valid decimal length and verify the value reaches the business method unchanged.

## Required negative variants
- insufficient source stock must fail clearly with no mutation;
- invalid warehouse/lot/UOM must fail safely;
- retry/double submit must not duplicate stock movement;
- unauthorized persona must fail closed.

## PASS
Stock movement is recorded exactly once, quantities/UOM/lot identity are correct, readback/history agrees, and there are zero unexplained browser/network/red errors.

## FAIL examples
Silent decimal conversion, negative/duplicate stock, success toast without ledger change, hidden warehouse/UOM requirement, raw backend error or admin-only workaround.

## Exit condition
Authoritative stock state and stock history/ledger reconcile with the operator action.
