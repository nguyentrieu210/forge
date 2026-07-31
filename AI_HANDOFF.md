# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Authoritative Alumdoor metadata: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup hoặc generated artifacts.

## Baseline đã merge

- Item/catalog Slice A: PR `#27`, merge commit `7af5f96a4a6bc756eb2c46511db17a609a49fdc5`.
- RBAC Slice B: PR `#45`, merge commit `4341091b8a8dc0cea3de96510c34dc68a8b00ecb`.
- Purchase/FIFO feature: PR `#14`, merge commit `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Default hiện có migrations `0030_purchase_unapplied_weight_attribution.sql` và `0031_purchase_allocation_control_metadata.sql`.
- FIFO production vẫn **disabled**.

## Slice B — Physical inventory

- Branch: `feat/inventory-physical-stock-slice-b-20260731`.
- PR: `#49`, draft cho tới khi exact-final-head gates và sync default hoàn tất.
- Review: `server/docs/ALUMDOOR-INVENTORY-SLICE-B-REVIEW.md`.
- Score: **97/100**; Critical `0`; High `0` sau remediation.

### Implementation

- `server/packages/clouderp-erpnext/src/physical-stock-entry.ts`
  - server-built physical identity snapshot;
  - inventory mode/profile, colour, condition, generation, dimensions và physical count;
  - batch/serial/Aluminium Lot lineage;
  - warehouse roles `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `QUARANTINE`, `SCRAP_OFFCUT`, `GENERAL`;
  - quarantine release và scrap recovery evidence;
  - exact bundle quantity/direction/warehouse checks;
  - row colour/length phải khớp physical lot;
  - stock ledger batch balance là location authority, không dùng stale `Aluminium Lot.warehouse` để chặn transfer sau.
- `server/apps/tenant-worker/src/inventory-coordinator.ts`
  - mọi Stock Entry và Work Order submit/cancel trong cùng company dùng key `inventory:<tenant>:<company>`;
  - chặn race giữa các voucher khác tên cùng vét batch/warehouse hoặc Work Order limit.
- `server/apps/tenant-worker/src/aggregate-do.ts`
  - giữ purchase coordinator hiện hành;
  - thêm inventory coordinator, không thêm binding hoặc secret.
- Existing append-only `stock_ledger_entries` vẫn là sổ quantity/value duy nhất. Identity bất biến nằm trên canonical Stock Entry rows, không tạo một ledger thứ hai dễ drift.

### Tests

- `server/tests/alumdoor-physical-stock.test.mjs`.
- `server/tests/alumdoor-physical-stock-concurrency.test.mjs`.
- `server/tests/inventory-coordinator.test.mjs`.
- Cover identity, roles, missing lineage, quarantine, transfer, second transfer, exact cancel, lot mismatch, concurrent issue và coordinator routing.

## Slice C — Manufacturing lifecycle

- Branch: `feat/manufacturing-bom-workorder-slice-c-20260731`.
- PR: `#50`, stacked trên PR `#49` cho tới khi Slice B merge.
- Review: `server/docs/ALUMDOOR-MANUFACTURING-SLICE-C-REVIEW.md`.
- Score: **97/100**; Critical `0`; High `0` sau remediation.

### Implementation

- `server/packages/clouderp-erpnext/src/manufacturing-lifecycle.ts`
  - BOM revision, Draft/Active/Retired, effective interval;
  - output/row UOM conversion và quantity basis;
  - overlap, duplicate revision, self-consumption và circular dependency guards;
  - deterministic SHA-256 BOM checksum;
  - effective revision selection và immutable Work Order snapshot;
  - BOM-row issue/consumption/scrap/offcut attribution.
- `server/packages/clouderp-erpnext/src/manufacturing-stock-guard.ts`
  - split-line and prior-progress cap by BOM row;
  - offcut/scrap value retained exactly once;
  - finished-good valuation rebalanced;
  - exact cancellation from original ledger rows.
- `server/packages/clouderp-erpnext/src/manufacturing-work-order-guard.ts`
  - Work Order output normalized and checked in stock UOM.
- `server/packages/clouderp-erpnext/src/manufacturing-rollout.ts`
  - legacy submitted Work Orders without historical snapshot/checksum continue through the legacy physical-stock path;
  - new Work Orders use snapshot/checksum/BOM-row guards.
- Slice C inherits the company-wide inventory coordinator from Slice B. The former Work Order-only coordinator is removed to avoid nested/competing locks.
- No manufacturing migration is required. BOM/checksum/snapshot stay in canonical document JSON; stock/manufacturing projections remain append-only.

### Tests

- `server/tests/alumdoor-manufacturing-lifecycle.test.mjs`.
- `server/tests/manufacturing-issue-line-key.test.mjs`.
- `server/tests/manufacturing-output-uom.test.mjs`.
- `server/tests/manufacturing-legacy-rollout.test.mjs`.
- Cover effective revision, quantity basis, overlap/circular BOM, immutable snapshot, split-line caps, offcut value, cancellation, concurrency, issue identity, stock UOM và legacy rollout.

## Gate policy

Before either PR is marked ready:

1. Sync against current base; behind must be `0`.
2. Exact current head must pass:
   - `PR Validation`;
   - `Inventory and Manufacturing CI`;
   - `CI` where triggered;
   - `UI Pull Request Validation` including browser QA and cookie-auth smoke.
3. Confirm mergeable and no unresolved review thread.
4. Update PR body with exact head/run/job IDs.
5. PR `#49` merges before PR `#50`; retarget/rebase `#50` only after B merge.
6. Do not merge or deploy without a separate explicit user instruction.

## Post-merge/release gates

- Run read-only redacted live Item/BOM audit and prepare remediation plan.
- Stage receive, transfer, issue, quarantine release, Work Order revision, partial issue/manufacture, offcut/scrap and cancel.
- Slice D owns physical-stock/WIP/shortage/variance/offcut reports and operator UI.
- Observe latency/load of company-wide inventory coordination before production rollout.
- Production deployment requires backup, rollback plan and explicit approval.

## Safety

- No tenant migration or mutation was performed by Slice B/C implementation.
- No Cloudflare deployment or production secret change was performed.
- FIFO remains disabled.
