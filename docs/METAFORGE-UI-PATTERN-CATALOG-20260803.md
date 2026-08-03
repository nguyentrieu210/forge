# MetaForge Enterprise UI Pattern Catalog

Date: 2026-08-03
Status: planning / post-convergence follow-up
Companion: `docs/METAFORGE-UI-GRAMMAR-PLAN-20260803.md`

## 1. Why the first 16 archetypes are not enough

A generic ERP runtime cannot stop at List/Form/Kanban/Calendar/Gantt/Dashboard plus a handful of compositions. That covers rendering mechanics, but enterprise operators do not think in renderer names. They think in jobs such as:

- receive stock from a supplier;
- compare quotations;
- enter prices by price list;
- reconcile bank transactions;
- approve a payroll run;
- dispatch technicians;
- close a month;
- plan capacity;
- assign users to roles;
- build an app;
- resolve exceptions.

The UI system therefore needs a larger **pattern catalog** above the low-level renderers. The catalog must remain finite and composable so App Factory and AI can choose deterministic patterns instead of generating arbitrary React.

Target model:

> `business job -> surface pattern -> layout -> blocks -> data bindings -> actions -> interaction policy -> design profile`

The pattern catalog is not a promise to create one React component per pattern. Most patterns compose the same shared primitives.

## 2. Three levels of reuse

### Level 1 — renderer primitives

Low-level reusable engines already present or planned:

- List
- Form
- Bulk Grid
- Matrix
- Tree
- Kanban
- Calendar
- Gantt
- Timeline
- Report
- Dashboard
- Print
- Map
- Graph/relationship
- Document preview

### Level 2 — surface patterns

Stable task-oriented compositions such as:

- master-detail;
- price matrix;
- reconciliation;
- approval review;
- receiving workspace;
- POS;
- capacity scheduler.

These are the main subject of this catalog.

### Level 3 — vertical recipes

App-specific metadata bindings that reuse patterns:

- Alumdoor price management;
- aluminium receiving;
- phone IMEI receiving;
- coffee POS;
- HR attendance review;
- recruiting candidate review.

Vertical recipes must not fork the renderer.

## 3. Canonical pattern families

The initial enterprise catalog targets **52 surface patterns** across 10 families.

The number is intentionally larger than the first 16-archetype draft because Forge is intended to be a platform for ERP/HCM/CRM/WMS/MRP/BPM/BI/workplace/commerce and vertical apps, not merely a CRUD renderer.

---

# Family A — Navigation and work entry

## A01 `app-home`
Role-aware app landing page with primary jobs, counters, recent items and shortcuts.

## A02 `workspace`
Grouped navigation cards/shortcuts/reports for one domain.

## A03 `command-center`
Cross-domain operator cockpit with alerts, pending work, KPIs and actions.

## A04 `inbox`
Assigned/owned pending work ordered by priority/SLA/due date.

## A05 `global-search`
Cross-DocType searchable result surface with entity type grouping.

## A06 `recent-favorites`
Recent records, pinned views, saved filters and shortcuts.

Acceptance principle: navigation patterns must be metadata/permission aware and cannot expose inaccessible routes merely because the client knows they exist.

---

# Family B — Record and master-data work

## B01 `record-list`
Canonical searchable/filterable/sortable list.

## B02 `record-form`
Canonical single-record form.

## B03 `quick-entry`
Minimal create surface for high-frequency master creation.

## B04 `master-detail`
List/tree on one side and selected record detail on the other.

## B05 `split-context`
Record plus activity/context/attachments/relations panel.

## B06 `bulk-grid`
Spreadsheet-like editing of independent safe master records.

## B07 `tree-editor`
Hierarchy navigation plus parent/move/create/rename actions with cycle protection.

## B08 `relationship-matrix`
Two-dimensional relationship/value editor.

## B09 `entity-360`
Customer/Supplier/Employee/Item 360 with summary, related documents, balances, activities and actions.

## B10 `compare-records`
Side-by-side comparison of two or more records or offers.

---

# Family C — Transaction entry and execution

## C01 `transaction-editor`
Header + line items + totals + workflow + submit/cancel/amend.

## C02 `transaction-wizard`
Guided multi-step transaction where order matters.

## C03 `bulk-transaction`
Paste/import/create multiple drafts through domain controller, not document mass-update.

## C04 `receiving-workspace`
Expected lines vs received lines, quantity/serial/batch/measurement evidence, exceptions and submit.

## C05 `picking-packing`
Pick list -> confirm quantity/serial -> pack -> dispatch.

## C06 `allocation-workspace`
Allocate demand/supply/payment/stock against targets with remaining quantities visible.

## C07 `reservation-workspace`
Reserve/release stock, capacity or resources with availability evidence.

## C08 `configuration-editor`
Product/service configuration where selections drive derived child lines/BOM/pricing.

## C09 `inspection-checklist`
Structured inspection/QA/field checklist with pass/fail/numeric/text/photo/signature evidence.

## C10 `correction-workspace`
Explicit reverse/correct/amend/return flow with reason and before/after evidence.

---

# Family D — Price, policy and rules

## D01 `price-matrix`
Reference: Alumdoor Item Price.

Axes and auxiliary dimensions are metadata-driven. Supports enable/disable, effective-date columns, UOM/variant rows, currency values, column visibility, focus mode, mobile step flow and compound save through pricing-domain action.

## D02 `rate-card`
Service/labor/rental/tariff rates by category/unit/effective period.

## D03 `discount-rule-builder`
Condition -> scope -> benefit -> priority/effective period.

## D04 `threshold-policy`
Tier/range rules such as quantity bands, credit limits, approval levels and tax brackets.

## D05 `mapping-matrix`
Generic mapping such as Item Group x Account, Company x Cost Center, Territory x Sales Team.

## D06 `permission-matrix`
Role/user/resource permissions with security-specific server enforcement.

Rule: D-family patterns only describe authoring UX. Authoritative evaluation belongs to domain/server packages.

---

# Family E — Review, approval and governance

## E01 `approval-review`
Document summary + diffs + evidence + approve/reject/return actions.

## E02 `exception-review`
Only problematic records, grouped by cause/severity, with remediation actions.

## E03 `reconciliation`
Two or more authoritative sources matched/unmatched/partially matched with tolerance and resolution.

Examples: bank reconciliation, stock reconciliation evidence, AP/AR matching, migration reconciliation.

## E04 `close-period`
Checklist + unresolved blockers + reconciliation results + lock/close action.

## E05 `audit-trail`
Chronological immutable/traceable history, changes, actors, approvals, source events.

## E06 `diff-review`
Before/after revision, version, configuration or metadata comparison.

## E07 `policy-approval`
Effective-dated rule/version review including source/legal evidence when applicable.

## E08 `data-quality-review`
Duplicates, missing mappings, invalid master data and fix actions.

---

# Family F — Planning, scheduling and operations

## F01 `kanban-board`
Stage/status flow.

## F02 `calendar-schedule`
Time-based schedule.

## F03 `gantt-plan`
Dependency and date plan.

## F04 `resource-scheduler`
Resource x time allocation, capacity, shifts, drag/drop where safe.

## F05 `capacity-board`
Demand vs available capacity with overload/underload indication.

## F06 `dispatch-board`
Jobs x technicians/vehicles/resources with assignment, priority and status.

## F07 `route-plan`
Stops/orders/tasks arranged geographically and temporally.

## F08 `production-control-board`
Orders/workstations/status/WIP/exceptions for manufacturing execution.

---

# Family G — Analysis and decision support

## G01 `kpi-cockpit`
Role-based KPI cards + trends + alerts + drill-down actions.

## G02 `analysis-table`
Grouped/pivot-like analysis, totals, filters, export.

## G03 `variance-analysis`
Actual vs budget/plan/standard/previous period with drill-down.

## G04 `funnel-analysis`
Stage conversion and leakage.

## G05 `aging-analysis`
AR/AP/inventory/service aging buckets with drill-through.

## G06 `traceability-graph`
Genealogy/relationship graph: lot -> process -> finished item -> delivery/customer.

Rule: semantic metrics and permission-aware data access remain WS08/domain authority; visualization does not define business truth.

---

# Family H — Mobile, field and constrained workflows

## H01 `mobile-task`
One job, large touch targets, minimal chrome, explicit complete/block actions.

## H02 `scan-workflow`
Barcode/QR/IMEI/serial scan -> validate -> accumulate -> commit.

## H03 `photo-proof`
Capture evidence, annotations/notes and completion.

## H04 `geo-checkin`
Location-aware visit/check-in with accuracy/evidence policy.

## H05 `offline-queue`
Offline-capable task list/form with sync/conflict state surfaced honestly.

## H06 `kiosk`
One-purpose self-service flow.

Note: H05 remains gated by WS00/WS11/WS12 offline/session/OCC/release-freshness contracts; UI must never pretend offline write safety exists before those contracts are real.

---

# Family I — Commerce and service interaction

## I01 `pos`
Catalog/cart/discount/payment/receipt.

## I02 `counter-order`
Fast order entry without full POS payment flow.

## I03 `catalog-picker`
Visual searchable catalog with quantity/options and add-to-document action.

## I04 `checkout`
Review charges, customer/payment/shipping, confirm.

## I05 `service-desk`
Ticket queue + conversation/context + SLA + resolution.

## I06 `appointment-booking`
Service/resource/time-slot selection and confirmation.

---

# Family J — Admin, setup and low-code authoring

## J01 `setup-wizard`
Guided organization/app setup.

## J02 `mapping-wizard`
Import/source columns -> Forge fields with validation and preview.

## J03 `schema-builder`
DocType/field authoring constrained by platform schema rules.

## J04 `workflow-builder`
States/transitions/roles/reasons/notifications.

## J05 `screen-builder`
Archetype/layout/block/data/action binding editor.

## J06 `app-composer`
App navigation, manifests, screens, actions, permissions, version/package preview.

---

## 4. Pattern count and what it means

Initial canonical catalog: **52 task-oriented surface patterns**.

This does NOT mean 52 separate React files. Expected implementation strategy:

- roughly 12-16 renderer primitives;
- roughly 15-20 layout/block primitives;
- shared control registry;
- shared action/data adapters;
- metadata recipes composing them into 52 patterns.

A new app should usually add **zero shared React**.

## 5. Layout grammar

Canonical layout primitives should include at least:

1. `stack`
2. `grid`
3. `split-horizontal`
4. `split-vertical`
5. `master-detail`
6. `three-pane`
7. `rail-content`
8. `tabs`
9. `stepper`
10. `drawer`
11. `sheet`
12. `modal-workspace`
13. `sticky-header`
14. `sticky-footer`
15. `sticky-axis`
16. `focus-mode`
17. `full-bleed`
18. `card-flow`

Responsive collapse behavior is defined by metadata/runtime policy, not custom app CSS.

## 6. Block grammar

AppScreen should evolve beyond the current metric/list/action into at least these reusable blocks:

1. `metric`
2. `trend`
3. `status`
4. `notice`
5. `list`
6. `table`
7. `form`
8. `quick-form`
9. `action`
10. `action-group`
11. `chart`
12. `matrix`
13. `timeline`
14. `activity`
15. `attachments`
16. `comments`
17. `relations`
18. `summary`
19. `totals`
20. `progress`
21. `checklist`
22. `document-preview`
23. `map`
24. `graph`
25. `calendar`
26. `gantt`
27. `kanban`
28. `scanner`
29. `media-capture`
30. `assistant-context`

Blocks must be permission-aware and data-bound. They cannot hide server permission gaps.

## 7. Interaction grammar

Canonical interaction primitives:

- search;
- structured filters;
- saved filters/views;
- sort/group;
- selection;
- bulk selection;
- inline edit;
- paste;
- fill-down;
- drag/drop;
- reorder;
- resize columns/panes;
- hide/show columns;
- pin/sticky;
- expand/collapse;
- drill-down;
- compare;
- preview;
- confirm;
- reason-required action;
- multi-step action;
- optimistic concurrency conflict;
- dirty guard;
- undo before commit;
- explicit correction after commit;
- scan;
- keyboard navigation;
- touch-first mode;
- offline/sync state;
- export/print/share.

## 8. Data-binding grammar

The UI grammar must support more than one `doctype + fields` model.

Canonical source types:

### `document`
One authoritative document.

### `list`
Rows from one DocType/query.

### `tree`
Hierarchy.

### `projection`
Permission-aware server-composed read model across multiple authoritative sources.

### `matrix`
Row axis + column axis + sparse cells + auxiliary fields.

### `timeline`
Ordered immutable/traceable events.

### `semantic`
Permission-aware metric/dimension result owned by BI semantic layer.

### `stream/queue`
Bounded pending work source with cursor/retry semantics.

The runtime should not fetch N x M cells one API call at a time for Matrix or other composed surfaces.

## 9. Action-binding grammar

Canonical action types:

- `navigate`
- `create`
- `update`
- `delete` only where lifecycle permits
- `workflow-transition`
- `submit`
- `cancel`
- `amend`
- `domain-action`
- `bulk-action`
- `preview-action`
- `export`
- `print`

For transactions, ledger, finance, stock, payroll, IAM, legal rules or compound relationship changes, `domain-action` is preferred over generic document mutation.

## 10. Alumdoor Price Matrix as reference pattern D01

The current Alumdoor Item Price workspace is the UX reference that must be extracted without regression.

Required generic capabilities:

- hierarchical navigator separate from matrix axes;
- independent search scopes;
- sparse cell state;
- cell enabled flag plus value;
- auxiliary row fields such as UOM conversion;
- create/remove row member;
- create column entity;
- effective-date subtitle;
- hide/show columns;
- selected-column emphasis;
- focus mode;
- sticky left columns and top header;
- desktop split layout;
- mobile navigator -> editor step flow;
- dirty state;
- OCC/conflict feedback;
- compound domain commit.

### D01 metadata concept

A Matrix pattern needs at least:

- `navigatorSource`
- `navigatorLevels`
- `rowAxisSource`
- `columnAxisSource`
- `cellSource`
- `rowAuxiliaryFields`
- `cellEditor`
- `cellEnabledBinding`
- `searchScopes`
- `columnPresentation`
- `rowPresentation`
- `readProjection`
- `commitAction`
- `createRowAction`
- `removeRowAction`
- `createColumnAction`
- `responsivePolicy`
- `permissionDoctype`

Exact field names remain contract-first work for WS09/WS14; this catalog describes capability requirements rather than freezing syntax prematurely.

## 11. Matrix reference ladder

The renderer is not generic until it succeeds in several structurally different domains:

1. Alumdoor `Item/UOM x Price List -> Item Price`.
2. Procurement `Supplier x Item -> supplier relationship/terms`.
3. Inventory `Item x Warehouse -> reorder/min/max/safety settings`.
4. Accounting `Item Group x Account -> account mapping`.
5. Security `User/Role x permission scope`, only with WS11 review.

A schema change is considered generic only when at least two domains require it for the same structural reason.

## 12. Reference-pattern extraction program

After convergence, Forge should deliberately mine good vertical UIs and promote repeatable patterns.

Candidates already implied by current products/workstreams:

- Alumdoor Price Manager -> D01 Price Matrix;
- Alumdoor Purchase Receipt bulk flow -> C04 Receiving Workspace / C03 Bulk Transaction;
- Warehouse Cash -> E03 Reconciliation / transaction cockpit patterns;
- CRM pipeline -> F01 Kanban Board + B09 Entity 360;
- HR attendance/geofence -> H01/H04 Mobile Task;
- manufacturing BOM bulk -> C03 Bulk Transaction / C08 Configuration Editor;
- service/field -> F06 Dispatch Board + H01 Mobile Task;
- migration tooling -> J02 Mapping Wizard + E03 Reconciliation;
- App Factory -> J03/J04/J05/J06 authoring patterns.

Rule:

> Proven vertical UX is evidence. Extract the repeatable structure, not the vertical nouns.

## 13. Design-system dimension catalog

Design profiles need more than brand/density/radius/content width.

Target metadata-safe visual dimensions:

- brand palette;
- light/dark/system theme;
- density;
- radius;
- content width;
- page spacing;
- block spacing;
- surface elevation;
- border emphasis;
- typography scale;
- numeric emphasis;
- table row density;
- table header mode;
- icon scale;
- touch target size;
- navigation mode;
- destructive-action emphasis;
- status semantic palette.

Visual dimensions must never change authoritative permissions or calculations.

## 14. Responsive policy catalog

Each surface declares one responsive strategy instead of arbitrary per-app media queries:

- `stack`
- `collapse-detail`
- `drawer-detail`
- `step`
- `scroll-axis`
- `cardify-table`
- `hide-secondary`
- `bottom-actions`
- `full-screen-task`
- `desktop-only-with-explicit-fallback`

Example: Price Matrix uses `step` for navigator/editor on phone and `scroll-axis` for the matrix itself.

## 15. App Factory pattern selection

The builder should not begin with a blank canvas. It should begin with the business job.

Suggested authoring sequence:

1. Actor.
2. Job to be done.
3. Data shape.
4. Mutation risk class.
5. Recommended surface pattern.
6. Bind authoritative data source.
7. Bind domain actions.
8. Configure layout/blocks/interactions.
9. Configure responsive policy.
10. Apply design profile.
11. Preview desktop/tablet/mobile.
12. Validate permissions/contracts.
13. Generate acceptance scenarios.
14. Version/package/install.

## 16. AI planner contract

AI should classify into the catalog rather than invent UI freely.

Example input:

`Operator needs to update selling price for many UOMs across several effective price lists.`

Expected planner output:

- family: D
- pattern: `price-matrix`
- data shape: `matrix`
- mutation: `domain-action`
- responsive: `step + scroll-axis`
- suggested blocks: navigator + matrix + action bar

Compiler/runtime then validate it deterministically.

## 17. Pattern selection heuristics

Examples:

- independent records edited in rows -> `bulk-grid`;
- relationship at intersections -> `relationship-matrix`;
- transaction line creation -> `transaction-editor` or `bulk-transaction`;
- two authoritative sets must match -> `reconciliation`;
- actor must decide approve/reject -> `approval-review`;
- over-time resource allocation -> `resource-scheduler`;
- one field operator, one job -> `mobile-task`;
- cart + payment -> `pos`;
- many setup decisions in sequence -> `setup-wizard`.

These heuristics should become testable planner rules before AI is allowed to override them.

## 18. Guardrails

### No app-specific switch in shared runtime

Forbidden end state examples:

```ts
if (doctype === "Item Price") ...
if (app === "alumdoor") ...
if (doctype === "Supplier") ...
```

unless the condition exists in an app/vertical adapter outside shared runtime and is explicitly domain-owned.

### No generic writer for unsafe transactions

UI resemblance does not make two write models equivalent.

A spreadsheet-looking Stock Reconciliation and a spreadsheet-looking Item master bulk editor may share grid UX but must not share unsafe mutation semantics.

### No fake offline

Offline UI states must follow real queue/OCC/session contracts.

### No maturity by screen count

52 patterns in metadata at `Foundation` is not success. A pattern reaches RC only when at least one real flow is wired with permissions, error states and regression evidence; generic patterns require multiple-domain evidence where appropriate.

## 19. Implementation waves

### Wave UI-0 — catalog and contracts

- merge post-convergence plan;
- map patterns to capability IDs;
- freeze naming and schema boundaries;
- inventory current bespoke React surfaces against the catalog.

### Wave UI-1 — extract current proven patterns

Priority:

1. D01 Price Matrix from Alumdoor.
2. C04 Receiving Workspace from existing Purchase Receipt bulk UX.
3. B09 Entity 360 from CRM/customer contexts.
4. E01 Approval Review from workflow patterns.
5. E03 Reconciliation from finance/migration use cases.

### Wave UI-2 — operations patterns

- F06 Dispatch Board;
- F04 Resource Scheduler;
- C09 Inspection Checklist;
- H01 Mobile Task;
- H02 Scan Workflow.

### Wave UI-3 — App Factory authoring

- J03 Schema Builder;
- J04 Workflow Builder;
- J05 Screen Builder;
- J06 App Composer;
- deterministic planner.

### Wave UI-4 — commerce/workplace

- POS/counter order/catalog picker;
- service desk;
- inbox;
- DMS/document preview/collaboration blocks.

### Wave UI-5 — AI-assisted generation

AI suggests catalog patterns only after deterministic schema/planner/validator coverage is strong enough.

## 20. Definition of Done for a canonical pattern

A pattern is `RC` only when:

- canonical metadata schema exists;
- runtime uses shared renderer primitives;
- server permission/data/action contract is explicit;
- desktop/mobile behavior is defined;
- loading/empty/error/conflict states are implemented;
- targeted regression exists;
- at least one real reference flow is wired;
- generic patterns have a second-domain proof where needed;
- no vertical-specific condition was added to shared runtime;
- no duplicate source of truth was introduced.

`Hardened` additionally requires production/browser/performance/failure evidence appropriate to the risk.

## 21. Expected end state

Forge should eventually expose roughly:

- **12-16 renderer primitives**;
- **52 canonical task-oriented patterns**;
- **30+ reusable blocks**;
- **18 layout primitives**;
- **25+ interaction primitives**;
- **10 responsive strategies**;
- a constrained design profile system;
- App Factory + AI that generate only valid combinations of the above.

The result is not “52 screens”. It is a constrained enterprise UI language capable of generating thousands of valid surfaces while keeping data authority, permissions and business rules outside presentation code.
