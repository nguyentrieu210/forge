# E2E-04 — Manufacturing Execution

## Persona
Manufacturing User / điều độ hoặc nhân viên sản xuất, non-admin.

## Business job
Convert accepted demand into a valid manufacturing requirement/work order, execute the representative material/production lifecycle and verify work, material and finished-goods state through the UI.

## Preconditions
Company, demand/Sales Order where applicable, item/BOM/version, required material stock, warehouses, routing/workstation where required, UOM/conversion and manufacturing policy are `READY`.

## Operator steps
1. Complete E2E-00 as Manufacturing User.
2. Open `Sản xuất`.
3. Select or create demand/manufacturing requirement through the supported surface.
4. Verify BOM/material requirement exposed to the operator.
5. Create/confirm Work Order or equivalent manufacturing authority.
6. Execute the representative material issue/transfer/start action required by the flow.
7. Complete/receive finished goods according to supported lifecycle.
8. Reopen the manufacturing document.
9. Verify work status, consumed/material state and finished-goods readback.
10. Verify stock/history/report surfaces reflect the manufacturing transaction.

## Required negative variants
- missing/insufficient material fails with clear operator action and no invalid state transition;
- invalid BOM/state transition fails safely;
- unauthorized persona cannot submit/complete;
- retry does not duplicate material issue or finished-goods receipt.

## PASS
Manufacturing state progresses through the declared lifecycle once, material/FG state is authoritative and readable, and no unexplained browser/network/red errors occur.

## FAIL examples
Work Order created but impossible to progress, hidden configuration discovered after READY, material issue succeeds visually but stock is wrong, duplicate FG on retry, or report/history does not reflect completion.

## Exit condition
Representative demand -> manufacturing -> material/FG readback chain is proven through browser UI.
