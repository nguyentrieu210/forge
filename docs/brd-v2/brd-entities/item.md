# E01 — Item (Hàng hoá / Vật tư)

> Doctype danh mục · lưu JSON trong `master_records.data_json` · `naming: field:item_code`
>
> **Nguyên tắc phân vai:** Item giữ **sự thật ỔN ĐỊNH** của một mặt hàng. Thứ thay đổi theo từng
> chuyến hàng — màu, khổ, tình trạng, kg thực cân — nằm ở **Batch + Custom Field (E02)**, không nằm ở đây.

> **Quyết định duyệt lại 30/07/2026:** nhôm mua và tồn theo `Kg`; số cây/lá và số bó là
> số lượng phụ theo từng dòng/lô. `qty` luôn là số lượng tính tiền theo `uom`.
> `allowed_colors` rỗng là chưa cấu hình và phải chặn; không còn nghĩa “mọi màu”.

---

## 1. Thay đổi so với bản cũ (`briefs/alumdoor.json`)

| Việc | Bản cũ | V2 | Căn cứ |
|---|---|---|---|
| Biến thể | `variant_of` + `variant_attributes` + doctype `Item Variant Attribute` | **XOÁ HẲN** | QĐ-3 — 1 mã × 24 màu × n khổ là mớ 477 mã quay lại; ERPNext còn cấm item mẫu giao dịch |
| `inventory_mode` | Khai ở **CẢ** Item lẫn Measurement Profile | **Chỉ còn ở Measurement Profile**; `measurement_profile` thành **bắt buộc** | "Luật viết hai lần rồi trôi dạt". Hai nơi khai thì có thể mâu thuẫn: Item ghi `Nhôm cây/lá` mà profile ghi `Hàng thường` — không nhân nào xử được |
| `door_type` | 5 loại cửa | **6** — thêm `Cửa tấm liền Úc` | Sheet `1-Dong san pham` có nhóm này (CỬA ĐỨC KÉO TAY AL70, CỬA ÚC KT/MTN) và `25.7 QUY TRÌNH.docx` cho nó công thức RIÊNG |
| `valuation_method` | `Select(FIFO)` — đúng **một** lựa chọn | `Select(FIFO, Bình quân di động)`; nhôm dùng **FIFO thu hẹp theo batch** | Nhân đã hỗ trợ 2 phương pháp (`valuation.ts:6`) nhưng brief chỉ cho chọn 1 |
| Catch weight | không có | **`has_catch_weight` + `weight_uom`** | QĐ-2 — nhôm đếm bằng Cây/Lá, tính tiền bằng Kg |
| `uom_conversions` | dùng cho mọi item | **Cấm khai cho item có `has_catch_weight`** | QĐ-2 — `1 cây = khổ × kg/m`, khổ đổi từng lô ⇒ không tồn tại hệ số tĩnh |
| Mã hàng | tự do | **Chặn ký tự ngoài `A–Z 0–9 - .`** | 121 mã có khoảng trắng, 147 chữ thường, 26 có dấu |

---

## 2. Bảng field

### 2.1 Thông tin cơ bản

| Field | Kiểu (Forge) | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `item_code` | Data | ✅ | `^[A-Z0-9][A-Z0-9.-]{0,23}$` · UNIQUE → *"Mã hàng chỉ được dùng chữ IN HOA, số, dấu gạch ngang và dấu chấm — tối đa 24 ký tự"* / *"Mã hàng này đã tồn tại"* | Khoá tự nhiên. Tự gợi ý theo 10 tiền tố (`NHOM-` `CUA-` `RAY-` `TRUC-` `MOTO-` `PIN-` `LUOI-` `PK-` `VT-` `DV-`). Sửa được lúc tạo; sau khi lưu đổi qua *Thao tác khác → Đổi tên* |
| `item_name` | Data | ✅ | `min 1, max 120`, trim + gộp khoảng trắng → *"Tên hàng không được để trống"* | Tên hiển thị mọi nơi |
| `item_group` | Link(Item Group) | ✅ | phải là **nhóm lá**, không phải nhóm chứa → *"Nhóm hàng «X» là nhóm chứa; hãy chọn một nhóm con"* | Quyết định phương pháp giá vốn mặc định theo nhóm (TT99/2025 cho phép khác nhau giữa các nhóm) |
| `item_nature` | Select(Hàng tồn kho, Dịch vụ, Tài sản) | ✅ | mặc định `Hàng tồn kho` | Enum cứng — mỗi giá trị là một nhánh xử lý của nhân |
| `material_stage` | Select(Nguyên vật liệu, Vật tư tiêu hao, Bán thành phẩm, Thành phẩm, Hàng hoá) | ✅ khi `item_nature = Hàng tồn kho` | — | Nhôm cây = NVL; cửa = Thành phẩm |
| `supply_type` | Select(Mua ngoài, Tự sản xuất, Mua hoặc sản xuất) | ✅ khi tồn kho | mặc định `Mua ngoài` | Cửa = Tự sản xuất; nhôm = Mua ngoài |
| `is_stock_item` | Check | — | mặc định ✔; ép ✘ khi `item_nature = Dịch vụ` | — |
| `is_purchase_item` | Check | — | mặc định ✔, `in_standard_filter` **bắt buộc** | ⚠️ Không đánh dấu `in_standard_filter` thì `link_filters` của ô chọn mặt hàng **bị từ chối im lặng** — đúng lỗi đã trả giá ở bản cũ |
| `is_sales_item` | Check | — | mặc định ✔, `in_standard_filter` **bắt buộc** | như trên |
| `disabled` | Check | — | mặc định ✘ | Ngừng kinh doanh nhưng **giữ lịch sử**. ⚠️ Trống ≠ ngừng: 186 mã bản cũ để trống rồi biến mất khỏi ô chọn — V2 ép mặc định rõ ràng |

### 2.2 Quy cách & đơn vị — nơi QĐ-2 sống

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `measurement_profile` | Link(Measurement Profile) | ✅ **luôn luôn** | tồn tại → *"Chưa chọn bộ quy cách"* | **Nguồn DUY NHẤT của `inventory_mode`.** Hàng thường vẫn phải trỏ vào profile `Hàng thường` |
| `stock_uom` | Link(UOM) | ✅ | phải nằm trong `profile.stock_uom` hoặc cùng nhóm → *"Đơn vị tồn «Kg» không khớp bộ quy cách «Nhôm cây/lá» (đề xuất: Cây)"* | **Đơn vị ĐẾM.** Nhôm = `Cây`/`Lá`, KHÔNG phải `Kg` (QĐ-2) |
| `has_catch_weight` | Check | — | tự bật khi `profile.inventory_mode = Nhôm cây/lá` | Bật = mọi dòng sổ mang **hai** con số: số lượng và khối lượng |
| `weight_uom` | Link(UOM) | ✅ khi `has_catch_weight` | mặc định `Kg` → *"Mặt hàng cân theo kiện phải khai đơn vị khối lượng"* | Đơn vị TÍNH TIỀN |
| `default_purchase_uom` | Link(UOM) | — | — | Để trống = mua đúng bằng đơn vị tồn |
| `default_sales_uom` | Link(UOM) | — | — | — |
| `uom_conversions` | Table(UOM Conversion) | — | **CHẶN khi `has_catch_weight` = ✔** → *"Mặt hàng cân theo kiện không dùng hệ số quy đổi cố định — khối lượng bắt tại từng dòng phiếu nhập"* | Ray: `1 Cây = 5,85 Mét`. Nhôm: cấm |

> **Vì sao chặn `uom_conversions` cho nhôm:** đo thật trên sổ nhập cho ra **6,57 → 8,61 m/cây**. Một hệ số
> tĩnh nào cũng sai ít nhất 13%. Hệ số thật bắt tại dòng phiếu nhập, không khai ở Item.

### 2.3 Thành phẩm cửa

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `door_type` | Select(Cửa Đức, Cửa Úc, Cửa Lưới, Cửa Đài Loan, Cửa Siêu Trường, **Cửa tấm liền Úc**) | ✅ khi `inventory_mode = Thành phẩm theo m2` | → *"Thành phẩm cửa phải chọn loại cửa để áp đúng công thức"* | Quyết định công thức số lá + hằng số trừ. **Không** suy từ Nhóm hàng (bản cũ suy ngầm → buộc cứng nhóm hàng vào công thức) |
| `cutting_policy` | Link(Cutting Policy) | ✅ khi có `door_type` | — | Tách khỏi `door_type` để một loại cửa có nhiều biến thể chính sách (U75 / U100) |
| `purchase_kg_per_m2` | Float | ✅ khi `door_type ∉ {Cửa Đức, Cửa tấm liền Úc}` | `> 0` → *"Cửa Úc/Lưới/Đài Loan/Siêu Trường phải có barem kg/m² mới dự toán mua được"* | Cửa Đức tính theo **kg cân thực tế**, không dùng barem |
| `min_area_sqm` | Float | — | `≥ 0` | Diện tích tối thiểu tính tiền một bộ. **Bản cũ: 0/117 mã có giá trị** — V2 nhắc bổ sung, không chặn |

### 2.4 Màu

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `default_color` | Link(Item Color) | — | phải nằm trong `allowed_colors` nếu bảng đó có khai | Gợi ý, không ép |
| `allowed_colors` | Table(Item Allowed Color) | — | màu phải đang hoạt động | Trống = **chưa cấu hình, không cho chọn/lưu màu**. Đây là chiều CHẶN duy nhất |

> **⚠️ Sửa lại nhận định trước đó của chính tài liệu này.** Có lúc em định ép ràng buộc theo
> `Item Color.applies_to` ("Màu XÁM–XANH DƯƠNG chỉ dùng cho Cửa Đài Loan"). **Không làm được** — đọc
> doctype thật thì `applies_to` là **Small Text tự do**, và doc-comment của bản cũ đã nói rõ lý do:
> *"GHI LẠI chứ chưa CHẶN: luật chặn hiện chạy từ chiều ngược lại (`Item.allowed_colors`). Để trống ở
> đây không có nghĩa là cấm."*
>
> Một chuỗi tự do thì không so khớp với nhóm hàng được. Muốn ép thật thì `applies_to` phải đổi thành
> **bảng con Link(Item Group)** — việc đó có làm được nhưng là **thay đổi có chủ đích**, phải ghi vào
> danh sách thay đổi chứ không lẳng lặng đặc tả như thể đã có. → Câu hỏi I4.

### 2.5 Kho & kế toán

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `default_warehouse` | Link(Warehouse) | — | phải là **kho lá** (không phải nút nhóm) → *"«Kho Alumdoor» là nút nhóm, không phát sinh tồn — chọn K36 hoặc K12"* | Gợi ý khi lập chứng từ |
| `valuation_method` | Select(FIFO, Bình quân di động) | ✅ | mặc định kế thừa `item_group`; **giá trị lạ → TỪ CHỐI** → *"Phương pháp giá vốn không hợp lệ"* | ⚠️ Bản cũ: giá trị nào không chứa chữ "moving" đều **âm thầm thành FIFO** (`valuation.ts:18`). V2 từ chối thay vì đoán |
| `inventory_account` · `cogs_account` · `income_account` · `expense_account` | Link(Account) | — | — | ⚠️ Nhân tra **Item trước, Company sau** (`clouderp-selling/src/controllers.ts:232`). Thiếu **cả hai** = giá vốn hàng bán = 0 mà sổ vẫn cân |
| `standard_rate` | Currency | — | `≥ 0` | Giá định mức cho BOM |

### 2.6 Theo dõi

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `has_batch_no` | Check | — | **tự bật + khoá** khi `has_catch_weight` | QĐ-1: nhôm bắt buộc theo lô. Bật = định giá thu hẹp theo batch |
| `has_serial_no` | Check | — | không cùng bật với `has_batch_no` trong V2 | Chưa dùng |
| `allow_negative_stock` | Check | — | mặc định ✘; bật cần quyền Chủ xưởng | Tồn âm là lỗi nghiệp vụ, không phải tuỳ chọn tiện tay |
| `barcode` | Data | — | UNIQUE khi có | `screen-catalog` mục Inventory: app có tồn kho **bắt buộc** có barcode + quét ở 4 điểm chạm |
| `description` | Small Text | — | max 500 | Quy cách / xuất xứ |

---

## 3. Autofill (`form-workflow-contract.md` — chỉ điền ô user CHƯA sửa tay)

| Khi chọn | Tự điền |
|---|---|
| `item_group` | `valuation_method`, `inventory_account`, `cogs_account` theo cấu hình nhóm |
| `measurement_profile` | `stock_uom` (đề xuất), `has_catch_weight`, `has_batch_no`, và **khoá** các ô mà profile đã quyết |
| `door_type` | `cutting_policy` khớp loại cửa (nếu chỉ có 1 chính sách); nhắc `purchase_kg_per_m2` nếu bắt buộc |
| Gõ tên hàng | Gợi ý `item_code` theo 10 tiền tố — người dùng sửa được |
| `has_catch_weight` bật | `weight_uom = Kg`, ẩn + xoá `uom_conversions` |

---

## 4. Điểm AI (`screen-catalog` mục Tích hợp AI — "AI trong FORM")

| Điểm | Việc |
|---|---|
| Nút **"Gợi ý mã hàng"** | Sinh mã đúng quy ước 10 tiền tố từ tên hàng — bản nháp, người sửa được |
| **Cảnh báo trùng** | Tên gần giống mã đã có (vd `AL548` vs `AL548N`) → cảnh báo vàng + link mở bản ghi trùng. ⚠️ **Không tự gộp** — "AL548 và AL558 chỉ khác một ký tự nhưng là hai cây nhôm khác nhau" |
| Nút **"Viết giúp"** ở `description` | Sinh quy cách từ tên + nhóm hàng |

---

## 5. Nghiệp vụ bắt buộc — khai cho entity này

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | **Không xoá** — dùng `disabled` (giữ lịch sử giao dịch). Xoá cứng chỉ khi 0 bút toán tham chiếu |
| 3 | Audit | Mọi thay đổi `valuation_method`, `stock_uom`, `has_catch_weight` ghi audit **trước→sau** — ba trường này đổi là lệch sổ |
| 6 | Mã vạch | Áp dụng — `barcode` + quét ở Nhập/Xuất/Kiểm kê |
| 7 | Kanban | **Không áp dụng** — Item không có giai đoạn, chỉ có bật/tắt |
| 8 | AI | Áp dụng — §4 |
| 13 | Mã tự sinh | Áp dụng — gợi ý theo tiền tố, **không** cấp số tự động (mã hàng do người đặt, khác số chứng từ) |
| 18 | Lịch sử & vòng đời | Áp dụng — tab Lịch sử: đổi giá vốn, đổi ĐVT tồn, bật/tắt kinh doanh |
| 19 | Danh mục | Áp dụng — `item_group`, `stock_uom`, `default_color`, `default_warehouse`, `measurement_profile`, `cutting_policy` đều là Link Field có **"+ Thêm mới"** |

---

## 6. Câu hỏi còn mở

| # | Câu hỏi | Chặn gì |
|---|---|---|
| I1 | Một mã nhôm có mua được **cả thô lẫn màu** không? | Nếu có, thô và màu là hai **tình trạng của batch** (đã thiết kế vậy) — cần chủ xưởng xác nhận để không phải tách mã |
| I2 | `min_area_sqm` từng loại cửa là bao nhiêu? | 0/117 mã có giá trị; thiếu thì luật m² tối thiểu không chạy |
| I3 | Ron nhựa **0,10** hay **0,263 kg/m**? | `theoretical_kg_per_m` trong profile (trùng Q6 ở BRD) |
| I4 | Có ép ràng buộc **màu ↔ nhóm sản phẩm** không? | Cần thì phải đổi `Item Color.applies_to` từ Small Text tự do thành bảng con Link(Item Group). Không đổi thì chỉ chặn được một chiều qua `Item.allowed_colors` |
| I5 | `Item Group` chưa có `default_valuation_method` | Tài liệu này nói *"`valuation_method` kế thừa `item_group`"* — nhưng nhóm hàng hiện chỉ có 4 tài khoản mặc định, **không có** trường phương pháp giá vốn. Phải thêm |
| I6 | `Supplier` chưa có `receipt_tolerance_pct` | Dung sai ±5% cần khai theo NCC ([purchase-receipt.md](purchase-receipt.md) §3.3). Hiện Supplier không có trường này |
