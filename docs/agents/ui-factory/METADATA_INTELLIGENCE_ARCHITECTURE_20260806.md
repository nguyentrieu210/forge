# METADATA INTELLIGENCE ARCHITECTURE — 2026-08-06

Status: **TARGET ARCHITECTURE / IMPLEMENTATION CONTRACT**  
Audit baseline: `main@2ba7f90af65b73107c402cd236780cb1fb1c1dfa`  
Parent audit: `METADATA_DRIVEN_DEEP_AUDIT_20260806.md`

---

## 1. Architecture decision

Forge will use **one canonical metadata intelligence pipeline** for ordinary business input surfaces.

No new form engine, child-table engine or app-specific renderer is introduced.

Target:

```text
App/DocType declaration
  + Business Context
  + trusted server capabilities
             ↓
    Canonical metadata normalization
             ↓
       Field Effect Planner
             ↓
┌────────────┼───────────────┬──────────────┐
│            │               │              │
Form      ChildGrid      AppAction       Builder preview
│            │               │              │
└────────────┴───────────────┴──────────────┘
             ↓
     common controls/services
             ↓
 named domain projection/action when simple metadata is insufficient
             ↓
 authoritative server validation/calculation/commit
```

The runtime may produce convenient previews. The server remains authoritative for permission, transaction lifecycle, money, stock, payroll, legal rules and compound writes.

---

## 2. Non-negotiable principles

### 2.1 Declaration first

Resolution order for a requested UI behavior:

1. existing canonical DocField / DocType / viewPolicy declaration;
2. existing Business Context policy;
3. existing shared runtime primitive;
4. named domain projection/action;
5. smallest new canonical metadata contract only when the above cannot express the proven use case;
6. app-specific React only for a true Experience surface that cannot be represented by the platform grammar.

A renderer branch like `if (meta.name === "Purchase Order Item")` is not an acceptable default solution.

### 2.2 Metadata describes intent and bindings, not authoritative domain algorithms

Allowed metadata responsibilities:

- source/ownership of a field;
- visibility/required/read-only conditions;
- default source;
- linked-master fetch;
- valid Link filtering;
- context binding;
- quick/expanded/internal surface;
- view columns/fields;
- presentation hints;
- reference to named server projection/action.

Not allowed as generic client authority:

- arbitrary executable business scripts;
- stock valuation formula;
- GL logic;
- payroll statutory formula;
- tax rules;
- compound transaction mutation;
- client-only permission decisions.

### 2.3 One semantic result across all renderers

Given the same:

- canonical field metadata;
- document values;
- parent values;
- business context;
- roles/capabilities;

Form, ChildGrid, bound AppAction and Builder preview must resolve the same:

- visible state;
- required state;
- editability;
- link target/filter;
- default/fetch behavior;
- provenance;
- dirty protection.

Presentation can differ; semantics cannot.

### 2.4 Legacy compatibility is deterministic

ERPNext/Frappe metadata without MetaForge-native keys must continue to work.

Native metadata strengthens/explains semantics; it does not invalidate legacy flags.

Canonical resolver precedence should be explicit and tested, for example:

```text
server/masked/permission/document lifecycle
        >
MetaForge edit ownership when declared
        >
Frappe read_only/depends_on/set-once flags
        >
presentation preference
```

Exact precedence must be frozen in tests before implementation completes.

---

## 3. Canonical field model

### 3.1 Value provenance

Existing `valueSource` is the primary ownership vocabulary:

| valueSource | Meaning | Typical UI behavior | Authority |
|---|---|---|---|
| `user` | human decides value | editable if permission/lifecycle allows | server validates |
| `default` | system seeds initial value | prefilled, normally overridable | server validates |
| `link` | linked master supplies value | autofill; edit depends on `editMode`/dirty rule | server validates source/target |
| `formula` | derived value | normally readonly preview | server recalculates if authoritative |
| `system` | platform/controller owns value | readonly/internal | server |
| `workflow` | lifecycle owns value | readonly/action-driven | server |

Do not infer provenance from field names when `valueSource` is available.

### 3.2 Edit ownership

Existing `editMode` is the canonical UI ownership hint:

| editMode | Runtime intent |
|---|---|
| `editable` | may edit if permission and document lifecycle allow |
| `readonly` | never offer direct edit |
| `set_once` | editable only in canonical creation/set-once window |
| `immutable_after_submit` | editable before submit only |
| `hidden` | not an ordinary rendered input |

Server remains the enforcement boundary. Runtime uses this to avoid presenting impossible actions.

### 3.3 Surface policy

Existing `surface`:

- `quick`: core human-decision field for compact entry;
- `expanded`: available in full form/detail;
- `internal`: not an ordinary operator field.

Existing `viewPolicy.*.fields/columns` can further specialize a renderer.

Rule:

> `surface` answers field-level general importance. `viewPolicy` answers renderer-level composition.

Do not add a second `primary/secondary/hidden` vocabulary until this combination is proven insufficient.

### 3.4 Dirty protection

Existing `dirtyGuard=preserve_user_value` means automation must not silently overwrite an operator-edited target.

The effect engine should track value provenance at runtime:

```text
untouched/default/auto
user-dirty
server-refresh
```

At minimum, automatic link/context effects must know whether a target was changed by the user after the last automatic assignment.

---

## 4. Generic Field Effect Planner

Working name: **Field Effect Planner**. Exact implementation name is not contractually important.

It is a pure/plannable layer in `@metaforge/core` where possible, with async execution delegated through services.

### 4.1 Input

Conceptual input:

```ts
{
  meta,
  doc,
  parent,
  businessContext,
  contextPolicy,
  roles,
  lifecycle,
  changedField?,
  previousDoc?,
}
```

### 4.2 Output

Conceptual output:

```ts
{
  resolvedFields,
  defaults,
  linkQueries,
  fetchEffects,
  contextEffects,
  clearEffects,
  warnings,
}
```

The planner should describe intent; renderer/service code executes network effects.

Do not return an arbitrary executable function from metadata.

### 4.3 Existing effects to unify first

#### A. Defaults

Sources:

- literal `field.default`;
- Frappe compatibility values such as Today/Now;
- declared Business Context `createDefaults`;
- parent context where a canonical policy declares it.

Precedence must be deterministic. Suggested default behavior:

```text
explicit existing value
  > duplicated/prefill payload
  > declared document default
  > context default only when target is empty
```

Any difference from current behavior must be proven through fixtures before changing it.

#### B. Conditions

Reuse canonical resolver for:

- `depends_on`;
- `mandatory_depends_on`;
- `read_only_depends_on`;
- permissions;
- docstatus/lifecycle;
- masking.

Child rows receive both `doc=row` and `parent=parentDoc`.

#### C. Link filters

Canonical Link query plan combines:

1. field `link_filters`;
2. safe `eval:` resolution;
3. Business Context link policy;
4. trusted reference DocType;
5. server-side user permission/tenant filtering.

The planner must not invent business filters from concrete target names.

#### D. `fetch_from`

Compile `link.source_field → target` rules once per meta.

Execution goals:

- one linked-document fetch may satisfy multiple target fields;
- cancellation/race protection;
- no fetch on unchanged initial load;
- clearing source has deterministic target behavior;
- dirty guard prevents unwanted overwrite;
- same behavior in Form/ChildGrid/bound AppAction.

#### E. Context effects

Use `BusinessContextPolicy`, not raw field-name coincidence.

For a child row:

```text
applyContextPolicy(childDoctype, selection, policies).defaults
```

not:

```text
copy every businessContext key if child happens to have same fieldname
```

### 4.4 Effect graph and cycle safety

Simple `fetch_from` rules form dependencies.

The compiler/planner should be able to build a directed graph:

```text
item_code → item_name
item_code → uom
item_code → material_specification
```

Rules:

- detect direct/indirect cycles where possible;
- cap cascading passes;
- avoid repeated network reads for the same source document in one change cycle;
- stale async results must not overwrite a newer source value;
- report invalid/cyclic metadata instead of infinite reactivity.

---

## 5. Link architecture

### 5.1 One canonical query path

All Link-like controls should share:

- target resolution;
- link filters;
- context filters;
- reference DocType;
- cancellation;
- pagination;
- display resolution;
- permission behavior;
- quick create where permitted.

Consumers:

- Link;
- Dynamic Link;
- child-grid Link cell;
- AppAction bound Link field;
- Table MultiSelect internal Link.

Table MultiSelect may keep chips/deduping; it should not implement a second query semantics.

### 5.2 Dynamic Link

Dynamic Link target comes from another field. The dependency planner must watch that target field and reset/revalidate the selected value when the target DocType changes.

Server still validates the referenced document.

### 5.3 Link-driven enrichment

Use tiers:

**Tier 1 — direct field copy**  
Use canonical `fetch_from`.

**Tier 2 — multiple copies from one linked document**  
Still use multiple `fetch_from`; executor batches one document fetch.

**Tier 3 — business projection**  
When output depends on several sources, rules, prices, stock state or configuration, call a named server projection/capability.

Do not implement Tier 3 as renderer-specific `enrichItem()`.

---

## 6. Child Table architecture

### 6.1 Canonical child semantics

A Table field points to child `DocTypeMeta` through `options`.

The embedded grid should derive:

- controls from child field types;
- visible/required/read-only state from child metadata + parent context;
- defaults/effects from the common planner;
- permission inheritance from parent according to canonical resolver;
- Link behavior from the common Link pipeline.

### 6.2 Column selection without business-name branches

Initial reuse strategy — no new contract required:

```text
embedded/compact columns
  = child viewPolicy.list.columns
  ?? child fields where in_list_view=1
  ?? safe generic fallback

expanded row fields
  = child viewPolicy.form.fields
  ?? surface expanded/quick rules
  ?? canonical form fallback

quick row / minimal entry
  = child viewPolicy.quickEntry.fields
  ?? fields with surface=quick
```

This should be implemented and tested before proposing a new `childGrid` view policy.

### 6.3 Column presentation

Generic width behavior may use:

- fieldtype;
- `form_width` only where semantically appropriate;
- optional future presentation hint if proven necessary;
- user-local column resizing/order as non-authoritative preference.

It must not encode field names such as `item_code`, `qty_bar`, `color` in the core renderer merely to get reasonable widths.

### 6.4 Derived values in rows

Direct safe visual derivations can be generic only when semantics are canonical and server confirms final values.

Example `amount=qty×rate` looks generic but is not universal enough to hard-code by field name across arbitrary DocTypes.

Preferred order:

1. server-provided/declared formula provenance if already canonical;
2. named domain projection;
3. client preview derived from a typed, bounded future contract only if repeated evidence justifies it.

Do not add arbitrary formula strings to metadata in the first waves.

---

## 7. AppAction architecture

### 7.1 Two classes of action input

#### Bound input

Represents an existing canonical field.

Target conceptual shape:

```ts
{
  bind: "Purchase Order Item.item_code",
  presentation?: {
    label?: string,
    width?: string,
    order?: number
  }
}
```

The runtime inherits canonical:

- fieldtype/options;
- dependency state;
- link filters;
- provenance/edit ownership;
- default/fetch semantics;
- permission-safe presentation.

Presentation overrides must not weaken server/field authority.

#### Synthetic input

Exists only for the action, e.g. a reason, mode, dry-run toggle, requested quantity or confirmation parameter with no canonical document field.

It remains explicitly declared as an AppAction field.

The two cases must be distinguishable so the platform does not duplicate canonical field semantics unnecessarily.

### 7.2 Input tables

For `presentation.row_doctype`, columns should resolve from canonical child metadata.

Target compatibility model:

```text
legacy full column declaration
       ↓ normalize
canonical field reference + presentation overrides
       ↓
ActionChildGrid
```

Avoid copying `fieldtype`, options, required and business rules when the canonical row DocType already owns them.

### 7.3 Action execution boundary

AppAction metadata describes:

- inputs;
- preview action;
- commit action;
- permission DocType/action;
- result presentation.

It must not describe arbitrary mutation logic.

Compound write remains a named server method.

---

## 8. Domain projection architecture

Simple metadata cannot express every ERP interaction safely.

A **named read/projection capability** is appropriate when values depend on multiple authoritative sources.

Examples:

- item + material specification + current company policy;
- customer + price list + date + quantity;
- item + warehouse + batch availability;
- employee + attendance period + payroll policy preview.

Conceptual contract:

```text
projection name
permission boundary
input field bindings
output field bindings
cache/cancellation semantics
```

Rules:

- read-only projection cannot mutate business state;
- permission checked server-side;
- output fields are typed/bound;
- runtime applies returned values according to provenance/dirty rules;
- commit controller recalculates authoritative values when needed;
- no arbitrary URL/method supplied by untrusted runtime metadata without registry validation.

This is the preferred replacement for hard-coded `enrichItem()` once direct `fetch_from` cannot cover the use case.

---

## 9. Business Context architecture

### 9.1 Server-resolved dimensions remain authoritative

Client persists preference only. Server resolves allowed options and locks/requirements.

### 9.2 Policy drives all binding

Use policy for:

- list filters;
- create defaults;
- child-row defaults;
- Link filters;
- report filters where applicable.

A shared service must not need `if (doctype === "Price List")` for ordinary context behavior.

### 9.3 Context is not an implicit permission grant

Context narrows UX/query scope. It never replaces tenant/user permission enforcement.

---

## 10. View/presentation architecture

### 10.1 `viewPolicy` remains renderer composition authority

Use current policy before new keys:

- list columns;
- form fields;
- quick-entry fields;
- bulk/matrix;
- mobile fallbacks.

### 10.2 Presentation heuristics are fallback only

Document archetype/title/metric inference may remain for unconfigured external/legacy DocTypes, but packaged Forge apps should gradually declare explicit presentation intent.

Heuristics must never alter:

- business state;
- permission;
- write behavior;
- required fields.

---

## 11. Builder / App Factory architecture

### 11.1 Same canonical model as runtime

Builder does not own a separate metadata schema.

It edits the canonical `DocTypeMeta` and previews through the real runtime.

### 11.2 Property authoring groups

Builder should group field intelligence rather than expose a flat wall of properties.

Recommended UX groups:

**Identity**
- fieldname
- label
- fieldtype
- options

**Data ownership**
- value source
- edit mode
- server enforced

**Default & autofill**
- default
- fetch_from
- dirty guard

**Conditions**
- depends_on
- mandatory_depends_on
- read_only_depends_on

**Link behavior**
- target/options
- link filters

**Surfaces**
- quick/expanded/internal
- list inclusion/filter
- form width

**Permission/data rules**
- permlevel
- precision/length
- existing server-enforced validation flags.

### 11.3 Guided authoring over raw syntax

Where possible:

- `fetch_from`: choose source Link field, then source field;
- dependency builder: choose field/operator/value, with advanced expression mode;
- link filters: structured rows with field/operator/value/context binding;
- surface: segmented control;
- value source/edit mode: explicit selects with compatibility validation.

Raw expressions remain available where supported, but guided authoring should prevent invalid declarations.

### 11.4 Compiler/Builder semantic parity

The same normalization function should produce safe default semantics regardless of authoring route.

Target:

```text
Brief compiler ─┐
                ├→ canonical semantic normalization → parser → runtime
Builder save ───┘
```

Do not allow brief-authored apps to gain capabilities that Builder-created apps cannot inspect or preserve.

---

## 12. Compatibility strategy

### 12.1 Read old, write canonical

New runtime must accept:

- Frappe-only fields;
- current MetaForge-native fields;
- legacy AppAction column declarations.

New compiler/Builder should emit canonical semantics where possible.

### 12.2 No flag-day package migration

Each package can migrate declarations gradually. Runtime compatibility lands before business-package hardcodes are removed.

### 12.3 Fallback rules are tested, not guessed

For every native semantic, test both:

- explicit native declaration;
- equivalent legacy Frappe declaration without native key.

---

## 13. Safety architecture

### 13.1 Permission

Metadata/UI permission is presentation only. Server enforces all reads/writes/actions.

### 13.2 Sensitive fields

Masked/permlevel-protected values never become available merely because a field effect wants them.

A projection/action must independently enforce access.

### 13.3 Injection/execution

No `new Function`, arbitrary JS, arbitrary network URLs or unvalidated executable metadata.

Conditions continue through safe evaluation allowlist.

### 13.4 Transactions

Generic effect execution must not perform document mutations. Effects only modify local draft state or call named read projections.

Write occurs through existing document/action lifecycle.

---

## 14. Performance architecture

Targets are qualitative until measured fixtures establish budgets.

Requirements:

- compile effect rules once per metadata revision;
- watch only fields that participate in the effect/dependency graph;
- batch all `fetch_from` targets per linked document read;
- cancel stale Link/projection requests;
- cache meta and immutable/reference master reads using existing adapter/query scope;
- never fetch once per visible grid cell;
- large child grids update only affected rows/cells;
- effect propagation has bounded passes/cycle detection.

---

## 15. Observability and explainability

Automation that changes user-visible values should be explainable in development/debug surfaces.

Recommended non-production-facing debug record:

```text
field: uom
source: link
trigger: item_code
rule: item_code.stock_uom
result: Kg
applied: yes
reason: target empty
```

For user UX, keep explanation concise, e.g. “Tự điền từ Mặt hàng”.

Do not expose server internals, stack traces or sensitive policy details.

---

## 16. Required conformance fixture

Create a small neutral app/fixture with no Sales/Purchase/Alumdoor nouns containing:

- literal default;
- Today/Now compatibility default;
- `depends_on`;
- mandatory/read-only dependency;
- Link + static filters;
- Link + context filter;
- multiple `fetch_from` targets;
- editable link-derived target with dirty guard;
- internal/quick/expanded fields;
- set-once field;
- child table using the same rules;
- Table MultiSelect;
- bound AppAction scalar input;
- bound AppAction table;
- synthetic action-only input;
- optional named read projection.

The exact same metadata should be exercised through:

- full Form;
- Quick Entry;
- ChildGrid;
- Action screen;
- Builder preview/round-trip;
- server save/action validation.

---

## 17. Anti-pattern ban list

After migration, new generic runtime code must not add:

```text
if (doctype === "Business DocType")
if (meta.name === "Business Child DocType")
const SALES_*_FIELDS = [...]
const PURCHASE_*_FIELDS = [...]
const ITEM_DERIVED_FIELDS = [...]
```

inside shared field/form/grid/action primitives.

Allowed exceptions require explicit justification, such as a canonical Frappe/system compatibility primitive. Exceptions should be testable and named as compatibility behavior, not silently mixed with business UI.

---

## 18. Exit architecture

The architecture is considered adopted when:

1. one canonical field-effect planner drives Form, ChildGrid and bound Action inputs;
2. child-grid columns/detail composition comes from metadata/view policy;
3. common Link query semantics are shared by all Link-like controls;
4. Business Context policy drives document/child/link binding;
5. AppAction supports canonical field binding without duplicating field semantics;
6. Builder can author/round-trip the intelligence it renders;
7. complex domain enrichment is named server capability, not renderer code;
8. shared renderer business-name branches are removed and guarded by CI;
9. conformance tests prove legacy fallback + canonical behavior;
10. authoritative business calculations remain server-owned.
