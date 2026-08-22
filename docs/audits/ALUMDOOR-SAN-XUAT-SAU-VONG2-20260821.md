# Alumdoor — Sản xuất (đợt 2, sâu hơn lane MFG-ACC S1-S6/S4 21/08) — Khoảng trống danh mục (21/08/2026, vòng 3)

## 0. Phạm vi & phương pháp — ⚠ CHỈ CÓ LANE SERVER

**Lưu ý quan trọng:** vòng workflow này bị dừng sớm theo yêu cầu người dùng để lấy kết quả sớm (xem README §4 vòng 3). Agent lane SCREEN cho module Sản xuất **chưa từng chạy** — báo cáo này chỉ có kết quả lane SERVER. Khoảng trống UI (so field DocType Work Order/BOM/Manufacturing Settings với màn hình thật) vẫn là việc còn treo cho vòng sau.

Lane MFG-ACC gốc (21/08) đã tìm S1-S6 (P0 duy nhất của cả vòng: S1 — sơn thuê ngoài 0 field). Lượt này đào sâu vào các route/hàm `manufacturing-*.ts` khác chưa được S1-S6 chạm tới, tập trung vào `server/apps/tenant-worker/src/manufacturing-*-api.ts` (lớp route handler) đối chiếu `operational-manufacturing-routes.ts` (dispatcher trung tâm).

**Tổng kết nhanh: 2 P0 + 3 P1 + 1 P2 — đây là lane có nhiều P0 nhất trong toàn bộ vòng 3.**

## 1. Lane SERVER (6 phát hiện)

### S1 — P0 — Route `get_open_sales_production_demand` không được gắn vào router — luôn 404
- **Luật ngủ:** có
- **Bằng chứng:** `server/apps/tenant-worker/src/manufacturing-planning-api.ts:11,25-31,33` (định nghĩa `OPEN_DEMAND_PATH` + `isManufacturingPlanningApiPath` + `routeManufacturingPlanningApi`) đối chiếu `server/apps/tenant-worker/src/operational-manufacturing-routes.ts:19` (type `ManufacturingOperationalRoute` chỉ liệt kê `"bom-bulk"|"mrp"|"capacity"|"costing"|"genealogy"|"qms"`, **KHÔNG có `"planning"`**) và `:21-29` (`matchManufacturingOperationalRoute` không gọi `isManufacturingPlanningApiPath`); grep toàn bộ `server/apps` (9 worker) cho "manufacturing-planning-api" chỉ ra đúng 1 file (chính nó)
- **Mô tả:** Hàm `buildOpenSalesProductionDemand` (`manufacturing-demand-read.ts:54`) có route handler đầy đủ khai path `POST /api/method/metaforge.manufacturing.get_open_sales_production_demand`, nhưng dispatcher trung tâm quên đăng ký nhánh `"planning"`. Mọi request tới endpoint này đều lọt qua router chính, không bao giờ chạm handler thật, trả về 404 bất kể payload đúng hay sai. Khác biệt rõ với S4 cũ (`get_work_order_cost_evidence`, đã đóng vòng trước) vì S4 CÓ được nối vào router — đây là một lỗi wiring độc lập, chưa từng bị phát hiện.

### S2 — P0 — MRP nổ nhu cầu + tạo Material Request từ Production Plan: server nối dây đủ, 0 nơi gọi ở toàn bộ client
- **Luật ngủ:** có
- **Bằng chứng:** `server/apps/tenant-worker/src/manufacturing-mrp-api.ts:13-14` (`PREVIEW_PATH=preview_production_plan_mrp`, `CREATE_PATH=create_mrp_material_request`), `:71` `explodeProductionPlanMrp(...)`, `:80` `netMrpAgainstOnHand(...)`, `:100` `materialRequestDraftsFromMrp(...)` — route CÓ đăng ký ở `operational-manufacturing-routes.ts:23` ("mrp" case); grep 2 chuỗi endpoint trên toàn `client/apps` + `client/packages` = 0 kết quả
- **Mô tả:** Ba hàm lõi (`explodeProductionPlanMrp`, `netMrpAgainstOnHand`, `materialRequestDraftsFromMrp`) nối đúng vào route đã đăng ký — khác S1, route này không bị bỏ sót ở tầng dispatcher. Nhưng không màn hình nào trong MetaForge từng gọi 2 endpoint preview/create MRP. Đây là chức năng lõi "Production Plan → nhu cầu ròng sau khi trừ tồn → Material Request nháp" — quy trình sản xuất trọng yếu — có backend hoàn chỉnh nhưng người dùng không có cách nào kích hoạt qua sản phẩm. Module thay thế duy nhất tìm thấy (`aluminum-supply-demand.ts`) là giữ chỗ tồn nhôm theo lô/màu/độ dài, KHÔNG phải MRP nổ theo BOM — không phải phương án thay thế hợp lệ.

### S3 — P1 — Preview năng lực xưởng (`preview_capacity_plan`) hoàn toàn vô hình — bị một hệ thống capacity khác thay thế trong thực tế
- **Luật ngủ:** có
- **Bằng chứng:** `server/apps/tenant-worker/src/manufacturing-capacity-api.ts:14,98` (route đăng ký ở `operational-manufacturing-routes.ts:24`); grep "preview_capacity_plan" toàn client = 0; `client/packages/vertical-alumdoor/src/work-order-v2/AlumdoorWorkOrderCapacityPanel.tsx:5-6` xác nhận panel thật gọi `alumdoor.capacity.preview` → `planCapacity` ở `operations-core.ts:157`, implementation khác hoàn toàn
- **Mô tả:** `buildManufacturingCapacityPlan` cùng 3 DocType (Manufacturing Routing / Workstation Capacity Calendar / Manufacturing Downtime, đăng ký CRUD ở `registry-part-01.ts:25-27`) tạo hệ thống hoạch định năng lực song song, route nối đủ nhưng không màn hình nào preview kết quả — panel thật dùng engine khác không đọc 3 DocType này. **Rủi ro thực tế:** nếu người dùng nhập "Manufacturing Downtime" (lịch nghỉ máy) tưởng ảnh hưởng ngày giao hàng, dữ liệu đó lặng lẽ không có tác dụng gì.

### S4 — P1 — `get_work_order_genealogy` (truy vết lô/mẻ nguyên liệu vào Work Order) — server xong, không màn nào gọi
- **Luật ngủ:** có
- **Bằng chứng:** `server/apps/tenant-worker/src/manufacturing-genealogy-api.ts:11,89` (route đăng ký ở `operational-manufacturing-routes.ts:26`); grep endpoint + "Genealogy|genealogy|truy vết" toàn client/vertical-alumdoor = 0
- **Mô tả:** `buildWorkOrderGenealogy` dựng chuỗi nguồn gốc lô/mẻ nguyên liệu đã tiêu hao cho một Work Order — tính năng truy vết quan trọng khi cần thu hồi hàng lỗi/đối chiếu chất lượng. Route hoạt động đầy đủ ở server nhưng không nút/màn nào trong Workbench Work Order gọi tới.

### S5 — P1 — Nhập BOM hàng loạt: cả route REST lẫn khung "batch executor" đều không có nơi gọi
- **Luật ngủ:** có
- **Bằng chứng:** `server/apps/tenant-worker/src/manufacturing-bom-bulk-api.ts:12-13,76,82` (route đăng ký ở `operational-manufacturing-routes.ts:22`); grep endpoint toàn client = 0; `server/packages/clouderp-erpnext/src/manufacturing-bom-batch-consumer.ts` (146 dòng, export ở `index.ts:10`) — grep toàn `server/apps`, `server/apps-src`, client = 0 nơi gọi, kể cả trong chính `manufacturing-bom-bulk-api.ts`
- **Mô tả:** Hai lớp mã chết song song: (1) route REST `preview_bulk_bom`/`create_bulk_bom_draft` đã nối dispatcher nhưng không UI gọi; (2) một khung "trusted batch gateway" riêng (`createManufacturingBomBatchDomainExecutor` với `assertTrustedContext`, `rejectClientAuthority`) mà KHÔNG nơi nào trong toàn hệ thống — kể cả route server khác — từng import. Toàn bộ 146 dòng logic bảo mật/validate của lớp thứ hai là mã chết hoàn toàn.

### S6 — P2 — 3 lần `register()` controller Work Order cho cùng doctype — 2 lần vô nghĩa do Map ghi đè
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/clouderp-erpnext/src/registry-part-01.ts:23` chạy trước; `registry-part-04.ts:30,31` chạy sau (thứ tự tại `registry.ts:9-12`); cơ chế ghi đè: `server/packages/document-kernel/src/controller.ts:27` (`this.controllers.set(controller.doctype, controller)`)
- **Mô tả:** Không phải lỗi chức năng (hành vi nghiệp vụ không mất vì kế thừa đúng chuỗi lớp), nhưng là "luật ngủ" cấp cấu hình dễ gây hiểu lầm: lập trình viên đọc `registry-part-01.ts` riêng lẻ sẽ tưởng `StockUomSnapshotWorkOrderController` đang là controller thật, trong khi nó bị thay thế hoàn toàn bởi lớp con đăng ký sau.

**Không có mục "0 ứng viên":** agent xác nhận có ứng viên hợp lệ ở cả ba hạng P0/P1/P2 trong lượt audit này — không hạng nào rỗng.

## 2. Lane SCREEN — CHƯA CHẠY (việc treo cho vòng sau)

Chưa có agent nào audit khoảng trống UI cho module Sản xuất trong vòng 3. Gợi ý cho vòng sau: so field DocType Work Order/BOM/Manufacturing Routing/Manufacturing Downtime với `AlumdoorWorkOrderCapacityPanel.tsx` và các màn `work-order-v2/*.tsx`; đặc biệt kiểm xem "Manufacturing Downtime" (từ S3 trên) có ô nhập nào trên UI dù dữ liệu nhập vào không có tác dụng gì ở backend hay không — nếu có, đó là một finding UI bổ sung liên quan trực tiếp tới S3.

## 3. Sổ đăng ký luật ngủ mới (để cộng vào README)

| Ca | Nguồn | Lệnh xác nhận nhanh |
|---|---|---|
| **S1 — route planning 404** | `manufacturing-planning-api.ts:11` | `grep -n '"planning"' server/apps/tenant-worker/src/operational-manufacturing-routes.ts` → kỳ vọng 0 |
| **S2 — MRP preview/create chưa nối UI** | `manufacturing-mrp-api.ts:13-14` | `grep -rn "preview_production_plan_mrp\|create_mrp_material_request" client` → kỳ vọng 0 |
| S3 capacity plan preview | `manufacturing-capacity-api.ts:14` | `grep -rn "preview_capacity_plan" client` → kỳ vọng 0 |
| S4 work order genealogy | `manufacturing-genealogy-api.ts:11` | `grep -rn "get_work_order_genealogy" client` → kỳ vọng 0 |
| S5 bulk BOM (2 lớp) | `manufacturing-bom-bulk-api.ts:12-13` + `manufacturing-bom-batch-consumer.ts` | `grep -rn "preview_bulk_bom\|create_bulk_bom_draft\|createManufacturingBomBatchDomainExecutor" server client` → kỳ vọng 3 (chỉ định nghĩa) |

## 4. Tổng kết

| Hạng | Server (Screen: chưa chạy) | Tổng |
|---|:--:|:--:|
| **P0** | **2** | **2** |
| P1 | 3 | 3 |
| P2 | 1 | 1 |
| **Tổng** | **6** | **6** |
