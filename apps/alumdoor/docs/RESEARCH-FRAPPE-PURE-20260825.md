# Nghiên cứu nền — Alumdoor Frappe Pure

> Ngày khóa nghiên cứu: 2026-08-25  
> Trạng thái: hoàn tất Pha 1, làm đầu vào cho `BRD.md`  
> Phạm vi: xưởng cửa nhôm/cửa cuốn nhỏ, bán theo số đo, sản xuất theo đơn, kho số lượng, mua hàng và thu tiền đơn giản.

## 1. Kết luận ngắn

Alumdoor không cần ERPNext. Frappe thuần đủ làm hệ thống ghi nhận và cưỡng chế nghiệp vụ nếu:

1. Frappe/MariaDB là nguồn dữ liệu duy nhất.
2. Mọi công thức giá, kích thước, cấu kiện và điều kiện duyệt chạy ở service/controller phía server.
3. Forge chỉ là giao diện nhập nhanh, hiển thị tức thời và gọi API.
4. Đơn hàng thật là điểm bắt đầu; không có bước báo giá.
5. Một lệnh sản xuất gắn với một đơn hàng, nhưng từng bộ cửa có mã theo dõi riêng.
6. Chỉ xác nhận phiếu xuất kho mới khóa đơn hàng.
7. Bản đầu giữ kho theo số lượng, không triển khai giá vốn hay sổ kế toán.

Đây là thiết kế vừa đủ cho xưởng ít người: ít vai trò, ít chứng từ, nhưng mọi thay đổi quan trọng đều có lý do, phiên bản và dấu vết.

## 2. Mổ nguồn nội bộ theo 7 lát

### 2.1 File danh mục sản phẩm

Nguồn: `C:\Users\Admin\Downloads\New folder (3)\danh mục sản phẩm.xlsx`.

| Lát | Kết quả |
|---|---|
| Cấu trúc | 2 sheet; bảng chính `Sheet1!A1:K288`, bảng phụ VAT/đợt thanh toán `Sheet2!A1:B8` |
| Khối lượng | 287 dòng sản phẩm, 11 cột |
| Nhóm logic | Motor 75; Phụ kiện 74; Cửa Đài Loan 63; Cửa Úc 27; Cửa Đức 17; Cửa Lưới 12; Cửa Siêu Trường 10; Bình lưu điện 4; Đài Loan Inox 4; cửa kéo Đài Loan 1 |
| ĐVT | m² 120; bộ 58; m 45; cái 41; kg 9; con 9; cặp 3; cây 2 |
| Chất lượng | Không thiếu mã/tên/nhóm/ĐVT; 2 dòng thiếu giá niêm yết |
| Trùng khóa tự nhiên | 7 mã bị lặp; có mã lặp 3 lần |
| Quy tắc nhìn thấy | 17 mã cửa Đức có cột “có ray tặng”; giá/ĐVT không đồng nhất giữa các loại hàng |

Hệ quả thiết kế:

- Mã hàng là khóa tự nhiên khi import, nhưng phải từ chối cả file nếu mã trùng trong cùng file.
- Giá trong file là dữ liệu nguồn cần chuẩn hóa thành số nguyên VND, không lưu chuỗi có dấu chấm và chữ `đ`.
- Không ép mọi mặt hàng về m². `Số lượng + ĐVT` và `Khối lượng tính tiền + ĐVT tính tiền` là hai cặp độc lập.
- Sheet 2 chỉ là ví dụ hợp đồng; không được biến thành lịch thanh toán bắt buộc của mọi đơn.

### 2.2 Tài liệu và dữ liệu vận hành đã có

| Nguồn | Dùng làm gì | Không được suy ra |
|---|---|---|
| `docs/nguon/` và các file gốc đã trích | Mã, giá, phụ thu, công thức chia lá, cấu kiện | Không tự bịa giá trị thiếu |
| `docs/decisions/ALUMDOOR-QUYET-DINH-CHU-XUONG-20260822.md` | Quyết định kỹ thuật đã được chủ xưởng phân xử | Không để tài liệu cũ thắng quyết định mới |
| `docs/sales/ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md` | Đối chiếu gói bán/cấu kiện | Không coi màn demo cũ là nguồn sự thật |
| Cuộc grill 117 câu kết thúc 2026-08-25 | Quy trình, quyền, khóa sửa, duyệt, kho, mua, thu tiền | Không thêm ERP/kế toán ngoài phạm vi |

Thứ tự thắng khi mâu thuẫn:

1. Quyết định trực tiếp mới nhất của chủ xưởng.
2. Bảng giá/tài liệu chính thức và số liệu thực tế.
3. Quyết định kỹ thuật đã ghi thành văn.
4. Màn hình/code cũ chỉ dùng để phát hiện hành vi cần kiểm chứng.

## 3. Nghiên cứu thị trường và nền tảng theo 5 lớp

### Lớp 1 — Nền tảng Frappe

- Frappe tự sinh REST cho DocType và cho phép gọi whitelisted method; vì vậy Forge có thể làm giao diện riêng mà không cần ERPNext: [Frappe REST API](https://docs.frappe.io/framework/user/en/guides/integration/rest_api).
- Controller hooks có các mốc validate/save/submit/cancel; phù hợp để cưỡng chế giá, duyệt lại và khóa sửa ở server: [Frappe Controllers](https://docs.frappe.io/framework/user/en/basics/doctypes/controllers).
- DocType là mô hình dữ liệu cốt lõi và sinh bảng MariaDB theo metadata: [Frappe DocTypes](https://docs.frappe.io/framework/user/en/basics/doctypes).
- Quyền theo Role/DocType có sẵn, nhưng hành động nhạy cảm vẫn phải kiểm tra server: [Frappe Users and Permissions](https://docs.frappe.io/framework/user/en/basics/users-and-permissions).
- Document API hỗ trợ so sánh bản trước khi lưu, thuận lợi cho diff và bắt ghi lý do sửa: [Frappe Document API](https://docs.frappe.io/framework/user/en/api/document).
- Print Format hỗ trợ HTML/Jinja và PDF, phù hợp yêu cầu preview/in file khách ngay từ đơn hàng: [Frappe Printing](https://docs.frappe.io/framework/user/en/desk/printing).

### Lớp 2 — Đối chiếu sản phẩm cùng loại

- Odoo tách Sales Order, Manufacturing Order, components và stock transfers; BOM nổ cấu kiện vào lệnh sản xuất. Alumdoor kế thừa nguyên lý snapshot nhưng giảm xuống một lệnh sản xuất/đơn vì xưởng ít người: [Odoo Manufacturing Orders and Work Orders](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/manufacturing/basic_setup/manufacturing_work_orders.html).
- Odoo cho phép 1/2/3 bước sản xuất tùy mức kiểm soát. Alumdoor chọn luồng ngắn: đơn → lệnh sản xuất → phiếu xuất → sẵn sàng giao; không dựng routing/work center ở bản đầu.

### Lớp 3 — Chuẩn truy vết và vận hành

- GS1 phân biệt lot và serial; từng đối tượng vật lý có thể dùng serial riêng và vẫn liên kết batch/lot. Điều này ủng hộ mã `DH-...-01` cho từng bộ cửa: [GS1 Global Traceability Standard](https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard).
- NIST khuyến nghị nối kế hoạch bán, tồn và vận hành để nhu cầu vật tư hiện sớm. Alumdoor áp dụng ở mức cảnh báo thiếu vật tư trên lệnh sản xuất, không tự sinh đề xuất mua: [NIST guidance for small manufacturers](https://www.nist.gov/feature-stories/how-small-manufacturers-can-develop-risk-management-strategies-their-supply-chains).

### Lớp 4 — Tiếng người dùng xưởng nhỏ

- Một xưởng 14 người mô tả tồn kho nhanh lệch vì Google Sheet không có đối soát và không biết chi tiết đang ở đâu; phản hồi nhấn mạnh phần mềm chỉ hữu ích nếu thao tác đủ đơn giản để bắt buộc dùng: [Shop-floor problem discussion](https://www.reddit.com/r/manufacturing/comments/19crx0k/need_something_to_solve_our_shop_floor_problem/).
- Một xưởng khác có ERP nhưng sản xuất vẫn quay lại bảng tính vì màn nhập chậm và quy trình không bám vận hành; bài học là không ôm đầy đủ ERP mà phải ưu tiên màn tạo đơn, lệnh sản xuất và xuất vật tư: [Small manufacturer ERP discussion](https://www.reddit.com/r/ERP/comments/1qsaw1g/small_manufactturer_outgrowing_current_erp_need/).

### Lớp 5 — Ràng buộc địa phương và thực tế Alumdoor

- Giao diện dùng tiếng Việt, VND nguyên, ngày `dd/mm/yyyy`, tìm không dấu, số tiền phân cách hàng nghìn bằng dấu chấm.
- VAT ở Alumdoor chỉ là phép tính thương mại trên đơn, không phải mô-đun kế toán/thuế.
- Xưởng ít người nên ba vai trò thực tế là Chủ xưởng, Kế toán và Sale; không tạo vai trò sản xuất/kho riêng ở bản đầu.
- Khách chủ yếu là đại lý; dữ liệu khách và bảng giá phải tự điền theo snapshot nhưng vẫn cho đổi có kiểm soát.

## 4. Bài học đưa thẳng vào BRD

1. Không sao chép màn cũ; sao chép nghiệp vụ đã được tài liệu và chủ xưởng xác nhận.
2. Không để frontend tự quyết giá hay cấu kiện.
3. Không dùng một cột `Số lượng` cho cả số cái sản xuất và số đo tính tiền.
4. Không để SKU có `MTN`, `STĐ` hoặc màu sẵn vẫn mở dropdown mâu thuẫn.
5. Không cho lưu khi thiếu giá, sai màu, vượt kích thước hoặc thiếu cấu hình bắt buộc.
6. Không khóa đơn khi mới lập phiếu xuất nháp; khóa tại lúc xác nhận phiếu xuất.
7. Mọi sửa đổi sau duyệt đều hủy duyệt cũ và ghi before/after + lý do.
8. Phụ thu vận chuyển là theo chuyến/toàn đơn, không nhân theo số bộ.
9. Gói bán chỉ nổ cấu kiện khi mã hàng được đánh dấu trọn bộ.
10. Import phải nguyên tử, lưu file nguồn và báo lỗi theo dòng/cột.

## 5. Search Audit Log

| Lượt | Truy vấn/phương pháp | Nguồn chính đã đọc | Kết quả đưa vào thiết kế |
|---:|---|---|---|
| 1 | Tìm tài liệu chính thức Frappe về DocType, REST, controller, quyền, in | 6 trang docs.frappe.io | Chốt kiến trúc Forge → service → DocType; server lifecycle là điểm cưỡng chế |
| 2 | So sánh hệ thống manufacturing phổ biến | Odoo Manufacturing official docs | Giữ Sales Order/MO/component snapshot, giản lược work center/routing |
| 3 | Chuẩn và hướng dẫn xưởng nhỏ | GS1, NIST | Mã theo dõi từng bộ cửa; nối bán–vật tư–sản xuất |
| 4 | Tiếng người dùng | 2 thảo luận xưởng nhỏ | Ưu tiên thao tác ít bước, dữ liệu vận hành tức thời, tránh ERP nặng |
| 5 | Đọc workbook bằng artifact-tool | `danh mục sản phẩm.xlsx` | 287 mã, 10 nhóm logic, 8 ĐVT; phát hiện trùng mã/thiếu giá |

## 6. Cổng kết thúc Pha 1

- [x] Đọc dữ liệu nội bộ và quyết định chủ xưởng.
- [x] Đọc tối thiểu 10 nguồn thuộc 5 lớp.
- [x] Xác định ranh giới Frappe thuần, không ERPNext.
- [x] Xác định các sai lệch lớn của BRD/màn cũ.
- [x] Đủ đầu vào để viết lại BRD hiện hành.
