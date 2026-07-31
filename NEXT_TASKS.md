# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md` trước file này. Không tự mở lại #103, #107 hoặc #119.

## P0 — Sales-to-Production clean rebuild

### Nguồn tham khảo

- PR #119 branch `feat/sales-order-production-flow-final-20260801` giữ code/test tham khảo.
- Không reopen hoặc merge nguyên PR #119.
- Không dùng #107 hoặc workflow transport từ #115.

### Việc làm bắt buộc

1. Lấy current default head mới nhất.
2. Tạo đúng một branch mới từ current default.
3. Mang từng file code/test semantic từ #119 sang branch mới.
4. Không mang:
   - `.github/workflows/sync-sales-production-clean-once.yml`;
   - `.github/workflows/fix-sales-production-tests-once.yml`;
   - `.sync-sales-production-trigger`;
   - `.fix-sales-production-tests-trigger`;
   - payload hoặc generated artifact.
5. Giữ thay đổi brief ở mức semantic, không reformat toàn bộ hai file JSON.
6. Chốt brief version. Nếu `2.0.35` là version đúng, cập nhật các test contract đang khóa `2.0.34`; nếu không, trả brief về `2.0.34`.
7. Cập nhật assertion permission để phản ánh `Production Request` mới mà không làm lỏng các quyền khác.
8. Chạy theo thứ tự, dừng ngay khi lỗi:
   - `server/tests/alumdoor-catalog-audit.test.mjs`;
   - `server/tests/alumdoor-item-model.test.mjs`;
   - `server/tests/door-formulas.test.mjs`;
   - `server/tests/sales-production-flow.test.mjs`;
   - `server/tests/sales-price-unicode-normalization.test.mjs`;
   - server build;
   - client typecheck;
   - full server unit tests;
   - `git diff --check`.
9. Review final filenames; không được còn file one-shot.
10. Chốt exact head và không push thêm trong khi CI chạy.
11. Mở một PR canonical, cập nhật body đúng exact head.
12. Chạy full required CI đúng một lượt.
13. Chỉ sửa/push lại khi có lỗi cụ thể từ lượt CI đó.

### Done condition

- Final diff chỉ có code, test và metadata semantic cần thiết.
- 697+ server unit tests pass.
- Required CI xanh trên một exact head đứng yên.
- Mergeable, không stale/conflict, không review blocker.
- Code nghiệp vụ thật được merge vào default.

## P1 — Purchase authenticated QA clean rebuild

Chỉ bắt đầu sau khi Sales-to-Production merge hoặc đạt exact-head green ổn định.

1. Lấy current default mới nhất.
2. Tạo branch mới.
3. Trích đúng các file QA cần thiết từ #103.
4. Không merge lịch sử cũ vì #103 từng behind default 112 commit và mergeable=false.
5. Chạy focused Purchase lifecycle trước.
6. Chạy Desktop Chrome và Pixel 7.
7. Chốt head rồi chạy một lượt full CI.
8. Merge khi exact-head xanh và final diff sạch.

## P2 — Finance

- Dựng lại từ default; #15 chỉ là nguồn tham khảo.
- Hoàn thiện due date, AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Không mở nhánh trước khi một trong hai epic đầu đã ra khỏi hàng.

## P3 — Daily ledger

- Immutable daily snapshot.
- Khóa sửa sau đóng ngày.
- Adjustment document có reason, actor, permission và exact audit lineage.
- Reconcile Sales, Purchase, Inventory, Manufacturing và Finance.

## P4 — Warranty / Capacity

- Lifecycle lỗi/bảo hành bốn nguyên nhân và accounting effect.
- Kế hoạch/công suất theo bộ phận, thời gian định mức, overtime, WIP và overload policy.

## P5 — End-to-end acceptance

- Sales Order → Production Request → Work Order → cấp vật tư → cắt/sơn → nhập thành phẩm → giao hàng → công nợ → daily ledger.
- Authenticated desktop/mobile evidence.
- Exact merge/release SHA, run IDs, deployment/version IDs và reconciliation.
- Critical/High blocker bằng 0.

## Quy tắc tài nguyên CI

- Tối đa một PR nghiệp vụ active cho tới khi P0 ổn định.
- Không chạy full CI để tìm lỗi mà focused tests có thể bắt trong vài phút.
- Không push để “thử xem CI nói gì” khi chưa đọc log lượt trước.
- Không mở PR thay thế khi PR cũ chưa được đóng và ghi superseded.
- Platform/docs không được dùng để tuyên bố nghiệp vụ DONE.

## Destructive boundary

Cần lệnh riêng trước khi sửa production secret/DNS, xoá resource, bật FIFO hoặc chạy mutation/migration không có backup và rollback.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- generated evidence;
- credential, cookie hoặc token.
