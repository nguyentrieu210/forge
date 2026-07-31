# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md` trước file này. Không tự mở thêm epic nghiệp vụ khi CI cleanup chưa merge.

## P0 — Merge CI cleanup

Branch: `ci/stop-duplicate-builds-20260801`.

### Việc làm

1. Mở một PR duy nhất từ branch này vào `hotfix/alumdoor-print-list-delete`.
2. Khóa head; không amend, force-push hoặc thêm workflow one-shot khi checks đang chạy.
3. Xác minh:
   - `CI` chạy full đúng một lần cho thay đổi workflow;
   - `PR Validation` chỉ chạy policy gate;
   - Sales/Purchase/Inventory/UI nhận đúng scope;
   - production observation không xuất hiện trên PR;
   - không có release/deploy job trong CI hoặc PR Validation.
4. Review final diff:
   - không application source;
   - không secret/DNS/migration;
   - xóa one-shot workflow và hidden trigger;
   - bốn file handoff được cập nhật.
5. Merge khi exact-head required checks xanh.
6. Sau merge kiểm default head và ghi merge SHA.

### Done condition

- Không còn duplicate full build trong `CI` và `PR Validation`.
- Push feature branch không tạo thêm một `CI` push run ngoài PR run.
- Unrelated feature checks PASS nhanh mà không cài dependencies.
- Production observation không chạy trên PR.
- Dedicated release workflows vẫn tồn tại nhưng không bị gọi trong đợt này.

## P1 — Sales-to-Production clean rebuild

Chỉ bắt đầu sau khi P0 merge.

1. Tạo một branch từ exact current default.
2. Lấy source/test có giá trị từ branch cũ; không lấy workflow/trigger tạm.
3. Final diff phải có nghiệp vụ thật:
   - Sales Order Item mở rộng;
   - door policy versioned;
   - Production Request theo từng bộ;
   - Work Order draft idempotent;
   - Cut/Paint theo Batch `THÔ`;
   - Delivery theo `sales_order_row_id`;
   - fail closed khi thiếu policy/BOM.
4. Chạy focused local tests trước push:
   - `door-formulas.test.mjs`;
   - `sales-production-flow.test.mjs`;
   - `sales-price-unicode-normalization.test.mjs`.
5. Push một lần, khóa head, đọc log nếu fail và sửa trực tiếp.
6. Chỉ merge khi full CI + Sales focused gate + UI gate liên quan đều xanh.

## P2 — Purchase authenticated QA clean rebuild

- PR #103 không được reopen.
- Dựng branch mới từ default sau Sales merge.
- Chỉ mang 13 file QA đã review từ branch cũ.
- Focused tests trước full CI.
- Desktop Chrome và Pixel 7 lifecycle phải PASS.
- FIFO vẫn disabled.

## P3 — Finance

- PR #15 chỉ dùng tham khảo.
- Dựng lại từ current default.
- Bao gồm AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Migration/backfill append-only, có checksum, dry-run, rollback và staging evidence.

## P4 — Daily ledger

- Immutable daily snapshot.
- Khóa sửa sau đóng ngày.
- Adjustment document có reason, actor và audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.

## P5 — Warranty / Capacity

- Bốn nguyên nhân lỗi/bảo hành và accounting effect.
- Capacity theo workstation, thời gian định mức, overtime, WIP và overload policy.

## P6 — End-to-end acceptance

Sales Order → production → inventory → delivery → debt → daily ledger → adjustment → warranty.

## Quy tắc CI bắt buộc

- Một epic, một branch, một PR.
- Không push khi exact-head CI đang chạy.
- Không workflow `*once*`, transport/sync workflow hoặc hidden trigger.
- Focused test trước, full CI sau.
- Một full CI chịu trách nhiệm test/typecheck/build.
- Release chỉ từ exact merged SHA qua dedicated release workflow.

## Destructive boundary

Cần lệnh riêng trước khi:

- deploy Cloudflare production;
- sửa production secret hoặc DNS;
- xóa Cloudflare resource;
- chạy migration không có backup/recovery;
- bật FIFO production;
- mutate dữ liệu khách hàng ngoài smoke an toàn.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- generated evidence;
- credential, cookie hoặc token.
