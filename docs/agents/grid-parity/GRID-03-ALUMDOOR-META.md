# GRID-03 — ALUMDOOR CHILD-GRID METADATA

Branch: `agent/grid-03-alumdoor-meta-20260811`
Program baseline inherited from: `program/grid-parity-20260811@70676edfe930112e34dfe6b7d1fe5b89e5d7c80e`
Implementation baseline: `main@cecb19c51855ab3e6a05ce84261d717c630c96b7`
Status: READY FOR CONVERGENCE REVIEW
Risk: STANDARD metadata/source presentation.
PR: `#828` — `fix(grid-03): converge AlumDoor child-grid metadata`

## Mission

Reconcile AlumDoor child-grid quick/full/internal presentation with the exact current backend after Inventory + Attendance/Payroll + Sales convergence. Remove stale visible columns and expose the operator fields required by the current authorities.

## Read first

1. `skills/forge-enterprise-completion/SKILL.md`
2. `docs/agents/grid-parity/GRID_PARITY_PROGRAM.md`
3. `docs/agents/grid-parity/AGENT_BOARD.md`
4. `docs/agents/grid-parity/NO-STOP-RULE.md`
5. current `server/scripts/lib/alumdoor-child-presentation.mjs`
6. `server/scripts/build-alumdoor-v2-brief.mjs`
7. current generated `server/briefs/alumdoor-v2.json`
8. current Sales architecture/business-case docs and exact Sales Option / commercial resolver / preview fields.
9. current Purchase/Receipt/Inventory authoritative fields.
10. GRID-01 per-DocType matrix when available.

## Confirmed starting drift

The inherited Sales compact policy was legacy-shaped and included fields such as:

```text
item_code
color
sales_mode
height_m
width_m
set_count
has_butterfly_bracket
length_m
qty_bar
uom
qty
rate
discount_percentage
amount
```

The current Sales authority instead uses `sales_option` as the operator choice, Pricing Rule as commercial-adjustment authority, and server-resolved line money. Package/version/checksum/source-line fields remain technical snapshots, not normal business columns.

## Owned hotspot

```text
server/scripts/lib/alumdoor-child-presentation.mjs
server/scripts/build-alumdoor-v2-brief.mjs   # presentation/materialization only
server/briefs/alumdoor-v2.json               # generated output only
server/tests/alumdoor-child-presentation.test.mjs
```

## Implemented contract

### Sales

- `sales_option` is operator-facing on Quotation Item, Sales Order Item and Sales Invoice Item where the current schema provides it.
- Quotation/Sales Order compact rows display server-owned `discount_amount`, `adjustment_amount`, `net_amount` read-only.
- `discount_percentage`, `sales_mode`, pricing variants, Sales Option snapshots, Sales Package snapshots/version/checksum, source-line identity and formula audit fields are `internal`.
- `transaction_date` is forwarded as preview parent context so server pricing can resolve against the correct commercial date.
- metadata contains no client pricing formula and does not create a second pricing authority.

### Procurement / receiving

- compact Purchase Order / Purchase Receipt remains deliberately small: `item_code`, `qty`, `uom`, `rate`, `amount` plus only truly unconditional required fields.
- conditional dimensions and receiving facts remain reachable through full/detail rather than being permanently promoted into compact rows.
- `is_stamped` is conditional/detail, not permanently quick.
- Purchase Receipt keeps `width_m`, `height_m`, `set_count`, `length_m`, `qty_bar`, `rate_uom`, actual-weight diagnostics and condition/stamping fields reachable in full/detail when present.
- this preserves the current aluminum authority: physical stock Cây/Lá + Batch, Kg catch weight/priced quantity, `qty_bar` counted stock/allocation quantity.

## Per-DocType matrix

| DocType | QUICK / operator compact | EXPANDED / detail | INTERNAL / audit | Notes |
|---|---|---|---|---|
| Quotation Item | item, `sales_option`, applicable geometry, qty/UOM/rate, server discount/adjustment/net | business geometry and leaf/cut outputs needed by operator | `sales_mode`, `discount_percentage`, formula audit, price variant, Sales Option/Package snapshots | Pricing remains server-authoritative |
| Sales Order Item | same operator commercial surface as Quotation | business geometry/detail | legacy pricing state, formula audit, variants/package/source snapshots | no client money authority |
| Delivery Note Item | existing authored delivery entry fields | remaining delivery detail | `sales_mode`, pricing/package/source-line technical state when present | no synthetic `sales_option` added because current Delivery schema does not define it |
| Sales Invoice Item | existing invoice entry fields + `sales_option` | invoice detail | Sales Option/Package/source-line snapshots and legacy pricing state | `sales_option` retained in compact via authored field intent |
| Purchase Order Item | item, qty, UOM, rate, amount | color/dimensions/set count, length/barem, bundle/bar count, stamping, SO, warehouse, note | non-business hidden fields | conditional stamping is detail, not blanket quick |
| Purchase Receipt Item | item, qty, UOM, rate, amount | color/dimensions/set count, length/bar count, rate UOM, theoretical/actual-weight diagnostics, condition/stamping, warehouse/PO/note | non-business hidden fields | conditional `set_count` and `is_stamped` remain reachable |

## Required-field rule

The old generic policy effectively allowed `required => quick`, which inflated compact rows with fields that are only mandatory under `depends_on` / `mandatory_depends_on` conditions.

GRID-03 now distinguishes unconditional required fields from conditional applicability:

```text
unconditional required -> QUICK closure
conditional required   -> reachable in EXPANDED/detail
hidden/audit            -> INTERNAL
```

This prevents irrelevant permanent columns while ensuring applicable required data is still editable.

## Generator discipline

- `server/scripts/lib/alumdoor-child-presentation.mjs` is the presentation source.
- `server/scripts/build-alumdoor-v2-brief.mjs` materializes the current Sales operator fields into the source brief before applying presentation policy.
- `server/briefs/alumdoor-v2.json` was regenerated from source; it was not hand-edited as the authority.
- no shared React child-grid file or Pricing/Stock/Payroll controller was changed.

## Regression gates added

`server/tests/alumdoor-child-presentation.test.mjs` now fails on:

- generated brief drift from the canonical presentation helper;
- missing explicit presentation ownership for any of the 28 AlumDoor child DocTypes;
- loss of `sales_option` from Quotation/Sales Order/Sales Invoice operator surfaces;
- loss of read-only server money on Quotation/Sales Order;
- leakage of legacy pricing, Sales Option/Package or source-line snapshots into business surfaces;
- unconditional required fields becoming unreachable;
- conditional required fields becoming unreachable in full/detail;
- Purchase Order / Receipt conditional stamping being blanket-promoted into compact entry;
- Purchase Receipt conditional dimensions/weight/detail facts falling out of the full surface.

## Execution evidence

Materialization/verification run:

```text
GitHub Actions run: 31473432064
Job: regenerate
Input branch head: 813319436915060f6b1b83c7500f7d6789b5cc05
Generated/tested output commit: d9f2c0af03d0a220350edb239f7ae1accf69dca7
```

Successful steps:

```text
node scripts/build-alumdoor-v2-brief.mjs
node --test tests/alumdoor-child-presentation.test.mjs
git diff --check
commit generated server/briefs/alumdoor-v2.json
```

All steps completed `success`. The temporary verification workflow was then removed; that cleanup does not alter product metadata/source/test files.

An earlier materialization run `31472858602` also completed successfully and was used to expose the later Purchase Receipt reachability defect during generated-diff audit. That defect was fixed and is covered by the final run above.

## Dependency Request — GRID-02

**Non-blocking:** GRID-03 guarantees conditional fields are reachable in full/detail without permanent compact inflation. If GRID-02 implements row-adaptive `CONDITIONAL_QUICK` rendering, it should evaluate existing `depends_on` / `mandatory_depends_on` metadata rather than add AlumDoor-specific field names or business rules. GRID-03 does not require that runtime enhancement to remain correct.

## Boundaries / stop condition

- no production or tenant install was run;
- no shared runtime or business controller was changed;
- PR #828 remains unmerged;
- merge/deploy stays outside GRID-03 until explicit convergence approval.
