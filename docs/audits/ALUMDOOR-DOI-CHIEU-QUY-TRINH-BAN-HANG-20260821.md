# ALUMDOOR — Đối chiếu YÊU CẦU TRONG TÀI LIỆU với MÀN BÁN HÀNG

**Ngày:** 21/08/2026 · **Phạm vi:** chỉ nghiệp vụ BÁN HÀNG (tạo đơn, đo, định giá, chiết khấu,
phụ thu, tồn khi bán, cọc/công nợ khi bán, in đơn, chuyển sang sản xuất/giao).
**Chỉ đọc — không sửa một dòng code nào.**

> ⚠️ **Mức xác nhận:** backend `127.0.0.1:8799` **đang chết** suốt phiên làm việc này
> (mọi tab `localhost:5173` đều hiện *"FORGE CONNECTION — Có lỗi phía máy chủ"*,
> `fetch('/api/resource/Item')` trả HTTP 500). Vì vậy **báo cáo này là ĐỐI CHIẾU TĨNH**:
> bằng chứng lấy từ mã nguồn và dữ liệu trong `C:\alumdoor`, không phải từ màn hình chạy thật.
> Kịch bản `CDUC_TD_AL501N` 3×3 m / ANH MINH TUẤN / Đại lý / Alumdoor 2026 **chưa xác nhận sống được**.
>
> ⚠️ **Số dòng của `AlumdoorSalesOrderLineTableComplete.tsx` và `AlumdoorSalesOrderWorkbenchComplete.tsx`
> đang trôi** vì có ba agent khác sửa cùng lúc trên chính hai file này (một lần grep cách nhau vài
> phút đã cho `927` rồi `1054` cho cùng một dòng). Tên hằng/biến trong cột đối chiếu mới là thứ tra
> lại được chắc chắn; số dòng chỉ để định vị nhanh.

---

## 0. Tài liệu đã đọc

### Đã đọc HẾT (nguồn yêu cầu)

| File | Vì sao là nguồn yêu cầu |
|---|---|
| `apps/alumdoor/docs/nguon/quy-trinh-van-ban.md` (423 dòng) | **NGUYÊN VĂN chữ của chủ xưởng** — bản trích `25.7 QUY TRÌNH (2).docx`. Đây mới là "file quy trình" gốc |
| `apps/alumdoor/docs/nguon/ANH-DA-CHEP.md` (179) | Bản chép 21 ảnh trong chính docx đó — bảng bản lá, bảng giá, phụ thu, mẫu đơn SX |
| `apps/alumdoor/docs/nguon/BANG-GIA-CHINH-THUC-31-07-2026.md` (255) | 6 tờ bảng giá **có mộc công ty**, tự khai là "nguồn có thẩm quyền cao nhất về GIÁ" |
| `docs/ALUMDOOR-QUY-TRINH.md` (621) | Bản diễn giải quy trình mà chủ xưởng nhắc tới |
| `docs/ALUMDOOR-LUAT-DO-VA-GIA.md` (123) | Luật đo/tính tiền theo nhóm khách, **chốt trực tiếp với chủ xưởng 29/07** |
| `apps/alumdoor/docs/BRD.md` §4.8–4.11, §5.1–5.2, §9 (759) | Gom yêu cầu bán hàng thành danh sách ràng buộc đã chốt |
| `docs/ALUMDOOR_PRICING_SCOPE.md` (21) | Phạm vi + 4 chính sách phụ thu đang cấu hình local |
| `docs/ALUMDOOR-DANH-MUC-HOI-TU-20260819.md` (245) | Cái gì **cố ý không làm** và điều kiện mở lại |
| `docs/sales/ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md` (139) | Câu hỏi bán hàng đang chờ chủ xưởng chốt |
| `docs/sales/README.md` (83) | Hợp đồng "Sales BOM composition" 19/08 — ràng buộc thật cho dòng con trên đơn bán |
| `apps/alumdoor/docs/CAU-HOI-XUONG.md` (131) | Ba giả định A1/A2/A3 đang tự quyết |
| `nhap/DANH-MUC-MAT-HANG.md` (343) | Bản xuất danh mục 20/08 — dùng làm bằng chứng về hệ số quy đổi ĐVT |
| `docs/PRINT_DESIGN_ROADMAP.md` (73) | Chuẩn mẫu in + trạng thái mẫu in Đơn bán hàng |
| `apps/alumdoor/docs/nguon/00-MUC-LUC.md` (126) | Mục lục nguồn — để biết còn nguồn nào chưa mở |

### CHỦ Ý BỎ QUA

| File / thư mục | Lý do bỏ |
|---|---|
| `docs/sales/SALES_COMMERCIAL_ARCHITECTURE.md`, `SALES_PRICING_AUTHORITY_IMPLEMENTATION_PLAN.md`, `ALUMDOOR_SALES_OPTION_PACKAGE_AUDIT_20260813.md`, phần sau `ALUMDOOR_SALES_BUSINESS_CASE_MATRIX.md` | Chính `docs/sales/README.md:50-57` khai chúng là **shared/historical**, không phải thẩm quyền hiện hành của Alumdoor. Chúng còn mô tả `Sales Option`/`Sales Package` **đã bị xoá 14/08** |
| `docs/ALUMDOOR-MUA-HANG-*.md`, `docs/brd-v2/*` | Mua hàng và lõi vật tư/kho nhôm — ngoài phạm vi |
| `docs/ALUMDOOR-CHAM-CONG-*`, `ALUMDOOR-HR-*`, `attendance*` | Nhân sự — ngoài phạm vi |
| `docs/ALUMDOOR-QUY-UOC-MA.md`, `ALUMDOOR-ANH-XA-MA-HANG-20260819.md` | Quy ước đặt mã hàng, không phải yêu cầu nghiệp vụ bán hàng (chỉ trích một điểm: cấm nhồi `TRONBO` vào mã) |
| `docs/ALUMDOOR-AUDIT-VONG-2-KET-QUA.md`, `ALUMDOOR-PROMPT-AUDIT-*` | Là báo cáo audit, không phải yêu cầu của chủ xưởng |
| `docs/FORGE_*`, `docs/BRD_SOCIAL_COMMERCE_*` | Nền tảng/sản phẩm khác |
| `apps/alumdoor/docs/nguon/ms-lien/*`, `ton-nhom/*`, `don-hang-xuat-hang/*` | Dữ liệu thô (hàng nghìn dòng số), không phải câu yêu cầu |

---

## 1. BẢNG ĐỐI CHIẾU

Ký hiệu: ✅ đã làm đúng · ⚠️ làm một phần/lệch · ❌ chưa làm · ❓ tài liệu mơ hồ.
Cột **Ảnh hưởng** chỉ điền cho ⚠️ và ❌.

### A. ĐO VÀ QUY ĐỔI KÍCH THƯỚC

| # | Yêu cầu (nguyên văn + `file:line`) | Đối chiếu | TT | Ảnh hưởng |
|---|---|---|---|---|
| A1 | *"Rộng đo theo — Đại lý: **PB nhựa** · Lẻ (gồm công trình, nhà thầu): **PB ray**"* — `docs/ALUMDOOR-LUAT-DO-VA-GIA.md:12-13` | `door-formulas.ts:50-51` khai `dealer_width_basis` / `retail_width_basis`; `door-formulas.ts:355-361` chọn cơ sở theo `customer_group`. Màn bán có đủ hai cột `Rộng PB ray` / `Rộng PB nhựa` (`AlumdoorSalesOrderLineTableComplete.tsx:148-149`) | ✅ | |
| A2 | *"Trừ khi cắt lá (cửa Đức) — Đại lý **0,02 m** · Lẻ **0,08 m**"* — `ALUMDOOR-LUAT-DO-VA-GIA.md:13`, `:70`; *"Chủ xưởng đã xác nhận 0,08"* `:61` | `door-formulas.ts:52-53` (`dealer_cut_deduction_m` / `retail_cut_deduction_m`) — số nằm trong danh mục `Công thức cửa`, không hard-code | ✅ | |
| A3 | **Nguyên văn chủ xưởng lại ghi khác:** *"+ Khách lẻ (nhận diện): Công thức = kích thước pb ray **- 0,06**"* — `apps/alumdoor/docs/nguon/quy-trinh-van-ban.md:144-145` | Hai tài liệu chọi nhau: docx gốc `−0,06`, bản chốt 29/07 `−0,08`. Cửa 4 m lệch 2 cm rộng cắt lá | ❓ | |
| A4 | *"PB ray = PB nhựa + 0,06"*, kèm tự khai *"**Đây là suy luận, không phải lời khách**"* — `ALUMDOOR-LUAT-DO-VA-GIA.md:24-26`, `:37` | Hằng số này đứng sau mọi phép so giá đại lý ↔ lẻ. Tài liệu tự đánh dấu chưa được chủ xưởng nói thẳng | ❓ | |
| A5 | Bảng công thức 5 dòng cửa (rộng cắt lá · mua vào · đại lý bán · lẻ bán) — `ALUMDOOR-LUAT-DO-VA-GIA.md:68-74` | `door-formulas.ts:10-17` (6 loại cửa) + `:44-77` `DoorFormulaPolicy` có đủ trục: bản bướm, tách món/trọn bộ, kéo tay, barem mua | ✅ | |
| A6 | *"Các công thức trong bảng là công thức **một bộ**. Tổng chứng từ nhân thêm `Số bộ`. Nếu một dòng đang ghi bề rộng tổng của nhiều cánh thì `Số bộ` phải là 1"* — `ALUMDOOR-LUAT-DO-VA-GIA.md:76-78` | `door-formulas.ts:365` `const billable = Math.max(rawArea, minimum) * sets;` — nhân đúng một lần | ✅ | |
| A7 | *"Cửa lưới: `3,5 × 4,90 = 17,15` với SL = 2 → **không** nhân số lượng … Anh xác nhận giúp em cách hiểu đúng"* — `docs/ALUMDOOR-QUY-TRINH.md:129-134` | Máy luôn nhân `số bộ`. Nếu cửa lưới thật sự khai bề rộng tổng 2 cánh thì mọi đơn cửa lưới **đang gấp đôi tiền** — hoặc người bán phải nhớ tự gõ số bộ = 1 | ❓ | |
| A8 | *"`CPB = CLL + 500mm` mọi dòng cửa"* — `apps/alumdoor/docs/BRD.md:687`; luồng bán bắt đầu bằng *"Sale nhận đo (**CLL × RLL**) + chọn LOẠI RAY → app quy ra CPB/RPBR/RPBN/RCL"* — `BRD.md:597-598` | Không có trường CLL/lọt lòng ở bất kỳ đâu trong `server/apps-src/alumdoor-worker/src` và `client/packages/vertical-alumdoor/src` (grep `cll|lot_long|lọt lòng|clear_opening` = 0 kết quả). Màn bán bắt nhập thẳng `Cao PB` | ❌ | **Vừa** — sale phải tự cộng 0,5 m trong đầu ở mọi đơn; gõ nhầm là sai số lá và sai m² |
| A9 | Công thức chia lá theo bản lá từng mã, ví dụ *"((3-0.13)/0.055)-1) = 52.18 – 1 = 51 lá … Làm tròn số phẩy lớn hơn 0.6"* — `quy-trinh-van-ban.md:167-174`; bảng 19 mã — `ANH-DA-CHEP.md:14-34` | `slats.ts` (186 dòng) + danh mục `Quy cách cửa` (`buoc_la_m`, `tru_mot_la`); `ALUMDOOR-DANH-MUC-HOI-TU-20260819.md:19` xác nhận bản lá đã ra khỏi code thành danh mục | ✅ | |
| A10 | *"`AL70` **không** trừ 1 lá khi đọc ở mốc số lá nhôm (42). Ở mốc lá ruột là 41"* — `BRD.md:692`; ba ảnh độc lập cùng ra 42 — `ANH-DA-CHEP.md:110-118` | Trường `tru_mot_la` trên `Quy cách cửa` (`sales-item-context.ts:835`); màn bán có cột `Lá một lớp` / `Lá hai lớp` (`AlumdoorSalesOrderLineTableComplete.tsx:161-162`, hằng `DYNAMIC_FALLBACK_LABELS`) đúng ca AL70 1 lớp/2 lớp của `quy-trinh-van-ban.md:349-357` | ✅ | |
| A11 | *"`AL552`. Ba nguồn nói ba kiểu … đời CŨ đang mang giá trị của đời MỚI … **giữ nguyên giá trị đang tính tiền** và chờ chủ xưởng chốt"* — `ALUMDOOR-DANH-MUC-HOI-TU-20260819.md:73-81` | Tài liệu tự khai đang treo. Sai một ước số chia là đổi số lá thật | ❓ | |
| A12 | *"Ray/trục bán Mét → SL tính tiền = `dài × số cây`"* — `ALUMDOOR-LUAT-DO-VA-GIA.md:109-110` | `document-validation.ts:859` từ chối payload lệch: *"SL tính tiền phải là … Mét = Cao × Số lượng"* | ✅ | |

### B. GIÁ, CHIẾT KHẤU, PHỤ THU

| # | Yêu cầu (nguyên văn + `file:line`) | Đối chiếu | TT | Ảnh hưởng |
|---|---|---|---|---|
| B1 | Cửa Đức: giá theo **MÃ**, hai cột `Chỉ lá` / `Tặng ray` (15 mã) — `BANG-GIA-CHINH-THUC-31-07-2026.md:61-77`; `BRD.md:495` | `Item Price` phân biệt bằng `price_variant` = `CHI_LA` / `TANG_RAY`; ví dụ đo thật `CDUC_AL70_1LOP m2: TANG_RAY 1.221.000 vs CHI_LA 1.146.000` — `server/briefs/alumdoor-v2.json:6039` | ✅ | |
| B2 | Nhãn hai mã giá đó hiện đang là chữ máy (`CHI_LA`/`TANG_RAY`) chứ không phải tiếng Việt | `AlumdoorSalesOrderLineTableComplete.tsx:790` đã ghi nhận: *"không có nó thì người bán phải tự dịch `TANG_RAY` và `CHI_LA`"* | ⚠️ **đang được sửa ở lượt này** | Thấp — khó chịu, không sai tiền |
| B3 | *"**Đơn giá "Tặng ray" áp dụng cho cửa từ 8m² trở lên**"* — `BANG-GIA-CHINH-THUC-31-07-2026.md:97`; *"Ray tặng chỉ áp cho cửa từ 8m² trở lên"* — `BRD.md:686` | Có dòng quyền lợi phi tiền tệ khi `area >= 8` (`server/packages/clouderp-selling/src/controllers.ts:370-382`). **Nhưng** việc chọn dòng giá `TANG_RAY` là ô tự chọn trên dòng bán — không thấy chỗ nào chặn chọn `TANG_RAY` cho cửa < 8 m² | ⚠️ | **Cao** — chọn nhầm mã giá là bán sai đơn giá (lệch 75.000 đ/m²) và hứa tặng ray không đúng chính sách |
| B4 | *"Tất cả chiết khấu 15% trực tiếp trên giá chỉ lá"* — `BANG-GIA-CHINH-THUC-31-07-2026.md:59` | `clouderp-selling/src/controllers.ts:330-338` `defaultAlumdoorDiscountPercent` trả 15 cho cửa Đức, 0 cho ray/trục và mặt hàng khác — suy từ Item master, **không tin `door_type` do client gửi** | ✅ | |
| B5 | *"Chiết khấu **≤15% Sale tự duyệt, >15% cần Giám đốc**"* — `BRD.md:685` | Server chỉ **gắn cờ**: `controllers.ts:187,247` `discount_requires_approval`; màn bán chỉ hiện một badge *"n dòng / thay đổi cần duyệt"* (`AlumdoorSalesOrderWorkbenchComplete.tsx:1209,1358`). Không có bước duyệt, không chặn lưu/ghi sổ | ⚠️ | **Cao** — sale hạ giá bao nhiêu cũng lưu được; cờ "cần duyệt" không dẫn tới ai duyệt |
| B6 | Cửa Úc: giá theo **độ dày** × (`Kéo tay` \| `Motor ngoài`); *"**Kéo tay ĐẮT HƠN motor ngoài** ở mọi độ dày"* — `BANG-GIA-CHINH-THUC-31-07-2026.md:104-112` | Có biến thể giá `KEO_TAY` / `MOTOR_NGOAI` (`briefs/alumdoor-v2.json:6042`); màn bán có cột `Kiểu lá / motor` với 3 giá trị `Kéo tay · Motor ngoài · Motor trong` (`AlumdoorSalesOrderWorkbenchComplete.tsx:457`) | ✅ | |
| B7 | *"**Màu bị ràng buộc theo độ dày**, không phải muốn màu nào cũng được"* (Úc: 4 Dem chỉ Xanh Ngọc–Vàng kem; 4.8–5.2 Dem chỉ Ghi Úc–Kem Úc…) — `BANG-GIA-CHINH-THUC-31-07-2026.md:104-113` | Có `color_scope` giới hạn màu, nhưng khoá theo **nhóm hàng / bề mặt** (`sales-item-context.ts:848-857`, `color-scopes.ts`), không theo **độ dày** | ⚠️ | **Vừa** — bán được cặp màu xưởng không làm cho độ dày đó; lộ ra lúc xuống xưởng |
| B8 | Đài Loan trọn bộ: **bậc diện tích 8 × 7 cột**, *"cận trên ĐÓNG, cận dưới MỞ: `4 < S ≤ 5`"* — `ANH-DA-CHEP.md:78`; `BRD.md:502-506` | Có doctype `Bậc diện tích` + `tier_code` (`alumdoor-sealed-price-authority.mjs:35-36`), sentinel `MOI-DIEN-TICH` cho dòng giá không gắn bậc (`:24`); có test `server/tests/alumdoor-area-tier-pricing.test.mjs` | ✅ | |
| B9 | *"`S < 4` dùng **giá trọn gói theo bộ**: 4 DEM 1.800.000 · 4.6 DEM 2.000.000 · 5.2 DEM 2.200.000"* — `BRD.md:508`; nguyên văn ảnh — `ANH-DA-CHEP.md:103` | Grep `1_800_000` / `TRON_GOI` trên toàn `server/scripts` = **0 kết quả**. Không có luật nào **thay** giá m² bằng giá theo bộ khi S < 4 | ❌ | **Cao** — cửa nhỏ tính theo m² sẽ ra tiền thấp hơn giá trọn gói; mất tiền thật trên mọi đơn cửa nhỏ |
| B10 | *"+ 300.000đ/bộ khi S < 7m² (**mọi dòng**)"* — `BRD.md:674`; *"Phụ thu 300.000đ đối với cửa nhỏ dưới 7m2"* — `ANH-DA-CHEP.md:102` | Đang có **bốn** luật khác ngưỡng nhau, sinh từ `ĐM.md` chứ không từ bảng có mộc: Đức `< 8`, Úc `< 7`, Đài Loan `< 8`, Lưới `< 8` — `server/scripts/build-alumdoor-pricing-payload.mjs:419-431` | ⚠️ | **Vừa** — Đức/ĐL/Lưới thu phụ thu ở dải 7–8 m² mà bảng có mộc không nói; đúng/sai đang tuỳ nguồn nào thắng |
| B11 | *"+ 40.000đ/m² khi 6m < ngang cửa < 7m5 · + 60.000đ/m² khi 7m5 < ngang cửa < 9m"* — `BRD.md:675-676`; `BANG-GIA-CHINH-THUC-31-07-2026.md:151`, `:167` | Không có luật giá nào điều kiện theo **bề rộng**. Toàn bộ điều kiện phụ thu trong `build-alumdoor-pricing-payload.mjs:419-431` đều theo `billable_area_sqm` hoặc `price_variant` | ❌ | **Cao** — cửa ngang > 6 m thiếu 40.000–60.000 đ/m²; một bộ 8 m² thiếu 320.000–480.000 đ |
| B12 | *"+ 20.000đ/m² cửa cuốn lò xo kéo tay (Đài Loan)"* — `BRD.md:677`; `BANG-GIA-CHINH-THUC-31-07-2026.md:150` | Có luật `PHUTHUCHUYENDOICUAKT` → biến thể `HAND_PULL`, `basis: "AREA_SQM"` — `build-alumdoor-pricing-payload.mjs:413-417`. Số tiền lấy từ `ĐM.md`, chưa đối chiếu với 20.000 của bảng có mộc | ⚠️ | **Thấp–Vừa** — cơ chế có, con số chưa được soi lại |
| B13 | *"**SƠN MÀU VÂN GỖ phụ thu thêm 360.000đ/m²**"* — `BANG-GIA-CHINH-THUC-31-07-2026.md:95`, `BRD.md:678` — **NHƯNG** `docs/ALUMDOOR_PRICING_SCOPE.md:21` ghi *"cửa vân gỗ **+465.000/m²**"* | Có luật `PHUTHU-SVG-LADUC` → `DUC_WOODGRAIN`, `basis: "AREA_SQM"` — `build-alumdoor-pricing-payload.mjs:451-455`. Cơ chế ✅, **con số hai tài liệu chọi nhau 105.000 đ/m²** | ❓ | |
| B14 | *"cửa dưới 8m² **phụ vận chuyển 300.000đ/bộ**"* (Đức) — `BANG-GIA-CHINH-THUC-31-07-2026.md:98-99`, `BRD.md:679` | `build-alumdoor-pricing-payload.mjs:419` `ALUMDOOR-PR:DUC-UNDER-8M2`, `basis: "SET_COUNT"`, điều kiện `billable_area_sqm < 8` | ✅ | |
| B15 | *"**Hàng thô không sơn GIẢM 70.000đ/m²**"* (Lưới) — `BANG-GIA-CHINH-THUC-31-07-2026.md:168`, `BRD.md:680` | Vòng xử lý `DEDUCTION` (`build-alumdoor-pricing-payload.mjs:353-360`) chỉ nhận dòng khớp `motorFamilyTarget`; mọi dòng khác rơi vào `blockers` `unresolved_deduction`. Không có luật giảm giá cho Lưới thô | ❌ | **Vừa** — bán hàng thô đúng giá hàng sơn ⇒ **thu thừa** của khách 70.000 đ/m² |
| B16 | *"**VAT 8%** cộng sau cùng trên mọi đơn giá"* — `BRD.md:684`; *"Giá **chưa gồm VAT 8%**"* xuất hiện ở cả 5 dòng cửa — `BANG-GIA-CHINH-THUC-31-07-2026.md:96,118,152,170,192` | Có ô `% VAT` + `Số tiền VAT`, tính đúng thứ tự `(hàng − CK + phụ thu) × VAT` — `ui-document-preview.ts:56-59`. **Nhưng `"default": 0`** — `server/briefs/alumdoor-v2.json:7452-7457` | ⚠️ | **Cao** — quên gõ 8 là đơn thiếu đúng 8% tiền, và không có gì báo |
| B17 | *"Motor và UPS tra theo diện tích — 15 loại motor ngưỡng `<15m²` → `<55m²`; UPS theo tải motor"* — `BRD.md:685`; bảng đầy đủ — `BANG-GIA-CHINH-THUC-31-07-2026.md:194-218` | Đã có máy tra: `motor-selection.ts` (cận trên MỞ, đúng dấu `<` của nguồn — `:41-53`) + route `alumdoor.motor.suggest` (`index.ts:2676-2688`). **Nhưng** màn bán chỉ có cột `Mô tơ` là ô Link tự chọn Item (`AlumdoorSalesOrderLineTableComplete.tsx:730`); không thấy màn bán gọi `alumdoor.motor.suggest` | ⚠️ | **Vừa** — luật đã có mà người bán vẫn chọn tay; chọn dư một cấp là khách trả thừa vài triệu, thiếu một cấp là motor quá tải trong hạn bảo hành |
| B18 | *"**Chiều rộng tối đa từng mã** — nhập rộng hơn ⇒ **chặn, không cho lưu đơn**"* — `BRD.md:686`; *"mỗi mã cửa Đức có **chiều rộng tối đa** — không bán được cửa rộng hơn"* — `BANG-GIA-CHINH-THUC-31-07-2026.md:254` | `rong_toi_da_mm` **chỉ được đọc ra và trả về** (`sales-item-context.ts:834`) — grep trên toàn `server/apps-src` + `client/packages/vertical-alumdoor/src` cho `rong_toi_da` chỉ ra **đúng 1 kết quả**, không có chỗ nào kiểm tra hay từ chối | ❌ | **Cao** — bán được cửa AL595 rộng 5 m (giới hạn `<4m`); đơn ra xưởng rồi mới lộ, phải huỷ hoặc đổi mã |
| B19 | *"**Giá tiền mặt = giá công nợ.** Ba hình thức: trả ngay · **đặt cọc** · trả sau. Có cọc là cho sản xuất, **không đặt mức tối thiểu**"* — `BRD.md:694-695`; báo giá xưởng có điều khoản *"`Cọc 50%`"* — `docs/sales/ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:41` | Có `payment_method` trên đơn (`briefs/alumdoor-v2.json` form Sales Order). Ô `Tiền cọc` đã có trong màn (`AlumdoorSalesOrderWorkbenchComplete.tsx:1188`, kiểm 0 ≤ cọc ≤ tổng ở `:1005-1006`) và preview đã tính `outstanding_amount` (`ui-document-preview.ts:60-61`), **nhưng `deposit_amount` chưa có trong brief** (grep = 0 kết quả). Chưa có luật "có cọc ⇒ cho sản xuất" | ⚠️ **đang được sửa ở lượt này** | **Vừa** — cọc chưa thành số trên sổ thì không chốt được lúc nào cho xuống xưởng |
| B20 | *"Đơn giá dòng nảy ra khi bán trọn bộ = **0đ, khóa không cho sửa**. Tiền tính một lần trên dòng cửa chính"* — `BRD.md:683`; *"đơn giá/thành tiền phần con luôn là `—` và **không tham gia tổng tiền đơn**"* — `docs/sales/README.md:79` | Hợp đồng composition 19/08 khai đúng như vậy (`docs/sales/README.md:70-81`); `ui-child-preview.ts` (754 dòng) hiện thực phần xổ dòng con | ✅ | |
| B21 | *"**Cửa Lưới trọn bộ**: nhân đơn giá vào **tổng diện tích**, một lần"* — `BRD.md:690` | `door-formulas.ts:365-376`: `billable = area_per_set × sets`, `sales_amount = billable × rate` — nhân đơn giá đúng một lần vào tổng | ✅ | |
| B22 | *"ĐVT hiện chỉ là **nhãn** — máy chưa quy đổi. Ray mua theo cây, bán theo **mét** … nên **bắt buộc phải quy đổi**"* — `docs/ALUMDOOR-QUY-TRINH.md:562`, `:364-367` | Cơ chế có: `stock_qty = qty × conversion_factor` là trục riêng, không lấy tính tiền (`ALUMDOOR-LUAT-DO-VA-GIA.md:113`); màn bán có xử lý lỗi 422 *"ĐVT … chưa được khai"* kèm `uom_gap.fix_where` (`AlumdoorSalesOrderWorkbenchComplete.tsx:189-195`). **Dữ liệu thì chưa**: `nhap/DANH-MUC-MAT-HANG.md:7` *"Hệ số quy đổi … Đang để `0` = chưa khai"* — đếm được **74** dòng còn `= 0`, gồm cả `RT_RAY_HOP_TD_U100` tồn Kg / bán Mét (`:313`) | ⚠️ | **Cao** — bán ray/trục theo mét sẽ bị chặn hoặc trừ kho sai; 74 mã đang treo |

### C. QUY TRÌNH ĐƠN — TẠO, TỒN, IN, RA XƯỞNG

| # | Yêu cầu (nguyên văn + `file:line`) | Đối chiếu | TT | Ảnh hưởng |
|---|---|---|---|---|
| C1 | *"một số chứng từ = nhiều dòng hàng … Đúng mô hình **Đơn hàng có nhiều dòng** … xác nhận lại việc **bán tách món**: một đơn có cả cửa lẫn phụ kiện rời"* — `docs/ALUMDOOR-QUY-TRINH.md:539-545` | Màn bán là bảng nhiều dòng, mỗi dòng một mã hàng riêng với ĐVT riêng (`AlumdoorSalesOrderLineTableComplete.tsx:112-127`) | ✅ | |
| C2 | *"Báo giá → Đơn hàng, bấm nhiều lần vẫn ra **đúng một đơn**"* · *"Bảng giá: chọn thì **server quyết giá**"* — `docs/ALUMDOOR-QUY-TRINH.md:89-90` | `ALUMDOOR-QUY-TRINH.md:621` liệt phép thử *"báo giá → đơn hàng · chặn chuyển hai lần"* và *"bảng giá server quyết · chặn thiếu giá"*; `ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:13-21` xác nhận đã chạy thật | ✅ | |
| C3 | *"app hiện **TỒN KHẢ DỤNG theo khổ ngay tại màn nhập**"* — `BRD.md:600`; *"tồn khả dụng của nhôm không phải một con số, mà là một **bảng theo khổ**"* — `docs/ALUMDOOR-QUY-TRINH.md:509` | **Giữ chỗ ĐÃ CÓ THẬT** — doctype `Stock Reservation` với `min_length_m` + `qty_reserved`, cấp/thu hồi tự động (`aluminum-supply-demand.ts:199-358`). ⇒ **`ALUMDOOR-QUY-TRINH.md:458-460` ghi "⛔ KHÔNG CÓ" nay đã LỖI THỜI.** Nhưng màn bán **không hiện**: `available_qty` chỉ tồn tại trong `sales-order-v2/model.ts:88,213,393`, không có `ColumnId` nào cho nó (`AlumdoorSalesOrderLineTableComplete.tsx:112-127`) | ⚠️ | **Cao** — người bán vẫn hứa hàng mà không nhìn thấy còn bao nhiêu; đúng ca "ghi thành công nhưng sai" mà `ALUMDOOR-QUY-TRINH.md:447-451` cảnh báo |
| C4 | Mốc giữ chỗ = **phát lệnh sản xuất** — `BRD.md:446-448`, đánh dấu **Giả định A3** chờ xác nhận — `apps/alumdoor/docs/CAU-HOI-XUONG.md:30` | Máy đang chạy theo mặc định này. Chủ xưởng chưa chốt | ❓ | |
| C5 | *"chọn cách bán → **nảy dòng phụ kiện (đơn giá 0đ, khóa)**"* — `BRD.md:601` | `ui-child-preview.ts` + hợp đồng `docs/sales/README.md:70-81` (`SL` dòng con theo số bộ dòng cha; ray lấy dài theo Cao PB, trục theo Rộng PB) | ✅ | |
| C6 | *"Kế toán nhập lỗi … sẽ tìm số chứng từ theo Khách hàng đã đặt và bấm chữ lỗi … Em muốn hiển thị thêm **1 cột lỗi** vì khi nhập hàng lỗi về em muốn biết sản phẩm lỗi phát sinh từ **số chứng từ nào**"* — `quy-trinh-van-ban.md:56-61`; cột `LỖI SP` có thật trong sheet T6/T7 — `ALUMDOOR-QUY-TRINH.md:535` | Doctype cửa lỗi + 11 nguyên nhân đã tạo nhưng **cố ý hoãn màn nhập** (`ALUMDOOR-DANH-MUC-HOI-TU-20260819.md:48` mục H6). Màn bán không có cột/nút Lỗi | ❌ | **Thấp–Vừa** — chỉ chậm việc tra ngược khi đổi bảo hành, không sai tiền |
| C7 | Sổ theo dõi đơn phải có cột *"**THU TIỀN BAO NHIÊU (NẾU CÓ)**"* — `quy-trinh-van-ban.md:55` | Chính là ô `Tiền cọc` đang được thêm — xem B19 | ⚠️ **đang được sửa ở lượt này** | Vừa |
| C8 | *"kế toán phải tự điều chỉnh tay ở **cột giao hàng** để nắm lịch trình giao hàng và sắp xếp sản xuất"* — `quy-trinh-van-ban.md:50`; cột `NGÀY GIAO HÀNG` — `:55` | Trường `Ngày giao dự kiến` có trong form Sales Order (`briefs/alumdoor-v2.json`, khối form Sales Order) | ✅ | |
| C9 | Cột **`LỆNH XUẤT KHO` (đã xuất hàng thành công)** và **`LỆNH SẢN XUẤT` (đã tạo ĐH sản xuất)** trên sổ theo dõi đơn — `quy-trinh-van-ban.md:55` | Đơn có `delivered_percentage` / `billed_percentage` (form Sales Order trong brief); nút chuyển `Đơn hàng → Phiếu xuất`, `Đơn hàng → Hoá đơn` đã chạy thật (`ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:17-19`). Không có ô riêng cho "Lệnh xuất kho" tách khỏi "Phiếu xuất kho" | ⚠️ | **Thấp** — chính chủ xưởng cũng chưa nói rõ hai thứ khác nhau chỗ nào (`ALUMDOOR-QUY-TRINH.md:550-551`) |
| C10 | *"Mẫu đơn đặt hàng xưởng dùng"* — `apps/alumdoor/docs/nguon/00-MUC-LUC.md:99` (`MẪU ĐƠN ĐẶT HÀNG.pdf`); mẫu in đã thiết kế *"`Đơn bán hàng ALUMDOOR` — 13 cột, số đo cửa, số bộ, đơn giá, mô tơ/phụ kiện và ghi chú lắp đặt"* — `docs/PRINT_DESIGN_ROADMAP.md:23-25` | Route in có (`client/packages/views/src/print/printRoute.ts:3`), tab `/print/Sales Order/DH-2026-0068` đang mở trên máy. Nút in trên màn bán đang được nối ở lượt này | ⚠️ **đang được sửa ở lượt này** | Vừa — không in được thì đơn không giao được cho khách ký |
| C11 | *"**Thời gian giao hàng 3–7 ngày (trừ Lễ và Chủ nhật)**"* — `BANG-GIA-CHINH-THUC-31-07-2026.md:169`, `BRD.md:687` | Grep `3-7 ngày` / `sla` trong `server/apps-src/alumdoor-worker/src` và `briefs/alumdoor-v2.json` = 0 kết quả. Ngày giao để trống cho người gõ | ❌ | **Thấp** — chỉ là gợi ý ngày; kế toán vẫn tự đặt |
| C12 | *"Trường hợp khách **chỉ đặt lá ruột hoặc lá đầu hoặc bộ 3 lá đáy** … thì kế toán sẽ điều chỉnh thế nào anh?"* — `quy-trinh-van-ban.md:139-140`; *"Nếu như đặt hàng khách chỉ lấy lá ruột thôi thì đặt hàng làm sao để "đơn hàng sản xuất" hiểu rằng chỉ lấy lá hoặc phụ kiện chứ không lấy hoàn thiện?"* — `:422-423`; *"⛔ Giá **LÁ RỜI** vẫn chưa có"* — `ALUMDOOR-QUY-TRINH.md:136-142` | Chính chủ xưởng đặt câu hỏi và chưa ai trả lời. Câu hỏi vẫn nằm nguyên trong `ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:110` | ❓ | |
| C13 | Màn **Báo giá** dùng form thường, ô "Phương án bán" không lọc theo mặt hàng — *"Cần anh chốt: báo giá dùng form thường như hiện tại, hay cho báo giá **dùng chung màn với đơn hàng**?"* — `ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:59-80` | Đúng như tài liệu mô tả: chỉ `Sales Order` có màn nghiệp vụ riêng (`AlumdoorSalesOrderWorkbenchComplete.tsx`, 1.273 dòng) | ❓ | |
| C14 | *"Xuất hoá đơn có được vượt số ĐÃ GIAO không? … giữ nguyên (cho phép thu trước), hay chặn?"* — `ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:36-46` | Máy đang cho thu trước, có hiện cột "đã giao" để người lập tự thấy | ❓ | |
| C15 | *"Hoá đơn → công nợ · Phiếu thu → trừ nợ"* và *"In hoá đơn / báo giá, có dòng hàng và dấu phân cách tiền"* — `ALUMDOOR-QUY-TRINH.md:92-93` | Đã chạy thật, có bằng chứng đọc **SỔ** chứ không chỉ chứng từ — `ALUMDOOR-QUY-TRINH.md:615-621`, `ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:25-30` | ✅ | |
| C16 | *"Phiếu xuất kho — trừ tồn thật, **từ chối khi không đủ**"* — `ALUMDOOR-QUY-TRINH.md:91` — nhưng chính tài liệu tự khai *"đường chạy thật thì chưa"* vì bản cách ly không có tồn — `ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:136-138` | Luật có phép thử; đường chạy thật chưa chứng minh | ⚠️ | **Vừa** — chưa biết chắc tồn bị trừ đúng khi bán thật |
| C17 | *"Không được dựng lại `Sales Option` hoặc `Sales Package` như một lớp trung gian cho Alumdoor"* — `docs/sales/README.md:46`; *"nhồi cách bán vào mã hàng chính là **dựng lại `Sales Option` qua cửa sau**"* — `ALUMDOOR-DANH-MUC-HOI-TU-20260819.md:244-245` | Màn bán dùng `price_variant` (chọn DÒNG GIÁ), brief nói rõ *"Đây KHÔNG phải Cách bán"* — `briefs/alumdoor-v2.json:6039` | ✅ | |

---

## 2. MÀN BÁN HÀNG ĐANG LÀM MÀ TÀI LIỆU KHÔNG YÊU CẦU

Chủ xưởng đã tự chỉ ra hai cái đầu. Dưới đây là danh sách đầy đủ tôi tìm được, xếp theo độ chắc chắn.

| # | Thứ đang có trên màn | Ở đâu | Tài liệu nào yêu cầu? |
|---|---|---|---|
| T1 | Cột **"Quy ra tồn"** | `AlumdoorSalesOrderLineTableComplete.tsx:1054` | **Không tài liệu nào.** Chính code đã ghi *"21/08/2026: lúc tạo đơn không cần"* (`:610`). **Đang gỡ ở lượt này** |
| T2 | Cột **"Tổng số lá"** lúc tạo đơn | `AlumdoorSalesOrderLineTableComplete.tsx:710` | **Không.** Số lá là dữ liệu của **đơn hàng sản xuất** (`quy-trinh-van-ban.md:130-137`), không phải đơn đặt hàng khách ký. **Đang gỡ ở lượt này** |
| T3 | Cột **"KL dự kiến (kg)"** `estimated_weight_kg` | `AlumdoorSalesOrderLineTableComplete.tsx:163` (`DYNAMIC_FALLBACK_LABELS`), khoá read-only trong `FORCE_READ_ONLY` `:196-201` | **Không.** Cân nặng trong tài liệu chỉ dùng hai chỗ: đối chiếu **nhập mua** (`ALUMDOOR-QUY-TRINH.md:374`) và **chọn motor** (`:209`). Không nguồn nào bảo in kg lên đơn bán. Cột `SỐ KG` trong `quy-trinh-van-ban.md:134` nằm trên **đơn hàng sản xuất**, và kế toán **điền tay** (`:368`) |
| T4 | Cột **"Rộng cắt lá"** (chỉ đọc) trên màn tạo đơn | `AlumdoorSalesOrderLineTableComplete.tsx:153` (`DYNAMIC_FALLBACK_LABELS`), khoá read-only `:196-201` | **Không trực tiếp.** Chủ xưởng đặt "Chiều rộng cắt lá" ở cột (8) của **đơn hàng sản xuất** (`quy-trinh-van-ban.md:300-301`, `:361-367`), không phải đơn đặt hàng. Nó chỉ có lý do tồn tại trên đơn bán khi bán **tách món** (rộng cắt lá tham gia cơ sở tính tiền — `ALUMDOOR-DANH-MUC-HOI-TU-20260819.md:21`) ⇒ nên hiện **có điều kiện**, không hiện luôn |
| T5 | Khối **xem trước BOM / "BOM thực tế"** trên đơn bán | `AlumdoorSalesOrderWorkbenchComplete.tsx:26` (`AlumdoorBomActualEditor`), `:1205` `bomBlocked` | **Không.** Chủ xưởng xổ cấu thành ở **"đơn hàng sản xuất"** (`quy-trinh-van-ban.md:86-137`). Hợp đồng 19/08 (`docs/sales/README.md:70-81`) là **quyết định của bên phát triển**, không phải câu chủ xưởng nói. Đây là khối nặng nhất trên màn |
| T6 | Trường **"Lý do đổi vận hành"** (`operational_change_reason`) | `briefs/alumdoor-v2.json`, form Sales Order | **Không.** Chủ xưởng chỉ yêu cầu hai ô ghi chú: *"GHI CHÚ (CỐ ĐỊNH THEO ĐƠN ĐẶT HÀNG)"* và *"GHI CHÚ TAY (TỰ ĐIỀN)"* — `quy-trinh-van-ban.md:55`. Đây là trường quản trị của nền tảng |
| T7 | Cột **"Số cây/lá"** (`qty_bar`) song song với ô **Số lượng** | `AlumdoorSalesOrderLineTableComplete.tsx:159-160` (`DYNAMIC_FALLBACK_LABELS`) | **Có lý do** (ray/trục bán mét: `SL = dài × số cây` — `ALUMDOOR-LUAT-DO-VA-GIA.md:109`), nhưng hiện **hai ô số lượng cạnh nhau** trên cùng một dòng là chỗ dễ gõ nhầm. Xin chủ xưởng xác nhận cách hiển thị |

> Ba cột T1–T3 và khối T5 gộp lại là phần lớn bề ngang của bảng dòng hàng. Bỏ chúng thì màn tạo
> đơn gần với đúng cái sổ chủ xưởng mô tả: *Tên SP/Vật tư × kích thước × màu × tự dừng × số bộ*
> (`quy-trinh-van-ban.md:113-114`).

---

## 3. TÀI LIỆU ĐÃ LỖI THỜI — nói thẳng

| Chỗ | Tài liệu ghi | Thực tế trong code |
|---|---|---|
| Giữ chỗ tồn | *"**Đã có đơn (giữ chỗ)** ⛔ **KHÔNG CÓ** — Không có gì đánh dấu lá đã hứa cho đơn nào"* · *"**Tồn khả dụng** ⛔ KHÔNG CÓ"* — `docs/ALUMDOOR-QUY-TRINH.md:458-460` | **Đã có**: doctype `Stock Reservation` giữ theo `(mã · kho · khổ tối thiểu)` đúng như §5.5 đòi, cấp/thu hồi/hết hạn tự động — `aluminum-supply-demand.ts:199-358`. Chỉ còn thiếu chỗ **hiện nó ra ở màn bán** |
| Công thức chia lá | `ALUMDOOR-QUY-TRINH.md:150` ghi ✅ 19 mã | Vẫn đúng, nhưng bản lá **đã chuyển từ code sang danh mục `Quy cách cửa`** từ 19/08 (`ALUMDOOR-DANH-MUC-HOI-TU-20260819.md:19`) — tài liệu quy trình chưa cập nhật |
| Cách bán / Gói bán | `ALUMDOOR_SALES_BUSINESS_CASE_MATRIX.md` (11/08) còn mô tả `Sales Option = NO_RAIL/WITH_RAIL` | **Đã xoá 14/08** (`docs/sales/README.md:8-14`). Bất kỳ ai đọc file 11/08 rồi làm theo là dựng lại lớp đã bị cấm |
| Bản lá "xung đột" | Kết luận cũ *"danh mục sản phẩm.xlsx sai bản lá ở 5 mã"* | Đã **rút lại** — hai cột đo hai đại lượng khác nhau (bề rộng nan vs bước lá) — `BANG-GIA-CHINH-THUC-31-07-2026.md:38-40` |

---

## 4. CÂU HỎI CẦN CHỦ XƯỞNG LÀM RÕ

### Nhóm 1 — chạm TIỀN, xin trả lời trước

1. **Rộng cắt lá khách lẻ trừ bao nhiêu?** File gốc của anh ghi `pb ray − 0,06`
   (`quy-trinh-van-ban.md:145`), bản chốt 29/07 ghi `pb ray − 0,08`
   (`ALUMDOOR-LUAT-DO-VA-GIA.md:13,61`). Máy đang chạy 0,08.
2. **Phụ thu SƠN VÂN GỖ là 360.000 hay 465.000 đ/m²?** Bảng có mộc ghi 360.000
   (`BANG-GIA-CHINH-THUC-31-07-2026.md:95`), cấu hình local ghi 465.000
   (`ALUMDOOR_PRICING_SCOPE.md:21`).
3. **Phụ thu cửa nhỏ 300.000đ áp theo ngưỡng nào?** Bảng có mộc: `S < 7m²` cho Úc và Lưới,
   `S < 8m²` cho vận chuyển cửa Đức. Máy đang chạy bốn ngưỡng khác nhau: Đức `<8`, Úc `<7`,
   Đài Loan `<8`, Lưới `<8`.
4. **Phụ thu theo NGANG CỬA (`+40.000/m²` khi 6–7,5 m; `+60.000/m²` khi 7,5–9 m) còn hiệu lực
   không?** Hiện **chưa làm** — mọi đơn cửa rộng đang thiếu khoản này.
5. **Giá TRỌN GÓI cho cửa dưới 4m² (1.800.000 / 2.000.000 / 2.200.000 đ/bộ) còn dùng không?**
   Hiện **chưa làm** — cửa nhỏ đang tính theo m².
6. **Cửa Lưới hàng thô không sơn có còn GIẢM 70.000 đ/m² không?** Hiện **chưa làm** — đang thu
   như hàng sơn.
7. **VAT: có nên mặc định 8% cho mọi đơn không?** Hiện mặc định **0%** — quên gõ là thiếu 8% tiền.
8. **Chiết khấu trên 15%: ai duyệt và duyệt ở đâu?** Hiện chỉ hiện một badge "cần duyệt",
   không chặn lưu, không có người duyệt.
9. **Dòng giá "Tặng ray" có được phép chọn cho cửa dưới 8m² không?** Hiện không chặn.
10. **Đơn giá cửa Úc tấm liền "đã bao gồm phụ kiện hoàn thiện (Trục, Ray, Puly, Lò xo, Cùm Gang,
    Giá đỡ T…)"** (`BANG-GIA-CHINH-THUC-31-07-2026.md:117`) — vậy trên cùng một đơn, có được
    bán thêm các phụ kiện đó thành dòng riêng có tiền không, hay phải chặn?
11. **Cửa lưới: `RỘNG PBRAY` khai trên đơn là bề rộng MỘT cánh hay TỔNG cả 2 cánh?**
    (`ALUMDOOR-QUY-TRINH.md:129-134`) — máy luôn nhân `số bộ`; nếu là tổng thì đang gấp đôi tiền.
12. **Giá LÁ RỜI tính theo lá, theo mét dài, hay theo kg?** (`ALUMDOOR-QUY-TRINH.md:140-142`) —
    hỏi từ tháng 7, vẫn chưa có câu trả lời.

### Nhóm 2 — chạm ĐƠN RA XƯỞNG

13. **Sale nhập số đo LỌT LÒNG (CLL × RLL) rồi máy tự cộng 0,5 m ra CPB, hay sale nhập thẳng
    Cao phủ bì?** BRD ghi `CPB = CLL + 500mm` (`BRD.md:687`) nhưng màn đang bắt nhập thẳng CPB.
14. **Có chặn cứng khi rộng cửa vượt "rộng tối đa" của mã không?** Ví dụ AL595 giới hạn `<4m`.
    Hiện **không chặn**, đơn vẫn lưu được.
15. **Màu cửa Úc có bị ràng theo độ dày không?** Bảng giá xếp cặp màu theo từng độ dày
    (`BANG-GIA-CHINH-THUC-31-07-2026.md:104-113`); máy hiện chỉ ràng màu theo nhóm hàng.
16. **Máy có nên tự đề xuất MOTOR/UPS theo diện tích cửa ngay trên dòng bán không?**
    Bảng tra đã có sẵn (`motor-selection.ts`), nhưng người bán vẫn phải tự chọn.
17. **Mốc GIỮ CHỖ tồn: phát lệnh sản xuất — xác nhận đúng chứ?** (Giả định A3,
    `CAU-HOI-XUONG.md:30`). Và có cần hiện **tồn khả dụng theo khổ** ngay trên dòng bán không?
18. **Khách chỉ mua lá ruột / lá đầu / bộ 3 lá đáy thì nhập đơn thế nào** để đơn sản xuất hiểu là
    "chỉ lấy lá, không lấy hoàn thiện"? (`quy-trinh-van-ban.md:140`, `:422-423`)
19. **Có cọc là cho xuống xưởng ngay, không có mức tối thiểu — xác nhận?** Và báo giá ghi
    "Cọc 50%" thì máy có nên gợi ý sẵn 50% không?
20. **`AL552` đời CŨ bản lá là 0,05 hay 0,057?** (`ALUMDOOR-DANH-MUC-HOI-TU-20260819.md:73-81`)
    Sai một ước số chia là đổi số lá thật.

### Nhóm 3 — hình thức, không sai tiền

21. **Ba cột "Quy ra tồn", "Tổng số lá", "KL dự kiến (kg)" và cột "Rộng cắt lá" — bỏ hết ở màn
    tạo đơn chứ?** Hai cột đầu anh đã nói bỏ; hai cái sau cũng không có trong sổ anh mô tả.
22. **Khối "BOM thực tế / cấu thành" có cần trên đơn BÁN không**, hay chỉ cần ở đơn sản xuất?
23. **Cột "LỖI" (truy về số chứng từ gốc khi nhập hàng lỗi) có cần đặt ngay trên màn bán hàng
    không?** (`quy-trinh-van-ban.md:56-61`) Hiện chưa có ở đâu.
24. **`LỆNH XUẤT KHO` khác `PHIẾU XUẤT KHO` ở chỗ nào?** (`ALUMDOOR-QUY-TRINH.md:550-551`) —
    hỏi từ tháng 7, chưa có câu trả lời.
25. **Máy có nên tự đề xuất ngày giao theo SLA 3–7 ngày (trừ Lễ và Chủ nhật) không?**
    (`BANG-GIA-CHINH-THUC-31-07-2026.md:169`)
26. **Màn Báo giá: dùng form thường như hiện tại, hay dùng chung màn với Đơn hàng?**
    (`ALUMDOOR_SALES_QUYET_DINH_CAN_CHOT_20260814.md:75-80`)

---

## 5. TỔNG KẾT SỐ

| Trạng thái | Số yêu cầu |
|---|---:|
| ✅ ĐÃ LÀM ĐÚNG | 17 |
| ⚠️ LÀM MỘT PHẦN / LỆCH | 12 *(trong đó 4 đang được sửa ở lượt này)* |
| ❌ CHƯA LÀM | 7 |
| ❓ TÀI LIỆU MƠ HỒ | 15 |
| **Tổng** | **51** |

**Bảy việc chưa làm:** A8 (CPB = CLL + 500), B9 (giá trọn gói < 4m²), B11 (phụ thu theo ngang
cửa), B15 (giảm 70.000/m² hàng thô), B18 (chặn rộng tối đa), C6 (cột Lỗi), C11 (SLA 3–7 ngày).

**Năm lệch nghiêm trọng nhất — xếp theo tiền:**

1. **B11** — thiếu hẳn phụ thu theo ngang cửa (40.000/60.000 đ/m²). Một bộ 8 m² thiếu tới 480.000 đ.
2. **B18** — không chặn rộng vượt giới hạn mã. Đơn ký xong mới lộ, phải huỷ hoặc đổi mã.
3. **B16** — VAT mặc định 0%. Quên gõ là đơn thiếu đúng 8%.
4. **B9** — cửa dưới 4 m² không dùng giá trọn gói theo bộ. Bán rẻ hơn bảng giá có mộc.
5. **B5 + B3** — chiết khấu >15% không ai duyệt, và dòng giá "Tặng ray" chọn được cho cửa <8 m².
   Hai chỗ này cho phép người bán hạ/nâng giá ra ngoài chính sách mà không có gì chặn.
