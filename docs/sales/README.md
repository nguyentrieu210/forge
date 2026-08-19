# Forge Sales Commercial Architecture — Documentation Index

**Status:** shared Sales docs + Alumdoor current-state override  
**Date:** 2026-08-16

## Important Alumdoor current-state override

Alumdoor **đã xóa `Sales Option` / `Sales Package` khỏi dữ liệu, brief, resolver/controller và UI** trong chuỗi commit ngày 14/08/2026:

- `46cff2132f4d3af27f44d3196bbfbca2e2c1335b` — xóa Cách bán/Gói bán khỏi Alumdoor, bán thẳng theo Item Price;
- `356c847c6a2adbee019ab5348203a0654a64988b` — merge nhánh đóng O2C + xóa hai lớp trên;
- `dd06bbc4277acc09f0e04f0d5eeb18023920c9ab` — dọn nốt hai chỗ client viết cứng.

Vì vậy các tài liệu/migration cũ còn nhắc `Sales Option` / `Sales Package` là **historical implementation evidence**, không phải current Alumdoor authority.

Generic platform có thể còn metadata/control hoặc doctype tương ứng cho tenant khác. Điều đó không có nghĩa Alumdoor còn sử dụng chúng.

## Đường đọc hiện hành cho Alumdoor

```text
apps/alumdoor/docs/nguon/SALES-BOM-SOURCE-MAP.md
→ raw extract trong apps/alumdoor/docs/nguon/
→ docs/sales/ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md
→ server/briefs/alumdoor-v2.json
→ exact current code / migrations / tests
```

Audit 16/08 đã được sửa để phản ánh đúng việc Sales Option/Sales Package đã bị xóa.

## Current Alumdoor Sales model

Hiện tại luồng Alumdoor đi theo hướng:

```text
Item + kích thước/fact dòng bán
→ geometry / Cutting Policy
→ Item Price STANDARD
→ Pricing Rule khi có điều kiện thương mại
→ Sales Order line
→ BOM resolution
→ Production / Material Requirement
→ Stock reservation / allocation
→ Cut Order / execution
```

Không được dựng lại `Sales Option` hoặc `Sales Package` như một lớp trung gian cho Alumdoor nếu không có một quyết định kiến trúc mới rõ ràng.

## Shared / historical documents

| Document | Ý nghĩa hiện tại |
| --- | --- |
| [`ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md`](./ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md) | **Current Alumdoor audit** — ưu tiên cho Master/Sales/BOM/Production |
| [`SALES_COMMERCIAL_ARCHITECTURE.md`](./SALES_COMMERCIAL_ARCHITECTURE.md) | Shared architecture từ 11/08; các phần Sales Option/Package không còn là Alumdoor current-state |
| [`ALUMDOOR_SALES_BUSINESS_CASE_MATRIX.md`](./ALUMDOOR_SALES_BUSINESS_CASE_MATRIX.md) | Historical/business-case evidence; kiểm lại với current brief/code trước khi dùng |
| [`SALES_PRICING_AUTHORITY_IMPLEMENTATION_PLAN.md`](./SALES_PRICING_AUTHORITY_IMPLEMENTATION_PLAN.md) | Shared pricing planning; không tự khôi phục lớp đã xóa khỏi Alumdoor |
| [`SALES_GOLDEN_FLOW_AND_TEST_PLAN.md`](./SALES_GOLDEN_FLOW_AND_TEST_PLAN.md) | Shared acceptance/test evidence |
| [`ALUMDOOR_SALES_OPTION_PACKAGE_AUDIT_20260813.md`](./ALUMDOOR_SALES_OPTION_PACKAGE_AUDIT_20260813.md) | **Historical only** — mô tả trạng thái trước khi xóa ngày 14/08 |

## Invariants cho phần việc tiếp theo

- Geometry vật lý không được phụ thuộc ngầm vào customer-group pricing semantics.
- `Item Price` / `Pricing Rule` xử lý tiền; BOM xử lý consumption sản xuất.
- BOM import 15/08 còn `suy_luan/chua_ro` phải giữ draft/evidence cho đến khi được xác nhận.
- Không dùng BOM làm một bundle thương mại.
- Không tái tạo `Sales Option` / `Sales Package` chỉ vì migration/doc cũ vẫn còn tên chúng.
- Exact current code/brief/test thắng tài liệu lịch sử khi có xung đột.

## Sales BOM composition contract (19/08/2026)

Trên `Sales Order`, BOM chỉ là snapshot quan hệ cha–con cho Item có mã `TRỌN BỘ`:

- nguồn chỉ quyết định thành phẩm cha có những Item con nào và thứ tự của chúng;
- không đọc `qty`, `stock_uom`, hệ số quy đổi hay công thức định mức sản xuất;
- `SL` dòng con lấy theo số bộ của dòng cha;
- Rộng PB ray, Rộng PB nhựa, Cao PB, rộng chuẩn hóa và rộng cắt lá lấy từ dòng cha;
- ray lấy chiều dài theo Cao PB, trục lấy chiều dài theo Rộng PB; nếu ĐVT bán là mét thì khối lượng bằng chiều dài nhân số bộ;
- `ĐVT` lấy từ `Item.default_sales_uom`; không thay bằng ĐVT tồn kho/BOM sản xuất;
- khối lượng hiển thị được tính theo quy tắc bán của Item con và quy cách dòng cha;
- đơn giá/thành tiền phần con luôn là `—` và không tham gia tổng tiền đơn.

Đường sản xuất vẫn dùng resolver BOM nghiêm ngặt riêng. Thiếu định mức sản xuất phải chặn tạo BOM/Work Order, nhưng không được chặn việc xổ danh sách cấu thành trên đơn bán hàng.

Dữ liệu local được thay qua adapter `bom-template`: sao lưu D1 và xuất preimage, xóa toàn bộ BOM nháp/template cũ, sau đó nạp đúng một composition template cho mỗi Item `TRỌN BỘ`. Không chạy importer trực tiếp ngoài runner contract.
