# Alumdoor — Hoàn thiện mua hàng Tiến Đạt

Ngày: 2026-08-03

Branch: `feat/tien-dat-purchase-completion-20260803`
PR: #295

## Source of truth

- Nghĩa vụ giao hàng/FIFO: Purchase Allocation ledger.
- Nhôm cây/lá: allocation quantity = `qty_bar` (số cây), không dùng kg để quyết FIFO.
- Giá trị mua, tồn theo ĐVT mua và kế toán vẫn dùng quantity/kg của chứng từ.
- Công nợ phải trả: Payment Ledger / Debt Summary. Purchase Invoice outstanding chỉ là fallback khi report authoritative không đọc được.
- Settlement: `Purchase Settlement` Close/Reverse hiện hữu. Workspace chỉ gọi command này, không tạo ledger khác.

## Case khóa

AL71 · 7,2 m · 0,389 kg/m:

- PO1 200 cây = 1.440 m = 560,16 kg barem.
- PO2 100 cây = 720 m = 280,08 kg barem.
- Nhận 230 cây = FIFO 200 + 30.
- Còn hiện tại 70 cây = 504 m = 196,056 kg barem.
- Kg cân thực tế được giữ riêng, không dùng để suy ngược số cây.

## Hoàn thiện trong PR

1. Canonical allocation dùng số cây cho measurement profile `Nhôm cây/lá`, giữ commercial qty theo kg.
2. Supplier debt report trả đủ đặt/nhận/còn theo cây, mét, kg barem và kg thực.
3. Dashboard không kéo shortage của settlement đã đóng trở lại thành nợ hiện tại.
4. Drill-down từng PO và từng PO line.
5. Hiển thị chênh lệch kg thực so với barem.
6. Công nợ tiền trong workspace đọc Payment Ledger: outstanding, due, overdue, advance, net exposure.
7. Bulk Receipt cho chọn ngày/giờ nhận thực tế; fingerprint chống duplicate gồm posting time.
8. Dashboard paginate chứng từ, không silent-truncate ở 300/500 bản ghi.
9. Workspace có Close/Reverse settlement ngay tại quy cách, nhưng command authoritative vẫn là `Purchase Settlement`.
10. UI Tiến Đạt tách khỏi generic ActionScreen để phần nghiệp vụ riêng không làm phình renderer chung.

## Boundary cố ý

- `Submit Purchase Order` hiện vẫn là mốc mở nghĩa vụ giao hàng authoritative. PR này không tạo thêm một trạng thái `Đã gửi NCC` cạnh tranh với lifecycle chứng từ.
- Ảnh hàng/ảnh phiếu giấy và quy trình đổi hàng lỗi thuộc Purchase Receipt / Stock Return evidence flow rộng hơn, không được nhét vào allocation ledger.
- Bulk preview cũ chỉ là preview tiện dụng; khi Purchase Allocation rollout bật, submit Purchase Receipt tính lại FIFO authoritative trong transaction.

## Safety

- Chưa merge.
- Chưa deploy.
- Không đổi production secret/DNS.
- Chỉ merge/deploy sau khi exact head CI xanh và user duyệt.
