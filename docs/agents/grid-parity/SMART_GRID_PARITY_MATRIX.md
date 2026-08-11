# SMART GRID PARITY MATRIX — GRID-01

Status: `READY` (reference contract only)
Branch: `agent/grid-01-parity-20260811`
Program: `program/grid-parity-20260811`
Exact program/main baseline audited: `main@cecb19c51855ab3e6a05ce84261d717c630c96b7`
Risk: documentation/reference only; no runtime, backend, schema, generated business metadata or production mutation.

## 1. Decision

The metadata migration is architecturally correct, but the current `MetadataChildGrid` is not interaction-parity with the mature grid.

Target architecture remains:

```text
DocField / DocType metadata
        ↓
generic Smart Child Grid interaction shell
        ↓
resolveField + ControlRegistry
        ↓
named server preview / projection
        ↓
canonical save / submit controller
```

Do **not** restore the old AlumDoor formulas, Item-name heuristics, pricing math, stock math, purchase barem logic, door geometry or commercial policy into React. The mature grid is evidence for interaction ergonomics only. Current backend and metadata contracts win whenever old UI behavior conflicts with them.

## 2. Evidence inspected

- `skills/forge-enterprise-completion/SKILL.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `docs/agents/grid-parity/GRID_PARITY_PROGRAM.md`
- `docs/agents/grid-parity/AGENT_BOARD.md`
- `docs/agents/grid-parity/NO-STOP-RULE.md`
- `client/packages/views/src/form/MetadataChildGrid.tsx`
- `client/packages/views/src/form/ChildGrid.tsx`
- `client/packages/views/src/form/ChildGridWithExtensions.tsx`
- `client/packages/views/src/form/child-grid-presentation.ts`
- `server/scripts/lib/alumdoor-child-presentation.mjs`
- `server/scripts/build-alumdoor-v2-brief.mjs`
- generated `server/briefs/alumdoor-v2.json`
- `server/apps-src/alumdoor-worker/src/ui-child-preview.ts`
- `server/packages/clouderp-selling/src/types.ts`
- `client/scripts/apply-sales-commercial-grid.mjs`
- merged PR #714 (mature purchase-grid operator ergonomics reference)
- merged PR #795 (generic autofill/spreadsheet behavior and business-logic boundary reference)
- ordinary child-table controls: `360 Review Line`, `Delivery Stop`.

## 3. Classification vocabulary

| Class | Meaning |
|---|---|
| `KEEP_GENERIC` | Generic runtime behavior every metadata-owned grid can reuse. No vertical literals. |
| `KEEP_METADATA` | Presentation/field membership/visibility/editability is declarative metadata authority. |
| `SERVER_OWNED` | Values, dynamic constraints or business decisions must come from server projection/controller. |
| `REMOVE_DEBT` | Mature implementation behavior that must not be copied into the new generic runtime. |
| `NOT_APPLICABLE` | Historical UI structure with no place in the converged SmartGrid. |

## 4. Feature parity contract

| Behavior | Mature grid evidence | Current `MetadataChildGrid` | Classification | Target contract |
|---|---|---|---|---|
| Adaptive columns / `depends_on` | Suppresses columns when no row can display them using `resolveField` | Per-cell visibility exists; whole-column suppression absent | `KEEP_GENERIC` | Evaluate candidate metadata columns against rows + parent/roles; suppress all-inapplicable columns without changing business metadata. |
| Compact/full surfaces | compact/big modes | metadata quick/form switch exists | `KEEP_METADATA` | `quickEntry` owns compact candidates; `form` owns expanded business detail. Requiredness must not itself force permanent compact visibility. |
| Row selection | multi-select state | absent | `KEEP_GENERIC` | Checkbox/range-safe selection; never treat hidden/masked cells as selected edit targets. |
| Add one | supported | supported | `KEEP_GENERIC` | Preserve. |
| Add many | supported | absent | `KEEP_GENERIC` | Add N blank/default rows without domain-specific values. |
| Duplicate/clone | supported | absent | `KEEP_GENERIC` | Clone editable business values; regenerate row identity; run canonical preview/projection. |
| Move up/down | supported | absent | `KEEP_GENERIC` | Stable row reorder. |
| Delete + undo | supported | delete only | `KEEP_GENERIC` | Batch delete selected rows and one-step undo without resurrecting stale row identity. |
| Column picker | supported | absent | `KEEP_GENERIC` | User may hide/show candidate business columns only; metadata-internal/hidden/masked fields are never offered. |
| Column reorder | supported | absent | `KEEP_GENERIC` | Persist user order inside metadata-approved candidate set. |
| Resize | supported | absent | `KEEP_GENERIC` | Persist width by child DocType + view mode. |
| Pin | supported | absent | `KEEP_GENERIC` | Identity column remains reachable; optional extra pins. |
| Rename display label | supported | absent | `KEEP_GENERIC` | Local display alias only; never mutate fieldname/schema. |
| Reset layout | supported | absent | `KEEP_GENERIC` | Reset persisted layout to metadata-defined order/visibility. |
| Persisted layout | localStorage per DocType/mode | absent | `KEEP_GENERIC` | Persist layout per child DocType + compact/full mode; stale fields fail safely. |
| Spreadsheet paste | mature parser/reference from PR #795 | absent | `KEEP_GENERIC` | One generic parser; same edit/preview path as manual entry. |
| Header-aware paste | supported | absent | `KEEP_GENERIC` | Map canonical fieldname or label; otherwise positional paste from focused cell. |
| Quoted TSV/newline paste | PR #795 contract | absent | `KEEP_GENERIC` | Preserve quoted tabs/newlines/escaped quotes. |
| Locale numeric paste | PR #795 contract | absent | `KEEP_GENERIC` | Accept locale-formatted numbers and validate through canonical field constraints. |
| Fill-down | supported | absent | `KEEP_GENERIC` | Selected rows only; empty editable targets only; invoke same preview path. |
| Keyboard navigation | Enter/Shift+Enter/Tab behavior exists | absent | `KEEP_GENERIC` | Spreadsheet-like navigation; final editable cell may create/focus a new row when writable. |
| Validation/error cells | per-cell feedback reference | one aggregate preview error | `KEEP_GENERIC` | Cell-level parse/validation/preview feedback; invalid paste cannot silently corrupt rows. |
| Row detail | supported | absent | `KEEP_GENERIC` | Detail surface for expanded business fields; internal snapshots stay hidden. |
| Fullscreen sheet | supported | absent | `KEEP_GENERIC` | Same row array and same authority; no second save path. |
| Mobile cards | mature responsive reference | present | `KEEP_GENERIC` | Preserve responsive card editing for metadata-approved fields. |
| Dynamic Link target/filter | mature + `resolveField`/controls | Link/Dynamic Link target exists | `KEEP_METADATA` | Link target/filter comes from metadata or server `field_overrides`; runtime only applies it. |
| Required/read-only/masked | `resolveField` authority | present | `KEEP_METADATA` | `resolveField` remains final cell UX authority. Required means reachable and validated, not globally visible. |
| Server field overrides | historical server projection | present | `SERVER_OWNED` | Merge only declared child fields; allow label/required/hidden/read-only/link filter projection. |
| Server preview patch/clear | server UX preview | present | `SERVER_OWNED` | `patch`/`clear` are UX projection only; save/submit controller recalculates canonically. |
| Preview stale-response guard | mature async guards | version guard present | `KEEP_GENERIC` | Keep row/version guard for manual, paste, fill, parent-context changes. |
| Existing-document dirty state | mature `persistedItemHydration` guard | no equivalent explicit hydration guard | `KEEP_GENERIC` | Opening/hydrating a persisted document must not mark it dirty solely because projection metadata loads. |
| Whole-grid totals / business formulas | old ChildGrid contains vertical calculations | intentionally absent | `REMOVE_DEBT` | Server-owned document/row preview only. Generic runtime may display returned values but never derive policy money/stock/geometry. |
| Purchase extension sub-grid | `ChildGridWithExtensions` creates a second purchase detail table | absent | `NOT_APPLICABLE` | One metadata-owned SmartGrid with compact/full/detail surfaces; no duplicated row editor. |

## 5. Debt that must not return to the generic renderer

The following mature-grid code is **not parity scope** and must be retired/replaced by server authority rather than generalized:

- Item-code/name heuristics for ray/trục/door classification;
- client `deriveSalesQuantity` business policy;
- client default discount policy and discount arithmetic;
- door/cutting/formula calculations;
- purchase theoretical-weight/barem formulas;
- stock availability, conversion and commercial pricing decisions fetched/adjudicated inside React;
- AlumDoor-specific DocType names, field sets or Vietnamese vertical labels hardcoded into the generic SmartGrid.

Current canonical Sales contract already exposes operator-facing `sales_option` and server/audit fields such as `sales_option_code/label/version`, `price_variant`, `discount_basis_variant`, `discount_amount`, `adjustment_amount`, `net_amount`, `sales_package*` and pricing snapshots. The operator UI must project the appropriate business fields while keeping audit snapshots/internal policy dimensions out of the normal grid.

## 6. Per-DocType parity contract

### 6.1 Quotation Item

Current generated/source quick columns:
`item_code, color, sales_mode, height_m, width_m, set_count, has_butterfly_bracket, length_m, qty_bar, uom, qty, rate, discount_percentage, amount`.

Current full presentation source:
`item_code, color, sales_mode, height_m, width_m, set_count, leaf_variant, single_layer_leaf_count, double_layer_leaf_count, cut_width_m, billable_area_sqm, formula_policy, formula_version, length_m, qty_bar, uom, qty, rate, discount_percentage, amount, note`.

Conditional/required behavior: color/dimensions/set count/length/pieces depend on Item inventory mode/UOM and server projection; `item_code`, `qty`, `rate` are base required; server may override required/hidden/read-only labels for the active row.

Backend preview outputs: Item master projection, allowed color/UOM filters, quantity projection, door/measurement projection, availability, formula outputs, `patch`, `clear`, `field_overrides`; canonical Sales/Pricing controller owns commercial money and snapshots.

Target compact operator columns:
`item_code, sales_option, color? , width_m? , height_m? , set_count? , length_m? , qty_bar? , uom, qty, rate, discount_amount, adjustment_amount, net_amount` where `?` means visible only when applicable.

Target expanded: compact + operator-relevant dimensional/detail fields. `sales_option_code/label/version`, `sales_mode`, `price_variant`, `discount_basis_variant`, `discount_percentage` audit value, `sales_package*`, formula/audit snapshots and stock projection fields are not normal operator columns.

### 6.2 Sales Order Item

Current quick/full and conditional contract are the same stale Sales presentation family as Quotation Item.

Target compact:
`item_code, sales_option, color? , width_m? , height_m? , set_count? , length_m? , qty_bar? , uom, qty, rate, discount_amount, adjustment_amount, net_amount`.

Target expanded: compact + business-detail dimensions needed by the operator. Server-owned package/pricing/formula snapshot fields stay internal/read-only detail only when an explicit audit surface requires them.

### 6.3 Delivery Note Item

Generated current quick columns are exactly:
`item_code, uom, qty, warehouse, rate`.

Generated current full columns are exactly:
`item_code, color, width_m, height_m, set_count, sales_mode, has_butterfly_bracket, mesh_height_m, length_m, qty_bar, uom, qty, warehouse, serial_and_batch_bundle, weight_kg, rate, valuation_rate, amount`.

Internal fields include `sales_order_row_id`, Item/measurement mirrors, stock UOM/conversion/stock quantity and formula/width/billable-area snapshots.

Backend preview: same Sales row projection endpoint; stock posting remains canonical Delivery Note controller authority.

Target compact:
`item_code, color? , width_m? , height_m? , set_count? , length_m? , qty_bar? , uom, qty, warehouse, serial_and_batch_bundle? , weight_kg?`.

`rate/amount` may remain an expanded/read-only commercial reference when declared by the current document contract, but shipment operation must not require commercial-policy editing. `sales_order_row_id` and formula/stock snapshots stay internal.

### 6.4 Sales Invoice Item

Generated current quick columns are exactly:
`item_code, uom, qty, rate, amount`.

Generated current full columns are exactly:
`item_code, color, width_m, height_m, set_count, sales_mode, has_butterfly_bracket, mesh_height_m, uom, qty, rate, amount`.

Internal fields include Item/measurement/stock mirrors and formula/width/billable-area snapshots.

Target compact commercial billing columns:
`item_code, sales_option? , uom, qty, rate, discount_amount? , adjustment_amount? , net_amount`.

Expanded may expose read-only dimensional context where useful for invoice review. Pricing/package/basis snapshots remain internal. Presence of `sales_option`, discount/adjustment/net fields in the final metadata must follow the canonical Sales Invoice backend contract, not be invented by GRID-02.

### 6.5 Purchase Order Item

Current presentation source compact base:
`item_code, qty, uom, rate, amount`, then `closeQuickOverRequired()` currently injects any statically required editable field that also exists in the full set.

Current full:
`item_code, length_m, theoretical_kg_per_m, qty_bundle, qty_bar, theoretical_kg, qty, uom, rate, amount, color, is_stamped, so_no, warehouse, note`.

Conditional behavior: aluminum-specific color/length/bundle/bar/barem/stamp fields depend on inventory mode; ordinary goods must not carry irrelevant aluminum columns.

Backend preview owns Item/default UOM, conversion, color policy, theoretical kg/qty projection and amount preview; save/submit owns final purchasing/stock authority.

Target compact:
`item_code, color? , length_m? , qty_bundle? , qty_bar? , qty, uom, rate, amount` plus only conditionally required fields that are applicable to at least one row. Do not force every required field into every compact row.

Target expanded: current business-detail full set, subject to metadata applicability; internal Item mirrors are not operator columns.

### 6.6 Purchase Receipt Item

Current presentation source compact base:
`item_code, qty, uom, rate, amount`, with the same static-required injection behavior.

Current full:
`item_code, length_m, qty_bundle, qty_bar, qty, uom, rate, amount, theoretical_kg, actual_weight_kg, color, is_stamped, so_no, warehouse, purchase_order, note`.

Generated metadata additionally has dimensional/catch-weight fields such as `height_m`, `width_m`, `set_count`, `actual_kg_per_m`, `actual_kg_per_sqm`, batch bundle/condition and weight variance; these must be reachable through applicable expanded/detail presentation where business-required.

Backend preview owns Item/UOM/conversion, theoretical kg, actual-weight ratios and amount preview; stock ledger posting remains server-owned.

Target compact:
`item_code, color? , height_m? , width_m? , set_count? , length_m? , qty_bundle? , qty_bar? , actual_weight_kg? , qty, uom, rate, amount` with applicability suppression.

Target expanded/detail: all required receipt/batch/weight fields needed to complete receiving, including `warehouse`, `purchase_order`, `serial_and_batch_bundle`, `condition`, `is_stamped`, `so_no`, notes and read-only weight comparisons where applicable.

### 6.7 Ordinary control — 360 Review Line

Current child metadata:
- compact/list candidates: `reviewer, relationship, score`;
- `comments` is required but not `in_list_view`.

Target: this control proves the generic grid must not use the AlumDoor-specific `closeQuickOverRequired()` rule globally. `comments` must be reachable in detail/full and validated as required without forcing it into compact columns. No server commercial preview is applicable.

### 6.8 Ordinary control — Delivery Stop

Current compact/list candidates:
`delivery_note, customer, address, distance, estimated_arrival`.

Other fields include contact, distance UOM, lat/lng and read-only visited state.

Target: preserve generic compact/list behavior, read-only Customer/Visited semantics and expanded access to secondary fields. No AlumDoor pricing/stock/geometry logic is applicable.

## 7. Requiredness rule — locked

`required` and `mandatory_depends_on` are validation/editability contracts, not an instruction to permanently place a field in compact view.

Locked rule:

1. Metadata declares candidate compact/full fields.
2. `resolveField` + server overrides decide row applicability/read-only/masked state.
3. A required field must be **reachable before save/submit**.
4. Compact mode may omit a required field when it is available through expanded/detail and is not currently applicable.
5. A row with an applicable missing required value must surface validation before persistence.

Therefore `closeQuickOverRequired()` is migration debt for GRID-03 to remove/reconcile, not behavior GRID-02 should reproduce.

## 8. Manual / paste / fill convergence rule — locked

Every cell mutation path must converge on the same generic pipeline:

```text
parse/validate input
→ apply editable field value
→ bump row preview version
→ invoke declared server preview when configured
→ merge allowed patch/clear/field_overrides
→ re-resolve visibility/read-only/masking
→ emit one coherent row-array update
```

No paste/fill/duplicate shortcut may bypass preview, permissions or validation.

## 9. Dependency Requests

### Dependency Request — GRID-02
Owner: `GRID-02 RUNTIME`
Need: Implement the `KEEP_GENERIC` behaviors above in the metadata-owned SmartGrid without importing AlumDoor field names or mature-grid business formulas.
Why: Runtime interaction ownership belongs to GRID-02.
Blocked scope: GRID-01 does not implement runtime.
Can continue independently: yes — GRID-01 reference work is complete.
Next independent work: hand off matrix and audit any GRID-02 candidate against this contract.

### Dependency Request — GRID-03
Owner: `GRID-03 ALUM META`
Need: Reconcile stale Sales child presentation with current canonical commercial fields (`sales_option`, `discount_amount`, `adjustment_amount`, `net_amount`) and remove blanket required-field inflation; regenerate `alumdoor-v2.json` from source.
Why: AlumDoor business presentation metadata and generated brief are GRID-03 ownership.
Blocked scope: exact final AlumDoor target columns cannot be certified until generated metadata matches current backend authority.
Can continue independently: yes — parity contract is locked.
Next independent work: review GRID-03 diff against Sections 6–7.

### Dependency Request — GRID-04
Owner: `GRID-04 QA`
Need: Certify exact convergence candidate for interaction parity, no internal-field leakage, no dirty-on-open regression, manual/paste/fill equivalence and representative DocType browser flows.
Why: Candidate-level E2E/evidence ownership belongs to GRID-04.
Blocked scope: final program parity certification.
Can continue independently: yes.
Next independent work: provide deterministic scenario list from this matrix.

## 10. GRID-01 completion evidence

Files changed by GRID-01 execution: this reference matrix only.

No files changed in:
- shared renderer/runtime;
- AlumDoor generator/brief;
- Sales/Pricing/Stock/Payroll controllers;
- migrations/schema;
- deployment/provider configuration.

Tests/CI/browser runs executed by GRID-01: **none**. This is intentional and factual for a docs/reference-only worker; no executable source was changed. Historical PR evidence was inspected but is not claimed as a fresh run. GRID-04 owns executable convergence evidence.

Implementation parity is **not** claimed. GRID-01 claims only that the current-vs-mature SmartGrid reference contract and ownership boundaries are now locked for GRID-02/03/04 consumption.
