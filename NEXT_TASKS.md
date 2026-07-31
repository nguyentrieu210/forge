# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md` trước file này. CI cleanup PR #127 đã merge; không tạo thêm platform cleanup trừ khi có lỗi cụ thể từ scoped CI mới.

## P0 — Sales-to-Production clean rebuild

### Nguồn

- Tạo một branch duy nhất từ exact current default.
- PR #107 và #119 đã đóng; chỉ đọc hoặc trích từng file đã review.
- Không cherry-pick workflow/trigger/transport commit.

### Phạm vi bắt buộc

- Sales Order Item mở rộng, compact vẫn giữ luồng nhập nhanh.
- Door policy có phiên bản và hỗ trợ `Cửa tấm liền Úc`.
- Snapshot số lá, cơ cấu lá AL70, kg dự toán, phút định mức và giải thích công thức.
- Production Request theo từng bộ/loại cửa.
- Work Order draft idempotent.
- Cut/Paint theo Batch thực tế có tình trạng `THÔ`.
- Delivery theo `sales_order_row_id`, fallback dữ liệu cũ có kiểm soát.
- Fail closed khi thiếu policy/BOM.

### Trình tự

1. Tạo branch từ exact default và ghi base SHA.
2. Mang source/test thật; final diff không có workflow `*once*`, sync/transport hoặc hidden trigger.
3. Chạy trước khi push:
   - server build;
   - `door-formulas.test.mjs`;
   - `sales-production-flow.test.mjs`;
   - `sales-price-unicode-normalization.test.mjs`;
   - client typecheck nếu sửa UI.
4. Push một lần và mở một PR canonical.
5. Khóa exact head trong lúc CI chạy.
6. Chỉ sửa lại khi có log lỗi cụ thể; không tạo PR thay thế.
7. Merge khi full CI, Sales focused gate và UI gate liên quan đều xanh.
8. Ghi exact merge SHA và release status; không deploy nếu chưa có phạm vi/lệnh release rõ.

### Done condition

- Code nghiệp vụ thật có trên default.
- Exact-head checks xanh.
- Authenticated operator journey tối thiểu PASS.
- Final diff không có file vận chuyển tạm.

## P1 — Purchase authenticated QA clean rebuild

- Không reopen PR #103.
- Dựng branch mới từ default sau Sales merge.
- Chỉ mang 13 file QA đã review từ branch cũ.
- Chạy focused Purchase tests trước push.
- Desktop Chrome và Pixel 7 lifecycle phải PASS.
- FIFO vẫn disabled.

## P2 — Finance

- PR #15 chỉ dùng tham khảo.
- Dựng lại từ current default.
- Bao gồm AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Migration/backfill append-only, có checksum, dry-run, rollback và staging evidence.

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

## Quy tắc CI bắt buộc

- Một epic, một branch, một PR.
- Focused test trước khi push.
- Không push khi exact-head CI đang chạy.
- Không workflow `*once*`, transport/sync workflow hoặc hidden trigger.
- Một full CI chịu trách nhiệm test/typecheck/build.
- Feature/UI workflow chỉ chạy đúng scope.
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
