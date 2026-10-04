# R8-B explicit subassembly BOM planning slice

Production Plan rows may now supply `subassembly_boms`, an array of explicit
`{ item_code, bom_no }` choices. Each choice applies to every occurrence of that
subassembly under that one root row, including deeper levels. Separate root rows
can choose different BOMs. There is no path-specific choice within one root.

MRP requires every chosen BOM to be submitted, Active, effective on the actual
planning date, and to match the planned company and selected subassembly item.
Duplicate item choices, attempts to replace the root BOM, malformed choices, and
choices not reached in the selected tree fail closed. Unselected children retain
the existing single-effective-BOM rule. Cycle, depth, dimensions, warehouse,
fixed-point quantity, gross-demand and on-hand-only contracts stay in force.

The result records the sorted exact selected BOM names and revisions on each
planned output. Existing leaf source traces still identify the selected BOMs.
Both API preview and Material Request conversion check read permission on all
explicitly selected BOMs before returning a preview or creating demand documents.

For example, a root requiring two `SUB` units may explicitly select `BOM-SUB-A`
for that row. If that BOM requires three `RM-A` units per `SUB`, planning two root
units produces four `SUB` manufacture units and twelve `RM-A` purchase units.
No inventory or financial posting is created by this selection.

## Verification

- TypeScript compilation passes.
- Focused MRP/API/on-hand tests: 29/29 pass.
- Full `manufacturing-*.test.mjs` regression: 108/108 pass.
- New coverage includes independent root choices, nested selections and source
  lineage, draft demand quantities, mismatched/inactive/cancelled/future/expired
  BOMs, duplicate/unused choices, cycle/dimension guards, and selected-BOM read
  denial on both preview and conversion with no create call.

## Remaining boundaries

This closes only explicit nested selection in the MRP planning contract. BOM
lifecycle still forbids overlapping Active alternatives; the tests of alternative
selection use planner-level fixtures, not evidence that the normal submit lifecycle
accepts simultaneous alternatives. No default ranking, availability-driven choice,
phantom flattening, material substitution, path-specific alternatives or Work Order
selection policy is added. Work Order release/stock snapshots and capacity routing
keep their existing contracts. There is no UI metadata form or migration.

R8-F10 stays PARTIAL. Phantom/substitute/full alternate lifecycle policy, ATP
netting and a pinned ERPNext runtime differential remain open.
