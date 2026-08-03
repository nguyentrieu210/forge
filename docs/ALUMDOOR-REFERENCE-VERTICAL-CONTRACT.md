# Alumdoor Reference Vertical Contract

Status: WS17 active contract draft  
Baseline: current WS17 branch rebased from `main@31233237d9310e628174e06677eaef117242ee9a`  
Purpose: make Alumdoor a first-party installed app/reference vertical without turning Forge shared code into an Alumdoor fork.

## 1. Rule of ownership

A capability belongs to Alumdoor when its meaning changes because the business is a door/aluminium workshop. A capability belongs to Forge when another industry can use the same invariant after changing only metadata/policy/data.

Examples:

- Door leaf formula, cut deduction, stamping, profile dimensions, Alumdoor print wording: **app-owned**.
- Purchase allocation, stock ledger, catch-weight measures, reservation, reconciliation, BOM lifecycle, warranty lifecycle, app installation: **platform/domain-owned**.
- Tiến Đạt default tolerance: **app policy**. Supplier tolerance field and enforcement mechanism: **Procurement primitive**.

## 2. Allowed Alumdoor dependencies

The app may depend on public Forge surfaces only:

1. Document/resource API for CRUD and lifecycle actions.
2. Query/report API for read models such as Stock Ledger, Payment Ledger/Debt Summary and canonical supplier allocation reports.
3. Platform callback injected into the app Worker under the current caller identity.
4. App manifest/metadata contracts for DocType, workflow, permission, action, print, navigation, dependency and external-DocType declarations.
5. Generic extension contracts explicitly published by App Factory/runtime owners.

The app Worker may calculate vertical results before calling those surfaces. It must not bypass them to obtain stronger permissions or a second source of truth.

## 3. Forbidden dependencies

Alumdoor code must not:

- open tenant D1 directly;
- write Stock Ledger, GL, Payment Ledger, allocation tables or fulfillment ledgers directly;
- import implementation internals from `server/packages/**` into `server/apps-src/alumdoor-worker/src/**`;
- depend on a private runtime component that is selected only because the app is Alumdoor;
- duplicate a generic ledger/controller because the vertical needs a special UI;
- infer monetary AP from supplier delivery debt;
- invent physical measurement evidence, especially actual weight.

Shared Forge code must not require vertical literals such as:

- `Alumdoor`;
- `alu.kairo.vn`;
- `nhap-nhom-fifo`;
- `alumdoor.purchase.*`;
- `Nhôm cây/lá`;
- `Thành phẩm theo m2`;
- field-specific assumptions such as `qty_bar` unless they are supplied by a generic declarative measure contract.

## 4. Public app Worker contract

### Identity

Every app Worker request runs with the caller identity supplied by Forge. Callback requests forward authorization and signed Forge identity headers. The app does not maintain a separate permission database.

### Reads and writes

- Read masters/documents through resource APIs.
- Create/update business documents through resource/lifecycle APIs.
- Use canonical preview/submit/cancel paths for ledger-affecting documents.
- Fail closed when a source-of-truth read required for idempotency, duplicate prevention, permission or settlement cannot be completed.

### Vertical method namespace

Alumdoor-owned methods use `alumdoor.*`. Their implementation may compose public generic APIs but their names do not become shared runtime contracts.

Current examples include purchase FIFO workspace methods, door formula/cutting, OCR mapping, production composition and Alumdoor operations helpers.

## 5. Multi-measure contract target

The current code has a real requirement that must survive extraction:

- commercial/purchase valuation may be kg;
- physical supplier obligation may be count of bars/leaves;
- physical identity can additionally include length, color, stamp state and measurement profile;
- barem weight is theoretical evidence;
- actual weight is measured evidence and must never be synthesized from count;
- accounting stock and supplier delivery allocation may intentionally use different quantity axes.

The generic target is a declarative measure descriptor, conceptually:

```text
commercial_quantity: { value, uom, role }
stock_quantity:      { value, uom, role }
allocation_quantity: { value, uom, role }
physical_measures:   [{ key, value, uom, evidence_kind }]
material_identity:   [{ key, value }]
```

Names are illustrative, not a schema commitment. The important invariant is that Procurement/Stock/Kernel resolve normalized roles rather than checking `inventory_mode === "Nhôm cây/lá"`.

## 6. UI extension target

The shared React runtime should not switch on `nhap-nhom-fifo`, `alumdoor.*`, hostname or Alumdoor field names.

The target is:

1. app metadata declares an action/workspace presentation or extension key;
2. App Factory validates which package owns that extension;
3. runtime renders a generic contract;
4. Alumdoor owns the Tiến Đạt copy, fields, tabs and method bindings;
5. generic child-grid column order/presentation comes from metadata, not hard-coded child DocType names.

Branding should be resolved from tenant/app brand configuration, not hostname checks inside the shell.

## 7. Manufacturing boundary

Keep in Alumdoor:

- door type inference;
- leaf-count formula and rounding variants;
- door/profile policy selection;
- cut-width deductions;
- stamping/paint rules specific to the product;
- formula snapshot used to explain how a door was calculated.

Extract to Manufacturing:

- Production Request and Work Order lifecycle;
- BOM effective-date/revision selection;
- generic capacity calculation and scheduling;
- duplicate/idempotency protection for manufacturing documents;
- generic operation/job-card costing and correction.

Alumdoor should eventually produce normalized manufacturing demand and call those public primitives.

## 8. Warranty and OCR boundary

Warranty:
- generic: claim source, delivery date, eligibility duration, responsibility, costs, status/correction;
- vertical: cause taxonomy/policy defaults and Alumdoor supplier-resolution presentation.

OCR:
- generic: permission-aware extraction with evidence/confidence and preview-before-write;
- vertical: parsing/mapping into Alumdoor purchasing/production rows.

## 9. Finance boundary

Supplier delivery debt answers “what material is still owed?”. Accounts payable answers “what money is still owed?”. They can be shown together but must remain different authoritative sources.

Alumdoor may consume Finance read models. It must never keep a competing payable balance. Warehouse Cash remains owned by `vn-accounting`; Alumdoor only consumes it through declared integration/external-DocType contracts.

## 10. App lifecycle acceptance

WS17 consumes, but does not own, platform lifecycle capabilities:

- `T01-012` app install per tenant;
- `T01-013` app upgrade per tenant;
- `T01-014` app rollback;
- `X01-014` package registry/catalog;
- `X01-015` compatibility/source-lock tooling.

Reference-vertical acceptance must prove:

- package dependency/external ownership is explicit;
- installation does not claim generic objects already owned by another app;
- upgrade is deterministic/idempotent;
- app Worker/runtime compatibility is versioned or fail-closed;
- rollback/restore path is documented by the platform owner;
- production evidence names the exact source/app version being exercised.

## 11. Known compatibility debt on baseline

These files are not owned by WS17 and are intentionally not edited on the WS17 branch. They are dependency work for their owning streams:

| Shared file | Debt |
|---|---|
| `server/packages/clouderp-core/src/uom.ts` | vertical inventory-mode literals choose quantity semantics |
| `server/packages/clouderp-erpnext/src/alumdoor-inventory.ts` | Alumdoor-specific controllers live in shared ERP package |
| `client/packages/views/src/action/FriendlyActionScreen.tsx` | action and `alumdoor.purchase.*` method special-case |
| `client/packages/views/src/form/ChildGrid.tsx` | Alumdoor Purchase/Sales child field-order special-cases |
| `client/packages/shell/src/BrandLogo.tsx` | Alumdoor hostname/path/logo special-case |

This debt is compatibility code, not the desired extension model. Extraction must preserve production behavior while replacing the selection mechanism with generic contracts.

## 12. Legacy PR rule

A legacy PR is not accepted because it makes the Alumdoor flow look complete. Each changed file is classified by current owner:

- vertical app-worker/generator/metadata can be selectively ported by WS17;
- Procurement/Stock/Kernel/Finance/Runtime changes go to their owners;
- stale whole-branch merge is rejected;
- a moved hard-code is still a hard-code.

For PR #295, WS17 therefore recommends selective current-main ports only. For current WS03 PR #305, the quantity-axis requirement is valid but the final public contract must not be the literal `Nhôm cây/lá` / `qty_bar` pair.

## 13. Acceptance rule

A new Alumdoor capability is boundary-clean only when all are true:

1. vertical policy is in Alumdoor-owned source;
2. generic state mutation uses an owner-published canonical API/controller;
3. no duplicate authoritative ledger exists;
4. caller permission/tenant identity survives the app boundary;
5. shared runtime/kernel does not gain a new Alumdoor special-case;
6. failure, retry, correction and audit behavior are defined;
7. focused regression exists;
8. cross-domain E2E reads canonical ledgers rather than merely checking that a document was created.
