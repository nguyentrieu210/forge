# Field Ledger v3 — Alumdoor Frappe Pure

> Mỗi field nghiệp vụ là một dòng đủ 9 cột. Đây là nguồn để tạo DocType, schema client và validator server ở Pha 5. Trường không có trong ledger không được tự ý code.

## 0. Quy ước chung

- Backend: Frappe v16/MariaDB; frontend dùng Zod mirror để báo lỗi sớm, controller Python kiểm lại là authority.
- Trường hệ thống mọi DocType dùng Frappe: `name`, `owner`, `creation`, `modified`, `modified_by`, `docstatus`, `idx`.
- Chứng từ có `naming_series`; mã chính thức cấp khi insert. Hủy giữ mã.
- Tiền: `Currency`/decimal MariaDB, nhưng domain chỉ nhận số nguyên VND.
- Ngày: `Date` ISO ở API, UI `dd/MM/yyyy`.
- Quyền viết tắt: `O` Chủ xưởng, `A` Kế toán, `S` Sale, `SYS` hệ thống. `R/W` = xem/sửa.
- Child Table kế thừa quyền cha; field readonly chỉ được service ghi.
- Master/chứng từ đã được tham chiếu không xóa cứng; master dùng `enabled/disabled`, chứng từ dùng state/cancel.
- UI control thuộc danh mục đóng: `text`, `textarea`, `money`, `number`, `date`, `datetime`, `select-enum`, `link-field`, `checkbox`, `image`, `barcode`, `code-auto`.

## 1. Đối tác và người phụ trách

### 1.1 `Alumdoor Partner Group`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `group_code` | Data/varchar(140) | UNIQUE NOT NULL | `z.string().regex(codeSafe)` | code-auto | uppercase, không trùng | từ counter `NDT` | R all; W O | Mã nhóm |
| `group_name` | Data/varchar(140) | NOT NULL | `z.string().min(1).max(140)` | text `*` | trim, tìm không dấu | — | R all; W O | Đại lý/Khách lẻ/NCC |
| `partner_kind` | Select/varchar(20) | NOT NULL | `z.enum(['Customer','Supplier','Both'])` | select-enum `*` | enum | — | R all; W O | Vai trò đối tác của nhóm |
| `default_price_list` | Link/varchar(140) | FK Price List | `z.string().optional()` | link-field | active + selling | theo kind | R all; W O | Bảng giá mặc định |
| `default_discount_percent` | Percent/decimal | DEFAULT 0 | `z.number().min(0).max(100)` | number | 0–100 | 0 | R all; W O | Chỉ seed; engine quyết định cuối |
| `payment_term_days` | Int/int | DEFAULT 0 CHECK >=0 | `z.number().int().nonnegative()` | number | không âm | 0 | R O/A; W O | Hạn thanh toán gợi ý |
| `enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Tắt không cho chọn mới |

### 1.2 `Alumdoor Partner`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `partner_code` | Data/varchar(140) | UNIQUE NOT NULL | `z.string()` | code-auto | counter atomic | `KH/NCC/DT` | R all; W SYS | Mã đối tác |
| `partner_name` | Data/varchar(140) | NOT NULL | `z.string().min(1).max(140)` | text `*` | normalize tên, tìm không dấu | từ text/OCR nếu dùng | R/W all | Tên canonical |
| `partner_kind` | Select/varchar(20) | NOT NULL | `z.enum(['Customer','Supplier','Both'])` | select-enum `*` | enum | theo luồng tạo | R all; W O/A | Một record có thể vừa KH vừa NCC |
| `partner_group` | Link/varchar(140) | FK Group NOT NULL | `z.string().min(1)` | link-field `*` | active + khớp kind | theo luồng | R/W all | Nhóm hiện hành |
| `phone` | Data/varchar(30) | INDEX | `z.string().regex(vnPhone).optional()` | text | normalize +84; cảnh báo trùng | từ Contact | R/W all | Tìm 4 số cuối/gọi/Zalo |
| `email` | Data/varchar(140) | — | `z.string().email().optional()` | text | lowercase | từ Contact | R/W all | Email |
| `tax_code` | Data/varchar(30) | UNIQUE khi có | `z.string().regex(taxCode).optional()` | text | 10/13 số | — | R/W O/A; R S | MST |
| `primary_contact` | Link/varchar(140) | FK Contact | `z.string().optional()` | link-field | Contact thuộc partner | nested create | R/W all | Liên hệ chính |
| `primary_address` | Link/varchar(140) | FK Address | `z.string().optional()` | link-field | Address thuộc partner | nested create | R/W all | Địa chỉ chính |
| `assigned_employee` | Link/varchar(140) | FK Employee | `z.string().optional()` | link-field | employee active | người tạo hoặc rule | R/W all | Người phụ trách mặc định |
| `default_price_list` | Link/varchar(140) | FK Price List | `z.string().optional()` | link-field | active, selling | từ group, không đè dirty | R all; W O/A | Ghi đè bảng giá nhóm |
| `payment_term_days` | Int/int | DEFAULT 0 | `z.number().int().nonnegative()` | number | không âm | từ group | R/W O/A; R S | Hạn thu gợi ý |
| `opt_out_message` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | bool | false | R/W all | Dự phòng cổng nhắn |
| `enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | không tắt nếu draft dùng | true | R all; W O | Không cho chọn mới khi tắt |
| `notes` | Small Text/text | — | `z.string().max(1000).optional()` | textarea | max 1000 | — | R/W all | Ghi chú |

### 1.3 `Alumdoor Employee`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `employee_code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | counter `NV` | server | R all; W SYS | Mã nhân viên |
| `employee_name` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | normalize tên | từ User | R all; W O | Người phụ trách |
| `user` | Link/varchar | UNIQUE FK User | `z.string().optional()` | link-field | user active | — | R O/A; W O | Gắn tài khoản |
| `phone` | Data/varchar | — | `z.string().regex(vnPhone).optional()` | text | vnPhone | — | R all; W O | Liên hệ |
| `enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Trạng thái |

## 2. Danh mục vật tư và quy cách

### 2.1 `Alumdoor Item Group`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `item_group_code` | Data/varchar | UNIQUE NOT NULL | `z.string().regex(codeSafe)` | code-auto | uppercase | từ tên | R all; W O | Mã nhóm |
| `item_group_name` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | trim | — | R all; W O | Tên nhóm |
| `parent_item_group` | Link/varchar | self FK | `z.string().optional()` | link-field | không vòng lặp | — | R all; W O | Cây nhóm |
| `is_group` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | group không gán item | false | R all; W O | Nút nhóm |
| `scrap_threshold_m` | Float/decimal | NULL CHECK >=0 | `z.number().nonnegative().optional()` | number | không âm | — | R all; W O | Ngưỡng phế; thiếu thì cảnh báo |
| `enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Trạng thái |

### 2.2 `Alumdoor UOM`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `uom_name` | Data/varchar | UNIQUE NOT NULL | `z.string().min(1)` | text `*` | normalize alias | — | R all; W O | Bộ, cái, m, m²… |
| `symbol` | Data/varchar | — | `z.string().max(12).optional()` | text | — | từ name | R all; W O | Ký hiệu |
| `must_be_whole_number` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | qty nguyên khi bật | theo loại | R all; W O | Cấm 1,5 cái/bộ |
| `enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Trạng thái |

### 2.3 `Alumdoor UOM Conversion` (child Item)

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `uom` | Link/varchar | FK UOM NOT NULL; UNIQUE per parent | `z.string().min(1)` | link-field `*` | active, không trùng | — | inherit; W O | ĐVT thay thế |
| `conversion_factor` | Float/decimal | CHECK >0 | `z.number().positive()` | number `*` | >0 | — | inherit; W O | 1 UOM = factor × stock UOM |

### 2.4 `Alumdoor Item`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `item_code` | Data/varchar | UNIQUE NOT NULL | `z.string().regex(itemCode)` | text `*` | uppercase; không dấu; không trùng | từ import hoặc counter | R all; W O trước dùng | Khóa tự nhiên |
| `item_name` | Data/varchar | NOT NULL | `z.string().min(1).max(180)` | text `*` | trim | import | R all; W O | Tên bán/sản xuất |
| `item_group` | Link/varchar | FK Group NOT NULL | `z.string().min(1)` | link-field `*` | leaf group active | import | R all; W O | Nhóm |
| `stock_uom` | Link/varchar | FK UOM NOT NULL | `z.string().min(1)` | link-field `*` | active | import | R all; W O | ĐVT tồn |
| `item_type` | Select/varchar | NOT NULL | `z.enum(['Raw Material','Component','Accessory','Finished Product','Service'])` | select-enum `*` | enum | từ group | R all; W O | Loại vật tư |
| `is_stock_item` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | service=false | từ type | R all; W O | Có vào kho |
| `is_sales_item` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | bool | import | R all; W O | Cho chọn trên đơn |
| `is_purchase_item` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | bool | import | R all; W O | Cho chọn đơn mua |
| `is_manufactured_item` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | package hoặc item cần gia công; hàng bán rời=false | từ type/import | R all; W O | Chỉ dòng true mới vào yêu cầu/lệnh sản xuất |
| `is_sales_package` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | cần package active | false | R all; W O | Chỉ bật mới nổ cấu kiện |
| `sales_package` | Link/varchar | FK Package | `z.string().optional()` | link-field | bắt buộc khi package | theo code/import | R all; W O | Gói cấu kiện |
| `measurement_profile` | Link/varchar | FK Profile | `z.string().optional()` | link-field | bắt buộc cho cửa/dòng đo | từ door type | R all; W O | Cột động |
| `door_type` | Link/varchar | FK Door Type | `z.string().optional()` | link-field | bắt buộc cho cửa | từ package | R all; W O | Họ cửa |
| `sku_motor_mode` | Select/varchar | NULL | `z.enum(['IN','OUT','MANUAL','OUT_STOP']).optional()` | select-enum | nếu encode thì read-only ở đơn | parse 1 lần khi import | R all; W O | MTN/MTT/KT canonical |
| `sku_finish` | Link/varchar | FK Surface Finish | `z.string().optional()` | link-field | finish active | parse/import | R all; W O | STĐ/MM/INOX canonical |
| `barcode` | Data/varchar | UNIQUE khi có | `z.string().max(64).optional()` | barcode | EAN/Code128 hoặc internal | sinh mã | R all; W O/A | Quét kho |
| `image` | Attach Image/text | private File | `z.string().optional()` | image | mime/size | — | R all; W O | Ảnh item |
| `disabled` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | incomplete thì bắt buộc disabled | true khi import thiếu | R all; W O | Ngừng chọn mới |
| `uom_conversions` | Table | child | `z.array(uomConversionSchema)` | child table | không trùng UOM | — | R all; W O | Quy đổi mua/bán/kho |

### 2.5 `Surface Finish`, `Alumdoor Color`, `Alumdoor Item Color Allowance`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Surface Finish.finish_code` | Data/varchar | UNIQUE NOT NULL | `z.string().regex(codeSafe)` | code-auto | uppercase | import | R all; W O | Mã bề mặt |
| `Surface Finish.finish_name` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | trim | — | R all; W O | STĐ/Vân gỗ/Mạ/Thô |
| `Surface Finish.finish_category` | Select/varchar | NOT NULL | `z.enum(['STD','PLATED','WOODGRAIN','RAW','OTHER'])` | select-enum `*` | enum | import | R all; W O | Nhóm tính rule |
| `Surface Finish.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Trạng thái |
| `Alumdoor Color.color_code` | Data/varchar | UNIQUE NOT NULL | `z.string().regex(codeSafe)` | text `*` | uppercase | import | R all; W O | Mã màu |
| `Alumdoor Color.color_name` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | trim | import | R all; W O | Nhãn VN |
| `Alumdoor Color.surface_finish` | Link/varchar | FK Finish NOT NULL | `z.string().min(1)` | link-field `*` | active | từ nhóm màu | R all; W O | Bề mặt |
| `Alumdoor Color.primary_hex` | Data/varchar | — | `z.string().regex(hex).optional()` | text | hex | import | R all; W O | Swatch, không dùng tính |
| `Alumdoor Color.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Trạng thái |
| `Item Color Allowance.item` | Link/varchar | FK Item NOT NULL | `z.string()` | link-field `*` | unique pair | — | R all; W O | SKU được phép |
| `Item Color Allowance.color` | Link/varchar | FK Color NOT NULL | `z.string()` | link-field `*` | active + finish compatible | theo import | R all; W O | Màu được chọn |
| `Item Color Allowance.is_default` | Check/tinyint | max 1/item | `z.boolean()` | checkbox | một mặc định | nếu chỉ 1 màu | R all; W O | Autofill màu |

### 2.6 `Alumdoor Warehouse` và `Alumdoor Bin Location`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Warehouse.warehouse_code` | Data/varchar | UNIQUE NOT NULL | `z.string().regex(codeSafe)` | code-auto | uppercase | `KHO-CHINH` | R all; W O | Mã kho |
| `Warehouse.warehouse_name` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | trim | — | R all; W O | Tên kho |
| `Warehouse.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | chỉ một default | true | R all; W O | Kho chính |
| `Bin Location.location_code` | Data/varchar | UNIQUE per warehouse | `z.string().regex(codeSafe)` | text `*` | không trùng | — | R all; W O/A | Kệ/vị trí tùy chọn |
| `Bin Location.warehouse` | Link/varchar | FK Warehouse NOT NULL | `z.string()` | link-field `*` | active | Kho chính | R all; W O/A | Kho cha |
| `Bin Location.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O/A | Trạng thái |

## 3. Cấu hình đo, gói bán và giá

### 3.1 `Measurement Profile` và `Measurement Profile Field`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Profile.profile_code` | Data/varchar | UNIQUE NOT NULL | `z.string().regex(codeSafe)` | code-auto | uppercase | theo door type | R all; W O | Mã profile |
| `Profile.profile_name` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | trim | — | R all; W O | Tên cấu hình cột |
| `Profile.version` | Int/int | NOT NULL | `z.number().int().positive()` | number | tăng khi đổi contract | 1 | R all; W O | Snapshot version |
| `Profile.door_type` | Link/varchar | FK Door Type | `z.string().optional()` | link-field | active | — | R all; W O | Phạm vi |
| `Profile.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | không chồng hiệu lực cùng version | true | R all; W O | Trạng thái |
| `Field.fieldname` | Data/varchar | UNIQUE per profile | `z.string().regex(fieldName)` | text `*` | whitelist field | — | R all; W O | Tên payload |
| `Field.label_vi` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | — | — | R all; W O | Nhãn tiếng Việt |
| `Field.input_type` | Select/varchar | NOT NULL | `z.enum(['number','checkbox','link','readonly'])` | select-enum `*` | enum | — | R all; W O | Control runtime |
| `Field.visible_when_json` | JSON/longtext | NOT NULL | `conditionSchema` | textarea | AST/JSON allowlist | `{}` | R O; W O | Điều kiện hiện |
| `Field.editable_when_json` | JSON/longtext | NOT NULL | `conditionSchema` | textarea | AST/JSON allowlist | `{}` | R O; W O | Điều kiện sửa |
| `Field.required_when_json` | JSON/longtext | NOT NULL | `conditionSchema` | textarea | AST/JSON allowlist | `{}` | R O; W O | Điều kiện bắt buộc |
| `Field.options_source` | Data/varchar | — | `z.string().optional()` | text | whitelist resolver | — | R O; W O | Nguồn màu/ray… |
| `Field.sequence` | Int/int | DEFAULT 0 | `z.number().int().nonnegative()` | number | unique sequence | — | R all; W O | Thứ tự cột |

### 3.2 `Door Type`, `Door System`, `Door Formula`, `Door Formula Variable`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Door Type.code` | Data/varchar | UNIQUE NOT NULL | `z.string().regex(codeSafe)` | code-auto | uppercase | import | R all; W O | Đức/Úc/Lưới… |
| `Door Type.name_vi` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | trim | — | R all; W O | Nhãn UI |
| `Door Type.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Trạng thái |
| `Door System.system_code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | codeSafe | — | R all; W O | Hệ cửa |
| `Door System.door_type` | Link/varchar | FK Door Type NOT NULL | `z.string()` | link-field `*` | active | — | R all; W O | Họ cửa |
| `Door Formula.formula_code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | codeSafe | — | R all; W O | Mã công thức |
| `Door Formula.version` | Int/int | NOT NULL | `z.number().int().positive()` | number | immutable khi đã dùng | 1 | R all; W O | Version snapshot |
| `Door Formula.effective_from/to` | Date/date | — | `dateRangeSchema` | date | không đảo/chồng | hôm nay/— | R all; W O | Hiệu lực |
| `Door Formula.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Trạng thái |
| `Formula Variable.variable_name` | Data/varchar | UNIQUE per formula | `z.string().regex(fieldName)` | text `*` | whitelist | — | R all; W O | Biến kết quả |
| `Formula Variable.expression` | Code/longtext | NOT NULL | `z.string().min(1)` | textarea `*` | AST allowlist, no eval | — | R O; W O | Công thức |
| `Formula Variable.output_uom` | Link/varchar | FK UOM | `z.string().optional()` | link-field | active | — | R all; W O | Đơn vị |
| `Formula Variable.rounding_policy` | Select/varchar | NOT NULL | `z.enum(['NONE','MONEY','LEAF_POINT6'])` | select-enum `*` | enum | theo variable | R all; W O | Làm tròn |

### 3.3 `Sales Package` và `Sales Package Component`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Package.package_code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | codeSafe | import | R all; W O | Mã gói |
| `Package.package_name` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | trim | — | R all; W O | Tên gói |
| `Package.door_type/system` | Link/varchar | FK NOT NULL | `z.string()` | link-field `*` | compatible | từ item | R all; W O | Phạm vi |
| `Package.default_formula` | Link/varchar | FK Formula NOT NULL | `z.string()` | link-field `*` | active đúng ngày | — | R all; W O | Công thức đo |
| `Package.version` | Int/int | NOT NULL | `z.number().int().positive()` | number | immutable khi used | 1 | R all; W O | Snapshot version |
| `Package.effective_from/to` | Date/date | — | `dateRangeSchema` | date | không đảo/chồng | hôm nay/— | R all; W O | Hiệu lực |
| `Package.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | incomplete=false | false khi import | R all; W O | Trạng thái |
| `Component.component_role` | Data/varchar | NOT NULL | `z.string().regex(codeSafe)` | text `*` | role whitelist | — | R all; W O | RAY/LÁ_YẾM… |
| `Component.item` | Link/varchar | FK Item NOT NULL | `z.string()` | link-field `*` | active | rule/import | R all; W O | Item cấu kiện |
| `Component.qty_formula` | Code/longtext | NOT NULL | `z.string().min(1)` | textarea `*` | AST allowlist | `quantity` | R O; W O | Số cái/bộ/thanh |
| `Component.uom` | Link/varchar | FK UOM NOT NULL | `z.string()` | link-field `*` | compatible | item stock UOM | R all; W O | ĐVT số lượng |
| `Component.measure_formula` | Code/longtext | — | `z.string().optional()` | textarea | AST allowlist | theo role | R O; W O | Mét/m² cắt/tính |
| `Component.measure_uom` | Link/varchar | FK UOM | `z.string().optional()` | link-field | required nếu formula | theo formula | R all; W O | ĐVT khối lượng |
| `Component.optional` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox | bool | false | R all; W O | Có điều kiện |
| `Component.sequence` | Int/int | DEFAULT 0 | `z.number().int().nonnegative()` | number | không trùng role/item | — | R all; W O | Thứ tự |

### 3.4 `Alumdoor Price List`, `Alumdoor Item Price`, `Alumdoor Pricing Rule`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Price List.code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | codeSafe | import | R all; W O | BG Đại lý/Lẻ |
| `Price List.name_vi` | Data/varchar | NOT NULL | `z.string().min(1)` | text `*` | trim | — | R all; W O | Nhãn |
| `Price List.currency` | Link/varchar | FK Currency NOT NULL | `z.string()` | link-field `*` | VND v1 | VND | R all; W O | Tiền tệ |
| `Price List.valid_from/to` | Date/date | — | `dateRangeSchema` | date | không đảo | hôm nay/— | R all; W O | Hiệu lực |
| `Price List.version` | Int/int | NOT NULL | `z.number().int().positive()` | number | immutable used | 1 | R all; W O | Snapshot |
| `Price List.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R all; W O | Trạng thái |
| `Item Price.price_list` | Link/varchar | FK NOT NULL | `z.string()` | link-field `*` | active | — | R all; W O | Bảng giá |
| `Item Price.item` | Link/varchar | FK Item NOT NULL | `z.string()` | link-field `*` | sales item active | — | R all; W O | Mặt hàng |
| `Item Price.price_variant` | Data/varchar | NOT NULL | `z.string().regex(codeSafe)` | text `*` | allowed by item/profile | STANDARD | R all; W O | CHỈ_LÁ/TRỌN_BỘ… |
| `Item Price.price_basis` | Select/varchar | NOT NULL | `z.enum(['QTY','METER','AREA','SET','KG'])` | select-enum `*` | enum | item/profile | R all; W O | Cơ sở tính |
| `Item Price.uom` | Link/varchar | FK UOM NOT NULL | `z.string()` | link-field `*` | matches basis | theo basis | R all; W O | ĐVT tính tiền |
| `Item Price.rate` | Currency/decimal | NOT NULL CHECK >=0 | `z.number().int().nonnegative()` | money `*` | VND integer | import | R all; W O | Đơn giá |
| `Item Price.min/max_value` | Float/decimal | NULL | `z.number().nonnegative().optional()` | number | cận không chồng | — | R all; W O | Bậc diện tích/dày |
| `Item Price.valid_from/to` | Date/date | — | `dateRangeSchema` | date | đúng ngày đơn | list dates | R all; W O | Hiệu lực |
| `Item Price.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | incomplete=false | false khi lỗi | R all; W O | Trạng thái |
| `Pricing Rule.rule_code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | codeSafe | import | R all; W O | Mã rule |
| `Pricing Rule.rule_type` | Select/varchar | NOT NULL | `z.enum(['DISCOUNT','SURCHARGE','BENEFIT'])` | select-enum `*` | enum | — | R all; W O | CK/PT/Tặng |
| `Pricing Rule.scope` | Select/varchar | NOT NULL | `z.enum(['LINE','PHYSICAL_UNIT','ORDER_TRIP'])` | select-enum `*` | enum | theo rule | R all; W O | Tránh nhân phí chuyến |
| `Pricing Rule.condition_json` | JSON/longtext | NOT NULL | `pricingConditionSchema` | textarea `*` | AST/JSON allowlist | — | R O; W O | Điều kiện |
| `Pricing Rule.calculation_basis` | Select/varchar | NOT NULL | `z.enum(['FIXED','QTY','METER','AREA','PERCENT_BASE'])` | select-enum `*` | enum | theo rule | R all; W O | Cơ sở |
| `Pricing Rule.rate` | Currency/decimal | CHECK >=0 | `z.number().int().nonnegative()` | money | required theo basis | import | R all; W O | Mức rule |
| `Pricing Rule.priority` | Int/int | DEFAULT 0 | `z.number().int()` | number | stable sort | import | R all; W O | Thứ tự |
| `Pricing Rule.effective_from/to` | Date/date | — | `dateRangeSchema` | date | đúng ngày đơn | — | R all; W O | Hiệu lực |
| `Pricing Rule.enabled` | Check/tinyint | DEFAULT 1 | `z.boolean()` | checkbox | incomplete=false | false khi lỗi | R all; W O | Trạng thái |

## 4. Đơn hàng và snapshot

### 4.1 `Alumdoor Sales Order`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `order_code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | `DH-YYYY-#####` | server khi create | R all; W SYS | Số không tái dùng |
| `customer` | Link/varchar | FK Partner NOT NULL | `z.string().min(1)` | link-field `*` | Customer/Both active | — | R/W all | Khách |
| `customer_snapshot_json` | JSON/longtext | NOT NULL | `customerSnapshotSchema` | readonly | server-only | từ customer | R all; W SYS | Tên/nhóm/địa chỉ/liên hệ |
| `customer_group` | Link/varchar | FK Group NOT NULL | `z.string()` | readonly | khớp snapshot | từ customer | R all; W SYS | Đại lý/Lẻ snapshot |
| `price_list` | Link/varchar | FK Price List NOT NULL | `z.string()` | link-field `*` | active đúng ngày | từ customer, cho đổi | R/W all | Bảng giá chọn |
| `default_price_list` | Link/varchar | FK Price List NOT NULL | `z.string()` | readonly | snapshot | từ customer | R all; W SYS | So override |
| `transaction_date` | Date/date | NOT NULL | `z.string().date()` | date `*` | không rỗng | hôm nay | R/W all | Ngày giá/rule |
| `delivery_date` | Date/date | NULL | `z.string().date().optional()` | date | >= ngày đơn | — | R/W all | Giao dự kiến |
| `responsible_employee` | Link/varchar | FK Employee | `z.string().optional()` | link-field | active | từ customer/user | R/W all | Người phụ trách |
| `payment_method` | Select/varchar | NOT NULL | `z.enum(['CASH','BANK','RECEIVABLE'])` | select-enum `*` | enum | nhớ theo user | R/W all | Cách thu |
| `money_account` | Link/varchar | FK Money Account | `z.string().optional()` | link-field | required khi BANK | theo payment method | R/W all | Quỹ/ngân hàng |
| `install_address` | Small Text/text | NULL | `z.string().max(500).optional()` | textarea | — | snapshot customer | R/W all | Địa chỉ lắp |
| `notes` | Small Text/text | NULL | `z.string().max(1000).optional()` | textarea | — | — | R/W all | Ghi chú |
| `items` | Table | >=1 | `z.array(orderItemSchema).min(1)` | child transaction grid | validate từng dòng | — | R/W all trước lock | Dòng hàng |
| `currency` | Link/varchar | NOT NULL DEFAULT VND | `z.literal('VND')` | readonly | VND | VND | R all; W SYS | Tiền tệ |
| `subtotal` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | server sum | calculate | R all; W SYS | Giá gốc |
| `discount_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | >=0 | calculate | R all; W SYS | Tổng CK |
| `line_surcharge_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | >=0 | calculate | R all; W SYS | PT dòng/cửa |
| `order_surcharge_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | >=0 | dedupe trip | R all; W SYS | Phí chuyến |
| `net_before_vat` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | công thức | calculate | R all; W SYS | Trước VAT |
| `vat_percent` | Percent/decimal | DEFAULT 8 | `z.number().min(0).max(100)` | number | 0–100 | 8 | R/W all | Không trigger duyệt |
| `vat_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | money round | calculate | R all; W SYS | VAT |
| `grand_total` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | >=0 | calculate | R all; W SYS | Tổng thanh toán |
| `deposit_amount` | Currency/decimal | DEFAULT 0 | `z.number().int().nonnegative()` | money | <= grand total; submit >0 cần Money Account | 0 | R/W all khi Draft; sau submit readonly | Cọc dự kiến ở Draft; Gửi đơn sinh Receipt Submitted |
| `refund_due` | Currency/decimal | DEFAULT 0 | `z.number().int().nonnegative()` | readonly money | tính từ thu đã submit khi hủy | payment service | R all; W SYS | Cần hoàn khách, tách Còn phải thu |
| `paid_amount` | Currency/decimal | DEFAULT 0 | `z.number().int()` | readonly money | từ submitted payments | calculate | R all; W SYS | Đã thu |
| `outstanding_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | grand-paid | calculate | R all; W SYS | Còn phải thu |
| `approval_status` | Select/varchar | NOT NULL | `approvalEnum` | readonly badge | state machine | calculate | R all; W SYS/O action | Duyệt ngoại lệ |
| `approval_reasons_json` | JSON/longtext | NOT NULL | `z.array(approvalReasonSchema)` | readonly | server | calculate | R all; W SYS | Lý do duyệt |
| `status` | Select/varchar | NOT NULL | `orderStatusEnum` | action/badge | state machine | Draft | R all; W SYS/action | Trạng thái tổng |
| `is_stock_locked` | Check/tinyint | DEFAULT 0 | `z.boolean()` | readonly | chỉ 0→1 | stock submit | R all; W SYS | Khóa toàn đơn |
| `calculation_version` | Data/varchar | NOT NULL | `z.string()` | readonly | service version | calculate | R all; W SYS | Truy vết engine |
| `pricing_snapshot_json` | JSON/longtext | NOT NULL | `pricingSnapshotSchema` | readonly | server | calculate | R O/A; W SYS | Phiên bản giá/rule |

### 4.2 `Alumdoor Sales Order Item`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `line_key` | Data/varchar | UNIQUE per parent | `z.string()` | hidden | UUID client preserved | client once | inherit; W SYS | Định danh diff |
| `item` | Link/varchar | FK Item NOT NULL | `z.string()` | link-field `*` | sales active | — | inherit | Mã hàng |
| `item_name_snapshot` | Data/varchar | NOT NULL | `z.string()` | readonly | server | item | inherit; W SYS | Tên lúc bán |
| `door_type` | Link/varchar | FK Door Type | `z.string().optional()` | readonly | item-derived | item | inherit; W SYS | Họ cửa |
| `measurement_profile` | Link/varchar | FK Profile | `z.string().optional()` | readonly | active version | item | inherit; W SYS | Contract field |
| `profile_version` | Int/int | NULL | `z.number().int().optional()` | readonly | snapshot | profile | inherit; W SYS | Version |
| `color` | Link/varchar | FK Color | `z.string().optional()` | link-field động | allowance + SKU | default nếu một | inherit | Màu hợp lệ |
| `price_variant` | Data/varchar | NOT NULL | `z.string()` | readonly hoặc selector động | SKU/profile allow | item/rule | inherit | Cách bán canonical |
| `width_pb_ray_m` | Float/decimal | NULL CHECK >0 | `positiveOptional` | number động | profile | — | inherit | Rộng PB ray |
| `width_pb_nhua_m` | Float/decimal | NULL CHECK >0 | `positiveOptional` | number động | profile | — | inherit | Rộng PB nhựa |
| `width_m` | Float/decimal | NULL CHECK >0 | `positiveOptional` | number động | profile | — | inherit | Rộng chung |
| `height_m` | Float/decimal | NULL CHECK >0 | `positiveOptional` | number động | profile | — | inherit | Cao |
| `mesh_height_m` | Float/decimal | NULL CHECK >0 | `positiveOptional` | number động | profile | — | inherit | Cao lưới |
| `cut_width_m` | Float/decimal | NULL CHECK >0 | `positiveOptional` | readonly/number theo profile | derived hoặc input | formula | inherit | Rộng cắt lá |
| `length_m` | Float/decimal | NULL CHECK >0 | `positiveOptional` | number động | item/profile | — | inherit | Dài bán mét |
| `has_butterfly_bracket` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox động | profile | false | inherit | Pát bướm |
| `ray_painted` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox động | chỉ ray áp dụng | false | inherit | Có sơn ray |
| `ray_color` | Link/varchar | FK Color | `z.string().optional()` | link-field động | required nếu painted | color hoặc default | inherit | Màu ray |
| `quantity` | Float/decimal | CHECK >0 | `z.number().positive()` | number `*` | whole nếu UOM bắt buộc | 1 | inherit | Số lượng vật lý |
| `uom` | Link/varchar | FK UOM NOT NULL | `z.string()` | readonly/link nếu nhiều | allowed conversion | item | inherit | ĐVT số lượng |
| `measure_qty` | Float/decimal | NOT NULL | `z.number().positive()` | readonly `Khối lượng` | server | calculate | inherit; W SYS | Nhân đơn giá |
| `measure_uom` | Link/varchar | FK UOM NOT NULL | `z.string()` | readonly | basis compatible | calculate | inherit; W SYS | ĐVT tính tiền |
| `unit_area_m2` | Float/decimal | NULL | `z.number().nonnegative().optional()` | hidden/readonly explain | server | calculate | inherit; W SYS | Rule boundary |
| `rate` | Currency/decimal | NOT NULL | `z.number().int().nonnegative()` | readonly money | price exists | calculate | inherit; W SYS | Đơn giá |
| `base_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | rate×measure | calculate | inherit; W SYS | Giá gốc |
| `discount_percent` | Percent/decimal | DEFAULT 0 | `z.number().min(0).max(100)` | number | chỉ field tiền editable | policy 15% Đức đại lý | inherit | % CK |
| `discount_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | chỉ discountable base | calculate | inherit; W SYS | Tiền CK |
| `surcharge_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | sum line/unit | calculate | inherit; W SYS | PT dòng/cửa |
| `net_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | base-discount+surcharge | calculate | inherit; W SYS | Thành tiền |
| `configuration_snapshot_json` | JSON/longtext | NOT NULL | `configurationSnapshotSchema` | readonly | server | calculate | R O/A; W SYS | Input/derived/SKU |
| `price_explain_json` | JSON/longtext | NOT NULL | `priceExplainSchema` | expandable | server | calculate | R all; W SYS | Dòng giải thích |
| `components` | Table | child | `z.array(componentSnapshotSchema)` | expandable | chỉ package | calculate | R all; W SYS | Cấu kiện |
| `description` | Small Text/text | NULL | `z.string().max(500).optional()` | textarea | max 500 | — | inherit | Ghi chú dòng |

### 4.3 `Alumdoor Order Component Snapshot`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `component_role` | Data/varchar | NOT NULL | `z.string()` | readonly | rule role | component engine | inherit; W SYS | Vai trò cấu kiện |
| `item` | Link/varchar | FK Item NOT NULL | `z.string()` | readonly | active at snapshot | engine | inherit; W SYS | Mã cấu kiện |
| `item_name_snapshot` | Data/varchar | NOT NULL | `z.string()` | readonly | — | item | inherit; W SYS | Tên |
| `quantity` | Float/decimal | CHECK >0 | `z.number().positive()` | readonly | UOM whole rule | formula | inherit; W SYS | Số cái/thanh/bộ |
| `uom` | Link/varchar | FK UOM NOT NULL | `z.string()` | readonly | compatible | component | inherit; W SYS | ĐVT vật lý |
| `measure_qty` | Float/decimal | NULL CHECK >=0 | `z.number().nonnegative().optional()` | readonly | formula | engine | inherit; W SYS | Dài/diện tích cắt |
| `measure_uom` | Link/varchar | FK UOM | `z.string().optional()` | readonly | required với measure | component | inherit; W SYS | ĐVT đo |
| `cut_size_json` | JSON/longtext | NULL | `cutSizeSchema.optional()` | readonly | server | formula | inherit; W SYS | Kích thước cắt |
| `source_package/rule` | Link/varchar | FK | `z.string()` | readonly | version exists | engine | inherit; W SYS | Truy nguồn |
| `sequence` | Int/int | NOT NULL | `z.number().int()` | readonly | stable | rule | inherit; W SYS | Thứ tự |

### 4.4 `Alumdoor Order Adjustment Snapshot`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `rule_code` | Data/varchar | NOT NULL | `z.string()` | readonly | rule exists | engine | inherit; W SYS | Mã CK/PT |
| `label_vi` | Data/varchar | NOT NULL | `z.string()` | readonly | — | rule | inherit; W SYS | Nhãn dưới dòng/tổng |
| `scope` | Select/varchar | NOT NULL | `adjustmentScopeEnum` | readonly | enum | rule | inherit; W SYS | line/unit/order_trip |
| `basis_qty` | Float/decimal | NOT NULL | `z.number().nonnegative()` | readonly | server | engine | inherit; W SYS | Cơ sở |
| `rate` | Currency/decimal | NOT NULL | `z.number().int()` | readonly | server | rule | inherit; W SYS | Mức |
| `amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly | server | engine | inherit; W SYS | Số tiền có dấu type |
| `explanation` | Small Text/text | NOT NULL | `z.string()` | readonly | — | engine | inherit; W SYS | Vì sao áp dụng |

### 4.5 `Alumdoor Order Revision`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `sales_order` | Link/varchar | FK Order NOT NULL | `z.string()` | readonly | order exists | action | R all; W SYS | Đơn bị sửa |
| `revision_no` | Int/int | UNIQUE per order | `z.number().int().positive()` | readonly | atomic next | action | R all; W SYS | Phiên bản |
| `reason` | Small Text/text | NOT NULL | `z.string().min(5).max(500)` | textarea `*` | bắt buộc sau duyệt | user | R all; W creator before save | Lý do sửa |
| `before_json` | Long Text | NOT NULL | `snapshotSchema` | readonly | server | current | R O/A; W SYS | Trước |
| `after_json` | Long Text | NOT NULL | `snapshotSchema` | readonly | server | recalculated | R O/A; W SYS | Sau |
| `diff_json` | Long Text | NOT NULL | `diffSchema` | readonly diff viewer | server | compare | R all; W SYS | Thay đổi |
| `approval_status` | Select/varchar | NOT NULL | `approvalEnum` | badge/action | state machine | Pending | R all; W O action | Duyệt lại |
| `approved_by/at` | Link/Datetime | NULL | `approvalActorSchema` | readonly | Owner only | action | R all; W SYS | Người duyệt |
| `production_ack_status` | Select/varchar | NOT NULL | `z.enum(['Not Required','Pending','Acknowledged'])` | action | Pending nếu production exists | service | R all; W O/A action | Kế toán nhận diff |
| `production_ack_by/at` | Link/Datetime | NULL | `ackActorSchema` | readonly | O/A | action | R all; W SYS | Dấu vết |

## 5. Sản xuất

### 5.1 `Alumdoor Production Request`

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `request_code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | `YCSX-YYYY-#####` | server | R O/A; W SYS | Mã yêu cầu |
| `sales_order` | Link/varchar | UNIQUE FK Order NOT NULL | `z.string()` | link-field readonly | order approved | approval service | R O/A; W SYS | Một request/đơn |
| `order_revision_no` | Int/int | NOT NULL | `z.number().int()` | readonly | current approved rev | order | R O/A; W SYS | Snapshot version |
| `required_date` | Date/date | NULL | `z.string().date().optional()` | date | — | delivery date | R O/A; W O/A | Hạn sản xuất |
| `status` | Select/varchar | NOT NULL | `z.enum(['Open','Converted','Cancelled'])` | badge/action | state machine | Open | R O/A; W SYS/action | Hàng đợi tạo lệnh |
| `snapshot_json` | Long Text | NOT NULL | `productionSnapshotSchema` | readonly | server | order | R O/A; W SYS | Đơn/cấu kiện duyệt |

### 5.2 `Alumdoor Production Order` và `Alumdoor Production Unit`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Production Order.code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | `LSX-YYYY-#####` | server | R O/A; W SYS | Mã lệnh |
| `Production Order.production_request` | Link/varchar | UNIQUE FK Request | `z.string()` | readonly | open request | action | R O/A; W SYS | Một lệnh/đơn |
| `Production Order.sales_order` | Link/varchar | UNIQUE FK Order | `z.string()` | readonly | same request | request | R O/A; W SYS | Đơn nguồn |
| `Production Order.status` | Select/varchar | NOT NULL | `productionStatusEnum` | badge/action | state machine | Draft | R O/A; W action | Tiến độ |
| `Production Order.change_ack_status` | Select/varchar | NOT NULL | `z.enum(['Clear','Pending'])` | alert/action | block progression | revision | R O/A; W SYS/action | Nhận thay đổi |
| `Production Order.snapshot_json` | Long Text | NOT NULL | `productionSnapshotSchema` | readonly | server | request | R O/A; W SYS | Snapshot bất biến |
| `Production Order.units` | Table | >=1 | `z.array(productionUnitSchema).min(1)` | child cards/table | chỉ dòng manufactured; count from qty | order items | R O/A; W SYS/action | Từng bộ/vật cần gia công; bỏ hàng bán rời |
| `Production Unit.unit_code` | Data/varchar | UNIQUE | `z.string()` | barcode/readonly | `DH-...-01` | server | R O/A; W SYS | Mã bộ vật lý |
| `Production Unit.sales_order_line_key` | Data/varchar | NOT NULL | `z.string()` | readonly | line exists | order | R O/A; W SYS | Dòng nguồn |
| `Production Unit.unit_no` | Int/int | NOT NULL | `z.number().int().positive()` | readonly | unique per order | sequence | R O/A; W SYS | Số thứ tự |
| `Production Unit.item/color` | Link/varchar | FK NOT NULL | `z.string()` | readonly | snapshot | order line | R O/A; W SYS | Sản phẩm/màu |
| `Production Unit.dimensions_json` | Long Text | NOT NULL | `dimensionsSchema` | readonly | server | order | R O/A; W SYS | Kích thước từng bộ |
| `Production Unit.components_json` | Long Text | NOT NULL | `z.array(componentSnapshotSchema)` | component panel | server | order | R O/A; W SYS | Cấu kiện từng bộ |
| `Production Unit.status` | Select/varchar | NOT NULL | `unitStatusEnum` | badge/action | state machine | Pending | R O/A; W O/A action | Pending/In Progress/Done/Rework/Accepted |
| `Production Unit.accepted_by/at` | Link/Datetime | NULL | `acceptanceSchema` | readonly | Owner only | action | R O/A; W SYS | Nghiệm thu |

## 6. Kho

### 6.1 `Alumdoor Stock Entry` và `Alumdoor Stock Entry Item`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Stock Entry.code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | prefix theo purpose | server | R O/A; W SYS | Số phiếu |
| `Stock Entry.purpose` | Select/varchar | NOT NULL | `stockPurposeEnum` | select-enum `*` | Receipt/Issue/Return/Scrap/Adjustment/Opening | theo luồng | R O/A; W O/A | Loại biến động |
| `Stock Entry.posting_date` | Date/date | NOT NULL | `z.string().date()` | date `*` | ngày hợp lệ | hôm nay | R O/A; W O/A draft | Ngày kho |
| `Stock Entry.warehouse` | Link/varchar | FK Warehouse NOT NULL | `z.string()` | link-field `*` | active | Kho chính | R O/A; W O/A draft | Kho |
| `Stock Entry.production_order` | Link/varchar | FK Production Order | `z.string().optional()` | link-field | required Issue/Return SX | context | R O/A; W O/A draft | Lệnh nguồn |
| `Stock Entry.purchase_receipt` | Link/varchar | FK Purchase Receipt | `z.string().optional()` | readonly | receipt purpose | context | R O/A; W SYS | Nhập mua |
| `Stock Entry.reason` | Small Text/text | conditional NOT NULL | `z.string().max(500).optional()` | textarea | bắt buộc diff/return/scrap/adjust | — | R O/A; W O/A draft | Lý do |
| `Stock Entry.status` | Select/varchar | NOT NULL | `z.enum(['Draft','Submitted','Cancelled'])` | badge/action | state machine | Draft | R O/A; W action | Chứng từ |
| `Stock Entry.items` | Table | >=1 | `z.array(stockEntryItemSchema).min(1)` | child grid/cards | validate all | từ Production/Receipt | R O/A; W O/A draft | Dòng kho |
| `Stock Item.item` | Link/varchar | FK Item NOT NULL | `z.string()` | link-field/barcode `*` | stock item active | scan/source | inherit | Vật tư |
| `Stock Item.quantity` | Float/decimal | CHECK >0 | `z.number().positive()` | number `*` | UOM whole rule | required qty | inherit | Số thực tế |
| `Stock Item.uom` | Link/varchar | FK UOM NOT NULL | `z.string()` | link-field `*` | conversion exists | item | inherit | ĐVT nhập/xuất |
| `Stock Item.conversion_factor` | Float/decimal | CHECK >0 | `z.number().positive()` | readonly | item conversion | item | inherit; W SYS | Quy đổi |
| `Stock Item.stock_quantity` | Float/decimal | NOT NULL | `z.number().positive()` | readonly | qty×factor | calculate | inherit; W SYS | Biến động UOM chuẩn |
| `Stock Item.bin_location` | Link/varchar | FK Location | `z.string().optional()` | link-field | thuộc warehouse | nhớ user | inherit | Kệ |
| `Stock Item.required_quantity` | Float/decimal | NULL | `z.number().nonnegative().optional()` | readonly | source snapshot | production | inherit; W SYS | Định mức |
| `Stock Item.variance_quantity` | Float/decimal | NOT NULL | `z.number()` | readonly | actual-required | calculate | inherit; W SYS | Chênh cần lý do |
| `Stock Item.reference_component_role` | Data/varchar | NULL | `z.string().optional()` | readonly | component exists | production | inherit; W SYS | Truy cấu kiện |
| `Stock Item.note` | Data/varchar | NULL | `z.string().max(300).optional()` | text | — | — | inherit | Ghi chú |

### 6.2 `Alumdoor Stock Ledger Entry` (immutable)

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `posting_datetime` | Datetime | NOT NULL INDEX | `z.string().datetime()` | readonly | from entry | submit | R O/A; W SYS | Thời điểm |
| `stock_entry/item_row` | Link/Data | FK/NOT NULL | `z.string()` | readonly | source submitted | submit | R O/A; W SYS | Nguồn |
| `item` | Link/varchar | FK Item NOT NULL INDEX | `z.string()` | readonly | stock item | source | R O/A; W SYS | Vật tư |
| `warehouse/bin_location` | Link/varchar | FK INDEX | `z.string()` | readonly | source | source | R O/A; W SYS | Nơi tồn |
| `actual_qty` | Float/decimal | NOT NULL !=0 | `z.number().refine(v=>v!==0)` | readonly | sign by purpose | submit | R O/A; W SYS | Phát sinh +/- |
| `stock_uom` | Link/varchar | FK UOM NOT NULL | `z.string()` | readonly | item stock UOM | source | R O/A; W SYS | ĐVT chuẩn |
| `running_qty` | Float/decimal | NOT NULL CHECK >=0 | `z.number().nonnegative()` | readonly | transaction lock | submit | R O/A; W SYS | Tồn sau dòng |
| `reversal_of` | Link/varchar | self FK | `z.string().optional()` | readonly | cancel only | cancel | R O/A; W SYS | Dòng đảo, không xóa |

## 7. Mua, giao và tiền

### 7.1 `Alumdoor Purchase Order` + `Alumdoor Purchase Order Item`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `PO.code` | Data/varchar | UNIQUE NOT NULL | `z.string()` | code-auto | `DM-YYYY-#####` | server | R O/A; W SYS | Số đơn mua |
| `PO.supplier` | Link/varchar | FK Partner NOT NULL | `z.string()` | link-field `*` | Supplier/Both active | — | R O/A; W O draft | NCC |
| `PO.order_date` | Date/date | NOT NULL | `z.string().date()` | date `*` | — | hôm nay | R O/A; W O draft | Ngày mua |
| `PO.expected_date` | Date/date | NULL | `z.string().date().optional()` | date | >= order | — | R O/A; W O draft | Ngày về |
| `PO.warehouse` | Link/varchar | FK Warehouse NOT NULL | `z.string()` | link-field | active | Kho chính | R O/A; W O draft | Kho nhận |
| `PO.status` | Select/varchar | NOT NULL | `purchaseStatusEnum` | badge/action | state machine | Draft | R O/A; W O action | Trạng thái |
| `PO.total_amount` | Currency/decimal | NOT NULL | `z.number().int()` | readonly money | sum | calculate | R O/A; W SYS | Giá thương mại |
| `PO.notes` | Small Text | NULL | `z.string().max(1000).optional()` | textarea | — | — | R O/A; W O draft | Ghi chú |
| `PO.items` | Table | >=1 | `z.array(purchaseItemSchema).min(1)` | child grid/cards | validate | — | R O/A; W O draft | Dòng mua |
| `PO Item.item` | Link/varchar | FK Item NOT NULL | `z.string()` | link-field `*` | purchase active | — | inherit | Vật tư |
| `PO Item.quantity/uom` | Float+Link | >0/FK | `purchaseQtySchema` | number+link `*` | conversion exists | item purchase UOM | inherit | SL mua |
| `PO Item.stock_quantity` | Float/decimal | NOT NULL | `z.number().positive()` | readonly | qty×factor | calculate | inherit; W SYS | SL kho |
| `PO Item.rate/amount` | Currency/decimal | integer >=0 | `moneyPairSchema` | money/readonly | amount=qty×rate | last rate as hint, not authority | inherit | Giá mua thương mại; không vào valuation kho |
| `PO Item.received_quantity` | Float/decimal | DEFAULT 0 | `z.number().nonnegative()` | readonly | receipts sum | service | inherit; W SYS | Đã nhận |

### 7.2 `Alumdoor Purchase Receipt` + item

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Receipt.code` | Data/varchar | UNIQUE | `z.string()` | code-auto | `PN-YYYY-#####` | server | R O/A; W SYS | Phiếu nhập |
| `Receipt.purchase_order` | Link/varchar | FK PO NOT NULL | `z.string()` | link-field `*` | submitted/open | context | R O/A; W O/A draft | Đơn mua nguồn |
| `Receipt.supplier/warehouse` | Link/varchar | FK NOT NULL | `z.string()` | readonly | matches PO | PO | R O/A; W SYS | Snapshot |
| `Receipt.receipt_date` | Date/date | NOT NULL | `z.string().date()` | date `*` | — | hôm nay | R O/A; W O/A draft | Ngày nhận |
| `Receipt.status` | Select/varchar | NOT NULL | `documentStatusEnum` | badge/action | state machine | Draft | R O/A; W action | Trạng thái |
| `Receipt.items` | Table | >=1 | `z.array(receiptItemSchema).min(1)` | child grid/cards | <= open qty hoặc reason | PO open lines | R O/A; W O/A draft | Hàng nhận |
| `Receipt Item.po_line_key/item` | Data+Link | source FK | `z.string()` | readonly | source exists | PO | inherit; W SYS | Dòng nguồn |
| `Receipt Item.quantity/uom` | Float+Link | >0 | `purchaseQtySchema` | number+link | conversion | open qty | inherit | SL thực nhận |
| `Receipt Item.stock_quantity` | Float | >0 | `z.number().positive()` | readonly | qty×factor | calculate | inherit; W SYS | Nhập kho |
| `Receipt Item.note` | Data | NULL | `z.string().max(300).optional()` | text | reason if over | — | inherit | Ghi chú |

### 7.3 `Alumdoor Delivery Note` + item

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Delivery.code` | Data/varchar | UNIQUE | `z.string()` | code-auto | `PG-YYYY-#####` | server | R O/A; W SYS | Phiếu giao |
| `Delivery.sales_order` | Link/varchar | UNIQUE FK Order | `z.string()` | link-field `*` | Ready to Deliver, full only | context | R O/A; W O/A draft | Một giao toàn bộ |
| `Delivery.customer_snapshot_json` | Long Text | NOT NULL | `customerSnapshotSchema` | readonly | from order | order | R O/A; W SYS | Khách/địa chỉ |
| `Delivery.delivery_date` | Date/date | NOT NULL | `z.string().date()` | date `*` | — | hôm nay | R O/A; W O/A draft | Ngày thực giao |
| `Delivery.receivable_warning_ack` | Check/tinyint | DEFAULT 0 | `z.boolean()` | checkbox alert | required nếu còn nợ | false | R O/A; W O/A | Xác nhận cảnh báo nợ |
| `Delivery.status` | Select/varchar | NOT NULL | `documentStatusEnum` | badge/action | state machine | Draft | R O/A; W action | Trạng thái |
| `Delivery.items` | Table | full order | `z.array(deliveryItemSchema).min(1)` | readonly list | no partial v1 | order units | R O/A; W SYS | Toàn bộ đơn |
| `Delivery Item.production_unit` | Link/varchar | UNIQUE FK Unit | `z.string()` | readonly/barcode | accepted | order | inherit; W SYS | Bộ cửa giao |
| `Delivery Item.item/quantity/uom` | snapshot | NOT NULL | `deliveryLineSchema` | readonly | matches unit/order | service | inherit; W SYS | Dòng giao |

### 7.4 `Alumdoor Money Account`, `Alumdoor Cashflow Category`, `Alumdoor Payment Entry`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Money Account.code/name` | Data | UNIQUE/NOT NULL | `moneyAccountNameSchema` | code-auto/text | code/name | import | R O/A; W O | Quỹ/ngân hàng |
| `Money Account.account_type` | Select | NOT NULL | `z.enum(['CASH','BANK'])` | select-enum | enum | — | R O/A; W O | Loại |
| `Money Account.bank_name/number/holder` | Data | conditional | `bankAccountSchema` | text | required khi bank | import | R O/A; W O | Snapshot in/thu |
| `Money Account.enabled` | Check | DEFAULT 1 | `z.boolean()` | checkbox | bool | true | R O/A; W O | Trạng thái |
| `Cashflow Category.code/name` | Data | UNIQUE/NOT NULL | `categorySchema` | code-auto/text | — | import | R O/A; W O | Loại thu/chi |
| `Cashflow Category.flow_type` | Select | NOT NULL | `z.enum(['RECEIPT','PAYMENT'])` | select-enum | v1 bỏ transfer | theo luồng | R O/A; W O | Thu/Chi |
| `Payment.code` | Data/varchar | UNIQUE | `z.string()` | code-auto | `PT/PC-YYYY-#####` | server | R O/A; W SYS | Số phiếu |
| `Payment.flow_type` | Select/varchar | NOT NULL | `z.enum(['RECEIPT','PAYMENT'])` | select-enum `*` | enum | theo action | R O/A; W O/A draft | Thu hay chi |
| `Payment.category` | Link/varchar | FK Category NOT NULL | `z.string()` | link-field `*` | matches flow | theo action | R O/A; W O/A draft | Loại thu/chi |
| `Payment.partner` | Link/varchar | FK Partner | `z.string().optional()` | link-field | required by category | từ order | R O/A; W O/A draft | Đối tác |
| `Payment.sales_order` | Link/varchar | FK Order | `z.string().optional()` | link-field | required thu đơn | context | R O/A; W O/A draft | Đơn liên quan |
| `Payment.amount` | Currency/decimal | CHECK >0 | `z.number().int().positive()` | money `*` | thu không vượt outstanding trừ Owner reason | cọc/còn nợ | R O/A; W O/A draft | Số tiền |
| `Payment.money_account` | Link/varchar | FK Account NOT NULL | `z.string()` | link-field `*` | active | theo method/user | R O/A; W O/A draft | Quỹ/TK |
| `Payment.posting_date` | Date/date | NOT NULL | `z.string().date()` | date `*` | — | hôm nay | R O/A; W O/A draft | Ngày thu/chi |
| `Payment.reason` | Small Text | conditional | `z.string().max(500).optional()` | textarea | bắt buộc hoàn cọc/hủy | context | R O/A; W O/A draft | Diễn giải |
| `Payment.status` | Select/varchar | NOT NULL | `documentStatusEnum` | badge/action | state machine | Draft | R O/A; W action | Submitted cập nhật paid |

## 8. Import, audit và chống lặp

### 8.1 `Alumdoor Import Job` + `Alumdoor Import Error`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Import Job.code` | Data | UNIQUE | `z.string()` | code-auto | `IMP-YYYY-#####` | server | R O; W SYS/action | Mã lượt nhập |
| `Import Job.import_type` | Select | NOT NULL | `importTypeEnum` | select-enum `*` | whitelist master | user | R O; W O action | Loại dữ liệu |
| `Import Job.source_file` | Attach | NOT NULL private | `z.string()` | file upload `*` | xlsx/csv <= settings | upload | R O; W O action | File gốc |
| `Import Job.checksum_sha256` | Data | NOT NULL INDEX | `z.string().length(64)` | readonly | hash | server | R O; W SYS | Nhận file lặp |
| `Import Job.mode` | Select | NOT NULL | `z.enum(['UPSERT_BY_CODE'])` | readonly | v1 one mode | default | R O; W SYS | Tạo/cập nhật, không xóa |
| `Import Job.status` | Select | NOT NULL | `importStatusEnum` | progress/badge | Uploaded/Validated/Committed/Failed | action | R O; W SYS | Trạng thái |
| `Import Job.total_rows/created/updated/error_count` | Int | DEFAULT 0 | `z.number().int().nonnegative()` | readonly | reconcile | parser | R O; W SYS | Kết quả |
| `Import Job.errors` | Table | child | `z.array(importErrorSchema)` | error grid | all errors | validate | R O; W SYS | Dòng/cột lỗi |
| `Import Error.row_no` | Int | NOT NULL | `z.number().int().positive()` | readonly | source row | parser | inherit; W SYS | Dòng Excel |
| `Import Error.column_name` | Data | NOT NULL | `z.string()` | readonly | source/header | parser | inherit; W SYS | Cột |
| `Import Error.code/message/value` | Data/Text | NOT NULL | `importErrorDetailSchema` | readonly | tiếng Việt, no secret | validator | inherit; W SYS | Lỗi tải về |

### 8.2 `Alumdoor Audit Event` và `Alumdoor Request Key`

| DocType.Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `Audit Event.actor` | Link/varchar | FK User NOT NULL | `z.string()` | readonly | session | session | R O; W SYS | Ai |
| `Audit Event.action` | Data/varchar | NOT NULL INDEX | `z.string()` | readonly | whitelist | service | R O; W SYS | Hành động |
| `Audit Event.reference_doctype/name` | Data/varchar | NOT NULL INDEX | `z.string()` | readonly/link | exists | service | R O; W SYS | Bản ghi |
| `Audit Event.before_json/after_json` | Long Text | NULL | `auditSnapshotSchema` | diff viewer | redact secrets | service | R O; W SYS | Trước/sau |
| `Audit Event.reason` | Small Text | NULL | `z.string().max(500).optional()` | readonly | from action | service | R O; W SYS | Lý do |
| `Audit Event.request_id/ip` | Data | NOT NULL | `requestMetaSchema` | readonly | server | request | R O; W SYS | Tra lỗi |
| `Request Key.user/action/key` | Data | UNIQUE tuple NOT NULL | `requestKeySchema` | hidden | session + key | request | R SYS; W SYS | Idempotency |
| `Request Key.reference_name/response_json` | Data/Long Text | NOT NULL | `requestResultSchema` | hidden | same action | commit | R SYS; W SYS | Trả lại kết quả cũ |

## 9. Settings (Single DocType `Alumdoor Settings`)

| Field | Frappe/MariaDB | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| `company_name/logo/address/phone/tax_code` | Data/Attach/Text | company_name required | `companySettingsSchema` | text/image/address | VN formats | setup wizard | R all; W O | Header/in |
| `default_vat_percent` | Percent | DEFAULT 8 | `z.number().min(0).max(100)` | number | 0–100 | 8 | R all; W O | VAT đơn mới |
| `default_warehouse` | Link | FK Warehouse NOT NULL | `z.string()` | link-field | active | Kho chính | R O/A; W O | Kho mặc định |
| `default_money_account` | Link | FK Money Account | `z.string().optional()` | link-field | active | — | R O/A; W O | Tài khoản mặc định |
| `kerf_mm` | Float | DEFAULT 3 CHECK >=0 | `z.number().nonnegative()` | number | hợp lý 0–20, >10 cảnh báo | 3 | R O/A; W O | Kerf mặc định |
| `order_prefix/production_prefix/...` | Data | NOT NULL | `z.string().regex(prefixSafe)` | text | unique intent | presets | R all; W O | Naming series |
| `print_paper_size` | Select | DEFAULT A4 | `z.enum(['A4','A5'])` | select-enum | enum | A4 | R all; W O | Bản khách/phiếu |
| `backup_status/last_backup_at` | Data/Datetime | readonly | `backupStatusSchema` | readonly | job | cron | R O; W SYS | Niềm tin dữ liệu |

## 10. State machine authority

State/action chi tiết nằm ở `TECHNICAL_DESIGN.md` và `API_CONTRACT.md`. Quy tắc chung:

- Không field `status` nào cho sửa qua generic REST `PUT`.
- Chuyển trạng thái bằng method riêng, kiểm role + state + `expected_modified` + reason khi cần.
- Child snapshot, ledger, audit và request key không có API CRUD công khai.

## 11. Cổng ledger

- [x] Master đối tác/vật tư/màu/kho.
- [x] Cấu hình đo/công thức/gói/giá.
- [x] Đơn hàng + items + cấu kiện + adjustment + revision.
- [x] Production Request/Order/Unit.
- [x] Stock Entry/Item/Ledger.
- [x] Purchase/Receipt/Delivery/Payment.
- [x] Import/Audit/Idempotency/Settings.
- [x] Mỗi field có đủ 9 cột theo contract.
