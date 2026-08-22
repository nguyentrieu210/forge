# Alumdoor — kiểm kê khoảng trống giữa DANH MỤC và MÀN MUA HÀNG

*Lane PUR của `docs/ALUMDOOR-PROMPT-AUDIT-DANH-MUC-MAN-HINH-20260821.md`, cùng khung với
`ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md`. Câu hỏi: danh mục đã biết điều gì mà màn Mua hàng
không được nghe? Đọc-chỉ, không có phiên D1 local khi audit.*

---

## 0. Xác nhận file sống

`grep -rn "PurchaseOrderCreate" client --include=*.tsx --include=*.ts | grep -v node_modules` cho thấy `AlumdoorPurchaseOrderCreate.tsx` chỉ là **4 dòng re-export** từ `AlumdoorPurchaseOrderCreateStable.tsx` (dòng 1-4). `workspace-extension.tsx:7,66-99,83-99` lazy-import đúng wrapper này cho cả `isNew` lẫn `decoded` Purchase Order → **`AlumdoorPurchaseOrderCreateStable.tsx` (1013 dòng) là bản sống**. Tương tự `AlumdoorPurchaseReceiptCreate.tsx` (4 dòng) → `purchase-receipt-fifo/index.ts:7-10` → **`AlumdoorPurchaseReceiptWorkbench.tsx` là bản sống** cho Phiếu nhập mua. Server gọi qua `alumdoor.ui.preview_document` / `alumdoor.ui.preview_child_row` (đơn mua) và bộ `PURCHASE_RECEIPT_METHODS` trong `purchase-receipt-fifo/server-contract.ts:21-40` (phiếu nhập), định nghĩa tại `server/apps-src/alumdoor-worker/src/index.ts` + `ui-child-preview.ts`.

---

## 1. Bảng chính

| # | Năng lực danh mục | UI Mua hàng đọc tới đâu | Hậu quả đo được | Hạng | Ngủ? |
|---|---|---|---|---|---|
| 1 | `alumdoor.purchase.order_from_quotation` — chuyển 1 Báo giá NCC đã duyệt thành Đơn mua, có chặn bấm-2-lần (`index.ts:1468-1493`, đăng ký ở `index.ts:2766`) | **0 nơi gọi** trong toàn bộ `client/packages/vertical-alumdoor/src` (grep tên method = rỗng); không có màn riêng cho Supplier Quotation trong `workspace-extension.tsx`; `alumdoor-v2.actions.json` chỉ khai 3 action (nhập nhôm hàng loạt, đối soát giao hàng, nhả giữ chỗ) — không cái nào gọi method này | Nhân viên phải gõ tay lại toàn bộ dòng/giá từ báo giá đã chọn sang đơn mua mới, đúng rủi ro "gõ lại → sai" mà HDSD §3 và THIẾT-KẾ §9.3 cảnh báo | P1 | **CÓ** |
| 2 | `Purchase Order.material_request` — khoá "không đặt quá số đã yêu cầu", cộng dồn qua mọi đơn qua `assertRequestRemaining` (`clouderp-core/src/controllers.ts:125,177,367-375`) | Trường **không tồn tại** trong field list "Purchase Order" của brief hiện hành (`alumdoor-v2.json:9537-9573`, 9 field, không có `material_request`); màn Đặt hàng (`AlumdoorPurchaseOrderCreateStable.tsx:936-947`) không có ô nào tương ứng | Khoá "không vượt số yêu cầu" không bao giờ kích hoạt được; "gộp đơn theo tổ" mà HDSD §4 hứa (dòng 124-134) không làm được qua UI | P1 | **CÓ** |
| 3 | `Supplier Item` — mã hàng NCC, giá mua gần nhất (`last_purchase_rate`), SL mua tối thiểu, NCC ưu tiên, thời gian giao | **0 lần đọc** trong toàn luồng giao dịch — cả client (PO Create + Items Grid + Receipt Workbench: grep 6 tên field = rỗng) lẫn server tính giá (`ui-child-preview.ts`: 0 hit "Supplier Item"). Duy nhất `catalog-readiness.ts` đọc nó, nhưng chỉ để tô đỏ/xanh cho **màn Danh mục**, không phải màn Mua hàng | Baseline 20/08 (§5.1): Supplier Item RỖNG. Audit §6-Đợt A ghi "✅ ĐÃ LÀM… 34 giá nhập · 13 Supplier Item" (dòng 400,454) — nhưng `alumdoor-purchase-catalog.mjs:325-343` cho thấy giá này ghi thẳng vào `Supplier Item.last_purchase_rate` (field `hidden:true`, mô tả "chỉ tham khảo… máy không tự lấy làm giá" — brief dòng 5029-5034), **không** vào Item Price. Kết quả: 34 giá nhập đã nạp vẫn **vô hình 100%** với người đặt hàng tính đến 21/08 | P1 | Không hẳn — dữ liệu đã nạp nhưng **chưa từng có đường đọc nào cho giao dịch**, kể cả ở server |
| 4 | `Purchase Order.received_percentage` / `billed_percentage` — % đã nhận, đã xuất hoá đơn của CHÍNH đơn đang mở (`nhân đặt`, THIẾT-KẾ §4.3) | `received_percentage` có trong brief nhưng `hidden:true` (dòng 9566-9572); `billed_percentage` **không có trong brief hiện hành** dù THIẾT-KẾ mô tả là field thật. Cả hai: 0 lần đọc ở `AlumdoorPurchaseOrderCreateStable.tsx` — chỉ xuất hiện ở `cong-no/AlumdoorDebtWorkbench.tsx` | Mở lại đơn mua cũ để xem "còn thiếu bao nhiêu / đã xuất hoá đơn chưa", người dùng phải rời màn sang Công nợ NCC | P1 | **CÓ** (server tính đúng, brief giữ field, màn Mua hàng không đọc) |
| 5 | `Material Specification.standard_length_m` — chiều dài cây chuẩn, dùng làm gợi ý mặc định | **Có** đọc & tự điền ở màn NHẬP (`AlumdoorPurchaseReceiptWorkbench.tsx:685-702`, comment dòng 700 "chỉ là gợi ý mặc định"); **0 lần đọc** ở màn ĐẶT (`AlumdoorPurchaseOrderCreateStable.tsx` + `ui-child-preview.ts`: 0 hit "standard_length_m") dù cùng dùng `material_specification` để tra `theoretical_kg_per_m` | Người đặt phải tự nhớ/tra "Dài cây" cho từng dòng nhôm; gõ sai `length_m` đi thẳng vào `theoretical_kg` rồi `Thành tiền` mà hệ thống không có gì để đối chiếu | P1 (tiền phụ thuộc trực tiếp vào 1 ô không được gợi ý) | Có, theo nghĩa hẹp — cùng cơ chế đã viết & dùng ở màn liền kề, chưa từng gọi ở màn Đặt |
| 6 | ĐVT mua theo dòng — chọn ĐVT khác mặc định, xem cột "Quy ra", ghi đè Hệ số quy đổi theo dòng (HDSD §2, dòng 75-104) | `uom` (dòng 9303-9313), `conversion_factor` (9453-9463), `stock_qty` (9464-9474) trên Purchase Order Item đều bị khoá `hidden + read_only + serverEnforced` trong brief hiện hành; `AlumdoorPurchaseOrderItemsGrid.tsx:447` render `uom` bằng `<ReadOnlyCell>` thuần, không có cột "Quy ra" nào trong danh sách cột (dòng 382-402); không có bảng chẩn đoán gap thân thiện như `uom-gap.ts` bên màn Nhập | HDSD hướng dẫn một thao tác không còn tồn tại trên màn sống; mua theo ĐVT khác thường lệ (vd nhận "Bó" thay vì "Cây" một lần) không có đường thực hiện qua UI cho **bất kỳ mặt hàng nào**, không riêng nhôm | P1 | Không — trôi dạt tài liệu/schema (schema đã tiến hoá khoá field lại), không phải code chờ gọi |
| 7 | `Purchase Order Item.so_no` / `Purchase Receipt Item.so_no` — Số SO/tham chiếu của NCC cho dòng hàng | Khai đủ trong `list` + `form.fields` của **cả hai** doctype (brief dòng 9207-9221, 9417-9423, 9482-9502, và Purchase Receipt Item 9596-9614); **0 ô nhập** ở cả `AlumdoorPurchaseOrderItemsGrid.tsx`, `AlumdoorPurchaseOrderCreateStable.tsx`, `ReceiptLinesTable.tsx`, `AlumdoorPurchaseReceiptWorkbench.tsx` | Không có chỗ ghi số tham chiếu riêng của NCC để đối chiếu khi giao hàng lệch/tranh chấp | P2 | Không — field chưa từng có UI nào, kể cả ở màn Nhận |
| 8 | `Item Reorder` — `safety_stock`, `reorder_level`, `reorder_qty`, `lead_time_days` (mức tồn an toàn, điểm đặt lại, thời gian cung ứng) | **0 lần đọc** trong TOÀN BỘ `vertical-alumdoor/src` (grep 4 tên field = rỗng), không riêng màn Mua hàng | Không có gợi ý "cần đặt lại", không có dự tính ngày giao theo lead time NCC — `schedule_date` header luôn mặc định "hôm nay" (`AlumdoorPurchaseOrderCreateStable.tsx:386`) bất kể catalog biết gì về thời gian cung ứng | P2 | Không — chưa từng xây |

---

## 2. Luật đang ngủ (bằng chứng đầy đủ)

**a) `alumdoor.purchase.order_from_quotation`** — kinh điển nhất trong lượt này. Hàm `orderFromSupplierQuotation` (`index.ts:1468-1493`) đọc báo giá, **tự kiểm idempotent** (`orderForQuotation(call, name)` trước khi tạo, dòng 1473,1478) đúng thiết kế "bấm lại không tạo đơn thứ hai" (THIẾT-KẾ §9.3), tạo `Purchase Order` với `supplier_quotation` trỏ ngược. Method đăng ký tại `index.ts:2766`. `ListAgents`-style grep cho tên method trên toàn `client/packages/vertical-alumdoor/src` ra 0 dòng; `workspace-extension.tsx` không có nhánh `"Supplier Quotation"`/`"Request for Quotation"`; `alumdoor-v2.actions.json` (3 action, xem trên) cũng không có. Ba cửa vào khả dĩ của kiến trúc này (component riêng / workspace-extension / action-menu) đều đã kiểm và đều rỗng.

**b) `material_request` trên Purchase Order** — mâu thuẫn ngay **trong cùng một file** brief hiện hành: comment tại `alumdoor-v2.json:9527-9536` mô tả *"material_request khai thì nhân TỪ CHỐI đặt quá số đã yêu cầu… (assertRequestRemaining)"* như một hành vi đang chạy, nhưng field list "Purchase Order" ngay bên dưới (9537-9573) không khai field đó. `assertRequestRemaining` (`clouderp-core/src/controllers.ts:367-375`) là thật, đếm lại `sumSubmittedChildQuantityMicros` theo `referenceField:"material_request"` — logic đúng, chờ input không bao giờ tới vì không UI nào (kể cả generic CRUD, vì field không có trong brief) cho phép gán giá trị.

**c) `received_percentage`** — server "nhân đặt" đúng (chính `index.ts:1498` còn giải thích tại sao KHÔNG dùng field này cho tính toán nội bộ vì "cột phần trăm là con số của cả phiếu, không tách được theo mã hàng" — tức nhân biết rõ giới hạn của nó), brief giữ field trong schema Purchase Order nhưng đánh `hidden:true` — không màn nào bật lại cho người xem.

---

## 3. Không phải gap (đã kiểm, khỏi làm lại)

- **Diễn giải lệch cân / gap ĐVT / dung sai giao nhận trên màn NHẬP** — đầy đủ, đúng kiến trúc: `uom-gap.ts` phân biệt đúng "thiếu hệ số PHẢI báo" với "hàng cân thực tế TUYỆT ĐỐI không báo" (dòng 6-23, khớp `item-catalog-invariants.ts:98-107`); `weight-variance.ts` đọc đúng `Measurement Profile.weight_tolerance_pct` và `Supplier.receipt_tolerance_pct`; cả hai gắn vào UI ở `AlumdoorPurchaseReceiptWorkbench.tsx:664-668,1051`.
- **Công nợ NCC** — baseline 20/08 ghi "CNO-NCC.md chưa đọc". Tính đến 21/08 đã có `alumdoor.purchase.supplier_delivery_dashboard` (Payment Ledger authoritative, `purchase-supplier-dashboard.ts`) nối vào cả `cong-no/AlumdoorDebtWorkbench.tsx` lẫn panel "payable" trong Receipt Workbench (dòng 153,781-799) — **tốt hơn** nguồn cũ vì đọc sổ cái thay vì file ngoài.
- **ĐVT mua hiển thị (một phần của baseline "ĐVT nhập THIẾU HẲN")** — nay đã đúng ở mức HIỂN THỊ: `hydrateLine` (`AlumdoorPurchaseOrderCreateStable.tsx:315-336`) đọc `item.default_purchase_uom`, và dữ liệu này được nạp cùng đợt với 34 giá nhập (`mergeOne` chỉ gán `default_purchase_uom` khi đã có hệ số hợp lệ — `alumdoor-purchase-catalog.mjs:199-226`). Phần còn thiếu là khả năng **sửa theo dòng** (xem mục 6 bảng trên), không phải việc đọc mặc định.
- **Barem nhôm** (`theoretical_kg = length_m × qty_bar × theoretical_kg_per_m`) — đúng công thức HDSD ví dụ AL71, đối chiếu cả client (`validateRows`, dòng 769-771) lẫn nguồn server đã dẫn trong `weight-variance.ts:6-9`.
- **Lọc `is_purchase_item=1, disabled=0`** — nhất quán ở cả optimistic search (`mergePurchaseItemFilters`) lẫn `link_filters` khai trong brief Purchase Order Item (9230).

---

## 4. Cố ý không kết luận trong lượt này

- Số Supplier Item / `uom_conversions` **hiện tại** (21/08) — không đo được vì không có D1 local. Chỉ có số 20/08 (20/566 mặt hàng có `uom_conversions`) và một con số "448 bản ghi" trong comment `catalog-readiness.ts:306-307` chưa rõ có phải tổng Supplier Item thật tại thời điểm viết comment hay là ước tính cũ — chênh quá xa so với "13 Supplier Item đã nối" để tự suy luận chắc chắn.
- Liệu 34 "giá nhập" có ĐỒNG THỜI được nạp vào `Item Price`/`buying_price_list` (để `rate` có tự đề xuất qua cơ chế `priceLocked`) hay không — code đã đọc (`alumdoor-purchase-catalog.mjs`) khẳng định KHÔNG ghi vào Item, nhưng chưa xác minh có script nạp Item Price song song nằm ngoài phạm vi đã đọc.
- Field `material_request` có thật sự vắng mặt ở tầng D1 (không chỉ ở brief) hay không — cần D1 để xác nhận cột có tồn tại "chết" trong schema hay hoàn toàn không có.
- Nội dung đầy đủ 3 tài liệu audit BÁN HÀNG hôm nay (`docs/audits/ALUMDOOR-BAN-HANG-*-20260821.md`) — chỉ tham chiếu gián tiếp qua comment trong `uom-gap.ts` (vụ 33 mã `RT_`), cố ý không đọc sâu vì ngoài phạm vi Mua hàng.
- Logic chi tiết bên trong `purchase-supplier-dashboard.ts` (725 dòng) và `purchase-supplier-settlement.ts` (178 dòng) — chỉ xác nhận điểm vào/nơi gọi, chưa đọc toàn bộ vì trọng tâm câu hỏi là *danh mục*, không phải kế toán công nợ.

---

## 5. Câu hỏi mở

**Suy được từ dữ liệu, chưa làm (cần thêm thời gian/D1, không cần hỏi xưởng):**
- Trong số Supplier Item hiện có, bao nhiêu dòng `preferred=1` — nếu UI được xây, có nên tự ưu tiên hiện NCC đó khi gõ mã hàng?
- "34 giá nhập" trùng bao nhiêu với `Item Price` đang hoạt để biết `rate` hiện tại có tự đề xuất được không hay 100% phải gõ tay.
- Bao nhiêu `Purchase Order Item` hiện dùng ô "Ghi chú" để chép tay số SO NCC thay cho `so_no` (đo qua D1, không suy đoán).

**Phải hỏi chủ xưởng:**
- "Theo yêu cầu vật tư" trên Đơn mua — xưởng có thực sự cần khoá cứng chặn-vượt-yêu-cầu, hay tổ sản xuất báo miệng vẫn đủ (nếu không cần thì bỏ hẳn field khỏi tài liệu, đỡ gây hiểu lầm)?
- Nút "Báo giá NCC → Đơn mua" — luồng RFQ/So giá có đang được dùng thật ngoài xưởng, hay mọi đơn đều mua thẳng theo giá quen (nếu không dùng thì việc xây nút này không cấp thiết)?
- Giá tham khảo `last_purchase_rate` nếu hiện lên màn Đặt hàng — xưởng muốn nó **chỉ hiện tham khảo** (đúng ý field hiện tại) hay muốn **cảnh báo** khi giá mới lệch quá X% so với lần trước?
- MOQ (`minimum_order_qty`) của NCC — có cần cảnh báo ngay trên dòng đặt hàng khi số lượng dưới mức NCC nhận không?

**Dữ liệu tự mâu thuẫn:**
- Comment `alumdoor-v2.json:9527-9536` mô tả `material_request` như đang hoạt động, nhưng field list "Purchase Order" trong **cùng file** không khai field này — mâu thuẫn nội tại, không phải giữa hai bản khác thời điểm.
- `catalog-readiness.ts:306-307` ghi "Supplier Item… 448 bản ghi", trong khi audit 20/08 báo "13 Supplier Item đã nối" — chênh lệch lớn chưa rõ lý do, cần D1 để đối chiếu.
- THIẾT-KẾ §4.2 mô tả Purchase Order Item chỉ có 8 field cơ bản (`item_code, qty, rate, uom, invoice_kg, width_m, warehouse, amount`) — không có `color/length_m/qty_bar/theoretical_kg_per_m/is_stamped/material_specification`; brief hiện hành có đầy đủ bộ field nhôm chuyên biệt đó và **không có** `invoice_kg`. THIẾT-KẾ mô tả một phiên bản schema đã bị thay thế — nên gắn nhãn "lịch sử thiết kế", không dùng làm đặc tả sống cho Purchase Order Item.
