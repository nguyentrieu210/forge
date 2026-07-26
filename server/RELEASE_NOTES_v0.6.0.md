# CloudForge v0.6.0 — ERP Platform Alpha

## Platform foundation

- Added tenant-scoped DocType, DocField, workflow, naming, print, collaboration and import storage.
- Added an immutable standard metadata catalog and per-tenant provisioning endpoint.
- Added generic metadata-driven document controller fallback.
- Added metadata-derived list definitions and metadata permission service.
- Added generic workflow transition preview, safe print rendering and bounded CSV preview/apply.
- Added R2 file route contracts and a metadata-driven React Meta Desk.

## ERP core preview

- Added Journal Entry.
- Added Purchase Order, Purchase Receipt and Purchase Invoice.
- Extended Payment Entry for supplier payments.
- Added Material Receipt, Material Issue and Material Transfer Stock Entry.
- Added procurement progress, over-receipt/over-billing and cancellation guards.
- Added Accounts Payable, General Ledger and Trial Balance definitions.

## Verification

- 80/80 Node/domain tests.
- migrations 0001–0005 and migration dry run.
- SQL lifecycle, fixed-point, reference, procurement and outstanding guards.
- same-document and cross-aggregate race suites.
- strict core/worker source TypeScript.
- repository, secret and source parser verification.

## Maturity

This release is an **ERP Platform Alpha**. New v0.6 features are preview and are not Frappe/ERPNext parity or commercial GA claims. The O2C Limited-GA promotion boundary remains separately documented in `COMMERCIAL_COMPATIBILITY.md`.
