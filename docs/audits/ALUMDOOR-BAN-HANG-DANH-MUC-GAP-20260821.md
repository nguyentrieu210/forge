# Alumdoor — kiểm kê khoảng trống giữa DANH MỤC và MÀN BÁN HÀNG

> Ngày 2026-08-21 · làn A (server/hợp đồng dữ liệu) của nhánh `feat/ban-hang-danh-muc`.
> Câu hỏi của bản kiểm kê: **danh mục đã biết điều gì mà màn bán hàng không được nghe?**
>
> Hai bề mặt server mà màn bán hàng thật sự đọc:
> - `alumdoor.sales.item_context` → `server/apps-src/alumdoor-worker/src/sales-item-context.ts`
> - `metaforge.api.preview_sales_commercial_line` → `server/packages/frappe-api/src/alumdoor-commercial.ts`
>
> Nguồn brief đối chiếu: `server/briefs/alumdoor-v2.json` (id `alumdoor`, version **2.10.0**, 100 DocType).

---

## 0. Cách xếp hạng

Theo đúng thứ tự đề bài: **mức chạm tiền trước, tiện dụng sau.**

| Hạng | Nghĩa |
|---|---|
| **P0** | Sai hoặc thiếu ở đây thì ra **một con số tiền sai**, hoặc hứa với khách một thứ không có trong kho |
| **P1** | Không sai tiền, nhưng người bán **không giải trình được** con số, hoặc phải mở màn khác mới biết |
| **P2** | Tiện dụng thuần tuý |

Một cột riêng — **"luật đang ngủ"** — đánh dấu chỗ **dữ liệu/luật đã tồn tại và đã chạy, nhưng
không ai đọc kết quả**. Đây là loại hỏng tệ nhất trong repo này: không nổ, chỉ là luật không tới
được người dùng, nên trông như "tính năng chưa làm".

---

## 1. Bảng đối chiếu chính

Cột "trả ra chưa" đọc trên đúng hai file trên, **trước** đợt sửa 21/08.

| # | Năng lực danh mục (nguồn) | `item_context` | `preview_sales_commercial_line` | Màn bán dùng được? | Hạng | Ngủ? |
|---|---|---|---|---|---|---|
| G1 | **Thang ĐVT thật** — `Item.default_purchase_uom` / `stock_uom` / `default_sales_uom` + bảng `uom_conversions` | Chỉ `stock_uom`, `selected_uom`, `allowed_uoms`, `uom_options`. **Không có ĐVT mua**, không nói hệ số nào TRỐNG | không | Không — không biết mã nào đang thiếu hệ số | **P0** | |
| G2 | **Hệ số Mét→Cây của 33 mã `RT_` CỐ Ý để trống** (chốt 20/08) | Rơi vào nhánh `422 ĐVT "Mét" chưa được khai`, **không nói vì sao và sửa ở đâu** | không | Không — 422 trần trụi, sửa ở đâu thì đoán | **P0** | |
| G3 | **Mua Kg · tồn CÂY · bán Mét** (nhóm `RT_`, `has_catch_weight`, `weight_uom`) | Không có khái niệm cân. `available_stock_qty` một trục duy nhất | không | Không — không có "hai con số song song trên một dòng" | **P0** | |
| G4 | **Tồn theo lô** — `Batch` (`length_m`, `color`, `condition`, `is_offcut`, `intake_kg`), báo cáo `Batch Stock Balance` | Không đọc. Chỉ `Stock Balance` tổng | không | Không — bán ray/trục mà không thấy cây nào dài bao nhiêu | **P0** | ✅ |
| G5 | **Cảnh báo bán vượt tồn** | Không: method không nhận `qty`, nên không so được | không | Không | **P0** | |
| G6 | **`Item Price` nào đang áp và vì sao** — `uom`, `area_tier`, `price_variant`, `rate` gốc | Có `item_price` (tên) + `rate` đã quy đổi. Không nói ĐVT của bản ghi giá, không nói bậc, không nói đã quy đổi từ ĐVT nào | `item_price` + `price_variant` + `base_rate`. **`uom` và `source_uom` do `resolveServerPrice` tính ra rồi bị `resolveCommercialLine` VỨT** | Không giải trình được | **P0** | ✅ |
| G7 | **`Bậc diện tích`** — `Item Price.area_tier` là `Link` BẮT BUỘC, `priceTierMatches` fail-closed | không | Bậc tham gia chọn giá nhưng **không bao giờ nói ra bậc nào đã trúng** | Không | **P0** | ✅ |
| G8 | **`Pricing Scope`** — `Pricing Rule.pricing_scope` + `Pricing Scope.members` | không | `pricing_rule_snapshots` có `rule_name` nhưng **không có `pricing_scope`**, nên không biết vì sao luật lọt | Không | **P1** | ✅ |
| G9 | **`Item.min_area_sqm`** (diện tích tối thiểu tính tiền / bộ) | Có (số trần) | không | Nửa — có số nhưng không biết nó có ĂN vào dòng này không | **P1** | |
| G10 | **`Measurement Profile`** — `track_dimension_lot`, `require_color/condition/length/width/piece_qty`, `track_bundle_qty`, `weight_tolerance_pct` | Chỉ trả **TÊN** profile | không | Không — 8 cờ quyết định ô nào bắt buộc, không cái nào tới màn | **P1** | ✅ |
| G11 | **`Material Specification`** — `standard_length_m` (Chiều dài cây chuẩn), `theoretical_kg_per_m` (Kg/m lý thuyết), `thickness_mm`, `effective_width_m`, `scrap_threshold_m` | Không đọc. `Item.material_specification` không cả được echo | không | Không | **P1** | ✅ |
| G12 | **`Quy cách cửa`** (Bản lá theo mã nhôm) — `buoc_la_m`, `trong_luong_kg_m2`, `doi`, `nguon` | Chỉ `Item.leaf_divisor_m` (bản sao trên Item), không nói lấy từ quy cách nào | không | Nửa | **P1** | ✅ |
| G13 | **`Geometry Profile`** — bộ trường hình học áp cho nhóm hàng | Chỉ có `door_type`. Không nói mã nào **chưa có bộ quy cách phủ** | không | Không | **P1** | |
| G14 | **Màu theo phạm vi** — `color-scopes.ts` (`finishColorContextForItem`: Bề mặt hợp lệ → màu theo từng Bề mặt) | `default_color` — **trường này KHÔNG CÒN TỒN TẠI trong brief v2** ⇒ luôn `null` | không | Không. Màn đang gọi riêng `alumdoor.catalog.allowed_colors` → **danh sách PHẲNG**; `alumdoor.catalog.finish_color_context` đã viết, đã đăng ký, **chưa ai gọi** | **P1** | ✅✅ |
| G15 | **Sẵn sàng của mã hàng** — `catalog-readiness.ts` | Không có phép đo **theo từng mã**; `readCatalogReadiness` chỉ đo toàn danh mục cho màn Danh mục | không | Không — bán hàng hứa với khách trước, biết thiếu sau | **P0** | |
| G16 | **`Cutting Policy` / công thức cửa + `ray_type`** | không (thuộc `alumdoor.sales.production_line_context`) | không | Có, qua method khác — **không phải khoảng trống của làn này** | — | |
| G17 | **`inventory_mode` suy từ `measurement_profile`** | Có, và đã xử lý đúng cả hai đời dữ liệu | có gián tiếp | Có | — | |

---

## 2. Bốn luật đang NGỦ IM LẶNG — nói rõ vì đây là loại hỏng tệ nhất

### N1. `resolveServerPrice` tính `uom` và `source_uom` rồi bị vứt trên đường về

`server/packages/clouderp-pricing/src/index.ts` kết thúc bằng:

```ts
...((lineUom || priceUom) ? { uom: lineUom || priceUom } : {}),
...(convertedFromUom ? { source_uom: convertedFromUom } : {}),
```

`convertedFromUom` là **đường lùi về ĐVT gốc**: khi không có dòng giá cho ĐVT của dòng bán, engine
lấy giá của ĐVT mặc định rồi **nhân chéo hệ số quy đổi**. Đó là lúc con số trên màn KHÁC hẳn con
số người khai giá gõ vào — và đúng lúc đó thì `resolveCommercialLine`
(`server/packages/clouderp-selling/src/commercial-line-resolver.ts`) dựng object trả về **không
chép hai khoá này sang**. Người bán thấy một đơn giá lạ và không có đường nào truy ra vì sao.

> Không sửa được tại chỗ: `commercial-line-resolver.ts` **ngoài làn A**. Đã bù bằng cách đọc thẳng
> bản ghi `Item Price` trong `previewSalesCommercialLine` (xem `price_explain.converted_from_uom`).

### N2. `Bậc diện tích` quyết định giá nhưng không bao giờ tự khai

`Item Price.area_tier` là `Link` **bắt buộc**, mặc định `MOI-DIEN-TICH`. `priceTierMatches`
fail-closed hai chiều: dòng bán không khai diện tích thì **không khớp bất kỳ dòng giá có bậc nào**.
Nghĩa là một mặt hàng có thang giá 8 bậc sẽ **im lặng không ra giá** nếu dòng thiếu diện tích, và
màn chỉ thấy "không tìm thấy Item Price". Bậc đã trúng thì cũng không ai nói ra.

### N3. `alumdoor.catalog.finish_color_context` đã có, đã đăng ký, chưa ai gọi

`color-scopes.ts::finishColorContextForItem` dựng đúng luồng **Item → Bề mặt hợp lệ → Màu theo
từng Bề mặt**, fail-closed, có `colors_by_finish` để client không phải tự join. Nó được đăng ký ở
`index.ts` (`alumdoor.catalog.finish_color_context`). Quét toàn `client/**`: **0 nơi gọi**. Cả ba
chỗ dùng màu (`AlumdoorSalesOrderWorkbench`, `...Complete`, `ChildGrid`) đều gọi
`alumdoor.catalog.allowed_colors` — bản **hợp phẳng trên mọi Bề mặt**. Tức luật phân phạm vi theo
Bề mặt đang chạy đủ nhưng kết quả bị làm phẳng ngay trước khi tới người dùng.

### N4. `Item.default_color` đã bị gỡ khỏi brief v2 nhưng ba chỗ vẫn đọc

`alumdoor.json` (v1, 1.27.5) có `default_color:Link(Item Color)`. `alumdoor-v2.json` (2.10.0)
**không còn trường này**. Vẫn còn đọc nó:

- `sales-item-context.ts:357` → `default_color` trả về luôn `null`;
- `ui-child-preview.ts:368-370` và `:602-604` → tự điền màu cho dòng hàng, **không bao giờ chạy**;
- `alumdoor-v2.views.json` còn khai `default_color` + `standard_rate` làm cột bảng nhập nhanh.

Cùng cảnh: `Item.standard_rate` (`sales-item-context.ts:308` — đường "không có bảng giá thì lấy
giá định mức"). Trường này cũng chỉ có ở brief v1.

> Đã xử lý trong làn A: **không xoá** `default_color` (giữ hợp đồng cũ cho LÀN B), nhưng bổ sung
> `color_scope` lấy đúng theo phạm vi màu để màn có đường đi thật. `ui-child-preview.ts` và
> `alumdoor-v2.views.json` **ngoài làn A** — ghi lại ở §4 để đợt sau dọn.

---

## 3. Ba khoảng trống CỐ Ý — payload phải NÓI RA, không được đoán

Chốt 20/08/2026 (nhóm Ray và trục, 33 mã tiền tố `RT_`): **mua Kg · tồn CÂY · bán Mét**, bật *Cân
thực tế* + *Theo dõi theo lô*, dùng bộ theo dõi `Ống/trục`.

| Trống | Ở đâu | Vì sao không được đoán |
|---|---|---|
| Hệ số quy đổi **Mét→Cây** (33 mã `RT_`) | `Item.uom_conversions` | Mỗi cây một chiều dài; đoán một hệ số là ghi sai tồn của cả nhóm |
| **Kg/m lý thuyết** (23 quy cách `QC-*`) | `Material Specification.theoretical_kg_per_m` | Tham gia dự toán mua |
| **Chiều dài cây chuẩn** (23 quy cách `QC-*`) | `Material Specification.standard_length_m` | Tham gia quy đổi Mét↔Cây |

Thêm một ràng buộc dễ nhầm: `validateCanonicalAluminumItem`
(`item-catalog-invariants.ts`) **TỪ CHỐI** mọi hệ số quy đổi Kg↔Cây tĩnh trên hàng catch-weight —
"số cây/lá và kg thực là hai quan sát độc lập". Nên **Kg vắng mặt trong bảng quy đổi là ĐÚNG LUẬT**,
không phải dữ liệu thiếu. Payload phải phân biệt hai thứ này, nếu không màn bán hàng sẽ báo động
giả trên toàn bộ nhóm nhôm.

---

## 4. Việc CỐ Ý không làm trong làn A (kèm lý do)

| Không làm | Vì sao |
|---|---|
| Sửa `commercial-line-resolver.ts` để trả `uom`/`source_uom` | Ngoài làn A, và là hợp đồng dùng chung của cả `Sales Order` controller. Đã bù bằng cách đọc thẳng `Item Price` trong `previewSalesCommercialLine` |
| Dọn `default_color`/`standard_rate` khỏi `ui-child-preview.ts` và `alumdoor-v2.views.json` | Ngoài làn A (`ui-child-preview.ts` không thuộc sở hữu; `views.json` là generated artifact — phải sửa generator). Ghi vào §2/N4 để đợt sau |
| Điền bất kỳ hệ số nào trong §3 | Luật chi phối cả đợt: thà từ chối và báo lỗi còn hơn tính ra một con số sai trong im lặng |
| Đổi 422 "ĐVT chưa khai" thành 200 | Sẽ đảo nghĩa một hợp đồng cũ đúng lúc LÀN B đang code. Thay vào đó **làm giàu thân 422** bằng đúng các khoá chẩn đoán mới |
| Gọi `alumdoor.catalog.readiness` trong `item_context` | Nó đo TOÀN danh mục (32 DocType × 2 `COUNT(*)` + 3 lượt quét). Gọi nó cho một dòng hàng là tiêu cả hạn 10 s. Đã dựng phép đo **theo từng mã** ngay trong `sales-item-context.ts` |
| Đưa công thức cửa/rộng cắt vào hai payload này | Đã có `alumdoor.sales.production_line_context` + `alumdoor.door.calculate`. Nhân bản là dựng nguồn sự thật thứ hai cho tiền |
| Bootstrap runtime local để xem thật | Đề bài cấm; cây đang bẩn nên cổng `STALE_WORKTREE` chặn. Kiểm chứng bằng typecheck + test |

---

## 5. Hình dạng payload đã chốt

Xem `docs/audits/ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md` — tên trường, kiểu, ý nghĩa, ví dụ
JSON. Mọi trường **optional và thêm mới**; không trường cũ nào đổi nghĩa hay biến mất.

---

## 6. CÂU HỎI CÒN TREO CHO CHỦ XƯỞNG (21/08/2026 — đợt cách bán)

Ba câu dưới đây **cố ý không tự trả lời**. Chúng là quyết định nghiệp vụ, và đoán hộ ở tầng code
là đúng loại "luật ngủ im lặng" mà cả tập tài liệu này đang chống.

### Q1 🟥 Ánh xạ `price_variant` ↔ `sales_mode` — CÂU HỎI SỐ MỘT

Dòng bán hiện có **hai** ô nói về "cách", và chúng KHÔNG phải một thứ:

| Ô | Giá trị | Quyết định điều gì |
|---|---|---|
| `sales_mode` | `Trọn bộ` / `Tách món` | PHẠM VI CẤU PHẦN được giao và cơ sở rộng tính tiền (`SALES-BOM-SOURCE-MAP §5`) |
| `price_variant` | `TRON_BO` · `TACH_MON` · `TANG_RAY` · `CHI_LA` · `KEO_TAY` · `MOTOR_NGOAI` · `STANDARD` | LẤY DÒNG GIÁ NÀO trong bảng giá |

Nhìn thì `TRON_BO`/`TACH_MON` trông y hệt `Trọn bộ`/`Tách món`. Nhưng bốn mã còn lại
(`TANG_RAY`, `CHI_LA`, `KEO_TAY`, `MOTOR_NGOAI`) **không ánh xạ vào hai giá trị đó**, và chưa ai
chốt chúng có phải là một trục thứ ba hay không. Cụ thể phải hỏi:

1. `TANG_RAY` / `CHI_LA` (15 mã `CDUC_*`) có phải cách nói khác của `Trọn bộ` / `Tách món` không?
   Nếu có, đặt `sales_mode` là hệ quả suy ra từ `price_variant` hay ngược lại?
2. `KEO_TAY` / `MOTOR_NGOAI` là **cấu hình sản phẩm** (có/không mô tơ) hay là **cách bán**? Nếu là
   cấu hình thì chúng đang nằm nhầm trục và sẽ nhân đôi khi ai đó thêm bậc diện tích cho chúng.
3. Một dòng ghi `sales_mode = "Trọn bộ"` mà `price_variant = "CHI_LA"` là hợp lệ hay là mâu thuẫn
   phải chặn?

**Trong lúc chờ:** hai ô độc lập, không ô nào suy ra ô nào, và không có phép kiểm chéo nào. Đây là
lựa chọn an toàn — gộp sai là mất một bộ cấu phần khi giao (6 họ mã có đủ cả hai biến thể BOM), còn
để rời thì chỉ tốn một lần soát tay.

### Q2 🟧 Bảy mã thang bậc diện tích chỉ có `TRON_BO`

`LA_DLK_1LY_TRONBO` · `LA_DLK_1_2LY_TRONBO` · `LA_DLK_8D_TRONBO` · `CDL_DLM_1LY` · `CDL_DLM_8D` ·
`CDL_DLM_7D` · `CDL_DLM_6D` — mỗi mã 8 bậc, đều `TRON_BO`, không có dòng `TACH_MON` nào. Trong khi
`LA_DLK_1LY` (không hậu tố) lại chỉ có `TACH_MON`, một bậc phẳng.

Hỏi: bán tách món những mã `*_TRONBO` đó thì lấy giá ở đâu — hay đúng là chúng chỉ bán trọn bộ, và
cách giao đã nằm sẵn trong MÃ HÀNG (đúng cái `Sales Package` quay lại qua cửa sau mà commit 46cff213
đã khai tử)?

### Q3 🟧 29 mã có đúng một cách bán nhưng KHÔNG phải `STANDARD`

Ví dụ `CUC_UC_KT_6D` chỉ có `KEO_TAY`, `TON_DLM_1LY_K124` chỉ có `TACH_MON`. Màn bán hàng **tự
điền** cho chúng (không hỏi), nên chúng bán được. Nhưng hỏi để dọn dữ liệu: đó là chủ ý (mã này chỉ
bán một cách) hay là dòng giá của cách còn lại chưa nhập?

Nếu là chủ ý thì nên đổi hẳn về `STANDARD` để bảng giá bớt một trục; nếu là thiếu thì phải nhập nốt
trước khi có người bán nhầm.
