# Procurement Operating Workspace — Dependency Requests

Date: 2026-08-05  
Branch: `ui/metaforge-operating-workspace-alumdoor-purchase-20260805`  
Base: `main@9142d91a55ff20f47334c75c157b08228cae9418`

## Delivered independently

The client now has one shared `ProcurementOperatingWorkspace` that keeps these operator surfaces on one route:

`Quy trình -> Mua hàng -> Nhập hàng -> Thanh toán -> Lịch sử -> Báo cáo`

The slice reuses canonical authorities instead of creating shadow business logic:

- `Purchase Order` creation goes through `NewFormContainer` / canonical document create;
- receipt/FIFO continues through the existing `AppAction` controller path;
- `Payment Entry` creation goes through the canonical document path;
- supplier AP is read from the existing supplier dashboard, which prefers Payment Ledger / `Debt Summary`;
- charts reuse `@metaforge/charts`;
- history is a presentation composition of the existing purchase-order/receipt read model;
- VAT is deliberately not synthesized in the client.

No backend, schema, migration, ledger, permission or production-data mutation is included in this client slice.

## DR-POW-01 — canonical VAT read model

**Owner:** Finance / VN Accounting shared authority.

The current supplier dashboard exposes invoice totals and authoritative AP but does not expose the canonical input-VAT reconciliation dataset per supplier/time window.

Required contract:

- input VAT amount from submitted `Purchase Invoice` tax rows through VN Accounting authority;
- exception/reconciliation count;
- source/effective rule identity where relevant;
- optional invoice rows suitable for drill-down.

Until this exists, the workspace renders VAT as `—`. The UI must not derive tax authority from typed percentages or from receipt values.

## DR-POW-02 — metadata-owned operating-workspace binding

**Owner:** App Registry / App Factory shared metadata contract.

The reusable workspace renderer is generic, but the first consumer is currently selected at the public `NativeActionScreen` boundary by the two known Alumdoor receipt commit methods and supplied the existing supplier-dashboard context method.

Target contract should let an app declare, as metadata:

- `workspace_kind: procurement` (or equivalent typed operating-workspace id);
- read-only `context_method`;
- optional canonical document roles (`purchase_order_doctype`, `payment_doctype`);
- presentation labels only.

The server must validate this declaration and deliver it in the filtered manifest. Do not move these literals to another shared React file as a cosmetic cleanup.

This dependency does **not** block the current UI slice or its QA; it blocks declaring the temporary consumer binding fully metadata-owned.

## DR-POW-03 — supplier-prefilled canonical create

**Owner:** shared Form/Document UX contract.

`NewFormContainer` currently accepts business-context defaults but not caller-supplied, permission-safe initial values. Therefore embedded Purchase Order / Payment Entry create surfaces cannot yet prefill the currently selected supplier without adding a new shared contract.

Desired generic API:

`initialValues?: Record<string, unknown>`

with these rules:

- only authorable fields survive serialization;
- metadata defaults/business context keep their existing authority order;
- no hidden/system/server-owned field can be forced by the caller;
- Payment Entry still validates `payment_type`, party and allocation on the server.

Until this is added, the create form stays inline but the user may need to select the supplier again inside the canonical form.

## Release classification

- Current client implementation: `FAST/STANDARD UI composition`, `NEW_CANDIDATE` only.
- DR-POW-01 VAT read contract: `STANDARD/CRITICAL-adjacent` Finance read semantics; no tax posting change is requested.
- DR-POW-02 metadata contract: `STANDARD` shared contract.
- DR-POW-03 create prefill contract: `STANDARD` shared form contract.

Do not merge/deploy this branch as pilot authority until exact-head frontend gates pass and release impact is reviewed against the current controlled-pilot identity.
