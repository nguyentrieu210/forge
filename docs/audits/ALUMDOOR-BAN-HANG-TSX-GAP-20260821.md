# Màn bán hàng TSX — kiểm kê khoảng cách với danh mục (2026-08-21)

> Làn B của đợt `feat/ban-hang-danh-muc`. Câu hỏi của tài liệu này: **danh mục đã biết gì, màn
> bán hàng đọc tới đâu, và chỗ nào danh mục đang ngủ vì không ai gọi tên nó.**
>
> Xếp hạng theo đúng thứ tự của `docs/ALUMDOOR-DANH-MUC-HOI-TU-20260819.md`: **chạm tiền trước,
> rồi tới số thao tác tiết kiệm được cho người bán.** Người dùng thật là bán hàng và kế toán.

---

## 0. Bản nào đang sống — chốt trước khi sửa

`client/packages/vertical-alumdoor/src/sales-order-v2/` có hai bộ đôi. Chỉ một bộ được mount:

| File | Trạng thái | Bằng chứng |
|---|---|---|
| `AlumdoorSalesOrderWorkbenchComplete.tsx` (1110) | **ĐANG SỐNG** | `AlumdoorSalesOrderCreate.tsx` re-export nó; `workspace-extension.tsx` lazy-import `AlumdoorSalesOrderCreate` cho cả `isNew` lẫn `decoded` của `Sales Order` |
| `AlumdoorSalesOrderLineTableComplete.tsx` (857) | **ĐANG SỐNG** | chỉ `WorkbenchComplete` import |
| `AlumdoorSalesOrderWorkbench.tsx` (812) | **CHẾT** | không file nào ngoài chính nó import |
| `AlumdoorSalesOrderLineTable.tsx` (550) | **CHẾT** | chỉ `AlumdoorSalesOrderWorkbench.tsx` (đã chết) import |

Lịch sử xác nhận đây là **tiền thân bị thay thế**, không phải bản rút gọn cho app khác:

- `260162871` (17/08) *"replace Sales Order creator with v2 workbench foundation"* → tạo bản thường.
- `9ca4ab8f3` (17/08) *"complete Sales Order lifecycle workbench"* → tạo bản `Complete`.
- `764d56931` *"route Alumdoor Sales to complete workbench"* → đổi re-export sang bản `Complete`.

Cùng ngày. Bản thường sống được vài giờ. **Không xoá trong đợt này** — xoá là quyền chủ dự án;
đây chỉ là báo cáo. Nhưng phải ghi một điều: bản chết KHÔNG hoàn toàn là tập con.

### Hai thứ bản `Complete` làm mất khi thay bản thường

| Mất | Bản chết có | Bản sống |
|---|---|---|
| `_context.availability_status` — chuỗi "Còn N Mét · Giá m2: … VND" | `AlumdoorSalesOrderLineTable.tsx:401` in dưới tên hàng | **không hiện ở đâu** |
| `_commercial.item_price` — dòng giá đã tra | `AlumdoorSalesOrderLineTable.tsx:482` in dưới đơn giá | **không hiện ở đâu** |

Tức là màn "đầy đủ hơn" lại là màn **mù tồn kho và mù nguồn giá**. Đây là gốc của G1 và G4 bên dưới.

---

## 1. Bảng gap đã xếp hạng

Ký hiệu mức: **T** = chạm tiền · **K** = chạm tồn kho/giao được hay không · **O** = số thao tác.

| # | Gap | Mức | Danh mục đã có gì | Màn bán đọc tới đâu | Hậu quả đo được |
|---|---|:--:|---|---|---|
| **G1** | **Giải trình giá rỗng** | T | `_commercial` trả `item_price`, `base_rate`, `price_variant`, `pricing_as_of`, `applied_adjustments[]` (kèm `basis`, `basis_qty`, `rate_minor`), `discount_basis_*` | chỉ đọc `selling_rate`, `gross_amount`, `discount_amount`, `adjustment_amount`, `net_before_tax`, và **tên** rule | Khách hỏi "sao ra giá này" thì người bán phải mở Item Price/Pricing Rule ở tab khác. Bậc diện tích (`Item Price.area_tier`) hoàn toàn vô hình |
| **G2** | **`min_area_sqm` áp trong im lặng** | T | `Item.min_area_sqm` — brief ghi rõ: *"khai 4 m² thì bộ 3,2 m² vẫn thu tiền 4 m²"*; server chiếu xuống `Sales Order Item.min_area_sqm` mỗi lần preview | **không đọc** (`grep min_area_sqm` trong `vertical-alumdoor/src` = 0) | Cửa 3,2 m² hiện "SL tính tiền 4" mà không câu nào giải thích. Đúng dạng con số đúng nhưng không ai giải thích được |
| **G3** | **Thiếu hệ số quy đổi ĐVT thì lỗi trần trụi** | T·K | `salesItemContext` trả 422 `ĐVT "Mét" chưa được khai trên mặt hàng X` kèm `allowed_uoms` | `previewLine` bọc cả 4 request trong một `Promise.all`; 422 làm hỏng **cả 4**, dòng chỉ còn `_error` là chuỗi thô | Nhóm ray/trục (33 mã `RAY-*`, 14 mã `TRUC-*`) mua Kg · tồn Cây/Kg · bán Mét. Mã nào chưa khai `uom_conversions` thì dòng bán **chết câm**, không nói khai ở đâu |
| **G4** | **Không có cột "quy ra tồn"** | K | server đã tính sẵn và chiếu xuống dòng: `conversion_factor`, `stock_qty`, `stock_uom`, `available_qty`, `available_stock_qty`, `available_stock_uom`, `availability_status` — 7 field có thật trong `Sales Order Item` | **0/7 được hiện** | Màn mua hàng có cột "Quy ra" và HDSD dặn *"nhìn cột này trước khi ghi sổ"* (`ALUMDOOR-MUA-HANG-HDSD.md` §2). Màn bán không có. Bán 200 mét ray mà không biết kho còn mấy cây |
| **G5** | **`formula_explanation` chưa từng được in ra** | T | `calculateSalesProductionLine` dựng sẵn một câu tiếng Việt đầy đủ (công thức + hình học + chia lá). Brief ghi mục đích: *"để người bán đọc và kiểm mà không cần mở công thức"* | **không đọc**. Cùng cảnh: `width_basis`, `formula_policy`, `formula_version`, `leaf_rounding`, `leaf_height_deduction_m`, `estimated_minutes` | Cơ sở rộng PB ray ↔ PB nhựa lệch **1,5% tiền** (`ALUMDOOR-LUAT-DO-VA-GIA.md` §2). Dòng đơn không nói nó đang dùng cơ sở nào |
| **G6** | **`cut_width_m` bị ẩn cứng** | T | server tính rộng cắt lá cho mỗi dòng | `visibleDynamicField` trả `false` **vô điều kiện** cho `cut_width_m` | Với Đại lý mua *tách món* cửa Lưới/Đài Loan/Siêu Trường, công thức bán là `Cao PB × Rộng cắt` — rộng cắt **là cơ sở tính tiền**, không phải số của xưởng |
| **G7** | **`price_missing` / `price_error` khai mà không dùng** | T | `SalesItemContext` khai cả hai trong `model.ts` | `grep` ngoài `model.ts` = **0 lần** | Mặt hàng chưa khai giá chỉ lộ ra ở bước `validate()` lúc bấm Lưu ("thiếu Đơn giá"), không lộ lúc chọn hàng |
| **G8** | **Chọn hàng mù** | O | 587 mã; `salesItemSearchTerms` đã có bộ alias tiếng Việt tốt | dropdown chỉ hiện `mã` + `tên` | Không biết nhóm hàng, ĐVT bán, có giá trong bảng giá đang chọn hay chưa — chọn xong mới biết |
| **G9** | **`Ngưỡng chọn Motor` ngủ hoàn toàn** | T | `alumdoor.motor.suggest` có thật từ 19/08, đọc danh mục `Ngưỡng chọn Motor`, chọn motor theo **diện tích** và bình lưu điện theo **tải motor** | **không client nào gọi** (`grep motor.suggest` trên `client/` = 0). Cột `motor_model` lại chỉ hiện khi dòng đã có sẵn giá trị, nên trên đơn mới thì không bao giờ hiện | Chính comment trong `index.ts` đã cảnh báo: *"dựng kho xong mà chưa nối dây thì người bán vẫn phải nhớ bảng trong đầu"*. Chọn dư một cấp là khách trả thừa vài triệu |
| **G10** | **`purchase_kg_per_m2` không có tiếng nói** | T | context trả `purchase_kg_per_m2`; `LUAT-DO-VA-GIA` §6 ghi *"Worker cố ý từ chối khi thiếu barem"* | không đọc | Cửa Úc/Lưới/Đài Loan/Siêu Trường thiếu barem thì dự toán mua chết, nhưng màn bán không nói trước |
| **G11** | **Cách bán suy từ chuỗi trong mã hàng** | T | `Sales Order Item.sales_mode` (`Trọn bộ`/`Tách món`) là field thật, có default | client dùng `isFullSetSalesItem()` = *mã hàng có chứa `TRONBO`* để quyết định có xổ BOM hay không | Đúng thứ `DANH-MUC-HOI-TU` §5 gọi là **"dựng lại `Sales Option` qua cửa sau"**. Không sửa trong đợt này — xem §3 |
| **G12** | `delivered_qty` không hiện | K | field có thật, server cộng từ phiếu giao | không đọc | Mở lại đơn đã ghi sổ không thấy dòng nào đã giao bao nhiêu |
| **G13** | **Không có đường nào đưa KHO vào dòng bán** | K | `salesItemContext` chỉ đọc tồn khi có `warehouse`; làn A vừa dựng thêm `stock_snapshot` · `shortage` · lô/Batch — tất cả đều đòi kho | `Sales Order Item.warehouse` khai `surface: internal, hidden: true`, và **đầu đơn Sales Order không có ô kho nào** (soát toàn bộ `fields` của DocType `Sales Order` trong brief: 0 trường chứa `warehouse`) | Mọi năng lực tồn kho vừa xây **không thể chạm tới** từ màn bán. Đây không phải "UI chưa đọc" mà là "UI không có cách nào hỏi". Mở nó là đổi metadata trong `server/briefs/**` — ngoài quyền làn B |

### Điều KHÔNG phải gap (đã kiểm, khỏi làm lại)

- **Màu theo phạm vi** — đề bài nghi màn bán đang dùng "danh sách phẳng". Không phải: nó gọi
  `alumdoor.catalog.allowed_colors` với `usage_scope: "sales"`, và server đi đúng pipeline
  `Item → Item Group lineage → Surface Finish → Item Color`, fail-closed. Đây là chỗ đã nối dây đúng.
- **Ô thông số theo mã hàng** — `field_overrides` từ `alumdoor.ui.preview_child_row` đã điều khiển
  hiện/ẩn/bắt buộc/nhãn cho `width_pb_ray_m`, `width_pb_nhua_m`, `mesh_height_m`, `ray_type`,
  `has_butterfly_bracket`, `set_count`, `length_m`, `qty_bar`. Cột động đã tự co giãn theo tập
  dòng đang có. Phần còn thiếu là **nói ra ô nào còn trống thì chưa tính được tiền**, không phải
  chuyện ẩn/hiện.
- **Công thức tiền** — client không tính lại gì; `amount`/`discount`/`net` đều do server ghi đè.
  Giữ nguyên.

---

## 2. Đã làm trong đợt này

Bản kiểm kê §1 viết TRƯỚC khi làn A giao hợp đồng payload. Hợp đồng về giữa chừng
(`d70cff3e8`), nên phần thi hành dưới đây đã nối thẳng các trường mới thay vì dừng ở suy đoán
phía client. Luật thi hành: **có thì hiện, không có thì ẩn**; `null` ≠ vắng mặt ≠ `0`.

| Gap | Đã làm | Nguồn dữ liệu |
|---|---|---|
| G1 · G5 · G6 | Khối **"Vì sao ra con số này"** trong dòng chi tiết: dòng giá đã tra, bậc diện tích kèm cận và diện tích/bộ dùng để tra bậc, giá bảng giá → giá áp khi luật đè, từng phụ thu kèm **cơ sở tính** và **phạm vi** đã cho nó lọt vào, cơ sở rộng, rộng cắt lá, bản lá kèm **nguồn** ước số, nguyên văn `formula_explanation`, ghi chú giá của server | `price_explain` (B.2 + A.8), `pricing_scope_by_rule` (B.3), `applied_adjustments`, `spec_context` (A.6), `formula_explanation` (đã có sẵn từ trước, chưa ai in) |
| G1 | **`base_uom_fallback` không còn bị nuốt**: dòng nào lấy giá ĐVT gốc rồi nhân chéo thì nói thẳng "chưa khai giá cho `<ĐVT>`; quy từ giá `<ĐVT gốc>`" bằng màu cảnh báo | `price_explain.resolution` · `converted_from_uom` |
| G2 | Diện tích tối thiểu: server là trọng tài (`catalog_context.min_area_applied`), client chỉ so hình học khi server chưa nói | `catalog_context` (B.4) |
| G3 | Cột **"Quy ra tồn"** nói rõ **chưa khai hệ số** kèm `fix_where` của server thay vì nhân bừa với 1. Thân 422 giàu hơn nay được đọc: thông báo lỗi mang luôn địa chỉ khai | `uom_gap` (A.3, kể cả trong thân 422 theo A.10) |
| G3 | **Hàng cân thực tế được tha**: `catch_weight` / `factor_source: "catch_weight"` hiện là *"cân thực tế · không có hệ số cố định"*, KHÔNG phải thiếu sót — vắng hệ số ở đó là đúng luật | `uom_ladder` (A.2) |
| G4 | Cột **"Tồn khả dụng"** hiện **hai trục song song** đúng luật nhóm ray/trục: tồn theo ĐVT tồn và cân theo Kg, cố ý không gộp. Kèm cảnh báo `thiếu hàng` / `không so được` | `stock_snapshot` (A.4), `shortage` (A.5) |
| G4 | Khôi phục dòng `availability_status` dưới tên hàng — thứ bản `Complete` đánh rơi khi thay bản thường | `availability_status` |
| G7 · G10 | Dải **"Còn thiếu để chốt được dòng này"**: server tuyên bố thì lấy `readiness.blocking`, chưa có thì client tự suy. Mỗi mục kèm **sửa ở đâu**. Cảnh báo không chặn đi riêng một dải mờ hơn | `readiness` (A.9), `catalog_warnings` (B.5), `spec_context.coverage_gaps` |
| G7 | **`readiness.ready === false` là cổng chặn thật** ở bước lưu, đúng §C.2 của hợp đồng — từ chối lưu kèm câu chỉ chỗ sửa, thay vì để đơn đi tiếp với một con số không giải thích được | `readiness` |
| — | **Ô chờ điền ≠ lỗi cấu hình**: `intentional` được vẽ khác hẳn — vàng + nhãn *"chờ chủ xưởng chốt"*, không phải đỏ báo hỏng. Ba mã `UOM_FACTOR_MISSING` · `SPEC_MISSING_STANDARD_LENGTH` · `SPEC_MISSING_KG_PER_M` thuộc nhóm này | `intentional` |
| — | **Đánh thức màu theo phạm vi**: `color_scope` thắng danh sách phẳng; `requires_color` của Bộ theo dõi trở thành điều kiện chặn thật; `color_scope_error` hiện lý do thay vì để combobox rỗng câm. Lời gọi phẳng giữ làm đường lui, chạy song song nên không tốn thêm thời gian chờ | `color_scope` (A.7) |
| G8 | Dropdown mã hàng hiện thêm **nhóm hàng · ĐVT bán**, và **"chưa có giá"** khi mặt hàng không có dòng giá còn hiệu lực trong bảng giá đang chọn | `getList` Item + Item Price, 40 ứng viên đầu |
| G12 | Cột "Quy ra tồn" hiện kèm số đã giao khi đơn đã ghi sổ | `delivered_qty` |

### Tham số gửi lên

`qty` (đã có từ trước — không có nó thì server không dựng `shortage`), `include_color_scope: true`
(bật khâu màu theo phạm vi), và `slat_profile` **chỉ khi dòng thật sự mang mã nhôm**.

Hôm nay `slat_profile` **luôn vắng**, và đó là kết luận chứ không phải thiếu sót: soát toàn bộ
field của DocType `Sales Order Item` trong brief thì **không trường nào giữ mã nhôm**
(`Quy cách cửa.ma`). Suy nó từ mã hàng bằng chuỗi con chính là cái bẫy `TP-CUA` nằm trong
`TP-CUADL1LY` mà đợt đổi mã 19/08 đã ghi lại. Đường ống đã sẵn; ngày có trường thật thì nó tự chạy.

## 3. Cố ý KHÔNG làm — và điều kiện mở lại

| # | Không làm | Vì sao | Mở lại khi |
|---|---|---|---|
| N1 | **Không xoá** `AlumdoorSalesOrderWorkbench.tsx` + `AlumdoorSalesOrderLineTable.tsx` | Xoá là quyền chủ dự án. Hai file này còn là bằng chứng cho G1/G4 | Chủ dự án chốt |
| N2 | **Không đổi** `isFullSetSalesItem()` sang đọc `sales_mode` (G11) | Đổi khoá quyết định "dòng này có BOM hay không" là đổi hành vi nghiệp vụ, không phải trình bày. Server cũng đang tự quyết theo luật riêng; sửa một phía là hai phía lệch nhau | Có người chốt `sales_mode` là nguồn sự thật và server đi cùng một lượt |
| N3 | **Không nối** `alumdoor.motor.suggest` (G9) | Cột `motor_model` hiện chỉ hiện khi dòng ĐÃ có giá trị, tức trên đơn mới thì không bao giờ hiện. Gợi ý motor vào một ô người dùng không thấy là làm màu | Có quyết định motor là dòng bán riêng hay thuộc tính của dòng cửa; rồi mới mở cột |
| N4 | **Không tự quy đổi** Mét→Cây cho nhóm `RAY-*`/`TRUC-*` thiếu hệ số | `DANH-MUC-HOI-TU` chốt để trống là **cố ý**. Đoán một hệ số là bịa ra tồn kho | Chủ xưởng điền `uom_conversions` / `Quy cách cửa` |
| N5 | ~~Không gọi endpoint mới nào~~ — **ĐÃ MỞ** | Hợp đồng đã về ở `d70cff3e8`. Không endpoint MỚI nào được gọi thêm: mọi trường mới đi kèm hai lời gọi vốn đã có (`alumdoor.sales.item_context`, `metaforge.api.preview_sales_commercial_line`) | — |
| N6 | **Không sửa** `client/packages/views/src/form/child-grid-policy.ts` | Nó là lớp dùng chung, đang bẩn vì việc dở dang của chủ dự án. Nó khai `formula_explanation`, `width_basis`, `stock_qty`… vào nhóm **internal/hidden** — tức lưới metadata cũng giấu chúng. Nếu sau này bỏ màn TSX thì đây là chỗ phải xem lại | Có scope chạm shared runtime |

## 4. Dependency Request — kết cục

Yêu cầu để ngỏ lúc đầu là *"một method đọc-chỉ trả tình trạng sẵn sàng theo LÔ mã hàng"*.

**Làn A trả lời một nửa, và là nửa quan trọng hơn.** `readiness` (A.9) trả đầy đủ
`blocking` / `warnings` kèm `code` ổn định và `where`, cộng `uom_gap`, `stock_snapshot`,
`shortage`, `price_explain`, `spec_context.coverage_gaps`. Nhờ vậy màn bán không còn phải suy
đoán tình trạng danh mục — nó đọc kết luận của server. Toàn bộ §2 ở trên dựng trên nền đó.

**Nửa còn để ngỏ: readiness theo LÔ, cho lúc CHƯA chọn hàng.** `readiness` hiện gắn với MỘT mã
trong `item_context`, tức chỉ trả lời được *sau* khi người bán đã chọn. Muốn hiện tình trạng
ngay trong dropdown 587 mã thì vẫn phải bắn nhiều lượt cho mỗi phím gõ: nền tảng chặn `in` ở 50
giá trị (`document-kernel/src/document-list.ts:101`) và 100 dòng/trang (`:295`).

Bản rẻ đang chạy: một lượt `Item` và một lượt `Item Price` cho **40 ứng viên đứng đầu**, chạy
song song với lượt `resolve_display_values` vốn đã có. Hỏng thì im lặng rơi về hành vi cũ — đây
là gợi ý chọn hàng, không phải con số tiền. Và khi trang giá chạm trần 100 dòng thì **bỏ hẳn
nhãn "chưa có giá"**: chạm trần nghĩa là có thể còn dòng chưa lấy về, dán nhãn lúc đó là nói sai
một cách rất khó phát hiện.

### Còn để ngỏ, không thuộc quyền làn B

**G13 — không có đường nào đưa KHO vào dòng bán.** Đây là chỗ chặn lớn nhất còn lại, và nó chặn
đúng phần làn A vừa xây: `stock_snapshot`, `shortage`, lô/Batch đều đòi `warehouse`, mà
`Sales Order Item.warehouse` khai `surface: internal, hidden: true` và đầu đơn `Sales Order`
không có ô kho nào. Vì vậy hai cột kho chỉ bật khi server thật sự trả về SỐ — dựng một cột luôn
trống là hứa suông với người bán.

Mở nó là sửa metadata trong `server/briefs/**`, ngoài quyền làn B. Việc cần làm, theo thứ tự:
đưa `warehouse` lên `surface: quick` ở dòng bán **hoặc** thêm một ô kho mặc định ở đầu đơn rồi
chiếu xuống dòng.
