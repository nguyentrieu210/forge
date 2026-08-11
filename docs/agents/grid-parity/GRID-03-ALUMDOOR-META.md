# GRID-03 — ALUMDOOR CHILD-GRID METADATA

Branch: `agent/grid-03-alumdoor-meta-20260811`
Program baseline inherited from: `program/grid-parity-20260811@70676edfe930112e34dfe6b7d1fe5b89e5d7c80e`
Initial status: BOOTSTRAPPED
Risk: STANDARD metadata/source presentation.

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

Current Sales compact policy is legacy-shaped and includes fields such as:

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

This must be reconciled against the current Sales authority, which now includes operator-facing `sales_option` and server-resolved monetary/package snapshots. Do not blindly add every new backend field; technical snapshots belong to `internal`.

## Owned hotspot

```text
server/scripts/lib/alumdoor-child-presentation.mjs
server/scripts/build-alumdoor-v2-brief.mjs   # only presentation/materialization adjustments
server/briefs/alumdoor-v2.json               # generated output only
server/tests/*child-grid* / focused metadata regression
```

## Required audit

At minimum inspect and classify fields for:

- Quotation Item
- Sales Order Item
- Delivery Note Item
- Sales Invoice Item
- Purchase Order Item
- Purchase Receipt Item

For each field classify:

```text
QUICK
EXPANDED
INTERNAL
CONDITIONAL_QUICK
NOT_USER_FACING
```

### Sales target rules

- `sales_option` is operator-facing when applicable.
- `sales_option_code`, `sales_option_label`, `sales_option_version`, `price_variant`, `discount_basis_variant`, package/version/checksum/source-line snapshots are normally internal/audit fields.
- money outputs resolved by server may be displayed read-only when the current child schema contains them (`discount_amount`, `adjustment_amount`, `net_amount` or canonical equivalents).
- legacy `sales_mode` may remain as compatibility/internal state but must not displace `sales_option` as the operator choice if current backend contract says otherwise.
- `discount_percentage` must not be shown merely because legacy UI once edited it; Pricing Rule is current commercial adjustment authority.
- geometry fields are conditional by product/measurement policy.

### Required-field rule

Do not use blanket `required => quick` when it causes conditional field inflation. A required conditional field must be reachable when applicable. Propose/implement metadata semantics that preserve reachability without permanent irrelevant columns, coordinating with GRID-02 if runtime support is needed.

## Generator discipline

- Source generator/presentation helper is authoritative.
- Regenerate materialized brief; do not hand-edit generated JSON as the source fix.
- Preserve non-presentation field/schema/business semantics.

## Tests

Add contracts that fail if:

- stale legacy Sales quick fields displace current operator fields;
- internal snapshot fields appear in quick/full business surfaces without explicit justification;
- preview output needed by the UI is missing from metadata;
- conditional/required fields become unreachable;
- generated brief drifts from the source presentation helper.

## Forbidden zone

Do not edit:

- `client/packages/views/src/form/MetadataChildGrid.tsx`;
- shared grid interaction code;
- Pricing/Stock/Payroll authoritative controllers.

If backend naming or semantics are ambiguous, read exact code/tests and record the evidence; do not invent a new business rule in metadata.

## Completion

Record exact head, generated changes, per-DocType field matrix, tests/build evidence actually run, and Dependency Requests. Stop before merge/deploy/tenant install.

## Startup prompt

`Đọc docs/agents/grid-parity/GRID-03-ALUMDOOR-META.md + GRID_PARITY_PROGRAM.md + Forge Enterprise Completion Skill. Audit exact current backend Sales/Procurement child schemas after convergence, rồi sửa AlumDoor child presentation source để quick/full/internal đúng operator needs. Ưu tiên sales_option + server-resolved money, ẩn technical snapshots, bỏ stale legacy columns, xử lý conditional required reachability. Regenerate brief, thêm metadata regressions. Không sửa shared React grid hoặc business controllers. Ghi Dependency Request và tiếp tục phần độc lập. Không merge/deploy/install tenant metadata.`
