# METADATA INTELLIGENCE IMPLEMENTATION PLAN — 2026-08-06

Status: **EXECUTION PROGRAM / PR SLICING AUTHORITY**  
Audit baseline: `main@2ba7f90af65b73107c402cd236780cb1fb1c1dfa`  
Parent documents:

- `METADATA_DRIVEN_DEEP_AUDIT_20260806.md`
- `METADATA_INTELLIGENCE_ARCHITECTURE_20260806.md`
- `METADATA_INTELLIGENCE_CAPABILITY_MATRIX_20260806.md`

---

## 1. Program outcome

The program converts MetaForge from “metadata renders generic CRUD plus several smart bespoke paths” into:

> **one metadata-intelligence runtime where the operator enters only true decisions, all reusable default/link/dependency/context behavior is declaration-driven, and domain-specific complexity is served through named authoritative capabilities rather than shared-renderer hardcode.**

Primary measurable outcomes:

1. reduce duplicate/manual field entry;
2. make child tables as metadata-driven as full forms;
3. make AppAction inputs inherit canonical field semantics;
4. make Builder capable of authoring the intelligence runtime supports;
5. delete Sales/Purchase/Alumdoor business-schema knowledge from shared renderers;
6. prevent regression with a neutral conformance fixture and architecture guards;
7. preserve server/domain authority.

---

## 2. Program boundaries

### In scope

- `@metaforge/core` metadata resolution/effect planning;
- `@metaforge/controls` Link-like behavior where needed;
- `@metaforge/views` Form/ChildGrid/Action convergence;
- Business Context binding;
- AppAction input contracts;
- app-registry/compiler metadata normalization;
- Builder authoring/round-trip;
- package declaration migration, starting with Alumdoor reference flows;
- tests, CI guards, documentation/evidence.

### Out of scope unless a separate approved task is opened

- changing stock valuation;
- changing accounting posting;
- changing payroll/statutory rules;
- changing tax/legal effective-dated logic;
- real Pilot-01 source mutation/import;
- production deploy/cutover/provider/DNS/secret mutation;
- replacing React runtime;
- creating a free-form arbitrary client scripting engine.

---

## 3. Risk and release model

This program must classify each PR on two axes.

| Slice | Typical engineering risk | Release impact |
|---|---|---|
| docs/audit/test fixture only | FAST | NONE or NEW_CANDIDATE if build artifact changes |
| declaration-only package metadata | FAST/STANDARD by behavior | NEW_CANDIDATE |
| shared client effect resolver | STANDARD | NEW_CANDIDATE |
| ChildGrid/ActionGrid shared behavior | STANDARD | NEW_CANDIDATE |
| AppAction shared contract/parser/compiler | STANDARD | NEW_CANDIDATE |
| Builder-only authoring UI | STANDARD | NEW_CANDIDATE |
| named read projection | STANDARD; CRITICAL if it exposes critical authority incorrectly | NEW_CANDIDATE |
| authoritative money/stock/payroll/legal rule | CRITICAL | NEW_CANDIDATE / PILOT_RELOCK as applicable |

Do not call the whole program “UI-only”. Several phases change shared runtime and package contracts.

Historical R6 evidence remains historical truth. Deployment of a new shared candidate into a frozen pilot target follows the current Evidence Matrix / relock doctrine.

---

## 4. Program sequence

```text
MDI-00  Baseline + conformance fixture
   ↓
MDI-01  Consume existing field provenance/edit semantics
   ↓
MDI-02  Unify defaults + Link + Business Context effects
   ↓
MDI-03  Converge ChildGrid onto canonical metadata
   ↓
MDI-04  Converge AppAction inputs and ActionChildGrid
   ↓
MDI-05  Builder/App Factory authoring parity
   ↓
MDI-06  Add minimal named domain projection seam for proven Class-C cases
   ↓
MDI-07  Migrate Alumdoor/reference declarations and delete temporary hardcodes
   ↓
MDI-08  Cross-domain hardening, architecture guards and evidence closure
```

Do not reorder MDI-03/04 ahead of the common primitives they need. Otherwise business code will simply be rewritten a third time.

---

# MDI-00 — Freeze baseline and build a neutral conformance fixture

## Goal

Create a business-neutral proof surface before changing behavior.

## Work

### MDI-00.1 — neutral metadata fixture

Add a small fixture/app using neutral names such as:

```text
Reference Master
Reference Child
Reference Transaction
```

It must exercise:

- default;
- Today/Now compatibility;
- depends/mandatory/readonly conditions;
- static and dependent Link filters;
- Dynamic Link;
- multiple `fetch_from` targets;
- dirty-preserve behavior target;
- quick/expanded/internal surfaces;
- set-once/immutable behavior;
- child row metadata;
- Table MultiSelect;
- Business Context create/link mapping;
- action-bound scalar/table target once MDI-04 lands.

### MDI-00.2 — baseline tests

Before refactor, record which cases currently pass/fail per surface.

Do not falsify `FULL` support by testing only FormView.

### MDI-00.3 — architecture guard seed

Create a test utility capable of scanning generic runtime files for disallowed concrete business nouns. Initially advisory so existing debt can be enumerated; make it blocking only after MDI-07 removes known debt.

## Likely files

- new neutral fixture under test/demo packages;
- `client/apps/demo/src/selfcheck.ts` or dedicated selfcheck module;
- `server/tests/**` for package/compiler parity;
- new architecture test script.

## Exit

- baseline matrix committed;
- fixture builds/renders;
- all known current failures are explicit;
- no production/business behavior change.

---

# MDI-01 — Make existing native metadata semantics operational

## Goal

Use the metadata Forge already carries before inventing new vocabulary.

## Work

### MDI-01.1 — canonical effective field ownership resolver

Extend/refactor core resolution so runtime can consume:

- `valueSource`;
- `editMode`;
- `serverEnforced`;
- `dirtyGuard`;
- existing legacy Frappe flags.

Freeze precedence through tests.

Do not make `serverEnforced` a client security authority. It is a behavior/explanation/serialization hint backed by server validation.

### MDI-01.2 — provenance state for automatic assignment

Define runtime-local provenance sufficient for:

- untouched/default/auto;
- user-dirty;
- server reload.

Minimum required behavior:

- auto-fill may replace empty/auto value;
- `dirtyGuard=preserve_user_value` prevents overwriting a user-dirty value;
- clearing a source does not erase a protected user value unless canonical semantics say it must.

### MDI-01.3 — shared field-effect planner skeleton

Move pure rule compilation/planning into `@metaforge/core` where practical.

Candidate files/modules:

```text
client/packages/core/src/meta/effects.ts
client/packages/core/src/meta/defaults.ts
client/packages/core/src/meta/link-effects.ts
```

Names are suggestions; architecture matters more than filenames.

### MDI-01.4 — FormView adapter

Keep FormView behavior stable while delegating rule compilation/effect application to the new shared layer.

This PR should prove behavior equivalence before ChildGrid starts consuming it.

## Acceptance

- existing Form fetch/depends behavior unchanged or deliberately improved with tests;
- native provenance semantics influence UI behavior where declared;
- legacy Frappe-only fixture still passes;
- no business DocType literals added;
- no authoritative calculation moved client-side.

## Risk

`STANDARD + NEW_CANDIDATE`.

---

# MDI-02 — Unify defaults, Link queries and Business Context

## Goal

One canonical path for “where does the initial/linked value come from?”

## Work

### MDI-02.1 — common default resolver

Extract Today/Now and literal default handling from `NewFormContainer` into a shared resolver.

Apply to:

- new Form;
- new child row;
- bound action input when appropriate.

Do not change Frappe compatibility behavior without a regression fixture.

### MDI-02.2 — canonical Link query planner

Unify:

- field `link_filters`;
- `eval:` context;
- Dynamic Link target;
- reference DocType;
- Business Context link filtering;
- cancellation/race semantics.

### MDI-02.3 — remove generic Price List branch

Use declared context-link mapping instead of `doctype === "Price List"` in shared services, after parity tests for selling/buying price-list behavior.

If existing `BusinessContextPolicy.linkFilters` shape is sufficient, use it unchanged. Only extend the policy if a concrete test proves a missing binding mode.

### MDI-02.4 — child-row context policy

Replace raw `businessContext` passthrough with:

```text
applyContextPolicy(childDoctype, selection, policies).defaults
```

where the child has a declared policy.

Retain a safe compatibility fallback only if existing packages rely on same-name mapping and migration cannot be atomic.

### MDI-02.5 — Table MultiSelect parity

Reuse canonical Link query/display/permission primitives while preserving chip/dedupe UX.

## Acceptance

- normal Link, Dynamic Link, child Link, Table MultiSelect use identical filtering semantics for equivalent metadata;
- context mappings are policy-driven;
- zero shared service branches on Price List or other ordinary business target names;
- stale query cannot overwrite newer search/source state.

## Risk

`STANDARD + NEW_CANDIDATE`.

---

# MDI-03 — ChildGrid convergence

## Goal

Make a previously unseen supported child DocType render intelligently without React changes.

## Work

### MDI-03.1 — canonical column resolver

Replace business-specific field arrays with this precedence:

```text
child viewPolicy.list.columns
  → in_list_view fields
  → safe generic fallback
```

Expanded row uses:

```text
child viewPolicy.form.fields
  → form surface policy
```

Quick/minimal child entry may use:

```text
child viewPolicy.quickEntry.fields
  → surface=quick
```

Do not add `viewPolicy.childGrid` unless a test demonstrates the existing policies cannot represent an embedded child table without breaking another renderer.

### MDI-03.2 — common field effects per row

Each row consumes MDI-01/02 planner for:

- defaults;
- dependency state;
- link filters;
- `fetch_from`;
- dirty guard;
- context defaults.

### MDI-03.3 — isolate domain projection requirement

Inventory every existing hardcoded ChildGrid enrichment.

For each rule classify:

```text
A: direct existing metadata declaration
B: generic runtime capability
C: true domain projection
```

Examples likely to become Class A/B:

- item_name from Item;
- description from Item;
- stock UOM from Item;
- default values/context;
- allowed-link filters if declarable.

Examples that may remain Class C:

- combined Item + Material Specification projection;
- availability/current stock;
- Alumdoor formula policy.

### MDI-03.4 — retire `ChildGridWithExtensions`

Only after equivalent package declarations and visual/behavior tests exist.

### MDI-03.5 — generic layout

Replace field-name-specific labels/width assumptions with:

- metadata label;
- fieldtype-derived sizing;
- view/presentation declaration if necessary;
- user-local layout preference.

Do not block semantic convergence on perfect visual sizing; semantic hardcodes are P1, width polish is lower priority.

## Required regression flows

- Sales Order Item;
- Purchase Order Item;
- Purchase Receipt Item;
- at least one non-Alumdoor child table;
- neutral fixture.

## Acceptance

- no concrete Sales/Purchase/Alumdoor DocType branch remains in shared ChildGrid path;
- metadata-only neutral child supports defaults/dependency/link/fetch correctly;
- user dirty value survives permitted automatic refresh;
- parent/child permission behavior unchanged;
- mobile/desktop child rendering remains usable.

## Risk

`STANDARD + NEW_CANDIDATE`.

---

# MDI-04 — AppAction canonical binding and ActionChildGrid convergence

## Goal

Stop AppAction from being a second field-schema language for inputs that already belong to a canonical DocType.

## Work

### MDI-04.1 — formalize bound vs synthetic input

Add the smallest compatible contract that distinguishes:

- canonical field binding;
- synthetic action-only field.

Design constraint:

> a bound input inherits security/semantics; overrides are presentation-only unless explicitly validated safe.

### MDI-04.2 — input-table field reference normalization

For `row_doctype`, allow columns to reference canonical fields without copying fieldtype/options/rules.

Maintain parser support for legacy full columns and normalize them to the internal bound model.

### MDI-04.3 — compiler parity

Update:

- `server/scripts/lib/compile-brief.mjs`;
- server app-registry parser/types;
- client manifest/types;

so rich semantics are not silently discarded.

### MDI-04.4 — ActionChildGrid uses common effects

Delete/replace:

- `AUTO_FIELDS`;
- bespoke Item field-copy lists;
- hardcoded clear lists;
- hardcoded generic amount/formula by field name;
- duplicated color/UOM enrichment when canonical metadata/projection supplies it.

### MDI-04.5 — action scalar field parity

A bound scalar field should use the same control + conditions + Link/default/fetch semantics as the canonical field.

Synthetic scalar fields keep a small explicit action contract.

## Compatibility

Do not require all installed packages to migrate in one release.

Parser accepts legacy declarations until migration evidence allows deprecation.

## Acceptance

- neutral bound action field and table behave identically to the same fields in Form/ChildGrid;
- legacy AppAction package still installs/renders;
- server authoritative action validation unchanged;
- no arbitrary executable metadata introduced.

## Risk

`STANDARD + NEW_CANDIDATE`, shared contract change.

---

# MDI-05 — Builder/App Factory authoring parity

## Goal

What runtime supports must be authorable, inspectable and round-trippable through Builder.

## Work

### MDI-05.1 — existing metadata fields

Add guided property editing for at least:

- `fetch_from`;
- `link_filters`;
- `valueSource`;
- `editMode`;
- `surface`;
- `serverEnforced`;
- `dirtyGuard`;
- relevant viewPolicy fields/columns.

### MDI-05.2 — guided `fetch_from`

UI:

1. choose source Link field;
2. resolve its target DocType meta;
3. choose source field;
4. write canonical `source_link.source_field` expression.

### MDI-05.3 — guided Link filters

Structured editor supports safe/common operators and context references. Advanced raw JSON remains only where necessary.

### MDI-05.4 — provenance/edit-mode UX

Builder should explain implications and prevent contradictory combinations before save.

Server validation remains final authority.

### MDI-05.5 — compiler/Builder normalization parity

Move safe inferred native semantics into a shared normalization function or server-side canonical normalization so a Builder-authored field and brief-authored equivalent round-trip semantically equal.

Do not duplicate compiler inference manually in the React panel.

### MDI-05.6 — live preview

Builder preview uses the same effect planner and control registry as runtime. No Builder-only preview logic.

## Acceptance

- every supported P1 canonical field semantic can be inspected/edited or clearly marked derived/read-only in Builder;
- save/reload retains semantics;
- diff/round-trip sees meaningful semantic changes;
- invalid combinations fail visibly before Apply and server still rejects them.

## Risk

`STANDARD + NEW_CANDIDATE`.

---

# MDI-06 — Minimal Class-C domain projection seam

## Goal

Replace renderer-specific multi-source intelligence that cannot be expressed safely with existing metadata.

This phase must **not** start with a generic effects DSL.

## Admission rule

For each candidate rule, prove:

1. direct `fetch_from` is insufficient;
2. Business Context policy is insufficient;
3. existing domain server method cannot already provide the result cleanly;
4. result is useful on multiple surfaces;
5. permission boundary is clear;
6. server can remain authoritative.

## Candidate reference use cases

Alumdoor Item row may require a read projection combining:

- Item;
- Material Specification;
- allowed colors/UOM;
- measurement policy;
- contextual stock/availability;
- formula-version metadata.

Do not assume all of these belong in one projection. Split by authority/cache behavior if needed.

## Target capability properties

- registered/named, not arbitrary URL;
- typed inputs/outputs;
- read-only;
- server permission checked;
- cancellable/cache-aware;
- output bound to canonical fields;
- runtime applies dirty/provenance rules;
- commit still recalculates authoritative values.

## Acceptance

- renderer contains no knowledge of projection’s business fields beyond generic bindings;
- missing/failed projection gives an explicit recoverable state;
- user can still distinguish auto-filled preview from authoritative committed result;
- no data mutation during projection.

## Risk

Usually `STANDARD + NEW_CANDIDATE`; classify `CRITICAL` if projection exposes or changes critical financial/stock/payroll/legal semantics.

---

# MDI-07 — Reference package migration and hardcode deletion

## Goal

Prove the architecture against the most demanding existing reference flows, then delete the temporary business knowledge from shared runtime.

### Reference order

1. Purchase Order / Purchase Order Item;
2. Purchase Receipt / Purchase Receipt Item;
3. Sales Order / Sales Order Item;
4. Quotation / Quotation Item where applicable;
5. Stock/Manufacturing child flows used by Alumdoor;
6. HR/payroll forms only for generic field-intelligence parity — do not alter statutory calculation authority.

### For every DocType

Create a `FIELD_INTELLIGENCE_MATRIX` entry:

```text
field
human decision?
valueSource
editMode
surface
context binding
link/fetch source
server authority
exception/override rule
```

### Migration actions

Prefer:

- package DocField declarations;
- sidecar/presentation metadata;
- viewPolicy;
- BusinessContextPolicy;
- canonical field bindings;
- named projections.

Then remove corresponding shared renderer hardcode.

### Mandatory deletion targets

When parity tests pass, remove or neutralize business-specific code in:

- `client/packages/views/src/form/ChildGrid.tsx`;
- `client/packages/views/src/form/ChildGridWithExtensions.tsx`;
- `client/packages/views/src/action/ActionChildGrid.tsx`;
- `client/packages/views/src/container/services.ts` ordinary business-name branch.

Do not merely leave dead hardcode “just in case”. Compatibility behavior must be explicit and tested.

## Acceptance

- operator flow is no worse than current Purchase/Sales reference UX;
- fewer repeated selections/inputs where metadata can derive them;
- unsupported/exception values remain editable where domain permits;
- no hidden authoritative side effects;
- shared runtime business-literal scan is clean for migrated categories.

## Risk

Mostly `STANDARD + NEW_CANDIDATE`; individual package metadata-only sub-slices may be FAST/STANDARD.

---

# MDI-08 — Hardening and program closure

## Goal

Turn the architectural improvement into a protected platform capability.

## Work

### MDI-08.1 — cross-surface conformance CI

For each supported semantic, run:

```text
compiler/Builder
→ parser
→ getdoctype
→ Form
→ Quick
→ Child
→ Action
→ save/action
→ reload
```

### MDI-08.2 — negative tests

At minimum:

- cyclic/invalid fetch dependency;
- invalid Link filter;
- inaccessible linked document;
- stale async fetch result;
- source changed twice rapidly;
- dirty target protected;
- user without permission;
- submitted/locked document;
- projection failure;
- malformed metadata;
- legacy package without native semantics.

### MDI-08.3 — architecture guard becomes blocking

Guard generic packages against new business-schema branching.

Suggested scope:

```text
client/packages/core/src/meta/**
client/packages/controls/src/**
client/packages/views/src/form/**
client/packages/views/src/action/**
client/packages/views/src/container/services.ts
```

Allowlist only true framework/system compatibility strings with documented reasons.

### MDI-08.4 — performance evidence

Measure at least:

- large Form with dependency graph;
- child table 100 rows;
- rapid Link typing/change;
- one source Link filling multiple targets;
- action table 100 rows;
- no N×fields network explosion.

### MDI-08.5 — docs convergence

Update:

- `client/METADATA_SCHEMA.md`;
- Child Grid BRD;
- DocType Builder BRD;
- AppAction contract docs;
- architecture/status docs relevant to actual implemented state.

Do not mark aspirational behavior as complete before evidence.

## Exit

- P1 matrix contains no `HARDCODED` or `GAP` rows;
- required cross-surface semantics are `FULL`;
- architecture guard blocks regression;
- Builder and brief compiler semantic parity proven;
- authoritative domain behavior unchanged unless separately approved/tested.

---

## 5. Recommended PR slices

Keep PRs small enough to isolate regressions.

| PR | Scope | Depends on | Primary risk |
|---|---|---|---|
| META-00 | neutral fixture + baseline tests | none | FAST |
| META-01 | native provenance/edit resolver | META-00 | STANDARD |
| META-02 | shared defaults + existing Form refactor | META-01 | STANDARD |
| META-03 | canonical Link/context planner | META-01 | STANDARD |
| META-04 | Table MultiSelect + child context parity | META-03 | STANDARD |
| META-05 | ChildGrid column/view-policy convergence | META-01/03 | STANDARD |
| META-06 | ChildGrid effects convergence | META-02/03/05 | STANDARD |
| META-07 | AppAction bound-field contract + parser | META-01 | STANDARD |
| META-08 | ActionChildGrid effect convergence | META-03/06/07 | STANDARD |
| META-09 | Builder existing-semantic authoring | META-01/03 | STANDARD |
| META-10 | compiler/Builder normalization parity | META-09 | STANDARD |
| META-11 | named domain projection primitive if proven | META-06/08 | STANDARD/CRITICAL-by-scope |
| META-12 | Alumdoor Purchase migration | earlier applicable | STANDARD |
| META-13 | Alumdoor Sales migration | earlier applicable | STANDARD |
| META-14 | remaining child/domain migrations + delete extension fork | META-12/13 | STANDARD |
| META-15 | blocking architecture guard + perf/e2e closure | all | STANDARD |

PR numbering is a planning label, not a GitHub PR number.

---

## 6. Ownership map

### `@metaforge/core`

Owns:

- metadata semantics;
- pure resolver/planner;
- dependency/effect compilation;
- context policy utilities;
- compatibility normalization.

Must not own:

- API adapter;
- domain DocType names;
- network calls;
- business formulas.

### `@metaforge/controls`

Owns:

- field controls;
- generic Link interaction primitives;
- presentation of field state.

Must not own:

- domain enrichment;
- server authority.

### `@metaforge/views`

Owns:

- Form/Child/Action composition;
- invoking generic planners/services;
- local draft orchestration.

Must not own:

- Sales/Purchase/Alumdoor field maps;
- Item/Material Specification business enrichment;
- ledger/stock/payroll formulas.

### `@metaforge/adapter-frappe`

Owns:

- Frappe API translation;
- meta/doc/link/query services;
- error normalization.

### server app-registry/compiler

Owns:

- validated package/action contracts;
- canonical package normalization;
- fail-closed schema compatibility.

### domain apps/packages

Own:

- declarations;
- true domain rules;
- named projections/actions;
- authoritative calculation/validation.

### Builder

Owns:

- authoring UX;
- semantic validation feedback;
- canonical round-trip.

Does not own a separate runtime schema.

---

## 7. Test strategy

### Unit

- default resolution;
- provenance/edit precedence;
- dependency graph;
- fetch rule compilation;
- dirty guard;
- context mapping;
- bound field normalization;
- cycle/error handling.

### Integration

- adapter Link filtering;
- linked-document multi-target fetch;
- child row effect application;
- action bound-field resolution;
- Builder save/reload;
- server package parser/compiler round-trip.

### E2E/runtime

- neutral fixture full flow;
- Purchase Order;
- Purchase Receipt;
- Sales Order;
- quick create;
- Table MultiSelect;
- one named projection case;
- permission-restricted user;
- mobile child row where applicable.

### Golden correctness

Transaction-critical controllers continue to recalculate and reconcile as before. UI preview equality is useful evidence but never substitutes ledger/stock/payroll regression where those authorities are touched.

---

## 8. Performance acceptance

No fixed millisecond number is asserted before baseline measurement. The following are mandatory invariants:

- one Link source filling N targets does not produce N document GETs when one document fetch can satisfy all;
- typing in one child cell does not rerender/refetch every row;
- 100-row child/action grids do not issue per-cell metadata requests;
- stale async requests cannot write values;
- metadata/effect graph is memoized by meta revision;
- user-visible latency regressions are measured before merging a shared-runtime slice.

---

## 9. Product acceptance

For migrated operator flows, measure:

### Input reduction

For a representative document, count:

```text
fields visible
fields requiring explicit human input
repeated selections
fields auto-filled
fields derived/read-only
```

Target is not an arbitrary percentage. The test is:

> no field should require human entry when its value is already known deterministically from trusted context/master/domain authority and the business still permits an override path where needed.

### Error reduction

Validate that invalid Link choices are filtered before save where metadata can know them.

### Explainability

Operator can distinguish:

- selected by user;
- auto-filled;
- calculated/read-only;
- blocked/locked and why.

Do not turn the UI into a debugging console; explanations should be concise.

---

## 10. Merge/deploy doctrine

### Merge

For each implementation PR:

- inspect exact diff and shared-contract blast radius;
- run targeted + repository-required CI;
- do not treat a shared runtime/action-contract change as a trivial UI-only merge;
- current live pilot gate remains independent unless the change is intended to become pilot authority.

### Deploy

Deploy is not part of this planning document.

If a new shared candidate is deployed to a frozen pilot target, follow the current release/evidence matrix and relock affected identity/evidence. Do not claim historical R6 failed; it remains historical PASS.

---

## 11. Stop conditions requiring explicit escalation

Implementation should stop before:

- changing authoritative stock valuation/accounting/payroll/legal formulas merely to make UI autofill easier;
- introducing arbitrary executable metadata;
- changing real pilot data;
- production deploy/cutover/provider/DNS/secret mutation;
- destructive schema/data migration not already governed;
- a cross-workstream contract conflict that cannot preserve compatibility.

Ordinary technical choices within this program should be resolved from repo evidence without repeated confirmation.

---

## 12. Program completion checklist

### Architecture

- [ ] one common metadata effect planner exists;
- [ ] legacy Frappe metadata fallback documented/tested;
- [ ] native provenance/edit/dirty semantics consumed;
- [ ] no second metadata/form schema introduced.

### Form/Link

- [ ] defaults centralized;
- [ ] Link query semantics unified;
- [ ] Business Context link policy fully applied;
- [ ] Table MultiSelect parity proven.

### Child table

- [ ] column composition metadata-driven;
- [ ] default/fetch/dependency/context parity proven;
- [ ] no shared Sales/Purchase/Alumdoor schema branch;
- [ ] `ChildGridWithExtensions` retired or reduced to zero business behavior.

### Actions

- [ ] bound vs synthetic inputs supported;
- [ ] row-doctype columns inherit canonical semantics;
- [ ] legacy action declarations remain compatible;
- [ ] ActionChildGrid bespoke enrichment removed.

### Builder

- [ ] fetch/link/native semantics authorable;
- [ ] semantic round-trip preserved;
- [ ] brief/Builder normalization parity proven;
- [ ] preview uses production runtime.

### Domain boundary

- [ ] proven Class-C enrichment uses named read projection/action;
- [ ] server remains authoritative;
- [ ] no arbitrary executable metadata.

### Evidence

- [ ] neutral conformance fixture passes all relevant surfaces;
- [ ] Purchase/Sales reference regressions pass;
- [ ] permission/failure/stale-request tests pass;
- [ ] architecture guard is blocking;
- [ ] performance baseline/regression evidence recorded;
- [ ] capability matrix reissued with no P1 `HARDCODED`/`GAP`.

---

## 13. Immediate next executable task

Start with **META-00 / MDI-00** only:

1. create the neutral metadata-intelligence fixture;
2. encode the current expected semantics;
3. run it through existing Form/Child/Action/Builder paths;
4. record failing parity cases;
5. add non-blocking business-literal inventory.

Do **not** begin by deleting ChildGrid hardcodes. First create the proof harness that tells us when the generic replacement is actually equivalent.
