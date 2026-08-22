# ALUMDOOR — Ngưỡng chọn MOTOR/UPS và Quy tắc BOM: điều tra + khoảng cách + bảng chủ xưởng điền

Ngày: 21/08/2026 · Phạm vi: `(A) ngưỡng chọn MOTOR/UPS`, `(B) quy tắc BOM`
Nguyên văn chủ xưởng: *"Chưa có phần ngưỡng chọn UPS chưa có BOM Quy tắc BOM"*

> **Cách đo**: mọi con số dưới đây lấy từ D1 local thật
> `server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06f….sqlite`
> (bảng `documents`, `doctype_definitions`) và từ file nguồn trong repo thật `C:\alumdoor`.
> **Không xác nhận được trên trình duyệt**: backend `127.0.0.1:8799` đang trả HTTP 500
> (`forge.apps.install → 417: Custom field color collides with a standard field on Batch`),
> nên toàn bộ kết luận ở đây là đo mã nguồn + đo D1, KHÔNG phải chạy thử trên màn.

---

## 0. Kết luận một dòng

| | Chủ xưởng nói | Sự thật đo được |
|---|---|---|
| Ngưỡng motor | chưa có | **Luật + bảng số ĐÃ CÓ ĐỦ** (code, route, doctype, 15 dòng số trong brief). Hỏng ở 2 chỗ: (1) **không màn nào gọi**, (2) **bảng trong D1 rỗng 0 dòng**. |
| Ngưỡng UPS | chưa có | **ĐÃ CÓ**, gồm 2 dòng, chọn theo **TẢI MOTOR** chứ không theo diện tích. Cùng 2 lỗi trên. Thiếu ngưỡng cho 2 mã UPS YH. |
| Quy tắc BOM | chưa có | **Engine BOM đầy đủ** (`BOM Template` + `BOM Component Rule` + công thức theo trường hình học). Hỏng ở: **0 bản ghi `BOM Template` / `BOM Rule` trong D1**, và **100% mã hàng mà 5 mẫu BOM trong brief trỏ tới đều KHÔNG tồn tại trong danh mục hiện hành**. |

Nói ngắn: **không phải chưa làm — mà là dữ liệu chưa vào máy và mã hàng đã bị đổi khiến luật trỏ vào chỗ trống.**

---

# PHẦN A — Ngưỡng chọn MOTOR / UPS

## A1. Bảng tra nằm ở đâu

| Thứ | Đường dẫn | Trạng thái |
|---|---|---|
| Thuật toán tra | `server/apps-src/alumdoor-worker/src/motor-selection.ts:1-90` | ✅ có, có test ý nghĩa |
| Đọc dữ liệu từ tenant | `server/apps-src/alumdoor-worker/src/index.ts:2633-2640` (`readMotorThresholds`) | ✅ có |
| Route | `server/apps-src/alumdoor-worker/src/index.ts:2676-2689` `alumdoor.motor.suggest` | ✅ **đã đăng ký trong dispatcher** |
| Danh mục | doctype `Ngưỡng chọn Motor` (module `Alumdoor`, `doctype_definitions`) | ✅ đã khai |
| Mục trên menu | `server/briefs/alumdoor-v2.json` → `navigation.items[58]` | ✅ có |
| **Nơi gọi trên UI** | grep `motor.suggest` toàn `client/packages/*/src` | ❌ **0 kết quả** |
| **Dữ liệu trong D1** | `select count(*) from documents where doctype='Ngưỡng chọn Motor'` | ❌ **0** |

Dữ liệu ngưỡng thì **không hard-code**: nó đọc từ danh mục D1. Bản số nằm sẵn ở
`server/briefs/alumdoor-v2.json` dưới dạng **17 fixture** `Ngưỡng chọn Motor`
(15 motor + 2 UPS) nhưng **chưa forge vào tenant** ⇒ route hiện trả
`{ motor: null, ups: null, note: "Chưa có bảng ngưỡng chọn Motor" }`.

## A2. Ngưỡng đo theo cái gì — có nguồn, không phải suy diễn

Nguồn gốc: `apps/alumdoor/docs/nguon/BANG-GIA-CHINH-THUC-31-07-2026.md:194-217`
(§6, bảng giá có mộc, hiệu lực 31/07/2026). Nguyên văn dòng chốt:

> `BANG-GIA-CHINH-THUC-31-07-2026.md:215-217`
> "Đây là **bảng tra chọn motor theo diện tích cửa** — thứ tương đương với câu hỏi 'chọn lò xo
> thế nào' mà chủ dự án bảo để thợ tự chọn. Motor thì **có luật rõ ràng**, nên app tra được.
> UPS chọn theo **tải motor**, không theo diện tích."

- **MOTOR ⇐ DIỆN TÍCH CỬA (m²)**, cận trên **MỞ** (`<15m²` nghĩa là cửa đúng 15 m² KHÔNG dùng
  motor 15 — `motor-selection.ts:41-46` đã làm đúng chỗ này).
- **UPS ⇐ TẢI MOTOR (kg)** của chính con motor vừa chọn, **không** theo diện tích, **không**
  theo số cửa chạy đồng thời. Tải motor suy từ đuôi mã luật (`MOTO-JG-800` ⇒ 800 kg);
  không suy được thì **từ chối**, không đoán (`motor-selection.ts:80-90`).

### Bảng ngưỡng UPS ĐANG CÓ (nguồn `BANG-GIA-CHINH-THUC-31-07-2026.md:213-214`)

| Mã trong bảng giá | Điều kiện | Giá | Gồm |
|---|---|---|---|
| ALUMAX UPS E-800KG | motor **<600 KG** | 1.800.000 | 9 AH |
| ALUMAX UPS E-1000KG | motor **<1000 KG** | 2.700.000 | 12 AH |

> Lưu ý: cột "Điều kiện" trong bảng giấy ghi `motor <600KG` cho mã tên E-800KG — **tên mã và
> ngưỡng lệch nhau**, và fixture trong brief cũng chép đúng như vậy (`max_motor_kg: 600`).
> Đây là điểm cần chủ xưởng xác nhận (câu hỏi **U1** bên dưới), không được tự sửa.

## A3. Mã hàng UPS có trong danh mục không — CÓ, nhưng KHÔNG khớp bảng ngưỡng

Truy `documents` doctype `Item` (404 mã, trong đó 227 mã bán):

| Mã thật trong danh mục | Nhóm hàng | Tên hàng |
|---|---|---|
| `LKMT_UPS_ALE800` | Linh kiện motor | ALUMAX UPS E-800KG |
| `LKMT_UPS_ALE1000` | Linh kiện motor | ALUMAX UPS E-1000KG |
| `BLD_UPS_E800I` | Bình lưu điện | Bình lưu điện Alumax E800i |
| `BLD_UPS_E1000I` | Bình lưu điện | Bình lưu điện Alumax E1000i |
| `BLD_UPS_YH1000` | Bình lưu điện | Bình lưu điện YH1000 |
| `BLD_UPS_YH2000` | Bình lưu điện | Bình lưu điện YH2000 |

**Có tới 2 họ mã UPS cùng tồn tại** (`LKMT_UPS_*` và `BLD_UPS_*`) — và bảng ngưỡng trong brief
lại trỏ vào **`PIN-UPS-E800I` / `PIN-UPS-E1000I`, hai mã KHÔNG tồn tại**.

## A4. Lỗi nặng nhất phần A — 17/17 mã trong bảng ngưỡng đều là mã CHẾT

Đối chiếu `item_code` của 17 fixture `Ngưỡng chọn Motor` với danh mục `Item` thật trong D1:

```
Motor/UPS item refs: 17   MISSING trong danh mục: 17  (100%)
MOTO-TANKER400  MOTO-TANKER600  MOTO-TANKE800  MOTO-ALUMAX400  MOTO-ALUMAX600
MOTO-JG300  MOTO-JG400  MOTO-JG600  MOTO-JG800  MOTO-JG1000  MOTO-JG1500
MOTO-YHLD300  MOTO-YHLD500  MOTO-YHLD800  MOTO-YHLD1000
PIN-UPS-E800I  PIN-UPS-E1000I
```

Danh mục hiện hành dùng hệ mã khác hẳn: `MT_JG800KG`, `MT_TANKER400KG`, `MT_YHLD1000KG`…
(xem `docs/ALUMDOOR-ANH-XA-MA-HANG-20260819.md` — đợt đổi mã 587→424 đã diễn ra, nhưng
fixture ngưỡng motor **không được đổi theo**).

Bằng chứng hệ mã `MT_*` là hệ đang dùng: 56 `Pricing Rule` motor nhập ngày 21/08 trong D1 đều
dùng `MT_JG800KG`, `MT_TANKER1000KG`… (ví dụ bản ghi `JG — không lắc · MT_JG800KG`).

### Bảng ánh xạ đề xuất (mã cũ trong brief → mã thật trong danh mục)

Ghép 1-1 theo tên hàng, **kiểm chứng được**, không đoán:

| Fixture (brief) | Diện tích | Mã thật đề xuất | Tên hàng trong danh mục |
|---|---|---|---|
| `MOTO-TANKER400` | <15 m² | `MT_TANKER400KG` | MOTOR TANKER 400KG |
| `MOTO-TANKER600` | <18 m² | `MT_TANKER600KG` | MOTOR TANKER 600KG |
| `MOTO-TANKE800` | <27 m² | `MT_TANKE800KG` | MOTOR TANKER 800KG |
| `MOTO-ALUMAX400` | <15 m² | `MT_ALUMAX400KG` | MOTOR ALUMAX 400KG |
| `MOTO-ALUMAX600` | <25 m² | `MT_ALUMAX600KG` | MOTOR ALUMAX 600KG |
| `MOTO-JG300` | <18 m² | `MT_JG300KG` | MOTOR JG 300KG |
| `MOTO-JG400` | <28 m² | `MT_JG400KG` | MOTOR JG 400KG |
| `MOTO-JG600` | <36 m² | `MT_JG600KG` | MOTOR JG 600KG |
| `MOTO-JG800` | <42 m² | `MT_JG800KG` | MOTOR JG 800KG |
| `MOTO-JG1000` | <48 m² | `MT_JG1000KG` | MOTOR JG 1000KG |
| `MOTO-JG1500` | <55 m² | `MT_JG1500KG` | MOTOR JG 1500KG |
| `MOTO-YHLD300` | <15 m² | `MT_YHLD300KG` | MOTOR YHLD 300KG |
| `MOTO-YHLD500` | <15 m² | `MT_YHLD500KG` | MOTOR YHLD 500KG |
| `MOTO-YHLD800` | <25 m² | `MT_YHLD800KG` | MOTOR YHLD 800KG |
| `MOTO-YHLD1000` | <35 m² | `MT_YHLD1000KG` | MOTOR YHLD 1000KG |
| `PIN-UPS-E800I` | motor <600 kg | ❓ `LKMT_UPS_ALE800` **hoặc** `BLD_UPS_E800I` | hai mã cùng tên thương mại → **hỏi chủ xưởng (U2)** |
| `PIN-UPS-E1000I` | motor <1000 kg | ❓ `LKMT_UPS_ALE1000` **hoặc** `BLD_UPS_E1000I` | như trên |

> Bảng này **chưa được áp** vì `server/briefs/alumdoor-v2.json` thuộc danh sách file bị cấm sửa
> trong phiên này (agent khác đang giữ). Cần chuyển cho người sở hữu file đó, và **phải chạy
> `node scripts/forge-app.mjs`** thì số mới vào D1.

## A5. Motor có trong danh mục nhưng KHÔNG có ngưỡng

Danh mục có 32 mã nhóm `Motor`; bảng §6 chỉ phủ 15. **Không có ngưỡng** cho:
`MT_TANKER1000KG`, `MT_JG500KG`, `MT_YHTAIWAN_CH_300…1000KG` (7 mã), 4 mã `LKMT_BOSTEC_*`,
4 mã `LKMT_CHTAIWAN_*`. Bảng giá §2 có ghi giá Taiwan CH / Bostech kèm ngưỡng dạng
`(<12m²) / (<22m²)` (`BANG-GIA-CHINH-THUC-31-07-2026.md:122-123`) nhưng **chưa được chuyển thành
dòng `Ngưỡng chọn Motor`** — xem câu hỏi **U3**.

## A6. 56 luật giá tuỳ chọn motor đang TẮT — CỐ Ý, không phải quên

Đo D1: `Pricing Rule` có 89 bản ghi, **30 bật / 59 tắt**; trong 59 tắt có **56 luật motor**
(`— không lắc`, `— không bộ điều khiển`, `— không bộ điều khiển và không lắc`, `phụ thu đổi lắc
33→36`). Mỗi bản ghi có `note` ghi rõ lý do tắt, nguyên văn:

> "TẮT khi nhập. Không có căn cứ nào trên dòng bán để máy biết khách KHÔNG lấy lắc hay KHÔNG lấy
> bộ điều khiển — `trustedCommercialFacts` không có ô nào như vậy. Luật không điều kiện mà bật
> lên thì MỌI dòng motor bị trừ. Mở sau khi thêm ô đánh dấu tương tự `has_butterfly_bracket`."

⇒ **Đừng bật chúng lên.** Việc phải làm trước là thêm 2 ô đánh dấu trên dòng bán
(`không lấy lắc`, `không lấy bộ điều khiển`) vào `trustedCommercialFacts`. Xem câu hỏi **U4**.

## A7. Đã nối dây gì trong phiên này

Tạo file mới: **`client/packages/vertical-alumdoor/src/AlumdoorMotorSuggestPanel.tsx`**

- gọi `alumdoor.motor.suggest` với `area_sqm` của dòng bán (debounce 250 ms);
- hiện `Gợi ý: <mã motor> · vì cửa X m² < ngưỡng Y m² của <mã luật>`;
- hiện tiếp gợi ý **UPS** kèm lý do `tải motor Z kg < ngưỡng W kg` và nhắc rõ
  "UPS chọn theo TẢI MOTOR, không theo diện tích";
- **KHÔNG tự thêm dòng hàng** — có nút `Dùng gợi ý này` gọi callback `onAccept`;
- khi bảng ngưỡng rỗng thì hiện thẳng câu của máy chủ + chỉ đường tới danh mục
  `Ngưỡng chọn Motor`, **không bịa mã motor**.

Chưa chèn vào màn bán hàng vì `client/packages/vertical-alumdoor/src/sales-order-v2/*` bị cấm
sửa trong phiên này. Ba sửa đổi cần thiết (dành cho người sở hữu file đó):

1. `AlumdoorSalesOrderLineTableComplete.tsx` — thêm import:
   ```ts
   import { AlumdoorMotorSuggestPanel } from "../AlumdoorMotorSuggestPanel.js";
   ```
2. cùng file, **sau dòng 596** (`) : null}` đóng khối `data-section="sales-v2-bom-actual"`),
   chèn:
   ```tsx
   {props.expanded ? (
     <TableRow className="border-b bg-muted/10 hover:bg-muted/10" data-section="sales-v2-motor-suggest">
       <TableCell colSpan={props.colSpan} className="border-l-2 border-primary/30 p-2.5">
         <AlumdoorMotorSuggestPanel
           areaSqm={props.line.billable_area_sqm}
           currentMotorItemCode={props.line.motor_model}
           disabled={props.readOnly || Boolean(props.line._loading)}
           onAccept={(kind, s) => { if (kind === "motor") props.onPatch(props.line._key, { motor_model: s.item_code }); }}
         />
       </TableCell>
     </TableRow>
   ) : null}
   ```
3. để nút `Dùng gợi ý này` chạy được, `BomBlock` phải nhận `onPatch`:
   thêm `onPatch: (key: string, patch: Partial<SalesLine>) => void;` vào interface props của
   `BomBlock` (cạnh `onBomActualChange` ở **dòng 495**), và truyền `onPatch={props.onPatch}`
   ở chỗ gọi `<BomBlock … />` (**dòng 1148**).

Bỏ hẳn `onAccept` cũng hợp lệ — panel khi đó chỉ hiển thị gợi ý, không có nút.

---

# PHẦN B — Quy tắc BOM

## B1. Hiện BOM sinh ra thế nào

Có **hai lớp**, cố ý tách:

| Lớp | File | Việc |
|---|---|---|
| `BOM Template` + `BOM Component Rule` | `server/apps-src/alumdoor-worker/src/bom-template-core.ts` (~520 dòng) | chọn đúng mẫu theo `item_code` + `conditions`, rồi tính **số lượng từng cấu phần bằng công thức** trên trường hình học (`CONSTANT`/`FIELD`/`PRODUCT`/`QUOTIENT`, `multiply`, `add`, `rounding`, `precision`) |
| `BOM Rule` (danh mục riêng) | `server/apps-src/alumdoor-worker/src/bom-rule-core.ts`, `bom-rule-sales-preview.ts` | luật định mức khai bằng tay trên UI, có `applicability` (theo mặt hàng / nhóm hàng / loại cửa), `formula_json`, `qty_per_set`, `version`, `authority_type`, và lineage nguồn (`source_sheet` / `source_row` / `source_formula_text`) |
| `BOM Actual` | `bom-actual-components.ts` | những cấu phần **không có công thức** (lò xo, puly, vít…) — bắt người dùng nhập thực tế, và **chặn** nếu nhập mã không nằm trong allowlist của mẫu (`bom-actual-components.ts:102`) |

⇒ **Có quy tắc BOM sinh tự động từ kích thước.** Nó không phải khai tay từng mã.

Nguyên tắc "không đoán" được cắm khắp nơi, ví dụ `bom-template-core.ts:202`:
`"Mặt hàng X chưa có BOM Template; hãy cấu hình BOM cho đúng mã hàng."` và `:226`
`"Có N BOM Template cùng mức… Hãy vô hiệu hóa bản thừa; hệ thống không đoán."`

## B2. Hai editor — cái nào sống

| File | Sống? | Việc |
|---|---|---|
| `client/packages/vertical-alumdoor/src/AlumdoorBomRuleEditor.tsx` | ✅ **SỐNG** | được render lazy tại `workspace-extension.tsx:14`, và gắn vào doctype `BOM Rule` cho cả màn **tạo mới** (`:60-71`) lẫn **màn chi tiết** (`:73-90`). Soạn `formula_json` bằng UI (kind, source_field, operator, multiply/divide, rounding…), quản `applicability`, `version`, lineage nguồn. |
| `client/packages/vertical-alumdoor/src/AlumdoorBomActualEditor.tsx` | ✅ **SỐNG** | dùng ở 4 nơi: `AlumdoorSalesOrderLineTable.tsx:221`, `AlumdoorSalesOrderLineTableComplete.tsx:592`, `work-order-v2/AlumdoorWorkOrderBomPanel.tsx:251` (chế độ chỉ đọc), + type dùng lại ở `sales-order-v2/model.ts:3`. Nó **không** soạn công thức; nó nhập **số thực tế đã dùng** cho các slot mà mẫu đánh dấu `required_actual_component_keys`. |

**Kết luận sửa lại audit trước**: câu *"AlumdoorBomRuleEditor chưa ai render"* là **SAI** —
editor có mặt trên cả hai màn của `BOM Rule`. Cái thật sự thiếu editor là **`BOM Template`**.

## B3. `BOM Template` trong hệ này là gì — và nó là lỗ hổng thật

- Là **mẫu BOM gắn với một mã thành phẩm**, chứa: `template_code`, `item_code`, `conditions_json`,
  `priority`, `required_component_keys_json`, `required_actual_component_keys_json`,
  `actual_component_allowed_items_json`, `deferred_components_json`, và danh sách
  `component_rules` (mỗi rule = 1 cấu phần + công thức số lượng).
- **Trong D1: 0 bản ghi.**
- **Không có mục trên menu**: grep `navigation` của `alumdoor-v2.json` → `BOM Rule` ✅,
  `Bill of Materials` ✅, `Ngưỡng chọn Motor` ✅, **`BOM Template` ❌**.
  Chính `server/apps-src/alumdoor-worker/src/catalog-readiness.ts:77` đã ghi nhận điều này:
  *"`BOM Template` — thuộc nhóm 'Sản xuất', nên hiện KHÔNG mục nào trên màn Danh mục dẫn tới"*.
- **Không có editor riêng.** ⇒ Hôm nay **không ai — kể cả chủ xưởng — có đường nào để tạo hay
  sửa một `BOM Template` trên giao diện.** Chỉ có đường forge từ brief.

## B4. Con số thật trong D1 (21/08/2026)

| Đo | Số |
|---|---|
| `Item` tổng | **404** |
| `Item` có `is_sales_item` | **227** |
| `Bill of Materials` | **4** — cả 4 đều của **một mã duy nhất** `CDUC_TD_AL595`, 3/4 là rác do e2e (`"Định mức tối thiểu dựng bởi e2e … để thử luồng sản xuất"`), mỗi bản chỉ **1 cấu phần** `RT_RAYHOP 6 Kg` |
| **Mã bán CÓ BOM** | **1 / 227** |
| **Mã bán KHÔNG có BOM** | **226 / 227** |
| `BOM Template` | **0** |
| `BOM Rule` | **0** |
| `BOM Component Rule` / `BOM Rule Applicability` | **0** |
| `Material Specification` | 78 — nhưng **không bản ghi nào trỏ tới một `Item`** (chỉ có `spec_code`, `item_group`, `material_grade`, `thickness_mm`) ⇒ **0/227 mã bán được gắn quy cách vật liệu** |
| `Ngưỡng chọn Motor` | **0** |

> Đây là con số nặng hơn cảnh báo "199/227 chưa gắn quy cách kỹ thuật" của vòng audit trước:
> đo trực tiếp thì **227/227 mã bán không có `Material Specification` gắn tên**, và
> **226/227 không có định mức nào cả**.

## B5. 5 mẫu BOM trong brief cũng trỏ vào mã chết — y hệt lỗi phần A

`server/briefs/alumdoor-v2.json` có **5 fixture `BOM Template`**, tất cả đều cho **cửa Úc kéo tay**
(`SRC-UC-KT-4D-XN-VK`, `SRC-UC-KT-46D-XN-VK`, `-XR-CF`, `-TR-XLC`, `-KU-GU`), nguồn ghi rõ
`MS LIÊN BS.xlsx / ĐM / rows 687-831`.

Đối chiếu 35 mã hàng mà 5 mẫu này trỏ tới với danh mục `Item` thật:

```
BOM Template item refs: 35   MISSING trong danh mục: 35  (100%)
CUA-UC-KT-4D · TP-UC-KT-4.6D-XN-VK · TP-UC-KT-4.6D-XR-CF · TP-UC-KT-4.6D-TRẮNG-XLC · TP-UC-KT-4.6D-KU-GU
NVL-TOLE0.42x598-XN-VK · NVL-TOLE1.2x190-KRON · NVL-TRUC34 · NVL-PULYUC34 · NVL-PULYGAI
NVL-XOP-N45 · NVL-RONDAYUC · NVL-VDAY-TDU · NVL-VAIHAMXO · NVL-VISDD-BANLO · NVL-VIS-BANLO2P
NVL-INOX · NVL-NHUA · NVL-MOC · NVL-BKAN · NVL-CHNHUA · NVL-GIAT · NVL-GOIFE · NVL-TON3.8D-XN-VK
NVL-LX-5.5 x 70 x 46V … NVL-LV-7.0 x 90 x 83V  (8 mã lò xo)
```

⇒ **Ngay cả khi forge chạy được, 5 mẫu BOM này vẫn vô dụng**, vì không mã hàng nào tồn tại.
Đây chính là hệ quả của đợt đổi mã 587→424 (`docs/ALUMDOOR-ANH-XA-MA-HANG-20260819.md`) rồi
danh mục lại được nhập lại bằng hệ mã thứ ba (`CDUC_*`, `MT_*`, `LKMT_*`, `BLD_*`, `RT_*`, `PKC_*`).
Ánh xạ 35 mã này **không thể máy làm** (ví dụ `NVL-LX-5.5 x 70 x 46V` là quy cách lò xo, không có
mã tương ứng trong 404 mã hiện có) — **cần chủ xưởng chỉ mã**.

## B6. Tài liệu nghiệp vụ nói gì về quy tắc BOM (trích nguyên văn + file:line)

### (a) Số lá — cửa Đức
`apps/alumdoor/docs/nguon/quy-trinh-van-ban.md:168-175`
> "Công thức: ((Cao PB – 130) : bản lá theo "mã Tên vật tư/SP") – 1)
> = ((3-0.13)/0.055)-1) = 52.18 – 1 = 51 lá
> Làm tròn số phẩy lớn hơn 0.6 (ví dụ: 52.6 thì là 52, nếu <52.6 thì là 51)
> Thì: 51 LÁ RUỘT + 1 LÁ ĐẦU + 3 LÁ ĐÁY"

`quy-trinh-van-ban.md:137`
> "…LÁ RUỘT + 1 LÁ ĐẦU + 3 LÁ ĐÁY (hiển thị cố định, kế toán điền tay số lá ruột)"

### (b) Bản lá theo mã — 23 dòng
`apps/alumdoor/docs/nguon/SALES-BOM-SOURCE-MAP.md:124-148`
(`AL71C 0.055` · `AL70 0.068` · `AL548C 0.050` · `AL548N 0.055` · `AL595 0.060` …)

### (c) Số lá — cửa Úc, ba nhánh theo kiểu cửa
`SALES-BOM-SOURCE-MAP.md:178-183`
> "- motor trong và kéo tay: `(Cao PB / 0.465) + 2`;
> - motor ngoài không tự dừng: `(Cao PB / 0.465) + 1.5`;
> - motor ngoài có tự dừng: `(Cao PB / 0.465) + 1.3`.
> Sau đó có rule làm tròn theo phần mười thành các mức `0`, `0.3`, `0.7`, `1`…"

### (d) Rộng cắt lá — khác nhau theo loại cửa VÀ loại ray
`SALES-BOM-SOURCE-MAP.md:58-66` (bảng 5 loại cửa) và `:196-199`
> "- ray sắt U70 không ron: `Rộng PB ray - 0.05`;
> - ray hộp U76 hoặc ray đơn U76: `Rộng PB ray - 0.08`."

`SALES-BOM-SOURCE-MAP.md:68` (dòng cảnh báo, nguyên văn):
> "Không rút gọn các nhánh này thành một công thức chung nếu chưa có rule/priority rõ ràng."

### (e) Cấu phần trọn bộ tự phát sinh
`SALES-BOM-SOURCE-MAP.md:70-106` — ví dụ cửa Đài Loan trọn bộ (`:92-94`):
> "- ray sắt U70 có ron: `Cao PB - 0.1`; - V4: `Rộng PB ray - 0.03`;
> - trục 114-1ly8: `Rộng PB ray - 0.05`."
Cửa Đức tặng ray: *"sinh thêm ray hộp TD với chiều dài `Cao PB - 0.2`, số lượng 2 cây; áp dụng
cửa diện tích trên 10 m²; cột đơn giá ray bị khóa."* (`:76`)

### (f) Định mức nhôm theo **KG/m²** — có hệ số nhưng KHÔNG có cách nhân
`server/briefs/alumdoor-v2.json`, fixture `SRC-UC-KT-46D-XN-VK`, `deferred_components_json`:
> "`LEAF_SHEET` — ĐM CỬA ÚC KT 4.6D XN-VK có hệ số **4,4 KG/M2** nhưng ô công thức trống; không suy diễn cách nhân."
> "`SPIKE_PULLEY_WEIGHT` — ĐM có hệ số **0,126** nhưng ô công thức trống; không suy diễn cách nhân."
> "`BOTTOM_BAR_WEIGHT` — ĐM có hệ số **0,6** nhưng ô công thức trống; không suy diễn cách nhân."
> "`RAY_U70_WEIGHT` — ĐM ghi *chiều cao - 10cm x số lượng* nhưng không ghi rõ cách áp hệ số **1,78**."
> "`SHAFT_34_WEIGHT` — ĐM ghi *rộng + 40cm* nhưng không ghi rõ cách áp hệ số **1,7**."
> "`FOAM_45CM` — ĐM ghi *(rộng/45cm)\*2* nhưng không chỉ rõ **quy tắc làm tròn số tấm**."

### (g) **HAO HỤT: tài liệu KHÔNG nói gì**
Không tìm thấy bất kỳ định mức hao hụt / phế liệu nào trong `quy-trinh-van-ban.md`,
`SALES-BOM-SOURCE-MAP.md`, `BANG-GIA-CHINH-THUC-31-07-2026.md` hay brief. Thứ gần nhất là
trạng thái tồn nhôm: *"`PHẾ` nếu khổ nhỏ hơn `0.15`"* (`SALES-BOM-SOURCE-MAP.md:237`) — nhưng đó
là **phân loại đầu mẩu dư**, không phải % hao hụt định mức. ⇒ câu hỏi **B4** bên dưới.
**Không được bịa số hao hụt.**

## B7. KHOẢNG CÁCH nghiệp vụ ↔ code (sản phẩm chính phần B)

| # | Tài liệu yêu cầu | Code hiện có | Khoảng cách |
|---|---|---|---|
| G1 | Mọi mã cửa bán ra đều phải có định mức để trừ vật tư (`quy-trinh-van-ban.md:42` *"Từ phiếu xuất kho sẽ cập nhật công nợ lên sổ chi tiết và trừ định mức vật tư"*) | engine đủ, nhưng **0 `BOM Template`, 226/227 mã bán không BOM** | **Toàn bộ định mức chưa được nhập.** Đây là khoảng cách lớn nhất. |
| G2 | Có 5 mẫu BOM đã chuẩn hoá từ sheet ĐM (chỉ cửa Úc kéo tay) | nằm trong brief, **chưa forge**, và **35/35 mã hàng trỏ tới đều không tồn tại** | Phải ánh xạ lại mã rồi mới forge. **4/5 nhóm sản xuất (Đức, Đài Loan, Lưới, Siêu Trường) chưa có mẫu nào.** |
| G3 | Công thức số lá Đức `((CPB-0.13)/bản lá)-1`, làm tròn mốc **0.6** | engine hỗ trợ `QUOTIENT` + `rounding` với `NONE/ROUND/CEIL/FLOOR` (`bom-template-core.ts:5`) | **Không có kiểu làm tròn "ngưỡng 0.6"**, cũng không có "làm tròn về mốc 0/0.3/0.7/1" của cửa Úc. Cần thêm rounding mode, hoặc chủ xưởng đồng ý quy về `FLOOR`/`ROUND`. |
| G4 | Bản lá là thuộc tính của **mã nhôm** (23 giá trị) | không thấy trường `bản lá` trên `Item` (khóa `Item` trong D1 không có) | Chưa có nơi lưu bản lá ⇒ công thức số lá không có số để chia. |
| G5 | Rộng cắt lá phụ thuộc **loại cửa × loại ray × đại lý/khách lẻ** | `Cutting Policy` có 5 bản ghi trong D1; `Geometry Profile` 5, `Geometry Field` 11 | Có chỗ cắm, **chưa đối chiếu đủ 5 loại cửa × 2 nhánh ray × 2 nhóm khách**. Chưa kiểm trong phiên này. |
| G6 | `trọn bộ / tách món / chỉ lá` quyết định **phạm vi cấu phần** | `BOM Template.conditions` có gộp `sales_mode` (`bom-template-materializer.ts:204`) | Cơ chế có. Nhưng đợt gộp mã cảnh báo: gộp `TRONBO`/`TACHMON` vào một mã là **mất phần trọn bộ** (`ALUMDOOR-ANH-XA-MA-HANG-20260819.md`, mục "CHƯA ĐƯỢC GỘP"). Chưa quyết. |
| G7 | Cấu phần "trừ thực tế" (lò xo, puly, vít) | `BOM Actual` + allowlist — **đúng thiết kế** | Không có khoảng cách về cơ chế. Nhưng allowlist trỏ vào mã chết (xem G2). |
| G8 | `BOM Template` phải sửa được khi xưởng đổi định mức | **không có menu, không có editor** | **Chủ xưởng không có đường nào tự sửa định mức.** Cần quyết: cho sửa tay hay giữ chỉ-máy-sinh. |
| G9 | Hao hụt nhôm | không có trường, không có luật | Tài liệu cũng không nói ⇒ **phải hỏi**, không được đoán. |

## B8. Đã sửa gì trong phiên này (phần B)

**Không sửa gì.** Lý do: mọi thứ "sửa được an toàn" mà tôi tìm thấy đều đã đúng sẵn —
`AlumdoorBomRuleEditor` đã được render, `AlumdoorBomActualEditor` đã được render 3 nơi,
`alumdoor.sales.preview_bom_requirements` đã đăng ký và đã có 2 màn gọi. Phần còn lại
(engine sinh BOM cho Đức/Đài Loan/Lưới/Siêu Trường, ánh xạ 35 mã, mốc làm tròn 0.6, hao hụt)
là **quyết định nghiệp vụ**, không phải việc của agent.

---

# PHẦN C — BẢNG TRỐNG ĐỂ CHỦ XƯỞNG ĐIỀN

## C1. Ngưỡng UPS — bảng đầy đủ (điền cả những dòng đang thiếu)

| Mã UPS (chọn 1 trong 2 cột dưới) | Dùng cho motor tới bao nhiêu KG | Dung lượng (AH) | Giá bán | Ghi chú |
|---|---|---|---|---|
| `LKMT_UPS_ALE800` **hoặc** `BLD_UPS_E800I` | ……… kg | 9 AH | 1.800.000 | bảng giá 31/07 ghi "motor <600KG" |
| `LKMT_UPS_ALE1000` **hoặc** `BLD_UPS_E1000I` | ……… kg | 12 AH | 2.700.000 | bảng giá 31/07 ghi "motor <1000KG" |
| `BLD_UPS_YH1000` | ……… kg | ……… | ……… | **chưa có ngưỡng ở đâu cả** |
| `BLD_UPS_YH2000` | ……… kg | ……… | ……… | **chưa có ngưỡng ở đâu cả** |

## C2. Ngưỡng MOTOR còn thiếu (15/32 mã đã có, 17 mã chưa)

| Mã motor | Diện tích cửa dùng được (m²) | Gồm (lắc mấy?) | Giá |
|---|---|---|---|
| `MT_TANKER1000KG` | < ……… | ……… | ……… |
| `MT_JG500KG` | < ……… | ……… | ……… |
| `MT_YHTAIWAN_CH_300KG` | < ……… | ……… | ……… |
| `MT_YHTAIWAN_CH_400KG` | < ……… | ……… | ……… |
| `MT_YHTAIWAN_CH_500KG` | < ……… | ……… | ……… |
| `MT_YHTAIWAN_CH_600KG` | < ……… | ……… | ……… |
| `MT_YHTAIWAN_CH_700KG` | < ……… | ……… | ……… |
| `MT_YHTAIWAN_CH_800KG` | < ……… | ……… | ……… |
| `MT_YHTAIWAN_CH_1000KG` | < ……… | ……… | ……… |
| `LKMT_BOSTEC_DON_T` / `_DON_P` (motor đơn) | < ……… (bảng giá §2 ghi <12m²?) | ……… | 3.300.000? |
| `LKMT_BOSTEC_DOI_T` / `_DOI_P` (motor đôi) | < ……… (bảng giá §2 ghi <22m²?) | ……… | 3.800.000? |
| `LKMT_CHTAIWAN_DON_T` / `_DON_P` | < ……… (<12m²?) | ……… | 4.950.000? |
| `LKMT_CHTAIWAN_DOI_T` / `_DOI_P` | < ……… (<22m²?) | ……… | 5.300.000? |

## C3. Quy tắc BOM — bản lá theo mã nhôm (xác nhận / sửa)

| Mã nhôm | Bản lá (m) trong tài liệu | Đúng? (Đ/S) | Sửa thành |
|---|---:|---|---|
| AL71C | 0.055 | | |
| AL71N | 0.057 | | ⚠ nguồn có 2 giá trị khác nhau |
| AL70 | 0.068 | | |
| AL75N | 0.067 | | |
| AL75C | 0.068 | | |
| AL503C | 0.050 | | |
| AL503N | 0.055 | | |
| AL548C | 0.050 | | |
| AL548N | 0.055 | | |
| AL501C | 0.050 | | |
| AL501N | 0.057 | | |
| AL552C | 0.050 | | |
| AL552N | 0.057 | | |
| AL595 | 0.060 | | |
| AL652C | 0.050 | | |
| AL752C | 0.050 | | |
| AL50C | 0.050 | | |
| AL50N | 0.055 | | |
| ALVIP50C | 0.050 | | |
| ALVIP50N | 0.055 | | |
| VIPST500N | 0.053 | | |
| VIPST500C | 0.050 | | |
| VIPST700 | 0.050 | | |

## C4. Quy tắc BOM — hệ số cân nặng cửa Úc (điền CÁCH NHÂN, không chỉ hệ số)

| Cấu phần | Hệ số nguồn | Nhân với cái gì? (viết đủ công thức) | Đơn vị ra |
|---|---|---|---|
| `LEAF_SHEET` (tôn lá) | 4,4 KG/M² | ví dụ `4,4 × (Cao PB × Rộng cắt lá)` ? → ……… | Kg |
| `SPIKE_PULLEY_WEIGHT` (puly gai) | 0,126 | ……… | Kg |
| `BOTTOM_BAR_WEIGHT` (v đáy) | 0,6 | ……… | Kg |
| `RAY_U70_WEIGHT` (ray U70) | 1,78 | `(Cao PB − 0,1) × số cây × 1,78` ? → ……… | Kg |
| `SHAFT_34_WEIGHT` (trục 34) | 1,7 | `(Rộng + 0,4) × 1,7` ? → ……… | Kg |
| `FOAM_45CM` (xốp 45) | — | `(Rộng ÷ 0,45) × 2`, **làm tròn LÊN hay XUỐNG?** → ……… | tấm |

## C5. Quy tắc BOM — hao hụt (tài liệu KHÔNG có, bắt buộc chủ xưởng cho số)

| Loại vật tư | Hao hụt định mức (%) | Hay tính theo cách khác? |
|---|---:|---|
| Nhôm lá (tôn cuộn) | ……… % | |
| Ray sắt / ray nhôm | ……… % | |
| Trục | ……… % | |
| Sơn tĩnh điện | ……… % | |
| Phụ kiện (bọ, vít, ron) | ……… % | |
| Lưới | ……… % | |

## C6. Ánh xạ 35 mã hàng của 5 mẫu BOM cửa Úc (chủ xưởng chỉ mã thật)

| Mã trong mẫu BOM | Là cái gì | Mã thật trong danh mục hiện nay |
|---|---|---|
| `CUA-UC-KT-4D` | cửa Úc kéo tay 4D (thành phẩm) | ……… |
| `TP-UC-KT-4.6D-XN-VK` | cửa Úc KT 4.6D xanh ngọc–vàng kem | ……… |
| `TP-UC-KT-4.6D-XR-CF` | cửa Úc KT 4.6D xanh rêu–café | ……… |
| `TP-UC-KT-4.6D-TRẮNG-XLC` | cửa Úc KT 4.6D trắng–xám lông chuột | ……… |
| `TP-UC-KT-4.6D-KU-GU` | cửa Úc KT 4.6D kem Úc–ghi Úc | ……… |
| `NVL-TOLE0.42x598-XN-VK` | tôn 0.42×598 XN-VK | ……… |
| `NVL-TOLE1.2x190-KRON` | tôn ray U70 1.2×190 không ron | ……… |
| `NVL-TRUC34` | trục 34 | ……… |
| `NVL-PULYUC34` | puly Úc 34 | ……… |
| `NVL-PULYGAI` | puly gai | ……… |
| `NVL-XOP-N45` | xốp N45 | ……… |
| `NVL-RONDAYUC` | ron đáy Úc | ……… |
| `NVL-VDAY-TDU` | v đáy | ……… |
| `NVL-VAIHAMXO` | vai hãm lò xo | ……… |
| `NVL-VISDD-BANLO` | vít đầu dù bản lề | ……… |
| `NVL-VIS-BANLO2P` | vít bản lề 2 phần | ……… |
| `NVL-INOX` / `NVL-NHUA` / `NVL-MOC` | 3 loại cần kéo | ……… / ……… / ……… |
| `NVL-BKAN` / `NVL-CHNHUA` / `NVL-GIAT` / `NVL-GOIFE` | bạc đạn / chặn nhựa / giá T / gối FE | ……… |
| `NVL-TON3.8D-XN-VK` | tôn 3.8D XN-VK | ……… |
| 8 mã lò xo `NVL-LX-…` / `NVL-LV-…` | lò xo theo quy cách | ……… (8 mã) |

---

# PHẦN D — CÂU HỎI CHO CHỦ XƯỞNG (trả lời bằng 1 câu hoặc 1 con số)

**Về UPS / motor**

- **U1.** Bảng giá ghi *ALUMAX UPS E-800KG dùng cho "motor <600KG"* — tên mã 800 mà ngưỡng 600.
  Đúng là **600 kg** hay phải là **800 kg**?
- **U2.** Bình lưu điện bán ra dùng mã nào: **`LKMT_UPS_ALE800`** (nhóm *Linh kiện motor*) hay
  **`BLD_UPS_E800I`** (nhóm *Bình lưu điện*)? Hai mã đang trùng tên thương mại.
- **U3.** `BLD_UPS_YH1000` và `BLD_UPS_YH2000` kéo được motor tới bao nhiêu kg?
- **U4.** Motor **YH Taiwan CH**, **Bostech**, **JG 500KG**, **Tanker 1000KG** dùng cho cửa tới
  bao nhiêu m²? (bảng giá 31/07 §6 không có 17 mã này)
- **U5.** Khi cửa vượt mọi ngưỡng (ví dụ 60 m²), app nên **báo không có motor phù hợp** hay
  **gợi ý motor lớn nhất**?
- **U6.** Có phải **mọi cửa dùng motor đều nên kèm UPS**, hay chỉ khi khách yêu cầu?
- **U7.** 56 luật giá "không lấy lắc / không lấy bộ điều khiển" đang TẮT. Có muốn thêm **2 ô tick
  trên dòng bán** ("không lấy lắc", "không lấy bộ ĐK") để bật chúng lên không? (Đ/K)

**Về BOM**

- **B1.** Chủ xưởng có muốn **tự sửa định mức (`BOM Template`) trên màn hình** không, hay để
  máy sinh và chỉ sửa qua danh mục `Quy tắc BOM` đang có? (chọn 1)
- **B2.** Công thức số lá Đức làm tròn ở mốc **0.6** — áp cho **mọi mã cửa Đức**, hay chỉ một số mã?
- **B3.** Cửa Úc làm tròn về mốc **0 / 0.3 / 0.7 / 1** — mô tả lại bằng một câu cho chắc:
  ví dụ "phần lẻ ≤0.15 → 0; 0.16–0.5 → 0.3; 0.51–0.85 → 0.7; >0.85 → 1"?
- **B4.** **Hao hụt** nhôm/tôn khi cắt là bao nhiêu **%**? (nếu xưởng không tính hao hụt thì
  trả lời "không tính" — app sẽ không cộng gì)
- **B5.** Hệ số **4,4 KG/M²** của tôn lá cửa Úc nhân với **diện tích phủ bì** hay **diện tích cắt lá**?
- **B6.** Xốp 45cm: `(Rộng ÷ 0,45) × 2` — làm tròn **LÊN** hay **XUỐNG** số tấm?
- **B7.** Nên làm định mức cho nhóm nào **trước**: Đức / Úc / Đài Loan / Lưới / Siêu Trường?
  (hiện chỉ có 5 mẫu cửa Úc kéo tay, và cả 5 đang trỏ vào mã hàng đã bị đổi)
- **B8.** Cửa **trọn bộ** và **tách món** có nên là **hai mã hàng riêng**, hay **một mã + ô chọn
  cách bán**? (quyết định này chặn việc gộp mã và chặn cả BOM)
- **B9.** Khách chỉ đặt **lá ruột** (không lấy lá đầu / 3 lá đáy) — câu hỏi bỏ ngỏ trong chính
  tài liệu quy trình (`quy-trinh-van-ban.md:140`, nhắc lại ở `SALES-BOM-SOURCE-MAP.md:253`). Đơn sản xuất khi đó xử lý thế nào?

---

# PHẦN E — Việc cần làm, theo thứ tự

| # | Việc | Ai làm | Cần forge? |
|---|---|---|---|
| 1 | Sửa 500 lỗi backend (`Custom field color collides… on Batch`) | agent khác đang làm | — |
| 2 | Sửa `item_code` của 17 fixture `Ngưỡng chọn Motor` theo bảng A4 | người sở hữu `alumdoor-v2.json` | ✅ **cần `node scripts/forge-app.mjs`** |
| 3 | Chèn `AlumdoorMotorSuggestPanel` vào màn bán hàng theo A7 (3 sửa đổi) | người sở hữu `sales-order-v2/*` | ❌ Vite hot-reload |
| 4 | Chủ xưởng điền C1–C2 → thêm 17 dòng `Ngưỡng chọn Motor` | chủ xưởng (danh mục đã có trên menu) | ❌ nhập tay được |
| 5 | Chủ xưởng điền C6 → sửa 35 mã trong 5 fixture `BOM Template` | chủ xưởng + dev | ✅ cần forge |
| 6 | Thêm mục menu + editor cho `BOM Template` (sau khi trả lời B1) | dev | ✅ cần forge (navigation) |
| 7 | Bổ sung rounding mode cho mốc 0.6 (Đức) và 0/0.3/0.7/1 (Úc) sau khi có B2/B3 | dev | ❌ code |
| 8 | Thêm trường **bản lá** lên `Item` rồi nạp 23 giá trị ở C3 | dev + chủ xưởng | ✅ cần forge |

---

## Phụ lục — file `QUY CÁCH (3).xlsx`

**Không có trong repo thật.** Đã kiểm `C:\alumdoor\nhap\` (chỉ có `DANH-MUC-MAT-HANG.csv/.md`
và các script `.mjs`) và `C:\alumdoor\data\` (`cong-thuc-chia-la.pdf`, `customer-export.xlsx`,
`don-hang-xuat-hang.xlsx`, `sau-hong.xlsx`, `ton-nhom.xlsx`, `trong-luong-nhom.json`) —
**không có file `.xlsx` nào tên gần giống**.

Nhưng **bản trích xuất text của chính file đó ĐÃ CÓ** trong repo:
`apps/alumdoor/docs/nguon/quy-cach/` gồm `CT-TT-SX.md`, `MS.md`, `ĐƠN-GIÁ-TRỌN-BỘ.md`,
và SHA-256 của file gốc được ghi tại `apps/alumdoor/docs/nguon/SALES-BOM-SOURCE-MAP.md:15`
(`37423d7702c9bf44fb3078ae69776c603072367c469a3bb134c0831c65fc1a32`).
⇒ Nếu chủ xưởng gửi lại file, **đối chiếu SHA-256 trước** để biết có phải bản mới hay không.
