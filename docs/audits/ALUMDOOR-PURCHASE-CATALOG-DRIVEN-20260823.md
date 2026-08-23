# Alumdoor Purchase Catalog Driven — audit 2026-08-23

## Kết luận

Luồng mua hàng đã được đưa về mô hình:

`Item → Measurement Profile → Material Specification → Purchase Runtime → Purchase Order / Purchase Receipt`

TSX không còn là nguồn sự thật để quyết định field vật lý nào phải hiện theo tên nhóm hàng, tên profile hay giá trị đang có trong dòng.

## Source of truth matrix

| Nghiệp vụ | Authority | Runtime/UI chỉ đọc |
|---|---|---|
| Màu có cần nhập | `Measurement Profile.require_color` | Purchase Runtime → PO/Receipt |
| Tình trạng có cần nhập | `Measurement Profile.require_condition` | Purchase Runtime → PO/Receipt |
| Chiều dài có cần nhập | `Measurement Profile.require_length` | Purchase Runtime → PO/Receipt |
| Chiều rộng có cần nhập | `Measurement Profile.require_width` | Purchase Runtime → PO/Receipt |
| Số cây/lá/tấm có cần nhập | `Measurement Profile.require_piece_qty` | Purchase Runtime → PO/Receipt |
| Số bó có theo dõi | `Measurement Profile.track_bundle_qty` | Purchase Runtime → PO/Receipt |
| Theo lô kích thước | `Measurement Profile.track_dimension_lot` | Purchase Runtime |
| Dung sai cân | `Measurement Profile.weight_tolerance_pct` | Receipt variance logic |
| Kg/m lý thuyết | `Material Specification.theoretical_kg_per_m` | Purchase Runtime, read-only |
| Chiều dài chuẩn | `Material Specification.standard_length_m` | Gợi ý khi đổi Item; người dùng được sửa theo lô thật |
| Độ dày/tiết diện/khổ kỹ thuật | `Material Specification` | Runtime/audit; không quyết visibility |
| ĐVT tồn | `Item.stock_uom` | Runtime |
| ĐVT mua | `Item.default_purchase_uom` | Runtime |
| Catch-weight | `Item.has_catch_weight` + `Item.weight_uom` | Runtime; không suy bằng chuỗi inventory mode |
| Batch/Serial | `Item.has_batch_no` / `Item.has_serial_no` | Runtime |
| Quy đổi tĩnh | `Item.uom_conversions` | Runtime |
| Quy đổi catch-weight động | Dữ liệu từng dòng nhận (`qty_bar`, kg thực/barem) | Server tính; không lưu hệ số tĩnh giả |
| Geometry bán hàng | `Geometry Profile` / `Geometry Field` | Ngoài scope Purchase |
| Công thức cắt | `Cutting Policy` | Ngoài scope Purchase |
| BOM | BOM/BOM Rule | Ngoài scope Purchase |
| Giá | Pricing/Supplier Item/Price runtime | Không đưa vào Measurement Profile |

## Workbench danh mục

Có dedicated TSX cho:

- `Measurement Profile` — cấu hình các đại lượng vật lý Purchase cần nhập.
- `Material Specification` — cấu hình facts kỹ thuật như kg/m, chiều dài chuẩn, tiết diện, độ dày, khổ.
- `Item` — giữ identity, links, UOM/tracking và Runtime Summary MUA/BÁN/SẢN XUẤT.

Generic metadata form vẫn mở được bằng `?master_ui=generic` để không biến dedicated workbench thành hệ metadata thứ hai.

## Purchase Runtime

Server module `purchase-item-runtime.ts` dựng contract chung cho `Purchase Order Item` và `Purchase Receipt Item`.

Mỗi field runtime có:

- `fieldname`
- `label`
- `source`
- `visible`
- `required`
- `read_only`
- `sequence`

`purchase-child-preview.ts` chuyển contract thành `field_overrides`. Cả PO và Receipt dùng cùng nguồn này.

`ui-child-preview.ts` chỉ làm router. Purchase đi qua runtime mới; implementation Sales trước refactor được giữ trong `ui-child-preview-legacy.ts` để không đổi hành vi Sales ngoài scope.

## Hard-code đã loại khỏi structural visibility

Đã loại khỏi quyết định cột/field Purchase:

- `inventory_mode === "Nhôm cây/lá"` trong PO grid.
- tên profile `Ống/trục` trong PO grid.
- value-driven visibility kiểu `line[fieldname] có giá trị thì hiện`.
- Receipt table tự suy field vật lý theo loại hàng.
- client dùng chuỗi inventory mode để nhận diện catch-weight cho structural UI.

Field trống vẫn hiện nếu runtime nói `visible=true`; thêm/xóa giá trị không làm schema của dòng tự đổi.

## Compatibility debt còn có chủ đích

### `is_stamped`

Schema hiện tại chưa có cờ semantic riêng kiểu `require_stamped`. Runtime tạm suy từ `track_dimension_lot + require_piece_qty` và đánh `source="legacy"` để debt lộ rõ, không giả vờ rằng Measurement Profile đang sở hữu field này.

### `so_no`

Đây là tham chiếu giao nhận NCC, không phải measurement. Runtime hiện khi dòng theo lô/kích thước và đánh `source="legacy"`. Không thêm field master mới chỉ để làm đẹp refactor.

### Client hydrate cũ

`AlumdoorPurchaseOrderCreateStable.tsx` và Receipt Workbench vẫn có một số dữ liệu cache/hydrate lịch sử phục vụ mở chứng từ cũ. Chúng không còn là authority của structural visibility; preview server sẽ reconcile lại dòng qua Purchase Runtime trước khi lưu.

## Standard length

`Material Specification.standard_length_m` được giữ đúng vai trò fact kỹ thuật:

- không hard-code chiều dài 6m/8m trong TSX;
- chỉ tự gợi ý khi đổi Item và Measurement Profile yêu cầu `length_m`;
- không khóa người dùng: chiều dài thực của chuyến/lô được phép sửa;
- tính barem sau đó dùng chính `length_m` hiệu lực của dòng.

## UOM / catch-weight

Catch-weight không có hệ số tĩnh Kg → Cây/Lá vì số cây trên một kg phụ thuộc chiều dài/lô thực.

Runtime chỉ dùng conversion tĩnh khi trục đó thật sự tĩnh. Với catch-weight, khi đủ số cây và kg thì `conversion_factor = qty_bar / priced_kg` của chính dòng; `stock_qty` là số cây/lá/tấm đếm được.

## Schema / migration

Đợt này **không thêm field DocType mới và không cần migration schema**.

Các authority cần thiết đã tồn tại:

- Measurement Profile flags;
- Material Specification technical fields, gồm `standard_length_m` nếu metadata hiện hành khai;
- Item UOM/tracking/catch-weight fields.

Nếu sau này cần cấu hình thứ tự khác nhau theo từng Measurement Profile hoặc cần `require_stamped` thật, lúc đó mới nên thêm child config/field metadata có audit riêng. Không thêm trước khi có yêu cầu nghiệp vụ thật.

## Test lock

Có test khóa:

- Purchase Runtime đọc Measurement Profile + Material Specification tách authority.
- Purchase server không branch theo tên `Nhôm cây/lá`, `Tấm/Kính`, `Hàng thường` để quyết visibility.
- PO grid structural visibility chỉ đọc server override.
- Receipt dùng cùng override cho các field vật lý chung.
- dedicated master registry có Measurement Profile + Material Specification.
- functional preview kiểm catch-weight, barem, stock qty theo số cây và `standard_length_m` default.
- Sales catalog-driven test đã đổi sang kiểm implementation preserved ở `ui-child-preview-legacy.ts` sau khi router được tách.

## Điều không làm trong refactor này

- Không sửa BOM/BOM Rule.
- Không sửa Pricing authority.
- Không chuyển Geometry sang Measurement Profile.
- Không tạo công thức cửa mới.
- Không hard-code thêm tên nhóm hàng/cửa vào Purchase UI.
