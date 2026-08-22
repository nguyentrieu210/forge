# Alumdoor — Kho / Xuất kho (đợt 2, sâu hơn lane WH 21/08) — Khoảng trống danh mục (21/08/2026, vòng 3)

## 0. Phạm vi & phương pháp

Lane WH gốc (21/08, 9 gap #1-#9) đã audit luồng xuất kho trực tiếp (Delivery Note). Lượt này đào sâu vào một mảng **hoàn toàn chưa chạm tới**: engine WMS chuẩn (picking/packing/putaway/wave) trong package `clouderp-stock`, cộng thêm 2 API báo cáo/quét mã liên quan. Phương pháp: luật ngủ (grep xác nhận 0 caller ngoài định nghĩa) + khoảng trống UI (nav trỏ tới DocType không tồn tại). Bằng chứng grep thật qua `device_bash` trên `$HOME/mnt/alumdoor`.

**Tổng kết nhanh: 6 P1 + 2 P2, 0 P0.** Phát hiện nổi bật nhất: **cả một engine WMS 4 hàm (348 dòng, có unit test riêng) tồn tại hoàn chỉnh ở backend nhưng 0 route API, 0 DocType, 0 UI nào gọi tới — và menu "Pick List" trong app Kho trỏ vào một DocType không hề tồn tại trong schema.**

## 1. Lane SERVER (4 phát hiện)

### S1 — P1 — Toàn bộ tầng thuật toán WMS picking/packing/putaway/wave bị "ngủ" — 0 nơi gọi trong toàn hệ thống
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/clouderp-stock/src/wms-picking.ts:52` (`planPicking`), `wms-packing.ts:42` (`validatePacking`), `wms-putaway.ts:47` (`planPutaway`), `wms-wave.ts:27` (`buildPickWaves`) — re-export tại `index.ts:13-16`; grep 4 tên hàm trên toàn `server/packages`, `server/apps`, `server/apps-src`, `client/packages`, `client/apps` chỉ khớp đúng 4 dòng định nghĩa; `registry.ts` chỉ đăng ký `SerialAndBatchBundleIntegrityController` và `RepostItemValuationIntegrityController`, không có route pick/pack/putaway/wave
- **Mô tả:** 4 hàm thuần thiết kế kỹ (chặn double-consume, atomic serial-per-unit, FEFO/FIFO sequencing, capacity-aware putaway, đối chiếu packed≤picked, gom nhóm wave), có unit test riêng (`server/tests/inventory-planning.test.mjs`, `wms-packing.test.mjs`, `wms-wave-scan.test.mjs`) — nhưng luồng xuất kho thực tế dùng cơ chế khác hoàn toàn (`buildTrackedStockLines`/`deriveOutgoingValuation`). `server/briefs/alumdoor-v2.json` không có DocType nào tên Pick/Putaway/Pack/Wave — thiếu cả wiring lẫn mô hình dữ liệu. Nghiệp vụ WMS chuẩn (pick nhiều batch/serial, xác nhận đóng gói theo picked qty, phân bổ vị trí nhập theo capacity, gom sóng lấy hàng) hoàn toàn vô hình với người dùng lẫn hệ thống.

### S2 — P1 — API báo cáo/tải-CSV Physical Stock (`PhysicalStockReportService`) có route backend đầy đủ nhưng 0 UI nào gọi
- **Luật ngủ:** có
- **Bằng chứng:** `server/apps/tenant-worker/src/physical-stock-api.ts:17-18` (`REPORT_PATH`, `EXPORT_PATH`); `server/packages/clouderp-erpnext/src/physical-stock-report-service.ts:61` (class), `:78` (`exportCsv`), `:86` (`scope.can_export`), `:97` (`scope.max_rows`); grep "physical-stock|physical_stock" toàn client = 0
- **Mô tả:** Report/export API hoàn chỉnh — access-scope theo company/warehouse/warehouse_role, CSV escaping an toàn (dòng 231-249), giới hạn 500 dòng — wire đúng route nhưng không màn hình nào trong `kho`, `kho-vn`, `warehouse-mobile`, `sample-wms` gọi tới.

### S3 — P1 — API resolve mã quét kho (`/api/v1/inventory/scan/resolve`) được server hoàn thiện nhưng màn hình quét mã thực tế (`CameraScanner.tsx`) không gọi tới
- **Luật ngủ:** có
- **Bằng chứng:** `server/apps/tenant-worker/src/inventory-scan-api.ts:16` (`RESOLVE_PATH`), `:69-71` (`D1InventoryScanLookup` + `resolveInventoryScan`, định nghĩa tại `server/packages/clouderp-stock/src/inventory-scan-resolution.ts:58`); grep "scan/resolve|resolveScan|ScanResolution" toàn client = 0; `client/apps/kho-vn/src/CameraScanner.tsx` không có dòng fetch/api nào tới path này
- **Mô tả:** `resolveInventoryScan` giải mã chuỗi quét thành ứng viên Item/Batch/Serial No/Warehouse có kiểm quyền theo actor — hạ tầng cần thiết cho wave picking/xác nhận vị trí, đã build xong ở server nhưng component quét camera duy nhất không gọi. Cùng với S1, cho thấy chuỗi "quét mã → xác định vị trí/lô/serial → lập kế hoạch lấy hàng theo sóng" chưa được nối liền dù từng mảnh đã tồn tại riêng lẻ.

### S4 — P2 — `resolveWarehousePath` (dựng đường dẫn cây kho, chống vòng lặp) không có nơi gọi nào kể cả trong chính package
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/clouderp-stock/src/warehouse-location.ts:25` — grep toàn `server/packages` + `server/apps` chỉ khớp dòng định nghĩa
- **Mô tả:** Hàm phòng thủ khá kỹ (chống vòng lặp cha-con, kiểm kho cha disabled, nhất quán company, giới hạn độ sâu) nhưng không controller/route nào dùng, kể cả `wms-putaway.ts` (nhận capacity/current đã tính sẵn, không tự resolve cây kho). Mức nhỏ hơn 3 finding trên vì là 1 hàm tiện ích đơn lẻ.

**0 ứng viên P0 tìm thấy.** Cả 4 finding là code/API hoàn thiện nhưng không kết nối — không đang gây sai số tiền/mất dữ liệu vì đơn giản không chạy trong luồng nghiệp vụ thực nào (luồng xuất kho thật dùng cơ chế khác, đã audit ở lane WH 21/08).

## 2. Lane SCREEN (2 phát hiện)

### C1 — P1 — Toàn bộ engine picking/packing/putaway/wave là luật ngủ hoàn toàn — 0 route API, 0 màn hình UI nào gọi tới
*(cùng bằng chứng gốc với S1 lane server — hội tụ độc lập từ 2 hướng đọc riêng biệt, bằng chứng mạnh hơn theo nguyên tắc "nguồn gốc thắng bản trích")*

### C2 — P1 — Nav "Pick List" trong app Kho trỏ tới DocType không tồn tại ở bất kỳ đâu trong schema hệ thống — link chết duy nhất liên quan picking trên toàn UI
- **Bằng chứng:** `client/apps/kho/src/app-manifest.ts:29` (mục nav `{key:"Pick List", label:"Phiếu lấy hàng", kind:"doctype", group:"Giao dịch kho", icon:"list-checks"}`); grep `"Pick List"` trên toàn bộ `server/briefs/*.json` (14704 dòng `alumdoor-v2.json` + actions/fixtures/integrations/permissions/prints/views/alumdoor.json/center.json/phanbon.json) = 0 kết quả
- **Mô tả:** Mục nav nằm cùng nhóm "Giao dịch kho" với Stock Entry, Purchase Receipt, Delivery Note (đều hoạt động thật) — nhưng không tồn tại DocType "Pick List" nào được định nghĩa ở bất kỳ đâu. Vì màn hình `kind:doctype` của MetaForge Workbench render động theo schema DocType từ server, mục nav này chắc chắn không thể render nội dung hữu ích khi thủ kho bấm vào — tính năng "Phiếu lấy hàng" được quảng cáo ngay trong menu chính của app Kho nhưng chưa từng được triển khai ở tầng dữ liệu.

**0 ứng viên P0, 0 ứng viên P2** — module này chỉ tồn tại dưới 2 hình thức (4 hàm thuật toán backend mồ côi, và 1 mục nav chết), không có khoảng trống lưng chừng nào khác. Đã xác nhận không có DocType nào khác liên quan (Packing Slip, Putaway Rule, Pick Wave...) xuất hiện ở bất kỳ đâu trong `server/briefs` hay client.

## 3. Sổ đăng ký luật ngủ mới (để cộng vào README)

| Ca | Nguồn | Lệnh xác nhận nhanh |
|---|---|---|
| Engine WMS pick/pack/putaway/wave (hội tụ 2 lane) | `wms-picking.ts:52`, `wms-packing.ts:42`, `wms-putaway.ts:47`, `wms-wave.ts:27` | `grep -rn "planPicking\|validatePacking\|planPutaway\|buildPickWaves" server client` → kỳ vọng 4 (chỉ định nghĩa) |
| Physical Stock report/export | `physical-stock-api.ts:17-18` | `grep -rn "physical-stock\|physical_stock" client` → kỳ vọng 0 |
| Scan resolve API | `inventory-scan-api.ts:16` | `grep -rn "scan/resolve\|resolveScan" client` → kỳ vọng 0 |
| Nav "Pick List" chết | `app-manifest.ts:29` | `grep -rn "Pick List" server/briefs` → kỳ vọng 0 |

## 4. Tổng kết

| Hạng | Server | Screen | Tổng (đã loại trùng C1/S1) |
|---|:--:|:--:|:--:|
| P0 | 0 | 0 | **0** |
| P1 | 3 | 2 | **5** (S1≡C1 tính 1 lần) |
| P2 | 1 | 0 | **1** |
| **Tổng riêng theo lane** | 4 | 2 | 6 kết quả thô, **5 finding độc lập** sau khi hội tụ S1/C1 |
