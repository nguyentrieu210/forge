# METADATA INTELLIGENCE CAPABILITY MATRIX — 2026-08-06

Status: **AUDIT MATRIX / ACCEPTANCE DENOMINATOR**  
Baseline: `main@2ba7f90af65b73107c402cd236780cb1fb1c1dfa`

This matrix is the denominator for the metadata-intelligence program. It distinguishes “contract exists” from “works consistently across all runtime surfaces”.

Legend:

- `FULL` — canonical path exists and is materially consumed.
- `PARTIAL` — exists but is uneven, duplicated or missing on some surfaces.
- `DECLARED` — contract/transport exists but runtime authoring/consumption is materially incomplete.
- `HARDCODED` — current UX works through business-specific renderer code rather than canonical metadata.
- `GAP` — missing contract/capability.
- `N/A` — not applicable.

---

## 1. Cross-layer matrix

| Capability | Canonical declaration | Compiler / server | Form / Quick | Child Table | AppAction | Builder | Current | Target |
|---|---|---|---|---|---|---|---|---|
| Literal defaults | `DocField.default` | FULL | FULL | PARTIAL | PARTIAL | FULL | PARTIAL | FULL everywhere via common planner |
| Frappe magic default | legacy default values | transport | hardcoded Today/Now resolver | not unified | not unified | raw value | PARTIAL | common default resolver |
| `depends_on` | DocField | FULL | FULL | FULL per-cell resolver | PARTIAL | FULL editor | PARTIAL | same resolver everywhere |
| `mandatory_depends_on` | DocField | fail-closed server + transport | FULL | FULL/partial validation path | weak | FULL editor | PARTIAL | same resolver/validation everywhere |
| `read_only_depends_on` | DocField | transport | FULL | FULL per-cell resolver | weak | FULL editor | PARTIAL | same resolver everywhere |
| `fetch_from` | DocField | FULL transport/validation | FULL | business-specific enrichment compensates | bespoke enrichment | **not exposed in actual Builder** | PARTIAL | common effect executor |
| Link static filters | `link_filters` | FULL transport | FULL canonical Link | partial/custom dynamic injection | column-only support | **not exposed in actual Builder** | PARTIAL | one Link query pipeline |
| Link context filters | BusinessContextPolicy + metadata | policy exists | partial | partial | partial | policy authoring separate | PARTIAL | generic context binding |
| Dynamic Link | DocField | validated | supported | supported per row | limited action fieldtypes | type available, properties partial | PARTIAL | canonical target/query lifecycle |
| Link display resolve | services | adapter supports | FULL | FULL for normal Link cells | partial | preview depends runtime | PARTIAL | shared Link primitive |
| Link quick-create | service/runtime | server permission via create form | FULL | normal Link control can reuse | uneven | N/A | PARTIAL | consistent where allowed |
| Table MultiSelect | child meta | supported | custom control | own path | N/A | fieldtype authorable | PARTIAL | reuse Link query semantics |
| `valueSource` | DocField native | compiler derives + server validates/transports | little direct consumption | little direct consumption | not represented | not editable | DECLARED | runtime provenance authority |
| `editMode` | DocField native | compiler derives + server validates/transports | legacy flags dominate | legacy flags dominate | not represented | not editable | DECLARED | canonical edit ownership + legacy fallback |
| `surface` | DocField native | compiler derives + transport | **FULL** quick/expanded/internal | not used as primary grid composition | not represented | not editable | PARTIAL | all input surfaces can use it appropriately |
| `serverEnforced` | DocField native | compiler derives + server validates/transports | mostly explanatory/inert | mostly inert | not represented | not editable | DECLARED | serialization/UX explanation guard; server remains authority |
| `dirtyGuard` | DocField native | compiler derives + server validates/transports | fetch implementation has local behavior but not native-driven | bespoke behavior | bespoke behavior | not editable | DECLARED | common effect overwrite policy |
| Form field width | `form_width` | transport | FULL/partial | N/A | independent widths | not fully emphasized | PARTIAL | presentation-only canonical use |
| List columns | `viewPolicy.list.columns` / `in_list_view` | parsed | list path available | ChildGrid does not consistently use as sole authority | N/A | viewPolicy authoring limited | PARTIAL | canonical child compact columns reuse list policy |
| Form fields | `viewPolicy.form.fields` | parsed | FULL | expanded child row not fully based on it | N/A | viewPolicy authoring limited | PARTIAL | child detail reuses form policy |
| Quick fields | `viewPolicy.quickEntry.fields` + surface | parsed | FULL | not canonicalized for row quick entry | action has own fields | viewPolicy authoring limited | PARTIAL | common composition semantics |
| Matrix view | `viewPolicy.matrix` | typed/fail-closed | N/A | N/A | named capability model | metadata convergence designed | FULL/WIRED | architectural benchmark |
| Business context list filter | policy | server-resolved context | FULL/partial | N/A | N/A | app declaration | FULL/PARTIAL | retain |
| Business context create default | policy | server-resolved context | FULL | raw context copied rather than child mapping | partial | app declaration | PARTIAL | policy-resolved defaults on all create surfaces |
| Business context Link mapping | `linkFilters` policy | type exists | service only partly generic | partial | partial | app declaration | DECLARED/PARTIAL | remove business-name branch |
| Child grid column composition | child meta/view policy | data available | N/A | concrete Sales/Purchase lists | declared action columns | N/A | HARDCODED | generic view-policy resolution |
| Child detail extension | child meta/view policy possible | data available | N/A | `ChildGridWithExtensions` knows Alumdoor | N/A | N/A | HARDCODED | declaration-driven groups/details |
| Child autofill | child `fetch_from` + context | available | N/A | mixed generic + bespoke Item logic | second bespoke Item logic | cannot fully author | HARDCODED/PARTIAL | one field-effect engine |
| Child derived preview | no safe generic contract yet | domain controllers exist | some form totals | hardcoded field-name formulas | hardcoded formulas | no generic authoring | HARDCODED / CLASS-C | named projection first; typed contract only if proven |
| Child clear-on-source-change | not explicit canonical contract | N/A | fetch targets clear in Form behavior | hardcoded clear lists | hardcoded clear lists | N/A | PARTIAL/HARDCODED | infer safe cases + prove minimal gap before new key |
| Action scalar canonical binding | none | current scalar contract separate | N/A | N/A | GAP | no authoring | GAP | bound vs synthetic input contract |
| Action table canonical binding | `row_doctype` intent exists | parser validates row_doctype but columns still full copies | N/A | N/A | PARTIAL | package authoring | PARTIAL | column field refs + presentation overrides |
| Action field dependencies | AppAction field contract lacks them | compiler strips rich semantics | N/A | N/A | GAP/PARTIAL | unavailable | GAP | inherit via canonical binding |
| Action field autofill | AppAction field contract lacks it | compiler strips | N/A | N/A | bespoke `enrichItem()` | unavailable | HARDCODED | common effect engine + binding |
| Named read projection | Matrix/domain pattern exists | server action/projection patterns | can call services | bespoke direct calls | commit/preview methods exist | not generic field-bound | PARTIAL | typed registry-backed read projection seam |
| Permission/masking | DocPerm/permlevel/masked | server authority | FULL | FULL inheritance path | permission_doctype/action | Builder permission UI exists | FULL/PARTIAL | preserve server authority |
| Workflow ownership | workflow metadata | server authority | FULL action/lifecycle | inherited doc lock | action-specific | workflow Builder separate | FULL/PARTIAL | preserve |
| Field provenance debug | native semantics exist | no user-facing requirement | no unified trace | no | no | no | GAP | dev explainability only |
| Effect cycle detection | conditions safe-eval bounded | validators exist for some conditions | no unified graph | no unified graph | no | no | GAP | effect planner validates/caps cycles |
| Cross-surface conformance fixture | individual tests | many tests | individual | individual | individual | round-trip tests | GAP | one neutral fixture across compiler→runtime→save |
| Business-literal architecture guard | Matrix has explicit rule | no global guard | no | no | no | N/A | GAP | CI scan/architecture test |

---

## 2. Current strong areas to preserve

### C01 — canonical meta passthrough

Unknown Frappe-compatible metadata survives normalization. This avoids version lock to a tiny copied schema.

**Do not replace with a narrow bespoke DTO that drops unknown fields.**

### C02 — fail-closed server metadata validation

MetaForge-native semantics are validated. Unknown/contradictory values are rejected rather than silently ignored.

**Any future Class-C vocabulary must meet this standard.**

### C03 — Form dependency resolver

Visibility, required state, readonly, masking and permissions have a canonical resolver with child-parent context support.

**Reuse it. Do not create Action-specific condition logic.**

### C04 — Form `fetch_from`

The main Form already has useful batching/race behavior.

**Extract/converge behavior rather than rewriting from scratch.**

### C05 — quick/expanded/internal surface

This is already a working native metadata feature.

**Use it before adding another field importance taxonomy.**

### C06 — Business Context

Server-resolved context and policy already solve much of default/filter scoping.

**Use policy mappings instead of naming conventions.**

### C07 — Matrix metadata/runtime boundary

Matrix already demonstrates a typed, business-neutral renderer with named action boundaries.

**General field intelligence should copy this architecture, not its exact code.**

---

## 3. Capability priorities

### P1 — required before calling MetaForge field runtime strongly metadata-driven

1. native provenance/edit/dirty semantics consumed by common runtime;
2. common effect planner/executor;
3. ChildGrid business-name hardcodes removed;
4. ChildGridWithExtensions retired;
5. ActionChildGrid enrichment duplication removed;
6. AppAction canonical field binding introduced;
7. Builder authoring parity for existing intelligence;
8. neutral cross-surface conformance fixture;
9. generic-runtime business-literal guard.

### P2 — important convergence after core P1

1. Business Context link policy fully consumed;
2. child-row context defaults use policy mappings;
3. Table MultiSelect reuses canonical Link pipeline;
4. common default resolver;
5. explicit presentation metadata gradually replaces heuristics;
6. effect explainability/debug tooling.

### P3 — only after measured need

1. richer column presentation hints;
2. new derived-formula metadata vocabulary;
3. generalized effect DSL;
4. broad client-side calculation graph.

**P3 is intentionally deferred.** A free-form effects/formula DSL would be premature and could blur client/server authority.

---

## 4. Field-intelligence classification template

Every high-use DocType/child table migrated during the program should produce a field matrix with this shape:

| Field | Human decision? | valueSource | editMode | surface | Source/binding | Condition/filter | Server authority | Target UX |
|---|---:|---|---|---|---|---|---|---|
| identity Link | yes | user | editable | quick | user selection | contextual Link filter | validates reference | primary input |
| display name | no | link | readonly | expanded | `identity.name` | — | validates/canonical master | auto display |
| UOM | usually no | link | editable/readonly by domain | quick/expanded | item UOM | allowed UOM filter | transaction validates | auto + constrained override |
| warehouse | context-dependent | default | editable | quick | context policy | company/warehouse policy | permission/stock authority | prefilled |
| amount | no | formula | readonly | expanded | server/domain projection | — | recalculated server-side | live preview only |

This template is the required audit artifact for each migrated reference flow.

---

## 5. Surface acceptance matrix

For each supported semantic, evidence must answer these columns:

| Semantic | Full Form | Quick Entry | Child row | Bound Action scalar | Bound Action table | Builder preview | Reload/save |
|---|---:|---:|---:|---:|---:|---:|---:|
| default | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| dependency | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Link filter | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| `fetch_from` | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| dirty protection | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| context default/filter | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| edit ownership | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| surface/internal protection | PASS | PASS | N/A/declared | PASS | PASS | PASS | PASS |

A capability is not promoted to `FULL` merely because one renderer supports it.

---

## 6. Hardcode retirement matrix

| Current hotspot | Current knowledge | Replacement authority | Retirement gate |
|---|---|---|---|
| `ChildGrid.tsx` compact/full field arrays | Sales/Purchase child schema | child `viewPolicy.list/form/quickEntry` + fields | reference parity tests pass |
| `ChildGrid.tsx` Item-derived fields | Item/UOM/color/formula domain | `fetch_from` + named projection | Alumdoor/Sales/Purchase fixtures pass |
| `ChildGridWithExtensions.tsx` | Sales/Purchase/Alumdoor detail section | view policy / package presentation declaration | no visual/functional regression |
| `ActionChildGrid.tsx` `AUTO_FIELDS` | domain field names | canonical bound field semantics | action binding contract lands |
| `ActionChildGrid.tsx` `enrichItem()` | Item/Material Specification | direct fetch rules + named projection | preview/commit parity |
| `ActionChildGrid.tsx` field-name labels/widths | domain presentation | metadata labels + generic presentation/user layout | usability baseline passes |
| `services.ts` Price List branch | price-list business context | `BusinessContextPolicy.linkFilters` or typed equivalent | selling/buying Link tests pass |
| `table-controls.tsx` raw row context | field-name coincidence | child `applyContextPolicy()` | child-default tests pass |
| `document-presentation.ts` large inference lists | presentation heuristics | explicit package metadata where available | gradual; fallback remains |

---

## 7. New-contract admission checklist

A new metadata key is allowed only when all answers are `YES`:

1. Is there a reproduced business-neutral use case?
2. Can existing Frappe metadata not express it?
3. Can existing `valueSource/editMode/surface/viewPolicy/BusinessContextPolicy` not express it?
4. Would a named server projection/action be insufficient or unnecessarily heavy?
5. Can the new key be typed and validated fail-closed?
6. Can Builder author/round-trip it?
7. Can all relevant runtime surfaces consume it consistently?
8. Does it preserve server authority?
9. Is backward compatibility deterministic?
10. Are positive + negative conformance tests defined before merge?

If any answer is `NO`, do not add the key yet.

---

## 8. Completion denominator

The metadata-intelligence program is complete only when this matrix can be reissued with:

- no `HARDCODED` P1 row;
- no `GAP` P1 row;
- all existing canonical field semantics `FULL` across their applicable surfaces;
- Builder parity for every supported authorable semantic;
- architecture guard preventing business-schema leakage into generic runtime;
- server authority unchanged for transaction-critical semantics.
