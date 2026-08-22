# Alumdoor — kiểm kê khoảng trống giữa DANH MỤC và nghiệp vụ KHO

*Lane WH của `docs/ALUMDOOR-PROMPT-AUDIT-DANH-MUC-MAN-HINH-20260821.md`. Câu hỏi: danh mục đã biết
điều gì mà nghiệp vụ Kho không được nghe? Kèm kiểm tra riêng: điểm chuyển giao "kiểm tồn kho" từ
Bán hàng sang Xuất kho (quyết định 21/08/2026) có khép kín không. Đọc-chỉ, không có phiên D1 local
khi audit.*

---

**Phạm vi đã đọc:** `delivery-note-v2/*`, `purchase-receipt-fifo/*`, `AlumdoorManufacturingStockEntryCreate.tsx`, `work-order-v2/AlumdoorWorkOrderCutPanel.tsx`, `sales-order-v2/*`, toàn bộ `alumdoor-worker/src` (45 file, kể cả `entry.ts` — điểm vào thật), `clouderp-stock/src` (19 file), `server/briefs/alumdoor-v2.json` (đọc trực tiếp field-level qua Python), 2 tài liệu audit/hội tụ, và git log (không sửa gì, chỉ `git log -S`). Đọc-chỉ tuyệt đối, không có D1 local.

---

## 1. Bảng chính

| # | Năng lực danh mục | Nghiệp vụ Kho đọc tới đâu | Hậu quả đo được | Hạng (P·trục) | Ngủ? |
|---|---|---|---|---|---|
| 1 | `Item.uom_conversions` — bảng hệ số quy đổi ĐVT mua/bán→tồn, phân biệt "thiếu dòng" / "hệ số=0" / "cố ý trống hợp lệ" (hàng catch-weight) | **Sống.** `purchase-receipt-fifo/uom-gap.ts` (`readItemUomConversions`) được `AlumdoorPurchaseReceiptWorkbench.tsx:256,661` gọi trực tiếp; phân biệt đúng ca 33 mã `RT_` (thiếu hệ số Mét→Cây PHẢI báo) với hàng cân thực tế (thiếu Kg↔Cây là ĐÚNG LUẬT, không báo) | 20/566 mã có `uom_conversions` (nguồn: `ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §5.1, **chưa đo lại**) — màn nói ra "chưa quy đổi được" thay vì đoán, nhưng đây là CẢNH BÁO không phải khoá cứng | P1 · K | Không |
| 2 | `Measurement Profile.weight_tolerance_pct` — ngưỡng cảnh báo lệch cân, mặc định nền tảng 13%, và **0% là giá trị hợp lệ** | **Sống, cẩn thận đúng.** `AlumdoorPurchaseReceiptWorkbench.tsx:254,268,285` đọc trực tiếp từ `Measurement Profile`, dùng `nonNegativeNumber` (không phải `positiveNumber`) để 0% không hoá thành mặc định 13× (`weight-variance.ts:58-61,70`) | Nêu để đối chiếu — đây là ví dụ ĐANG ĐÚNG, không phải khoảng trống | P2 · T | Không |
| 3 | `Measurement Profile.require_color` — bắt buộc khai màu | **Sống ở Mua + Bán, TẮT ở Xuất kho.** (a) Mua: `aluminum-purchase-closure.ts:171-179` (`purchaseColorRequired`) chặn qua `/hooks/validate`, nối thật qua `entry.ts:99-117`. (b) Bán: đổi tên thành `color_scope.requires_color`, chặn dòng thiếu màu tại `sales-order-v2/model.ts:1189`. (c) Xuất kho: `AlumdoorDeliveryNoteWorkbench.tsx:289` gọi `item_context` với `include_color_scope: 0` — tắt hẳn nhánh này | Nếu 1 dòng Đơn bán lọt qua mà không qua `item_context` (sửa tay sau, đơn cũ, import) thì Xuất kho **không có lưới an toàn thứ 2** cho riêng luật màu | P1 · K | Một phần |
| 4 | **6 cờ còn lại của `Measurement Profile`**: `track_dimension_lot`, `require_condition`, `require_length`, `require_width`, `require_piece_qty`, `track_bundle_qty` | **Đọc ra rồi bỏ.** `sales-item-context.ts:796-802` đọc đủ cả 6 cờ từ `Measurement Profile`, đặt vào `spec_context.measurement_profile.*` của response — nhưng grep đúng 6 tên field này trên toàn bộ client (`sales-order-v2`, `delivery-note-v2`, `purchase-receipt-fifo`, `AlumdoorManufacturingStockEntryCreate.tsx`) **và** toàn bộ server đã đọc (`alumdoor-worker`, `clouderp-stock`, `tenant-worker`, `gateway-worker`, `control-plane-worker`, kể cả brief `validators`) cho **0 kết quả** nơi nào đọc lại field JSON đó | `Batch.condition`/`length_m`/... có thể để trống dù Bộ theo dõi khai "Bắt buộc" — không nơi nào `field_overrides` đặt `reqd` theo các cờ này (xem trích dẫn mục 3) | **P1 · K** | **CÓ — luật ngủ rõ nhất** |
| 5 | `Material Specification.scrap_threshold_m` — ngưỡng (m) coi phần dư sau cắt là đầu thừa dùng được, không phải phế liệu | **Sống từ 30/07/2026** (`git log -S "scrap_threshold_m" -- index.ts` → commit `a0660918`, không phải mã mới hôm nay). `index.ts:625,641` so `offcutLength >= threshold`; nếu đạt thì tạo `Batch{is_offcut:1}` qua kho có `stock_role="Kho đầu thừa"` (`findOffcutWarehouse`, `index.ts:704-712`); không có kho đó thì **toàn phiếu cắt bị từ chối** (`index.ts:644`) | Giá trị hiện = trống→0 (cả `ALUMDOOR-DANH-MUC-HOI-TU-20260819.md` §3 và audit vòng 2 đều xác nhận "để trống"). Với threshold=0: MỌI đầu thừa dương, kể cả vài mm, đều sinh 1 Batch — nhiễu dữ liệu kho, hoặc chặn cắt toàn phiếu nếu thiếu kho vai trò | P1 · O | Không hẳn — sống nhưng luôn chạy ở nhánh biên vì input cố ý bỏ trống |
| 6 | `Batch.condition` (enum Thô/Đã sơn/Lỗi, `customFields.Batch`) | **Sống ở Nhập + Cắt, thiếu ở màn hiển thị Lô của Xuất kho.** Hiện ở `ReceiptLinesTable.tsx:184` (nhập) và `AlumdoorWorkOrderCutPanel.tsx:389` (cắt); nhưng danh sách "Lô đang có trong kho" mở rộng trên Phiếu xuất (`AlumdoorDeliveryNoteLineTable.tsx:348-361`) chỉ in `batch_no·qty·length_m·weight_kg·color·is_offcut` — **không in `condition`** dù `BatchDetail` (`delivery-note-v2/model.ts:70`) đã khai field này | Thủ kho xem trước lô để giao hàng không thấy ngay lô này Thô hay Đã sơn/Lỗi trên chính màn xuất — phải mở riêng Batch | P2 · O | Một phần |
| 7 | Tổ hợp `Batch.color/condition/length_m/is_offcut` + `Warehouse` để **giữ chỗ tồn nhôm theo đơn bán** và **đề xuất mua từ thiếu hụt** | **Định tuyến sống, không ai gọi.** `aluminum-supply-demand.ts` định nghĩa `AluminumDemandPlan`/`AluminumReservationDemand` biết đủ color/condition/length_m/is_offcut; ba hàm xử lý (`handleAluminumSalesPlan`, `handleReserveAluminumForSales`, `handleMaterialRequestFromAluminumShortage`) được nối đúng ở `entry.ts:60-62` (`alumdoor.inventory.plan_sales_order` / `reserve_sales_order` / `material_request_from_shortage`). Grep 3 method name này trên **toàn bộ** `client/packages/vertical-alumdoor/src`: **0 nơi gọi**. `Stock Reservation` chỉ được ĐỌC (`AlumdoorDeliveryNoteWorkbench.tsx:313-317`, `refreshReservations`) và NHẢ (`released_reason`), không có đường TẠO | Toàn bộ engine giữ-chỗ + đề xuất mua theo thiếu hụt đã viết xong, đúng thẩm quyền router, nhưng có thể **chưa từng chạy lần nào** qua UI (khớp hướng với §5.3 "chưa chạy lần nào", nhưng chưa đo lại được số dòng) | **P1 · K** | **CÓ — luật ngủ đậm nhất, kiểu "server biết đủ, không ai hỏi"** |
| 8 | `aluminumItemContract` (`has_batch_no`, `has_catch_weight`, `allow_negative_stock`, `purchase_stock_qty_field`, `purchase_allocation_*`) — điều kiện tiên quyết để tồn nhôm ghi đúng đơn vị | **Sống**, nhưng CHỈ vì `entry.ts` (không phải `index.ts`) là entrypoint thật: `entry.ts:82-97` chặn lưu `Item` sai hợp đồng nhôm, `entry.ts:99-117` chặn chứng từ mua sai. `index.ts` (`baseWorker`) hoàn toàn không biết `aluminum-purchase-closure.ts` tồn tại (0 import) | Đang đóng — nêu như RỦI RO KIẾN TRÚC: nếu có lần nào gộp/dọn `entry.ts` nhầm về phía `index.ts`, các kiểm tra này biến mất im lặng, không lỗi build | P1 · O (kiến trúc) | Không (hiện tại) |
| 9 | Câu hỏi tồn kho ở Xuất kho: `shortage.severity === "over"` | **Nửa sống** — xem mục 2 chi tiết bên dưới | Cảnh báo hiện đúng màu đỏ nhưng **không khoá nút Ghi sổ** | P1 · K (cận P0, xem mục 2) | — |

*Chú thích trục: K = số lượng tồn kho sai, T = tiền sai, O = người dùng không thao tác/giải trình được.*

---

## 2. Điểm chuyển giao Bán hàng → Xuất kho: có khép kín không?

**Cơ chế bật/tắt được xác nhận đúng như mô tả, và nguồn là comment có ngày tháng khớp hôm nay:**

`AlumdoorSalesOrderWorkbenchComplete.tsx:672-681` (gọi `alumdoor.sales.item_context` từ màn Bán hàng):
```
KHÔNG hỏi tồn kho ở màn bán hàng — quyết định của chủ dự án 21/08/2026.
`warehouse` và `qty` là hai tham số DUY NHẤT bật khâu đọc tồn của
`alumdoor.sales.item_context`: thiếu `warehouse` thì không có `stock_snapshot`,
thiếu `qty` thì không dựng `shortage` (nên cũng không có cổng chặn `STOCK_SHORT`).
Bỏ ở đây là tắt cả đường, không phải giấu cột — server khỏi tốn lượt đọc kho.
Năng lực đó KHÔNG bị xoá: nó thuộc về khâu xuất kho, nơi mới có kho thật để trừ.
```
Đây là khoá **phía server** (thiếu tham số → server không tính nhánh đó), không phải client tự giấu cột — xác nhận qua chính `sales-item-context.ts` nơi `stock_snapshot`/`shortage` chỉ được dựng khi có `warehouse`/`qty`.

Phía nhận: `AlumdoorDeliveryNoteWorkbench.tsx:283-292` (`refreshLineContext`) TRUYỀN cả `warehouse` và `qty`, nhận `_context.stock_snapshot`/`shortage`, và `AlumdoorDeliveryNoteLineTable.tsx:266-303` render đầy đủ (tồn theo ĐVT tồn, quy đổi, cân, số lô, danh sách lô). **Đây KHÔNG phải type khai suông** — đã kiểm bằng import graph thật (nguyên tắc #5): `grep StockSnapshot|ShortageInfo` trên `vertical-alumdoor/src` cho 4 kết quả, cả 4 đều là khai kiểu + 2 field dùng thật trong `DeliveryItemContext`, và cả `stock_snapshot`/`shortage` đều có nơi ĐỌC RA GIÁ TRỊ (không chỉ đọc type) tại `lineAlerts()` (`model.ts:471-483`) và trong bảng dòng.

**Chỗ RỚT — bằng chứng cụ thể:**

1. `AlumdoorDeliveryNoteWorkbench.tsx:742`: `blockedLines = activeLines.filter(lineBlocked).length` — được TÍNH và HIỂN THỊ (dòng 1096-1098: badge "X dòng đang có cảnh báo chặn").
2. `AlumdoorDeliveryNoteWorkbench.tsx:1137`: nút Ghi sổ chỉ có `disabled={working}` — **không có `|| blockedLines > 0`**. Người dùng thấy đèn đỏ nhưng vẫn bấm được.
3. `submitDelivery()` (`AlumdoorDeliveryNoteWorkbench.tsx:570-575`) gọi thẳng `adapter.submit(doc)`, không có bước `validate()`/chặn client trước khi gửi — khác hẳn `saveDraftFromLines()` vốn có `validate()` (dòng 514-515).

**Chỗ tôi KHÔNG xác nhận được** (nằm ngoài 2 thư mục được giao): `clouderp-stock/src/tracking.ts:165-194` (`assertOutgoingRowAvailable`) THỰC SỰ ném lỗi "Insufficient tracked stock" khi ghi sổ Xuất kho cho hàng có `has_batch_no` — NHƯNG cơ chế này chỉ kích hoạt khi ledger có `bundleName` hoặc `automaticFifoAllocations`. `DeliveryLine` (`delivery-note-v2/model.ts`) không khai field `serial_and_batch_bundle`, nên nhánh Outward phải đi qua `automaticFifoAllocations` (tự động chọn FIFO khi Xuất) — đúng thiết kế hợp lý cho chiều xuất, nhưng **bộ điều khiển "Delivery Note" thật (nơi gọi `buildTrackedStockLines` lúc submit) không nằm trong `alumdoor-worker` lẫn `clouderp-stock`** — không tìm thấy trong phạm vi đọc. Do đó:

> **Kết luận:** Điểm chuyển giao khép kín ở TẦNG DỮ LIỆU (server tắt đúng nhánh tính toán khi Sales gọi, bật đúng khi Delivery gọi) nhưng **KHÔNG khép kín ở TẦNG THAO TÁC**: cảnh báo `shortage.severity="over"` trên Xuất kho là cố vấn (advisory), không phải khoá cứng ở lớp client. Có tồn tại một khoá cứng tiềm năng ở lớp ledger (`assertOutgoingRowAvailable`) nhưng **tôi không xác nhận được từ mã nguồn đã đọc rằng nó thực sự được gọi tới khi submit Delivery Note** — đây là ranh giới của phạm vi được giao (`alumdoor-worker` + `clouderp-stock`), cần đọc thêm gói điều khiển chứng từ bán hàng thật (có thể là `clouderp-sales` hay tương đương) để chốt.

---

## 3. Luật đang ngủ

**A. Danh mục ngủ (đọc ra, không ai dùng) — mục 4 và 7 ở bảng trên là 2 ca rõ nhất.** Đáng chú ý: chính codebase đã tự viết ra đúng cảnh báo cho ca `require_color` TRƯỚC khi được vá — trích `sales-order-v2/model.ts:1182-1187`:
> "Màu bắt buộc là luật của BỘ THEO DÕI, không phải của form. `Measurement Profile.require_color` chảy xuống `color_scope.requires_color`. Không nơi nào trong `field_overrides` đặt `reqd` cho ô màu, nên nếu không đọc cờ này thì một dòng thiếu màu vẫn lưu trót lọt rồi **vỡ ở khâu xuất kho — lúc đó hàng đã hứa với khách.**"

6 cờ còn lại (`track_dimension_lot`, `require_condition`, `require_length`, `require_width`, `require_piece_qty`, `track_bundle_qty`) đang ở **đúng trạng thái nguy cơ này ngay lúc audit**, chưa được vá theo cùng cách.

Cùng ngày 21/08, comment tại `AlumdoorSalesOrderWorkbenchComplete.tsx:682-683` tự gọi tên hiện tượng: *"Bật khâu màu theo PHẠM VI... Đây là đường đánh thức pipeline `finish_color_context` vốn đã viết xong mà chưa nơi nào gọi tới"* — xác nhận nhóm dự án CÓ khái niệm "luật ngủ" và vừa đánh thức được 1 trường hợp (màu, chỉ ở Bán hàng) hôm nay.

**B. Mã "chết vì bị đè" — một dạng khác, đáng ghi vì rủi ro tái sống nhầm.** Kiểm sống/chết bằng import graph (nguyên tắc #5) phát hiện: `index.ts` có hàm `fifoReceiptDraft` (dòng 1644-1772) **tự đăng ký** vào dispatch riêng của nó cho đúng 4 method `alumdoor.purchase.{preview_,}{,bulk_}fifo_receipt` (dòng 2769-2772) — nhìn tách biệt thì có vẻ sống. Nhưng `entry.ts` (điểm vào thật) chặn đúng 4 method này SỚM HƠN (dòng 54-57), trả kết quả từ `aluminum-purchase-closure.ts:handleTrackedPurchaseFifoRequest` và **không bao giờ rơi xuống `baseWorker.fetch`** cho các method đó — `index.ts:fifoReceiptDraft` không thể được gọi tới trong vận hành thật. Bản trong `index.ts` (và bản gốc `purchase-fifo-receipt.ts:handleFifo`'s create-branch mà nó mô phỏng) **không tạo `Batch`/`Serial and Batch Bundle`** — yếu hơn bản đang chạy thật (`handleTrackedPurchaseFifoRequest` có `provisionReceiptTracking`, dòng 318-338, tạo Batch+Bundle rồi mới trả về). Tương tự, `/hooks/event` cho `purchase_receipt.*`: `index.ts:2798-2799` gọi `syncLotsFromReceipt` (ghi doctype `Aluminium Lot` — hệ thống CŨ) nhưng `entry.ts:65-77` chặn sớm hơn, trả thẳng `{skipped_legacy_aluminium_lot_sync: true, authority: "Batch + Stock Ledger"}` — **đội đã chủ động khai tử `Aluminium Lot`**, đúng như comment tự để lại tại `index.ts:550-551`: *"V2 chỉ đọc Batch + sổ kho. Không còn Aluminium Lot song song với sổ..."*. Rủi ro: nếu có lần dọn dẹp/refactor gộp `entry.ts` vào `index.ts` mà chọn nhầm nhánh (rất dễ nhầm vì cả hai cùng khớp tên method), hệ thống âm thầm quay lại ghi `Aluminium Lot` và bỏ tạo Batch — vỡ đúng vào đường mà `proposeCutV2` đang đọc.

---

## 4. Cố ý không kết luận

1. **Số dòng thật trong `stock_ledger_entries`, `sales_order_fulfillment_entries`, `purchase_order_progress_entries`, `stock_bundle_usage_entries` hôm nay (21/08).** Baseline 20/08 (`ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §5.3, dòng 360-372) ghi cả 4 bảng = 0 dòng, và ghi thêm *"Không có DocType Lô/Batch dù `Purchase Receipt Item` tham chiếu `serial_and_batch_bundle`"*. Mã nguồn tôi đọc hôm nay cho thấy toàn bộ hạ tầng Batch (schema `customFields.Batch`, `createBatch`/`provisionReceiptTracking`, `proposeCutV2` chỉ đọc Batch) đã tồn tại **từ trước 20/08** (git blame `scrap_threshold_m` → 30/07). Không rõ câu "không có DocType Lô/Batch" của audit 20/08 nói về schema (brief) hay về **D1 đã triển khai** (rất có thể là D1 chưa chạy migration/seed dù brief đã khai) — **không có D1 local để phân biệt hai khả năng này, không đo lại được**.
2. **`K36-DT`/`K12-DT` với `stock_role: Kho đầu thừa` có thật trong D1 hôm nay không.** `server/briefs/alumdoor-v2.fixtures.json` chỉ khai "Lý do huỷ" và "Nguyên nhân chênh lệch", không khai Warehouse — dữ liệu Warehouse là seed/tenant data, không nằm trong brief tĩnh. Không xác nhận/phủ nhận được câu H1 nói brief "đã có" hai kho này.
3. **Delivery Note submit có thực sự chặn cứng khi thiếu tồn hay không** (mục 2) — cần đọc bộ điều khiển chứng từ bán hàng thật, nằm ngoài `alumdoor-worker`/`clouderp-stock`.
4. **Điều kiện mở lại H1 ("khi xưởng bắt đầu nhập chiều dài đầu thừa") — kết luận: CHƯA TỚI**, nhưng có 1 giới hạn khi kết luận: tôi chỉ đọc được UI hiện tại (Cut Panel hoàn toàn tính toán/suy ra `offcut_per_sheet_m = length_m − cut_width_m − kerf`, không có ô nhập tay — `AlumdoorWorkOrderCutPanel.tsx:377,393`), không biết xưởng có quy trình giấy/Excel song song đo tay chiều dài đầu thừa mà chưa nhập vào hệ thống hay không — đó là câu phải hỏi xưởng, không suy được từ mã nguồn.

---

## 5. Câu hỏi mở

**Suy được từ dữ liệu, chưa làm:**
- Vá 6 cờ `Measurement Profile` còn lại (`require_condition/length/width/piece_qty`, `track_bundle_qty`, `track_dimension_lot`) theo đúng khuôn vừa làm cho `require_color` — dựng `gaps`/block tại nơi TẠO Batch (Purchase Receipt, Manufacturing Stock Entry), không chỉ tại `sales-item-context.ts`.
- Đóng khoảng "cảnh báo không khoá" ở nút Ghi sổ Xuất kho: hoặc disable theo `blockedLines`, hoặc xác nhận rành mạch server đã chặn cứng rồi bỏ badge gây hiểu lầm "chặn" mà không chặn.
- Dọn 2 nhánh chết (`index.ts:fifoReceiptDraft`, `purchase-fifo-receipt.ts` create-branch, `syncLotsFromReceipt`/`Aluminium Lot`) — xoá hẳn hoặc gắn chú thích "KHÔNG DÙNG, xem entry.ts" ngay đầu hàm để tránh tái sống nhầm khi refactor.
- Hiện `batch.condition` trong danh sách "Lô đang có trong kho" của Phiếu xuất (chỉ thiếu 1 dòng JSX).

**Phải hỏi chủ xưởng:**
- Ba API `alumdoor.inventory.plan_sales_order`/`reserve_sales_order`/`material_request_from_shortage` đã viết xong, đúng thẩm quyền — có ý định làm UI gọi chúng không, hay đây là tính năng bị bỏ giữa chừng nên xoá hẳn cho gọn?
- `scrap_threshold_m` để trống có phải quyết định VĨNH VIỄN, hay chỉ đang chờ 1 con số cụ thể từ xưởng (VD 0,3m) để nhập ngay — vì code đã sẵn sàng nhận giá trị đó, không cần sửa gì thêm ngoài field data.
- Quy trình thực tế khi thủ kho thấy "Tồn không đủ" trên Phiếu xuất nhưng vẫn phải giao (khách gấp) — có nghiệp vụ giấy tay xử lý ngoại lệ này không, để biết có nên khoá cứng nút Ghi sổ hay giữ dạng cảnh báo.

**Dữ liệu tự mâu thuẫn:**
- `ALUMDOOR-DANH-MUC-HOI-TU-20260819.md` dòng 63 ghi chỗ sửa `scrap_threshold_m` là **"`Measurement Profile` / Settings"** — nhưng theo schema thật trong `server/briefs/alumdoor-v2.json`, field này nằm trên **`Material Specification`** (label "Ngưỡng phế liệu (m)", `depends_on` theo `spec_type`), khớp đúng với nơi code (`index.ts:621-625`) thực sự đọc (`specification?.scrap_threshold_m`, biến `specification` = `Material Specification`). Tài liệu hội tụ ghi sai/nhầm doctype.
- §5.3 của audit 20/08 nói "Không có DocType Lô/Batch" trong khi cùng lúc nói `Purchase Receipt Item` đã tham chiếu `serial_and_batch_bundle` — nếu Batch không tồn tại thì Bundle tham chiếu vào đâu? Có thể câu này đang nói về TRẠNG THÁI RỖNG (0 bản ghi) chứ không phải THIẾU SCHEMA, nhưng câu chữ hiện tại đọc được cả hai nghĩa (xem mục 4.1).
