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
- Exact final head sau cập nhật handoff/status/tasks: `a1ba0500ec638bb10d25d9a1c6fd860fd567fe34`.
- PR `#49`: conflict-free, `mergeable=true`, vẫn draft.

## CI

Code head `59c364a1b8443713921efad84b710b07ce9823a9` đã PASS PR Validation, CI, Inventory and Manufacturing, Purchase và Sales; UI run cũ đang chạy khi tài liệu được cập nhật.

Exact final head `a1ba0500ec638bb10d25d9a1c6fd860fd567fe34` đã kích hoạt lại required workflows:

- PR Validation `30645267314`.
- UI Pull Request Validation `30645267303`.
- CI `30645267108`.
- Sales Feature CI `30645267226`.
- Inventory and Manufacturing CI `30645267301`.
- Purchase Feature CI `30645267263`.

Các run này đang queued/pending tại thời điểm cập nhật. Chỉ kết quả trên exact final head mới là merge evidence.

## Việc tiếp theo

1. Chờ toàn bộ required workflows PASS trên exact final head.
2. Cập nhật PR body với kết quả cuối.
3. Kiểm unresolved review threads.
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
