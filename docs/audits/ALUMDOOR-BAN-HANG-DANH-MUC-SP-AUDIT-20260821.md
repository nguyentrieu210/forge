# AUDIT MÀN BÁN HÀNG & DANH MỤC SẢN PHẨM — ALUMDOOR

**Ngày:** 21/08/2026 · **Phạm vi:** `client/packages/vertical-alumdoor/src/sales-order-v2/*`, `sales-item-search.ts`, `workspace-extension.tsx`, engine giá `clouderp-pricing` / `clouderp-selling`, worker `alumdoor-worker`, DocType `Item` / `Item Price` / `Bậc diện tích` / `Pricing Rule` và **dữ liệu thật trong D1 đang chạy**.
**Kiểu audit:** CHỈ ĐỌC. Không sửa file nào.

**Nguồn bằng chứng**
- Mã nguồn thật trên `C:\alumdoor` (đọc qua device, không dùng bản copy trong container).
- D1 đang chạy: `server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06f….sqlite` (sửa lần cuối 21/08/2026 17:07) — 404 mặt hàng, 304 dòng giá, 89 luật giá, 35 đơn hàng.
- **Gọi sống API `metaforge.api.preview_sales_commercial_line`** trên backend đang chạy (`localhost:5173` → `127.0.0.1:8799`, user `dev@example.com`) đúng kịch bản chủ xưởng đang dùng.
- Đơn thật `DH-2026-0068` (KH **ANH MINH TUẤN**, nhóm **Đại lý**, bảng giá **Alumdoor 2026**) đã lưu trong D1 lúc 21/08 12:49.

> **Lưu ý số dòng:** ba agent khác đang sửa các file client cùng lúc trong hôm nay. Số dòng ở phần client là tại thời điểm 21/08 ~17:30; số dòng phần server ổn định hơn.

---

## TỔNG KẾT

| Hạng | Số finding |
|---|---|
| **P0** — sai tiền / mất dữ liệu / chặn nghiệp vụ | **4** |
| **P1** — tính năng hỏng hoặc thiếu hẳn | **7** |
| **P2** — khó dùng, gây rối, thừa | **10** |
| **Tổng** | **21** |

Ngoài ra có **4 ghi chú BỔ SUNG** cho các mục 3 agent kia đang sửa (đánh dấu rõ, không tính vào 21).

**Ba câu tóm gọn cho chủ xưởng:**
1. Cửa Đức đang bị **trừ chiết khấu hai lần** — mỗi bộ cửa 3×3 m bán cho đại lý hụt **1.850.850 đ** (17,6%). Đã xác nhận sống trên máy chủ đang chạy.
2. Khách **Lẻ cũng tự động được giá đại lý** (trừ 15%), và **ray tặng vẫn được cấp khi bán giá "chỉ lá"**.
3. **Cửa Đài Loan ≤ 3,0 m² và cửa Úc ≤ 4,0 m² không ra được giá** — dòng chết ngay khi chọn hàng, và thông báo lỗi chỉ người bán đi sửa nhầm chỗ.

---

# PHẦN A — P0 (SAI TIỀN)

## A1 · Cửa Đức bị trừ chiết khấu HAI LẦN — hụt ~17,6% mỗi bộ  ★ nghiêm trọng nhất

**Hiện trạng.** Có hai cơ chế chiết khấu 15% cùng chạy trên một dòng cửa Đức:
- Một mức **15% cứng trong mã nguồn** (`defaultAlumdoorDiscountPercent`) — cứ `door_type = "Cửa Đức"` là 15%.
- Một **luật giá trong Danh mục** tên `Chiết khấu đại lý 15% — <mã>` (18 luật), khai kiểu **ADJUSTMENT (phụ thu) âm** theo m², ví dụ `-205.650 đ/m²` cho `CDUC_TD_AL501N`.

Engine giá cộng cả hai: `net = gross − chiết_khấu − phụ_thu_âm`.

**Bằng chứng.**

1) Gọi sống API, đúng kịch bản chủ xưởng (CDUC_TD_AL501N, 3×3 m = 9 m², 1 bộ, nhóm Đại lý, bảng giá Alumdoor 2026, mã giá CHI_LA):

```
gross            = 12.339.000      (1.371.000 đ/m² × 9)
discount_amount  =  1.850.850      ← 15% cứng trong code
adjustment_amount= -1.850.850      ← luật "Chiết khấu đại lý 15% — AL501N"
net_before_tax   =  8.637.300      ← ĐÚNG PHẢI LÀ 10.488.150
pricing_rule_snapshots:
  "Chiết khấu đại lý 15% — AL501N / ADJUSTMENT / -1850850"
  "ALUMDOOR-PR:DUC-DISCOUNT-15   / DISCOUNT_PERCENT / 15"
```

2) Đơn thật đã lưu `DH-2026-0068` (ANH MINH TUẤN, Đại lý, CDUC_TD_AL71N) mang đúng hai snapshot đó: `discount_amount = 59.129.704.350` và `Chiết khấu đại lý 15% — AL71 / amount_minor = -59.129.704.350` — **hai con số bằng nhau y hệt, trừ hai lần**.

3) Mã nguồn:
- `server/packages/clouderp-selling/src/controllers.ts:330-338` — `defaultAlumdoorDiscountPercent()` trả 15 cho `door_type = "Cửa Đức"` (và cho `item_group = "Cửa CN Đức"` ở chế độ m²).
- `server/packages/frappe-api/src/alumdoor-commercial.ts:158-160` — đường **xem trước** đưa mức 15% đó vào `discountPercentageOverride`.
- `server/packages/clouderp-selling/src/commercial-sales-order-controller.ts:133-135` — đường **lưu đơn** làm y hệt.
- `server/packages/clouderp-pricing/src/commercial-policy.ts:141-176` — luật ADJUSTMENT âm được cộng riêng, không biết gì về mức 15% kia.
- Ghi chú trong chính dòng giá (`Item Price`) xác nhận ý định của danh mục: *"Chiết khấu đại lý = 15% × giá CHỈ LÁ = 205.650 đ/m², trừ cho cả hai biến thể."* → chỉ được trừ **một lần**.

**Vì sao là vấn đề.** Mỗi bộ cửa Đức 9 m² bán cho đại lý đang thất thu **1.850.850 đ**. Với 15 mã cửa Đức và 251/256 khách là đại lý, đây là khoản lỗ chạy trên gần như mọi đơn cửa Đức. Số đã lưu trong đơn, đã vào tổng phải thu, và người bán không có cách nào nhìn ra vì màn hình gọi một cái là "Chiết khấu", cái kia là "Phụ thu".

**Đề xuất.** Chọn **một** nguồn sự thật. Khuyến nghị: bỏ hẳn mức 15% cứng trong code (`defaultAlumdoorDiscountPercent` trả 0), giữ luật trong Danh mục — vì nó là thứ chủ xưởng sửa được. Nếu giữ code thì phải tắt 18 luật `Chiết khấu đại lý 15%`.

**❓ CÂU HỎI CHO CHỦ XƯỞNG:** Chiết khấu 15% cửa Đức nên nằm ở **Danh mục → Chính sách giá** (sửa được) hay **cố định trong phần mềm** (không sửa được)?

---

## A2 · Khách LẺ cũng tự động được trừ 15% (giá đại lý)

**Hiện trạng.** `defaultAlumdoorDiscountPercent()` **không hề nhìn nhóm giá**. Cứ là cửa Đức thì trừ 15%, bất kể khách Đại lý hay Lẻ.

**Bằng chứng (gọi sống, cùng mã, `customer_group: "Lẻ"`):**
```
gross = 12.339.000 · discount = 1.850.850 · adjustment = 0 · net = 10.488.150
rules: ["ALUMDOOR-PR:DUC-DISCOUNT-15"]
```
Giá niêm yết lẻ đáng lẽ là **12.339.000**. Mã: `server/packages/clouderp-selling/src/controllers.ts:330` (chữ ký hàm chỉ nhận `item`, không nhận nhóm khách).

**Vì sao là vấn đề.** Khách lẻ đang mua đúng bằng giá đại lý. Toàn bộ chênh lệch bán buôn/bán lẻ của dòng cửa Đức biến mất.

**Đề xuất.** Sửa cùng lúc với A1: mức chiết khấu phải đi qua luật có `customer_group`, không phải hằng số trong code. Công sửa: **nhỏ** (nếu bỏ hằng số) / **vừa** (nếu muốn giữ song song).

**❓ CÂU HỎI:** Khách **Lẻ** mua cửa Đức trả **giá niêm yết đầy đủ**, đúng không?

---

## A3 · Bán giá "CHỈ LÁ" vẫn được tặng ray

**Hiện trạng.** Quyền lợi "Tặng ray cửa Đức từ 8 m²" chỉ xét diện tích, **không xét mã giá**. Mã `CDUC_*` có hai dòng giá: `TANG_RAY` (đã gồm ray, đắt hơn 75.000 đ/m²) và `CHI_LA` (chỉ lá, mua tách món). Bán `CHI_LA` mà hệ thống vẫn hứa tặng ray.

**Bằng chứng.**
- Gọi sống, `price_variant: "CHI_LA"`, 9 m² → `benefit_items: ["Tặng ray cửa Đức từ 8 m²"]`.
- Đơn thật `DH-2026-0068`: `price_variant: "CHI_LA"` + `benefit_items: [{label: "Tặng ray cửa Đức từ 8 m²"}]`.
- `server/packages/clouderp-selling/src/controllers.ts:370-385` — `alumdoorCommercialBenefits(item, areaSqm)` chỉ nhận mặt hàng và diện tích.

**Vì sao là vấn đề.** Khách trả giá rẻ hơn 75.000 đ/m² mà vẫn nhận bộ ray. Trên bộ 9 m² là mất 675.000 đ tiền chênh **cộng** với giá trị bộ ray đem cho.

**Đề xuất.** Cho `alumdoorCommercialBenefits` nhận thêm `price_variant`, chỉ tặng khi mã giá là `TANG_RAY`. Công sửa: **nhỏ**.

---

## A4 · Không có chặn số liệu vô lý — một đơn 394 tỷ đồng đã lưu trót lọt

**Hiện trạng.** Không có ngưỡng hợp lý nào cho **Số bộ**, **Rộng/Cao**, hay tổng tiền đơn.

**Bằng chứng.** `DH-2026-0068` trong D1: `set_count: 199999`, `qty: 359998.2` m², `total_amount: 394.198.029.000`, `grand_total: 335.938.320.300` — lưu thành công, không cảnh báo. `validate()` trong `AlumdoorSalesOrderWorkbenchComplete.tsx` chỉ kiểm khách hàng, ngày, bảng giá, có đơn giá; không có ngưỡng số lượng.

**Vì sao là vấn đề.** Gõ nhầm "199999" thay vì "1" (hai phím liền nhau) tạo ra một đơn 336 tỷ, chảy thẳng vào công nợ, báo cáo doanh thu và lệnh sản xuất. Không có bước nào hỏi lại.

**Đề xuất.** Thêm cảnh báo xác nhận khi Số bộ > (ví dụ) 50, Rộng/Cao > 15 m, hoặc tổng đơn vượt một ngưỡng chủ xưởng chốt. Công sửa: **nhỏ**.

**❓ CÂU HỎI:** Một đơn bình thường nhiều nhất bao nhiêu **bộ**, và tổng tiền bao nhiêu thì phần mềm nên hỏi lại "có chắc không?"

---

# PHẦN B — P1 (TÍNH NĂNG HỎNG / THIẾU HẲN)

## B1 · Cửa Đài Loan ≤ 3,0 m² KHÔNG CÓ GIÁ — dòng chết

**Hiện trạng.** 7 mã Đài Loan (`CDL_DLM_6D/7D/8D/1LY`, `LA_DLK_8D/1LY/1_2LY_TRONBO`) chỉ có giá theo bậc diện tích, bậc thấp nhất là **3–4 m²**, và luật bậc là `min < S ≤ max` — nghĩa là **đúng 3,0 m² cũng không khớp**. Không có dòng giá "Mọi diện tích" dự phòng cho các mã này.

**Bằng chứng (gọi sống, `CDL_DLM_6D`, mã giá `TRON_BO`):**
```
3,5 m² → OK, 450.000 đ/m², dòng giá "…:TRON_BO:DT-3-4M2"
3,0 m² → HTTP 417 "Item Price Alumdoor 2026:CDL_DLM_6D:m2:TRON_BO does not exist for variant TRON_BO"
2,4 m² → HTTP 417 (cùng lỗi)
```
- Bậc trong D1: `DT-3-4M2 {min:3,max:4}`, ghi chú của chính bản ghi: *"Nguồn KHÔNG có bậc dưới 3 m² — chờ chủ xưởng chốt"*.
- Luật cận: `server/packages/clouderp-pricing/src/index.ts:98-130` (`min < S ≤ max`).

**Vì sao là vấn đề.** Cửa 1,2×2,0 m (2,4 m²) là cửa đi thông thường. Người bán chọn hàng, gõ kích thước, và dòng báo "chưa khai đơn giá" — rồi bị chỉ sang **Danh mục → Đơn giá theo bảng giá**, nơi họ sẽ khai một dòng giá sai vì không ai nói cho họ biết vấn đề là **thiếu bậc**, không phải thiếu giá.

**Đề xuất.** Chủ xưởng chốt giá cho khoảng ≤ 3 m² rồi thêm một bậc `DT-DUOI-3M2`. Công sửa: **nhỏ** (chỉ là dữ liệu) — nhưng cần quyết định giá.

**❓ CÂU HỎI:** Cửa **Đài Loan dưới 3 m²** tính giá thế nào — ăn giá bậc 3–4 m², hay có giá riêng?

---

## B2 · Cửa Úc ≤ 4,0 m² phải bán theo **Bộ** nhưng ĐVT mặc định là **m²** → lỗi ngay; hàm chuyển chế độ viết xong mà không ai gọi

**Hiện trạng.** Bảng giá cửa Úc khai hai kiểu: **dưới 4 m² bán trọn bộ theo ĐVT `Bộ`** (1.800.000/2.000.000/2.200.000 đ/bộ), **trên 4 m² bán theo `m²`**. Nhưng `Item.default_sales_uom` của các mã đó là `m2`, nên mọi cửa Úc ≤ 4 m² mở ra là lỗi.

**Bằng chứng.**
- Gọi sống `CUC_UC_KT_4D`, mã giá `KEO_TAY`:
  - 3 m² theo **m²** → HTTP 417 "…does not exist for variant KEO_TAY"
  - 3 m² theo **Bộ** → OK, 1.800.000 đ (`…:Bộ:KEO_TAY:DT-DUOI-4M2`)
  - **4,0 m² theo m² → HTTP 417** (bậc `DT-TREN-4M2` cần `> 4`)
- D1: `CUC_UC_KT_4D.default_sales_uom = "m2"`, `stock_uom = "Bộ"`, không có `uom_conversions`.
- **`resolveAustralianBillingMode()` — hàm chuyển chế độ tính tiền cửa Úc — được export tại `server/packages/clouderp-selling/src/adjustment-policy.ts:230` và KHÔNG CÓ MỘT NƠI NÀO GỌI TỚI** (grep toàn repo thật, bỏ `dist/`: 1 kết quả duy nhất là chính dòng khai báo). Đây là "đã viết xong nhưng chưa nối dây" đúng nghĩa.
- Ghi chú của bậc `DT-DUOI-4M2` trong D1 nói thẳng: *"`resolveAustralianBillingMode` đổi cách tính đúng ở mốc này"* — nhưng nó không chạy.

**Vì sao là vấn đề.** 6 mã cửa Úc, mọi bộ ≤ 4 m² (rất phổ biến với cửa phụ, cửa kho) đều không ra tiền được, và người bán phải tự đoán rằng phải đổi ĐVT sang "Bộ". Không có một chữ nào trên màn hình gợi ý điều đó.

**Đề xuất.** Nối `resolveAustralianBillingMode` vào đường tra giá: diện tích/bộ < 4 → tự đổi ĐVT sang `Bộ`, qty = số bộ. Công sửa: **vừa**.

---

## B3 · Số "Rộng PB ray / Rộng PB nhựa" người bán gõ KHÔNG ĐƯỢC LƯU

**Hiện trạng.** Với cửa bán theo m², cột nhập chiều rộng trên lưới là **`width_pb_ray_m`** (khách Lẻ) hoặc **`width_pb_nhua_m`** (khách Đại lý). Nhưng `Sales Order Item` **không có hai trường này**, nên `cleanLine()` (chỉ giữ field thuộc DocType con) vứt chúng đi trước khi lưu.

**Bằng chứng.**
- DocType `Sales Order Item` trong D1 (`doctype_definitions`) — 54 trường, **không có** `width_pb_ray_m`, **không có** `width_pb_nhua_m`.
- Đơn thật `DH-2026-0068` (khách Đại lý): dòng hàng **không có khoá `width_pb_nhua_m`**, chỉ còn `width_m: 1.2` và `width_basis: "Phủ bì nhựa"`.
- Client: `AlumdoorSalesOrderLineTableComplete.tsx` → `visibleDynamicField()` cho cửa m² **ẩn cột "Rộng" (`width_m`)** và chỉ hiện cột PB tương ứng nhóm giá.
- Server cũng không dựng lại được: `ui-child-preview.ts` chỉ ghi những trường có trong `child_fields`, mà hai trường này không có ở đó.

**Vì sao là vấn đề.** Mở lại một đơn đã lưu, **ô Rộng trống trơn** trong khi Cao và Số bộ vẫn còn. Người bán không kiểm được kích thước cửa mình đã bán; nếu họ gõ lại một con số khác, tiền đổi mà không ai biết vì sao. Với đơn của khách Đại lý (251/256 khách) đây là trạng thái mặc định.

**Đề xuất.** Hoặc thêm hai trường vào `Sales Order Item`, hoặc để server chiếu ngược `width_pb_*` từ `width_m` + `width_basis` khi mở đơn. Công sửa: **vừa**.

---

## B4 · Ô Khách hàng gợi ý cả Nhà cung cấp "NCC · …" — chọn vào là lưu hỏng

**Hiện trạng.** Ô "Khách hàng" trộn kết quả từ danh mục Nhà cung cấp, hiển thị với tiền tố `NCC · `. Hai hàm dùng để **quy đổi ngược** lựa chọn đó thành một Khách hàng thật — `supplierNameFromOption()` và `supplierCustomerPrefill()` — **không được gọi ở bất kỳ đâu**.

**Bằng chứng.** `AlumdoorSalesOrderField.tsx:12` và `:56` khai hai hàm; grep toàn `client/packages/vertical-alumdoor/src` cho `supplierNameFromOption|supplierCustomerPrefill|SUPPLIER_OPTION_PREFIX` chỉ ra **6 kết quả, tất cả đều nằm trong chính file khai báo** — không có chỗ sử dụng. Chú thích trong code còn ghi *"trước khi lưu Workbench sẽ dùng/tạo vai trò Customer tương ứng"* — bước đó không tồn tại trong `AlumdoorSalesOrderWorkbenchComplete`.

**Hệ quả kỹ thuật:** chuỗi thô `"NCC · TÊN"` bị ghi thẳng vào trường `customer` → `preview_document` đọc Customer không thấy → không nạp được nhóm giá/SĐT/địa chỉ → lúc lưu báo `Customer NCC · … does not exist`.

**Vì sao là vấn đề.** Danh sách khách hàng bị trộn 9 nhà cung cấp, và bất kỳ ai chọn nhầm một dòng "NCC ·" sẽ nhập cả đơn rồi mới bị chặn ở bước cuối.

**Đề xuất.** Ngắn hạn: bỏ hẳn nhánh gợi ý Nhà cung cấp khỏi ô Khách hàng. Dài hạn: nối lại hai hàm đã viết sẵn. Công sửa: **nhỏ** (bỏ) / **vừa** (nối).

**❓ CÂU HỎI:** Có bao giờ xưởng **bán hàng cho một nhà cung cấp** không? Nếu không, nên bỏ hẳn gợi ý "NCC ·" khỏi ô Khách hàng.

---

## B5 · Sửa tay ô "Chiết khấu" là không ghi sổ được — vai duyệt không tồn tại trong xưởng

**Hiện trạng.** Ô Chiết khấu (%) trên dòng cho gõ thoải mái. Nhưng lúc **Ghi sổ đơn**, nếu % gõ vào khác % chuẩn, máy chủ đòi người ghi sổ phải là `Sales Manager`, `System Manager` hoặc `Administrator`.

**Bằng chứng.**
- `server/packages/clouderp-selling/src/commercial-sales-order-controller.ts:608-611` — `isPricingApprover()` chỉ chấp nhận ba vai đó.
- Cùng file, dòng 182: `throw errors.permission("Đơn hàng có giá/chiết khấu/bảng giá khác chính sách; Sales Manager phải duyệt trước khi bán.")`
- Vai nghiệp vụ của xưởng theo brief là `Chủ xưởng, Kinh doanh, Thủ kho, Kế toán, Sản xuất` — **không có `Sales Manager`**.
- Bảng `user_roles` trong D1: **không một tài khoản nào** mang vai `Sales Manager`. (`dev@example.com` qua được chỉ vì đang có `System Manager`/`Administrator` — tài khoản dev, không phải tài khoản người dùng thật.)

**Vì sao là vấn đề.** Khi xưởng phát tài khoản thật cho nhân viên Kinh doanh (hoặc cho chính Chủ xưởng), mọi đơn có mặc cả giá sẽ bị chặn với một câu bảo đi tìm "Sales Manager" — một chức danh không tồn tại ở xưởng.

**Đề xuất.** Cho `isPricingApprover` chấp nhận vai `Chủ xưởng` (và/hoặc `Giám đốc`), đổi câu thông báo sang tên vai tiếng Việt. Công sửa: **nhỏ**.

**❓ CÂU HỎI:** Ai ở xưởng được quyền **duyệt giá/chiết khấu ngoài chính sách** — Chủ xưởng, hay còn ai nữa?

---

## B6 · Mã giá "TANG_RAY" (giá tặng ray) bán được ở mọi kích thước, không có gì chặn ngưỡng 8 m²

**Hiện trạng.** Dòng giá `TANG_RAY` ghi rõ trong ghi chú: *"Đây là giá tặng ray — chỉ áp cho cửa từ 8 m² trở lên."* Nhưng nó được gắn bậc `MOI-DIEN-TICH` và **không có luật nào kiểm tra ngưỡng 8 m²**.

**Bằng chứng (gọi sống, `CDUC_TD_AL501N`, 2×2 m = 4 m², `TANG_RAY`, Đại lý):**
```
status 200 · gross 5.784.000 (1.446.000 đ/m² × 4) · net 4.393.800
```
Không cảnh báo, không chặn. Đồng thời `benefit_items` **rỗng** (vì < 8 m²) — nghĩa là khách trả **giá có ray** mà **không được ray**.
- D1: `Alumdoor 2026:CDUC_TD_AL501N:m2:TANG_RAY:MOI-DIEN-TICH`, không luật nào trong 89 `Pricing Rule` xét cặp `price_variant`/8 m².

**Vì sao là vấn đề.** Hai chiều đều sai: dưới 8 m² chọn `TANG_RAY` là **thu đắt hơn 75.000 đ/m² mà không giao ray**; từ 8 m² chọn `CHI_LA` là **thu rẻ mà vẫn tặng ray** (xem A3). Người bán chỉ thấy hai mã thô `TANG_RAY`/`CHI_LA` trong ô chọn, không có chỗ nào ghi luật 8 m².

**Đề xuất.** Gắn bậc diện tích cho `TANG_RAY` (`min_area = 8`) — cách này dùng đúng cơ chế sẵn có và không phải viết code. Công sửa: **nhỏ (dữ liệu)**.

**❓ CÂU HỎI:** Cửa Đức **dưới 8 m²** có được phép bán theo giá "tặng ray" không? (Nếu không, ta khoá bằng bậc diện tích.)

---

## B7 · Tuỳ chọn Motor không bán được — ~50/89 luật giá đang bị tắt

**Hiện trạng.** Toàn bộ luật giá cho tuỳ chọn motor đang `disabled: true`: nhóm `JG`, `Tanker/Alumax`, `YHLD` — "không bộ điều khiển", "không lắc", "không bộ điều khiển và không lắc", "đổi lắc 33 lên lắc 36". Cộng thêm "V4 sơn tĩnh điện" và "Chuyển đổi sang cửa kéo tay — Đài Loan".

**Bằng chứng.** Kiểm 89 bản ghi `Pricing Rule` trong D1: **50 bản ghi có `disabled: true`**, tất cả đều thuộc các nhóm trên (ví dụ `JG — không bộ điều khiển · MT_JG500KG`, `-150.000 đ/bộ`, disabled).

**Vì sao là vấn đề.** Bán motor kèm hay không kèm bộ điều khiển là chuyện xảy ra hằng ngày; hiện tại chọn kiểu nào cũng ra một giá. Nếu đây là chủ ý (chưa chốt giá) thì không sao — nhưng chúng vẫn hiện trong màn **Danh mục → Chính sách giá** và làm rối.

**❓ CÂU HỎI:** 50 luật giá tuỳ chọn motor đang tắt là **cố ý** (chưa chốt giá) hay **quên bật**?

---

# PHẦN C — P2 (KHÓ HIỂU / GÂY RỐI / THỪA)

## C1 · Màu **`VAN_GO`** — mã thô không dấu duy nhất giữa 24 tên tiếng Việt, và đúng là lựa chọn đắt nhất

**Bằng chứng.** 25 bản ghi `Item Color` trong D1: 24 bản dùng tên tiếng Việt làm mã (`ĐEN XINGFA`, `VÀNG KEM BÓNG`, `XÁM LÔNG CHUỘT`…), riêng một bản có **mã `VAN_GO`** trong khi `color_name` là "VÂN GỖ". Danh sách màu gửi cho màn bán hàng lấy **mã**, không lấy tên: `server/apps-src/alumdoor-worker/src/color-scopes.ts:243` và `:265` — `text(color.name || color.color_code)`.

Đây đúng là lựa chọn kéo giá nhiều nhất: luật `Sơn vân gỗ — cửa` cộng **+465.000 đ/m²** khi `color = "VAN_GO"`.

**Vì sao là vấn đề.** Ô Màu hiện ra một mã máy giữa 24 cái tên người, và nó chính là cái đắt nhất. Người bán rất dễ bỏ qua hoặc chọn nhầm.

**Đề xuất.** Đổi tên bản ghi thành `VÂN GỖ`, hoặc cho `allowedColorNames*` ưu tiên `color_name`. Công sửa: **nhỏ**.

---

## C2 · "Chưa chọn kho" hiện vĩnh viễn dưới **mọi** mặt hàng — mà màn bán hàng cố ý không có ô kho

**Bằng chứng.**
- `AlumdoorSalesOrderWorkbenchComplete.tsx` (~dòng 750-760): chú thích ghi rõ **"KHÔNG hỏi tồn kho ở màn bán hàng — quyết định của chủ dự án 21/08/2026"**, và lời gọi `alumdoor.sales.item_context` **không truyền `warehouse`**.
- `server/apps-src/alumdoor-worker/src/sales-item-context.ts:1116-1118`: không có `warehouse` ⇒ `stockStatus = "Chưa chọn kho"`, luôn luôn.
- `:1339`: `availability_status = [stockStatus, priceStatus].join(" · ")`.
- Đơn thật `DH-2026-0068`: `availability_status: "Chưa chọn kho · Chưa chọn mã giá"` — dù dòng **đã có** mã giá `CHI_LA` và đã ra tiền.
- Client in nguyên chuỗi này ngay dưới tên hàng: `AlumdoorSalesOrderLineTableComplete.tsx:1126`.

**Vì sao là vấn đề.** Mỗi dòng hàng đeo một câu trông như lỗi — "Chưa chọn kho" — mà người bán **không có ô nào để chọn kho**. Vế thứ hai ("Chưa chọn mã giá") còn sai với thực tế của dòng. Người dùng sẽ học cách bỏ qua mọi chữ nhỏ dưới tên hàng, kể cả chữ quan trọng.

**Đề xuất.** Bỏ vế "Chưa chọn kho" khi màn không hỏi kho; chỉ giữ vế giá. Công sửa: **nhỏ**.

---

## C3 · Cảnh báo danh mục kêu trên gần như MỌI dòng → không ai còn đọc cảnh báo

**Bằng chứng (đếm trên D1, 227 mã đang bán, chưa ngừng kinh doanh):**

| Cảnh báo | Số mã dính |
|---|---|
| "Mặt hàng chưa gắn quy cách kỹ thuật" (`SPEC_NOT_LINKED`) | **199 / 227** (87,7%) |
| "Mặt hàng chưa có bộ quy cách hình học" (`GEOMETRY_PROFILE_MISSING`) | **176 / 227** (77,5%) |
| "Mặt hàng chưa gắn bộ theo dõi vật tư" | 0 / 227 |

Mã: `server/apps-src/alumdoor-worker/src/sales-item-context.ts:715-733` (dựng cảnh báo), `:1316-1317` (xếp vào `warnings`, không chặn).

**Vì sao là vấn đề.** Đây chính là câu chủ xưởng nhìn thấy: *"Mặt hàng chưa gắn quy cách kỹ thuật — Danh mục → Mặt hàng → CDUC_TD_AL501N → Quy cách kỹ thuật"*. Nó xuất hiện trên **9 trong 10 dòng hàng**. Một cảnh báo kêu suốt ngày là một cảnh báo không ai đọc — và nó che mất những cảnh báo thật (thiếu giá, thiếu màu).

**Ảnh hưởng thật sự:** `Material Specification` chỉ dùng để lấy *chiều dài cây chuẩn* và *kg/m lý thuyết* — hai thứ của khâu **mua/cắt**, không ảnh hưởng tiền bán. Nên với 199 mã kia, cảnh báo này **không có hành động nào đáng làm ở màn bán hàng**.

**Đề xuất.** Chỉ hiện `SPEC_NOT_LINKED`/`GEOMETRY_PROFILE_MISSING` cho nhóm mã thật sự cần (nhôm cây/lá, ray/trục), ẩn ở màn bán hàng cho phần còn lại. Công sửa: **nhỏ**.

---

## C4 · Barem mua (kg/m²): **35/35 mã cần khai đều đang trống** → dự toán mua không chạy

**Bằng chứng.** Trong 51 mã cửa bán theo m², có 35 mã thuộc các loại cần barem (Úc, tấm liền Úc, Lưới, Đài Loan, Siêu Trường, Inox). Đếm trên D1: **0/35 mã có `purchase_kg_per_m2`** — thực tế trường này **không xuất hiện trong payload của bất kỳ mã nào trong 404 mã**. Client có sẵn cảnh báo cho việc này (`model.ts:1261-1265`, *"Chưa khai barem mua (kg/m²) — dự toán mua chưa tính được"*), nhưng nhánh đó chỉ chạy khi máy chủ chưa gửi `readiness` — nên hiện tại **cảnh báo không bao giờ hiện**.

**Vì sao là vấn đề.** Khâu dự toán mua nguyên liệu cho toàn bộ dòng cửa Úc/Lưới/Đài Loan/Siêu Trường không tính được, và màn hình cũng không nói ra.

**❓ CÂU HỎI:** Barem **kg/m²** của cửa Úc / Lưới / Đài Loan / Siêu Trường là bao nhiêu? (Cần một con số cho mỗi loại để bật lại dự toán mua.)

---

## C5 · "Diện tích tối thiểu tính tiền" là tính năng chết — 51/51 mã cửa khai bằng 0

**Bằng chứng.** D1: mọi mã `inventory_mode = "Thành phẩm theo m2"` đều có `min_area_sqm: "0"` (kiểm 51/51, ví dụ `CDUC_TD_AL501N`, `CDL_DLM_6D`, `CUC_UC_KT_4D`). Trong khi đó cả engine (`alumdoor-commercial.ts:224-227`) lẫn UI (`model.ts` → `lineMinAreaNotice`, dòng giải trình "Diện tích tối thiểu") đều đã làm sẵn.

**Vì sao là vấn đề.** Cửa 1,5 m² hiện thu đúng tiền 1,5 m². Nếu xưởng có quy định "tính tối thiểu N m²/bộ" thì quy định đó **đang không được áp**, và không có gì báo.

**❓ CÂU HỎI:** Có mức **diện tích tối thiểu tính tiền** cho một bộ cửa không (ví dụ tối thiểu 4 m²)? Nếu có, con số là bao nhiêu cho từng loại cửa?

---

## C6 · Tên cột trên lưới bán hàng gọi sai nghĩa nghiệp vụ

**Bằng chứng.** `AlumdoorSalesOrderLineTableComplete.tsx:1054-1057`:

| Tiêu đề cột | Nội dung thật |
|---|---|
| **"Khối lượng"** | Số lượng dùng để tính tiền (với cửa là **m²**, không phải kg) |
| **"Thành tiền" (VNĐ)** | Tiền **trước** chiết khấu và phụ thu (`gross_amount`) |
| "Tiền phải trả" (chỉ trong dòng chi tiết mở rộng) | Tiền thật sau chiết khấu/phụ thu |

Với ví dụ A1: cột **"Thành tiền" hiện 12.339.000** trong khi tiền thật của dòng là **8.637.300**, và con số thật chỉ thấy được khi bấm mở dòng chi tiết.

**Vì sao là vấn đề.** Cột tiền lớn nhất, dễ đọc nhất trên lưới **không phải** số khách phải trả. Chênh trên 3,7 triệu ở một dòng. Từ "Khối lượng" khiến người đọc tưởng là cân nặng, trong khi đã có sẵn cột "SL" ngay bên cạnh.

**Đề xuất.** Đổi "Thành tiền" → "Tiền hàng (trước CK)" và bổ sung một cột "Phải trả" luôn hiện; đổi "Khối lượng" → "SL tính tiền". Công sửa: **nhỏ**.

---

## C7 · Thông báo lỗi bằng tiếng Anh lọt thẳng ra người bán

**Bằng chứng (đều là câu ném ra tới UI, không được dịch ở `salesOrderErrorMessage`):**
- `Item Price Alumdoor 2026:CDL_DLM_6D:m2:TRON_BO does not exist for variant TRON_BO` — **bắt được sống** ở B1/B2. Chú ý câu này còn lặp lại mã giá hai lần.
- `server/packages/clouderp-pricing/src/commercial-policy.ts:307` — `Multiple Pricing Rules tie for discount: A, B` (với 89 luật, chuyện hai luật cùng độ ưu tiên là có thật; khi xảy ra, **dòng không ra giá được**).
- `server/packages/clouderp-selling/src/commercial-line-resolver.ts:170` — `Line discount cannot exceed gross amount`.
- `server/packages/clouderp-selling/src/commercial-line-resolver.ts:178` — `Line net before tax cannot be negative`.
- `server/packages/clouderp-selling/src/commercial-line-resolver.ts:167` — `Pricing Rule cannot apply percentage and fixed discount to the same line`.
- `server/packages/clouderp-pricing/src/commercial-policy.ts` — `Unsupported Pricing Rule adjustment basis …`.
- `AlumdoorSalesOrderField.tsx:126` — `Missing control for {fieldtype}`.

**Vì sao là vấn đề.** Chủ xưởng gặp một câu tiếng Anh có dấu hai chấm và tên bảng dữ liệu, rồi phải gọi kỹ thuật. Riêng câu "Item Price … does not exist" còn chỉ sai chỗ sửa (xem B1/B2).

**Đề xuất.** Việt hoá tại nguồn, và với lỗi "không có dòng giá" thì phân biệt ba nguyên nhân: *thiếu bậc diện tích* / *sai ĐVT* / *thật sự chưa khai giá*. Công sửa: **vừa**.

---

## C8 · "Mã giá" là ô chữ tự do, không có danh mục — gõ sai là đẻ ra một cách bán ma

**Bằng chứng.** DocType `Item Price` (D1): trường `price_variant` là **`Data`**, nhãn "Mã giá", **không có `options`, không link tới danh mục nào**. Danh mục bên trái (`/master-data`) cũng **không có mục nào cho "Cách bán / Mã giá"**. Giá trị đang dùng trong dữ liệu: `STANDARD, KEO_TAY, MOTOR_NGOAI, TANG_RAY, CHI_LA, TACH_MON, TRON_BO, TAM_CHUA_CHOT` — 8 mã thô, không dấu.

**Vì sao là vấn đề.** Người khai giá phải nhớ và gõ đúng `TAM_CHUA_CHOT` viết hoa, gạch dưới. Gõ `TAM_CHUA_CHOT ` hay `Tam_chua_chot` tạo ra một cách bán mới, và cách bán ma đó sẽ **hiện ngay trong ô chọn của người bán** như một lựa chọn hợp lệ. (`normalizePriceVariant` ở `server/packages/clouderp-pricing/src/index.ts:86-92` chỉ kiểm ký tự A-Z/0-9/_/-, không kiểm mã có tồn tại trong danh mục nào.)

**Đề xuất.** Tạo một danh mục "Cách bán" với tên tiếng Việt, đổi `price_variant` thành Link. Công sửa: **vừa**.

---

## C9 · Ô tìm mặt hàng bắn tới 18 truy vấn song song mỗi lần gõ

**Bằng chứng.** `sales-item-search.ts:45-55` dựng tới **18** biến thể truy vấn cho một chuỗi gõ vào; `AlumdoorSalesOrderWorkbenchComplete.tsx` (`salesServices.searchLink`) gọi `Promise.allSettled(terms.map(...))` với `pageLength: 100` cho từng biến thể, rồi thêm 3 lượt đọc nữa (`resolve_display_values`, `Item`, `Item Price`) — tổng **tới 21 request cho một lần gõ**.

**Vì sao là vấn đề.** Đúng chỗ chủ xưởng gõ nhiều nhất. Trên mạng chậm hoặc máy chủ bận, ô tìm hàng là nơi đầu tiên "đơ".

**Đề xuất.** Giảm còn 3–4 biến thể và để máy chủ lo phần bỏ dấu. Công sửa: **nhỏ**.

---

## C10 · Nhãn Pricing Rule trong màn bán hàng ánh xạ 11 mã **không còn tồn tại**

**Bằng chứng.** `model.ts:644-656` — bảng `PRICING_RULE_LABELS` dịch 11 mã kiểu `DAILOAN-UNDER-8M2`, `DUC-DISCOUNT-15`, `UC-UNDER-7M2`… Kiểm 89 bản ghi `Pricing Rule` trong D1: **không bản ghi nào mang những mã đó**; tên thật đã là tiếng Việt (`Chiết khấu đại lý 15% — AL501N`, `Phụ vận chuyển cửa dưới 8m² — Đức và Lưới`…). Riêng `ALUMDOOR-PR:DUC-DISCOUNT-15` và `ALUMDOOR-PR:DUC-GIFT-RAIL-8M2` vẫn xuất hiện — nhưng đó là hai **snapshot giả do code tự chèn** (`controllers.ts:345-346`), không phải luật trong Danh mục.

**Vì sao là vấn đề.** Ở thanh tổng, mục "Chính sách giá đang áp" in **tên thô** `ALUMDOOR-PR:DUC-DISCOUNT-15` bên cạnh tên tiếng Việt của các luật thật — hai kiểu tên lẫn lộn trên cùng một chỗ. Và chính con số mà mã thô đó đại diện lại là **khoản trừ hai lần ở A1**.

**Đề xuất.** Xoá bảng ánh xạ chết; nếu vẫn giữ snapshot giả thì đặt tên tiếng Việt. Công sửa: **nhỏ**.

---

## C11 · Đua request: đụng vào dòng khác là huỷ lượt tính giá đang bay của dòng trước (chỉ xác nhận tĩnh)

**Bằng chứng.** `AlumdoorSalesOrderWorkbenchComplete.tsx:730` — mỗi lượt `previewLine` chụp `documentRevision = previewClock.current.revision`; `abortIfStale()` (`:735`) bỏ kết quả nếu revision đã đổi. Mà `markDocumentChanged()` (tăng revision) được gọi ở **mọi** thao tác: `patchLineFromUser`, `commitLine`, `setHeaderField`, `addLine`, `duplicateLine`, `deleteLine`. Nhánh huỷ chỉ đặt `_loading: false` và **không xếp lại lượt tính**; lifecycle tự chạy lại chỉ có cho dòng BOM và dòng lệch SL.

**Hệ quả.** Gõ xong dòng 1 rồi bấm sang dòng 2 trong lúc dòng 1 chưa tính xong ⇒ dòng 1 giữ chiết khấu/phụ thu **cũ** trên màn hình, mà `validate()` không bắt được vì `_loading` đã tắt.

**Giảm nhẹ:** máy chủ **tính lại giá khi lưu**, nên số **lưu xuống vẫn đúng**. Vấn đề là **màn hình hiện một số, đơn lưu một số khác** — không mất tiền, nhưng mất niềm tin.

**Đề xuất.** Xếp lại lượt bị huỷ thay vì bỏ luôn. Công sửa: **vừa**. *(Chỉ xác nhận tĩnh — chưa dựng được kịch bản đua trên trình duyệt.)*

---

# PHẦN D — BỔ SUNG CHO 9 MỤC BA AGENT KHÁC ĐANG SỬA

> Không phải finding mới. Chỉ là chiều sâu có thể bị bỏ sót.

### D1 · "Sửa dấu Phụ thu" — gốc rễ nằm ở chỗ khác
Con số âm dưới cột "Phụ thu" **không phải lỗi hiển thị**: chiết khấu đại lý 15% đang được **khai như một khoản phụ thu âm** trong Danh mục (18 luật `ADJUSTMENT` với `adjustment_rate` âm, ví dụ `-205.650 đ/m²`). Sửa dấu ở UI sẽ làm số dễ nhìn hơn nhưng vẫn để **"Chiết khấu" hiển thị một khoản, "Phụ thu" hiển thị một khoản y hệt** — chính là bằng chứng nhìn thấy được của lỗi A1. **Nên xử A1 trước, rồi mới chốt cách hiển thị.**

### D2 · "Thêm ô Tiền cọc" — DocType chưa có trường
`Sales Order` trong D1 (`doctype_definitions`) có **29 trường và không có `deposit_amount`, không có `outstanding_amount`**. Vì vậy:
- Ô nhập trong workbench nằm sau `metaField("deposit_amount") ? …` ⇒ **hiện không render**.
- Hai ô tổng "Tiền cọc" và "Còn phải thu" render vô điều kiện ⇒ luôn hiện `0 ₫` và `= Tiền phải trả` (đã thấy trên màn hình sống: *"Còn phải thu: 0 ₫"*).
- Máy chủ thì **đã tính đủ**: `ui-document-preview.ts:60-73` và `commercial-sales-order-controller.ts:220-248`.
→ Phần còn thiếu là **khai hai trường vào brief/DocType**, không phải viết thêm logic.

### D3 · "Thêm ảnh sản phẩm" / "nâng cấp mô tả" — trường có sẵn, dữ liệu trống
`Item.image` (Attach Image) và `Item.description` ("Quy cách / xuất xứ") **đã có trong DocType**. Nhưng trong 227 mã đang bán: **223 mã không có ảnh**, **194 mã không có mô tả**. Nối dây UI xong thì màn hình vẫn trống cho ~9/10 mã, trừ khi có đợt nhập dữ liệu đi kèm.

### D4 · "Việt hoá `price_variant`" — nhớ ba chỗ khác ngoài cột lưới
Mã thô `TANG_RAY`/`CHI_LA` còn lọt ra ở:
1. Chuỗi dưới ô chọn (`priceVariantOptionLabel` in nguyên mã kèm giá),
2. `availability_status` — "Chưa chọn mã giá" (`sales-item-context.ts:1143`),
3. Dòng giải trình "Mã giá" trong khối *"Vì sao ra con số này"* (`model.ts` → `linePriceExplanation`),
4. Cổng chặn `PRICE_VARIANT_REQUIRED` (`sales-item-context.ts:1258-1261`).
Và xem thêm **C8**: chừng nào `price_variant` còn là ô chữ tự do thì bảng dịch cứng sẽ trượt khi có mã mới.

---

# PHẦN E — TOÀN BỘ CÂU HỎI CẦN CHỦ XƯỞNG QUYẾT

| # | Câu hỏi | Liên quan |
|---|---|---|
| 1 | Chiết khấu 15% cửa Đức nên nằm ở **Danh mục → Chính sách giá** (sửa được) hay **cố định trong phần mềm**? | A1 |
| 2 | Khách **Lẻ** mua cửa Đức trả **giá niêm yết đầy đủ**, đúng không? | A2 |
| 3 | Một đơn bình thường nhiều nhất bao nhiêu **bộ** / bao nhiêu **tiền** thì phần mềm nên hỏi lại "có chắc không?" | A4 |
| 4 | Cửa **Đài Loan dưới 3 m²** tính giá thế nào — ăn giá bậc 3–4 m², hay có giá riêng? | B1 |
| 5 | Ai được quyền **duyệt giá/chiết khấu ngoài chính sách** — Chủ xưởng, hay còn ai nữa? | B5 |
| 6 | Cửa Đức **dưới 8 m²** có được bán theo giá **"tặng ray"** không? | B6, A3 |
| 7 | 50 luật giá **tuỳ chọn motor** đang tắt là cố ý (chưa chốt giá) hay quên bật? | B7 |
| 8 | Có bao giờ xưởng **bán hàng cho một nhà cung cấp** không? (Nếu không, bỏ gợi ý "NCC ·" khỏi ô Khách hàng.) | B4 |
| 9 | **Barem kg/m²** của cửa Úc / Lưới / Đài Loan / Siêu Trường là bao nhiêu? | C4 |
| 10 | Có mức **diện tích tối thiểu tính tiền** cho một bộ cửa không? Nếu có, bao nhiêu m²/bộ cho từng loại? | C5 |

---

# PHỤ LỤC — Số liệu danh mục đo được trên D1 đang chạy (21/08/2026)

**Mặt hàng:** 404 bản ghi · 227 mã đang bán (chưa ngừng kinh doanh) · 6 mã đã ngừng.
Kiểu tính tồn của mã bán: Hàng thường 134 · Thành phẩm theo m² 51 · Cuộn 28 · Tấm/Kính 14.

**Độ đầy của danh mục (trên 227 mã bán):**

| Trường | Thiếu |
|---|---|
| Bộ theo dõi vật tư | 0 |
| ĐVT bán mặc định | 0 |
| Quy cách kỹ thuật (`material_specification`) | **199** |
| Bộ quy cách hình học (`geometry_profile`) | **176** |
| Diện tích tối thiểu > 0 | **227** (tất cả = 0) |
| Barem mua kg/m² | **227** (không mã nào có) |
| Ảnh | **223** |
| Mô tả / quy cách xuất xứ | **194** |
| Bản lá / ước số chia | 210 (chỉ 17 mã cửa Đức cần) |

**Giá:** 1 bảng giá (`Alumdoor 2026`) · 304 dòng giá, không dòng nào bị ngừng · **0/222 mã bán thiếu giá hoàn toàn** (tốt).
Phân bố bậc: `MOI-DIEN-TICH` 236 · thang 3→10 m² 7 dòng/bậc (7 mã Đài Loan) · `DT-DUOI-4M2`/`DT-TREN-4M2` 6 dòng/bậc (6 mã Úc).
Mã giá: `STANDARD` 173 · `TRON_BO` 56 · `TAM_CHUA_CHOT` 16 · `TANG_RAY` 15 · `CHI_LA` 15 · `TACH_MON` 13 · `KEO_TAY` 9 · `MOTOR_NGOAI` 7.
**15 cặp (mã + ĐVT)** có nhiều hơn một cách bán — đúng 15 mã cửa Đức, tất cả là cặp `TANG_RAY`/`CHI_LA`.

**Khách hàng:** 256 · **251 nhóm giá "Đại lý"**, 5 "Lẻ". (Trường `customer_group` trên bản ghi Customer đều trống; nhóm giá đến từ `price_group`.)

**Luật giá:** 89 · **50 đang tắt** (toàn bộ là tuỳ chọn motor) · 39 đang chạy.
**Màu:** 25 · 24 tên tiếng Việt + 1 mã thô `VAN_GO`.
**Bậc diện tích:** 11 · **Đơn hàng:** 35.
