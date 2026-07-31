# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-physical-stock-slice-b-20260731`.
- Pull request: `#49` — `feat(inventory): canonical physical stock identity and warehouse roles`.
- Authoritative Alumdoor metadata: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.

## Mục tiêu nhánh

Slice B hoàn thiện nền tồn kho vật lý:

1. Server-built physical identity cho Item theo inventory mode/profile, màu, tình trạng, đời, kích thước và physical count.
2. Batch/serial/Aluminium Lot lineage và kiểm bundle quantity/direction.
3. Warehouse-role rules cho receipt, transfer, issue/manufacture, quarantine và scrap/offcut recovery.
4. Exact cancellation từ ledger gốc.
5. Company-wide Durable Object coordination cho Stock Entry và Work Order submit/cancel.
6. Regression tests và review score `>=95`.

Không nằm trong nhánh này: manufacturing lifecycle Slice C, physical-stock UI/report/read model Slice D, live data remediation hoặc production deployment.

## Implementation chính

- `server/packages/clouderp-erpnext/src/physical-stock-entry.ts`.
- `server/apps/tenant-worker/src/inventory-coordinator.ts`.
- `server/apps/tenant-worker/src/aggregate-do.ts`.
- `server/packages/clouderp-erpnext/src/registry.ts`.
- `server/packages/clouderp-erpnext/src/index.ts`.

## Tests

- `server/tests/alumdoor-physical-stock.test.mjs`.
- `server/tests/alumdoor-physical-stock-concurrency.test.mjs`.
- `server/tests/inventory-coordinator.test.mjs`.

## Review

- Review: `server/docs/ALUMDOOR-INVENTORY-SLICE-B-REVIEW.md`.
- Score: **97/100**.
- Critical: **0**.
- High: **0** sau remediation.

## Git hiện tại

- Default SHA lúc đồng bộ: `4cbcd2a3a8f742da7dd1b7e0c5b29899af4cfce0`.
- Branch cũ từng ahead `25`, behind `12` và diverged.
- Sync merge commit: `59c364a1b8443713921efad84b710b07ce9823a9`.
- PR `#49` sau sync: conflict-free, `mergeable=true`, vẫn draft.
- Stale branch copies của `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` không được phép ghi đè trạng thái production mới từ default.

## CI

Trên code head `59c364a1b8443713921efad84b710b07ce9823a9`:

- PR Validation `30644981424`: PASS.
- Sales Feature CI `30644945918`: PASS.
- Inventory and Manufacturing CI `30644945877`: PASS.
- CI `30644945928`: PASS.
- Purchase Feature CI `30644945921`: PASS.
- UI Pull Request Validation `30644945919`: đang chạy browser/auth gates tại thời điểm cập nhật.

Commit tài liệu này tạo exact final head mới; phải dùng CI của final head, không dùng các run cũ làm merge evidence.

## Việc tiếp theo

1. Kiểm exact final head sau các commit tài liệu.
2. Chờ toàn bộ required workflows PASS trên exact final head.
3. Cập nhật PR body với final SHA và CI run IDs.
4. Chuyển PR khỏi draft khi mergeable, review threads sạch và CI xanh.
5. Không merge PR #49 nếu chưa có yêu cầu merge rõ ràng.
6. Sau merge mới retarget/rebase Slice C và tiếp tục Slice D.

## Release gates còn lại

- Read-only live tenant catalog audit và remediation plan.
- Staging receive/transfer/issue/quarantine/scrap/cancel journeys.
- Production load/latency observation cho company-wide inventory lock.
- Physical-stock UI/report/read model trong Slice D.
- Explicit deployment approval riêng.

## Safety

- Không Cloudflare deployment.
- Không tenant migration hoặc mutation.
- Không sửa production secrets/DNS.
- FIFO vẫn disabled.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.
