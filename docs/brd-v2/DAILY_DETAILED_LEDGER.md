# Sổ chi tiết hằng ngày

Trạng thái: triển khai trên nhánh `feat/daily-detailed-ledger-20260801` (PR #146), chưa merge và chưa deploy.

## Phạm vi nghiệp vụ

Mỗi lần “Cập nhật sổ” tạo một ảnh chụp bất biến theo ngày, công ty và các bộ lọc tùy chọn kho, khách hàng, đơn bán. Nguồn được tổng hợp từ sáu miền:

1. Bán hàng.
2. Mua hàng.
3. Kho.
4. Sản xuất.
5. Bảo hành và lỗi.
6. Tài chính.

Ảnh chụp cùng phạm vi và cùng fingerprint được dùng lại để thao tác idempotent. Khi đã khóa, dữ liệu gốc không được cập nhật hoặc xóa; thay đổi chỉ được ghi bằng điều chỉnh append-only có người thực hiện, thời điểm và lý do.

## Phân quyền

Ba nhóm nghiệp vụ được phép xem và thao tác:

- Kế toán tổng hợp / General Accountant.
- Kế toán trưởng / Chief Accountant.
- Giám đốc / Director.

`Accounts User`, `Accounts Manager` và `System Manager` không được cấp quyền ngầm. Tài khoản nền tảng `Administrator` giữ cơ chế cứu hộ.

Quyền được thực thi ở API. Alumdoor đồng thời khai `Daily Ledger Access` để server loại mục menu khỏi manifest của người không đủ quyền; việc ẩn nút ở client không được dùng thay cho kiểm tra server.

## Luồng màn hình

- Chọn ngày, công ty và bộ lọc tùy chọn.
- Cập nhật sổ, sau đó tải các dòng của ảnh chụp.
- Đối chiếu fingerprint và từng dòng với nguồn hiện tại.
- Khóa sổ khi đã khớp.
- Chọn một dòng và ghi điều chỉnh số lượng/tiền sau khóa; lý do là bắt buộc.

Desktop dùng bảng có STT và các cột nghiệp vụ. Mobile dùng danh sách thẻ riêng, không ép bảng cuộn ngang. Màn hình có trạng thái chưa có dữ liệu, rỗng, tải, lỗi và kết quả đối chiếu.

## Chấp nhận

- Role ngoài ba nhóm bị từ chối ở report và thao tác.
- `System Manager` không được xem/điều chỉnh nếu không mang một trong ba role nghiệp vụ.
- Ảnh chụp và reconciliation có đủ miền `Warranty`.
- Migration `0033` chấp nhận miền `Warranty` và giữ toàn bộ trigger bất biến.
- Brief Alumdoor biên dịch, qua parser manifest và menu chỉ hiện theo `Daily Ledger Access`.
- Runtime typecheck và production build thành công.
