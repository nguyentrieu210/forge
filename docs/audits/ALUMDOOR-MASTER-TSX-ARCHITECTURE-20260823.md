# Alumdoor — kiến trúc Master TSX Workbench

Ngày: 23/08/2026  
Nhánh: `alumdoor-master-tsx`  
Base khi mở nhánh: `616d3a5f9918b7f2baef1712d4a6416efc2e15f4`

## 1. Quyết định

Không thay generic List/Form bằng một hệ form riêng của Alumdoor.

Mô hình chính thức:

```text
Master Data Hub
  → danh mục phẳng / CRUD thường        → generic DoctypeWorkspace
  → danh mục cần trợ giúp vừa phải      → enhanced generic (metadata/validation/guide)
  → công việc nhiều DocType / công thức → dedicated TSX workbench
```

Extension compose theo đúng một đường:

```text
combined-workspace-extension
  1. master-workspaces/registry
  2. workspace-extension hiện có (bán/mua/kho/sản xuất/BOM Rule)
  3. undefined → generic DoctypeWorkspace
```

Không sửa `@metaforge/views` để nhét Alumdoor vào lõi dùng chung.

`?master_ui=generic` là escape hatch có chủ đích: cùng URL record/new có thể ép bỏ workbench và mở form metadata đầy đủ. Generic form là fallback lâu dài, không phải đồ tạm chờ xoá.

---

## 2. Phân loại 31 mục trên Master Data Hub

| Nhóm | DocType | Phân loại / trạng thái |
|---|---|---|
| Vật tư & quy cách | Item | **Dedicated · P1 xong** — `ItemMasterWorkbench` |
| Vật tư & quy cách | Item Group | Generic |
| Vật tư & quy cách | UOM | Generic |
| Vật tư & quy cách | Surface Finish | Generic |
| Vật tư & quy cách | Item Color | Generic |
| Vật tư & quy cách | Material Specification | Enhanced generic / mở nhanh từ Item workbench |
| Vật tư & quy cách | Quy cách cửa | **Dedicated · P4 xong** — `DoorGeometryWorkbench` |
| Vật tư & quy cách | Measurement Profile | Enhanced generic / mở nhanh từ Item workbench |
| Vật tư & quy cách | Geometry Field | Generic/Enhanced — lookup trường hình học, không cần editor riêng |
| Vật tư & quy cách | Geometry Profile | **Dedicated · P4 xong** — `DoorGeometryWorkbench` |
| Kho | Warehouse | Generic |
| Mua hàng & NCC | Supplier | Generic |
| Mua hàng & NCC | Supplier Item | Enhanced generic / mở nhanh từ Item workbench |
| Khách hàng & giá | Customer | Generic |
| Khách hàng & giá | Price List | Generic |
| Khách hàng & giá | Item Price | **Dedicated · P2 xong** — `PricingMasterWorkbench` |
| Khách hàng & giá | Bậc diện tích | Generic |
| Khách hàng & giá | Pricing Scope | **Dedicated · P2 xong** — `PricingMasterWorkbench` |
| Khách hàng & giá | Pricing Rule | **Dedicated · P2 xong** — `PricingMasterWorkbench` |
| Bán hàng & SX | Cutting Policy | **Dedicated · P4 xong** — `DoorGeometryWorkbench` |
| Bán hàng & SX | Ngưỡng chọn Motor | **Dedicated · P5 xong** — `MotorUpsMasterWorkbench` |
| Bán hàng & SX | BOM Rule | **Dedicated có sẵn** — `AlumdoorBomRuleEditor` qua operational extension |
| Bán hàng & SX | Bill of Materials | **Dedicated · P3 xong** — `BomMasterWorkbench` |
| Bán hàng & SX | Production Standard | Enhanced generic; chưa cần workbench riêng |
| Địa bàn | Tỉnh Thành | Generic |
| Địa bàn | Phường Xã | Generic — nhiều bản ghi là bài toán search/list, không phải editor |
| Địa bàn | Địa chỉ giao lắp | Enhanced generic |
| Kế toán | Tài khoản ngân hàng | Generic |
| Lý do vận hành | Lý do huỷ | Generic |
| Lý do vận hành | Nguyên nhân chênh lệch | Generic |
| Lý do vận hành | Nguyên nhân cửa lỗi | Generic |

---

## 3. Registry và routing

Các file kiến trúc:

```text
client/packages/vertical-alumdoor/src/combined-workspace-extension.tsx
client/packages/vertical-alumdoor/src/master-workspaces/registry.tsx
client/packages/vertical-alumdoor/src/index.ts
```

Danh sách vẫn dùng generic List. Create/detail mới được workbench nhận:

```text
/app/Item/new | /app/Item/<name>
/app/Item Price/new | /app/Item Price/<name>
/app/Pricing Scope/new | /app/Pricing Scope/<name>
/app/Pricing Rule/new | /app/Pricing Rule/<name>
/app/Bill of Materials/new | /app/Bill of Materials/<name>
/app/Quy cách cửa/new | /app/Quy cách cửa/<name>
/app/Geometry Profile/new | /app/Geometry Profile/<name>
/app/Cutting Policy/new | /app/Cutting Policy/<name>
/app/Ngưỡng chọn Motor/new | /app/Ngưỡng chọn Motor/<name>
```

Thêm `?master_ui=generic` vào create/detail để mở form metadata đầy đủ.

`BOM Rule` vẫn do operational extension cũ xử lý; không đăng ký trùng trong master registry.

---

## 4. P1 — Item / Vật tư

File: `master-workspaces/ItemMasterWorkbench.tsx`.

Tabs:

1. **Cơ bản** — mã, tên, nhóm, tính chất, giai đoạn vật tư, nguồn cung, giá vốn, mua/bán/tồn.
2. **ĐVT & kho** — Measurement Profile, stock/purchase/sales UOM, catch-weight, batch/serial, kho, `uom_conversions`.
3. **Quy cách & cửa** — Material Specification, door type, Cutting Policy, Geometry Profile, barem Kg/m², diện tích tối thiểu.
4. **Liên kết** — mở master nguồn thay vì copy editor/authority sang Item.

Chốt validation:

- purchase/sales UOM khác stock UOM thì phải có conversion dương;
- catch-weight không dùng bảng conversion cố định;
- cửa phải có Cutting Policy + Geometry Profile;
- cửa và vật tư cây không bị ép cùng một loại profile;
- `standard_length_m` không được đưa lại vào cảnh báo;
- barem Kg/m² thiếu chỉ cảnh báo theo behavior sản xuất hiện tại, không bịa số.

---

## 5. P2 — Pricing

File: `master-workspaces/PricingMasterWorkbench.tsx`.

Ba DocType cùng một tư duy:

```text
Item Price      → giá gốc theo bảng giá / Item / UOM / price_variant / area_tier
Pricing Scope   → tập Item / Item Group tái sử dụng
Pricing Rule    → phạm vi → effect → hiệu lực → điều kiện → preview
```

Chốt:

- Pricing Scope không được lưu rỗng;
- Pricing Rule phải có effect hợp lệ;
- rule bật mà không có bất kỳ filter nào phải xác nhận rõ **“Tôi chủ đích áp dụng toàn bộ”**; không cấm global rule vì engine server hỗ trợ nó;
- Item Price không lặng lẽ bỏ `area_tier`; hàng không chia bậc dùng `MOI-DIEN-TICH`;
- preview gọi **`metaforge.api.preview_sales_commercial_line`**, cùng engine màn bán hàng; client không copy pricing engine;
- preview nói rõ phải lưu rule trước để rule đang sửa xuất hiện trong state server.

---

## 6. P3 — BOM

File: `master-workspaces/BomMasterWorkbench.tsx`.

Màn làm rõ ngay trên từng dòng:

```text
Vật tư → SL cơ sở → qty_basis → UOM → BOM Rule → nguồn/trạng thái
```

Chốt an toàn:

- `qty_basis` là **hệ số nhân**, không thay thế `qty`;
- `Theo số lá` = `qty × số_lá`;
- phát hiện `_tam_dien_1`, `PENDING`, SL rỗng/không dương và hiện cảnh báo;
- workbench **không tự chữa** các dòng tạm;
- BOM đã ghi sổ/hủy read-only;
- workbench chỉ có **Lưu nháp**; thao tác ghi sổ đi qua “Form đầy đủ / Ghi sổ” để giữ workflow submit chuẩn hiện có thay vì viết một submit path thứ hai;
- `BOM Rule` vẫn là authority công thức tiêu hao dùng chung; `Cutting Policy` vẫn là authority hình học cửa.

---

## 7. P4 — Cửa / Geometry

File: `master-workspaces/DoorGeometryWorkbench.tsx`.

### `Quy cách cửa`

Tách rõ hai số dễ bị nhập nhầm:

- `buoc_la_m` = **ước số chia lá**, tham gia phép tính số lá;
- `be_rong_nan_mm` = **bề rộng nan**, dùng nhận diện/tra giá, không phải divisor.

Không suy một số từ số kia. `AL552 (CŨ)` hiện cảnh báo mâu thuẫn nguồn và **không tự sửa** 0,057 → 0,05.

`rong_toi_da_mm` và `trong_luong_kg_m2` được phép trống nếu chưa có nguồn đáng tin.

### `Geometry Profile`

Quản lý:

- nhóm hàng áp dụng;
- danh sách Geometry Field;
- role INPUT / CALCULATED / INFO;
- required / visible / editable / sequence.

Chặn CALCULATED nhưng vẫn editable, hoặc required nhưng invisible.

`Geometry Field` bản thân vẫn generic vì là lookup phẳng.

### `Cutting Policy`

Nhóm giao diện theo đúng authority:

1. khóa phân giải: door type / ray / item group / priority;
2. cơ sở đo và số trừ cắt;
3. chia lá;
4. geometry rules.

Giữ các quyết định nguồn quan trọng trên UI:

- khách lẻ cửa Đức trừ **0,08 m**, không đổi thành 0,06;
- mọi loại cửa phải có công thức chia lá;
- divisor “Bản lá của bộ quy cách” đọc `Quy cách cửa.buoc_la_m`, không đọc `be_rong_nan_mm`;
- Cutting Policy không chứa Pricing/BOM quantity.

---

## 8. P5 — Motor / UPS

File: `master-workspaces/MotorUpsMasterWorkbench.tsx`.

Một record editor đi kèm bảng toàn bộ ngưỡng đang hoạt động để người dùng nhìn được thứ tự và khoảng trống.

Hai luật hiển thị tách rõ:

```text
Motor → selection_basis = "Diện tích cửa" → area < max_area_sqm
UPS   → selection_basis = "Tải motor"     → motor_kg < max_motor_kg
```

Cả hai là **cận trên mở**, đúng 15 m² không dùng dòng `<15 m²`.

Panel thử diện tích tái sử dụng `AlumdoorMotorSuggestPanel`, và panel đó gọi **`alumdoor.motor.suggest`**. Không có ngưỡng/không phủ tải thì server trả thiếu và UI báo thiếu; client không đoán mã motor/UPS.

---

## 9. Những thứ cố ý KHÔNG làm

- không tạo 31 TSX;
- không fork `DoctypeWorkspace`;
- không sửa `@metaforge/views` để hard-code Alumdoor;
- không copy engine Pricing/BOM/Motor sang client;
- không tự sửa AL552;
- không tự biến `_tam_dien_1` thành định mức thật;
- không tự điền Kg/m, Kg/m², ngưỡng, UOM conversion khi nguồn chưa đủ;
- không biến `Geometry Field`/UOM/Color/Province/Ward thành workbench chỉ vì danh sách dài;
- không làm CI trong nhánh này.

---

## 10. Chốt giữ lâu dài

- Thiết kế theo **công việc người dùng**, không theo “một DocType = một màn”.
- Master Data Hub tiếp tục là bản đồ/readiness, không thành siêu editor.
- Mọi master workbench mới phải đăng ký qua `master-workspaces/registry.tsx`.
- Không match registry → operational extension → generic fallback.
- Mỗi dedicated workbench phải giữ `?master_ui=generic` để thoát về form đầy đủ.
- Preview/tính toán phải gọi engine server hoặc method dùng chung logic server.
