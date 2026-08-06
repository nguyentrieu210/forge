# METADATA-DRIVEN DEEP AUDIT — 2026-08-06

Status: **AUDIT / PROGRAM INPUT**  
Repository: `nguyentrieu210/forge`  
Exact audited main: `2ba7f90af65b73107c402cd236780cb1fb1c1dfa`  
Engineering risk of this document: `FAST / docs-only`  
Release impact of this document: `NONE`  
Implementation program risk: mixed `STANDARD`, with `CRITICAL` only if a later slice changes authoritative money/stock/payroll/legal behavior.

Companion documents:

- `METADATA_INTELLIGENCE_ARCHITECTURE_20260806.md`
- `METADATA_INTELLIGENCE_CAPABILITY_MATRIX_20260806.md`
- `METADATA_INTELLIGENCE_IMPLEMENTATION_PLAN_20260806.md`

---

## 1. Executive decision

Forge already has enough metadata infrastructure to become materially more intelligent than its current UI behavior. The primary problem is **not lack of metadata vocabulary**. The primary problem is that metadata capability is distributed unevenly across compiler, transport, runtime, child grids, action grids, Business Context and Builder.

The correct next direction is therefore:

> **Exploit existing canonical metadata to exhaustion before adding new metadata vocabulary. Move duplicated UI intelligence out of shared React renderers and into declarations, generic effect resolution, or named server/domain capabilities.**

The target operator experience is:

```text
user chooses the smallest set of business decisions
        ↓
context + metadata resolve defaults, visibility and valid choices
        ↓
linked master data fills dependent values
        ↓
generic client derives preview-only values where safe
        ↓
server/domain authority validates and recalculates authoritative results
        ↓
UI shows only the fields/actions that still require a human decision
```

This audit does **not** authorize moving financial, inventory, payroll, statutory or other authoritative formulas into the client. Metadata makes the UI intelligent; it does not replace domain authority.

---

## 2. Authority and phase

This audit follows `skills/forge-enterprise-completion/SKILL.md`:

1. exact GitHub state wins;
2. live phase/gate remains separate from strategic backlog;
3. UI changes resolve declaration-first;
4. generic runtime must not hard-code vertical schema when metadata can express it;
5. repeated cross-app patterns should become shared primitives only after evidence.

`CURRENT_STATUS.md` / `NEXT_TASKS.md` still place the real Alumdoor lane in controlled pilot with Pilot-01 source dependencies. This program is therefore **not a reason to reopen R5/R6 or displace the current real-pilot blocker**. It is a platform/product-hardening workstream that can be sliced safely and accepted independently.

No production write, pilot cutover, provider mutation or deployment is part of this audit.

---

## 3. Audit objective

Audit every metadata-driven UI path that determines one or more of:

- what the operator must enter;
- what the system can default;
- what can be fetched from linked masters;
- what choices are valid;
- what becomes visible/required/read-only;
- which child-table columns are primary vs detail-only;
- what business context can seed/filter;
- what a quick-create form contains;
- how AppAction scalar/table inputs inherit canonical semantics;
- what the Builder can actually author;
- which logic is duplicated or hard-coded inside shared renderers;
- which behavior must stay server/domain-authoritative.

Primary surfaces audited:

- DocType metadata model and transport;
- brief compiler;
- Form / New Form / Quick Entry;
- Link / Dynamic Link / Table MultiSelect;
- Child Table / ChildGrid;
- AppAction / ActionChildGrid;
- Business Context;
- viewPolicy / Matrix precedent;
- DocType Builder / App Factory authoring;
- shared presentation inference where it leaks field/domain knowledge.

Navigation/sidebar is not the primary focus of this program. The earlier operating-UX work can remain; this audit goes below navigation into field-level intelligence.

---

## 4. Existing capability inventory

### 4.1 Canonical DocField already carries rich semantics

`client/packages/core/src/types/meta.ts` already supports Frappe-compatible metadata:

- `default`
- `depends_on`
- `mandatory_depends_on`
- `read_only_depends_on`
- `fetch_from`
- `in_list_view`
- `in_standard_filter`
- `precision`
- `permlevel`
- passthrough extension keys

and MetaForge-native metadata:

- `form_width`
- `valueSource = user | default | link | formula | system | workflow`
- `editMode = editable | readonly | set_once | immutable_after_submit | hidden`
- `surface = quick | expanded | internal`
- `serverEnforced`
- `dirtyGuard = preserve_user_value`

`DocTypeMeta` also supports:

- `kind`
- `title_field`
- `image_field`
- `viewPolicy.form`
- `viewPolicy.quickEntry`
- `viewPolicy.list`
- `viewPolicy.bulk`
- first-class `viewPolicy.matrix`
- other view policies and passthrough extensions.

**Audit conclusion:** the platform does not need a new generic “smart form JSON” layer. A second metadata dialect would be architectural regression.

### 4.2 Server validation is already fail-closed for MetaForge-native semantics

`server/packages/frappe-model/src/validate.ts` validates `valueSource`, `editMode`, `surface`, `dirtyGuard` and important cross-field consistency, including:

- `valueSource=link` requires `fetch_from`;
- `valueSource=default` requires a default;
- `surface=internal` cannot be editable;
- `editMode=readonly` must align with readonly flags;
- `editMode=set_once` must align with set-only-once;
- unknown vocabulary fails validation.

This is a strong base. New vocabulary should meet the same fail-closed standard.

### 4.3 Metadata transport already preserves the intelligence

`server/packages/frappe-api/src/meta-shape.ts` passes through:

- dependency fields;
- `fetch_from`;
- `link_filters`;
- `form_width`;
- `valueSource`;
- `editMode`;
- `surface`;
- `serverEnforced`;
- `dirtyGuard`;
- `viewPolicy`.

Therefore several current UX gaps are **consumer gaps**, not transport gaps.

### 4.4 Brief compiler already infers field ownership semantics

`server/scripts/lib/compile-brief.mjs` already derives safe canonical semantics:

- layout field → system source;
- `fetch_from` → link source;
- readonly → workflow/formula where appropriate;
- default → default source;
- otherwise → user source;
- hidden/set-once/readonly/submittable → edit mode;
- hidden → internal surface;
- required editable → quick surface;
- otherwise → expanded surface;
- system/workflow/formula/readonly/hidden → server-enforced;
- editable link-derived target → preserve-user-value dirty guard.

This means Forge is already generating a **field provenance contract**, but the runtime is not consuming all of it consistently.

### 4.5 Form runtime is a relatively mature positive reference

`client/packages/views/src/form/FormView.tsx` already:

- resolves field state from metadata;
- reacts to `depends_on`, mandatory and readonly conditions;
- supports Link-driven `fetch_from`;
- fetches one linked document for multiple target fields where possible;
- protects against stale/racing link fetches;
- avoids firing fetch rules on initial document load;
- maps server field errors back to controls;
- keeps server authority for final save/validation.

This path should become the behavioral reference for ChildGrid and Action inputs instead of each renderer building its own enrichment engine.

### 4.6 Quick/expanded/internal surface policy exists and works

`client/packages/core/src/app/form-profile.ts` already makes `surface` and `viewPolicy.form/quickEntry.fields` meaningful:

- `surface=internal` is a hard rendering boundary for canonical fields;
- quick entry is metadata opt-in;
- expanded and quick surfaces share the same canonical meta;
- render filtering does not change the original meta used for defaults/serialization.

This is exactly the desired architecture: **one source schema, multiple metadata-declared surfaces**.

### 4.7 Business Context is already a reusable platform primitive

`client/packages/core/src/business/context.ts` already defines server-resolved dimensions and policy:

- company;
- fiscal year;
- warehouse;
- branch;
- cost center;
- project;
- territory;
- selling/buying price list.

`BusinessContextPolicy` already declares:

- supported dimensions;
- list filter mapping;
- create-default mapping;
- date-field mapping;
- link-filter mapping.

This capability should be used to seed/filter child rows and link queries instead of copying context keys or branching on business DocType names.

### 4.8 Matrix is the correct architectural precedent

UI01/UI02 Matrix work already established the correct pattern:

```text
canonical typed metadata
        ↓
generic renderer/view-model
        ↓
named projection/action capability
        ↓
server/domain authority
```

with explicit rules:

- no Item Price/Alumdoor literals in generic renderer;
- metadata expresses bindings/presentation, not domain algorithms;
- compound writes use named server actions;
- validation is fail-closed;
- runtime consumes capabilities, not hard-coded business behavior.

The field/form/child/action subsystem should converge to the same standard.

---

## 5. Principal findings

Severity in this audit means architectural/product priority, not incident severity.

### MD-01 — MetaForge-native field provenance is contract-live but runtime-underconsumed

**Priority: P1**  
**Type: existing capability not fully consumed**

Evidence paths:

- `client/packages/core/src/types/meta.ts`
- `server/packages/frappe-model/src/validate.ts`
- `server/packages/frappe-api/src/meta-shape.ts`
- `server/scripts/lib/compile-brief.mjs`

Repo search during this audit found `valueSource`, `editMode`, `serverEnforced`, `dirtyGuard` concentrated in type/compiler/transport paths, while UI consumers primarily use legacy Frappe flags plus `surface`.

Consequence:

- compiler expresses why a value exists, but runtime often still infers behavior from field names/types;
- link-derived editable fields cannot consistently use declared dirty protection;
- server-owned/formula/workflow semantics are not surfaced consistently to operators;
- different renderers may treat the same field differently.

Target:

- extend the generic field resolver/effect layer to consume existing provenance metadata;
- retain legacy Frappe flags as compatibility fallback;
- do not create a second semantic system.

### MD-02 — Shared ChildGrid contains concrete Sales/Purchase/Alumdoor schema knowledge

**Priority: P1**  
**Type: hard-coded runtime leakage**

Evidence:

`client/packages/views/src/form/ChildGrid.tsx` contains concrete lists and branches such as:

- purchase compact fields;
- sales compact fields;
- Sales Order Item full field lists;
- Purchase Order Item full field lists;
- Purchase Receipt Item full field lists;
- item-derived field lists;
- hard-coded UOM/color/availability/formula enrichment paths.

This violates the desired shared-runtime boundary. A generic table renderer should not know the business noun `Purchase Order Item`, `Sales Order Item`, `door_type`, `qty_bar`, etc.

Target:

- derive embedded columns from canonical child metadata/view policy;
- derive detail fields from form/quick metadata;
- move domain enrichment to declarations or named domain projections;
- remove DocType-name branches from shared ChildGrid.

### MD-03 — ChildGridWithExtensions is a second app-specific presentation fork inside shared views

**Priority: P1**  
**Type: renderer duplication**

`client/packages/views/src/form/ChildGridWithExtensions.tsx` knows:

- Quotation Item;
- Sales Order Item;
- Purchase Order Item;
- “Chi tiết đặt nhôm”;
- explicit Sales and purchase detail-field sets.

Target:

- eliminate the extension renderer after metadata parity exists;
- use child `viewPolicy.list.columns`, form/quick fields and generic grouping/presentation metadata;
- vertical-specific labels/groups belong to app/package declarations, not shared `views`.

### MD-04 — ActionChildGrid duplicates an independent enrichment/computation engine

**Priority: P1**  
**Type: duplicated intelligence / behavior divergence risk**

`client/packages/views/src/action/ActionChildGrid.tsx` currently hard-codes:

- auto field names;
- field-specific labels/widths;
- inventory mode value `Nhôm cây/lá`;
- `length_m × qty_bar × theoretical_kg_per_m` logic;
- amount calculation;
- Item → stock UOM / measurement / specification / color / warehouse enrichment;
- Material Specification lookup;
- clear-on-item-change field sets.

The same concepts also appear in ChildGrid, producing two independent implementations.

Target:

- one generic metadata/effect engine used by Form, ChildGrid and Action inputs;
- domain-specific multi-source enrichment goes behind a named projection/capability;
- authoritative formula remains server-owned.

### MD-05 — AppAction field contract is semantically poorer than DocField

**Priority: P1**  
**Type: contract duplication**

`client/packages/core/src/app/manifest.ts` scalar `AppActionField` currently carries only basic field shape. `AppActionInputColumn` adds `link_filters`, but still copies field definitions.

By contrast `row_doctype` explicitly promises reuse of canonical child metadata.

Consequence:

- action forms cannot naturally inherit dependency, fetch, edit/provenance and surface semantics;
- column declarations can drift from the canonical child DocType;
- runtime needs bespoke enrichment to compensate.

Target:

- distinguish **bound canonical inputs** from truly **synthetic action-only inputs**;
- bound action fields/columns reference canonical `DocType.field` semantics and may override presentation only;
- legacy full-column declarations remain readable through a compatibility normalizer.

### MD-06 — Brief compiler strips richer semantics when compiling AppAction fields

**Priority: P1**  
**Type: compiler/contract gap**

`compileAction()` parses a field but emits only the small AppAction subset. Rich field semantics are therefore lost by design even if authoring syntax could express them.

Target:

- once the AppAction binding contract is approved, compiler must preserve/reference canonical semantics rather than silently narrowing them;
- invalid or authority-unsafe overrides fail closed.

### MD-07 — Builder cannot author several metadata capabilities that runtime/server already understand

**Priority: P1**  
**Type: App Factory authoring gap**

The BRD for M17 expects broad DocField property coverage. Actual `DocTypeBuilder.tsx` currently exposes dependency expressions and defaults, but audit search found no Builder property editor for:

- `fetch_from`;
- `link_filters`;
- MetaForge-native `valueSource`;
- `editMode`;
- `surface`;
- `serverEnforced`;
- `dirtyGuard`.

This creates an important asymmetry:

```text
brief compiler → rich canonical semantics
Builder        → partial semantics
```

Target:

- Builder must be capable of authoring/inspecting all safe canonical intelligence;
- guided controls should replace raw JSON where possible;
- Builder preview must use the same runtime effect resolver as production.

### MD-08 — BusinessContextPolicy.linkFilters exists but shared Link service still contains business-name logic

**Priority: P2**  
**Type: existing policy underused**

`client/packages/views/src/container/services.ts` performs a generic metadata-based company filter, which is good, but also contains a concrete `doctype === "Price List"` branch.

At the same time `BusinessContextPolicy` already contains `linkFilters` mapping.

Target:

- make context-driven link filtering declaration-driven;
- remove `Price List` special-casing from generic services when parity is proven;
- keep server/user-permission enforcement authoritative.

### MD-09 — Child-row defaults copy raw business context instead of resolving canonical child policy

**Priority: P2**  
**Type: context binding gap**

`table-controls.tsx` passes the global `businessContext` selection directly as `rowDefaults` to ChildGrid. ChildGrid only seeds matching field names, so this works incidentally when context key and child field name are identical.

However `BusinessContextPolicy.createDefaults` already exists specifically to map a context dimension to the real DocType field.

Target:

- resolve child defaults with `applyContextPolicy(childMeta.name, context, policies)`;
- seed only declared child defaults;
- avoid implicit field-name coupling.

### MD-10 — Table MultiSelect bypasses the canonical Link query/control pipeline

**Priority: P2**  
**Type: control parity gap**

`TableMultiSelectField` implements its own search and display path. Current code calls Link search without the full canonical `link_filters`/reference/doc-value flow used by normal Link controls, and it does not reuse the same quick-create behavior.

Target:

- share the Link query planner/control primitives;
- preserve Table MultiSelect-specific chip/dedupe UX;
- do not fork filtering/permission behavior.

### MD-11 — Default resolution lives partly inside NewFormContainer

**Priority: P2**  
**Type: duplicated runtime semantic**

`NewFormContainer.tsx` contains Frappe magic-default handling for `Today` and `Now` and separately merges business-context defaults.

The behavior itself is valid compatibility logic; the issue is ownership.

Target:

- centralize default planning/resolution in the generic metadata effect layer;
- reuse it for new forms, new child rows and bound action inputs;
- keep Frappe compatibility tests before moving code.

### MD-12 — Document presentation still uses large field-name heuristics when explicit metadata is absent

**Priority: P3**  
**Type: presentation heuristic debt**

`client/packages/views/src/detail/document-presentation.ts` supports explicit metadata but also contains large candidate lists and DocType-name regex inference for archetype/title/metrics/context/status.

This is less dangerous than behavior hardcode because it is presentation-only, but it demonstrates the same architectural tendency.

Target:

- keep safe inference only as backward-compatible fallback;
- prefer explicit presentation/view metadata in packaged apps;
- do not spend the first implementation waves polishing this before field intelligence is fixed.

### MD-13 — Child Grid BRD promises more metadata parity than the current renderer delivers

**Priority: P1**  
**Type: spec/runtime divergence**

`client/docs/brd-screens/12-child-grid.md` explicitly describes:

- metadata-driven columns;
- per-row Link controls;
- `fetch_from` autofill;
- child defaults;
- dynamic conditions;
- metadata-only support for previously unseen child DocTypes.

Current runtime uses canonical meta for field controls and conditions, but the business hardcodes above prevent the acceptance statement from being true in the strong sense.

Target:

- update implementation first;
- then update BRD/status evidence to match proven behavior, not aspiration.

### MD-14 — Metadata compiler/server/runtime paths need one conformance suite

**Priority: P1**  
**Type: evidence gap**

Today many individual tests exist, but the key product promise is cross-layer:

```text
brief / Builder
  → package
  → parser
  → getdoctype transport
  → runtime form/grid/action
  → server save/action
```

Target:

- add a canonical “metadata intelligence conformance fixture” containing every supported semantic;
- prove the same fixture through Form, ChildGrid, Action-bound row and Builder round-trip;
- include negative/fail-closed cases.

### MD-15 — Generic runtime lacks a global architectural guard against business-name branching

**Priority: P1**  
**Type: governance gap**

Matrix work has a clear “no business literal” rule, but the general Form/Child/Action runtime has accumulated business-specific branches.

Target:

- add static architecture tests/scans for generic runtime hotspots;
- exceptions must be documented compatibility primitives, not ad-hoc business nouns;
- domain-specific behavior belongs to package declarations or named domain services.

---

## 6. Gap classification

All findings must be resolved through this order.

### Class A — metadata already exists; declaration is missing or wrong

Examples:

- missing `fetch_from`;
- missing `link_filters`;
- incorrect `surface`;
- view fields/columns not declared;
- context policy not declared;
- `in_list_view` / viewPolicy not aligned with operator task.

**Fix:** metadata/package declaration only. Do not modify renderer.

### Class B — metadata exists and is transported; runtime/Builder does not consume it consistently

Examples:

- `valueSource`;
- `editMode`;
- `serverEnforced`;
- `dirtyGuard`;
- ChildGrid `fetch_from` parity;
- context policy for child rows;
- Table MultiSelect Link parity.

**Fix:** shared generic runtime/authoring primitive. No business-name branches.

### Class C — current metadata cannot safely express the use case

Examples may include:

- multi-source domain enrichment where simple `fetch_from` is insufficient;
- a named remote projection that returns a deterministic set of derived preview values;
- explicit invalidation/clear behavior that cannot be inferred safely;
- canonical field binding for AppAction synthetic/bound inputs.

**Fix:** add the smallest typed/fail-closed contract only after a real Class-C fixture proves the gap. Do not start by inventing a general free-form effects DSL.

---

## 7. What must remain domain/server authority

Metadata-driven does **not** mean client-authoritative.

The following remain server/domain concerns:

- stock valuation;
- stock availability truth/reservation commit;
- GL posting;
- AR/AP balance;
- payment allocation;
- payroll/statutory calculations;
- tax/legal rules;
- manufacturing cost/WIP;
- final pricing when contract/promotion/approval authority is involved;
- document lifecycle/permission;
- transaction correction/reversal.

Client metadata may:

- prefill;
- filter;
- derive a preview;
- explain why a field is locked;
- request a named server projection;
- show a next action.

Server must recalculate/validate authoritative outputs before commit.

---

## 8. Product principle for every field

Every field shown to an operator must answer:

1. **Who owns the value?** user / default / link / formula / system / workflow.
2. **When can it change?** editable / set once / readonly / immutable after submit / hidden.
3. **Where should it appear?** quick / expanded / internal / list/child-grid policy.
4. **What drives it?** context / link / dependency / server projection / user.
5. **Can automation overwrite user input?** explicit dirty/provenance rule.
6. **Is it authoritative on the client?** normally no for transaction-critical values.

If these answers are not explicit, the field is a metadata debt candidate.

---

## 9. Definition of “metadata-driven enough”

The program is not complete when all hardcodes are merely moved into JSON.

It is complete when:

- generic renderer code does not know vertical/business DocType names for ordinary field behavior;
- a new child DocType using supported metadata can render and autofill without a React change;
- the same field behaves consistently in Form, Quick Entry, ChildGrid and bound Action input;
- field provenance and edit ownership are machine-readable;
- context bindings are declared, not inferred from coincidental field names;
- Builder can author and preview the supported intelligence;
- complex domain enrichment is a named capability with permission and server authority;
- package compiler/parser rejects unsafe/unknown semantics;
- legacy ERPNext/Frappe metadata still works through deterministic fallback;
- no financial/stock/payroll authority is silently shifted into UI code.

---

## 10. Recommended execution order

1. **Consume existing metadata semantics first.**
2. **Unify Link/default/context effect planning.**
3. **Converge ChildGrid and remove business hardcodes.**
4. **Converge AppAction inputs onto canonical field bindings.**
5. **Bring Builder/App Factory to authoring parity.**
6. **Introduce only proven minimal Class-C contracts.**
7. **Migrate Alumdoor as the first reference package and remove temporary hardcodes.**
8. **Run cross-domain conformance + architecture guards.**

Detailed PR slicing and gates are in `METADATA_INTELLIGENCE_IMPLEMENTATION_PLAN_20260806.md`.

---

## 11. Audit conclusion

Forge is closer to the desired architecture than the current UX suggests. The strongest evidence is that canonical types, server validation, transport, brief compilation, form dependency resolution, surface policy, Business Context and Matrix metadata are already present.

The main debt is **convergence**:

```text
metadata intelligence exists
    but
not every renderer consumes the same intelligence
    and
some shared renderers compensate with business-specific code
```

Therefore the next platform objective is not “add more smart fields”. It is:

> **Make one canonical metadata intelligence path authoritative across every generic input surface, then delete the renderer-specific business knowledge that becomes unnecessary.**
