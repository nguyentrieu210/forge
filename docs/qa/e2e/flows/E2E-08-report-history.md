# E2E-08 — Report / History Readback

## Persona
Manager or permitted operational user, non-admin unless the report explicitly requires elevated access.

## Business job
Find a transaction created by an upstream E2E flow in the relevant report/history surface, verify its values/status and drill back to the authoritative record without leaving the supported operational UI.

## Preconditions
A known upstream transaction from E2E-01..07 exists in the same controlled fixture/run when feasible. Persona report/history permission scope is declared.

## Operator steps
1. Complete E2E-00 as the declared report persona.
2. Open the module-local `Báo cáo` or `Lịch sử` surface.
3. Filter/search using a safe identifier/date/customer/supplier relevant to the upstream transaction.
4. Verify the transaction appears exactly once where expected.
5. Verify key amount/quantity/status/date values match authoritative readback.
6. Drill into the transaction/detail surface.
7. Return to report/history without losing intended filter/context when the UX contract supports it.
8. Verify an out-of-scope transaction is hidden in the permission-negative variant.

## PASS
Newly created transaction is discoverable, values/status match authoritative state, drilldown works, permission scope is correct and there are no unexplained browser/network/red errors.

## FAIL examples
Report route redirects to an unrelated generic report, stale values after transaction completion, client aggregation omits the known transaction, duplicate rows, drilldown dead, unauthorized data visible.

## Exit condition
Operational reporting/history is proven as a usable control surface for transactions created by the business flows, not only as a decorative dashboard.
