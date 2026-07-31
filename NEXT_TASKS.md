# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md` trước file này. Không tự đổi thứ tự hoặc mở thêm epic nghiệp vụ nếu chưa cập nhật hàng đợi canonical.

## P0 — Sales-to-Production

### Trạng thái

- PR #115 đã merge nhưng final diff chỉ có workflow đồng bộ và file trigger.
- Merge SHA #115: `eab228aa72bbf54575ec573b4f7eadaa9a8060f7`.
- Không ghi epic DONE.
- PR #107 là nhánh transport cũ, không dùng làm nguồn merge.

### Việc làm

1. Tạo branch sạch từ current default.
2. Mang code nghiệp vụ thật vào final diff, không giữ workflow/payload/trigger vận chuyển.
3. Xác minh đầy đủ:
   - Sales Order Item mở rộng;
   - door policy có version và `Cửa tấm liền Úc`;
   - snapshot số lá, kg và phút định mức;
   - Production Request theo từng bộ/loại cửa;
   - Work Order draft idempotent;
   - Cut/Paint theo Batch `THÔ`;
   - Delivery theo `sales_order_row_id`;
   - fail closed khi thiếu policy/BOM.
4. Chạy server build.
5. Chạy door formula regression.
6. Chạy Sales production flow regression.
7. Chạy Unicode Item Price regression.
8. Chạy client typecheck và full required CI.
9. Review final diff, bảo đảm không còn file transport tạm.
10. Merge và ghi exact merge/release evidence.

### Done condition

- Code nghiệp vụ thật có trên default.
- Exact-head required CI xanh.
- Authenticated operator journey tối thiểu PASS.
- Release exact merged SHA có evidence hoặc được ghi rõ còn pending.

## P1 — Purchase authenticated QA

### Trạng thái

- PR #103.
- Branch `feat/purchase-authenticated-lifecycle-qa-20260731`.
- Head gần nhất `94ccc11ff79b2d0cd9269abb5804009887b950a8`.
- Draft; exact-head workflows đang chạy tại lần kiểm gần nhất.

### Việc làm

1. Kiểm lại exact head/base/mergeability.
2. Đọc UI workflow log nếu fail; sửa nguyên nhân thật, không xóa test.
3. PASS lifecycle đăng nhập thật:
   - Item/UOM purchase filters;
   - Purchase Order create/save/submit/open;
   - Purchase Receipt create/save/preview/submit/cancel/open;
   - tổng tiền, số lượng và trạng thái;
   - allocation timeline null khi FIFO disabled.
4. Chạy Desktop Chrome và Pixel 7.
5. Chạy full exact-head CI.
6. Chuyển Ready for review.
7. Review final diff và merge.

### Done condition

- Desktop/mobile authenticated lifecycle PASS.
- All required checks SUCCESS.
- FIFO vẫn disabled.
- PR merged và handoff cập nhật.

## P2 — Finance

### Trạng thái

- PR #15 stale, draft và không mergeable.
- Không cố sync rồi merge nguyên nhánh cũ.

### Việc làm

1. Tạo branch mới từ current default.
2. Trích phần có giá trị từ PR #15 theo từng commit/file đã review.
3. Hoàn thiện:
   - due date và AR/AP aging;
   - Payment Entry partial/unallocated;
   - Payment Allocation;
   - Party Statement;
   - Debt Summary;
   - Advance Balance;
   - navigation và UI/report đầy đủ.
4. Chốt permission/data-scope theo company/party/account/currency.
5. Thiết kế backfill/hard-enforcement append-only với checksum.
6. Chạy migration fixture, query/compiler tests, worker routes, UI và full CI.
7. Chạy staging smoke trước production migration.

### Done condition

- Finance branch sạch, mergeable và exact-head CI xanh.
- Migration/backfill có dry-run, checksum, rollback và staging evidence.
- AR/AP operator journey PASS.

## P3 — Daily ledger

### Phạm vi bắt buộc

- Immutable daily snapshot theo ngày/company/warehouse/customer/order.
- Khóa sửa dữ liệu sau khi đóng ngày.
- Mọi sửa sau khóa đi qua adjustment document có reason, actor và audit.
- Đối chiếu Sales, Purchase, Inventory, Manufacturing và Finance.
- Báo cáo mở ngày/đóng ngày/chênh lệch/export.
- Quyền đóng ngày, mở lại và phê duyệt adjustment.

### Done condition

- Không sửa ngược snapshot đã khóa.
- Adjustment có exact lineage và audit.
- Reconciliation tests và authenticated operator smoke PASS.

## P4 — Warranty / Capacity

### Warranty và lỗi

- Bốn nguyên nhân: motor/battery warranty, production fault, supplier fault, customer fault.
- Ghi rõ stage phát hiện, người chịu trách nhiệm, hàng thay thế/sửa chữa và accounting effect.
- Supplier fault phải có quy tắc giữ/ghi giảm công nợ rõ ràng.
- Warranty one-year rule phải dùng ngày và chứng từ nguồn authoritative.

### Capacity và lịch sản xuất

- Kế hoạch theo ngày, khách hàng, sản phẩm, kích thước, diện tích và công đoạn.
- Capacity theo bộ phận/workstation.
- Thời gian định mức và overtime.
- WIP, shortage và planned-vs-actual.
- Không tự đoán capacity khi thiếu dữ liệu cấu hình.

### Done condition

- Lỗi/warranty có lifecycle, permission, audit và accounting tests.
- Scheduler không overbook âm thầm; overload phải hiển thị hoặc bị chặn theo policy.
- Desktop/mobile operator smoke PASS.

## P5 — End-to-end acceptance

### Journey bắt buộc

1. Tạo Sales Order có bảng giá, UOM, kích thước và loại cửa.
2. Sinh Production Request và Work Order.
3. Cấp vật tư, cắt, sơn, ghi WIP/offcut/scrap.
4. Nhập thành phẩm và giao theo Sales Order row.
5. Ghi nhận công nợ khách hàng và liên kết chứng từ.
6. Đóng daily ledger.
7. Thử adjustment có quyền.
8. Chạy một case lỗi/warranty.
9. Kiểm báo cáo kho, sản xuất, Finance và daily ledger khớp nhau.
10. Cleanup dữ liệu thử hoặc dùng tenant acceptance riêng.

### Evidence bắt buộc

- Exact merged SHA.
- CI run IDs.
- Release run IDs và version/deployment IDs.
- Authenticated desktop/mobile smoke.
- Reconciliation result.
- Danh sách lỗi còn lại; Critical/High phải bằng 0.

## Công việc platform không được chen vào hàng nghiệp vụ

- PR #117 đã merge để làm release evidence dễ quan sát hơn.
- PR #116 có khả năng đã bị #117 thay thế, cần kiểm diff rồi đóng nếu không còn giá trị unique.
- Platform support chỉ làm song song khi không đổi source nghiệp vụ và không chiếm quá một slot platform.
- Không dùng merge CI/docs để tuyên bố epic nghiệp vụ DONE.

## Destructive boundary

Cần lệnh riêng trước khi:

- sửa production secret hoặc DNS;
- xoá Cloudflare resource;
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
