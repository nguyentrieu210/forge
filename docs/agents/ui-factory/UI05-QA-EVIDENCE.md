# UI05 — QA / CONVERGENCE EVIDENCE

Date: 2026-08-03
Branch: `agent/ui-05-qa`
Wave-A baseline: `main@55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`
Current main observed during audit: `a9e3cde352dbe78c93b28097094c45fc5baad845`
Role: independent QA/convergence owner; no production META/RUNTIME/PRICING/ALUM ownership

## 1. Exact-state audit

At audit time all five implementation/QA branches still contained only the common no-stop rule plus their workstream brief. Relative to current `main@a9e3cde...`, each branch was `ahead 2 / behind 2` from the common `55e105e...` baseline.

| Branch | Current Wave-A delta at audit | QA conclusion |
| --- | --- | --- |
| `agent/ui-01-meta` | docs only | canonical Matrix metadata/compiler code not yet available |
| `agent/ui-02-runtime` | docs only | generic Matrix renderer not yet available |
| `agent/ui-03-pricing` | docs only | pricing projection/compound action not yet available |
| `agent/ui-04-alumdoor` | docs only | Alumdoor parity fixture/mapping not yet available |
| `agent/ui-05-qa` | docs + QA artifacts from this pass | independent QA foundation can proceed |

Do not treat branch count or planning documents as integration evidence.

## 2. Current architecture findings

### F-01 — canonical metadata has no first-class Matrix contract yet

Current `client/packages/core/src/types/meta.ts` exposes `DocTypeViewPolicy` for list/form/quickEntry/bulk/kanban/calendar/gantt/chart/mobile. There is no typed `matrix` member in the audited baseline. UI01 is therefore a real dependency, not paperwork.

### F-02 — shared routing still has an Item Price business special case

`client/packages/views/src/bulk/BulkGridContainer.tsx` imports `ItemPriceMatrixPanel` and routes with:

```ts
if (props.doctype === "Item Price") { ... }
```

This is the declared legacy exception. It must remain until integrated parity, permission/OCC and second-reference evidence pass. QA rejects replacing it with another business-name conditional elsewhere.

### F-03 — current Item Price UX owns domain orchestration in React

The current `ItemPriceMatrixPanel.tsx` directly loads Price List, Item Group, Item, UOM, selected Item and Item Price data, composes UOM conversion state, and performs coordinated mutations. This proves a useful operator workflow but does not satisfy the target server-authoritative pricing boundary.

UI03 must own extraction of bounded read projection + compound write semantics, including trusted tenant context, permission, OCC and retry/idempotency behavior.

### F-04 — generic Matrix runtime does not exist in the audited Wave-A branch state

No implementation delta from UI02 was present when this QA pass ran. Therefore renderer keyboard/mobile/a11y/virtualization claims are **not testable yet** and must remain pending rather than being inferred from the current Item Price component.

## 3. Maturity

Domain: NS-09 App Factory / generic Matrix primitive

- Current Matrix maturity: **Missing** as a canonical reusable primitive.
- Current Item Price reference UX: working special-case specimen, not generic Matrix maturity evidence.
- UI05 QA harness maturity after this pass: **Foundation**.
- Target after Wave B integration: **Wired**.
- RC requires Item Price parity + invariants + targeted regressions + at least one real second reference with no renderer fork.
- Hardened requires production-grade security/failure/performance/release evidence in declared scope.

## 4. Cross-branch acceptance matrix

Status vocabulary:

- `READY`: QA artifact/check can run independently now.
- `PENDING(owner)`: requires owner implementation/evidence.
- `DEFERRED`: intentionally blocked by a later security/domain gate.

| ID | Area | Acceptance | Current status | Required evidence |
| --- | --- | --- | --- | --- |
| C-01 | Contract | valid Matrix metadata is typed and accepted | PENDING(UI01) | type/selfcheck + compiler round-trip |
| C-02 | Contract | missing/duplicate axis identity fails closed | PENDING(UI01) | negative validator tests |
| C-03 | Contract | invalid cell/editor binding fails closed | PENDING(UI01) | negative validator tests |
| C-04 | Contract | named source/action references survive transport | PENDING(UI01) | parser/compiler/manifest round-trip |
| C-05 | Routing | Matrix selection requires no business-name route | PENDING(UI01/UI02) | static source check + runtime fixture |
| G-01 | Genericity | shared Matrix source contains no Item Price/Price List/UOM/Supplier Item/Warehouse/Alumdoor literals | READY | `check-matrix-domain-leaks.mjs` |
| G-02 | Genericity | no new business doctype conditional in shared views | READY | `check-matrix-domain-leaks.mjs` |
| G-03 | Genericity | generic renderer does not call direct document mutation | READY | `check-matrix-domain-leaks.mjs` |
| G-04 | Genericity | Supplier x Item fixture requires no renderer fork | READY fixture / PENDING integration | second-reference check + integrated runtime test |
| G-05 | Genericity | Item x Warehouse/Reorder fixture requires no renderer fork | READY fixture / PENDING integration | second-reference check + integrated runtime test |
| G-06 | Genericity | Item Group x Account remains same renderer shape | READY fixture / PENDING integration | second-reference check + finance permission test |
| S-01 | Security | projection/action rejects unauthorized user | PENDING(UI03/domain owner) | server test using trusted context |
| S-02 | Security | cross-tenant read/write is rejected | PENDING(UI03/domain owner) | tenant isolation regression |
| S-03 | Security | client tenant/role claim cannot override server context | PENDING(UI03/WS11) | negative authority regression |
| S-04 | Security | privileged User x Role reference waits for WS11 | DEFERRED | WS11 security review + explicit owner action |
| O-01 | OCC | stale item/cell/UOM version conflicts are surfaced, not overwritten | PENDING(UI03) | stale-token server regression + renderer conflict state |
| I-01 | Idempotency | retry cannot duplicate price/UOM effects | PENDING(UI03) | repeat same command/key regression |
| I-02 | Atomicity | partial failure semantics are explicit and deterministic | PENDING(UI03) | transaction/rollback or documented partial-result regression |
| U-01 | UX | hierarchy navigation parity | PENDING(UI04/UI02) | browser fixture desktop/tablet/mobile |
| U-02 | UX | independent search scopes parity | PENDING(UI04/UI02) | browser fixture |
| U-03 | UX | sparse cell + enabled state + aux row fields | PENDING(UI02/UI04) | renderer + parity fixture |
| U-04 | UX | create/update/remove + dirty guard + error/conflict states | PENDING(UI02/UI03/UI04) | integrated E2E |
| U-05 | UX | sticky axes/focus/hidden columns | PENDING(UI02/UI04) | visual/browser evidence |
| U-06 | UX | keyboard/touch/a11y behavior | PENDING(UI02) | keyboard + touch browser regression |
| P-01 | Performance | no N x M request fan-out | PENDING(UI02/UI03) | request counter on medium/large envelope |
| P-02 | Performance | sparse data does not require full Cartesian materialization | READY fixture / PENDING renderer measurement | QA envelope + runtime instrumentation |
| P-03 | Performance | stale search can be cancelled/ignored | PENDING(UI02/UI03) | delayed-response race regression |
| P-04 | Performance | repeated edits do not trigger full source reload per cell | PENDING(UI02/UI03) | request/render counter regression |
| R-01 | Removal gate | legacy Item Price route may be deleted only after all mandatory gates pass | READY policy / PENDING integration | exact checklist in §10 |

## 5. QA artifacts added

### Static genericity gate

`client/scripts/check-matrix-domain-leaks.mjs`

The gate:

1. allows only the declared legacy `BulkGridContainer -> ItemPriceMatrixPanel` route while convergence is incomplete;
2. rejects additional business-name doctype conditionals in shared views;
3. scans generic Matrix production source and rejects Item Price, Price List, Supplier Item, Warehouse, Alumdoor and UOM literals;
4. rejects direct `adapter.updateDoc/createDoc/deleteDoc` usage in generic Matrix renderer source;
5. rejects importing/referencing the legacy `ItemPriceMatrixPanel` from new generic Matrix code.

It intentionally excludes tests/fixtures and the legacy specimen itself, because fixtures are allowed to contain domain language.

### Second-reference semantic fixtures

`client/qa/matrix/second-reference-fixtures.json`

This is a QA semantic fixture, **not** a canonical `viewPolicy.matrix` contract. It provides deterministic sparse reference data for:

- Supplier x Item;
- Item x Warehouse/Reorder;
- Item Group x Account;
- User x Role, explicitly deferred until WS11 security review.

### Fixture invariant gate

`client/scripts/check-matrix-second-references.mjs`

The gate verifies:

- required references exist once;
- both axes use non-empty unique keys;
- cells reference valid axis members and have unique identities;
- ready references are sparse rather than fully Cartesian;
- writes require named domain/security authority, never generic `document_update`;
- no reference declares a renderer business conditional;
- User x Role remains deferred;
- performance envelopes are sparse and do not invent latency/SLA claims before measurement.

## 6. Second-reference proof ladder

### 6.1 Supplier x Item — first integration proof

Why first: relational procurement data is structurally Matrix-shaped but unrelated to pricing UX.

Pass conditions:

- same shared renderer component as Item Price;
- metadata/domain adapter changes only;
- sparse cells supported;
- create/update/remove relation goes through domain-owned action;
- no `Supplier`, `Supplier Item` or procurement conditional in shared renderer;
- permission/OCC failures surface through generic error/conflict state.

### 6.2 Item x Warehouse/Reorder — second integration proof

Why second: proves parent-aware inventory policy without treating child rows as independent generic documents.

Pass conditions:

- same renderer without inventory literals;
- warehouse axis can be bounded/searched;
- missing cell can be created and existing policy updated safely;
- invalid negative reorder values fail server-side;
- trusted tenant/warehouse scope enforced by domain authority.

### 6.3 Item Group x Account — critical authority proof

This verifies that the renderer remains generic when the domain becomes finance-sensitive.

Pass conditions:

- same renderer;
- no generic document update for account mapping;
- company/account-purpose validation is server-side;
- client role/company claims are not authoritative;
- audit/correction expectations are domain-owned.

### 6.4 User x Role — intentionally deferred

Do not use User x Role to claim genericity until WS11 has reviewed privileged mutation semantics. A pretty checkbox grid is not permission architecture, despite humanity's repeated attempts to make it so.

## 7. Security / OCC / idempotency evidence plan

The integrated domain action must be tested for these semantic outcomes. Exact HTTP status/error codes should follow the owner package conventions rather than being invented by QA.

1. unauthorized read rejected;
2. unauthorized write rejected;
3. wrong-tenant axis/cell identity rejected;
4. client-supplied role/tenant identity ignored as authority;
5. stale selected-item/parent version rejected;
6. stale existing-cell version rejected;
7. retry of same idempotent command cannot duplicate create/add effects;
8. compound change set has explicit atomic or partial-failure semantics;
9. transaction/ledger-backed target cannot opt into unsafe generic document mutation;
10. audit/history expectations remain owned by the domain controller.

## 8. Browser matrix

Use deterministic viewport evidence consistent with existing Forge browser conventions:

| Surface | Viewport | Minimum cases |
| --- | ---: | --- |
| mobile | 390 x 844 | tree -> matrix step flow, touch edit/toggle, dirty guard, error/conflict, horizontal pressure |
| tablet | 834 x 1112 | split/adaptive layout, sticky axes, search, focus mode, keyboard where applicable |
| desktop | 1440 x 1000 | hierarchy, both search scopes, hide/show columns, sticky axes, focus mode, bulk editing flow |

For all three:

- loading;
- empty navigator;
- empty rows/columns;
- projection error;
- permission denied;
- OCC conflict;
- dirty navigation attempt;
- hidden column restore;
- create missing cell;
- update existing cell;
- remove/disable semantics according to domain action;
- large catalog completeness/search.

Browser screenshots alone are not sufficient for permission/OCC claims; pair them with authoritative server regressions.

## 9. Performance smoke plan

No fake SLA numbers are declared. The QA fixture defines structural engineering envelopes only.

### Medium envelope

- axis A: 500 members;
- axis B: 40 members;
- sparse cells: 1,200;
- assert no per-cell request;
- assert bounded search/page source;
- assert renderer does not require full Cartesian materialization.

### Large envelope

- axis A: 5,000 members;
- axis B: 200 members;
- sparse cells: 10,000;
- assert visible-window or equivalent bounded rendering seam;
- assert stale searches can be cancelled or ignored;
- assert repeated cell edits do not cause full projection reload per edit.

When UI02/UI03 implementation arrives, measure request count, rendered node/cell count and update behavior. Record measured results only; do not turn fixture sizes into customer SLA promises.

## 10. Legacy Item Price special-case removal gate

Do **not** delete the current `BulkGridContainer` Item Price branch until all mandatory items below have evidence on an integrated head:

1. UI01 canonical Matrix metadata is typed, validated and transported end-to-end;
2. UI02 generic renderer contains no pricing/Alumdoor literals and passes the static domain-leak gate;
3. UI03 pricing projection/action is server-authoritative for permission, tenant, OCC and retry semantics;
4. UI04 parity fixture passes current Item Price behaviors on desktop/tablet/mobile;
5. create missing price, update price, enable/disable and UOM add/remove semantics pass integrated E2E/server tests;
6. dirty/error/conflict/loading/empty states pass;
7. large-catalog completeness/search passes;
8. Supplier x Item runs through the same renderer without a renderer fork;
9. targeted client typecheck/lint/build pass on exact integrated SHA;
10. exact changed-file diff confirms the deletion does not silently remove another Bulk Grid behavior.

Only after those pass should RUNTIME/convergence owner remove the special-case import/route.

## 11. Conflict / hotspot report

| Hotspot | Current owner | QA rule |
| --- | --- | --- |
| `client/packages/core/src/types/meta.ts` | UI01 META | QA does not edit; consume canonical contract after owner lands |
| server metadata/compiler/parser transport | UI01 META | validate round-trip after owner lands |
| `client/packages/views/src/**/matrix/**` and Matrix routing | UI02 RUNTIME | run domain-leak/browser/perf gates; do not rewrite renderer |
| `server/packages/clouderp-pricing/**` | UI03 PRICING | verify authority/OCC/idempotency; do not move pricing into QA/client |
| Alumdoor manifest/brief/reference fixtures | UI04 ALUM | consume parity evidence; QA second-reference fixtures remain separate |
| legacy `ItemPriceMatrixPanel.tsx` | convergence specimen | do not delete before §10 gate |

Expected convergence order remains:

1. META canonical contract;
2. RUNTIME adapter to canonical contract;
3. PRICING projection/actions;
4. ALUM metadata/reference wiring;
5. QA targeted/static/browser/evidence pass;
6. remove Item Price special case;
7. integrate Supplier x Item second-reference proof;
8. continue Item x Warehouse/Reorder, then Item Group x Account.

Blindly merging five branches is rejected because it hides contract conflicts instead of resolving them.

## 12. Dependency Requests

### Dependency Request — UI01 META

Owner: `agent/ui-01-meta`

Need: canonical first-class Matrix metadata + validator + compiler/parser/manifest round-trip.

Why: QA cannot validate malformed axes/actions or transport preservation against a contract that does not yet exist.

Blocked scope: C-01..C-05 integrated contract tests.

Can continue independently: yes.

Next independent work: static genericity gate and semantic second-reference fixtures completed.

### Dependency Request — UI02 RUNTIME

Owner: `agent/ui-02-runtime`

Need: generic Matrix renderer behind a business-neutral semantic model, including loading/error/conflict, keyboard/touch/mobile and bounded rendering seam.

Why: browser, a11y and performance behavior require actual renderer code.

Blocked scope: U-01..U-06, P-02 runtime measurement.

Can continue independently: yes.

Next independent work: domain-leak gate and browser/performance matrix completed.

### Dependency Request — UI03 PRICING

Owner: `agent/ui-03-pricing`

Need: bounded server-authoritative Item Price projection + compound mutation action with trusted tenant, permission, OCC and retry/idempotency semantics.

Why: current React specimen coordinates domain mutations client-side, so QA cannot claim security/OCC correctness from UI behavior.

Blocked scope: S-01..S-03, O-01, I-01..I-02 and Item Price integrated save evidence.

Can continue independently: yes.

Next independent work: server semantic negative-case matrix completed.

### Dependency Request — UI04 ALUM

Owner: `agent/ui-04-alumdoor`

Need: deterministic Item Price parity fixture + generic metadata mapping + before/after browser checklist.

Why: special-case removal requires proof that genericization preserves the current operator workflow.

Blocked scope: U-01..U-05 reference parity and removal gate.

Can continue independently: yes.

Next independent work: second-reference fixtures and cross-branch acceptance matrix completed.

## 13. Verification performed in this QA pass

Because the execution container could not resolve `github.com`, a full checkout/build/browser run was not available. GitHub state and source were audited through the repository connector.

Local artifact validation performed:

- `node --check client/scripts/check-matrix-domain-leaks.mjs` — PASS on staged QA artifact;
- `node --check client/scripts/check-matrix-second-references.mjs` — PASS on staged QA artifact;
- `node scripts/check-matrix-second-references.mjs` against the staged fixture — PASS, 4 references + 2 performance envelopes;
- domain-leak gate positive fixture — PASS with the one declared legacy Item Price route;
- domain-leak gate injected negative fixture containing `Price List` in generic Matrix source — correctly exited non-zero.

Full-repo lint/typecheck/build/browser remains pending until an environment with repository checkout/dependencies is available and, for integration cases, until UI01–UI04 produce implementation SHAs.

## 14. Branch handoff

Work completed in UI05 ownership:

- exact current-state audit;
- cross-branch acceptance matrix;
- conflict/hotspot report;
- static no-domain-leak/direct-mutation QA gate;
- deterministic semantic fixtures for four proof-ladder references;
- second-reference invariant gate;
- security/OCC/idempotency negative-case plan;
- desktop/tablet/mobile browser matrix;
- bounded performance smoke envelopes;
- special-case removal gate;
- explicit Dependency Requests for UI01–UI04.

Files touched by this pass:

- `client/scripts/check-matrix-domain-leaks.mjs`;
- `client/scripts/check-matrix-second-references.mjs`;
- `client/qa/matrix/second-reference-fixtures.json`;
- `client/package.json` to wire the QA gates into normal client lint/test;
- `docs/agents/ui-factory/UI05-QA-EVIDENCE.md`.

Maturity: **Foundation** for the QA/convergence harness; generic Matrix remains **Missing** until owner implementation lands.

Merge/deploy: **not performed**. These are QA/test artifacts, but the UI Factory program includes shared runtime/contracts/backend work and must converge on exact implementation SHAs before any merge/deploy decision.
