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

MetaForge already has generic renderer families for List, Form, Bulk, Report, Kanban, Calendar, Gantt, Tree, Dashboard, Print, Overview, Process and AppScreen compositions.

App manifest already supports design profiles (`brand`, density, radius, content width) and AppScreen supports modes (`desk`, `focus`, `touch`), 1–3 columns, and metric/list/action blocks.

Bulk View already has canonical `viewPolicy.bulk` with columns, editable fields, paste, fill-down, page size, `document_update` commit strategy and fail-closed handling for unsafe/transactional records.

### Architecture debt to remove

The Item Price manager is still a bespoke runtime path. It includes valuable interaction patterns that are generic in nature:

- hierarchical navigator: Price List -> Item Group -> Item;
- two independent search scopes;
- row axis: UOM;
- column axis: Price List;
- cell state: enabled + rate;
- row auxiliary edit: UOM conversion factor;
- add/remove row member;
- create column entity;
- hide/show columns;
- focused/full-width matrix mode;
- sticky row/column headers;
- mobile step navigation;
- OCC using `modified`;
- create/update/disable semantics.

The current React component also performs multi-document business mutations directly. That is useful compatibility behavior but not the final generic contract.

## 4. UI Grammar model

Do not create dozens of unrelated renderers. Standardize UI generation into five layers:

1. task-oriented surface pattern;
2. layout primitives;
3. block primitives;
4. interaction policy;
5. design profile.

The canonical breadth catalog is `docs/METAFORGE-UI-PATTERN-CATALOG-20260803.md`, with 52 patterns across navigation, record/master work, transactions, pricing/rules, governance/review, planning/operations, analysis, mobile/field, commerce/service and low-code/admin.

Patterns compose shared renderer primitives. A pattern is a recipe/contract, not permission to fork React per app.

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

The exact schema should be finalized contract-first before implementation. The example describes intent, not a frozen API.

## 6. Matrix data/action boundary

Canonical Matrix View supports declarative DocType sources for simple cases and named permission-aware projections for complex cross-source composition.

Write adapters:

- `document_update` only for independent safe master rows;
- `action` / server method for relationship or compound matrices;
- transaction-specific methods for ledger/submit behavior.

For Item Price, price/UOM/currency semantics remain pricing-domain authority. Compound save preserves server permission, OCC, idempotency where needed and explicit partial-failure semantics.

## 7. Alumdoor Item Price reference extraction

The first implementation must achieve UX parity or better with the current `ItemPriceMatrixPanel`.

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

Required end state:

```ts
if (props.doctype === "Item Price") { ... }
```

is removed from shared runtime. Alumdoor/pricing metadata selects the Matrix pattern and named data/actions.

## 8. Multi-domain proof ladder

Matrix is not generic after one domain. Reference ladder:

1. Alumdoor Item/UOM x Price List -> Item Price.
2. Supplier x Item procurement relationship.
3. Item x Warehouse/Reorder inventory relationship.
4. Item Group x Account accounting mapping.
5. User/Role x permission scope only after WS11 review.

A shared schema addition is justified only when multiple domains need it for the same structural reason.

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

## 10. AI-assisted layout generation

AI selects from the grammar/catalog, not arbitrary React.

Input includes actor, job-to-be-done, process/domain model, data metadata, device context, frequency/volume, mutation risk and permission/action contracts.

Output includes surface family/pattern, data source type, layout primitives, blocks/axes, interaction policy, responsive strategy and design profile.

AI-generated metadata must pass the same deterministic compiler/validator as human-authored metadata.

## 11. Ownership

### WS09
Schema, `viewPolicy.matrix`, pattern/block/layout/interaction contracts, compiler/validator and App Factory authoring.

### WS14
Generic Matrix renderer, composition runtime, responsive/mobile/a11y/touch/design-system behavior and browser evidence.

### WS00
Only truly shared bounded projection/action/OCC/idempotency seams. No pricing rules.

### WS02 / pricing
Item Price business semantics and pricing-specific projection/commit action, reusing existing pricing authority.

### WS17
Alumdoor acceptance and metadata wiring, no shared-runtime fork.

### WS11 / WS12
WS11 reviews privileged permission matrices. WS12 supplies release/performance evidence.

## 12. Execution program after WS00–17 convergence

### Wave UI-0 — Catalog + contract lock
Re-read exact post-convergence main, map capability IDs, audit WS09/WS14, inventory bespoke React surfaces, freeze Matrix v1 schema and Item Price parity fixtures.

### Wave UI-1 — Extract proven patterns
Price Matrix, Receiving Workspace, Entity 360, Approval Review and Reconciliation.

### Wave UI-2 — Matrix foundation/runtime
Add `viewPolicy.matrix`, compiler transport, projection/action binding and generic renderer with sticky axes, search, column visibility, dirty guard, keyboard, mobile step and conflict states.

### Wave UI-3 — Alumdoor extraction + multi-domain proof
Move Price Manager to metadata/domain actions, delete Item Price special case, then prove Supplier x Item and Item x Warehouse/Reorder.

### Wave UI-4 — Operations
Dispatch Board, Resource Scheduler, Inspection Checklist, Mobile Task, Scan Workflow and Production Control Board.

### Wave UI-5 — Governance/analysis
Approval, exceptions, reconciliation, close period, data quality, variance, aging and traceability.

### Wave UI-6 — App Factory
Schema Builder, Workflow Builder, Screen Builder, App Composer and deterministic pattern planner.

### Wave UI-7 — Commerce/workplace
POS, counter order, catalog picker, service desk, inbox and document/collaboration blocks.

### Wave UI-8 — AI planner
AI suggestions only after deterministic pattern validation is mature.

### Wave UI-9 — Hardening
Build/typecheck, metadata/compiler regressions, permission/tenant/OCC/idempotency/conflict tests, browser/E2E/screenshots, performance and release evidence.

## 13. Definition of Done

A canonical pattern reaches RC only when metadata schema exists, shared runtime primitives are used, server permission/data/action contract is explicit, desktop/mobile behavior and error/conflict states exist, targeted regressions exist, a real reference flow is wired, generic patterns have multi-domain proof where appropriate, no vertical switch is added to shared runtime and no duplicate source of truth exists.

Hardened additionally requires production/browser/performance/failure evidence appropriate to risk.

## 14. Expected end state

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
