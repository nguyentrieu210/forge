# Print design roadmap

Ngày cập nhật: 2026-08-01  
Branch: `feat/print-design-sales-documents-20260801`

## Mục tiêu

Xây bộ mẫu in vận hành thống nhất cho Alumdoor. Mỗi mẫu phải lấy trực tiếp dữ liệu chứng từ, giữ đúng số đo/đơn vị nghiệp vụ và dùng được ở HTML preview lẫn PDF.

Mẫu đầu tiên của nhánh là `Đơn bán hàng ALUMDOOR`, tương ứng `Sales Order`, theo cùng hợp đồng A4 của `Đơn nhập hàng ALUMDOOR` nhưng dùng cột bán hàng, kích thước cửa, mô tơ/phụ kiện và ghi chú lắp đặt.

## Quy chuẩn bắt buộc

- A4 portrait mặc định; chỉ dùng landscape khi bảng có quá nhiều cột số và portrait làm chữ không đọc được.
- `thead` lặp lại ở trang sau; không cắt đôi một dòng chứng từ.
- Một cột tiêu đề phải có đúng một độ rộng; tổng độ rộng là `100%`.
- Tiền, ngày và số phải đi qua filter renderer, không tự nối chuỗi hoặc tính lại trong HTML.
- Không chèn script, token hoặc URL nhạy cảm vào mẫu in.
- Một DocType chỉ có một mẫu `default`; mẫu phụ phải có mục đích rõ ràng.
- Có fixture test qua renderer thật, gồm ít nhất một dòng đặc thù ngành và một dòng hàng thường.
- Mẫu nội bộ có thể dùng QR theo mã chứng từ; mẫu giao khách không đưa dữ liệu nội bộ hoặc đường dẫn có quyền truy cập.

## Hàng đợi

### P0 — dùng hằng ngày

1. `Đơn bán hàng ALUMDOOR` — Sales Order, khách xác nhận và bàn giao kho/sản xuất.
2. `Phiếu giao hàng / lắp đặt` — Delivery Note, có tài xế, biển số, đội lắp, địa chỉ và từng dòng theo đơn.
3. `Phiếu yêu cầu sản xuất` — Production Request, một dòng cho từng bộ cửa, số đo và lịch giao.
4. `Phiếu cắt nhôm` — Cut Order, lô mẹ, rộng cắt, số lá, kerf, đầu thừa và QR chứng từ.

### P1 — tiền, kho và nghiệm thu

1. Chuẩn hóa A4 `Hoá đơn bán hàng`, không thay hóa đơn điện tử theo pháp luật.
2. `Phiếu thu / phiếu chi` từ Payment Entry.
3. Nâng `Phiếu nhập kho ALUMDOOR` lên cùng letterhead và kiểm thử bố cục chính xác.
4. `Biên bản bàn giao / nghiệm thu lắp đặt`, lấy từ Delivery Note và Sales Order.
5. `Phiếu trả hàng` và `Giấy báo Nợ NCC`.

### P2 — tem và hậu mãi

1. Tem QR mặt hàng/lô nhôm.
2. Tem đầu thừa, có lô cha, chiều dài, màu, kho và ngày cắt.
3. Phiếu tiếp nhận bảo hành và biên bản đổi/trả.
4. Phiếu KCS và biên bản kiểm tra trước giao.
5. Bảng kê công nợ/đối chiếu theo khách hoặc nhà cung cấp.

## Điều kiện hoàn tất từng mẫu

- Brief compile và schema validation pass.
- Unit test renderer pass.
- Server build/typecheck pass.
- Preview A4 không tràn cột ở dữ liệu ngắn và dài.
- PR CI xanh trên exact head.
- Không deploy Cloudflare hoặc thay production secrets trong nhánh thiết kế in.
