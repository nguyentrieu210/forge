# Platform Productization 01 — WS09 AppAction Input Table Native Client

Date: **2026-08-04**  
Status: **IMPLEMENTED — STATIC DIFF AUDIT PASS — EXECUTABLE VALIDATION BLOCKED**  
Risk: **STANDARD**  
Execution topology: **SINGLE**  
Branch: `platform/ws09-appaction-input-table-native-20260804`  
Delivery PR: **#542**  
Base: exact `main@c10e8d9ec5da740910c4b995e03ea9529fa726b4`  
Capability owner: **WS09 App Factory**, shared client consumer boundary coordinated with **WS14**  
Primary capability: **B02-016 Action builder / first-class action input contract**

## 1. Why this is the first Platform Productization slice

Enterprise Transaction Closure is complete for its declared scope. `NEXT_TASKS.md` therefore moves the program to Platform Productization with WS09 first.

The server-side App Factory work was not missing: canonical PR **#362** already merged the `AppAction.input_tables` package/parser/install/tooling contract, compatibility lowering, tests and broader BPM/App Factory work. The remaining gap identified by WS09 as `DR-09-01` was the shared client consumer.

Before this slice, current client behavior was still anchored to a legacy presentation transport:

```text
AppAction.fields[]
  -> Text.options = "BulkTransaction:<json>"
  -> ActionScreen parses JSON
  -> repeatable grid
```

The server already decorates installed actions with normalized first-class `input_tables`, but intentionally retains the legacy field during rolling upgrade. A new client therefore needs to **prefer the first-class contract and suppress the matching fallback**, otherwise the migration never advances beyond the bridge.

## 2. User outcome

An app package may declare repeatable action inputs through first-class App Factory metadata and a current Forge client will render the same stable repeatable grid without the app author encoding JSON in a `Text` field.

This enables shared action contracts for Stock Reconciliation, BOM and future batch operations without moving stock/manufacturing business rules into React.

## 3. Authority boundary

This slice changes **presentation/metadata consumption only**.

It does not change:

- action method/controller authority;
- server permission checks or `permission_doctype`;
- tenant/session authority;
- stock, GL, valuation, BOM or document lifecycle authority;
- AppInstaller transaction semantics;
- migrations or production data;
- server validation of input-table field types/bounds/link targets.

Submitted rows remain authoritative only after the server action method validates and commits them.

## 4. Contract consumed by the client

```ts
interface AppActionInputTable {
  fieldname: string;
  label: string;
  description?: string;
  columns: AppActionInputColumn[];
  min_rows: number;
  max_rows: number;
  allow_paste: boolean;
}
```

`fieldname` is the POST key and its value is an array of row objects.

The client core now exports this contract and augments `AppAction.input_tables` during the rolling migration.

## 5. Compatibility strategy

The server currently returns both:

1. normalized `input_tables` for new clients;
2. matching `BulkTransaction:<json>` field fallback for old clients.

The new client boundary follows this rule:

```text
if valid input_tables exist:
    input_tables are source of truth
    remove fields with matching fieldname from presentation input list
    create one presentation adapter field for the stable existing grid renderer
else:
    leave legacy action unchanged
```

This is deliberately a **deletable presentation adapter**, not a second business contract. It avoids a flag day while ensuring new metadata wins immediately.

## 6. Implemented files

### Core contract

- `client/packages/core/src/app/action-input-table.ts`
  - `AppActionInputColumn`;
  - `AppActionInputTable`;
  - `AppActionWithInputTables`;
  - `AppAction` module augmentation;
  - safe `appActionInputTables()` reader.
- `client/packages/core/src/index.ts`
  - exports the first-class contract.

### Shared views

- `client/packages/views/src/action/input-table.ts`
  - first-class preference adapter;
  - duplicate fallback suppression;
  - defensive normalization/bounds;
  - no mutation of server-provided action.
- `client/packages/views/src/action/NativeActionScreen.tsx`
  - public standalone ActionScreen boundary consumes first-class metadata.
- `client/packages/views/src/screen/NativeScreenView.tsx`
  - AppScreen action blocks receive the same normalized action path.
- `client/packages/views/package.json`
  - public `./action` and `./screen` subpaths point to the new boundaries;
  - adds targeted `test:action-input-table` command.
- `client/packages/views/src/index.ts`
  - root ScreenView export points to the new boundary.

### Regression

- `client/packages/views/tests/action-input-table.test.mjs`
  - first-class table wins over same-name legacy fallback;
  - source action is not mutated;
  - legacy-only action remains unchanged;
  - malformed first-class metadata fails soft to existing path;
  - row bounds are defensively capped at server contract ceiling.

## 7. Validation evidence and blocker

### Proven in this session

- exact delivery base is current `main@c10e8d9ec5da740910c4b995e03ea9529fa726b4`;
- PR #542 changed-file audit contains exactly nine delivery paths, all under `client/packages/core`, `client/packages/views`, tests and this document;
- **no backend, schema, migration, ledger, tenant/session or permission file is changed**;
- current main drift was audited and the branch is based on the exact current main after UI-only #529;
- a targeted regression suite was added for precedence/no-mutation/legacy fallback/malformed metadata/bounds.

### Executable validation not yet proven

Required executable gates remain:

1. locked dependency install;
2. `@metaforge/core` typecheck/build;
3. `@metaforge/views` typecheck/build + `test:action-input-table`;
4. runtime production dependency-graph build.

A trusted-base validation PR **#543** was created, but GitHub returned **no workflow runs/statuses** for both its head and merge SHA. The current execution environment also cannot resolve `github.com`, so it cannot clone/install dependencies locally. This is an infrastructure/evidence blocker, **not a test PASS or FAIL**.

Therefore this slice remains **implemented but not promotion-ready**. Do not claim RC/Hardened from source review alone.

## 8. Non-goals / next slices

This slice does **not** claim all WS09 Productization complete.

After executable validation and merge approval, continue with:

1. migrate one real consumer declaration to first-class `input_tables` where the package still authors the legacy field;
2. define generic `BatchAction / BatchTransaction` execution/result semantics without stock/BOM-specific business rules;
3. fold the rolling bridge into native server `AppManifest` storage/parser once old-client compatibility window closes;
4. reusable approval/action lifecycle;
5. import/export/bulk-operation contract;
6. App Factory install/upgrade/rollback promotion evidence.

## 9. Merge / deploy boundary

This is a shared metadata/runtime contract and is treated as **STANDARD**, not a cosmetic UI fast-path.

Delivery PR **#542 remains draft and must not merge/deploy until executable validation is green and explicit user approval is given**.
