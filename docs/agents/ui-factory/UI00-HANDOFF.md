# UI00 — MetaForge UI Factory Control Handoff

Date: 2026-08-03
Branch: `agent/ui-00-control`
Role: coordination / convergence only

## Executive status

UI00 control work is complete for the current pre-implementation wave.

The five worker branches exist, but none has begun production implementation yet. Their diffs against current `main` contain only the shared NO-STOP rule plus each branch's work-order document. Therefore there is nothing safe or useful to converge at code level yet.

Control decision: **do not blindly merge any UI01–UI05 branch now**. First sync each worker to exact current `main`, execute Wave A inside ownership boundaries, then converge by contract and evidence.

## Exact GitHub snapshot

Snapshot observed on 2026-08-03:

- current `main`: `a9e3cde352dbe78c93b28097094c45fc5baad845`;
- common UI Factory creation baseline: `55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`;
- `agent/ui-00-control`: diverged, ahead 2 / behind 2, docs-only before this handoff;
- `agent/ui-01-meta`: diverged, ahead 2 / behind 2, docs-only;
- `agent/ui-02-runtime`: diverged, ahead 2 / behind 2, docs-only;
- `agent/ui-03-pricing`: diverged, ahead 2 / behind 2, docs-only;
- `agent/ui-04-alumdoor`: diverged, ahead 2 / behind 2, docs-only;
- `agent/ui-05-qa`: diverged, ahead 2 / behind 2, docs-only.

`main` moved after the worker branches were created. The two commits after the UI Factory baseline are Alumdoor HR-lite changes. They are not Matrix implementation, but every worker must still compare/sync before touching shared files because exact main is the source of truth.

## Planning source status

Draft PR `#370` remains open and draft. It is a planning checkpoint, not merged canonical state.

Useful direction from the draft:

- full MetaForge Enterprise UI Pattern System;
- Matrix as first canonical extraction;
- first-class `viewPolicy.matrix`;
- named permission-aware projection/read boundary;
- domain-action write boundary for compound/unsafe mutations;
- preserve Alumdoor Item Price Manager UX parity or better;
- remove the shared `Item Price` special case only after integration evidence;
- prove genericity with Supplier × Item, Item × Warehouse/Reorder, then Item Group × Account;
- User × Role remains gated by WS11 security review.

Use PR #370 as planning evidence only until it is approved/merged or superseded by exact implementation evidence.

## Exact architecture debt still present on main

Current `client/packages/views/src/bulk/BulkGridContainer.tsx` still:

- imports `ItemPriceMatrixPanel` directly;
- routes with `if (props.doctype === "Item Price")`;
- bypasses the normal generic Bulk policy for that DocType.

This confirms the Matrix extraction is still required. The debt is real, but deleting the special case before the replacement path is integrated would be a regression, not architecture work.

## Ownership normalization

The UI Factory branches are execution branches, not new permanent ownership domains. They must map back onto existing Forge workstreams.

| UI branch | Execution role | Canonical workstream boundary |
| --- | --- | --- |
| `agent/ui-01-meta` | Matrix/UI Grammar schema, compiler, validator | WS09 App Factory for schema/compiler/authoring; only narrowly shared generic seams may involve WS00 |
| `agent/ui-02-runtime` | shared Matrix renderer, responsive/mobile/a11y | WS14 frontend/runtime/mobile |
| `agent/ui-03-pricing` | Item Price projection/action correctness | pricing/domain authority; request WS00 only for a truly generic server seam |
| `agent/ui-04-alumdoor` | Alumdoor parity fixtures and metadata wiring | WS17 reference vertical |
| `agent/ui-05-qa` | independent integration/genericity/evidence | cross-workstream QA; no production ownership takeover |
| `agent/ui-00-control` | dependency/conflict/convergence coordination | coordination only; implements no owner code |

### Important ownership correction

`UI01-META.md` names `client/packages/core/src/types/meta.ts` as a preferred hotspot. Current program guidance also places shared React runtime/core/views/shell under WS14 while PR #370 gives schema/compiler/App Factory authoring to WS09.

Control resolution:

1. UI01 owns the **canonical Matrix metadata contract as the WS09 execution slice**.
2. UI02 owns **renderer/runtime implementation as the WS14 execution slice**.
3. If a type file physically lives in a shared package used by WS14, UI01 may make only the contract change required by the WS09-owned schema and must keep the delta narrow.
4. UI02 must not redefine the canonical contract locally. It may use a temporary semantic view-model adapter until UI01's contract is ready.
5. Any broader shared-core refactor is a Dependency Request, not collateral work.

This avoids two agents both claiming the same shared package because directory ownership and semantic ownership are not always identical. Humanity has already invented enough merge conflicts.

## Wave A dispatch decision

All five workers can execute in parallel **after exact-main sync/audit**.

### UI01 — META

Start now after sync.

Required first output:

- minimal canonical `viewPolicy.matrix` shape;
- deterministic validation;
- compiler/parser/manifest preservation;
- positive and negative fixtures;
- backward compatibility for `viewPolicy.bulk`.

Target maturity after Wave A: `Foundation`, `Wired` only if transport is proven end-to-end.

### UI02 — RUNTIME

Start now after sync, independently using a local renderer semantic model.

Required first output:

- business-neutral Matrix component family;
- navigator, axes, sparse cells, auxiliary row fields;
- dirty/loading/error/conflict states;
- desktop/tablet/mobile composition;
- keyboard/a11y behavior;
- large-grid/virtualization seam;
- zero business-name routing in generic Matrix code.

Target maturity after Wave A: isolated renderer `Wired`; not RC.

### UI03 — PRICING

Start now after sync.

Required first output:

- audit current `ItemPriceMatrixPanel` mutation semantics;
- permission-aware bounded read projection;
- compound write action with tenant/OCC/idempotency/error semantics;
- pricing/UOM/Price List correctness stays server-authoritative;
- targeted security and failure tests.

Target maturity after Wave A: `Foundation` to `Wired`.

### UI04 — ALUMDOOR

Start now after sync.

Required first output:

- exact current Price Manager behavior inventory;
- deterministic parity fixture;
- generic Matrix metadata mapping draft;
- desktop/tablet/mobile before/after checklist;
- explicit removal gate for the legacy special case.

Target maturity: reference specification `RC` quality; integrated runtime still below RC.

### UI05 — QA

Start now after sync.

Required first output:

- acceptance matrix;
- static no-domain-leak check;
- security/OCC/idempotency cases;
- browser matrix;
- performance smoke contract;
- second-reference fixture design;
- conflict report across UI01–UI04 outputs.

Target maturity: evidence framework `Foundation/Wired`; final Matrix RC waits on convergence.

## Shared hotspot policy

| Hotspot | Single semantic owner during Wave A | Other branches |
| --- | --- | --- |
| Matrix metadata schema/compiler | UI01 / WS09 | request contract, do not redefine |
| shared Matrix renderer/views | UI02 / WS14 | metadata/config only |
| pricing projection/action | UI03 / pricing domain | named source/action only |
| Alumdoor app config/fixtures | UI04 / WS17 | reference-only consumption |
| cross-branch tests/evidence | UI05 | may inspect all, must not rewrite production owners |
| convergence decisions | UI00 | no implementation takeover |

## Dependency Requests to enforce

### DR-01 — canonical metadata to runtime

Owner: UI01 / WS09
Need: stable canonical Matrix contract plus mapping semantics for runtime adapter.
Why: UI02 must not invent a competing metadata schema.
Blocked scope: final canonical adapter only.
Can continue independently: yes.
Next independent work: UI02 builds business-neutral renderer view-model and behavior tests.

### DR-02 — generic named projection/action reference

Owner: UI01 / WS09, with WS00 only if the server transport lacks a truly generic seam
Need: metadata-safe reference shape for named read source and named actions.
Why: compound Matrix writes must not become generic client document mutation.
Blocked scope: final metadata-to-domain wiring.
Can continue independently: yes.
Next independent work: UI03 defines pricing-domain read/commit contracts using current server conventions.

### DR-03 — pricing contract to Alumdoor mapping

Owner: UI03
Need: final pricing Matrix source/action names and payload/result semantics.
Why: UI04 metadata mapping cannot freeze concrete bindings before the domain contract exists.
Blocked scope: final Alumdoor binding only.
Can continue independently: yes.
Next independent work: UI04 finishes behavior inventory, fixtures and generic mapping placeholders.

### DR-04 — security gate for privileged Matrix proof

Owner: WS11
Need: explicit review before User × Role becomes a production reference.
Why: IAM mutation is privileged and must remain fail-closed/server-authoritative.
Blocked scope: User × Role production proof only.
Can continue independently: yes.
Next independent work: QA uses Supplier × Item and Item × Warehouse/Reorder first.

## Convergence order

Do not merge branches wholesale. Convergence is file/contract based.

1. Sync/re-audit each worker against then-current `main`.
2. Review UI01 contract and tests.
3. Adapt UI02 renderer to UI01 canonical contract.
4. Review UI03 server projection/action contract independently for permission, tenant, OCC, idempotency and failure semantics.
5. Wire UI04 Alumdoor metadata/reference to canonical Matrix + pricing actions.
6. Run UI05 targeted/static/browser/performance evidence.
7. Remove `if (props.doctype === "Item Price")` only after parity and failure-path evidence passes.
8. Prove Supplier × Item without shared renderer fork.
9. Prove Item × Warehouse/Reorder.
10. Prove Item Group × Account if needed for RC confidence.
11. Only then assess Matrix maturity for `RC`.

For each overlapping delta classify:

- keep;
- extract generic;
- superseded;
- reject.

## Convergence acceptance gate

The first integrated Matrix slice is acceptable only if all are true:

- metadata selects Matrix without business-name conditions;
- shared renderer contains no Alumdoor/Item Price/Price List/UOM pricing semantics;
- complex pricing mutation is server-authoritative;
- server permission and trusted tenant boundary are enforced;
- OCC conflict is visible and safe;
- retry behavior cannot duplicate effects;
- Alumdoor desktop/tablet/mobile flow is parity or better;
- no N × M request explosion is introduced;
- large/sparse matrix behavior has a bounded strategy;
- at least one non-pricing second reference works by metadata/domain contract changes only;
- legacy Bulk behavior remains compatible;
- the old Item Price special case is removed only at the end of the proven path.

## Current maturity assessment

| Area | Current maturity | Reason |
| --- | --- | --- |
| UI Factory control/coordination artifact | `RC` | exact state, ownership, dependencies and convergence gate recorded |
| Matrix canonical metadata | `Missing` implementation | UI01 currently contains work order only |
| Generic Matrix runtime | `Missing` implementation | UI02 currently contains work order only |
| Pricing Matrix server boundary | `Missing` implementation | UI03 currently contains work order only |
| Alumdoor parity specification | `Foundation` | requirements are written, deterministic fixtures/evidence not yet produced |
| Matrix QA/evidence framework | `Foundation` | acceptance requirements are written, executable evidence not yet produced |
| Integrated Matrix capability | `Missing` | no canonical end-to-end path yet |

No capability is promoted because documents exist. Documents are instructions, not software. A distressingly necessary distinction.

## UI00 files touched

- `docs/agents/ui-factory/UI00-CONTROL.md` — existing control contract, unchanged in this pass.
- `docs/agents/ui-factory/NO-STOP-RULE.md` — existing shared execution rule, unchanged in this pass.
- `docs/agents/ui-factory/UI00-HANDOFF.md` — this exact-state audit and convergence handoff.

## Verification/evidence executed

- retrieved exact repository metadata and current default branch;
- compared `agent/ui-00-control` through `agent/ui-05-qa` against current `main`;
- confirmed all six branches share the stale creation baseline and all workers are docs-only at snapshot time;
- read `CURRENT_STATUS.md` and `NEXT_TASKS.md`;
- read Forge Enterprise Completion Skill;
- read all UI00–UI05 work-order documents;
- inspected Draft PR #370 metadata and Matrix/UI Grammar plan;
- inspected current `BulkGridContainer.tsx` and confirmed the Item Price special-case still exists.

No runtime tests/build/browser checks are meaningful on UI00 because this branch changes control documentation only.

## Remaining blockers

UI00 itself has no blocker for its coordination scope.

Program-level blockers before convergence are simply unfinished worker outputs from UI01–UI05. Those are active work dependencies, not reasons for UI00 to rewrite owner code.

## Merge/deploy status

- No merge performed.
- No deploy performed.
- No production mutation performed.
- This branch is documentation/control only, but the UI Factory program it coordinates includes shared contract/backend work, so final program merge/deploy remains evidence- and approval-gated by the relevant workstream rules.
