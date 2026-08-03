# MetaForge UI Grammar + Matrix Extraction Plan

Date: 2026-08-03

Planning baseline: exact `main@057c5a9e0e37f7073e2a6700802a5add416bd063`.

This document is a convergence-follow-up implementation plan. It follows `skills/forge-enterprise-completion/SKILL.md`, `docs/FORGE_ENTERPRISE_NORTH_STAR.md`, the capability map, exact runtime code, and the existing Bulk View architecture. It does not claim completion or production deployment.

## 1. Outcome

Move Forge from “metadata can render generic forms/lists and a few screens” to a **UI Grammar** where apps describe business intent, data bindings, layout archetype, interaction policy and visual profile; the shared runtime renders the result without app-specific React forks.

The first reference extraction is the Alumdoor **Item Price matrix** because it is already a strong operational UI and currently proves the exact architecture debt we want to remove:

- `BulkGridContainer` contains `if (props.doctype === "Item Price")`;
- `ItemPriceMatrixPanel.tsx` hard-codes Price List, Item Group, Item, UOM, UOM conversion and Item Price orchestration;
- the current UX is better than a plain CRUD grid and must be preserved rather than flattened;
- `server/docs/METAFORGE-BULK-VIEW-ARCHITECTURE-20260802.md` already identifies Matrix View as the next canonical renderer.

Target rule:

> Alumdoor defines **metadata + pricing-domain actions**. MetaForge owns the renderer. Pricing/domain packages own business correctness. No `Item Price` literal is required in shared runtime routing/render selection.

## 2. North Star fit

This initiative primarily advances:

- NS-09 BPM + Low-code App Factory;
- metadata-first architecture;
- verticalization speed;
- mobile/runtime consistency;
- source-of-truth discipline by moving business mutation semantics out of React.

It also supplies reusable primitives for Procurement, Inventory, IAM, HCM and future vertical apps.

No capability is promoted merely because metadata exists. Maturity remains `Missing -> Foundation -> Wired -> RC -> Hardened` and requires evidence.

## 3. Exact-state findings

### Existing reusable foundation

MetaForge already has generic renderer families for:

- List
- Form
- Bulk
- Report
- Kanban
- Calendar
- Gantt
- Tree
- Dashboard
- Print
- Overview / Process / AppScreen compositions

App manifest already supports design profiles (`brand`, density, radius, content width) and AppScreen supports modes (`desk`, `focus`, `touch`), 1–3 columns, and metric/list/action blocks.

Bulk View already has canonical `viewPolicy.bulk` with:

- columns;
- editable fields;
- paste;
- fill-down;
- page size;
- `document_update` commit strategy;
- fail-closed handling for unsafe/transactional records.

### Architecture debt to remove

The Item Price manager is still a bespoke runtime path. It includes valuable interaction patterns that are generic in nature:

- hierarchical navigator: Price List -> Item Group -> Item;
- two independent search scopes;
- row axis: UOM;
- column axis: Price List;
- cell state: enabled + rate;
- row auxiliary edit: UOM conversion factor;
- add/remove row member;
- create column entity (new Price List);
- hide/show columns;
- focused/full-width matrix mode;
- sticky row/column headers;
- mobile step navigation;
- OCC using `modified`;
- create/update/disable semantics.

The current React component also performs multi-document business mutations directly. That is useful compatibility behavior but not the final generic contract.

## 4. UI Grammar model

Do not create 30 unrelated renderers. Standardize UI generation into five layers.

### Layer A — Surface archetype

A finite set of canonical interaction patterns. Initial target: **16 archetypes**.

1. `record-list` — searchable/filterable records.
2. `record-form` — metadata form.
3. `master-detail` — list + selected detail.
4. `split-context` — list/detail/context or document/timeline.
5. `bulk-grid` — spreadsheet-like independent-record editing.
6. `matrix` — two-dimensional relationship/value editor.
7. `tree` — hierarchy management.
8. `board` — status/stage Kanban.
9. `calendar` — date/time workload.
10. `gantt` — dependency/schedule plan.
11. `timeline` — chronological events/history/process evidence.
12. `cockpit` — KPI + lists + actions + alerts for an operator role.
13. `wizard` — guided multi-step setup/transaction.
14. `mobile-task` — touch-first single-task execution.
15. `pos` — cart/catalog/payment operating surface.
16. `kiosk` — constrained self-service/one-purpose flow.

Existing view renderers should be reused beneath these archetypes. An archetype is a composition contract, not permission to fork React per app.

### Layer B — Layout primitives

Canonical reusable layout vocabulary:

- `stack`
- `grid`
- `split`
- `tabs`
- `rail`
- `drawer`
- `sticky-header`
- `sticky-axis`
- `step`
- `focus`

Responsive behavior belongs to runtime and metadata hints, not per-app media-query forks.

### Layer C — Block primitives

Expand AppScreen’s current metric/list/action vocabulary toward:

- `metric`
- `list`
- `form`
- `action`
- `chart`
- `table`
- `matrix`
- `timeline`
- `notice`
- `content`

Blocks must reference permission-filtered data/action contracts; they must not invent domain queries in React.

### Layer D — Interaction policy

Reusable behavior flags/contracts:

- search/filter/sort;
- inline edit;
- bulk select;
- paste/fill-down;
- create/remove axis member;
- preview/confirm;
- reason required;
- optimistic concurrency;
- autosave/manual save;
- dirty guard;
- keyboard navigation;
- mobile step/focus mode;
- empty/error/loading semantics.

### Layer E — Design profile

Keep design visual, not business-specific:

- brand/theme;
- density;
- radius;
- content width;
- spacing scale;
- surface elevation;
- table density;
- typography scale;
- touch target profile.

The design layer must never change authoritative behavior.

## 5. Canonical Matrix View contract

Matrix becomes a first-class `viewPolicy.matrix` contract rather than a special case inside Bulk.

Conceptual shape:

```json
{
  "viewPolicy": {
    "matrix": {
      "enabled": true,
      "archetype": "matrix",
      "navigator": {
        "mode": "hierarchy",
        "levels": ["price-list", "item-group", "item"]
      },
      "rowAxis": {
        "source": "item-uom",
        "keyField": "uom",
        "labelField": "uom_name"
      },
      "columnAxis": {
        "source": "price-list",
        "keyField": "name",
        "labelField": "price_list_name",
        "subtitleField": "effective_date"
      },
      "cell": {
        "source": "item-price",
        "valueField": "rate",
        "enabledField": "disabled",
        "enabledInvert": true,
        "editor": "Currency"
      },
      "actions": {
        "addRow": "pricing.add-uom",
        "addColumn": "pricing.create-price-list",
        "save": "pricing.commit-item-price-matrix"
      },
      "mobile": {
        "mode": "step",
        "steps": ["navigator", "matrix"]
      }
    }
  }
}
```

The exact schema should be finalized contract-first before implementation. The example above describes intent, not a frozen field naming API.

## 6. Matrix data/action boundary

### Read contract

Do not reproduce the current React behavior of manually stitching many paged DocType queries forever.

Canonical Matrix View should consume one of two data-source forms:

1. **Declarative DocType source** for simple axes/cells where generic resource queries are enough.
2. **Named projection source** for complex matrices where server-side bounded/read-only composition is required.

Projection results must be:

- tenant/permission aware;
- bounded;
- fail closed on truncation when partial data would be misleading;
- stable-keyed;
- explicit about paging/search;
- free of client-trusted tenant/role claims.

### Write contract

Do not make Matrix View itself know pricing, IAM, stock or HR rules.

Support commit adapters:

- `document_update` only for independent master rows where existing Bulk invariants apply;
- `action` / server method for relationship or compound matrices;
- transaction-specific methods for any ledger/submit behavior.

For Item Price reference:

- price/UOM/currency semantics belong to pricing/domain logic;
- compound save must validate all touched records before mutation where practical;
- OCC/version evidence must be preserved;
- idempotency/fingerprint should be used for compound actions where retry can duplicate work;
- partial failure behavior must be explicit;
- server permissions are authoritative;
- client confirmation is UX only.

## 7. Alumdoor Item Price reference extraction

The first implementation must achieve **UX parity or better** with the current `ItemPriceMatrixPanel`.

Required behaviors:

1. Price List -> Item Group -> Item navigation.
2. Independent search for Price List and Item.
3. UOM rows.
4. Price List columns.
5. Enabled/disabled price state.
6. Currency rate editor.
7. UOM conversion-factor editor.
8. Add UOM.
9. Remove UOM with safe disabling/cleanup semantics.
10. Create Price List with effective date.
11. Hide/show price columns.
12. Focus/full-width matrix mode.
13. Sticky headers/axes.
14. Desktop and touch/mobile flows.
15. Unsaved-change guard.
16. OCC/conflict feedback.
17. Clear per-operation error states.
18. No loss of existing Item Price authority or pricing resolution semantics.

### Required end state

Shared runtime must no longer contain:

```ts
if (props.doctype === "Item Price") { ... }
```

Alumdoor/pricing metadata selects the Matrix archetype and named data/actions. The generic runtime does not know the words `Item Price`, `Price List`, `UOM`, or Alumdoor.

## 8. Second-reference proof

Do not declare Matrix generic after only one domain-shaped implementation.

After Item Price parity, validate the same renderer with a second relationship use case. Preferred order:

1. `Supplier x Item` procurement relationship; then
2. `Item x Warehouse/Reorder` inventory relationship; then
3. `User x Role` only after WS11 security contract review.

The second reference must add metadata/domain actions only. If shared React requires business-name conditions, the abstraction is not finished.

## 9. App Factory authoring

WS09 should expose the UI Grammar as first-class authoring, not raw JSON surgery.

Builder flow:

1. choose actor/outcome;
2. choose archetype;
3. bind data source(s);
4. bind actions;
5. choose fields/axes/blocks;
6. configure interaction policy;
7. choose design profile;
8. preview desktop/tablet/mobile;
9. validate permission/action contracts;
10. package/version/install.

The compiler must validate:

- referenced DocTypes/fields/actions exist;
- axis keys are stable;
- block spans/layout are valid;
- edit targets are not server-owned/read-only;
- action permission Doctype is present;
- transaction/ledger data cannot silently use generic document update;
- mobile composition has a deterministic fallback;
- no route/screen/action namespace collisions.

## 10. AI-assisted layout generation

AI should select from the grammar, not emit arbitrary React.

Input:

- actor;
- job-to-be-done;
- process/domain model;
- capability/data metadata;
- device context;
- expected frequency/volume;
- permission/action contracts.

Output:

- archetype;
- layout primitives;
- block/axis definitions;
- interaction policy;
- design profile;
- explanation/evidence for deterministic validation.

AI-generated metadata must pass the same compiler/validator as human-authored metadata. Invalid or unsafe business mutations fail closed.

## 11. Ownership and dependency map

Use existing workstream ownership; do **not** create a new shared-contract owner just to make the board larger.

### WS09 — BPM / App Factory

Owns:

- canonical UI Grammar metadata schema;
- `viewPolicy.matrix` authoring contract;
- archetype/block/interaction schema;
- compiler/validator;
- App Factory builder/preview authoring;
- manifest/version/install semantics.

### WS14 — Frontend runtime/mobile

Owns:

- generic Matrix renderer;
- layout/archetype composition runtime;
- desktop/tablet/mobile behavior;
- keyboard/a11y/touch;
- shared styling/design tokens;
- visual regression/browser evidence.

### WS00 — Architecture/kernel

Owns only the shared backend seams if required:

- generic bounded projection/read contract;
- generic action/mutation boundary;
- OCC/idempotency primitives that are truly cross-domain.

Do not move pricing rules into WS00.

### WS02 / pricing domain

Owns Item Price business semantics and any pricing-specific server projection/commit method. Existing `clouderp-pricing` authority must be reused rather than duplicated.

### WS17 — Alumdoor reference vertical

Owns:

- acceptance against the current successful price-manager UX;
- Alumdoor metadata wiring;
- no shared runtime fork.

### WS11 / WS12

- WS11 reviews privileged matrix cases such as `User x Role`.
- WS12 supplies release/performance/production evidence, not renderer business logic.

## 12. Execution phases after WS00–17 convergence

### Phase 0 — Contract lock

- Re-read exact post-convergence `main`.
- Locate/add capability IDs for Matrix/UI Grammar if absent.
- Audit WS09/WS14 post-merge contracts.
- Freeze Matrix v1 schema and acceptance fixtures.
- Record Item Price parity fixture from current Alumdoor behavior.

Exit: schema/ownership/permission/write contract agreed by repo evidence; no runtime implementation yet.

### Phase 1 — Matrix Foundation

- Add `viewPolicy.matrix` types + validation.
- Add compiler/manifest transport.
- Add data-source/action references.
- Add metadata fixtures and negative validation tests.

Maturity target: `Foundation`.

### Phase 2 — Generic Matrix runtime

- Implement Matrix renderer with axis virtualization/bounds as needed.
- sticky axes;
- cell editor registry reuse;
- search/filter;
- column visibility;
- dirty guard;
- keyboard navigation;
- mobile step mode;
- empty/loading/error/conflict states.

No pricing literals in renderer.

Maturity target: `Wired`.

### Phase 3 — Item Price extraction

- Move Alumdoor/Item Price config to Matrix metadata.
- Move pricing-specific compound read/write behavior behind pricing-domain projection/actions.
- Preserve all 18 acceptance behaviors.
- Delete the shared runtime `Item Price` branch after parity passes.

Maturity target: Matrix `RC`; Item Price reference `RC`.

### Phase 4 — Second reference

- Implement `Supplier x Item` using metadata + procurement action(s).
- Prove no shared business-name condition was added.
- Refine schema only for demonstrably generic gaps.

Maturity target: generic Matrix `RC` with multi-domain evidence.

### Phase 5 — UI Grammar expansion

Prioritize archetypes by reuse/value, not novelty:

1. `cockpit`
2. `wizard`
3. `mobile-task`
4. `timeline`
5. `pos`
6. `kiosk`

Existing List/Form/Bulk/Kanban/Calendar/Gantt/Tree/Dashboard/Report should be composed, not rebuilt.

### Phase 6 — App Factory builder + AI planner

- visual archetype picker;
- layout/block editor;
- Matrix axis binding editor;
- action binding;
- responsive preview;
- deterministic validation;
- AI suggestion that outputs the same schema.

### Phase 7 — Hardening

- typecheck/build;
- targeted metadata/compiler tests;
- permission/tenant tests;
- OCC/idempotency/conflict tests;
- browser/E2E and screenshots at mobile/tablet/desktop;
- large-matrix performance test;
- release marker evidence when actually deployed.

Only then promote from RC toward Hardened.

## 13. Performance envelopes

Matrix must be designed for business-scale data rather than rendering the Cartesian product blindly.

Initial engineering envelopes to validate, not customer SLA:

- bounded axis/page queries;
- server search rather than loading entire large catalogs;
- visible-window rendering/virtualization when cell count crosses threshold;
- no N x M network call pattern;
- debounce/cancel stale searches;
- batch commit or domain action rather than one network round-trip per visible cell;
- clear truncation/error state rather than silently incomplete data.

Threshold values should be derived from measured runtime/browser/Cloudflare evidence during implementation.

## 14. Definition of Done

This initiative is not complete because a Matrix component exists.

Done requires:

- canonical metadata contract;
- compiler validation;
- generic renderer;
- server-side permissions;
- safe write/action boundary;
- Item Price parity with no shared `Item Price` special case;
- second-domain reference with no renderer business literals;
- mobile/desktop accessibility;
- failure/conflict/correction semantics;
- tests/evidence appropriate to risk;
- App Factory authoring path;
- documentation/status updated after merge;
- no duplicate pricing/stock/IAM source of truth.

## 15. Recommended implementation order

1. Finish WS00–17 convergence first.
2. Merge canonical WS09 App Factory/input-table work before changing shared App Factory schema.
3. Re-audit exact WS14 runtime after convergence.
4. Contract-lock Matrix/UI Grammar.
5. Implement Matrix metadata + generic renderer.
6. Extract Item Price as the first reference without UX regression.
7. Prove with Supplier x Item.
8. Expand cockpit/wizard/mobile-task/timeline/POS/kiosk archetypes.
9. Add App Factory visual authoring and AI-assisted archetype selection.
10. Harden with cross-device/performance/security evidence.

The key product decision is deliberate: **do not throw away the strong Alumdoor price UX to make it generic. Generalize the model underneath it so the same quality becomes reusable.**
