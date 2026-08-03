# UI04 — ALUMDOOR

Date: 2026-08-03
Status: **REVIEW — WAVE A COMPLETE**
Owner: **GPT-5.6 Thinking / UI04**
Started from: `main@a9e3cde352dbe78c93b28097094c45fc5baad845`
Branch: `agent/ui-04-alumdoor`
Role: reference vertical / UX parity / metadata mapping

## Mission outcome

The current Alumdoor Item Price Manager is now locked as a **reference UX specimen**, not a future architecture. UI04 captures what must survive genericization, creates deterministic parity data, maps the experience to business-neutral Matrix semantics, and defines the exact evidence gate before removing the current `Item Price` runtime special case.

UI04 deliberately does **not** implement shared renderer code, canonical Matrix schema, or pricing-domain authoritative writes. Those belong to UI02, UI01 and UI03 respectively.

## Exact-state audit

- Branch was resynced to exact `main@a9e3cde352dbe78c93b28097094c45fc5baad845` before implementation.
- The two main commits after the original UI Factory baseline are Alumdoor Employee Lite workflow/docs/script changes and do not touch Matrix source, BulkGrid routing or `alumdoor-v2.views.json`.
- Exact current compatibility route remains in `client/packages/views/src/bulk/BulkGridContainer.tsx`:

```ts
if (props.doctype === "Item Price") {
  return <div className="h-full min-h-0 p-2"><ItemPriceMatrixPanel adapter={adapter} onChanged={viewQ.refetch} /></div>;
}
```

- `ItemPriceMatrixPanel.tsx` still performs compound Item/UOM/Item Price mutation from React. This is classified as reference debt, not target authority.
- Existing specialist UI has OCC on individual document writes and save/toast feedback, but lacks a dedicated dirty indicator/unload guard, structured conflict state, keyboard matrix navigation and atomic compound commit.

## Delivered

### 1. Deterministic reference fixture

Authoritative UI04 fixture:

`docs/agents/ui-factory/fixtures/alumdoor-item-price-matrix-reference.json`

It contains:

- four effective-dated column members including a disabled one;
- multi-level Vietnamese navigator data;
- multiple primary/default row-unit patterns;
- one item with multiple conversion rows;
- sparse existing cells;
- create/update/remove/disabled/conflict scenarios;
- deterministic 405-item synthetic tail with page-boundary anchors at 200/201 and 400/401;
- business-neutral semantic Matrix mapping;
- app-side named source/action bindings separated from the generic mapping;
- explicit architectural debts that must not become parity requirements.

### 2. Full parity and removal gate

Authoritative acceptance document:

`docs/agents/ui-factory/ALUMDOOR-ITEM-PRICE-MATRIX-PARITY.md`

It inventories 57 current behaviors and classifies convergence requirements across desktop/tablet/mobile as `LOCKED` or `IMPROVE`.

The removal gate requires canonical metadata transport, a business-neutral renderer, a server-authoritative pricing commit path, all fixture scenarios, three viewport proofs, dirty/conflict protection, exact-head build/tests and a second non-pricing Matrix reference before the hard-coded route can disappear.

### 3. Reference selfcheck

Added:

`server/tests/alumdoor-item-price-matrix-reference.test.mjs`

The selfcheck locks:

- representative fixture completeness;
- sparse create/update row-mutation/conflict/large-catalog cases;
- business-neutral generic mapping with no `Item Price`, `Price List`, `UOM` or `Alumdoor` behavior literals;
- explicit classification of current architectural debt.

## Verification evidence

- Exact branch vs main before final handoff: **ahead only / behind 0**.
- Changed blast radius: docs + deterministic fixture + reference selfcheck only; no `client/**`, app brief, schema, migration, pricing authority or production code changed.
- Fixture JSON content was fetched back from GitHub by blob SHA and parsed successfully in an independent local invariant mirror.
- Invariant mirror result: **PASS** for effective dates/disabled member, multi-level navigator, row diversity, sparse cells, 0/200/400 paging anchors, all required scenarios, no generic business-literal leakage and all debt classifications.
- The committed Node selfcheck source was fetched back and audited for syntax/fixture-relative path consistency.
- Full repository `node --test` execution is **NOT RUN** because the available container cannot resolve `github.com` and has no full Forge checkout. No fake CI claim is made.
- Browser parity against the future generic renderer is intentionally not runnable on UI04 because UI02/UI01/UI03 convergence does not yet exist.

## Dependency Requests

### DR-UI04-01 -> UI01 / META

- Need: canonical first-class Matrix metadata + validator/compiler/manifest transport able to express the UI04 semantic mapping without app literals.
- Blocked scope: real Alumdoor `viewPolicy.matrix` wiring.
- Can continue independently: UI04 Wave A is complete.

### DR-UI04-02 -> UI02 / RUNTIME

- Need: generic renderer for hierarchy/search, row auxiliary editor, sparse cells, column visibility, sticky axes, focus mode, desktop/tablet split, mobile steps, dirty guard and structured conflict state.
- Blocked scope: browser parity against the generic renderer.
- Can continue independently: UI04 Wave A is complete.

### DR-UI04-03 -> UI03 / PRICING

- Need: permission-aware bounded read projection and server-authoritative compound commit/create-column/row-member capabilities with OCC/idempotency and explicit atomic/partial-failure semantics.
- Blocked scope: removal of direct multi-document React mutation.
- Can continue independently: UI04 Wave A is complete.

### DR-UI04-04 -> UI05 / QA

- Need: convergence E2E/performance evidence and second-reference leakage proof.
- Blocked scope: final special-case removal and declaration that Matrix is a generic platform primitive.
- Can continue independently: UI04 Wave A is complete.

## Maturity

| Scope | Maturity |
| --- | --- |
| UI04 reference behavior specification | **RC source/spec** |
| deterministic fixture + semantic mapping | **RC source/spec** |
| canonical Alumdoor Matrix metadata | **Blocked by UI01** |
| generic Matrix runtime parity | **Blocked by UI02** |
| server-authoritative pricing Matrix action | **Blocked by UI03** |
| whole Matrix convergence/removal | **Not RC until UI05/integration evidence** |

## Changed zones

- `docs/agents/ui-factory/UI04-ALUMDOOR.md`
- `docs/agents/ui-factory/NO-STOP-RULE.md`
- `docs/agents/ui-factory/ALUMDOOR-ITEM-PRICE-MATRIX-PARITY.md`
- `docs/agents/ui-factory/fixtures/alumdoor-item-price-matrix-reference.json`
- `server/tests/alumdoor-item-price-matrix-reference.test.mjs`

No shared renderer, metadata compiler, pricing package, generated Alumdoor brief, migration, schema or production workflow is modified.

## Merge / deploy classification

This branch is **reference-only UI Factory support**: documentation, deterministic fixture and test. It changes no runtime/backend/business behavior. It is safe to merge as a non-production UI/reference artifact after exact-head PR review.

There is **nothing to deploy** from this branch because no `client/**` or production artifact changes. The actual Matrix renderer/pricing convergence must follow UI00 ownership and its own merge gates.

## Handoff

Workstream: UI04 / ALUM  
Branch: `agent/ui-04-alumdoor`  
Status: `REVIEW — WAVE A COMPLETE`  
Capabilities: Alumdoor Item Price Matrix UX reference, fixture, semantic mapping, parity/removal gate  
Migration: none  
Production mutation: none  
Recommended next integration order: `UI01 META -> UI03 PRICING -> UI02 RUNTIME -> UI04 wiring/parity -> UI05 QA -> remove special case`.
