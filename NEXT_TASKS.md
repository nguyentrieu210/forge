# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md` trước file này. Inventory Slice D foundation đã merge và các production target liên quan đã release thành công. Không mở thêm task release/observer cho đợt này nếu không có lỗi mới được chứng minh bằng log.

## Release vừa hoàn tất

- PR #82 merge: `a7e6ef65b2352f596e285ea34d8e6438dff11a95`.
- Workflow fix PR #130 merge: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Alumdoor app Worker run `30657418272`: SUCCESS, version `cbd99611-daf3-4190-b1e4-fc2b4ce74227`.
- Gateway run `30659230293`: SUCCESS, version `7a3c1130-4c7e-4089-96b9-9b6fcc7a2ca7`, exact-SHA smoke PASS.
- alu Tenant Worker run `30659229116`: SUCCESS, version `c5db02b4-eee9-4da8-8c3f-f5a346b2230c`, backup/migration/deploy/smoke PASS.
- FIFO vẫn disabled; không sửa DNS hoặc secret.

## P0 — Sales-to-Production clean rebuild

### Nguồn

- Tạo một branch duy nhất từ exact current default.
- PR #107 và #119 đã đóng; chỉ đọc hoặc trích từng file source/test đã review.
- Không cherry-pick workflow `*once*`, sync/transport commit, hidden trigger hoặc generated evidence.

### Phạm vi bắt buộc

- Sales Order Item mở rộng; compact vẫn giữ luồng nhập nhanh.
- Door policy có phiên bản và hỗ trợ `Cửa tấm liền Úc`.
- Snapshot số lá, cơ cấu lá AL70, kg dự toán, phút định mức và giải thích công thức.
- Production Request theo từng bộ/loại cửa.
- Work Order draft idempotent.
- Cut/Paint theo Batch thực tế có tình trạng `THÔ`.
- Delivery theo `sales_order_row_id`, fallback dữ liệu cũ có kiểm soát.
- Fail closed khi thiếu policy/BOM.

### Trình tự

1. Đọc lại `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `EPIC_STATUS.md` từ GitHub.
2. Lấy exact default head mới nhất và tạo branch canonical.
3. Mang source/test thật; final diff không có workflow vận chuyển tạm.
4. Chạy trước khi push:
   - server build;
   - `door-formulas.test.mjs`;
   - `sales-production-flow.test.mjs`;
   - `sales-price-unicode-normalization.test.mjs`;
   - client typecheck nếu sửa UI.
5. Push một lần và mở một PR canonical.
6. Khóa exact head trong lúc CI chạy.
7. Sửa direct cause từ log trên cùng branch; không mở PR thay thế.
8. Merge khi full CI, Sales focused gate và UI gate liên quan đều xanh.
9. Chỉ release production nếu thay đổi thuộc target app/Gateway/tenant và dedicated workflow đủ backup/smoke tương ứng.

### Done condition

- Code nghiệp vụ thật có trên default.
- Exact-head checks xanh.
- Authenticated operator journey tối thiểu PASS.
- Final diff không có file vận chuyển tạm.
- Release evidence tồn tại nếu production target thay đổi.

## P1 — Purchase authenticated QA clean rebuild

- Không reopen PR #103.
- Dựng branch mới từ default sau Sales merge.
- Chỉ mang các file QA đã review từ branch cũ.
- Chạy focused Purchase tests trước push.
- Desktop Chrome và Pixel 7 lifecycle phải PASS.
- FIFO vẫn disabled.

## P2 — Finance

- PR #15 chỉ dùng tham khảo.
- Dựng lại từ current default.
- Bao gồm AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Migration/backfill append-only, có checksum, dry-run, rollback và staging/production-shaped evidence.

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
- Không thay head khi exact-head CI đang chạy.
- Không workflow `*once*`, transport/sync workflow hoặc hidden trigger.
- Một full CI chịu trách nhiệm test/typecheck/build.
- Feature/UI workflow chỉ chạy đúng scope.
- Release chỉ từ exact merged SHA qua dedicated production workflow.

## Destructive boundary

Cần lệnh riêng trước khi:

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
