# Hoàn thiện quy trình 25.7 — Alumdoor

## Phạm vi chốt

Tài liệu này là hợp đồng triển khai cho các khoảng trống còn lại sau khi đối chiếu `25.7 QUY TRÌNH.docx` với nhánh `feat/daily-detailed-ledger-20260801`.

1. **Bảo hành và hàng lỗi**: truy ngược bắt buộc về đơn bán, phiếu giao, mặt hàng, ngày giao; bảo hành motor/pin 12 tháng; bốn nhóm nguyên nhân chuẩn; tách nhánh khách hàng, sản xuất và nhà cung cấp; xác nhận của Kế toán tổng hợp trước khi bù trừ công nợ nhà cung cấp.
2. **Năng lực và tăng ca**: định mức theo bộ, m², công đoạn hoặc mẻ; số người/tổ; ca 8 giờ, lịch nghỉ, giờ tăng ca; công suất máy/trạm; gom mẻ sơn theo màu; cảnh báo trễ và đề xuất dời lịch.
3. **Theo dõi chung**: một read model từ chứng từ gốc, không tạo sổ nghiệp vụ thứ hai; hiển thị đơn, ngày giao, khách/đại lý, người phụ trách, nhóm sản phẩm, tiền đã thu, trạng thái giao/sản xuất/lỗi và ghi chú vận hành.
4. **Phiếu giao theo ngày**: xem trước các đơn đến hạn; sinh phiếu theo từng đơn với khóa idempotency; báo kết quả từng đơn; không tạo trùng; cung cấp danh sách phiếu để in theo gói ngày.
5. **Sổ chi tiết hằng ngày**: nhận cả đơn bán mới chưa giao, ngoài các bút toán fulfillment đã có.
6. **Golden Order UAT**: một kịch bản tự động xuyên suốt đơn hỗn hợp, lô nguyên liệu, sơn, giao/thu tiền một phần, bảo hành/lỗi, AP/AR, kho và sổ ngày.

## Quyền và phân tách nhiệm vụ

| Nghiệp vụ | Đọc | Tạo/cập nhật | Xác nhận nhạy cảm |
|---|---|---|---|
| Theo dõi chung | Chủ xưởng, Kinh doanh, Kho, Kế toán, Sản xuất | Kinh doanh đổi ngày giao; Kế toán chỉ đổi ngày giao/ghi chú qua action có audit | Chủ xưởng |
| Kế hoạch năng lực | Chủ xưởng, Kinh doanh, Sản xuất | Chủ xưởng, Sản xuất | Chủ xưởng duyệt tăng ca/dời lịch |
| Bảo hành/lỗi | Chủ xưởng, Kinh doanh, Kho, Kế toán, Sản xuất | Kinh doanh/Kho tiếp nhận; Sản xuất kết luận lỗi | Kế toán tổng hợp xác nhận bù trừ NCC |
| Giao hàng theo ngày | Chủ xưởng, Kinh doanh, Kho, Kế toán | Kho/Kinh doanh xem trước; Kho tạo và ghi sổ phiếu | Chứng từ kho vẫn tuân thủ quyền Delivery Note |

`Administrator` chỉ là break-glass. Các action không cấp thêm quyền: mọi lần đọc/ghi vẫn đi ngược qua gateway bằng danh tính người gọi.

## Quy tắc chấp nhận

- Ngày hết bảo hành motor/pin = ngày giao thực tế + 12 tháng; không có phiếu giao thì chưa được kết luận “còn bảo hành”.
- Nguyên nhân lỗi bắt buộc thuộc: `Sản xuất`, `Nhà cung cấp`, `Khách hàng sử dụng`, `Vận chuyển/lắp đặt`.
- Lỗi sản xuất phải có người chịu trách nhiệm và xác nhận Kế toán tổng hợp trước khi đóng.
- Lỗi NCC sau khi gửi trả ở trạng thái `Chờ NCC đổi`; số bù trừ không âm, có chứng từ mua tham chiếu và chỉ được ghi nhận sau xác nhận kế toán.
- Lỗi do khách phải có từng khoản công việc/chi phí; tổng chi phí lấy từ các dòng, không nhận số tổng gõ tay.
- Công suất chuẩn một ca = số người × 8 giờ × hiệu suất, bị chặn bởi công suất workstation/mẻ nếu thấp hơn; tăng ca tách riêng khỏi công suất chuẩn.
- Cửa Úc và cửa lưới dùng m²; cửa Đức/Đài Loan/Siêu Trường dùng bộ hoặc công đoạn; sơn dùng mẻ theo màu và có thời lượng mặc định 180 phút/mẻ.
- Khóa tạo phiếu giao là `ngày + đơn bán`; retry trả lại phiếu đã tạo, không sinh phiếu thứ hai.
- Read model chỉ tổng hợp dữ liệu; mọi thay đổi quay về chứng từ gốc và tạo audit event.

## Golden Order

Kịch bản chuẩn phải chứng minh: đơn có ít nhất hai loại cửa và một dòng sơn màu; xuất từ nhiều lô; giao một phần rồi giao hết; thu tiền một phần; mở một lỗi sản xuất và một lỗi NCC; xác nhận chi phí/bù trừ đúng vai trò; hủy/reverse trả lại trạng thái và số dư; sổ ngày phản ánh cả đơn mới, giao hàng, kho, sản xuất, tiền và bảo hành.
