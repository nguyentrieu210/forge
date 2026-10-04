# R8 completion record

Date: 2026-10-04  
Pinned upstream: ERPNext v16.20.0 @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`

## Result

**R8 benchmark + bounded hardening round: CLOSED.**

This record does not claim full ERPNext business parity.

- Breadth benchmark: 109/109 artifacts covered.
- Module denominator: 11/11 rows resolved.
- Flow denominator: 18/18 rows resolved.
- UNRESOLVED: 0.
- Remaining PARTIAL: 29.
- `R8_BENCHMARK_COMPLETE = true`.
- `R8_BUSINESS_CLOSED = false`.

The remaining PARTIAL rows are retained exactly as measured and carried by GitHub issue #997.

## Implemented R8-B hardening

R8-B materially strengthened:

- Finance budget actualization/distribution/history guards and chronological period close;
- customer credit, refund/reuse and realized-FX settlement;
- exact Purchase Order row authority;
- targeted FIFO Landed Cost repost and one-hop future transfer value carry;
- subcontracting order/receipt/supplied-material authority, leftover return and rejected-stock segregation;
- receipt-specific manufacturing operation-cost capitalization;
- explicit root-scoped subassembly BOM selection;
- inactive-account planning and fail-closed foreign non-party FX evidence.

The detailed authority and limitations remain in the R8-B evidence documents and
`R8_BUSINESS_DEPTH_MATRIX.json`.

## Regression found during closure

The first final R8-B checkpoint passed its own workflow but failed the already certified R7
Workerd facade suite. Four failures shared one root cause: migration
`0168_subcontracting_rejected_finished.sql` had written `"read_only": 1` into DocType
metadata while the certified Frappe metadata contract requires a JSON boolean.

The source migration was corrected to `"read_only": true` and the migration regression test
now asserts the boolean type so the fault cannot silently return.

Verified GitHub Actions after that fix:

- R7 Frappe 16 Closure run `37197424827`: **success**.
- R8-B Business Closure run `37197424823`: **success**.

## Boundary

Closure ends the R8 branch program and permits source merge after normal PR checks.
It does not authorize production deployment, production data migration, external provider
mutation or customer-data mutation, and it does not relabel the 29 PARTIAL rows as parity.
