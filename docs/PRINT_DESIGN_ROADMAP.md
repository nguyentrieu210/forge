# Print design roadmap

Ngày cập nhật: 2026-08-01  
Branch: `feat/print-design-sales-documents-20260801`

## Mục tiêu

Xây bộ mẫu in vận hành thống nhất cho Alumdoor. Mỗi mẫu lấy trực tiếp dữ liệu chứng từ, giữ đúng số đo/đơn vị nghiệp vụ và dùng được ở HTML preview lẫn PDF.

## Quy chuẩn bắt buộc

- A4 portrait mặc định; chỉ dùng landscape khi portrait làm chữ không đọc được.
- `thead` lặp lại ở trang sau; không cắt đôi một dòng chứng từ.
- Mỗi cột tiêu đề có đúng một độ rộng; tổng độ rộng là `100%`.
- Tiền, ngày và số đi qua filter renderer, không tự tính lại trong HTML.
- Không chèn script, token hoặc URL nhạy cảm.
- Một DocType chỉ có một mẫu `default`.
- Mỗi mẫu có fixture qua renderer thật với dòng đặc thù ngành, hàng thường và dữ liệu dài.
- Mẫu giao khách không đưa dữ liệu nội bộ hoặc đường dẫn có quyền truy cập.

## Đã triển khai

1. `Đơn bán hàng ALUMDOOR` — Sales Order
   - 13 cột, số đo cửa, số bộ, đơn giá, mô tơ/phụ kiện và ghi chú lắp đặt.
   - Khách xác nhận và bàn giao nội bộ sang kho/sản xuất.

2. `Phiếu giao hàng / lắp đặt ALUMDOOR` — Delivery Note
   - 11 cột, không in giá.
   - Có đơn nguồn, địa chỉ, ngày lắp, đội lắp, lái xe, biển số, kho xuất và khối lượng.
   - Có checklist bàn giao/lắp đặt và chữ ký thủ kho/người giao, đội lắp, khách hàng.

## Hàng đợi

### P0 — dùng hằng ngày

1. `Phiếu yêu cầu sản xuất` — Production Request, một dòng cho từng bộ cửa, số đo và lịch giao.
2. `Phiếu cắt nhôm` — Cut Order, lô mẹ, rộng cắt, số lá, kerf, đầu thừa và QR chứng từ.

### P1 — tiền, kho và nghiệm thu

1. Chuẩn hóa A4 `Hoá đơn bán hàng`, không thay hóa đơn điện tử theo pháp luật.
2. `Phiếu thu / phiếu chi` từ Payment Entry.
3. Nâng `Phiếu nhập kho ALUMDOOR` lên cùng letterhead và kiểm thử bố cục.
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
- Preview A4 không tràn cột với dữ liệu ngắn và dài.
- PR CI xanh trên exact head.
- Không deploy Cloudflare hoặc thay production secrets trong nhánh thiết kế in.
