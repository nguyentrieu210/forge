# Alumdoor Manufacturing Slice C review

Date: 2026-07-31

Scope: versioned BOM, immutable Work Order snapshot, production progress, offcut/scrap accounting, concurrency and legacy rollout.

Depends on: Inventory Slice B physical identity and company-wide inventory coordination.

## Result

- Score: **97/100**.
- Critical findings: **0**.
- High findings: **0** after remediation.
- Merge quality threshold `>=95`: **PASS**.

## Score

| Area | Score | Evidence |
|---|---:|---|
| BOM revision and snapshot correctness | 25/25 | Positive revision, Draft/Active/Retired status, effective interval, output/row UOM conversion, quantity-basis semantics, deterministic SHA-256 checksum, overlap and circular dependency guards, effective revision selection and immutable Work Order snapshot. |
| Production progress, value and reversal | 24/25 | BOM-row attribution, issue/consumption/scrap/offcut kinds on canonical rows, split-line caps, output stock-UOM guard, offcut value retained once, finished value rebalanced, and exact cancel. One point remains for dedicated WIP/variance report surfaces owned by Slice D. |
| Atomicity and concurrency | 20/20 | Stock/document/manufacturing entries remain in one MutationPlan/D1 batch. Stock Entry and Work Order submit/cancel share the Slice B company inventory coordinator, preventing cross-voucher over-consumption and over-production races. |
| Compatibility and rollout | 10/10 | Submitted pre-Slice-C Work Orders without snapshot continue through the legacy physical-stock path and cancel exactly. New Work Orders use snapshot/checksum guards without requiring a tenant backfill or schema rewrite. |
| Tests and repository gates | 14/15 | Effective revision, quantity basis, overlap, circular BOM, immutable snapshot, split-line cap, offcut value, cancellation, concurrency, issue line keys, output UOM and legacy rollout are covered. One point remains for staging Browser QA of the full operator manufacturing journey. |
| Performance and observability | 4/5 | Deterministic checksums and stable BOM-row IDs support audit and reporting. Submitted-document scans are tenant/doctype scoped but a dedicated indexed production read model and load benchmark remain future optimizations. |

## Findings remediated during review

1. **Critical:** differently named manufacturing Stock Entries could race under document-key Durable Objects and both pass Work Order/stock limits.
   - Fixed by inheriting Slice B company-wide inventory coordination for Stock Entry and Work Order submit/cancel.
2. **High:** split lines in one voucher could each pass a BOM-row cap while their combined quantity exceeded the snapshot.
   - Fixed with an aggregate pending-quantity guard by BOM row and progress bucket.
3. **High:** offcut/scrap value could remain in the recovered warehouse and also be included in finished-good valuation.
   - Fixed by subtracting recovered value from finished output while preserving total stock value.
4. **High:** a new lifecycle controller rejected every submitted legacy Work Order that lacked a historical snapshot/checksum.
   - Fixed with an explicit rollout controller that routes legacy Work Orders through the pre-Slice-C physical-stock plan.
5. **High:** finished Work Order output could compare transaction quantity against a non-stock BOM output UOM.
   - Fixed by normalizing the snapshot and required output into stock UOM.
6. **Medium:** repeated issue line keys could collide across BOM rows or vouchers.
   - Fixed with stable BOM-row-aware line identities and regression coverage.

## Architecture decision

No new manufacturing migration is required for this slice. BOM revision/checksum and Work Order snapshots are stored in canonical document JSON. Quantity/value movements continue in the existing append-only stock and manufacturing projections. This is forward compatible with a later indexed read model without creating a second source of truth.

The former Work Order-only coordinator was removed after Slice B introduced the stronger company-wide inventory coordinator. One lock now covers physical stock, Work Order submit/cancel and all manufacturing Stock Entries for that company, avoiding nested or competing lock schemes.

## Remaining release gates

These do not block stacked code review, but block production rollout and Slice D completion:

1. Merge Slice B before retargeting Slice C to default.
2. Read-only live Item/BOM audit and remediation plan.
3. Staging journey: activate revision, release Work Order, partial issue, partial manufacture, offcut/scrap, cancel and reports.
4. Operator UI and WIP/shortage/variance/offcut reports in Slice D.
5. Production load/latency observation for company-wide inventory coordination.
6. Separate explicit deployment approval.

## Safety

- No tenant migration or mutation was performed.
- No Cloudflare deployment or production secret change was performed.
- FIFO remains disabled.
- No `.env`, `server/work/`, `tmp/`, backup or generated report was committed.
