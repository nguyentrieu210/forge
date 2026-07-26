# CloudForge v0.8.0 — ERPNext Core Preview

## Stock valuation and traceability

- Added FIFO and Moving Average issue valuation derived from server stock-ledger history.
- Exact FIFO layer values are consumed; rounded display valuation rates do not become the accounting source of truth.
- Stable business-time ordering preserves submit-before-cancel insertion order for equal timestamps.
- Added Repost Item Valuation preview with zero-quantity stock-value adjustment and balanced valuation-difference GL.
- Added Serial and Batch Bundle controllers and commit-time projections.
- Bundle usage is reversible on voucher cancellation; serial state is constrained to zero/one and batch quantity cannot become negative.

## Returns, pricing and accounting

- Added Credit Note, Debit Note and Stock Return previews.
- Return quantities are cumulatively bounded by the submitted source document.
- Stock Return validates source party, company, currency, item and warehouse context.
- Added server-authoritative Item Price and bounded Pricing Rule selection for selling and buying.
- Added static role permissions and accounting-period lock enforcement to every new posting controller.

## Manufacturing

- Added Bill of Materials and Work Order controllers.
- Manufacture Stock Entry consumes raw materials using server-derived valuation and creates finished stock from exact material value plus proportional operating cost.
- Commit-time projections prevent overproduction and material overconsumption.
- Work Order progress and status are re-derived on reads.

## Assets

- Added Asset and Asset Depreciation Entry previews.
- Supports straight-line, written-down-value, double-declining and controlled manual amount subsets.
- Depreciation entries post balanced GL and cannot exceed depreciable value.
- Asset accumulated depreciation and net book value are re-derived from committed entries.

## Reports and metadata

- Added Stock Ledger, Batch Stock Balance, Serial Number Status, Work Order Progress and Asset Depreciation Ledger reports.
- Provisioned metadata for new stock, return, pricing, manufacturing and asset documents.
- Added foundation metadata for Project, Task, Timesheet, Quality Inspection, Issue and POS Profile; these are not complete domain modules.

## Verification

- 97 Node/domain tests.
- Tenant migrations 0001–0007.
- Direct SQL attempts against serial, batch, bundle, return, manufacturing and depreciation guards.
- Existing SQL migration/race, Frappe Core permission and hardened O2C regressions remain green.

## Non-claims

- Repost is not complete ERPNext repost orchestration or downstream COGS replay.
- Manufacturing does not yet include Production Plan, Job Card, routing, operations or capacity planning.
- Assets do not yet include capitalization integration, movement, maintenance, sale or disposal.
- Projects, Quality, Support and POS are foundation-only.
- Full ERPNext and arbitrary Frappe-app compatibility are not claimed.
