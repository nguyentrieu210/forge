# Alumdoor — Audit vòng 2: danh mục theo toàn chuỗi vận hành

*2026-08-20. Vòng 1 đóng tính nhất quán nội bộ của danh mục. Vòng này hỏi: danh mục có đủ để
chạy hết một đơn hàng thật không.*

> **Bản đã đính chính 2026-08-20 (lần 2).** Bốn kết luận của chính vòng này bị lật khi đem đi
> thi hành và đo lại trên nguồn gốc. Mỗi chỗ sửa nằm trong một hộp `⚠️ Đính chính` ngay tại
> đoạn gốc, giữ nguyên câu sai để đối chiếu được:
>
> | § | Bản đầu nói | Đo lại trên nguồn |
> |---|---|---|
> | §1.2 | bước `customer` hỏng vì *"đường ống chưa nối"* | Đường ống ĐÃ nối. `customer-export.xlsx` bị moi ruột còn 1 dòng rác, hash pin vẫn khớp |
> | §2 ĐVT bán | *"cần nạp ~540 hệ số"* | Nguồn chỉ có **31** hệ số. 540 là kích thước lỗ hổng, không phải lượng nguồn cung |
> | §2 Độ dày | hai độ dày *"hệ số 4,4 và 4,7 kg/m"* | Nguồn ghi **cả hai là 4,5**. Bằng chứng thật nằm ở giá, không ở hệ số |
> | §3 thiếu #3 | *"`DANH-MỤC.md` gắn giá theo tên khách"* | Ảo giác bố cục — hai bảng độc lập cạnh nhau trong cùng sheet |
>
> Cả bốn đều cùng một hình dạng lỗi: **đọc bản trích thay vì đọc nguồn**, đúng thứ §0 đặt ra
> để tránh. Lần này mỗi con số đều neo bằng test chạy được.

**Khác biệt lớn nhất so với vòng 1:** vòng này đọc **nguồn gốc** trong `apps/alumdoor/docs/nguon/`,
không đọc bản trích JSON. Bản trích giữ 14 trường; nguồn có tới 55 cột. Ba kết luận của vòng 1
bị lật vì đúng chỗ đó.

---

## 1. Nguồn đã đọc — và những gì chúng lật lại

| Tài liệu | Dòng | Bổ sung gì |
|---|---:|---|
| `ms-lien/DANH-MỤC.md` | 393 | **ĐVT mua và ĐVT bán tách bạch** + hệ số quy đổi |
| `don-hang-xuat-hang/DS-KH-NCC.md` | 451 | 448 đối tác kèm **SĐT + địa chỉ giao hàng** |
| `don-hang-xuat-hang/T3–T7.2026` | ~5.000 | Đơn hàng thật; dòng hàng là **văn xuôi** |
| `ms-lien/CHI-TIẾT-CNO-KH.md` | 452 | Hoá đơn thật: mã, ĐVT, chiều dài, **số sợi** |
| `ms-lien/CHI-TIẾT-SƠN.md` | 86 | **Sơn là gia công THUÊ NGOÀI**, có công thức giá |
| `ms-lien/CỬA-LỖI.md` | 125 | Nhật ký lỗi thật |
| `app-vat-tu/BaoCao.md` | 278 | Danh mục vật tư của app đang chạy |
| `quy-trinh-van-ban.md` | — | Định nghĩa "bộ 3 lá đáy" |

### Ba chỗ vòng 1 kết luận sai

**1. "Ron bán theo mét" — thiếu một nửa.** Hoá đơn thật ghi `"RON INOX + NHỰA 4M X 2 SỢI"`:
bán theo **sợi có chiều dài**, đơn giá tính trên mét. Vòng 1 tra bốn chỗ đều thấy "Mét" nhưng
cả bốn cùng phái sinh từ một bản trích đã cắt cột.

> **Bốn nguồn nhất trí không phải bằng chứng khi chúng cùng một gốc.**

**2. "Bước `customer` thiếu file nguồn" — sai, nhưng lý do cũng chưa đúng.** `DS-KH-NCC.md`
có 448 đối tác.

> ### ⚠️ Đính chính 2026-08-20: không phải "chưa nối", mà là NGUỒN BỊ MOI RUỘT
>
> Đường ống ĐÃ nối — nó chạy, và nó chết. `customer-import-core.mjs` đọc
> `data/customer-export.xlsx`, và file đó chỉ còn:
>
> ```
> dòng 1: Tên khách hàng · Điện thoại · Mã số thuế · Hạn mức công nợ
> dòng 2: "KH tồn 52412"          ← ô TỔNG của bảng tính, không phải tên khách
> ```
>
> Bốn cột, một dòng rác, **không còn cột `Nhóm giá`**. Bộ nhập chờ 369 dòng nên ném
> `canonical_count_mismatch expected=369 actual=1` — lỗi lớp **DATA**, không phải `SOURCE_FILE`.
> Log đó bị đọc thành "thiếu nguồn".
>
> `EXPECTED_SOURCE_SHA256` **vẫn KHỚP**, vì nó đã được cập nhật theo chính bản stub.
>
> > **Pin hash chứng minh file KHÔNG ĐỔI KỂ TỪ LÚC PIN. Nó không chứng minh file CÓ NỘI DUNG.**
>
> ✅ **ĐÃ SỬA** `lib/alumdoor-partner-source.mjs` đọc thẳng `DS-KH-NCC.md`, thêm ngưỡng tối
> thiểu 400 dòng để lần sau nguồn bị cắt thì chết ngay với đúng tên lỗi. Đo được:
>
> ```
> 448 đối tác → 398 khách nạp được · 2 NCC · 34 hoãn · 14 trùng tên
> 322 khai trực tiếp + 76 suy từ lịch sử bán · 394 đại lý · 4 lẻ
> 246 SĐT · 175 địa chỉ · 4 nhân viên phụ trách (gộp từ 7 cách viết)
> ```

**3. "0.101 vs 0.263 kg/m là dữ liệu mâu thuẫn" — không mâu thuẫn.** Định mức của `PK-INOX` cho
thấy đó là **hai vật liệu**: ron nhựa 0,101 và ron inox 0,124. Số 0,263 thuộc cụm mã khác.

---

## 2. Sáu trục thuộc tính — quyết định và bằng chứng

Hiện trạng trên 566 mặt hàng đang dùng:

```
149  mã nhồi MÀU            88  mã nhồi BẬC DIỆN TÍCH
 96  mã nhồi CÁCH BÁN       29  mã nhồi ĐỘ DÀY
```

### Màu / bề mặt → **B: trường trên dòng chứng từ.** Kết luận dứt khoát.

Nền tảng đã hỗ trợ **đủ toàn tuyến**, không thiếu chỗ nào:

```
Purchase Receipt Item .color + .warehouse     ← nhập kho theo màu
Stock Reservation     .color + .warehouse     ← giữ hàng theo màu
Quotation/Sales Order/Delivery Note .color    ← bán theo màu
Bill of Materials / Work Order .color         ← sản xuất theo màu
Paint Job .source_color → .target_color       ← đổi màu
```

Vòng 1 tôi ngờ rằng nhôm khác bề mặt phải là mã riêng vì "nhập kho riêng". Bằng chứng bác bỏ:
tồn kho **đã** phân biệt màu qua `color` trên dòng nhập và dòng giữ. Không cần mã riêng.

→ **149 mã màu gộp về mã gốc.** `NVL-AL595-GS/-VK/-THO` → một mã `NVL-AL595`.

### Cách bán (trọn bộ / tách món) → **B: trường trên dòng**, cột `sales_mode` đã dựng

Đo thật: `TP-LUOI-SN13x26-STD - TRONBO` có BOM **5 cấu phần**, `- TACHMON` có **1**. Đó là hai
phạm vi giao hàng của cùng một mặt hàng, không phải hai mặt hàng. `BOM Template.sales_mode` đã
có, đang trống 0/349.

→ **96 mã gộp**, cách bán chuyển sang dòng bán + `sales_mode` trên template.

### Bậc diện tích → **D: chính sách giá.** `Item Price.area_tier` đã dựng, trống 0/558

Tám mã cho một cửa chỉ vì tám mức giá:

```
TP-CUADL1LY-XN-VK_TRONBO_3-4m²  590.000  →  1 mã + 8 dòng Item Price gắn area_tier
...                          
TP-CUADL1LY-XN-VK_TRONBO>10m²   520.000
```

Bậc là thuộc tính của **dòng giá**, không phải của mặt hàng: cùng một cửa, giá khác theo diện
tích. Cận trên ĐÓNG, cận dưới MỞ (`min < S ≤ max`) — cửa đúng 5,0 m² ăn bậc 4-5.

→ **88 mã gộp.**

### Độ dày → **A: giữ trong mã.** Đây là trường hợp NGƯỢC lại

`TRUC-114-1.8LY` và `TRUC-114-2.1LY` có **giá khác nhau**.

> ### ⚠️ Đính chính 2026-08-20: hệ số quy đổi thì GIỐNG nhau
>
> Bản đầu ghi hai độ dày có hệ số 4,4 và 4,7 kg/m. Nguồn gốc `DANH-MỤC.md` dòng 20 và 21 ghi
> **cả hai là `"TL 4.5KG/M"`** — cùng một chuỗi, không lệch một chữ.
>
> Bằng chứng thật của kết luận "hai vật tư vật lý khác nhau" nằm ở **giá**, không ở hệ số:
> nguồn ghi 180.000 và 200.000/m (bản đầu ghi 170.000/190.000 — cũng lệch, nhưng chiều kết
> luận không đổi).
>
> **Kết luận A — giữ trong mã — VẪN ĐÚNG**, chỉ là lý do phải đổi: hai độ dày mua riêng, tồn
> riêng, giá riêng. Không phải vì hệ số khác nhau. Hai độ dày là hai vật tư vật lý khác nhau, mua riêng, tồn
riêng. Giữ nguyên 29 mã.

> Trục này chứng minh luật "rút hết thuộc tính khỏi mã" là **sai nếu áp máy móc**. Tiêu chí
> đúng: thuộc tính có làm đổi **thứ nằm trong kho** không.

### Quy cách / khẩu độ → **C: DocType riêng, đã có**

`Measurement Profile` (7), `Geometry Profile` (5), `Geometry Field` (9) đã chạy. Không đổi.

### Đơn vị bán (sợi / cây / cặp) → **B: trường trên dòng, CẦN THÊM**

Đây là trục vòng 1 bỏ sót hoàn toàn. `DANH-MỤC.md` cho thấy **16/31 bản ghi có ĐVT mua khác
ĐVT bán**:

```
KG → M     7    ron, ray, trục
CÁI → CẶP  3    bọ, bát, bulon    "1 CẶP X 2 CÁI"
CON → M2   2    bắn bướm          "57 con/1KG (1m cao x 12 con)"
KG → M2    2
KG → CẶP   2
```

Nhưng `uom_conversions` chỉ có ở **20/566** mặt hàng. Hệ số nằm sẵn trong cột GHI CHÚ dưới dạng
văn xuôi: `"91 cái/kg (0.0096kg/cái)"`, `"TL 4.5KG/M"`, `"1 cặp x 6 tán"`.

→ Không gộp mã. Nhưng **con số "~540" ở đây là sai vai** — xem hộp dưới.

> ### ⚠️ Đính chính 2026-08-20: nguồn không có 540 hệ số để cho
>
> Bản đầu của vòng này viết *"phải nạp hệ số quy đổi cho ~540 mặt hàng"* và §6 đợt A chép
> lại thành *"`DANH-MỤC.md` → `uom_conversions` cho ~540 mặt hàng"*.
>
> Đếm thật bằng `server/scripts/extract-alumdoor-danh-muc-source.mjs`:
>
> ```
> DANH-MỤC.md bảng sản phẩm    63 dòng   (không phải 540)
>   có GHI CHÚ                 20 dòng
>   hệ số đọc ra được          19
>   ĐVT mua khác ĐVT bán       16   ← con số này của bản gốc thì ĐÚNG
> ```
>
> Số 540 đến từ §5.3 — *"`uom_conversions` chỉ có ở 20/566 mặt hàng"* — tức **kích thước lỗ
> hổng**, không phải **lượng nguồn cung cấp**. Hai đại lượng khác nhau bị dùng lẫn, và kế
> hoạch thi hành thừa hưởng chỗ lẫn đó.
>
> Tổng cung thật của cả ba nguồn có hệ số (`build-alumdoor-uom-conversion-catalog.mjs`):
>
> ```
> ms-lien/DANH-MỤC.md cột GHI CHÚ            19 hệ số
> data/trong-luong-nhom.json (đã khớp mã)    12 hệ số   (28 bản ghi còn chờ khớp mã)
> ─────────────────────────────────────────────────────
> TỔNG                                       31 hệ số
>
> BANG-GIA-CHINH-THUC §1 "TL kg/m² ±8%"      15 mã  ← KHÔNG phải quy đổi ĐVT.
>                                                     Cửa tồn theo Bộ, không tồn theo Kg.
>                                                     Đây là barem mua, dung sai ±8%.
> ```
>
> **31, không phải 540.** Phần còn lại không có đường nạp tự động: phải hỏi xưởng hoặc suy
> từ quy cách. Dòng cuối nguồn ghi thẳng `"TẤT CẢ QUY VỀ SỐ M, MỖI LẦN NHẬP 1M=?KG"` — chính
> xưởng cũng chưa biết.
>
> Neo bằng test: `server/tests/alumdoor-danh-muc-source.test.mjs`.

Và dòng bán cần ô **số sợi × chiều dài** cho hàng theo cây.

### Tổng kết

| Trục | Quyết định | Mã trước → sau |
|---|---|---:|
| Màu / bề mặt | B — dòng chứng từ | 149 → gộp |
| Cách bán | B — `sales_mode` | 96 → gộp |
| Bậc diện tích | D — `area_tier` | 88 → gộp |
| Độ dày | **A — giữ** | 29 → 29 |
| Quy cách | C — đã có | 0 |
| ĐVT bán | B — cần thêm | 0 gộp; nguồn CHỈ CÓ 31 hệ số, không phải 540 |

**Không cần DocType mới nào.** Mọi trục đều có chỗ nhận sẵn; việc còn lại là chuyển dữ liệu.

---

## 3. Chính sách giá — bản kiểm kê đầy đủ

### Đang có và chạy được

| Cơ chế | Trạng thái |
|---|---|
| `Price List` → `Item Price` | 558 dòng, chạy |
| `price_variant` | 227 dòng biến thể |
| `Pricing Rule` + `exclusive_group` | 83 chính sách |
| `adjustment_basis` | FIXED · AREA_SQM · LENGTH_M · SET_COUNT · PRICED_QTY |
| `Pricing Scope` | 4 phạm vi |
| `Bậc diện tích` | 8 bậc — **chưa dòng giá nào dùng** |

### Biến thể giá đã liệt kê đủ

```
ALUMDOOR_MOTOR_LAC36              motor kèm lắc 36
ALUMDOOR_MOTOR_NO_LAC             "K LẮC" trên đơn hàng thật
ALUMDOOR_MOTOR_NO_CONTROLLER      không bộ điều khiển
ALUMDOOR_MOTOR_NO_CONTROLLER_NO_LAC
ALUMDOOR_HAND_PULL_CONVERSION     đổi sang kéo tay
ALUMDOOR_RAY_SON_MSK              ray sơn
ALUMDOOR_V5_STD
ALUMDOOR_*_ACCESSORY_UNDER_3M/5M  phụ kiện theo chiều dài
```

Đơn hàng thật ghi biến thể bằng **văn xuôi trong ô mô tả**: `"MOTOR ALUMAX 400KG X 1 BỘ ( K LẮC )"`.

### THIẾU — chưa có chỗ nào nhận

**1. Giá gia công sơn thuê ngoài.** `CHI-TIẾT-SƠN.md` cho thấy sơn thuê NCC (`HẢI KỲ`), đơn giá
theo loại cửa kèm **công thức riêng**:

```
Cửa ĐỨC   6.500   "RCL X SỐ LÁ X SỐ LỚP"
Cửa ÚC   50.000   "CAO X RCL X 2 MẶT"
```

`Paint Job` hiện có `source_color → target_color`, `planned_on`, `kcs_by` — mô hình **sơn nội
bộ**. Không có nhà cung cấp, không đơn giá, không công thức. **0 bản ghi.**

**2. Phụ thu đang bị khai thành MÃ HÀNG.** `PHUTHU_SONRAY_MSK` là một `Item`. Phụ thu sơn vân gỗ
360.000/m², phụ vận chuyển 300.000/bộ cho cửa < 8 m², "tặng ray" cho cửa ≥ 8 m² — đều là chính
sách giá, không phải mặt hàng.

**3.** ~~**Giá theo từng khách.** `DANH-MỤC.md` gắn giá theo tên khách hàng cụ thể.~~

> ### ⚠️ Đính chính 2026-08-20: đây là ẢO GIÁC BỐ CỤC, không phải chính sách giá
>
> Sheet `DANH MỤC` chứa **hai bảng độc lập nằm cạnh nhau**, không liên quan gì nhau:
>
> ```
> dòng 2 | [0] MST · [1] NCC/TÊN KH · [2] NGƯỜI PHỤ TRÁCH · [3] KH/NCC · [5] DANH MỤC SẢN PHẨM
> dòng 3 | [1] AN KHANG WINDOW · [2] LƯ CHÍ CƯỜNG · [3] KH · [5] NGÀY GIÁ · [6] MÃ XUẤT · …
> dòng 4 | [1] ANH HIẾU CẦN THƠ · … · [6] BẮN BƯỚM INOX · [8] 7000.0 · [9] CON · …
>          └──── bảng ĐỐI TÁC (cột 0-3) ────┘  └──── bảng SẢN PHẨM (cột 5-14) ────┘
> ```
>
> Dòng 3 vừa là **dữ liệu đầu tiên** của bảng đối tác, vừa là **tiêu đề** của bảng sản phẩm.
> Từ dòng 4 hai bảng chạy song song, mỗi bảng một nhịp. `ANH HIẾU CẦN THƠ` **không mua**
> `BẮN BƯỚM INOX` — chúng chỉ tình cờ cùng số dòng trong bảng tính.
>
> Bảng đối tác chạy hết 388 dòng; bảng sản phẩm dừng ở dòng 69. Nếu hai bảng là một thì hai
> mảng phải dài bằng nhau — test `alumdoor-danh-muc-source.test.mjs` neo đúng điều kiện đó.
>
> Cùng loại lỗi §0 cảnh báo: kết luận rút từ **hình dạng bản trích**, không từ nguồn.
>
> **Nguồn không nói gì về giá theo khách.** Nhu cầu đó có thể vẫn có thật, nhưng phải hỏi
> xưởng, không suy ra từ file này.

Ghi nhận kỹ thuật vẫn đúng: `Pricing Scope` hiện chỉ nhận thành viên `Item`/`Item Group`
(`commercial-policy.ts` `scopeIncludes`), không có nhánh khách hàng. Phạm vi theo khách nằm
trực tiếp trên `Pricing Rule` qua `party_type` · `party` · `customer_group`.

**4. Giá vốn.** `DANH-MỤC.md` có cột GIÁ VỐN riêng, khác GIÁ NHẬP. Chưa rõ hệ tính từ đâu.

---

## 4. Ba loại BOM — ranh giới

| | Số | Vai trò |
|---|---:|---|
| `Bill of Materials` | 234 | Định mức **thật**: cấu phần + số lượng. 1.279 dòng, **921 chờ số lượng** |
| `BOM Template` | 349 | **Khuôn**: `component_rules` + công thức. 181 sau khi dọn trùng |
| `BOM Rule` | 110 | **Quy tắc tính lượng** + `applicability` |

**Quan hệ:** `BOM Rule` (luật) → `BOM Template` (khuôn theo mặt hàng) → `Bill of Materials`
(bản chốt cho một đơn). Không phải ba bản sao — ba tầng trừu tượng.

**BOM bán hàng vs sản xuất:** cùng một bản, khác **phạm vi giao** — `sales_mode`. Trọn bộ 5 cấu
phần, tách món 1. Không cần tách hai doctype.

**Ai sinh:** `generated_by_configurator` phân biệt máy sinh với người lập. Máy sinh thì sửa tay
sẽ bị đè ở lần sinh sau.

**921 dòng PENDING** chờ số lượng vì công thức cần hình học của đơn cụ thể (`quantity_formula_json`)
— chúng đúng ra phải chờ, không phải lỗi.

**129 định mức lệch `qty_basis`:** payload tính `"Theo chiều dài"`, D1 giữ `"Cố định"`. Bộ nhập
cố ý không đè giá trị cũ. Payload mới đúng hơn — công thức nay tính được vì cấu phần đã tra ra
được mặt hàng.

**Công thức nằm rải ba chỗ:** `Cutting Policy` (8 bản ghi, chia lá), `BOM Rule.formula_json`,
và mã nguồn worker (`door-formulas.ts`). Đây là chỗ dễ trôi dạt nhất.

---

## 5. 360 độ — danh mục theo từng mắt xích

### 5.1 Mua hàng — **hụt nặng nhất**

| Cần | Có | Trạng thái |
|---|---|---|
| Nhà cung cấp | `Supplier` | 24 — nguồn có 448 đối tác |
| Mã hàng theo NCC | `Supplier Item` | **RỖNG** — đã ẩn khỏi menu |
| Giá nhập + ĐVT nhập | — | **THIẾU HẲN**; `DANH-MỤC.md` có sẵn |
| Hệ số quy đổi nhập→tồn | `uom_conversions` | **20/566** |
| Công nợ NCC | — | `CNO-NCC.md` chưa đọc |

`DANH-MỤC.md` có đủ MÃ NHẬP · GIÁ NHẬP · ĐVT · NCC cho từng mã. Đường ống chưa đọc.

### 5.2 Bán hàng

| Cần | Trạng thái |
|---|---|
| Khách hàng | 440 ✓ |
| Nhóm giá | ✓ |
| Bảng giá + bậc + biến thể | ✓ nhưng `area_tier` trống |
| Màu trên dòng | ✓ — mới 8 dòng dùng |
| **Địa chỉ giao lắp** | **RỖNG** — nguồn có 448 địa chỉ |
| Người phụ trách | nguồn có, chưa nối |
| Hạn mức công nợ | `customer-export.xlsx` có cột, file chỉ 1 dòng |

### 5.3 Kho — **chưa chạy lần nào**

```
stock_ledger_entries              0 dòng
sales_order_fulfillment_entries   0
purchase_order_progress_entries   0
stock_bundle_usage_entries        0
```

8 kho đã khai (K0 phế · K12/K36 chính · K12-DT/K36-DT đầu thừa). Không có DocType **Lô/Batch**
dù `Purchase Receipt Item` tham chiếu `serial_and_batch_bundle`.

Đầu thừa có kho riêng nhưng chưa có luật ngưỡng nhập lại.

### 5.4 Sản xuất

| Cần | Có |
|---|---|
| Định mức | 234 ✓ |
| Công đoạn / máy | `Operation` 8 · `Workstation` 6 |
| Tiêu chuẩn sản xuất | 6 |
| Chia lá / cắt | `Cutting Policy` 8 ✓ |
| **Sơn** | `Paint Job` **0 bản ghi**, mô hình sai (nội bộ vs thuê ngoài) |
| Nguyên nhân lỗi | 11 ✓ (vòng 1 nối vào `Warranty Claim`) |
| Bảo hành | `Warranty Claim` **0** |
| Lịch sản xuất | `LỊCH-SẢN-XUẤT.md` chưa đọc |

### 5.5 Kế toán

`Account` 189 ✓ · VAT 8% ✓. Chưa đọc: `BCKQKD.md`, `CNO-NCC.md`, `CHI-TIẾT-CNO-KH.md`.
Giá vốn: `DANH-MỤC.md` có cột, hệ chưa rõ tính từ đâu.

---

## 6. Kế hoạch thi hành — theo thứ tự phụ thuộc

**Đợt A — nạp từ nguồn chưa đọc (không lùi được: không; an toàn)**
1. `DANH-MỤC.md` + `trong-luong-nhom.json` → `uom_conversions` (**31 hệ số**, không phải
   540 — xem đính chính §2) + giá nhập + ĐVT nhập.
   ✅ **ĐÃ LÀM** `lib/alumdoor-purchase-catalog.mjs`, chạy trong `build-alumdoor-item-master-payload`.
   Đo trên 587 mặt hàng: khớp 48 mã · 34 giá nhập · 13 Supplier Item · 4 bị chặn có lý do ·
   2 xung đột nguồn.
2. `DANH-MỤC.md` → `Supplier Item` (mã hàng theo NCC)
3. `DS-KH-NCC.md` → `Địa chỉ giao lắp` (448) + người phụ trách + phân loại KH/NCC/KH lẻ

**Đợt B — chuyển thuộc tính ra khỏi mã (KHÔNG LÙI ĐƯỢC)**

Phải làm sau A vì cần hệ số quy đổi để dời tồn.

4. Bậc diện tích: 88 mã → 1 mã + `Item Price.area_tier`
5. Cách bán: 96 mã → `sales_mode`
6. Màu: 149 mã → `color` trên dòng

Mỗi bước: dời giá → dời định mức → dời lịch sử → mới nghỉ hưu mã cũ.

**Đợt C — bổ sung chỗ còn thiếu**
7. Gia công sơn thuê ngoài: NCC + đơn giá + công thức
8. Phụ thu ra khỏi mã hàng (`PHUTHU_SONRAY_MSK`)
9. Giá theo khách trong `Pricing Scope`
10. Lô/Batch cho kho

---

## 7. Câu hỏi còn mở — phân loại

### Suy được từ dữ liệu, chưa làm
- ~~Hệ số quy đổi ~540 mặt hàng~~ → **sai vai, xem đính chính §2.** Nguồn chỉ có 31 hệ số;
  parser đã viết (`lib/alumdoor-uom-conversion-parser.mjs`). 515 mặt hàng còn lại **không có
  nguồn nào để suy** — chuyển sang mục "phải hỏi xưởng".
- Ba lá đáy: **lá yếm · lá trung gian · lá đáy lớn** (đã tìm ra); `LÁ ĐÁY LỚN` = `NHOM-TD325`,
  thiếu 2 mã còn lại
- Phân loại KH/NCC/KH lẻ cho 116 đối tác đang để trống trong nguồn

### Phải hỏi xưởng
- Dòng bán hàng theo cây: nhập **số sợi × chiều dài** hay chỉ nhập mét
- 52 họ gộp và 13 mã quá 24 ký tự
- Sơn thuê ngoài: còn NCC nào ngoài `HẢI KỲ`, bảng giá đầy đủ

### Dữ liệu tự mâu thuẫn
- `Bộ ba lá đáy`: bảng giá chính thức **180.000/m**, danh mục **230.000/m**
- 129 định mức `qty_basis` lệch giữa bản tính lại và bản đã lưu
- 2 định mức mồ côi mang số lượng thật, bản gắn đúng mặt hàng lại để trống

---

## 8. Trả lời câu hỏi tiêu chí

> *"Chạy một đơn hàng thật từ báo giá → đơn → mua vật tư → nhập kho → sản xuất → xuất kho →
> hoá đơn → công nợ, danh mục thiếu chỗ nào?"*

| Mắt xích | Chặn ở đâu |
|---|---|
| Báo giá | Chạy được. Bậc diện tích đang dùng mã hàng thay vì `area_tier` |
| Đơn hàng | Chạy được. Biến thể ghi bằng văn xuôi, chưa vào `price_variant` |
| **Mua vật tư** | **ĐỠ MỘT PHẦN** — 34 giá nhập + 13 `Supplier Item` đã nối từ `DANH-MỤC.md`. Còn lại chưa có nguồn |
| **Nhập kho** | **VẪN CHẶN** — nguồn chỉ cho **31** hệ số quy đổi, không phải 540. 515 mặt hàng còn lại KHÔNG có nguồn nào để suy |
| Sản xuất | Chạy được phần cắt/chia lá. **Sơn thuê ngoài không có chỗ ghi** |
| **Xuất kho** | **CHẶN** — chưa có Lô/Batch; đầu thừa chưa có luật nhập lại |
| Hoá đơn | Chạy được |
| **Công nợ** | Chưa đọc nguồn; giá vốn chưa rõ nguồn tính |

**Ba chỗ chặn cứng: giá nhập · hệ số quy đổi · lô kho.** Cả ba nằm ở mắt xích mua–nhập kho.

> ### ⚠️ Đính chính 2026-08-20: KHÔNG phải cả ba đều có sẵn dữ liệu
>
> Bản đầu kết bằng *"cả ba đều có sẵn dữ liệu trong `DANH-MỤC.md` chưa được nạp"*. Sau khi
> thật sự đọc file đó:
>
> | Chỗ chặn | Nguồn có sẵn? | Trạng thái |
> |---|---|---|
> | Giá nhập | **CÓ** — 51 dòng trong `DANH-MỤC.md` | ✅ đã nạp 34 (phần còn lại không khớp được mã) |
> | Hệ số quy đổi | **CHỈ 31/546** | ⚠️ đã nạp phần có; 515 mặt hàng **không có nguồn** |
> | Lô kho | **KHÔNG** — không có DocType Lô/Batch | ❌ chưa động tới |
>
> Chỗ chặn thật sự lớn nhất không phải "chưa nạp" mà là **chưa có dữ liệu để nạp**. Đó là câu
> hỏi cho xưởng, không phải việc cho máy.
