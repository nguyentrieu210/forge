# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-physical-stock-slice-b-20260731`.
- Pull request: `#49` — `feat(inventory): canonical physical stock identity and warehouse roles`.
- GitHub là nguồn sự thật cho code, CI và trạng thái dự án.

## Mục tiêu hiện tại

Hoàn tất Inventory Slice B: canonical physical identity, warehouse roles, lineage, exact reversal và cross-voucher stock concurrency.

## Implementation

- `server/packages/clouderp-erpnext/src/physical-stock-entry.ts`.
- `server/apps/tenant-worker/src/inventory-coordinator.ts`.
- `server/apps/tenant-worker/src/aggregate-do.ts`.
- Registry/export trong `server/packages/clouderp-erpnext/src/`.
- Focused tests:
  - `server/tests/alumdoor-physical-stock.test.mjs`;
  - `server/tests/alumdoor-physical-stock-concurrency.test.mjs`;
  - `server/tests/inventory-coordinator.test.mjs`.
- Review: `server/docs/ALUMDOOR-INVENTORY-SLICE-B-REVIEW.md`, score **97/100**, Critical **0**, High **0**.

## Git hiện tại

- Default mới nhất đã merge PR #75 tại `f0768d59ff66d04c333fd290c120f7672a80ea96`.
- Nhánh kho đã đồng bộ bằng merge commit `47acf088135cb770dc30d021b5a45a9fcdca3c21`.
- Khi đồng bộ, default được giữ làm nền; chỉ code/test/docs riêng của Slice B được phủ lại.
- Không cho bản handoff Purchase trên default ghi đè mục tiêu nhánh kho.

## Việc tiếp theo

1. Lấy exact final head sau commit tài liệu.
2. Kiểm PR #49 mergeable và unresolved review threads.
3. Chờ đủ sáu workflow PASS trên exact final head.
4. Cập nhật PR body và chuyển khỏi draft khi sạch.
5. Không merge PR #49 nếu chưa có yêu cầu merge rõ ràng.
6. Sau merge mới retarget/rebase Slice C và bắt đầu Slice D UI/report/read model.

## Release gates còn lại

- Read-only live tenant catalog audit và remediation plan.
- Staging receive/transfer/issue/quarantine/scrap/cancel journeys.
- Production load/latency observation cho company-wide inventory lock.
- Physical-stock UI/report/read model trong Slice D.
- Explicit deployment approval riêng.

## Safety

- Không deploy Cloudflare.
- Không mutate tenant hoặc production data.
- Không sửa production secrets/DNS.
- FIFO vẫn disabled.
- Không commit `.env`, `server/work/`, `tmp/`, backup hoặc generated evidence.
