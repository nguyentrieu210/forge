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

3. `Phiếu yêu cầu sản xuất ALUMDOOR` — Production Request
   - 14 cột, tổng độ rộng `100%`, một dòng theo bộ/vị trí sản xuất.
   - Có loại cửa, bộ phận, màu, rộng/cao, rộng cắt, số lá, mô tơ/cảnh báo, phút dự toán và kho vật tư.
   - Header giữ đơn bán nguồn, khách hàng, ngày lập/ngày hẹn, trạng thái và kho nguyên vật liệu/thành phẩm.

4. `Phiếu cắt nhôm ALUMDOOR` — Cut Order
   - 13 cột, tổng độ rộng `100%`, bám trực tiếp `Cut Order` / `Cut Order Item` authoritative.
   - Header có ngày cắt, công thức, khách hàng, đơn bán, Work Order, màu đích và trạng thái.
   - Dòng cắt giữ mã nhôm, bundle lô mẹ, bundle đầu thừa, kho lô mẹ, khổ cây, rộng cắt, số lá, số nhát, kerf, kg tiêu hao/cân thật, đầu thừa và phế.
   - Dùng bundle ID thật để truy vết; chưa tạo QR cho tới khi renderer có primitive QR authoritative.

## Hàng đợi

### P1 — tiền, kho và nghiệm thu

1. `Biên bản bàn giao / nghiệm thu lắp đặt`, lấy từ Delivery Note và Sales Order.
2. Chuẩn hóa A4 `Hoá đơn bán hàng`, không thay hóa đơn điện tử theo pháp luật.
3. `Phiếu thu / phiếu chi` từ Payment Entry.
4. Nâng `Phiếu nhập kho ALUMDOOR` lên cùng letterhead và kiểm thử bố cục.
5. `Phiếu trả hàng` và `Giấy báo Nợ NCC`.

### P2 — tem và hậu mãi

1. Tem QR mặt hàng/lô nhôm khi renderer có primitive QR authoritative.
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
