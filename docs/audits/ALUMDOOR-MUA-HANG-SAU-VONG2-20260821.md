# Alumdoor — Mua hàng (đợt 2, sâu hơn lane PUR 21/08) — Khoảng trống danh mục (21/08/2026, vòng 3)

## 0. Phạm vi & phương pháp

Đây là lượt đào sâu module Mua hàng, sau lane PUR gốc (21/08, 8 gap #1-#8, headline "34 giá nhập đã nạp nhưng vô hình 100%"). Lượt này **không lặp lại 8 gap cũ**, tập trung vào 2 hướng chưa kiểm: (1) lớp hàm/route procurement-analytics + landed-cost + operator-timeline ở `clouderp-core`/`document-kernel` (lane server), (2) khoảng trống UI ở 2 doctype submittable "Mua hàng" (RFQ, Supplier Quotation) và liên kết Purchase Order ↔ Material Request (lane screen).

Phương pháp: "luật ngủ" (sleeping law — hàm/route định nghĩa nhưng 0 nơi gọi ngoài chính nó, xác minh bằng grep) + khoảng trống UI (field/route server tồn tại nhưng không màn hình nào hiển thị/gọi). Mọi bằng chứng dưới đây là đường dẫn + số dòng thật, lấy từ grep trực tiếp trên repo qua `device_bash` (mount `$HOME/mnt/alumdoor`).

**Tổng kết nhanh: 6 P1 + 2 P2, 0 P0.** Không có lỗ hổng nào trong lượt này đe doạ trực tiếp sai số tiền hay chặn luồng giao dịch chính (Đặt hàng → Nhận hàng → Ghi sổ) — toàn bộ đều là năng lực phụ trợ đã viết xong nhưng chưa nối hoặc chưa có UI.

## 1. Lane SERVER (4 phát hiện)

### S1 — P1 — Toàn bộ khối phân bổ landed-cost cho Phiếu nhập mua chết từ đầu đến cuối chuỗi
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/clouderp-core/src/procurement-landed-cost.ts:48` (`planProcurementLandedCost`); `server/packages/clouderp-core/src/index.ts:8` (barrel export duy nhất); `server/packages/clouderp-stock/src/landed-cost.ts:27` (`allocateLandedCost`, hàm nó gọi tiếp, cũng 0 caller khác)
- **Mô tả:** `planProcurementLandedCost` (docstring: orchestration phân bổ cước/thuế nhập vào các dòng Phiếu nhập mua theo basis amount/quantity/weight) chỉ được export qua barrel, 0 nơi gọi thật trong `clouderp-core`. Hàm gọi tiếp `allocateLandedCost` cũng 0 caller khác. Không doctype, không UI (`alumdoor-v2.json` 0 kết quả "Landed Cost"), không route RPC (grep "landed_cost" trong `alumdoor-worker/src/index.ts` = 0). Tính năng hoàn chỉnh về mã nguồn nhưng không tồn tại theo bất kỳ nghĩa nào khác — rủi ro giá vốn tồn kho thiếu chi phí cước/thuế nhập khẩu mà không ai cảnh báo.

### S2 — P1 — Subsystem "operator read-model" cho công nợ NCC theo cửa sổ giữ chỗ chết — trùng với dashboard công nợ đang sống nhưng phạm vi phân quyền khác
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/document-kernel/src/purchase-supplier-debt-report.ts:79` (`D1PurchaseSupplierDebtReportService`), `:208` (`buildPurchaseSupplierDebtReport`); `server/packages/document-kernel/src/index.ts:34`; `server/packages/document-kernel/src/purchase-allocation-operator-timeline.ts:8-10,36,38,43`
- **Mô tả:** Service chỉ được dùng bởi `D1PurchaseAllocationOperatorTimelineService` — nhưng chính service đó lại 0 nơi gọi (grep tên class/hàm export `attachPurchaseAllocationQueueKeys` trong toàn `server/apps-src` + `client/packages` = 0). Trong khi công nợ NCC đang chạy thật qua đường khác (`purchase-supplier-dashboard.ts`). Rủi ro: hai cách tính công nợ NCC cùng tồn tại trong mã nguồn với phạm vi phân quyền khác nhau — comment trong code tự cảnh báo phạm vi hẹp hơn của bản "ngủ" này.

### S3 — P1 — `buildSupplierPriceHistory` / `buildSupplierSpendSummary` — đúng thứ trả lời câu hỏi mở của lần audit trước (cảnh báo lệch giá NCC) nhưng chưa từng được gọi
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/clouderp-core/src/procurement-analytics.ts:58` (`buildSupplierPriceHistory`), `:132` (`buildSupplierSpendSummary`), `:41` (field `latest_change_bps`); `server/packages/clouderp-core/src/index.ts:9`
- **Mô tả:** Lane PUR 21/08 từng đặt câu hỏi mở "xưởng muốn cảnh báo khi giá NCC lệch quá X% so với lần trước?" — hàm này đã tính sẵn đúng con số đó (`latest_change_bps`, quy đổi xuyên tỷ giá) nhưng 0 route/nơi đọc. Người đặt hàng không bao giờ được cảnh báo lệch giá bất thường dù công thức đã đúng, chỉ thiếu route + hiển thị.

### S4 — P2 — `previewPurchaseReceiptSubmission` — bản xem-trước Phiếu nhập mua thứ hai, viết xong nhưng chưa nối, trong khi đường xem-trước sống khác đã phủ đúng nhu cầu
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/clouderp-core/src/purchase-allocation-preview.ts:58`, `:7`; `server/packages/clouderp-core/src/index.ts:18`; `client/packages/vertical-alumdoor/src/purchase-receipt-fifo/server-contract.ts:27-30` (đường xem-trước THẬT đang sống)
- **Mô tả:** Xếp P2 (không P1) vì nhu cầu nghiệp vụ "xem trước trước khi bấm nhận" đã có đường khác đang chạy (`alumdoor.purchase.preview_fifo_receipt`/`preview_bulk_fifo_receipt`) — hàm này nhiều khả năng là bản thiết kế bị thay thế, không phải lỗ hổng chặn nghiệp vụ.

**0 ứng viên P0 tìm thấy.** Các controller xử lý tiền trực tiếp nhất trong phạm vi giao (`PurchaseSettlementController`, `PurchaseAllocationOverrideController`, `PurchaseSettlementLifecycleController`, `evaluateThreeWayMatch`/`ProcurementP2P*Controller`) đều được đăng ký thật trong `registry.ts:19,20,24,25,26`.

## 2. Lane SCREEN (4 phát hiện)

### C1 — P1 — RFQ → Báo giá NCC: 2 doctype submittable trong nhóm "Mua hàng" không có bất kỳ UI nào để tạo
- **Bằng chứng:** `server/briefs/alumdoor-v2.json:8860-8861` ("Request for Quotation", `menu:false`) và `:9155-9156` ("Supplier Quotation", `menu:false`); `client/packages/vertical-alumdoor/src/AlumdoorPurchaseOrderCreateStable.tsx:944` (dòng duy nhất tham chiếu, chỉ là 1 Link picker field)
- **Mô tả:** Cả hai doctype khai `submittable:true` nhưng `menu:false`. Grep "Request for Quotation" toàn client = 0 kết quả tuyệt đối. Field "Theo báo giá NCC" trên form Đơn mua hàng là ô nhập tên chứng từ mà người dùng không có cách nào tạo ra chứng từ đó trước — cơ chế thay thế việc so giá qua Zalo (theo comment brief) nay hoàn toàn vô hình.

### C2 — P1 — Đơn mua hàng thiếu hẳn field `material_request` dù backend đã có cơ chế "từ chối đặt vượt số đã yêu cầu"
- **Bằng chứng:** `server/packages/clouderp-core/src/controllers.ts:177,367` (`assertRequestRemaining`); `server/briefs/alumdoor-v2.json:9556-9569` (mảng fields PO — không có `material_request`); 0 kết quả grep trong `AlumdoorPurchaseOrderCreateStable.tsx`
- **Mô tả:** Cơ chế "không đặt vượt yêu cầu" có thật ở tầng lõi nhưng doctype Purchase Order của Alumdoor không khai field liên kết, và UI tạo Đơn mua hàng không có ô chọn Yêu cầu vật tư gốc — vòng kiểm soát chưa từng được kích hoạt.

### C3 — P1 — `Supplier Item.last_purchase_rate` — field tự mô tả "giá tham khảo khi đặt hàng" nhưng bị ẩn field lẫn ẩn menu doctype, không màn mua hàng nào đọc
- **Bằng chứng:** `server/briefs/alumdoor-v2.json:4999,5029,5032,5045` (`hidden:true`, `menu:false`); nơi duy nhất đọc là `server/apps-src/alumdoor-worker/src/catalog-readiness.ts:318,426,434` (chỉ phục vụ % sẵn sàng danh mục); 0 kết quả trong 3 màn nghiệp vụ mua hàng thật
- **Mô tả:** Người lập đơn gõ đơn giá "mù", không có gợi ý giá kỳ trước như thiết kế dự định.

### C4 — P2 — `Purchase Receipt.total_qty` (Tổng số lượng) không hiển thị trên form Phiếu nhập mua
- **Bằng chứng:** `server/briefs/alumdoor-v2.json:10052`; 0 kết quả grep `total_qty` trong `AlumdoorPurchaseReceiptWorkbench.tsx` (chỉ có `totalAmount` ở dòng 1134, 1261)
- **Mô tả:** Thủ kho không có con số tổng SL để đối chiếu nhanh trước khi lưu, phải tự cộng từng dòng. Gap phụ, không ảnh hưởng tiền/nghiệp vụ chính.

**0 ứng viên P0 tìm thấy.** Toàn bộ luồng lõi Đơn mua hàng → Phiếu nhập mua → ghi sổ kế toán hoạt động đầy đủ trên UI, kể cả các field bắt buộc nghiệp vụ (ảnh chụp hàng nhận, dung sai cân theo NCC, received_percentage).

## 3. Sổ đăng ký luật ngủ mới (để cộng vào README)

| Ca | Nguồn | Lệnh xác nhận nhanh |
|---|---|---|
| S1 landed-cost | `procurement-landed-cost.ts:48` | `grep -rn "planProcurementLandedCost\|allocateLandedCost" server client` → kỳ vọng 2 (chỉ định nghĩa) |
| S2 operator debt read-model | `purchase-supplier-debt-report.ts:79` | `grep -rn "attachPurchaseAllocationQueueKeys" server/apps-src client/packages` → kỳ vọng 0 |
| S3 supplier price/spend analytics | `procurement-analytics.ts:58,132` | `grep -rn "buildSupplierPriceHistory\|buildSupplierSpendSummary" server/apps-src client/packages` → kỳ vọng 0 |
| S4 preview receipt v2 | `purchase-allocation-preview.ts:58` | `grep -rn "previewPurchaseReceiptSubmission" server/apps-src client/packages` → kỳ vọng 0 |

## 4. Tổng kết

| Hạng | Server | Screen | Tổng |
|---|:--:|:--:|:--:|
| P0 | 0 | 0 | **0** |
| P1 | 3 | 3 | **6** |
| P2 | 1 | 1 | **2** |
| **Tổng** | 4 | 4 | **8** |
