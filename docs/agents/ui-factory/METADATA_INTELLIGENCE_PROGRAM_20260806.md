# METADATA INTELLIGENCE PROGRAM — CONTROL DOC — 2026-08-06

Status: **APPROVED PROGRAM PLAN / DOCS-ONLY**  
Repository: `nguyentrieu210/forge`  
Latest main revalidated during audit: `65b6f80bda813f151ef39dc59ee03aadfb330b29`  
Original deep-audit snapshot: `2ba7f90af65b73107c402cd236780cb1fb1c1dfa`  
Engineering risk of this control-doc set: `FAST / docs-only`  
Release impact: `NONE`

This control document is the entry point for the program. Detailed evidence and design are split into:

1. `METADATA_DRIVEN_DEEP_AUDIT_20260806.md` — exact findings and architecture debt.
2. `METADATA_INTELLIGENCE_ARCHITECTURE_20260806.md` — target metadata/effect/domain boundary.
3. `METADATA_INTELLIGENCE_CAPABILITY_MATRIX_20260806.md` — denominator and status matrix.
4. `METADATA_INTELLIGENCE_IMPLEMENTATION_PLAN_20260806.md` — MDI-00..08 and PR slicing.

The four detailed documents were authored from `main@2ba7f90a`. During authoring, `main` advanced through `51efbcc2` and `65b6f80b`, both modifying only `client/apps/runtime/src/experiences/AlumdoorSalesComposer.tsx`. Those changes were explicitly re-audited before this control document was written. They **do not invalidate the core findings**; they add one further finding about custom Experience surfaces, recorded below.

---

## 1. Approved objective

The program objective is:

> **Exploit canonical metadata as far as safely possible so operators enter only true business decisions, while generic renderers remain business-neutral and authoritative calculations remain server/domain-owned.**

The intended end state is not “more JSON”. It is one coherent runtime where:

```text
DocType/App metadata
+ viewPolicy
+ Business Context
+ trusted server capabilities
        ↓
common metadata intelligence/effect resolution
        ↓
Form / Quick Entry / ChildGrid / AppAction / Experience bindings / Builder preview
        ↓
named server projection/action when direct metadata is insufficient
        ↓
authoritative server validation/calculation/commit
```

---

## 2. Approved architectural decisions

### Decision A — no second form/meta engine

Keep canonical `DocTypeMeta` and AppManifest model. Do not add a parallel “smart form schema”.

### Decision B — consume current vocabulary first

Before adding any new generic key, exploit existing:

- `default`;
- `depends_on`;
- `mandatory_depends_on`;
- `read_only_depends_on`;
- `fetch_from`;
- `link_filters`;
- Dynamic Link;
- `valueSource`;
- `editMode`;
- `surface`;
- `serverEnforced`;
- `dirtyGuard`;
- `viewPolicy`;
- `BusinessContextPolicy`.

### Decision C — one common field-effect path

Form, ChildGrid and bound AppAction fields must not implement separate autofill/dependency engines.

### Decision D — domain complexity becomes a named capability, not shared-renderer code

Direct linked-master copies use `fetch_from`. Multi-source/current-state/domain calculations use registered read projection/action when required.

### Decision E — client intelligence is not transaction authority

Money, inventory, ledger, payroll, tax/legal and lifecycle correctness remain server-side.

### Decision F — Builder must author what runtime supports

No supported canonical metadata feature should be available only through hand-edited package JSON/brief while Builder silently drops or cannot inspect it.

### Decision G — AppAction distinguishes bound canonical fields from synthetic inputs

Do not duplicate canonical field definitions when action input refers to an existing DocType field.

---

## 3. Latest-main addendum — custom Experience surfaces

### MD-16 — Custom Experience surfaces manually reproduce metadata intelligence

**Priority: P2 after common effect primitives, P1 for any Experience that becomes a reference operating path.**

Latest-main evidence:

`client/apps/runtime/src/experiences/AlumdoorSalesComposer.tsx` manually loads Customer and maps fields such as:

- `price_group` / `customer_group`;
- phone/mobile;
- install/address;
- default price list;

and now implements an explicit Đại lý/Lẻ override control for the current order.

The new behavior itself is a valid business UX requirement: a default may come from Customer and the operator may override it for one transaction. The architectural issue is that the Experience implements this provenance behavior manually instead of consuming a reusable canonical field-binding/effect primitive.

This is a strong real-world example for existing metadata semantics:

```text
Customer default
    ↓
auto value
    ↓
operator override
    ↓
preserve user value
```

which maps naturally to the program’s `valueSource=link/default` + editable ownership + dirty/provenance model.

**Decision:** custom Experience components may keep custom composition and business workflow, but ordinary field semantics inside them should progressively bind to canonical field/effect primitives instead of duplicating fetch/default/dirty/link logic.

Experiences are therefore added as a consumer in the program, but they are **not forced back into generic FormView** when their workflow composition is genuinely custom.

---

## 4. Program order

Approved execution sequence:

```text
MDI-00  Neutral conformance fixture + current behavior baseline
MDI-01  Consume native valueSource/editMode/serverEnforced/dirtyGuard
MDI-02  Unify default + Link + Business Context effects
MDI-03  ChildGrid convergence
MDI-04  AppAction canonical binding + ActionChildGrid convergence
MDI-05  Builder/App Factory authoring parity
MDI-06  Minimal named domain projection seam for proven Class-C gaps
MDI-07  Reference migration: Purchase → Receipt → Sales → other operational flows
MDI-08  Blocking architecture guard + performance + cross-surface closure
```

Custom Experience binding is introduced only after MDI-01/02 provide a stable common primitive; reference Experience flows are migrated during MDI-07.

---

## 5. Mandatory audit/classification rule for every field

Each migrated high-use DocType/Experience must classify fields by:

```text
human decision?
value source
edit ownership
surface
context binding
link/fetch source
server authority
exception/override rule
```

The practical UX test is:

> If the system already knows a value deterministically from trusted context/master/domain authority, the operator should not be forced to re-enter it unless the domain specifically requires confirmation or an override decision.

Automation must not erase an operator override silently.

---

## 6. Primary hardcode retirement targets

Shared runtime P1 targets:

- `client/packages/views/src/form/ChildGrid.tsx`
- `client/packages/views/src/form/ChildGridWithExtensions.tsx`
- `client/packages/views/src/action/ActionChildGrid.tsx`
- `client/packages/views/src/container/services.ts`

Authoring/contract targets:

- `client/packages/builder/src/doctype/DocTypeBuilder.tsx`
- `client/packages/core/src/app/manifest.ts`
- `client/packages/core/src/app/action-input-table.ts`
- `server/packages/app-registry/src/action-input-table.ts`
- `server/scripts/lib/compile-brief.mjs`

Reference Experience target after shared primitives exist:

- `client/apps/runtime/src/experiences/AlumdoorSalesComposer.tsx`

Experience migration must reduce duplicated canonical field logic without removing legitimate custom workflow composition.

---

## 7. Success criteria

Program cannot be declared complete until:

- no P1 `HARDCODED`/`GAP` row remains in the capability matrix;
- one neutral fixture proves equivalent semantics across full Form, Quick Entry, child row, bound Action input and Builder preview;
- custom reference Experience can reuse the same default/link/dirty primitive for canonical bindings;
- shared ChildGrid no longer branches on Sales/Purchase/Alumdoor DocType names for normal semantics;
- ActionChildGrid no longer owns a second Item enrichment/formula engine;
- Builder round-trips the canonical intelligence the server/runtime support;
- Business Context policy, not business-name heuristics, drives context defaults/filters;
- complex domain enrichment is a named permission-checked read capability;
- architecture CI prevents business literals from returning to generic field/form/grid/action code;
- authoritative transaction results remain server-recalculated/validated.

---

## 8. Current gate relationship

This program is independent of the real Pilot-01 source dependency currently recorded by live pilot documents. It does not authorize or substitute for real source completion, import, production write or cutover.

Implementation work can proceed in isolated candidates, but adoption on a frozen pilot target must follow current release-impact/evidence doctrine.

---

## 9. Immediate executable next task

The approved first implementation task is **MDI-00 / META-00**:

1. create a neutral metadata-intelligence fixture;
2. encode existing canonical semantics without business nouns;
3. run it through current Form/Child/Action/Builder surfaces;
4. record the exact parity failures;
5. inventory existing business-literal branches in generic runtime;
6. make the architecture guard advisory only at first;
7. do not delete production hardcodes until equivalent generic behavior is proven.

This avoids a risky rewrite and creates an objective regression harness for every later PR.
