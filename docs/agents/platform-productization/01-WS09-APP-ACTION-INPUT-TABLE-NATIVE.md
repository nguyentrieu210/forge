# Platform Productization 01 — WS09 AppAction Input Table Native Client

Date: **2026-08-04**  
Status: **IMPLEMENTED — DELIVERY PR #542 — VALIDATION PR #543**  
Risk: **STANDARD**  
Execution topology: **SINGLE**  
Branch: `platform/ws09-appaction-input-table-native-20260804`  
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

## 7. Acceptance gates

Required before merge:

1. locked dependency install succeeds;
2. `@metaforge/core` typecheck/build PASS;
3. `@metaforge/views` typecheck/build PASS;
4. action input-table regression PASS;
5. runtime production dependency-graph build PASS;
6. diff audit confirms no backend/schema/migration/business-authority change;
7. exact branch head and exact main base recorded in PR evidence.

Validation uses trusted-base PR **#543** so the temporary workflow is not part of delivery PR **#542**.

Browser evidence is desirable but not required to prove this compatibility boundary because the grid renderer itself is existing code; this slice changes which metadata source feeds it. Any subsequent visual/grid redesign remains WS14-owned.

## 8. Non-goals / next slices

This slice does **not** claim all WS09 Productization complete.

Next WS09 work after this boundary is proven:

1. migrate a real generic consumer declaration to first-class `input_tables` where the package still authors the legacy field;
2. define generic `BatchAction / BatchTransaction` execution/result semantics without stock/BOM-specific business rules;
3. fold the rolling bridge into native server `AppManifest` storage/parser once old-client compatibility window closes;
4. reusable approval/action lifecycle;
5. import/export/bulk-operation contract;
6. App Factory install/upgrade/rollback promotion evidence.

## 9. Merge / deploy boundary

This is a shared metadata/runtime contract and is treated as **STANDARD**, not a cosmetic UI fast-path.

Create PR and collect validation evidence. **Do not merge or deploy automatically.** Merge remains an explicit user approval step.
