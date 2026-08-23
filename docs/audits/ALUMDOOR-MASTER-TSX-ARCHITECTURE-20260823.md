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

Extension mới compose theo đúng một đường:

```text
combined-workspace-extension
  1. master-workspaces/registry
  2. workspace-extension hiện có (bán/mua/kho/sản xuất/BOM Rule)
  3. undefined → generic DoctypeWorkspace
```

Không sửa `@metaforge/views` để nhét Alumdoor vào lõi dùng chung.

`?master_ui=generic` là escape hatch có chủ đích: cùng URL record/new có thể ép bỏ workbench và mở form metadata đầy đủ. Nhờ đó mỗi workbench có thể rollout dần mà không giấu các field hiếm chưa surface.

---

## 2. Luật phân loại

### Generic

Giữ generic khi dữ liệu phẳng, ít field, không cần preview/công thức và nhập sai không tạo một chuỗi lỗi khó lần ra ở màn khác.

### Enhanced generic

Vẫn là generic nhưng cần description, section, validation liên-field đơn giản, lookup/guide tốt hơn. Không viết TSX chỉ vì bố cục generic chưa đẹp.

### Dedicated TSX

Dùng workbench khi một công việc cần nhiều DocType/bảng con, có preview/công thức, hoặc sai dữ liệu có thể làm sai giá, BOM, tồn, sản xuất.

---

## 3. Phân loại 31 mục đang khai trên Master Data Hub

| Nhóm | DocType | Phân loại | Đích / lý do |
|---|---|---|---|
| Vật tư & quy cách | Item | **Dedicated — ĐÃ LÀM P1** | `ItemMasterWorkbench`: vai trò hàng, ĐVT/kho, UOM conversion, quy cách kỹ thuật, geometry/công thức cửa, liên kết master |
| Vật tư & quy cách | Item Group | Generic | Cây phân nhóm, CRUD rõ |
| Vật tư & quy cách | UOM | Generic | Lookup phẳng |
| Vật tư & quy cách | Surface Finish | Generic | Lookup phẳng |
| Vật tư & quy cách | Item Color | Generic | Lookup phẳng; luật màu nằm ở chiều Item.allowed_colors |
| Vật tư & quy cách | Material Specification | Enhanced generic / thuộc cụm Item | Hồ sơ Kg/m và thông số kỹ thuật; Item workbench link thẳng tới hồ sơ nguồn, chưa copy editor vào Item |
| Vật tư & quy cách | Quy cách cửa | **Dedicated — P4** | Gom với Geometry/Cutting Policy; bản lá tác động trực tiếp diện tích tính tiền |
| Vật tư & quy cách | Measurement Profile | Enhanced generic / thuộc cụm Item | Nguồn duy nhất của cách theo dõi vật tư; cần guide rõ nhưng chưa cần editor riêng |
| Vật tư & quy cách | Geometry Field | Enhanced generic / thuộc cụm Geometry | Định nghĩa trường hình học dùng chung |
| Vật tư & quy cách | Geometry Profile | **Dedicated — P4** | Một profile gồm nhiều field + applicability; người dùng không nên tự nhớ ID nối giữa các bảng |
| Kho | Warehouse | Generic | Danh mục kho; validation kho lá/kho nhóm để server giữ |
| Mua hàng & NCC | Supplier | Generic | Hồ sơ đối tác phẳng |
| Mua hàng & NCC | Supplier Item | Enhanced generic / thuộc cụm Item | Mã NCC + giá gần nhất; Item workbench có đường mở nhanh. Chưa inline-edit để tránh đoán schema/authority của giá gần nhất |
| Khách hàng & giá | Customer | Generic | Hồ sơ khách; đã có luồng nghiệp vụ khác dùng |
| Khách hàng & giá | Price List | Generic | Lookup bảng giá |
| Khách hàng & giá | Item Price | **Dedicated — P2** | Cần nhìn bậc diện tích/phạm vi/preview cùng chính sách |
| Khách hàng & giá | Bậc diện tích | Generic | Bảng ngưỡng phẳng |
| Khách hàng & giá | Pricing Scope | **Dedicated — P2** | Scope rỗng hiện có thể lưu nhưng rule không match; cần editor theo công việc |
| Khách hàng & giá | Pricing Rule | **Dedicated — P2** | Cần bắt đủ phạm vi + effect + preview; không copy pricing engine sang client |
| Bán hàng & SX | Cutting Policy | **Dedicated — P4** | Gom `Quy cách cửa + Geometry Profile + Cutting Policy` thành Door/Geometry Workbench |
| Bán hàng & SX | Ngưỡng chọn Motor | **Dedicated — P5** | Bảng điều kiện diện tích → motor → tải → UPS, tái sử dụng engine server |
| Bán hàng & SX | BOM Rule | **Dedicated — ĐÃ CÓ** | `AlumdoorBomRuleEditor.tsx` đã override create/detail |
| Bán hàng & SX | Bill of Materials | **Dedicated — P3** | Hội tụ BOM thật + BOM Rule + preview; tái sử dụng `AlumdoorBomActualEditor`/logic hiện có |
| Bán hàng & SX | Production Standard | Enhanced generic | Chưa mở lịch sản xuất đầy đủ; không xây workbench sớm |
| Địa bàn | Tỉnh Thành | Generic | Lookup phẳng |
| Địa bàn | Phường Xã | Generic | Lookup phẳng dù số bản ghi lớn; vấn đề là search/list, không phải editor nghiệp vụ |
| Địa bàn | Địa chỉ giao lắp | Enhanced generic | Có liên kết địa bàn nhưng chưa đủ phức tạp để tạo TSX riêng |
| Kế toán | Tài khoản ngân hàng | Generic | Master kế toán phẳng |
| Lý do vận hành | Lý do huỷ | Generic | Lookup phẳng |
| Lý do vận hành | Nguyên nhân chênh lệch | Generic | Lookup phẳng |
| Lý do vận hành | Nguyên nhân cửa lỗi | Generic | Lookup phẳng |

---

## 4. P1 đã triển khai — Item/Vật tư

File:

```text
client/packages/vertical-alumdoor/src/master-workspaces/ItemMasterWorkbench.tsx
client/packages/vertical-alumdoor/src/master-workspaces/registry.tsx
client/packages/vertical-alumdoor/src/combined-workspace-extension.tsx
```

### Route

```text
/app/Item/new       → ItemMasterWorkbench
/app/Item/<name>    → ItemMasterWorkbench
/app/Item           → generic List (giữ nguyên)
```

Escape hatch:

```text
/app/Item/new?master_ui=generic
/app/Item/<name>?master_ui=generic
```

→ generic Form.

### Tabs hiện có

1. **Cơ bản** — mã, tên, nhóm, tính chất, giai đoạn vật tư, nguồn cung, giá vốn, cờ mua/bán/tồn.
2. **ĐVT & kho** — Measurement Profile, stock/purchase/sales UOM, catch-weight, batch/serial, kho, bảng `uom_conversions`.
3. **Quy cách & cửa** — Material Specification, door type, Cutting Policy, Geometry Profile, barem Kg/m², diện tích tối thiểu.
4. **Liên kết** — mở thẳng hồ sơ nguồn Measurement Profile / Material Specification / Geometry Profile / Cutting Policy / Supplier Item, không copy logic master sang Item.

### Validation ở workbench

- mã Item mới theo `[A-Z0-9.-]`, tối đa 24;
- tên, nhóm, Measurement Profile, stock UOM bắt buộc;
- purchase/sales UOM khác stock UOM thì cần conversion dương;
- catch-weight không được mang bảng quy đổi cố định;
- catch-weight phải có weight UOM;
- batch và serial không bật đồng thời;
- Item là cửa phải có Cutting Policy + Geometry Profile;
- barem Kg/m² thiếu chỉ cảnh báo vì luồng sản xuất hiện chủ đích cho phép bỏ trống ước tính, không tự bịa số;
- nguyên vật liệu không có Material Specification chỉ cảnh báo ở P1, không chặn mọi phụ kiện/vật tư chưa phân loại đủ.

### Điều cố ý không làm

- không đưa `standard_length_m` trở lại UI/cảnh báo;
- không tự điền Material Specification/Geometry Profile;
- không tự xoá UOM conversion khi người dùng bật catch-weight — phải báo để người dùng thấy dữ liệu đang mâu thuẫn;
- không inline sửa `Supplier Item.last_purchase_rate` vì authority của giá mua gần nhất không được suy đoán ở client;
- không viết lại pricing/BOM/motor engine trong client.

---

## 5. Các pha tiếp theo

### P2 — Pricing Workbench

Gom `Item Price + Pricing Scope + Pricing Rule` theo luồng:

```text
Áp cho cái gì → Điều kiện → Tác động giá → Ưu tiên → Preview server
```

Chặn trạng thái scope rỗng / rule không effect ngay khi lưu active.

### P3 — BOM Workbench

Tái sử dụng editor hiện có, hiển thị rõ:

```text
Thành phẩm → thành phần → qty → qty_basis → BOM Rule → preview kích thước
```

`qty_basis` là hệ số nhân, không phải cờ tự tính thay `qty`.

### P4 — Door / Geometry Workbench

Gom `Quy cách cửa + Geometry Profile + Geometry Field + Cutting Policy`, tập trung vào một việc: cấu hình một loại cửa và xem Item nào đang dùng.

### P5 — Motor / UPS Workbench

Bảng nghiệp vụ trực tiếp; engine chọn motor/UPS vẫn nằm server.

---

## 6. Nguyên tắc giữ lâu dài

- Một DocType mới **không mặc định có TSX riêng**.
- Một công việc cần bốn DocType có thể là **một workbench**.
- Master Data Hub vẫn là bản đồ/readiness, không biến thành editor khổng lồ.
- Generic form là fallback lâu dài, không phải đồ tạm chờ xoá.
- Mọi workbench chuyên dụng phải đi qua `master-workspaces/registry`; không rải `if (doctype === ...)` thêm vào operational `workspace-extension.tsx`.
- Preview phải gọi engine server hoặc thin endpoint dùng chung logic server.
