# Alumdoor — Audit Master → Sales → BOM → Production

**Ngày audit:** 2026-08-16  
**Repo baseline:** `main` sau `c6a817c`  
**Phạm vi:** Danh mục Master, form Bán hàng/Báo giá, công thức hình học, phạm vi cấu phần giao hàng, BOM sản xuất, tồn nhôm/cắt nhôm.  
**Nguồn đầu vào:** `apps/alumdoor/docs/nguon/SALES-BOM-SOURCE-MAP.md` + raw extract trong `apps/alumdoor/docs/nguon/` + code/docs hiện hành của Forge.

> Tài liệu này là **audit + target boundary**. Nó không tự thay thế raw source và không tự chốt những câu hỏi mà nguồn chưa trả lời. Mỗi kết luận bên dưới ghi rõ là **SOURCE FACT**, **CURRENT IMPLEMENTATION**, **PROJECT RESOLUTION** hay **AUDIT DECISION**.

---

## 0. Kết luận ngắn

Luồng hiện tại đã có nhiều mảnh đúng: `Item`, `Measurement Profile`, `Item Price`, `Pricing Rule`, `Sales Package`, `BOM`, `Cut Order`, Stock Ledger và Production Request. Tuy nhiên ranh giới giữa **hình học vật lý**, **cách tính tiền**, **phạm vi món khách mua** và **BOM sản xuất** vẫn đang chồng lên nhau.

Ba việc phải sửa về kiến trúc trước khi làm form Sales “xổ BOM” chính thức:

1. **Tách geometry khỏi customer group / pricing.** Kích thước cắt vật lý không được đổi chỉ vì khách là Đại lý hay Khách lẻ. Customer group chỉ được ảnh hưởng cơ sở tính tiền/chính sách giá khi nguồn cho phép.
2. **Tách Product Configuration khỏi Item-first sales flow.** Sales phải chọn một cấu hình sản phẩm có metadata/rule, không bắt đầu bằng việc chọn SKU rồi để code suy tiếp từ `item_group`.
3. **BOM import 15/08 chỉ là draft evidence.** Nó có nhiều `qty_basis` suy luận/chưa rõ; chưa đủ an toàn để làm authoritative auto-explosion cho sản xuất.

Target flow:

```text
Product Model / Configurator Profile
        ↓
Sales Configuration
        ↓
Geometry Rule
        ↓
Calculated Geometry Snapshot
        ├───────────────┐
        ↓               ↓
Commercial Scope    Pricing Authority
        ↓               ↓
Fulfillment Snapshot  Commercial Snapshot
        └───────┬───────┘
                ↓
          Accepted Sales Line
                ↓
          BOM Resolution
                ↓
          BOM Instance / Requirement
                ↓
      Production / Material Requirement
                ↓
       Stock Reservation / Allocation
                ↓
        Cut Order / Paint / Assembly
```

---

# 1. SOURCE FACT — nguồn xưởng đang mô tả cái gì

## 1.1 Luồng nghiệp vụ gốc

Raw `25.7 QUY TRÌNH` mô tả:

```text
Sales tạo đơn
→ Kế toán nhận đơn
→ Theo dõi đơn hàng - xuất hàng
→ phân theo nhóm sản phẩm
→ Lịch sản xuất + Đơn sản xuất
→ chọn vật tư tồn / cắt nhôm
→ nếu THÔ thì theo dõi sơn
→ xuất kho / cập nhật theo dõi
```

Nguồn phân nhóm sản xuất theo Đức, Úc, Đài Loan, Lưới, Siêu Trường; công thức và cấu trúc đơn sản xuất của từng nhóm khác nhau.

## 1.2 Nguồn phân biệt ba loại số liệu khác nhau

Nguồn thực tế đang có ít nhất ba nhóm quantity/basis độc lập:

### A. Geometry / production

Ví dụ:

- Đức: `RCL = RPB ray - 0.08` hoặc `RCL = RPB nhựa - 0.02` tùy cơ sở kích thước đang dùng.
- Úc: `RCL = RPB ray - 0.03`.
- Đức kéo tay AL70: U70 không ron dùng `RPB ray - 0.05`, U76 dùng `RPB ray - 0.08`.
- Chia lá theo loại cửa/mã lá có công thức riêng.

### B. Billable measure / tính tiền

`QUY CÁCH / CT TT-SX` phân biệt cơ sở bán ra, ví dụ Đức:

- Đại lý: `Cao PB × Rộng PB nhựa`;
- Khách lẻ: `Cao PB × Rộng PB ray`.

Lưới/Đài Loan còn thay basis khi trọn bộ/tách món.

### C. Stock allocation

Sau khi tính rộng cắt/số lá, tài liệu mới đi tìm tồn nhôm theo mã, kích thước gần phù hợp và màu rồi chọn dòng/lô thực tế để cắt.

**AUDIT DECISION:** ba lớp này không được gộp thành một `qty`, một `width_basis`, hoặc một master duy nhất.

---

# 2. CURRENT IMPLEMENTATION — hệ thống hiện tại đang làm gì

## 2.1 `Item` đang là điểm bắt đầu quá nặng

`Item` hiện giữ nhiều fact đúng và cần thiết:

- taxonomy (`item_group`, `material_stage`, `supply_type`);
- Measurement Profile/UOM;
- color applicability;
- stock/sales/purchase flags;
- `door_type`;
- `cutting_policy`;
- `purchase_kg_per_m2`;
- `min_area_sqm`.

Sales item context hiện bắt đầu từ `item_code`, đọc Item, suy `door_type` từ Item hoặc Item Group, rồi mới resolve UOM/price/stock.

**Vấn đề:** một “mẫu cửa khách muốn mua” và một “Item tồn kho/thành phẩm” đang bị dùng gần như cùng một identity. Với Alumdoor, một cấu hình cửa còn có kích thước, ray, màu, tự dừng, motor, khóa, khe thoáng, phạm vi giao hàng... nên `Item` một mình không đủ diễn tả cấu hình mà không tiếp tục phình field hoặc hard-code UI.

## 2.2 `Cutting Policy` đang ôm cả geometry và commercial measure

Current `DoorFormulaPolicy` có đồng thời:

```text
dealer_width_basis
retail_width_basis
dealer_cut_deduction_m
retail_cut_deduction_m

dealer_split_sales_basis
dealer_full_sales_basis
retail_sales_basis

purchase_formula / purchase_*_basis
leaf_formula / leaf_rounding / ...
```

Trong code hiện tại, `calculateDoorFormula()` chọn **cơ sở rộng vật lý và số trừ cắt** từ `customer_group`:

```text
customer_group = Đại lý → dealer_width_basis + dealer_cut_deduction
customer_group = Lẻ    → retail_width_basis + retail_cut_deduction
```

sau đó mới tính `cut_width`.

Đây là boundary sai đối với nguồn mới audit. Raw source cho thấy `RPB nhựa - 0.02` và `RPB ray - 0.08` là hai cách đi từ **hai cơ sở đo vật lý khác nhau** tới cùng `RCL`; còn Đại lý/Lẻ là nơi nguồn chủ yếu phân biệt **cơ sở tính tiền**.

**AUDIT DECISION:** `customer_group` không được là input quyết định geometry vật lý. Geometry phải dùng `measurement_basis` / product configuration / ray configuration. Customer group đi vào billing/pricing layer.

## 2.3 Sales Option / Sales Package hiện đang giải quyết “cách bán”

Current Sales architecture đã tách tốt:

- Sales Option = lựa chọn operator;
- Sales Package = physical fulfillment composition;
- BOM = manufacturing consumption.

Đây là một ranh giới tốt cần giữ: **Sales Package không phải BOM**.

Tuy nhiên Alumdoor hiện đã materialize nhiều lựa chọn kiểu:

```text
Trọn bộ
Tách món
Chỉ lá
Tặng ray
Kéo tay
```

và dùng `sales_mode`, `price_variant`, package bridge/SKU bridge.

Nguồn 16/08 cho thấy các khái niệm này không cùng bản chất:

- `Trọn bộ / chỉ lá / chỉ phụ kiện / tách món` = **phạm vi cấu phần khách yêu cầu / nghĩa vụ giao hàng**;
- `Tặng ray` = commercial promotion/fulfillment condition + price variant/chính sách;
- `Kéo tay` = product/drive configuration, không phải một “cách bán” tổng quát;
- Đại lý/Lẻ = customer/pricing context.

**AUDIT DECISION:** không tiếp tục mở rộng một enum/master “Cách bán” để chứa mọi thứ. `Sales Option` hiện tại giữ vai trò **compatibility/operator shortcut** cho dữ liệu đã materialize; target new configurator phải lưu fact rõ nghĩa (`configuration`, `component_scope`, `drive_type`, `promotion/price facts`) rồi resolver có thể map sang Sales Option legacy khi cần.

## 2.4 BOM hiện tại đã có import lớn nhưng chưa đủ tin cậy

`build-alumdoor-bom-import.mjs` đọc 2.115 dòng `ĐM` và dựng `Bill of Materials` + `BOM Item`.

Script chủ động gắn `basis_confidence`:

- `chac_chan` — ĐVT tự chỉ ra basis;
- `suy_luan` — suy từ ít dòng có công thức và tên/bản chất vật tư;
- `chua_ro` — không đủ căn cứ, tạm để `Cố định` và liệt kê audit.

Script cũng nói rõ BOM nhập **NHÁP**, vì submit khi còn suy luận/chưa rõ có thể trừ sai vật tư.

Audit JSON hiện có **262 dòng suy luận/chưa rõ** được liệt kê, gồm nhiều trường hợp như ron/ray suy theo chiều cao, trục/thanh suy theo chiều rộng, hoặc vật tư ĐVT mét nhưng chưa biết chạy theo chiều nào.

**AUDIT DECISION:** không dùng những BOM draft này như source of truth để auto-explode sản xuất chỉ vì chúng đã tồn tại trong DB/import. Chúng là migration evidence cần được chuyển dần thành rule có provenance rõ.

---

# 3. MASTER AUDIT — GIỮ / TÁCH / HẠ VAI TRÒ / THIẾU

| Master / authority hiện tại | Quyết định | Vai trò target |
|---|---|---|
| **Item** | **GIỮ, GIẢM VAI TRÒ** | Sự thật ổn định của hàng/vật tư/thành phẩm; không đại diện toàn bộ cấu hình cửa |
| **Item Group** | **GIỮ** | Taxonomy/report/filter; không dùng làm nguồn chính để suy công thức nếu cấu hình rõ hơn tồn tại |
| **UOM** | **GIỮ** | ĐVT canonical |
| **Measurement Profile** | **GIỮ** | Inventory mode, catch weight/UOM/kerf và quy cách đo ổn định; không ôm pricing |
| **Item Color** | **GIỮ** | Color/finish master + applicability |
| **Cutting Policy** | **TÁCH LOGIC** | Geometry Rule + Billing Measure Rule; Purchase Estimate có boundary riêng |
| **Item Price** | **GIỮ** | Base selling rate theo Item/UOM/variant/effective date |
| **Pricing Rule** | **GIỮ LÀ PRICE POLICY AUTHORITY** | Discount, surcharge, override, commercial condition |
| **Sales Option** | **HẠ VAI TRÒ** | Shortcut/compatibility mapping; không là ontology chung cho mọi “cách bán” |
| **Sales Package** | **GIỮ, ĐỔI CÁCH DÙNG** | Fulfillment/component scope của cấu hình thương mại; không chứa BOM, không chứa giá |
| **Bill of Materials** | **GIỮ** | Manufacturing consumption authority; version/effective/revision |
| **BOM import từ `ĐM`** | **GIỮ LÀ EVIDENCE/DRAFT** | Không auto-submit khi basis còn `suy_luan/chua_ro` |
| **Production Standard** | **GIỮ** | Capacity/time/routing standard |
| **Production Request / Work Order** | **GIỮ** | Execution demand, phải nhận snapshot/config lineage |
| **Aluminium Batch / Stock Ledger** | **GIỮ** | Tồn thực tế theo lô/cây/lá |
| **Stock Reservation** | **GIỮ** | Giữ chỗ nhu cầu sau khi requirement rõ |
| **Cut Order** | **GIỮ** | Allocation/cut execution trên stock piece; luôn downstream của requirement |
| **Product Model / Configurator Profile** | **THIẾU** | Mẫu sản phẩm Sales chọn trước khi nhập cấu hình |
| **Configuration Attribute metadata** | **THIẾU** | Khai field động theo mẫu: cao/rộng/ray/motor/tự dừng/khóa/khe thoáng/... |
| **Compatibility Rule** | **THIẾU** | Chặn tổ hợp không hợp lệ mà không hard-code UI |
| **Geometry Snapshot** | **THIẾU/CHƯA FIRST-CLASS** | Đóng băng input + derived geometry + rule/version |
| **Configuration Snapshot** | **THIẾU/CHƯA FIRST-CLASS** | Đóng băng lựa chọn sản phẩm của dòng đã chốt |
| **BOM Resolution Snapshot / BOM Instance** | **THIẾU** | Đóng băng BOM resolved cho đúng cấu hình/dòng Sales, không chỉ tham chiếu BOM master hiện tại |
| **Material Requirement theo Sales line** | **CHƯA RÕ RANH GIỚI** | Nhu cầu kỹ thuật trước khi chọn lô tồn thực tế |

---

# 4. Target Master model

Tên dưới đây là **logical entity**. Khi implement phải kiểm tra có thể mở rộng doctype hiện có hay cần doctype mới; không tạo master chỉ vì tên trong tài liệu này.

## 4.1 Product Model / Configurator Profile

Mục đích: định nghĩa **Sales đang cấu hình loại sản phẩm nào**, không phải dòng tồn kho nào.

Tối thiểu:

```text
code
name
product_family / door_type
base_item / output_item (nếu có)
configuration_profile
geometry_rule_set
commercial_scope_profile
bom_resolution_profile
active / effective dates
```

Ví dụ logical:

```text
DUC-AL548
UC-KT-46D
UC-MTN-55D
DL-6D
LUOI-MAT-VONG
```

Không đưa màu/kích thước thực tế vào Product Model.

## 4.2 Configuration Attribute Definition

Mục đích: form Sales xổ field theo metadata thay vì `if (Cửa Đức) ...` trong TSX.

Ví dụ attribute:

```text
height_pb_m
width_pb_ray_m
width_pb_nhua_m
ray_type
finish/color
drive_type
motor_position
auto_stop
horizontal_lock
vent_rows
butterfly_bracket
mesh_height_m
set_count
component_scope
```

Mỗi attribute có thể khai:

```text
type
required_when
visible_when
allowed_values/source
inherit_to_component
snapshot=true/false
```

## 4.3 Geometry Rule

Geometry Rule chỉ trả lời **hình học vật lý / sản xuất**:

```text
measurement_basis
cut_width
cut_height
leaf_count
single_layer_leaf_count
double_layer_leaf_count
component dimensions
```

Condition nên dựa vào fact vật lý:

```text
product model / door type
ray_type
measurement_basis
drive_type
auto_stop
lock/vent options
```

**Không condition bằng customer group để đổi cut width.**

## 4.4 Billing Measure Rule

Tách khỏi geometry vì nguồn có trường hợp một kích thước vật lý nhưng lượng tính tiền khác theo commercial context.

Input có thể gồm:

```text
customer_group
component_scope
product model
commercial option đã resolve
calculated geometry facts
```

Output:

```text
priced_uom
billable_width_basis
billable_height_basis
priced_qty / billable_area
minimum billable qty
```

Nó **không trả đơn giá**.

## 4.5 Pricing authority

Giữ canonical shared Forge:

```text
Item Price → base rate
Pricing Rule → price policy / discount / surcharge / override
```

Alumdoor không cần một authority giá song song nằm trong BOM hoặc geometry.

## 4.6 Commercial Component Scope / Sales Package

Sales Package tiếp tục trả lời:

> “Khách mua cấu hình này thì phải giao những Item/component nào?”

Target use:

```text
FULL_SET
SELECTED_COMPONENTS
LEAF_ONLY
ACCESSORY_ONLY
```

nhưng đây là semantic scope/fulfillment, không phải tên một price list và không quyết định nguyên vật liệu sản xuất.

Nếu người dùng chọn chỉ một component bán độc lập, component đó được pricing bằng Item Price/Pricing Rule của chính nó.

## 4.7 BOM Template / BOM Rule

BOM chỉ trả lời:

> “Để sản xuất output đã chốt này cần tiêu hao gì?”

Mỗi component BOM target phải có explicit provenance:

```text
component_item
qty_basis
factor/formula
condition
uom
source_rule/source_line
confidence = CONFIRMED | LEGACY_INFERRED | UNKNOWN
revision/effective dates
```

Không được suy `qty_basis` từ regex tên vật tư lúc runtime.

## 4.8 BOM Instance / Resolution Snapshot

Khi Sales configuration được chốt để sản xuất:

```text
Sales line snapshot
  + configuration snapshot
  + geometry snapshot
  + BOM revision
  + conditional component resolution
      ↓
BOM Instance / Material Requirement Snapshot
```

Sau đó master BOM đổi không làm đơn cũ tự thay vật tư.

---

# 5. Canonical Sales form flow target

## 5.1 Header

```text
Customer
Project / Site
Price List / commercial context
Delivery date
Warehouse/context khi cần
```

## 5.2 Add product

```text
+ Thêm sản phẩm
→ Product Family
→ Product Model
→ metadata-driven configurator
```

Ví dụ Đức:

```text
Mẫu: AL548
Cao PB
Rộng: chọn cơ sở đo [PB ray | PB nhựa]
Giá trị rộng
Ray type
Màu/finish
Tự dừng / khóa / option
Số bộ
Phạm vi cấu phần khách lấy
```

Engine preview trả cùng lúc nhưng tách namespace:

```text
geometry.*
commercial_measure.*
pricing.*
fulfillment.*
bom_preview.*
production_warning.*
```

Không trả một object phẳng có các field lẫn vai trò.

## 5.3 Draft vs accepted

### Draft

Có thể re-resolve theo master hiện hành khi input đổi.

### Accepted Quotation / confirmed Sales Order

Đóng băng:

```text
configuration snapshot
geometry rule id/version + result
billing measure rule/version + result
pricing trace
sales package/component snapshot
BOM resolution identity/revision hoặc resolved requirement snapshot khi đã release sản xuất
```

Không âm thầm reprice/re-BOM đơn cũ khi master thay đổi.

---

# 6. Critical gap #1 — customer group đang ảnh hưởng geometry

## Current

`door-formulas.ts` dùng:

```text
customer_group
  → dealer_width_basis / retail_width_basis
  → dealer_cut_deduction / retail_cut_deduction
  → cut_width
```

## Source-derived target

Đức có hai đường đo vật lý:

```text
PB ray   → RCL = PB ray - 0.08
PB nhựa  → RCL = PB nhựa - 0.02
```

Nó nên là:

```text
measurement_basis
  → geometry rule
  → cut_width
```

sau đó:

```text
customer_group
  + component scope
  + geometry facts
  → billing measure rule
```

## Migration rule

Không đổi code này một phát trên `main` trước khi có:

1. field/fact `measurement_basis` trên configuration/sales snapshot;
2. backfill strategy cho dòng cũ;
3. golden tests Đức PB ray/PB nhựa;
4. golden tests Đại lý/Lẻ cùng geometry phải cho cùng `cut_width` khi cùng basis/input;
5. explicit compatibility path cho chứng từ lịch sử thiếu basis.

---

# 7. Critical gap #2 — Sales Option đang gánh quá nhiều nghĩa

Không xóa dữ liệu `Sales Option`/`Sales Package` hiện tại vì:

- chứng từ/snapshot lịch sử đã tham chiếu;
- migration 0127/0130/0131 đã materialize mapping;
- package separation khỏi BOM là đúng.

Nhưng từ configurator mới:

```text
PRODUCT CONFIG FACTS
├─ drive_type
├─ ray_type
├─ finish
├─ component_scope
└─ measurement inputs
```

mới là input canonical.

Nếu cần tương thích:

```text
configuration facts
→ compatibility resolver
→ legacy Sales Option / price_variant / package
```

chứ không ngược lại “Sales Option label → suy ra bản chất sản phẩm”.

---

# 8. Critical gap #3 — BOM draft inference

## Hiện trạng

BOM import 15/08 có ý thức an toàn tốt: mọi dòng suy luận/chưa rõ được audit và BOM để draft.

## Không được làm

- submit hàng loạt BOM chỉ để form có thứ để xổ;
- mặc định `M` là chiều cao/chiều rộng bằng tên Item ở runtime;
- dùng một BOM static để thay thế geometry/leaf calculation;
- chọn lô tồn nhôm ngay trong BOM;
- copy Sales Package component vào BOM.

## Cách chuyển đổi

Mỗi dòng `suy_luan/chua_ro` phải được phân vào một trong các nhóm:

```text
CONFIRM_AS_FIXED
CONFIRM_AS_HEIGHT
CONFIRM_AS_WIDTH
CONFIRM_AS_AREA
CONFIRM_AS_LEAF_COUNT
FORMULA_REQUIRED
OPTIONAL_CONDITIONAL
NOT_A_BOM_COMPONENT
UNKNOWN_NEEDS_WORKSHOP
```

Sau khi có nguồn/xưởng xác nhận mới nâng confidence/revision và cho phép active/submit.

---

# 9. Tồn nhôm / cắt nhôm — boundary phải giữ

Raw source làm đúng thứ tự nghiệp vụ:

```text
Tính sản xuất cần gì
→ tìm tồn nhôm phù hợp
→ chọn khẩu độ/lô
→ cắt
→ trừ tồn
→ nhập lại phần dư
```

Target ERP phải giữ:

```text
BOM/Material Requirement
      ↓
Stock Reservation
      ↓
Allocation candidate
      ↓
Cut Order
      ↓
Stock Ledger
```

BOM không chứa `batch_id`/stock-piece cụ thể. Stock piece cụ thể chỉ xuất hiện ở reservation/allocation/cut execution.

---

# 10. Sơn — routing, không nhân SKU/BOM vô hạn

Source rule: vật tư lấy để sản xuất có trạng thái/màu `THÔ` thì đi theo dõi sơn.

Target model:

```text
Required finish = GHI SẦN
        ↓
Inventory allocation finds matching finished stock?
        ├─ có → dùng
        └─ không, dùng THÔ hợp lệ
                ↓
          add paint operation/routing
                ↓
          output finish = GHI SẦN
```

Không bắt buộc tạo một BOM riêng cho mọi tổ hợp `mã nhôm × màu` nếu thành phần vật lý giống nhau và khác biệt thực chất là operation/finish routing.

Điểm này cần implementation audit riêng trước khi thay SKU hiện hữu; không rewrite lịch sử theo suy đoán.

---

# 11. Project resolutions đã có — không mở lại bằng trí nhớ

`server/briefs/alumdoor-v2.json` hiện đã ghi project resolution cho một số nguồn mâu thuẫn, trong đó có:

- AL70: project chọn tổng 42 lá;
- AL71N: project chọn bản lá 0.055 theo evidence sổ giao dịch, đảo quyết định cũ 0.057;
- `MỚI/CŨ`: project giải nghĩa theo đời sản phẩm trong context đã audit;
- dữ liệu tồn không có kho: project hiện default về Kho 1 rồi dùng stock transfer để có audit trail.

Khi code mới đụng các điểm này phải đọc exact brief hiện tại; raw source map không được tự override project resolution.

---

# 12. Migration / implementation sequence đề xuất

## Phase A — Chốt boundary, không đổi behavior

- [ ] Tạo test/evidence cho current formulas.
- [ ] Inventory toàn bộ field đang dùng của Sales Order/Quotation line.
- [ ] Inventory exact Sales Option/Sales Package mappings đang active.
- [ ] Inventory BOM draft theo `basis_confidence`.
- [ ] Không submit thêm BOM inferred.

## Phase B — Introduce explicit configuration facts

- [ ] Thêm logical Product Model / Configurator Profile.
- [ ] Thêm metadata attribute definitions.
- [ ] Thêm `measurement_basis` explicit.
- [ ] Thêm `component_scope` explicit.
- [ ] Snapshot các fact này trên commercial line.
- [ ] Legacy Sales Option vẫn được resolver map để không phá lịch sử.

## Phase C — Split Cutting Policy authority

- [ ] Geometry resolver nhận physical facts, không nhận customer group để quyết cut width.
- [ ] Billing measure resolver nhận customer/commercial facts.
- [ ] Purchase estimate tách output contract.
- [ ] Golden tests từ `QUY CÁCH` và `25.7 QUY TRÌNH`.

## Phase D — BOM normalization

- [ ] Chuyển BOM import draft thành rule/provenance rõ.
- [ ] Resolve toàn bộ `chua_ro` cần thiết cho sản phẩm được release.
- [ ] Không cần resolve 100% toàn catalog trước; release theo Product Model được duyệt.
- [ ] Tạo BOM resolution snapshot/BOM instance theo Sales line.

## Phase E — Form configurator

- [ ] Sales/Quotation dùng chung configurator engine.
- [ ] UI chỉ render metadata + preview; server authoritative.
- [ ] Preview tách Geometry / Giá / Cấu phần giao / BOM.
- [ ] Không hard-code cửa Đức/Úc/Đài Loan vào shared control.

## Phase F — Production / stock bridge

- [ ] Confirmed line → Production Request/Work Order lineage.
- [ ] Material Requirement → Stock Reservation.
- [ ] Reservation → Cut allocation.
- [ ] Cut Order → canonical Stock Ledger.
- [ ] Paint routing theo source/finish rule đã được xác nhận.

---

# 13. Acceptance invariants

Trước khi coi luồng mới đạt:

1. Cùng một geometry input + cùng measurement basis phải cho cùng cut geometry bất kể Đại lý/Lẻ.
2. Đại lý/Lẻ có thể cho billable quantity/price khác nhau mà không thay geometry vật lý.
3. Đổi `component_scope` không tự đổi raw-material BOM trừ khi chính output cần sản xuất thực sự khác.
4. Sales Package và BOM không copy lẫn rows.
5. Accepted Quotation → Sales Order giữ nguyên configuration/pricing/package snapshot.
6. BOM master đổi sau đó không thay requirement của production order đã release.
7. Không có BOM component `LEGACY_INFERRED/UNKNOWN` được auto-consume mà không có release rule rõ.
8. BOM không chọn batch/lô cụ thể.
9. Cut Order luôn trace được về requirement / production line / sales line.
10. Client không là source of truth của tiền, geometry final hoặc stock movement.

---

# 14. Quyết định implementation ngay sau audit

**Không nên sửa form trước.** Việc đầu tiên nên là **Phase B + Phase C**: tạo fact `measurement_basis`/configuration rõ và tách geometry khỏi customer/pricing semantics. Nếu làm UI configurator trước khi boundary này sạch, UI mới sẽ chỉ bọc thêm một lớp đẹp bên ngoài logic đang trộn.

**Không nên submit BOM import 15/08.** Trước hết phải lấy các Product Model ưu tiên (Đức AL548/AL70, Úc, Đài Loan, Lưới) và chuẩn hóa rule theo source/evidence từng nhóm.

**Không phá Sales Option/Sales Package lịch sử.** Giữ chúng như compatibility/fulfillment infrastructure trong giai đoạn chuyển đổi, nhưng không tiếp tục dùng nhãn `cách bán` làm ontology để nhét thêm mọi lựa chọn sản phẩm.

---

# 15. Đường đọc cho agent khi bắt đầu implementation

```text
AI_HANDOFF.md
→ apps/alumdoor/docs/nguon/SALES-BOM-SOURCE-MAP.md
→ raw extract đúng rule
→ docs/sales/ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md
→ server/briefs/alumdoor-v2.json
→ exact code/migrations/tests của scope
```

Agent phải phân biệt:

```text
RAW SOURCE
PROJECT RESOLUTION
CURRENT IMPLEMENTATION
TARGET AUDIT DECISION
```

Không được dùng một loại để giả làm loại khác.
