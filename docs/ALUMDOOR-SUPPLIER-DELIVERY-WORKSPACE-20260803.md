# Alumdoor — Supplier Delivery Workspace

Ngày: 2026-08-03

## Mục tiêu

Biến luồng Tiến Đạt từ một action nhập FIFO một dòng thành workspace vận hành nhà cung cấp, để người dùng mở một nơi và trả lời được:

- đã đặt những gì;
- đã nhận những gì;
- còn nhà cung cấp phải giao bao nhiêu;
- PO nào đang giao / đã đủ / quá hạn / đã đối soát;
- từng chuyến hàng đã trừ vào PO nào;
- một xe nhiều mã được nhập thành một Purchase Receipt nháp;
- giá mua thay đổi thế nào qua các PO;
- tiến độ hóa đơn mua ra sao, nhưng không trộn với công nợ phải trả authoritative.

## Source of truth

- Nghĩa vụ giao hàng: Purchase Order + purchase allocation ledger / settlement windows.
- Hàng đã nhận: Purchase Receipt đã ghi sổ.
- FIFO / tolerance / unapplied / settlement: allocation ledger hiện có, không tạo ledger cạnh tranh.
- Công nợ phải trả tiền: Payment Ledger / GL. Workspace không suy công nợ tiền từ số hàng chưa giao.

## UI

Action `nhap-nhom-fifo` được trình bày thành workspace có 4 tab:

1. **Tổng quan** — KPI, tổng theo mã + quy cách, tiến độ từng PO.
2. **Nhận hàng** — một xe nhiều dòng; preview toàn chuyến rồi tạo đúng một Purchase Receipt nháp bằng bulk FIFO controller hiện có.
3. **Lịch sử & đối soát** — các phiếu nhập và trạng thái nghĩa vụ/settlement.
4. **Giá & hóa đơn** — lịch sử giá PO, biến động so với lần trước, chỉ báo hóa đơn; GL vẫn là nguồn công nợ tiền.

Material được tách theo mã + chiều dài + kg/m + màu + dập + measurement profile + UOM, không gộp chỉ theo item_code.

## Backend read model

`alumdoor.purchase.supplier_delivery_dashboard`:

- đọc PO / Receipt submitted của đúng supplier;
- lấy allocation timeline authoritative theo PO và dedupe settlement windows;
- gom các window theo material queue;
- `remaining_bars` chỉ tính window đang Open, không kéo shortage của window đã Settled trở lại thành nợ hiện tại;
- fallback về submitted documents khi allocation rollout/timeline chưa có;
- fallback có thể kết luận `Đã giao đủ`, nhưng không tự kết luận `Đã đối soát`;
- trả lịch sử Receipt, tiến độ PO, price history và billing hints.

## Verification contract

Regression `server/tests/purchase-supplier-delivery-dashboard.test.mjs` khóa case:

- PO1 AL71: 200 cây;
- PO2 AL71: 100 cây;
- đã nhận 230 cây;
- dashboard gom một material queue: đặt 300, nhận 230, còn 70;
- PO1 đủ, PO2 còn 70;
- lịch sử nhận = 230 cây / 630 kg thực trong fixture;
- giá 100.000 -> 110.000 = +10%;
- fallback không giả settlement.

## Boundary còn lại

- Settlement close/reverse và manual override vẫn dùng action/dialog allocation đã có trên document timeline; workspace hiện hiển thị trạng thái, chưa nhân bản các command này.
- Supplier scorecard nâng cao (OTD, return rate, lead-time trend) cần read model thống kê riêng khi muốn biến thành KPI chính thức.
- Công nợ tiền không được lấy từ delivery debt; phải drill sang kế toán/Payment Ledger/GL.
