# Alumdoor Field Ledger

Tài liệu này là sổ trường dữ liệu canonical cho các danh mục còn thiếu sau khi đối chiếu dữ liệu nguồn của xưởng.

Trạng thái: **ĐÃ TẠO 14 DOCTYPE, ĐÃ MIGRATE, ĐÃ NẠP 8 GÓI BÁN VÀ ĐÃ KIỂM TRA NGÀY 2026-08-25**.

Đã nạp dữ liệu có căn cứ: 264 đối tác, 3 nhóm đối tác, 11 bộ phận, 5 nhân viên, 4 bảng giá, 19 quy cách, 4 nguyên nhân lỗi, 1 chính sách bảo hành, 9 đơn giá sơn, 9 quỹ/tài khoản và 7 loại thu–chi. `Alumdoor Item Price`, `Alumdoor Operation Standard` và `Alumdoor Work Shift` đã có cấu trúc nhưng chưa seed vì tài liệu chưa xác định chắc dòng bảng giá, số phút định mức hoặc giờ bắt đầu/kết thúc ca.

## 1. Quy ước

- Backend canonical: Frappe v16 + MariaDB.
- Trường hệ thống `name`, `owner`, `creation`, `modified`, `modified_by`, `docstatus`, `idx` dùng chuẩn Frappe, không lặp lại trong từng bảng.
- Tiền dùng `Currency`, phần trăm dùng `Percent`, kích thước lưu theo đơn vị ghi rõ trong tên trường.
- Mã danh mục dùng chữ hoa, số, gạch ngang hoặc gạch dưới; chuẩn hóa tại server trước khi kiểm tra trùng.
- `enabled = 0` là ngừng sử dụng; không xóa master đã được chứng từ tham chiếu.
- Quyền ghi bên dưới phải được chặn ở server bằng Frappe Role Permission, không chỉ ẩn nút trên giao diện.

## 2. Danh mục đã có

| Màn | DocType | Trạng thái |
|---|---|---|
| Vật tư hàng hóa | `Alumdoor Item` | Đã có |
| Nhóm vật tư | `Alumdoor Item Group` | Đã có |
| Đơn vị tính | `Alumdoor UOM` | Đã có |
| Kho | `Alumdoor Warehouse` | Đã có master, chưa có sổ kho |
| Loại bề mặt | `Surface Finish` | Đã có |
| Màu sắc & bề mặt | `Alumdoor Color` | Đã có |
| Loại cửa, hệ cửa, thuộc tính, công thức, gói bán, quy tắc cấu kiện và giá | Các DocType cấu hình hiện tại | Đã có nền |

## 3. Danh mục đối tác

### 3.1 `Alumdoor Partner Group` — Nhóm đối tác

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `group_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Chuẩn hóa uppercase; chỉ `[A-Z0-9_-]` | code-auto | Sinh từ tên, cho sửa trước lần lưu đầu | Mọi vai trò xem; Quản trị danh mục sửa | Mã ổn định của nhóm |
| `group_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Mọi vai trò xem; Quản trị danh mục sửa | Ví dụ Đại lý, Khách lẻ, Nhà cung cấp |
| `partner_kind` | Select | varchar(30) | Bắt buộc | `Customer`, `Supplier`, `Both` | select-enum `*` | — | Mọi vai trò xem; Quản trị danh mục sửa | Giới hạn loại đối tác thuộc nhóm |
| `default_price_list` | Link → `Alumdoor Price List` | varchar(140) | Có thể rỗng | Bảng giá phải bật và phù hợp loại đối tác | link-field | Chọn nhóm trên đối tác → điền bảng giá | Bán hàng/Kế toán xem; Quản trị giá sửa | Bảng giá mặc định |
| `default_discount_percent` | Percent | decimal(9,6) | Mặc định 0 | Từ 0 đến 100 | number | Mặc định 0 | Bán hàng xem; Quản trị giá sửa | Chiết khấu mặc định, Pricing Rule vẫn là nguồn tính cuối |
| `payment_term_days` | Int | int | Mặc định 0 | Không âm | number | Mặc định 0 | Bán hàng/Kế toán xem; Quản trị danh mục sửa | Số ngày thanh toán dự kiến |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Mọi vai trò xem; Quản trị danh mục sửa | Tắt nhóm không cho chọn mới |
| `sort_order` | Int | int | Mặc định 0 | Không âm | number | Mặc định 0 | Mọi vai trò xem; Quản trị danh mục sửa | Thứ tự hiển thị |
| `description` | Small Text | text | Có thể rỗng | Tối đa 500 ký tự | textarea | — | Mọi vai trò xem; Quản trị danh mục sửa | Ghi chú phạm vi nhóm |

### 3.2 `Alumdoor Partner` — Khách hàng/đại lý/nhà cung cấp

Một đối tác có thể vừa là khách hàng vừa là nhà cung cấp; không tạo hai bản ghi trùng.

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `partner_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Prefix `KH`, `NCC` hoặc `DT`; cấp số server | code-auto | Counter theo `partner_kind` | Mọi vai trò xem; không sửa sau tạo | Mã đối tác canonical |
| `partner_name` | Data | varchar(140) | Bắt buộc | Chuẩn hóa khoảng trắng; tìm kiếm không dấu | text `*` | Có thể lấy từ Contact/OCR khi nhập | Mọi vai trò xem; Bán hàng/Mua hàng/Quản trị sửa | Tên dùng trên đơn hàng và chứng từ |
| `partner_kind` | Select | varchar(30) | Bắt buộc | `Customer`, `Supplier`, `Both` | select-enum `*` | Suy ra từ luồng tạo nhưng cho sửa | Mọi vai trò xem; Quản trị danh mục sửa | Phân loại nghiệp vụ |
| `partner_group` | Link → `Alumdoor Partner Group` | varchar(140) | Bắt buộc | Nhóm phải bật và khớp `partner_kind` | link-field `*` | Theo luồng tạo: Đại lý/Khách lẻ/NCC | Mọi vai trò xem; Bán hàng/Mua hàng sửa | Điều khiển bảng giá và điều khoản |
| `tax_code` | Data | varchar(30) | Duy nhất khi có | 10 hoặc 13 chữ số; cho rỗng với khách lẻ | text | Từ hồ sơ đối tác | Kế toán/Quản trị xem sửa; vai trò khác chỉ xem khi được cấp | Mã số thuế |
| `assigned_employee` | Link → `Alumdoor Employee` | varchar(140) | Có thể rỗng | Nhân viên phải đang hoạt động | link-field | Theo nhóm/khu vực hoặc người tạo | Bán hàng/Kế toán xem; Trưởng bán hàng sửa | Người phụ trách trong file nguồn |
| `primary_contact` | Link → `Contact` | varchar(140) | Có thể rỗng | Contact phải liên kết lại đúng Partner | link-field | Tạo Contact mới xong tự chọn | Vai trò được cấp xem/sửa | Tái sử dụng Contact chuẩn Frappe |
| `primary_address` | Link → `Address` | varchar(140) | Có thể rỗng | Address phải liên kết lại đúng Partner | link-field | Tạo Address mới xong tự chọn | Vai trò được cấp xem/sửa | Tái sử dụng Address chuẩn Frappe |
| `phone` | Data | varchar(30) | Index, có thể rỗng | Chuẩn hóa số Việt Nam; cảnh báo trùng 4 số cuối | phone | Từ Contact chính | Bán hàng/Mua hàng/Kế toán xem sửa | Tìm nhanh và gọi/Zalo |
| `email` | Data | varchar(140) | Có thể rỗng | Email hợp lệ | text | Từ Contact chính | Vai trò được cấp xem/sửa | Nhận báo giá/chứng từ |
| `default_price_list` | Link → `Alumdoor Price List` | varchar(140) | Có thể rỗng | Bảng giá phải bật | link-field | Từ `partner_group.default_price_list`; không đè khi người dùng đã sửa | Bán hàng/Kế toán xem; Trưởng bán hàng sửa | Ghi đè bảng giá của nhóm |
| `credit_limit` | Currency | decimal(21,9) | Mặc định 0 | Không âm | money | Mặc định 0 | Kế toán/Chủ xưởng xem sửa; vai trò khác ẩn | Hạn mức cảnh báo công nợ, chưa phải sổ kế toán |
| `payment_term_days` | Int | int | Mặc định 0 | Không âm | number | Từ nhóm đối tác | Kế toán/Bán hàng xem; Kế toán sửa | Hạn thanh toán mặc định |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Mọi vai trò xem; Quản trị danh mục sửa | Đối tác tắt không dùng cho chứng từ mới |
| `notes` | Small Text | text | Có thể rỗng | Tối đa 1000 ký tự | textarea | — | Vai trò được cấp xem/sửa | Ghi chú vận hành |

## 4. Nhân sự và bộ phận

### 4.1 `Alumdoor Department` — Bộ phận

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `department_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase, chỉ mã an toàn | code-auto | Sinh từ tên | Mọi vai trò xem; Quản trị nhân sự sửa | Mã bộ phận |
| `department_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Mọi vai trò xem; Quản trị nhân sự sửa | Ví dụ Bán hàng, Kho, Đức, Úc, Đài Loan, Lưới, Siêu trường, Lò sơn |
| `department_type` | Select | varchar(30) | Bắt buộc | `Sales`, `Accounting`, `Warehouse`, `Production`, `Coating`, `Delivery`, `Other` | select-enum `*` | — | Mọi vai trò xem; Quản trị nhân sự sửa | Dùng lọc lịch và quyền |
| `parent_department` | Link → `Alumdoor Department` | varchar(140) | Có thể rỗng | Không tự trỏ; không tạo vòng lặp | link-field | — | Mọi vai trò xem; Quản trị nhân sự sửa | Hỗ trợ cây bộ phận |
| `is_group` | Check | tinyint(1) | Mặc định 0 | Nhóm không được gán trực tiếp cho nhân viên/công đoạn | checkbox | Mặc định tắt | Mọi vai trò xem; Quản trị nhân sự sửa | Phân biệt nút nhóm |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Mọi vai trò xem; Quản trị nhân sự sửa | Trạng thái sử dụng |
| `sort_order` | Int | int | Mặc định 0 | Không âm | number | Mặc định 0 | Mọi vai trò xem; Quản trị nhân sự sửa | Thứ tự hiển thị |

### 4.2 `Alumdoor Employee` — Nhân viên/người phụ trách

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `employee_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Counter `NV`; không sửa sau tạo | code-auto | Server cấp số | Mọi vai trò xem; không sửa | Mã nhân viên |
| `employee_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự; tìm không dấu | text `*` | Từ User khi được liên kết | Mọi vai trò xem; Quản trị nhân sự sửa | Tên người phụ trách |
| `user` | Link → `User` | varchar(140) | Duy nhất khi có | User phải bật; cho rỗng nếu nhân viên không đăng nhập | link-field | Chọn User → điền tên/email | Quản trị nhân sự xem sửa | Tách hồ sơ nhân viên khỏi tài khoản đăng nhập |
| `department` | Link → `Alumdoor Department` | varchar(140) | Bắt buộc | Bộ phận phải bật và không phải nhóm | link-field `*` | — | Mọi vai trò xem; Quản trị nhân sự sửa | Bộ phận chính |
| `job_title` | Data | varchar(140) | Có thể rỗng | Tối đa 140 ký tự | text | — | Mọi vai trò xem; Quản trị nhân sự sửa | Chức danh |
| `phone` | Data | varchar(30) | Có thể rỗng | Số điện thoại Việt Nam | phone | Từ User/Contact nếu có | Vai trò được cấp xem; Quản trị nhân sự sửa | Liên hệ nội bộ |
| `email` | Data | varchar(140) | Có thể rỗng | Email hợp lệ | text | Từ User | Vai trò được cấp xem; Quản trị nhân sự sửa | Email công việc |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Mọi vai trò xem; Quản trị nhân sự sửa | Nhân viên nghỉ không được gán mới |

## 5. Nhóm giá và bảng giá

### 5.1 `Alumdoor Price List` — Đầu bảng giá

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `price_list_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Sinh từ tên | Mọi vai trò xem; Quản trị giá sửa | Ví dụ BAN-DAI-LY, BAN-KHACH-LE, MUA-VAO |
| `price_list_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Mọi vai trò xem; Quản trị giá sửa | Tên bảng giá |
| `price_usage` | Select | varchar(20) | Bắt buộc | `Selling`, `Buying`, `Cost` | select-enum `*` | — | Mọi vai trò xem; Quản trị giá sửa | Phân biệt giá bán, mua và giá vốn tham chiếu |
| `partner_group` | Link → `Alumdoor Partner Group` | varchar(140) | Có thể rỗng | Nhóm phải phù hợp `price_usage` | link-field | — | Bán hàng/Mua hàng/Kế toán xem; Quản trị giá sửa | Bảng giá mặc định cho nhóm đối tác |
| `currency` | Link → `Currency` | varchar(140) | Bắt buộc, mặc định VND | Currency phải bật | link-field `*` | VND | Mọi vai trò xem; Quản trị giá sửa | Tiền tệ |
| `tax_included` | Check | tinyint(1) | Mặc định 0 | Chỉ 0/1 | checkbox | Mặc định không gồm thuế | Bán hàng/Kế toán xem; Quản trị giá sửa | Tránh hiểu sai đơn giá |
| `valid_from` | Date | date | Có thể rỗng | Không sau `valid_to` | date | Hôm nay khi tạo | Mọi vai trò xem; Quản trị giá sửa | Bắt đầu hiệu lực |
| `valid_to` | Date | date | Có thể rỗng | Không trước `valid_from` | date | — | Mọi vai trò xem; Quản trị giá sửa | Kết thúc hiệu lực |
| `priority` | Int | int | Mặc định 100 | Không âm | number | 100 | Mọi vai trò xem; Quản trị giá sửa | Chọn bảng giá khi nhiều bảng cùng khớp |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Mọi vai trò xem; Quản trị giá sửa | Trạng thái sử dụng |
| `notes` | Small Text | text | Có thể rỗng | Tối đa 1000 ký tự | textarea | — | Mọi vai trò xem; Quản trị giá sửa | Ghi chú chính sách |

### 5.2 `Alumdoor Item Price` — Dòng giá vật tư/gói bán

Giá cơ sở nằm ở bảng này; `Alumdoor Pricing Rule` tiếp tục xử lý công thức, phụ thu và chiết khấu.

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `price_list` | Link → `Alumdoor Price List` | varchar(140) | Bắt buộc, index | Bảng giá phải bật | link-field `*` | Nhớ bảng giá đang mở | Mọi vai trò xem; Quản trị giá sửa | Đầu bảng giá |
| `item` | Link → `Alumdoor Item` | varchar(140) | Một trong `item`/`sales_package` | Item phải bật | link-field | Chọn Item → điền UOM | Mọi vai trò xem; Quản trị giá sửa | Giá cho vật tư/cấu kiện |
| `sales_package` | Link → `Sales Package` | varchar(140) | Một trong `item`/`sales_package` | Gói phải bật; cấm đồng thời có `item` | link-field | Chọn gói → điền UOM/tiền tệ | Mọi vai trò xem; Quản trị giá sửa | Giá cho gói khách mua |
| `uom` | Link → `Alumdoor UOM` | varchar(140) | Bắt buộc | UOM tồn tại; phải phù hợp đối tượng | link-field `*` | Từ Item hoặc Sales Package | Mọi vai trò xem; Quản trị giá sửa | Đơn vị áp giá |
| `price_basis` | Select | varchar(30) | Bắt buộc | `Per Qty`, `Per Meter`, `Per Area`, `Per Set`, `Per Kg` | select-enum `*` | Suy ra từ UOM, cho sửa | Mọi vai trò xem; Quản trị giá sửa | Cơ sở nhân đơn giá |
| `rate` | Currency | decimal(21,9) | Bắt buộc | Không âm | money `*` | — | Mọi vai trò xem; Quản trị giá sửa | Đơn giá |
| `min_qty` | Float | decimal(21,9) | Mặc định 0 | Không âm | number | 0 | Mọi vai trò xem; Quản trị giá sửa | Ngưỡng số lượng tối thiểu |
| `valid_from` | Date | date | Có thể rỗng | Không sau `valid_to` | date | Từ đầu bảng giá | Mọi vai trò xem; Quản trị giá sửa | Bắt đầu hiệu lực của dòng |
| `valid_to` | Date | date | Có thể rỗng | Không trước `valid_from` | date | Từ đầu bảng giá | Mọi vai trò xem; Quản trị giá sửa | Kết thúc hiệu lực của dòng |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Mọi vai trò xem; Quản trị giá sửa | Trạng thái sử dụng |
| `source_reference` | Data | varchar(255) | Có thể rỗng | Tối đa 255 ký tự | text | Ghi file/sheet/dòng khi import | Mọi vai trò xem; Quản trị giá sửa | Truy vết dữ liệu nguồn |

Unique nghiệp vụ tại server: `price_list + item/sales_package + uom + min_qty + valid_from`; không cho hai dòng hiệu lực chồng nhau nếu cùng khóa.

## 6. Quy cách vật tư

### `Alumdoor Material Specification` — Quy cách nhôm/lá/ray/trục/lưới

Không lưu công thức cửa tại đây; công thức kích thước vẫn thuộc `Door Formula` và `Component Rule`.

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `spec_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Từ Item + phiên bản | Mọi vai trò xem; Quản trị kỹ thuật sửa | Mã quy cách |
| `spec_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | Từ tên Item | Mọi vai trò xem; Quản trị kỹ thuật sửa | Tên hiển thị |
| `item` | Link → `Alumdoor Item` | varchar(140) | Bắt buộc, index | Item phải bật | link-field `*` | Chọn Item → điền tên/UOM | Mọi vai trò xem; Quản trị kỹ thuật sửa | Item canonical |
| `profile_type` | Select | varchar(30) | Bắt buộc | `Slat`, `Rail`, `Shaft`, `V4-V5`, `Mesh`, `Accessory`, `Other` | select-enum `*` | Theo nhóm Item | Mọi vai trò xem; Quản trị kỹ thuật sửa | Loại quy cách |
| `thickness_min_mm` | Float | decimal(12,4) | Có thể rỗng | Dương; không lớn hơn max | number | Parse từ thông số nguồn, người duyệt xác nhận | Mọi vai trò xem; Quản trị kỹ thuật sửa | Độ dày thấp nhất |
| `thickness_max_mm` | Float | decimal(12,4) | Có thể rỗng | Dương; không nhỏ hơn min | number | Parse từ thông số nguồn, người duyệt xác nhận | Mọi vai trò xem; Quản trị kỹ thuật sửa | Độ dày cao nhất |
| `profile_pitch_mm` | Float | decimal(12,4) | Có thể rỗng | Dương | number | Parse “bản lá” | Mọi vai trò xem; Quản trị kỹ thuật sửa | Bản lá dùng tính số lá |
| `weight_kg_per_m` | Float | decimal(21,9) | Có thể rỗng | Dương | number | Parse TL kg/m | Mọi vai trò xem; Quản trị kỹ thuật sửa | Quy đổi mét sang kg |
| `weight_kg_per_m2` | Float | decimal(21,9) | Có thể rỗng | Dương | number | Parse barem kg/m² | Mọi vai trò xem; Quản trị kỹ thuật sửa | Quy đổi diện tích sang kg |
| `standard_length_m` | Float | decimal(12,4) | Có thể rỗng | Dương | number | Từ quy cách nhập | Mọi vai trò xem; Quản trị kỹ thuật sửa | Chiều dài thanh/cuộn chuẩn |
| `inventory_tracking_mode` | Select | varchar(30) | Bắt buộc | `Piece`, `Bar`, `Slat`, `Area`, `Weight`, `Set` | select-enum `*` | Theo Item/UOM | Kho/Sản xuất xem; Quản trị kỹ thuật sửa | Cách theo dõi lô và phần dư |
| `default_surface_finish` | Link → `Surface Finish` | varchar(140) | Có thể rỗng | Bề mặt phải bật | link-field | Từ Item nếu có | Mọi vai trò xem; Quản trị kỹ thuật sửa | Bề mặt mặc định |
| `effective_from` | Date | date | Có thể rỗng | Không sau `effective_to` | date | Hôm nay | Mọi vai trò xem; Quản trị kỹ thuật sửa | Hiệu lực quy cách |
| `effective_to` | Date | date | Có thể rỗng | Không trước `effective_from` | date | — | Mọi vai trò xem; Quản trị kỹ thuật sửa | Hết hiệu lực |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Mọi vai trò xem; Quản trị kỹ thuật sửa | Trạng thái sử dụng |
| `source_reference` | Data | varchar(255) | Có thể rỗng | Tối đa 255 ký tự | text | Ghi file/sheet/dòng khi import | Mọi vai trò xem; Quản trị kỹ thuật sửa | Truy vết nguồn |

## 7. Sản xuất

### 7.1 `Alumdoor Operation Standard` — Công đoạn và định mức thời gian

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `operation_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Sinh từ tên | Sản xuất xem; Quản trị sản xuất sửa | Mã công đoạn |
| `operation_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Sản xuất xem; Quản trị sản xuất sửa | Tên công đoạn |
| `department` | Link → `Alumdoor Department` | varchar(140) | Bắt buộc | Bộ phận phải bật và thuộc Production/Coating | link-field `*` | Theo hệ cửa | Sản xuất xem; Quản trị sản xuất sửa | Bộ phận chịu trách nhiệm |
| `door_system` | Link → `Door System` | varchar(140) | Có thể rỗng | Hệ cửa phải bật | link-field | — | Sản xuất xem; Quản trị sản xuất sửa | Phạm vi hệ cửa |
| `sales_package` | Link → `Sales Package` | varchar(140) | Có thể rỗng | Gói phải bật và khớp hệ cửa | link-field | Chọn gói → điền hệ cửa | Sản xuất xem; Quản trị sản xuất sửa | Định mức riêng cho gói |
| `unit_basis` | Select | varchar(30) | Bắt buộc | `Per Set`, `Per Area`, `Per Piece`, `Per Meter` | select-enum `*` | Theo UOM gói | Sản xuất xem; Quản trị sản xuất sửa | Cơ sở tính thời gian |
| `setup_minutes` | Float | decimal(12,4) | Mặc định 0 | Không âm | number | 0 | Sản xuất xem; Quản trị sản xuất sửa | Thời gian chuẩn bị một lệnh |
| `standard_minutes` | Float | decimal(12,4) | Bắt buộc | Lớn hơn 0 | number `*` | — | Sản xuất xem; Quản trị sản xuất sửa | Phút chuẩn trên một đơn vị |
| `sequence` | Int | int | Mặc định 10 | Không âm | number | Tăng theo công đoạn trước | Sản xuất xem; Quản trị sản xuất sửa | Thứ tự công đoạn |
| `effective_from` | Date | date | Có thể rỗng | Không sau `effective_to` | date | Hôm nay | Sản xuất xem; Quản trị sản xuất sửa | Bắt đầu hiệu lực |
| `effective_to` | Date | date | Có thể rỗng | Không trước `effective_from` | date | — | Sản xuất xem; Quản trị sản xuất sửa | Kết thúc hiệu lực |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Sản xuất xem; Quản trị sản xuất sửa | Trạng thái sử dụng |

### 7.2 `Alumdoor Work Shift` — Ca làm việc

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `shift_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Sinh từ tên | Sản xuất xem; Quản trị sản xuất sửa | Mã ca |
| `shift_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Sản xuất xem; Quản trị sản xuất sửa | Ví dụ Hành chính, Tăng ca |
| `start_time` | Time | time | Bắt buộc | Khác `end_time` | text `*` | — | Sản xuất xem; Quản trị sản xuất sửa | Giờ bắt đầu |
| `end_time` | Time | time | Bắt buộc | Tính đúng ca qua ngày nếu có | text `*` | — | Sản xuất xem; Quản trị sản xuất sửa | Giờ kết thúc |
| `break_minutes` | Int | int | Mặc định 0 | Không âm và nhỏ hơn thời lượng ca | number | 0 | Sản xuất xem; Quản trị sản xuất sửa | Tổng phút nghỉ |
| `working_minutes` | Int | int | Read only | Server tự tính từ giờ ca trừ nghỉ | number readonly | Tự tính | Sản xuất xem; không sửa | Năng lực lịch sản xuất |
| `is_overtime` | Check | tinyint(1) | Mặc định 0 | Chỉ 0/1 | checkbox | Theo tên ca | Sản xuất xem; Quản trị sản xuất sửa | Phân biệt tăng ca |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Sản xuất xem; Quản trị sản xuất sửa | Trạng thái sử dụng |

## 8. Lỗi, bảo hành và đổi trả

### 8.1 `Alumdoor Fault Reason` — Nguyên nhân lỗi

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `reason_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Sinh từ tên | Các bộ phận xem; Quản trị bảo hành sửa | Mã nguyên nhân |
| `reason_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Các bộ phận xem; Quản trị bảo hành sửa | Ví dụ lỗi motor, lỗi sản xuất, lỗi NCC, lỗi khách |
| `responsible_party` | Select | varchar(30) | Bắt buộc | `Factory`, `Supplier`, `Customer`, `Transport`, `Other` | select-enum `*` | Theo nguyên nhân | Các bộ phận xem; Quản trị bảo hành sửa | Chủ thể chịu trách nhiệm |
| `requires_order_reference` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Các bộ phận xem; Quản trị bảo hành sửa | Bắt buộc truy số chứng từ gốc |
| `warranty_eligible` | Check | tinyint(1) | Mặc định 0 | Chỉ 0/1 | checkbox | Theo loại lỗi | Các bộ phận xem; Quản trị bảo hành sửa | Có thể xử lý theo bảo hành |
| `default_action` | Select | varchar(30) | Bắt buộc | `Inspect`, `Repair`, `Replace`, `Return Supplier`, `Charge Customer`, `Scrap` | select-enum `*` | Theo nguyên nhân | Các bộ phận xem; Quản trị bảo hành sửa | Hành động đề xuất mặc định |
| `requires_accounting_confirmation` | Check | tinyint(1) | Mặc định 0 | Chỉ 0/1 | checkbox | Bật cho lỗi sản xuất/NCC có chi phí | Kế toán/Quản trị xem sửa | Chặn đóng lỗi khi chưa xác nhận chi phí |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Các bộ phận xem; Quản trị bảo hành sửa | Trạng thái sử dụng |
| `description` | Small Text | text | Có thể rỗng | Tối đa 1000 ký tự | textarea | — | Các bộ phận xem; Quản trị bảo hành sửa | Hướng dẫn phân loại |

### 8.2 `Alumdoor Warranty Policy` — Chính sách bảo hành

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `policy_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Sinh từ tên | Các bộ phận xem; Quản trị bảo hành sửa | Mã chính sách |
| `policy_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Các bộ phận xem; Quản trị bảo hành sửa | Tên chính sách |
| `item` | Link → `Alumdoor Item` | varchar(140) | Một trong các trường phạm vi | Item phải bật | link-field | — | Các bộ phận xem; Quản trị bảo hành sửa | Chính sách riêng cho Item |
| `item_group` | Link → `Alumdoor Item Group` | varchar(140) | Một trong các trường phạm vi | Nhóm phải bật | link-field | — | Các bộ phận xem; Quản trị bảo hành sửa | Chính sách theo nhóm |
| `door_system` | Link → `Door System` | varchar(140) | Một trong các trường phạm vi | Hệ phải bật | link-field | — | Các bộ phận xem; Quản trị bảo hành sửa | Chính sách theo hệ cửa |
| `warranty_months` | Int | int | Bắt buộc | Không âm | number `*` | Ví dụ motor/bình điện = 12 tháng theo nguồn | Các bộ phận xem; Quản trị bảo hành sửa | Thời hạn bảo hành |
| `start_event` | Select | varchar(30) | Bắt buộc | `Delivery`, `Sales Order`, `Manufacturing` | select-enum `*` | Delivery | Các bộ phận xem; Quản trị bảo hành sửa | Mốc bắt đầu tính hạn |
| `supplier_return_allowed` | Check | tinyint(1) | Mặc định 0 | Chỉ 0/1 | checkbox | Bật khi có bảo hành NCC | Mua hàng/Kế toán xem; Quản trị bảo hành sửa | Cho phép tạo luồng trả NCC |
| `effective_from` | Date | date | Có thể rỗng | Không sau `effective_to` | date | Hôm nay | Các bộ phận xem; Quản trị bảo hành sửa | Bắt đầu hiệu lực |
| `effective_to` | Date | date | Có thể rỗng | Không trước `effective_from` | date | — | Các bộ phận xem; Quản trị bảo hành sửa | Kết thúc hiệu lực |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Các bộ phận xem; Quản trị bảo hành sửa | Trạng thái sử dụng |
| `terms` | Small Text | text | Có thể rỗng | Tối đa 2000 ký tự | textarea | — | Các bộ phận xem; Quản trị bảo hành sửa | Điều kiện loại trừ/ghi chú |

## 9. Gia công sơn

### `Alumdoor Coating Rate` — Bảng giá gia công sơn

Nhà gia công dùng `Alumdoor Partner` có `partner_kind = Supplier` hoặc `Both`; không tạo danh mục nhà sơn riêng.

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `rate_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Ghép NCC + loại + ngày | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Mã dòng giá |
| `supplier` | Link → `Alumdoor Partner` | varchar(140) | Bắt buộc, index | Đối tác phải là Supplier/Both và đang bật | link-field `*` | Theo nhà gia công được chọn | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Nhà gia công sơn |
| `coating_part` | Data | varchar(140) | Bắt buộc, index | Không rỗng | text `*` | Theo dòng nguồn | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Tách lá cửa, tấm cửa, song ngang, mắt võng, ray U76/U100 và V4 |
| `door_system` | Link → `Door System` | varchar(140) | Có thể rỗng | Hệ phải bật | link-field | Theo loại sơn trong nguồn | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Phạm vi hệ cửa |
| `item_group` | Link → `Alumdoor Item Group` | varchar(140) | Có thể rỗng | Nhóm phải bật | link-field | — | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Dùng cho ray/V4/lưới khi không theo hệ cửa |
| `surface_finish` | Link → `Surface Finish` | varchar(140) | Bắt buộc | Bề mặt phải bật | link-field `*` | Theo màu yêu cầu | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Loại xử lý bề mặt |
| `calculation_basis` | Select | varchar(40) | Bắt buộc | `Slat Meter`, `Area One Side`, `Area Two Sides`, `Per Meter`, `Fixed` | select-enum `*` | Theo loại cửa/cấu kiện | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Cách tính trong sheet Chi tiết sơn |
| `rate` | Currency | decimal(21,9) | Bắt buộc | Không âm | money `*` | — | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Đơn giá gia công |
| `minimum_charge` | Currency | decimal(21,9) | Mặc định 0 | Không âm | money | 0 | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Mức tối thiểu một phiếu |
| `currency` | Link → `Currency` | varchar(140) | Bắt buộc, mặc định VND | Currency phải bật | link-field | VND | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Tiền tệ |
| `effective_from` | Date | date | Có thể rỗng | Không sau `effective_to` | date | Hôm nay | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Bắt đầu hiệu lực |
| `effective_to` | Date | date | Có thể rỗng | Không trước `effective_from` | date | — | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Kết thúc hiệu lực |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Kho/Sơn/Kế toán xem; Quản trị giá mua sửa | Trạng thái sử dụng |
| `source_reference` | Data | varchar(255) | Có thể rỗng | Tối đa 255 ký tự | text | Ghi file/sheet/dòng khi import | Mọi vai trò được cấp xem; Quản trị giá mua sửa | Truy vết nguồn |

## 10. Thu–chi tối giản, không phải hệ kế toán ERPNext

Chỉ triển khai hai danh mục này khi bắt đầu module thu–chi. Chúng không phải hệ thống tài khoản kế toán kép.

### 10.1 `Alumdoor Money Account` — Quỹ/tài khoản ngân hàng

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `account_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Sinh từ loại + ngân hàng | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Mã quỹ/tài khoản |
| `account_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Tên hiển thị |
| `account_type` | Select | varchar(20) | Bắt buộc | `Cash`, `Bank` | select-enum `*` | — | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Tiền mặt hoặc ngân hàng |
| `bank_name` | Data | varchar(140) | Bắt buộc khi Bank | Tối đa 140 ký tự | text | — | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Tên ngân hàng |
| `account_number` | Data | varchar(50) | Bắt buộc khi Bank; duy nhất trong cùng ngân hàng | Không trùng cặp ngân hàng + số tài khoản | text | — | Kế toán/Chủ xưởng xem; vai trò khác che bớt; Quản trị tài chính sửa | Một số có thể xuất hiện ở hai ngân hàng khác nhau trong nguồn |
| `account_holder` | Data | varchar(140) | Có thể rỗng | 1–140 ký tự khi có | text | — | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Không tự bịa khi file nguồn chưa ghi rõ chủ tài khoản |
| `opening_balance` | Currency | decimal(21,9) | Mặc định 0 | Chỉ sửa trước khi có giao dịch | money | 0 | Kế toán trưởng/Chủ xưởng xem sửa | Số dư đầu kỳ, ghi audit |
| `currency` | Link → `Currency` | varchar(140) | Bắt buộc, mặc định VND | Currency phải bật | link-field | VND | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Tiền tệ |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Không tắt nếu còn chứng từ nháp dùng tài khoản | checkbox | Mặc định bật | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Trạng thái sử dụng |
| `sort_order` | Int | int | Mặc định 0 | Không âm | number | 0 | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Thứ tự hiển thị |

### 10.2 `Alumdoor Cashflow Category` — Loại thu/chi

| Field | Frappe | MariaDB | Ràng buộc | Server validate | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `category_code` | Data | varchar(140) | Bắt buộc, duy nhất, autoname | Uppercase; mã an toàn | code-auto | Sinh từ tên | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Mã loại thu/chi |
| `category_name` | Data | varchar(140) | Bắt buộc | 1–140 ký tự | text `*` | — | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Ví dụ thu công nợ, mua hàng trả ngay, chi lương |
| `flow_type` | Select | varchar(20) | Bắt buộc | `Receipt`, `Payment`, `Transfer` | select-enum `*` | Theo luồng tạo | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Chiều dòng tiền |
| `requires_partner` | Check | tinyint(1) | Mặc định 0 | Chỉ 0/1 | checkbox | Bật cho bán/mua/công nợ | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Bắt buộc chọn khách/NCC |
| `requires_order_reference` | Check | tinyint(1) | Mặc định 0 | Chỉ 0/1 | checkbox | Bật cho thu tiền hàng/chi mua hàng | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Bắt buộc số chứng từ nguồn |
| `default_money_account` | Link → `Alumdoor Money Account` | varchar(140) | Có thể rỗng | Tài khoản phải bật | link-field | Chọn loại → điền tài khoản, không đè ô đã sửa | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Smart default |
| `enabled` | Check | tinyint(1) | Mặc định 1 | Chỉ 0/1 | checkbox | Mặc định bật | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Trạng thái sử dụng |
| `sort_order` | Int | int | Mặc định 0 | Không âm | number | 0 | Kế toán/Chủ xưởng xem; Quản trị tài chính sửa | Thứ tự hiển thị |

## 11. Không tạo thành danh mục riêng

| Dữ liệu | Thiết kế đúng |
|---|---|
| Ray, motor, puly, lò xo, V4/V5, ba lá đáy | `Alumdoor Item` + Item Group + Configuration Attribute + Component Rule |
| Phụ thu, chiết khấu | `Alumdoor Pricing Rule` |
| Công thức rộng cắt lá, số lá, diện tích | `Door Formula` |
| Tồn theo khổ, màu, số lá; phần dư sau cắt | Chứng từ/lô tồn kho tương lai, không phải master |
| Theo dõi đơn hàng, lịch sản xuất, phiếu sơn, ca sản xuất thực tế | Màn nghiệp vụ tương lai |
| Hồ sơ lỗi/bảo hành cụ thể | Chứng từ lỗi/bảo hành tương lai; chỉ nguyên nhân và chính sách là master |

### 11.1 Quy ước số lượng cấu kiện

`Sales Package Component`, `Component Rule` và `Configured Product Component` tách hai đại lượng, không dùng chung một cột:

- `qty` + `uom`: số cấu kiện phải sản xuất/chuẩn bị cho phiếu xưởng, ví dụ 1 bộ cửa, 2 cái ray, 1 lá trung gian.
- `measure_qty` + `measure_uom`: khối lượng quy đổi để cắt vật tư và tính giá, ví dụ 10,5 m² cửa, 6 m ray, 3,5 m lá trung gian.
- `qty_formula`: nhân số cái theo số bộ cửa, ví dụ `quantity` hoặc `2 * quantity`.
- `measure_formula`: lấy công thức hình học, ví dụ `area`, `rail_length_m` hoặc `bottom_intermediate_length_m`.

Quy ước này bám `MS LIÊN BS.xlsx` sheet `ĐM`: cột I **TỔNG XUẤT (M-M2)** là khối lượng và cột J **Số lượng** là số cấu kiện. Giá `Per Meter`/`Item Price` dùng `measure_qty`; giá `Per Qty` dùng `qty`.

### 11.2 Gói bán đã nạp

| Mã gói | Nội dung | Cấu kiện chính |
|---|---|---|
| `GERMAN-AL548N-FULL` | Cửa Đức AL548N trọn bộ | 1 cửa, 2 ray, từng lá đáy/yếm/trung gian theo số cái; mét và m² lưu riêng |
| `AUSTRALIA-FULL` | Cửa Úc trọn bộ | 1 bộ cửa, 2 ray U70 không ron, 1 cặp Giá T |
| `TAIWAN-FULL` | Cửa Đài Loan trọn bộ theo 8 bậc diện tích | 1 bộ cửa, 2 ray U70 có ron, 1 V4, 1 trục 114 |
| `TAIWAN-SEPARATE` | Lá Đài Loan tách món | 1 bộ lá; đại lý tính rộng cắt, khách lẻ tính phủ bì ray |
| `TAIWAN-INOX-SEPARATE` | Lá Đài Loan inox tách món | 1 bộ lá inox; cách tính diện tích như gói tách món |
| `MESH-SEPARATE` | Cửa lưới tách món | 1 bộ lưới; lấy món nào tính món đó |
| `MESH-FULL` | Cửa lưới trọn bộ trên 10 m² | 2 lá Đài Loan, 1 lưới, 2 ray, 1 V4, 1 trục; tính giá tổng diện tích ba tấm |
| `SUPERWIDE-SEPARATE` | Cửa siêu trường tách món | 1 bộ lá; đại lý tính rộng cắt, khách lẻ tính phủ bì ray |

Bảy gói mới dùng 4 công thức hệ cửa, 100 `Component Rule` và 7 `Alumdoor Pricing Rule`. Thuộc tính `Check` và `Number` được chuẩn hóa về số trước khi chạy công thức, tránh chuỗi `"0"` bị hiểu là đúng. Giao diện Forge đã hiển thị đủ cả 8 gói bằng nhãn tiếng Việt.

Cửa Úc dưới 4 m² dùng `pricing_basis = SET`, `qty = số bộ` và đơn giá nguồn tại `danh mục sản phẩm.xlsx`: 4D = 1.800.000 đ/bộ, 4,6D = 2.000.000 đ/bộ, nhóm 5,2D trong ảnh được danh mục ánh xạ vào mã 5,5D = 2.200.000 đ/bộ, 6D sơn tĩnh điện = 2.800.000 đ/bộ. Từ 4 m² trở lên dùng giá theo m²; phụ thu 300.000 đ/bộ chỉ khớp khi diện tích lớn hơn 4 và nhỏ hơn 7 m².

## 12. Thứ tự triển khai đã thực hiện

1. `Alumdoor Partner Group` → `Alumdoor Partner`.
2. `Alumdoor Department` → `Alumdoor Employee`.
3. `Alumdoor Price List` → `Alumdoor Item Price`; bổ sung liên kết bảng giá vào pricing service.
4. `Alumdoor Material Specification`; cấu trúc hóa dữ liệu đang nằm trong `Alumdoor Item.specifications`.
5. `Alumdoor Operation Standard` + `Alumdoor Work Shift` trước khi làm lịch sản xuất.
6. `Alumdoor Fault Reason` + `Alumdoor Warranty Policy` trước màn lỗi/bảo hành.
7. `Alumdoor Coating Rate` trước phiếu sơn/gia công sơn.
8. `Alumdoor Money Account` + `Alumdoor Cashflow Category` chỉ khi chốt làm thu–chi tối giản.

## 13. Nguồn đã đối chiếu

| Nguồn | Sheet/phần | Entity/rule rút ra |
|---|---|---|
| `danh mục sản phẩm.xlsx` | `Sheet1` | Item, nhóm, UOM, giá niêm yết, giá có ray, thông số |
| `QUY CÁCH (3).xlsx` | `CT TT-SX`, `ĐƠN GIÁ TRỌN BỘ`, `MS` | Công thức theo loại cửa, phân khúc đại lý/khách lẻ, gói bán, màu/bề mặt |
| `MS LIÊN BS.xlsx` | `DANH MỤC` | Khách hàng, NCC, người phụ trách, giá mua/bán/vốn |
| `MS LIÊN BS.xlsx` | `ĐM`, cột I/J | Khối lượng xuất m/m² và số lượng cấu kiện/cái tách riêng |
| `MS LIÊN BS.xlsx` | `CHI TIẾT SƠN` | Nhà gia công, loại gia công, đơn giá và cơ sở tính |
| `MS LIÊN BS.xlsx` | `CỬA LỖI` | Truy vết chứng từ, vật tư lỗi, chiết khấu/chi phí và người phụ trách |
| `MS LIÊN BS.xlsx` | `THU-CHI`, `TTTT` | Quỹ, tài khoản ngân hàng, loại thu/chi và thông tin thanh toán |
| `TỒN NHÔM 2026 NEW (1).xlsx` | Các sheet nhôm, `RAY`, `BỘ BA LÁ ĐÁY + LÁ ĐẦU` | Quy cách, màu, khổ, số lá, cắt/hoàn/phế và lịch sử |
| `25.7 QUY TRÌNH (2).docx` | Toàn bộ quy trình | Đơn hàng, phân luồng sản xuất, định mức thời gian, sơn, lỗi, bảo hành và kho |

## 14. Trạng thái cổng triển khai

- Người dùng đã duyệt triển khai bằng yêu cầu “làm”.
- JSON/controller đã tạo; site đã migrate; dữ liệu có căn cứ đã seed; API/UI, 7 phép giải thử gói bán và 14 integration tests đã đạt.
- Hiện các master mới cấp quyền `System Manager`; vai trò xưởng chi tiết trong cột Quyền là đích cấu hình tiếp theo, chưa được coi là đã hoàn tất.
- Thu–chi hiện chỉ là danh mục quỹ/tài khoản và loại thu–chi, không có sổ kép hay hệ tài khoản ERPNext.

## 15. Đơn hàng (DocType kỹ thuật `Alumdoor Quotation`) — triển khai 2026-08-25

### 15.1 `Alumdoor Quotation`

| Field | Frappe | Ràng buộc | Validate server | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `quotation_code` | Data | Duy nhất, readonly | Server cấp `BG-YYYY-#####` (giữ tương thích dữ liệu hiện có) | code-auto | Khi lưu | Mọi người được cấp xem; không sửa | Số đơn giữ nguyên suốt vòng đời |
| `customer` | Link → `Alumdoor Partner` | Bắt buộc | Chỉ `Customer`/`Both`, đang bật | link-field tìm kiếm `*` | — | System Manager hiện tại | Khách hàng/đại lý đặt đơn; NCC phải có thêm vai trò khách (`Both`) |
| `customer_group` | Link → `Alumdoor Partner Group` | Readonly | Phải là nhóm bán hàng hợp lệ | readonly | Từ khách hàng | Theo chứng từ | Phân biệt Đại lý/Khách lẻ, không chọn lại trên đơn |
| `price_list` | Link → `Alumdoor Price List` | Readonly | Từ khách hoặc nhóm khách | readonly | Từ khách hàng | Theo chứng từ | Bảng giá authority cho mọi dòng |
| `quotation_date` | Date | Bắt buộc | Ngày hợp lệ | date `*` | Hôm nay theo múi giờ máy | System Manager hiện tại | Ngày lập đơn |
| `delivery_date` | Date | Có thể rỗng | Ngày hợp lệ | date | — | System Manager hiện tại | Ngày giao dự kiến |
| `assigned_employee` | Link → `Alumdoor Employee` | Có thể rỗng | Nhân viên phải tồn tại | link-field | Theo khách ở pha sau | System Manager hiện tại | Sale phụ trách |
| `status` | Select | Bắt buộc | State machine bên dưới | action, không gõ tay | `Draft` | System Manager hiện tại | Trạng thái thương mại |
| `currency` | Link → `Currency` | Bắt buộc | Mặc định VND | readonly-prefilled | VND | System Manager hiện tại | Tiền tệ đơn hàng |
| `total_area` | Float | Readonly | Tổng diện tích tính từ kích thước × số bộ | number readonly | Server tính | Mọi người được cấp xem | Đối chiếu tổng m² cửa |
| `subtotal` / `discount_amount` / `surcharge_amount` | Currency | Readonly | Cộng từ các dòng | money readonly | Server tính | Mọi người được cấp xem | Tiền hàng, chiết khấu và phụ thu tách riêng |
| `vat_percent` / `vat_amount` | Percent / Currency | VAT 0–100 | Server tính sau CK/phụ thu | number / money | 0 | Theo chứng từ | VAT tùy chọn |
| `grand_total` / `deposit_amount` / `outstanding_amount` | Currency | Readonly trừ tiền cọc | Server tính | money | 0 tiền cọc | Theo chứng từ | Phải thu, đã cọc, còn phải thu |
| `notes` | Small Text | Có thể rỗng | — | textarea | — | System Manager hiện tại | Ghi chú thương mại |
| `items` | Table → `Alumdoor Quotation Item` | Ít nhất 1 dòng | Mỗi dòng được server tính lại | transaction line editor | — | System Manager hiện tại | Danh sách mã hàng bán thực tế |

State machine: `Draft → Sent | Cancelled`; `Sent → Accepted | Rejected | Cancelled`; `Rejected → Draft`; `Accepted` và `Cancelled` là trạng thái khóa. Chỉ `Draft` được sửa dòng và giá trị.

### 15.2 `Alumdoor Quotation Item`

| Field | Frappe | Ràng buộc | Validate server | UI | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `item` | Link → `Alumdoor Item` | Bắt buộc | Phải là mặt hàng bán đang bật | combobox mã + tên | — | Theo chứng từ cha | Mã hàng bán thật, không bắt đầu từ gói bán |
| `color` | Link → `Alumdoor Color` | Bắt buộc khi mã có màu | Phải thuộc `allowed_colors(item)` | combobox lọc theo dòng | Tự chọn nếu chỉ có 1 màu | Theo chứng từ cha | Mã STĐ/MM/INOX chỉ thấy màu hợp lệ |
| `price_variant` | Select | `STANDARD`, `TANG_RAY`, `CHI_LA`, `TRON_BO`, `TACH_MON`, `KEO_TAY`, `MOTOR_NGOAI` | Phải khớp SKU và điều kiện diện tích | Ẩn khi mã đã mang MTN/KT/TRỌN BỘ/TÁCH MÓN; Tặng ray không chọn tay | Theo mã và ngưỡng diện tích | Theo chứng từ cha | Trường canonical để tính/lưu, không lặp lại thông tin đã nằm trong mã |
| `width_pb_ray_m` / `width_pb_nhua_m` / `height_m` / `mesh_height_m` | Float | Theo loại cửa | Đức: Đại lý dùng PB nhựa, Khách lẻ dùng PB ray; Úc/Đài Loan/Siêu trường/Lưới dùng PB ray | cột động theo hợp đồng server | — | Theo chứng từ cha | Lưới bắt buộc thêm Cao lưới; không áp luật Đức cho họ cửa khác |
| `cut_width_m` | Float | Bắt buộc khi mã bán Tách món lấy rộng cắt làm cơ sở | Server kiểm tra theo biến thể; các dòng khác không hiện ô nhập | cột động | Người bán nhập cho Tách món | Theo chứng từ cha | Rộng cắt lá vừa là số đo bán theo quy tắc vừa phục vụ sản xuất |
| `length_m` | Float | Theo vật tư | Không âm | cột động | — | Theo chứng từ cha | Chiều dài một cây/đoạn bán theo mét |
| `qty` / `uom` | Float / Link | Dương | ĐVT từ vật tư/bảng giá | number / readonly | 1 / theo vật tư | Theo chứng từ cha | Một ô `Số lượng` duy nhất: số cửa/cái/cặp/cây/bộ xưởng cần làm |
| `set_count` / `qty_bar` | Float | Trường tương thích, ẩn | Đồng bộ từ `qty`; client mới không nhập trực tiếp | hidden | Theo `qty` | Hệ thống | Giữ đọc được chứng từ cũ, không xuất hiện trên màn tạo đơn mới |
| `priced_qty` / `price_basis` / `rate` | Float / Data / Currency | Readonly | Server lấy bảng giá theo khách | readonly | Pricing service | Theo chứng từ cha | Khối lượng và đơn giá tính tiền |
| `discount_percentage` / `discount_amount` | Percent / Currency | 0–100 | Server tính lại | chi tiết dòng: % sửa được, tiền chiết khấu hiện ngay dưới | 15% cho nhóm `CUA-CN-DUC`, nhóm khác 0% | Theo chứng từ cha | Chiết khấu từng dòng; mặc định lấy từ `Alumdoor Item Group.default_discount_percentage` |
| `adjustment_amount` / `net_amount` | Currency | Server authority | `amount - discount + adjustment` | chi tiết / readonly | Pricing service | Theo chứng từ cha | Phụ thu/giảm trừ và thành tiền |
| `sales_package` / `component_snapshot_json` | Link / JSON | Readonly | Resolve từ Component Rule theo SKU và kích thước | Chi tiết dòng hiện bảng cấu kiện | Configuration service | Theo chứng từ cha | Chụp số cấu kiện vật lý và quy cách/tiêu hao để chuyển sản xuất |
| `pricing_snapshot_json` | JSON | Readonly | Server ghi nguồn giá, bảng giá, ngày | ẩn/readonly | Pricing service | Theo chứng từ cha | Audit nguồn đơn giá |
| `description` | Small Text | Có thể rỗng | — | text | — | Theo chứng từ cha | Diễn giải riêng của dòng |

Dịch vụ canonical `quotation_service.get_item_sales_context` là authority cho cột động, nhãn, trường bắt buộc/readonly, màu và cách bán của mỗi SKU theo nhóm khách. `save_quotation` gọi lại bộ tính dòng, kiểm tra màu và cách bán trước khi lưu, nên request giả tổng tiền hoặc gửi tổ hợp ngoài phạm vi không thể đổi dữ liệu server. Màn TSX chỉ cho nhập một `Số lượng` vật lý; `Khối lượng` là kết quả tính tiền theo mét/m²/bộ và được cập nhật tức thời. Vật tư theo mét dùng `Dài × Số lượng`.
