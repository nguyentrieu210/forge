# Alumdoor Sales Item, Multi-UOM Price and Availability

Ngày chốt phạm vi: **2026-07-31**. Nhánh: `feat/sales-complete-20260731`.

## Mục tiêu

Khi nhân viên Kinh doanh lập Báo giá hoặc Đơn hàng:

1. Chỉ chọn được mặt hàng đang hoạt động và được phép bán.
2. Chỉ chọn được ĐVT đã khai trên chính Item: ĐVT tồn, ĐVT bán mặc định và các dòng quy đổi hợp lệ.
3. Mỗi cặp **Bảng giá + Mặt hàng + ĐVT** có một đơn giá riêng; đổi ĐVT phải nạp lại đúng giá của ĐVT đó.
4. Trên dòng hàng nhìn thấy tồn hiện tại theo kho, quy đổi về ĐVT đang bán, cùng trạng thái thiếu giá/hết hàng.
5. Máy chủ vẫn là nguồn sự thật khi lưu và khi Phiếu xuất ghi sổ; thông tin trên form không phải giữ chỗ tồn kho.

## Quy tắc dữ liệu

- Khoá Item Price mới: `<price_list>:<item_code>:<uom>`.
- Dữ liệu cũ `<price_list>:<item_code>` chỉ được dùng khi trường `uom` khớp tuyệt đối với dòng bán.
- Không tự đổi giá từ Cái sang Thùng bằng hệ số. Giá bán theo ĐVT là quyết định thương mại, không phải phép quy đổi kho.
- `conversion_factor` chỉ đổi số lượng giao dịch về `stock_uom`.
- Nếu có Bảng giá mà thiếu Item Price đúng ĐVT, form báo **Chưa khai giá** và máy chủ từ chối lưu theo đường định giá hiện hành.
- Hàng dịch vụ hiển thị **Không quản lý tồn**.
- Không có kho thì hiển thị **Chưa chọn kho**, không cộng tồn của mọi kho rồi tạo ảo giác hàng đang sẵn.

## Acceptance criteria

- AC1: Item có ĐVT Cái và Thùng, mỗi ĐVT có Item Price khác nhau; đổi ĐVT trên dòng đổi đúng giá.
- AC2: ĐVT không nằm trong Item/UOM Conversion không xuất hiện trong picker và API trả lỗi nếu gọi trực tiếp.
- AC3: Dòng hiển thị `Còn N <ĐVT>`, `Hết hàng`, `Chưa chọn kho` hoặc `Không quản lý tồn`.
- AC4: Tồn được đọc từ Stock Balance theo đúng item + warehouse và chia cho conversion factor để hiển thị theo ĐVT bán.
- AC5: Item Price legacy chỉ hoạt động khi UOM khớp; UOM khác phải báo thiếu giá.
- AC6: Pricing Rule hiện có vẫn chạy sau khi lấy đúng Item Price nền.
- AC7: Delivery Note submit vẫn chặn thiếu tồn bằng server ledger guard; form preview không làm yếu chốt này.

## Ngoài phạm vi đợt này

- Giữ chỗ/ATP theo Sales Order.
- Phân bổ tự động nhiều kho.
- Dự báo hàng đang sản xuất hoặc đang mua về.
- Deploy Cloudflare, migration production và sửa secrets.
