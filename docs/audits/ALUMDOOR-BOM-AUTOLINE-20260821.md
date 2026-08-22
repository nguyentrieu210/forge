# ALUMDOOR — QUY TẮC BOM: DÒNG PHỤ KIỆN TỰ SINH

Ngày 21/08/2026 · Đặc tả: `docs/ALUMDOOR-QUY-CACH-BOM-RULE-20260821.md` §4
(nguyên văn `QUY CÁCH  (3).xlsx`, sheet `ĐƠN GIÁ TRỌN BỘ`, ô `C4`–`C10`)
Nối tiếp: `docs/audits/ALUMDOOR-UPS-BOM-RULE-20260821.md`

> Mọi con số dưới đây đo trực tiếp trên D1 local
> `server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06f….sqlite`
> hoặc trích `file:line` mã nguồn thật trong `C:\alumdoor`.
> **Không xác minh được trên trình duyệt**: backend đang HTTP 500
> (`Custom field color collides with a standard field on Batch`).

---

## 1. QUYẾT ĐỊNH KIẾN TRÚC

### 1.1 Câu trả lời: **CẢ HAI — nhưng không phải "làm hai lần"**

Bộ luật §4 thật ra là **ba câu hỏi khác nhau bị viết chung một ô Excel**. Tách ra thì
mỗi câu rơi đúng vào một lớp đã có sẵn, và **không lớp nào phải viết mới**:

| Câu hỏi | Ví dụ | Lớp chịu trách nhiệm | Trạng thái |
|---|---|---|---|
| **(a) Dòng dài/rộng bao nhiêu?** | `Cao PB − 0,20` | **`BOM Rule`** (danh mục `Quy tắc BOM`) | ✅ engine + editor SỐNG |
| **(b) Dòng nào được nhảy ra?** | Đức+tặng ray ⇒ ray hộp TD; Đức+tách món ⇒ không gì | **`BOM Template` + `BOM Component Rule`** (`conditions_json`) | ✅ engine sống, ❌ 0 bản ghi, ❌ không có menu/editor |
| **(c) Hiện lên đơn bán và khóa cột giá** | người bán thấy dòng, không sửa được giá | **tầng bán hàng** — `field_overrides` per-line | ✅ cơ chế SỐNG, ❌ chưa ai phát cho dòng tự sinh |

**Không dựng engine thứ tư.** Bằng chứng cho từng lớp:

**(a) `BOM Rule` biểu diễn được `Cao PB − 0,10` — chính xác, không phải xấp xỉ.**
- `server/apps-src/alumdoor-worker/src/bom-template-core.ts:11-13` — `BomQuantityBase` có
  `{ kind: "FIELD"; field: string; offset?: number }`, tức "một trường hình học cộng/trừ hằng".
- `server/apps-src/alumdoor-worker/src/bom-rule-core.ts:169-176` — `operator: "SUBTRACT"` +
  `operand` được dịch thẳng thành `offset` âm.
- Doctype `BOM Rule` khai `source_field:Link(Geometry Field)` (`server/briefs/alumdoor-v2.json`,
  doctype #94). **Geometry Field trong D1 có đúng `CAO-PB` và `RONG-PB-RAY`** — tên trong công
  thức của chủ xưởng và tên trong máy là MỘT.
- `server/apps-src/alumdoor-worker/src/bom-rule-sales-preview.ts:108-120` — `geometryValues()`
  bơm sẵn các khoá `"CAO-PB"`, `"RONG-PB-RAY"`, `"RONG-CAT-LA"` cho engine.
- `qty_per_set` có sẵn cho "2 cây" / "1 cặp".

⇒ Toàn bộ cột "Kích thước" và "SL" của bảng §4 **là dữ liệu, không phải code**.

**(b) `BOM Template.conditions_json` chọn được bộ dòng theo loại đơn giá.**
- `bom-template-core.ts:149-153` `matchesConditions()` — so khớp key/value bất kỳ trên context.
- `bom-template-materializer.ts:204-228` — cột `sales_mode` được gộp vào cùng `conditions`.
- `bom-template-core.ts:180-192` — không khớp thì **NÉM LỖI**, không đoán. Đúng tinh thần.
- "MUA TÁCH MÓN ⇒ không sinh dòng nào" chính là **một template rỗng / không có template**,
  không cần code riêng.

**(c) "Khóa cột đơn giá" ĐÃ CÓ CƠ CHẾ — tuyệt đối đừng phát minh lại.**
- Server phát: `server/apps-src/alumdoor-worker/src/ui-child-preview.ts:549` trả
  `field_overrides`, và **đã dùng `read_only: 1` cho `qty`** (test khẳng định:
  `server/apps-src/alumdoor-worker/tests/ui-child-preview.test.ts:79`).
- Client nhận: `AlumdoorSalesOrderWorkbenchComplete.tsx:795-820` đổ vào `line._overrides`.
- Client đọc: `sales-order-v2/model.ts:589-592` `fieldReadonly(line, fieldname)`.

⇒ Khóa giá = server trả thêm `field_overrides.rate = { read_only: 1 }` cho dòng tự sinh.
**Không có dòng code mới nào cần viết ở client.**

### 1.2 Vì sao KHÔNG làm nó thành "luật riêng của tầng bán hàng"

Vì cùng một con số phải phục vụ hai việc: người bán ra giá, và xưởng cắt. Nếu khai ở tầng
bán hàng thì xưởng lại phải khai lại lần hai và hai bản sẽ lệch nhau. `BOM Rule` +
`BOM Template` đã là nơi xưởng đọc; tầng bán hàng chỉ **chiếu** kết quả ra màn.

### 1.3 Hai chỗ hạ tầng cũ KHÔNG với tới — phải nói thẳng

| # | Vấn đề | Bằng chứng |
|---|---|---|
| **K1** | **`conditions` chỉ so BẰNG, không so LỚN/NHỎ.** Nên `diện tích > 10 m²` của cửa Đức **không** khai được vào `BOM Component Rule`. | `bom-template-core.ts:143-147` `sameScalar()` — chỉ có `===`. |
| **K2** | **Context BOM không mang `price_variant`.** Mà "loại đơn giá" trong đặc tả CHÍNH LÀ `price_variant` (`TANG_RAY` / `CHI_LA` / `TRON_BO` / `TACH_MON`). Context hiện chỉ có `item_code, item_group, door_type, sales_mode, color, motor_model, paint_required, ray_type`. | `bom-template-materializer.ts:332-345` `bomContextFromProductionLine()`. `price_variant` cũng KHÔNG có trong `QUOTE_LINE_FIELDS` (`index.ts:1152-1161`). |

K1 giải quyết bằng cách để ngưỡng diện tích ở đúng chỗ nó đang nằm (tầng bán hàng, xem §4.1),
**không** nhét vào BOM. K2 là một dòng nối dây, nhưng nằm trong file agent khác giữ (§5.2).

---

## 2. ÁNH XẠ TÊN VẬT TƯ ⇄ MÃ HÀNG THẬT

Tra trên **404 mã `Item` thật trong D1** (`select payload_json from documents where doctype='Item'`).
Bài học từ vòng trước (17/17 mã ngưỡng motor chết, 35/35 mã BOM Template chết) được áp dụng:
**mã nào không tra ra một-một thì KHÔNG viết vào fixture.**

### 2.1 Tra được — đã dùng ngay (4 mã)

| Đặc tả gọi | Mã hàng thật | Tên trong danh mục | Nhóm | ĐVT | Bằng chứng phụ |
|---|---|---|---|---|---|
| Ray hộp TD | **`RT_RAYHOP`** | RAY HỘP TD U76 | Ray và trục | Kg | Mã ray hộp TD duy nhất không ghi rõ U100. Có quy đổi `1 Mét = 1,083 Kg`. `Bill of Materials` DM-2026-0010 của cửa Đức `CDUC_TD_AL595` đang dùng đúng mã này. |
| Ray sắt U70 (không ron) | **`RT_RAY_U70_KRON`** | RAY SẮT U70 (KHÔNG RON) | Ray và trục | Kg | Khớp tên NGUYÊN VĂN. Quy đổi `1 Mét = 1,78 Kg` — **trùng hệ số `RAY_U70_WEIGHT 1,78`** ghi trong `deferred_components_json` của brief. |
| Ray sắt U70 có ron | **`RT_RAY_U70_RON`** | RAY SẮT U70 (CÓ RON) | Ray và trục | Kg | Khớp tên NGUYÊN VĂN. Quy đổi `1 Mét = 1,78 Kg`. |
| Giá T | **`PKC_GIAT`** | GIÁ T | Phụ kiện chung | **Cặp** | Khớp tên NGUYÊN VĂN, và **ĐVT tồn đúng bằng "Cặp"** — khớp "1 cặp" của đặc tả. |

### 2.2 KHÔNG tra ra một-một — **cần chủ xưởng chỉ mã** (không bịa)

| Đặc tả gọi | Ứng viên trong danh mục | Vì sao máy không chọn được |
|---|---|---|
| **v4** | `PKC_V4` (V4, *không bán*) · `PKC_V4_STD` (V4 STĐ sơn tĩnh điện, *không bán*) · `PKC_V4_KEM` (V4 KẼM) · `PKC_V4_INOX` (V4 INOX 2ly) · `PKC_V4_INOX_3LY` (V4 INOX 3ly) | 5 ứng viên. Chọn theo **bề mặt** (kẽm / STĐ / inox) chứ không theo tên. Hai ứng viên gần tên nhất (`PKC_V4`, `PKC_V4_STD`) lại đang `is_sales_item = false` nên **không lên được dòng bán**. |
| **trục 114-1ly8** | `RT_TRUC_114_1.8LY` (TRỤC 114 1.8LY) · `RT_TR114_1.8` (TRỤC 114 (1.8 mm)) | **Hai mã TRÙNG NGHĨA HOÀN TOÀN**, cả hai đều `is_sales_item = true`. (Cặp trùng tương tự: `RT_TRUC_114_2.1LY` ⇄ `RT_TR114_2.1`.) Đây là **lỗi danh mục**, không phải lỗi ánh xạ. |
| **Lá Đài Loan STĐ 8D** | `LA_DLK_8D` (TP LÁ ĐÀI LOAN 8D) · `TON_DLM_8D_K124` (**TP LÁ ĐÀI LOAN 8D** — trùng tên y hệt) · `LA_DLK_8D_TRONBO` (LÁ ĐÀI LOAN 8D TRỌN BỘ) | Hai mã **trùng tên hiển thị 100%**. Ngoài ra chữ "STĐ" (sơn tĩnh điện) **không xuất hiện trong tên mã nào**, còn `DLK` (Đài Loan Kẽm) ≠ `DLM` (Đài Loan Màu) — xem `TON_DLK_8D_K124` "TÔN KẼM ĐÀI LOAN 8D". |
| **Lưới (theo loại chọn)** | Bán: 12 mã `CLUOI_*` (MV / SN φ19 / SN 13×26, ×INOX, ×TRỌN BỘ / TÁCH MÓN). Vật tư: `PKC_LUOIMV_INOX`, `PKC_LUOISNPHI19_INOX`, `PKC_LUOISN13X26_INOX`, `PKS_LUOIMV`, `PKS_LUOISNPHI19`, `PKS_LUOISN13X26` | Đặc tả ghi "theo loại chọn đặt hàng" ⇒ đây là **dòng người bán chọn**, không phải hằng số. Cần biết: dòng lưới tự sinh lấy mã **thành phẩm `CLUOI_*`** hay **vật tư `PKC_/PKS_*`**. |
| **Cửa cuốn ĐL trọn bộ** | `CDL_DLM_1LY` · `CDL_DLM_6D` · `CDL_DLM_7D` · `CDL_DLM_8D` (CỬA ĐL…D TRỌN BỘ) | 4 mã theo độ dày lá. Đây là **dòng cha** (chính cái người bán chọn), nên nó không phải "dòng tự sinh" — xem câu hỏi Q7. |

> ⚠ **Không sửa hệ số quy đổi của nhóm Ray và trục.** Audit trước ghi nhận 33 mã nhóm này
> **cố ý** để trống hệ số. Trong 33 mã đó, 3 mã tôi dùng (`RT_RAYHOP`, `RT_RAY_U70_KRON`,
> `RT_RAY_U70_RON`) **đã có sẵn** quy đổi Mét→Kg, nên tôi không phải chạm vào gì.
> Với mã còn trống, `bom-rule-sales-preview.ts:203-206` sẽ **cảnh báo** "Thiếu quy đổi Mét → Kg",
> đúng hành vi mong muốn (báo, không đoán).

---

## 3. ĐÃ HIỆN THỰC

### 3.1 5 fixture `BOM Rule` — ĐÃ COMMIT vào `server/briefs/alumdoor-v2.json` (**cần forge**)

| `rule_code` | Công thức | SL/bộ | ĐVT | Áp cho | Vật tư |
|---|---|---|---|---|---|
| `BOMR-RAY-HOP-TD-DUC` | `CAO-PB − 0,2` | 2 | Mét | DOOR_TYPE Cửa Đức | `RT_RAYHOP` |
| `BOMR-RAY-U70-KRON-UC` | `CAO-PB − 0,1` | 2 | Mét | DOOR_TYPE Cửa Úc | `RT_RAY_U70_KRON` |
| `BOMR-GIA-T-UC` | hằng `1` | 1 | Cặp | DOOR_TYPE Cửa Úc | `PKC_GIAT` |
| `BOMR-RAY-U70-RON-DL` | `CAO-PB − 0,1` | 1 ❓ | Mét | DOOR_TYPE Cửa Đài Loan | `RT_RAY_U70_RON` |
| `BOMR-RAY-U70-RON-LUOI` | `CAO-PB − 0,1` | 1 ❓ | Mét | DOOR_TYPE Cửa Lưới | `RT_RAY_U70_RON` |

Mỗi fixture mang đầy đủ **lineage nguồn**: `source_sheet = "ĐƠN GIÁ TRỌN BỘ"`,
`source_formula_code` = ô Excel (`C4`/`C5`/`C6`/`C9`), `source_formula_text` = **nguyên văn tiếng
Việt của chủ xưởng**, `authority_type = "SOURCE"` (chưa ai duyệt — đúng quy ước
`bom-rule-core.ts:6`). Cả 5 đều xem được/sửa được trên UI vì `AlumdoorBomRuleEditor.tsx` đã
được render cho doctype `BOM Rule` (`workspace-extension.tsx:60-90`).

**Không khai** quy tắc cho `v4`, `trục 114-1ly8`, `Lá Đài Loan STĐ 8D`, `Lưới`: doctype
`BOM Rule Applicability` bắt buộc `component_item`, mà 4 mã đó chưa tra ra một-một (§2.2).
Khai bừa = lặp lại đúng lỗi 35/35 mã chết. Công thức của chúng đã ghi sẵn ở §6 để dán vào
ngay khi có mã.

### 3.2 Chưa khai `BOM Template` — có lý do, không phải bỏ sót

`BOM Template` là lớp quyết định **dòng nào nhảy ra**. Chưa khai được vì cả ba chốt đều treo:
1. `conditions` phải khoá theo `price_variant`, mà context BOM chưa mang trường đó (**K2**).
2. Ngưỡng `> 10 m²` không khai được vào `conditions` (**K1**).
3. `BOM Template.item_code` là **mã thành phẩm** — mỗi mã cửa Đức/Úc/ĐL/Lưới cần một bản
   (D1: 15 mã Cửa CN Đức, 10 Cửa tấm liền Úc, 12 Cửa Lưới, 9 Đài Loan). Dựng ~46 bản ghi trong
   khi 2 chốt trên chưa chốt là chắc chắn phải làm lại.

### 3.3 KHÔNG tự phát minh "dòng chỉ đọc"

Đã tìm và **tìm thấy** cơ chế có sẵn (§1.1c). Không viết mới. Xem §5.2 cho dòng cần chèn.

---

## 4. HAI LỆCH ĐÃ PHÁT HIỆN — CHỈ BÁO, KHÔNG SỬA

### 4.1 LỆCH 1 — Ngưỡng tặng ray cửa Đức: máy chạy **8 m²**, file quy cách ghi **trên 10 m²**

**Xác minh lại con số máy đang chạy — kết quả khác giả định của audit trước:**

- ❌ **KHÔNG có bản ghi `Pricing Rule` nào tên `DUC-GIFT-RAIL-8M2` trong D1.** (Đã quét cả 89
  bản ghi `Pricing Rule`, lọc theo `ray|RAIL|GIFT|tặng`: chỉ ra 2 luật sơn ray + 15 luật chiết
  khấu đại lý.)
- ✅ Ngưỡng **hard-code trong mã nguồn**:
  `server/packages/clouderp-selling/src/controllers.ts:348`
  ```
  const ALUMDOOR_GERMAN_GIFT_RAIL_RULE = "ALUMDOOR-PR:DUC-GIFT-RAIL-8M2";
  ```
  `server/packages/clouderp-selling/src/controllers.ts:374` (trong `alumdoorCommercialBenefits`)
  ```
  if (defaultAlumdoorDiscountPercent(item) !== 15 || !Number.isFinite(area) || area < 8) return [];
  ```
- Nhãn tiếng Việt: `sales-order-v2/model.ts:648` → `"DUC-GIFT-RAIL-8M2": "Tặng ray cửa Đức từ 8 m²"`.

**Ba hệ quả cần chủ xưởng biết, ngoài chuyện 8 hay 10:**

1. Ngưỡng là **`>= 8`** (`area < 8` thì loại), còn file ghi **"trên 10m2"** tức **`> 10`**.
   Cửa đúng 10,0 m²: file nói KHÔNG được tặng, máy nói ĐƯỢC. Lệch cả con số lẫn dấu.
2. `alumdoorCommercialBenefits` hiện trả về **một nhãn suông** — `{ label, qty: 1, uom: "Bộ" }`,
   **không có `item_code`, không có kích thước**. Chú thích ngay trên hàm
   (`controllers.ts:366-369`) nói rõ: *"The exact rail SKU and cutting length remain fulfilment
   data, because the price sheet does not specify them."* → **File quy cách hôm nay CHÍNH LÀ thứ
   bổ khuyết đó**: SKU = `RT_RAYHOP`, dài = `Cao PB − 0,2`, SL = 2 cây.
3. `alumdoorCommercialBenefits` gắn với **`defaultAlumdoorDiscountPercent(item) === 15`**, tức
   **mọi cửa Đức**, chứ không lọc theo `price_variant = TANG_RAY`. Đặc tả nói ray chỉ nhảy khi
   người bán **chọn ĐƠN GIÁ TẶNG RAY**. Nghĩa là hiện nay khách mua **CHỈ LÁ** ≥ 8 m² vẫn thấy
   dòng "Tặng ray". Cần chốt (Q2).

> **KHÔNG tự đổi 8 → 10.** Chạm tiền, phải chủ xưởng chốt.

### 4.2 LỆCH 2 — Chiết khấu 15%: tìm thấy **cơ chế cụ thể** gây trừ hai lần

Đặc tả §4.1 nói: 15% tính trên **đơn giá chỉ lá**, kể cả khi bán theo đơn giá tặng ray ⇒
**15% là MỘT khoản duy nhất**.

**Bằng chứng CỦNG CỐ finding "trừ hai lần" — và chỉ đúng chỗ hỏng:**

Hệ đang có **HAI đường trừ 15% song song**, và cái chốt chống trùng **không bắt được nhau**:

| # | Đường | Nơi | Hình thức |
|---|---|---|---|
| A | **15 bản ghi `Pricing Rule` trong D1** — "Chiết khấu đại lý 15% — AL595 / AL71 / AL503N / …" | D1, `doctype='Pricing Rule'` | `effect_type = "ADJUSTMENT"`, `adjustment_basis = "AREA_SQM"`, `adjustment_rate` là **số tiền tuyệt đối âm** (vd AL595: `-153000` = đúng 15% của giá chỉ lá 1.020.000) |
| B | **`defaultAlumdoorDiscountPercent()` hard-code 15% cho mọi cửa Đức** | `controllers.ts:328-337` | `discount_percentage = 15` ghi thẳng lên dòng bán qua `applyAlumdoorDiscountPolicy` (`controllers.ts:389-405`) |

Chốt chống trùng là `withAlumdoorDefaultDiscountSnapshot` (`controllers.ts:351-364`):
```
if (expected <= 0 || snapshots.some((snapshot) => snapshot.effect_type === "DISCOUNT_PERCENT")) return snapshots;
```
Nó chỉ bỏ qua khi đã có snapshot **`DISCOUNT_PERCENT`**. Nhưng 15 luật ở đường A mang
`effect_type = "ADJUSTMENT"`. **Hai chuỗi không bao giờ bằng nhau ⇒ chốt không kích hoạt ⇒
đường B cộng thêm 15% NỮA lên trên khoản đã trừ của đường A.**

Chính `note` của 15 bản ghi đường A đã cảnh báo trước ý đồ (nguyên văn trong D1):
> *"Số tiền CỐ ĐỊNH, trừ cho cả bản chỉ lá lẫn bản tặng ray — không dùng phần trăm vì phần trăm
> sẽ lấy nhầm gốc khi bán bản tặng ray."*

Tức tác giả đường A **cố ý** chuyển 15% thành số tuyệt đối để khớp đúng yêu cầu "15% trên đơn giá
chỉ lá" của file quy cách — nhưng đường B cũ không bị gỡ.

⇒ **Kết luận cho agent đang xử lý bug**: cùng một cái cửa Đức đại lý bị trừ
`(15% × giá đang bán)` **+** `(15% × giá chỉ lá)`. Với AL70 1 lớp bán bản `TANG_RAY`
(1.221.000 đ/m²) thì đó là `183.150 + 171.900 = 355.050 đ/m²` thay vì `171.900 đ/m²`.
Hướng sửa an toàn: **gỡ đường B** (hoặc mở rộng chốt để nhận cả `ADJUSTMENT` cùng
`exclusive_group = "CK_DAI_LY"`), giữ đường A. **Tôi KHÔNG sửa** — file `controllers.ts` do
agent khác giữ.

---

## 5. PHẦN CÒN TREO — VIỆC CHO NGƯỜI KHÁC

### 5.1 Cần forge

| Thay đổi | File | Lệnh |
|---|---|---|
| 5 fixture `BOM Rule` mới | `server/briefs/alumdoor-v2.json` (**đã commit**) | `node scripts/forge-app.mjs` |

Forge hiện **đang fail** (`417: Custom field color collides with a standard field on Batch`) —
phải sửa lỗi đó trước, việc này thuộc agent khác.

### 5.2 Ba sửa đổi trong file agent khác đang giữ

**(1) Cho `price_variant` đi vào context BOM** — `bom-template-materializer.ts:332-345`,
trong `bomContextFromProductionLine`, thêm vào object `context`:
```ts
price_variant: line.price_variant ?? snapshot.price_variant,
```
và thêm `price_variant?: string;` vào `BomProductionLineInput`. Kèm theo, thêm chuỗi
`"price_variant"` vào `QUOTE_LINE_FIELDS` (`server/apps-src/alumdoor-worker/src/index.ts:1152-1161`,
chèn cạnh `"sales_mode"`), nếu không báo giá chuyển sang đơn sẽ rơi mất trường này.
*Không có bước này thì `conditions_json: {"price_variant":"TANG_RAY"}` KHÔNG BAO GIỜ khớp
(`bom-template-core.ts:150` — thiếu key trong context là loại thẳng).*

**(2) Khóa cột đơn giá của dòng tự sinh** — `server/apps-src/alumdoor-worker/src/ui-child-preview.ts`,
tại chỗ dựng `overrides` trước `return answer(...)` ở **dòng 549** (và bản song song ở **dòng 737**),
thêm — với `isAutoGeneratedLine` là cờ do dòng tự sinh mang theo:
```ts
if (isAutoGeneratedLine) {
  overrides.rate = { ...(overrides.rate ?? {}), read_only: 1, label: "Đơn giá (máy khóa)" };
}
```
Client **không cần sửa gì** — `fieldReadonly` (`sales-order-v2/model.ts:589-592`) đã đọc sẵn.

**(3) Ngưỡng diện tích + lọc theo `price_variant`** — `controllers.ts:370-383`
(`alumdoorCommercialBenefits`). Chỉ sửa sau khi có Q1 + Q2. Đây là chỗ duy nhất ngưỡng nên
sống, vì `BOM Template.conditions` không so được lớn/nhỏ (**K1**).

### 5.3 Lỗi nhỏ phát hiện thêm (chưa sửa)

`bom-rule-core.ts:151` đọc `positive(rule.version, 1)` nhưng doctype `BOM Rule` khai trường tên
**`rule_version`** (brief, doctype #94). ⇒ **Mọi `BOM Rule` đều bị coi là version 1**, kể cả sau
khi chủ xưởng sửa và tăng số phiên bản. Ảnh hưởng: `formula_snapshot` lưu sai version, truy vết
"đơn này chạy công thức đời nào" hỏng. Sửa 1 dòng, nhưng **chạm dữ liệu lịch sử** nên để chủ
xưởng biết trước.

### 5.4 `BOM Template` vẫn không có đường vào giao diện

Nhắc lại từ audit trước, chưa đổi: không mục menu, không editor
(`catalog-readiness.ts:77` đã tự ghi nhận). Chủ xưởng **không có cách nào tự tạo/sửa một
`BOM Template`** ngoài forge từ brief. Đây là chốt cho câu hỏi Q11.

---

## 6. CÔNG THỨC CÒN LẠI — DÁN VÀO NGAY KHI CÓ MÃ

Chép sẵn để không phải đọc lại Excel. Điền `component_item` rồi thêm vào `fixtures`:

| `rule_code` đề xuất | `source_field` | `operator` | `operand` | `result_uom` | Áp cho | `component_item` |
|---|---|---|---|---|---|---|
| `BOMR-V4-DL` | `RONG-PB-RAY` | `SUBTRACT` | `0.03` | Mét | Cửa Đài Loan | ❓ (§2.2 v4) |
| `BOMR-V4-LUOI` | `RONG-PB-RAY` | `SUBTRACT` | `0.03` | Mét | Cửa Lưới | ❓ |
| `BOMR-TRUC114-DL` | `RONG-PB-RAY` | `SUBTRACT` | `0.05` | Mét | Cửa Đài Loan | ❓ (§2.2 trục) |
| `BOMR-TRUC114-LUOI` | `RONG-PB-RAY` | `SUBTRACT` | `0.05` | Mét | Cửa Lưới | ❓ |
| `BOMR-LA-DL-8D-LUOI` | `PRODUCT(CAO-PB × RONG-PB-RAY)` | `PRODUCT` | — | m2 | Cửa Lưới | ❓ (§2.2 lá) |
| `BOMR-LUOI-LUOI` | `PRODUCT(CAO-PB × RONG-PB-RAY)` | `PRODUCT` | — | m2 | Cửa Lưới | ❓ (§2.2 lưới) |

*(Hai dòng cuối dùng `operator: "PRODUCT"` + `source_field: "CAO-PB"` + `source_field_2:
"RONG-PB-RAY"` — `bom-rule-core.ts:180-186` hỗ trợ sẵn. Đặc tả ghi "nhập cao × R PB ray × sl",
phần "× sl" chính là `qty_per_set` / `set_count`, engine tự nhân — xem
`bom-rule-core.ts:255-258`.)*

---

## 7. CÂU HỎI CHO CHỦ XƯỞNG

Mỗi câu trả lời được bằng **một câu hoặc một con số**.

**Chạm tiền — cần trả lời trước nhất**

- **Q1.** Cửa Đức tặng ray: ngưỡng là **8 m²** (máy đang chạy) hay **10 m²** (file quy cách)? Và
  cửa **đúng bằng** ngưỡng thì có được tặng không?
- **Q2.** Khách mua cửa Đức **ĐƠN GIÁ CHỈ LÁ** mà cửa lớn hơn ngưỡng — có được tặng ray không?
  (máy hiện đang tặng cho MỌI cửa Đức, không phân biệt loại đơn giá)
- **Q3.** Dòng phụ kiện tự sinh "khóa cột đơn giá" nghĩa là giá **0 đồng (tặng kèm)**, hay **có
  giá bình thường nhưng người bán không sửa được**?

**Chỉ mã hàng — mỗi câu chọn một mã**

- **Q4.** "**v4**" là mã nào: `PKC_V4_KEM` (V4 kẽm) / `PKC_V4_STD` (V4 sơn tĩnh điện) /
  `PKC_V4_INOX` / `PKC_V4_INOX_3LY`? Hay đổi theo màu cửa?
- **Q5.** "**trục 114-1ly8**": `RT_TRUC_114_1.8LY` hay `RT_TR114_1.8`? (hai mã trùng nghĩa —
  mã còn lại nên **ngừng dùng** để khỏi lặp lại)
- **Q6.** "**Lá Đài Loan STĐ 8D**": `LA_DLK_8D` hay `TON_DLM_8D_K124`? (hai mã **trùng tên hiển
  thị y hệt** trong danh mục)
- **Q7.** Dòng **lưới** tự sinh lấy mã **thành phẩm** (`CLUOI_LUOI_SN_TRONBO`…) hay mã **vật tư**
  (`PKS_LUOISNPHI19`, `PKC_LUOISNPHI19_INOX`…)?
- **Q8.** "**Ray hộp TD**" của cửa Đức là **U76** (`RT_RAYHOP`, tôi đang dùng) hay **U100**
  (`RT_RAY_HOP_TD_U100`)?

**Số lượng còn thiếu trong file**

- **Q9.** Cửa **Đài Loan** trọn bộ: ray sắt U70 có ron **mấy cây**? (file chỉ ghi số cây cho cửa
  Úc là 2; tôi tạm để 1)
- **Q10.** Cửa **Lưới** trọn bộ: ray sắt U70 có ron **mấy cây**?

**Quyết định cách làm**

- **Q11.** Chủ xưởng muốn **tự sửa được** danh sách dòng tự sinh trên màn hình (phải làm menu +
  editor cho `Mẫu BOM`), hay chỉ cần sửa **công thức** trong danh mục `Quy tắc BOM` đang có?
- **Q12.** Người bán có được **xóa** một dòng tự sinh không? (đặc tả chỉ nói khóa **cột giá**,
  không nói khóa cả dòng)
- **Q13.** Cửa **Lưới** trọn bộ, "**tổng diện tích 2 lá và lưới**" — 2 lá đây là **2 lá Đài Loan**,
  hay **1 lá + 1 lưới**?
