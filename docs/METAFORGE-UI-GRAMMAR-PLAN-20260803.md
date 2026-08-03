# MetaForge UI Grammar + Matrix Extraction Plan

Date: 2026-08-03

Planning baseline: exact `main@057c5a9e0e37f7073e2a6700802a5add416bd063`.

This document is a convergence-follow-up implementation plan. It follows `skills/forge-enterprise-completion/SKILL.md`, `docs/FORGE_ENTERPRISE_NORTH_STAR.md`, the capability map, exact runtime code, and the existing Bulk View architecture. It does not claim completion or production deployment.

> Expanded enterprise breadth target: `docs/METAFORGE-UI-PATTERN-CATALOG-20260803.md`.
>
> The companion catalog supersedes the original 16-archetype breadth sketch with **52 task-oriented enterprise surface patterns**, **30+ reusable blocks**, **18 layout primitives**, **25+ interaction primitives** and **10 responsive strategies**. This document remains the architecture and Matrix extraction plan.

## 1. Outcome

Move Forge from “metadata can render generic forms/lists and a few screens” to a **UI Grammar** where apps describe business intent, data bindings, surface pattern, layout, interaction policy and visual profile; the shared runtime renders the result without app-specific React forks.

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

Do not create dozens of unrelated renderers. Standardize UI generation into five layers.

### Layer A — Task-oriented surface pattern

Use the canonical breadth catalog in `docs/METAFORGE-UI-PATTERN-CATALOG-20260803.md`.

The initial enterprise target is **52 patterns across 10 families**, covering:

- navigation/work entry;
- record/master-data work;
- transaction entry/execution;
- price/policy/rule authoring;
- review/approval/governance;
- planning/scheduling/operations;
- analysis/decision support;
- mobile/field workflows;
- commerce/service interaction;
- admin/setup/low-code authoring.

Patterns compose shared renderer primitives. A pattern is a recipe/contract, not permission to fork React per app.

### Layer B — Layout primitives

Canonical layout vocabulary is defined by the companion catalog and includes stack/grid/split/master-detail/three-pane/rail/tabs/stepper/drawer/sheet/modal/sticky/focus/full-bleed/card-flow forms.

Responsive behavior belongs to runtime and metadata hints, not per-app media-query forks.

### Layer C — Block primitives

Expand AppScreen’s current metric/list/action vocabulary toward the companion catalog's 30+ block targets, including form/table/matrix/timeline/chart/map/graph/checklist/document-preview/scanner/media/assistant-context blocks.

Blocks must reference permission-filtered data/action contracts; they must not invent domain queries in React.

### Layer D — Interaction policy

Reusable interaction contracts include search/filter/sort/group, inline edit, bulk selection, paste/fill-down, drag/reorder where safe, compare/preview/confirm/reason, OCC/conflict, dirty guard, scan, keyboard, touch, offline/sync state and export/print/share.

### Layer E — Design profile

Keep design visual, not business-specific:

- brand/theme;
- density;
- radius;
- content width;
- spacing/elevation;
- typography/numeric emphasis;
- table presentation;
- icon/touch/navigation profiles;
- semantic status styling.

The design layer must never change authoritative behavior.

## 5. Canonical Matrix View contract

Matrix becomes a first-class `viewPolicy.matrix` contract rather than a special case inside Bulk.

Conceptual shape:

```json
{
  "viewPolicy": {
    "matrix": {
      "enabled": true,
      "pattern": "price-matrix",
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

Alumdoor/pricing metadata selects the Matrix pattern and named data/actions. The generic runtime does not know the words `Item Price`, `Price List`, `UOM`, or Alumdoor.

## 8. Multi-domain proof ladder

Do not declare Matrix generic after only one domain-shaped implementation.

Reference ladder:

1. Alumdoor Item/UOM x Price List -> Item Price.
2. Supplier x Item procurement relationship.
3. Item x Warehouse/Reorder inventory relationship.
4. Item Group x Account accounting mapping.
5. User/Role x permission scope only after WS11 review.

A shared schema addition is justified only when multiple domains need it for the same structural reason. If shared React requires business-name conditions, the abstraction is not finished.

## 9. App Factory authoring

WS09 should expose the UI Grammar as first-class authoring, not raw JSON surgery.

Builder flow:

1. choose actor/outcome;
2. choose business job/pattern;
3. bind data source(s);
4. bind actions;
5. choose fields/axes/blocks;
6. configure interaction policy;
7. configure responsive policy;
8. choose design profile;
9. preview desktop/tablet/mobile;
10. validate permission/action contracts;
11. generate acceptance scenarios;
12. package/version/install.

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

AI should select from the grammar/catalog, not emit arbitrary React.

Input:

- actor;
- job-to-be-done;
- process/domain model;
- capability/data metadata;
- device context;
- expected frequency/volume;
- mutation risk;
- permission/action contracts.

Output:

- surface family/pattern;
- data shape/source type;
- layout primitives;
- block/axis definitions;
- interaction policy;
- responsive strategy;
- design profile;
- explanation/evidence for deterministic validation.

AI-generated metadata must pass the same compiler/validator as human-authored metadata. Invalid or unsafe business mutations fail closed.

## 11. Ownership and dependency map

Use existing workstream ownership; do **not** create a new shared-contract owner just to make the board larger.

### WS09 — BPM / App Factory

Owns:

- canonical UI Grammar metadata schema;
- `viewPolicy.matrix` authoring contract;
- pattern/block/layout/interaction schema;
- compiler/validator;
- App Factory builder/preview authoring;
- manifest/version/install semantics.

### WS14 — Frontend runtime/mobile

Owns:

- generic Matrix renderer;
- layout/pattern composition runtime;
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

- WS11 reviews privileged Matrix/permission cases.
- WS12 supplies release/performance/production evidence, not renderer business logic.

## 12. Execution program after WS00–17 convergence

### Wave UI-0 — Catalog + contract lock

- re-read exact post-convergence `main`;
- locate/add capability IDs for UI Grammar/Matrix if absent;
- audit WS09/WS14 post-merge contracts;
- inventory bespoke React surfaces and map them to the 52-pattern catalog;
- freeze Matrix v1 schema and Item Price parity fixtures.

### Wave UI-1 — Extract proven patterns

Priority:

1. Price Matrix from Alumdoor.
2. Receiving Workspace from Purchase Receipt bulk UX.
3. Entity 360 from CRM/customer contexts.
4. Approval Review from workflows.
5. Reconciliation from finance/migration use cases.

### Wave UI-2 — Generic Matrix Foundation + runtime

- `viewPolicy.matrix` types/validation/compiler transport;
- named projection/action binding;
- renderer with sticky axes, search, column visibility, dirty guard, keyboard, mobile step and conflict states;
- no pricing literals.

### Wave UI-3 — Alumdoor extraction + multi-domain proof

- move Alumdoor Price Manager to Matrix metadata/domain actions;
- delete shared `Item Price` branch;
- prove Supplier x Item and Item x Warehouse/Reorder;
- only then promote generic Matrix toward RC.

### Wave UI-4 — Operations patterns

- Dispatch Board;
- Resource Scheduler;
- Inspection Checklist;
- Mobile Task;
- Scan Workflow;
- Production Control Board.

### Wave UI-5 — Governance/analysis patterns

- Approval Review;
- Exception Review;
- Reconciliation;
- Close Period;
- Data Quality Review;
- Variance/Aging/Traceability surfaces.

### Wave UI-6 — App Factory authoring

- Schema Builder;
- Workflow Builder;
- Screen Builder;
- App Composer;
- deterministic pattern planner.

### Wave UI-7 — Commerce/workplace

- POS;
- counter order;
- catalog picker;
- service desk;
- inbox;
- document/collaboration blocks.

### Wave UI-8 — AI planner

AI suggests only catalog-valid patterns after deterministic schema/planner/validator coverage is strong enough.

### Wave UI-9 — Hardening

- typecheck/build;
- metadata/compiler tests;
- permission/tenant tests;
- OCC/idempotency/conflict tests;
- browser/E2E/screenshots mobile/tablet/desktop;
- large-matrix and large-list performance;
- release evidence when actually deployed.

## 13. Performance envelopes

Matrix and other composed surfaces must be designed for business-scale data rather than rendering Cartesian products blindly.

Engineering envelopes to validate, not customer SLA:

- bounded axis/page queries;
- server search rather than loading entire large catalogs;
- visible-window rendering/virtualization when thresholds are crossed;
- no N x M network call pattern;
- debounce/cancel stale searches;
- batch/domain commit rather than one request per cell where domain semantics permit;
- deterministic partial/truncation indication;
- mobile memory/interaction checks.

## 14. Security and correctness gates

- server permission is authoritative;
- no tenant/user/role trust from client payload;
- field masking preserved;
- Matrix cannot expose hidden axes/cells through client-side-only filtering;
- unsafe transactions cannot use generic document mutation;
- finance/stock/payroll/legal/IAM actions remain domain-owned;
- offline state must reflect real offline contracts;
- generated metadata cannot bypass action permission contracts.

## 15. Definition of Done

A canonical pattern reaches RC only when:

- metadata schema exists;
- runtime composes shared primitives;
- server permission/data/action contract is explicit;
- desktop/mobile behavior is defined;
- loading/empty/error/conflict states exist;
- targeted regressions exist;
- a real reference flow is wired;
- generic patterns have second-domain proof where appropriate;
- no vertical-specific switch is added to shared runtime;
- no duplicate source of truth is introduced.

Hardened additionally requires production/browser/performance/failure evidence appropriate to risk.

## 16. Expected end state

Forge should converge toward:

- roughly **12-16 renderer primitives**;
- **52 canonical task-oriented enterprise surface patterns**;
- **30+ reusable blocks**;
- **18 layout primitives**;
- **25+ interaction primitives**;
- **10 responsive strategies**;
- constrained design profiles;
- App Factory + AI that generate only valid combinations of the above.

The result is not “52 screens”. It is a constrained enterprise UI language capable of generating thousands of valid surfaces while keeping authoritative data, permissions and business rules outside presentation code.
