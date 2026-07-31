# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md`, `CURRENT_STATUS.md`, `DELIVERY_POLICY.md` và `AI_HANDOFF.md` trước khi tiếp tục.

## P0 — Hoàn tất Sales-to-Production PR #131

### Trạng thái hiện tại

- PR: #131 — `feat(sales): rebuild order to production flow`.
- Branch: `feat/sales-order-production-flow-clean-20260801`.
- Exact code head đã kiểm: `c38141dedabccafd0a3fc7c4346e96cf87a496f8`.
- Zero-behind tại thời điểm kiểm.
- Full CI, PR policy, Sales, Purchase, Inventory và UI/browser gates: PASS.
- Duplicate-list guard đã đóng cả outage trước preflight lẫn outage phát sinh sau preflight, trước write.
- PR vẫn draft; chưa merge và chưa release.

### Việc tiếp theo

1. Xác nhận branch vẫn zero-behind và exact final head chỉ thêm cập nhật tài liệu sau code head đã kiểm.
2. Review final diff, tập trung vào:
   - Production Request theo từng bộ;
   - Work Order draft idempotent;
   - Paint Job theo Batch;
   - delivery lineage bằng `sales_order_row_id`;
   - bảng Sales mở rộng và `depends_on`;
   - fail-closed khi duplicate-list lỗi trước hoặc sau preflight.
3. Giữ PR draft cho tới khi final review không còn finding Critical/High.
4. Chỉ merge khi có lệnh riêng; dùng expected exact head SHA.
5. Sau merge, chạy authenticated operator journey tối thiểu:
   - tạo Sales Order có nhiều bộ;
   - sinh Production Request/Work Order đúng số bộ;
   - lặp lại thao tác không tạo trùng;
   - Cut/Paint theo Batch và trạng thái `THÔ`;
   - Delivery giữ đúng lineage dòng bán.
6. Chỉ release production khi có lệnh riêng và dedicated workflow có build, migration/backup nếu cần, deploy, smoke và provider evidence.

### Done condition

- Code có trên default.
- Exact merged SHA có CI xanh.
- Authenticated operator journey PASS.
- Không có workflow tạm hoặc generated artifact trong diff.
- Có release evidence nếu production target được thay đổi.

## P1 — Purchase authenticated QA clean rebuild

Bắt đầu sau khi Sales-to-Production merge ổn định:

- tạo branch mới từ exact current default;
- không reopen PR #103;
- chỉ mang source/test QA đã review;
- chạy focused Purchase tests trước push;
- Desktop Chrome và Pixel 7 lifecycle phải PASS;
- FIFO vẫn disabled.

## P2 — Finance

- PR #15 chỉ dùng tham khảo.
- Dựng lại từ current default.
- Bao gồm AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Migration/backfill append-only, có checksum, dry-run, rollback và production-shaped evidence.

## P3 — Daily ledger

- Immutable daily snapshot theo ngày/company/warehouse/customer/order.
- Khóa sửa sau đóng ngày.
- Adjustment document có reason, actor và audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.

## P4 — Warranty / Capacity

- Bốn nguyên nhân lỗi/bảo hành và accounting effect.
- Capacity theo workstation, thời gian định mức, overtime, WIP và overload policy.

## P5 — End-to-end acceptance

Sales Order → production → inventory → delivery → debt → daily ledger → adjustment → warranty.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không workflow dùng một lần, transport/sync workflow hoặc hidden trigger.
- Full CI chịu trách nhiệm test/typecheck/build.
- Feature/UI workflow chỉ chạy đúng scope.
- Release chỉ từ exact merged SHA qua dedicated production workflow.
- Không sửa production secret/DNS, xóa Cloudflare resource, bật FIFO hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- generated evidence;
- cookie hoặc token.
