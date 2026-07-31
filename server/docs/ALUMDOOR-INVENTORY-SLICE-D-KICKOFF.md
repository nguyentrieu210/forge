# Alumdoor Inventory Slice D kickoff

Date: 2026-07-31

Branch: `feat/inventory-physical-stock-ui-reports-slice-d-20260731`.

Stack base: Manufacturing Slice C branch `feat/manufacturing-bom-workorder-slice-c-20260731`.

## Goal

Deliver operator-facing physical stock and manufacturing visibility without creating a second stock book.

## Architecture boundary

- Authoritative quantity and value remain in the append-only stock ledger.
- Canonical physical identity comes from Slice B snapshots.
- BOM and Work Order snapshot/progress semantics come from Slice C.
- Slice D is a read projection, API/report contract and UI only.
- The client must not calculate authoritative stock balances.

## First checkpoint

- `physical-stock-read-model.ts` groups ledger events by tenant, company, Item, warehouse, physical identity, batch and serial.
- Filters cover warehouse role, inventory mode/profile, colour, condition, generation, batch and serial.
- Every balance carries deterministic lineage to voucher, revision, row and reversal source.
- Pagination is deterministic and capped.
- Reconciliation verifies each balance against its lineage and page totals.
- Tenant/company scope is mandatory.

## Planned operator surfaces

1. Physical stock explorer.
2. Lineage and exact reversal drill-down.
3. Quarantine and quality-release view.
4. Work Order progress by immutable snapshot and BOM row.
5. WIP, shortage, planned-vs-actual variance and scrap/offcut reports.
6. Stock ageing and condition report.
7. Export contract with permission and data-scope enforcement.
8. Runtime browser harness and Playwright desktop/mobile coverage.

## Safety

- No migration or tenant mutation in the first checkpoint.
- No Cloudflare deployment.
- No production secret or DNS changes.
- FIFO remains disabled.
- No `.env`, `server/work/`, `tmp`, backup or generated evidence committed.
