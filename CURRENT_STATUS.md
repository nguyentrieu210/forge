# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head tại lần sync gần nhất: `51f462c7e76dd2c669c5721bcd625fdb1453a008`.
- Working branch: `feat/inventory-physical-stock-slice-b-20260731`.
- PR `#49` — Inventory Slice B.
- Sync merge commit: `2f31b2dc74c6f44ca119bb9a53fe7bc13cae844d`.

## Inventory Slice B

### Đã triển khai

- Physical identity server-authoritative cho hàng thường và hàng có kích thước.
- Inventory mode/profile, màu, tình trạng, đời, dimensions và physical count snapshot.
- Batch/serial/Aluminium Lot lineage và exact bundle quantity/direction.
- Warehouse roles cho receipt, transfer, issue/manufacture, quarantine và scrap/offcut recovery.
- Exact cancellation/reversal từ append-only ledger rows.
- Company-wide Durable Object coordination cho Stock Entry và Work Order submit/cancel.
- Không thêm migration hoặc stock ledger thứ hai.

### Files chính

- `server/packages/clouderp-erpnext/src/physical-stock-entry.ts`.
- `server/apps/tenant-worker/src/inventory-coordinator.ts`.
- `server/apps/tenant-worker/src/aggregate-do.ts`.
- `server/tests/alumdoor-physical-stock.test.mjs`.
- `server/tests/alumdoor-physical-stock-concurrency.test.mjs`.
- `server/tests/inventory-coordinator.test.mjs`.

### Review và validation

- Review score: **97/100**.
- Critical: **0**.
- High: **0**.
- Head trước sync `423af47b7e2bfb31c160934aa241716511449107` có toàn bộ required workflows PASS.
- Sau default tiến thêm 10 commit, branch đã được dựng lại trên current default bằng merge commit `2f31b2dc74c6f44ca119bb9a53fe7bc13cae844d`.
- Exact-head CI sau sync/handoff là merge gate hiện tại.

## Stack

- PR `#50` Manufacturing Slice C: stack trên Slice B, required CI từng PASS trên head `df708fb13ae1a1e0538e8260a24a0251b0dff347`; cần retarget và CI lại sau #49.
- PR `#82` Inventory Slice D: stack trên Slice C, head gần nhất `fbbd39568fb50c179659147ef800ae14e3e12dd9`; cần retarget sau #50.

## Default production/release evidence được bảo toàn

- Sales Unicode Item Price merge: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Sales release preparation merge: `077d9944b1cfc1f436da87472f070ee2bd864b44`; chưa coi là production execution evidence.
- Production observation run `30648098602`: endpoint checks PASS; reporting comment permission từng lỗi `403`.
- Purchase/FIFO checksum lock merge: `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- FIFO rollout: **disabled**.

## Safety

- Không deploy Cloudflare trong chuỗi merge này.
- Không migration, backup, backfill hoặc mutate tenant.
- Không sửa production secrets hoặc DNS.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated artifacts.
