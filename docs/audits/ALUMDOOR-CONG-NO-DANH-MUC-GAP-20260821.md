# Alumdoor — Công nợ / AR-AP (module mới, chưa từng có lane riêng) — Khoảng trống danh mục (21/08/2026, vòng 3)

## 0. Phạm vi & phương pháp — ⚠ CHỈ CÓ LANE SERVER

**Lưu ý quan trọng:** vòng workflow này bị dừng sớm theo yêu cầu người dùng — agent lane SCREEN cho module Công nợ **chưa từng chạy**. Đây là module hoàn toàn mới, chưa từng có lane riêng ở các vòng trước (khác 4 module "đợt 2" khác trong vòng 3, vốn đào sâu thêm trên nền lane cũ).

Phạm vi giao: 6 file — `server/packages/query/src/finance-aging.ts`, `ap-reconciliation.ts`, `finance-closure.ts`; `server/packages/document-kernel/src/purchase-supplier-debt-report.ts`, `sales-order-progress.ts`, `daily-detailed-ledger.ts`. Phương pháp: luật ngủ (grep xác nhận đường chạy report thật của client, đối chiếu với các compiler được đăng ký ở server).

**Tổng kết nhanh: 2 P0 + 2 P1 + 1 P2 — module này có tỷ lệ P0 cao nhất vòng 3 (2/5 finding).** Cả 2 P0 đều thuộc CÙNG một mẫu lỗi wiring: chuỗi kế thừa compiler báo cáo tài chính bị đăng ký thiếu bậc.

## 1. Lane SERVER (5 phát hiện)

### S1 — P0 — `FinanceClosureQueryCompiler` (Daily Detailed Ledger GL + Finance Reconciliation Diagnostics) không nằm trên đường chạy report duy nhất mà client gọi được
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/query/src/finance-closure.ts:16-26` (class `FinanceClosureQueryCompiler`, xử lý report `'Daily Detailed Ledger'` và `'Finance Reconciliation Diagnostics'`); `server/apps/tenant-worker/src/index-core-base.ts:1268` (`reports: new D1ReportService(requestDb, new FinanceQueryCompiler())` — compiler THỰC CHẠY chỉ là lớp cha gốc); `server/packages/frappe-api/src/desk-surfaces.ts:269` (nơi duy nhất client-facing chạy report); `client/packages/adapter-frappe/src/frappe-adapter.ts:796` (`frappe.desk.query_report.run` — lời gọi report duy nhất phía client); `server/packages/policy/src/index.ts:88-94` (quyền đã cấp đủ cho General/Chief Accountant, Director)
- **Mô tả:** `FinanceClosureQueryCompiler extends AccountsPayableQueryCompiler extends FinanceQueryCompiler extends QueryCompiler`. Định nghĩa 2 báo cáo đối soát tài chính quan trọng nhất trong phạm vi được giao: "Daily Detailed Ledger" (bảng kê GL mở/phát sinh/đóng theo tài khoản-chi nhánh-tiền tệ, dùng window function) và "Finance Reconciliation Diagnostics" (UNION 3 khối: `party_control` [Payment Ledger vs GL theo party AR+AP], `gl_integrity` [đọc `finance_gl_reconciliation`], `bank_integrity` [Bank Transaction vs `bank_reconciliation_entries`] — 473 dòng SQL). Cả hai đã có RBAC đầy đủ — thiết kế coi đây là tính năng sản xuất thật. Nhưng đường DUY NHẤT client chạy report (`frappe.desk.query_report.run` → `desk-surfaces.ts:runQueryReport` → `context.reports.run()`) được khởi tạo với `new FinanceQueryCompiler()` — đúng MỘT bậc kế thừa phía dưới `FinanceClosureQueryCompiler` — nên request report này qua đường đó ném lỗi "Unknown report". Có một endpoint khác wire đủ chuỗi kế thừa (`FinanceReportCompiler` tại `server/apps/query-worker/src/index.ts:15,52`, phục vụ tại `/api/v1/reports/run`), nhưng grep toàn `client/packages` + `client/apps` cho "reports/run"/"v1/reports" = 0 kết quả — không route client nào gọi endpoint đó. **Kết quả:** SQL đối soát AR/AP/GL/Bank hoàn chỉnh, có quyền, nhưng không người dùng thật nào chạy được qua bất kỳ luồng UI nào — rủi ro sai lệch sổ phụ (Payment Ledger) so với sổ cái (GL) tồn đọng vô thời hạn mà không công cụ nào phát hiện. Xếp P0 vì đây đúng nghĩa "chặn nghiệp vụ chính" (đối soát/đóng sổ kế toán).

### S2 — P0 — `AccountsPayableQueryCompiler` (Supplier Statement, Supplier Reconciliation) chết vì cùng lỗ hổng nối dây
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/query/src/ap-reconciliation.ts:15-21` (class, xử lý `'Supplier Statement'`/`'Supplier Reconciliation'`); `server/apps/tenant-worker/src/index-core-base.ts:1268` (compiler thực chạy chỉ là `FinanceQueryCompiler`); `server/packages/policy/src/index.ts:68-69` (quyền đã cấp cho Accounts Manager/User/Purchase Manager); 0 kết quả khi grep 2 tên report này trên toàn `client/packages` + `client/apps`
- **Mô tả:** `AccountsPayableQueryCompiler` nằm giữa `FinanceQueryCompiler` và `FinanceClosureQueryCompiler` trong chuỗi kế thừa — cùng gốc lỗi với S1. "Supplier Reconciliation" (dòng 124-244) đối soát Payment Ledger với GL control account theo từng NCC — công cụ phát hiện chênh lệch phải trả giữa sổ phụ và sổ cái. "Supplier Statement" (dòng 23-122) là sao kê công nợ NCC theo chứng từ với số dư luỹ kế. Cả hai có RBAC riêng nhưng vì `context.reports` chỉ `new FinanceQueryCompiler()` (lớp cha của compiler này), gọi report từ UI luôn nhận "Unknown report". Grep client cho 0 kết quả — không dòng UI nào từng thử gọi, xác nhận luật ngủ hoàn toàn: SQL, cột, quyền đã đủ, chỉ thiếu một dòng compiler injection.

### S3 — P1 — `D1PurchaseSupplierDebtReportService` (Công nợ giao hàng NCC) mồ côi vì service bọc ngoài duy nhất của nó không được route nào gọi
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/document-kernel/src/purchase-supplier-debt-report.ts:79-206` (class, method `run()`); `server/packages/document-kernel/src/purchase-allocation-operator-timeline.ts:34-43` (nơi DUY NHẤT khởi tạo ngoài chính file định nghĩa); grep `D1PurchaseAllocationOperatorTimelineService` toàn `apps`+`apps-src`+`packages` chỉ ra 2 kết quả (định nghĩa + re-export ở `index.ts`) — 0 nơi import dùng trong `apps`/`apps-src`; `server/apps/tenant-worker/src/index-core-base.ts:1195` (route `GET /api/method/metaforge.api.get_purchase_allocation_timeline` dùng bản GỐC `D1PurchaseAllocationTimelineService`, không có `supplier_debt_reports`)
- **Mô tả:** `D1PurchaseSupplierDebtReportService.run()` tính công nợ giao hàng NCC (đã đặt/đã nhận/đã phân bổ/nợ danh nghĩa/phiếu nhập chờ, theo barem vs thực tế) bằng 5 CTE đọc trực tiếp từ append-only ledger (`purchase_window_obligation_entries`, `purchase_receipt_allocation_entries`, `purchase_unapplied_receipt_entries` — đúng docstring "bảng progress cũ không được dùng làm nguồn sự thật"). Con đường DUY NHẤT gọi tới nó (`D1PurchaseAllocationOperatorTimelineService.getTimeline()`) chưa từng được route nào import — route thật đang chạy dùng bản KHÔNG có `supplier_debt_reports`. Toàn bộ 364 dòng logic không bao giờ thực thi trong sản xuất. Xếp P1 (không P0) vì đã có dashboard khác (`alumdoor.purchase.supplier_delivery_dashboard`) phục vụ nhu cầu công nợ giao hàng NCC theo hướng khác — công sức trùng lặp bị mồ côi, không phải lỗ hổng không có phương án thay thế.

### S4 — P1 — Party Statement / Debt Summary / Advance Balance của `finance-aging.ts`: chạy được ở server nhưng không một dòng UI nào từng gọi
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/query/src/finance-aging.ts:45-47` (`compilePartyStatement` dòng 124, `compileDebtSummary` dòng 211, `compileAdvanceBalance` dòng 302); `server/packages/policy/src/index.ts:67,70,71`; `client/packages/vertical-alumdoor/src/cong-no/data.ts:114,160,246,388` (4 lời gọi `server.runReport()` trong toàn màn Công nợ chỉ dùng "Công nợ theo khách hàng", `config.ledgerReport`, `config.agingReport`, "General Ledger" — không có 3 report này); grep 3 tên report toàn client = 0
- **Mô tả:** Khác 2 P0 ở trên, 3 report này CHẠY ĐƯỢC ngay hôm nay (đã có `new FinanceQueryCompiler()` từ commit `c9fcfd1fa`, 21/08/2026 17:43) và có RBAC đầy đủ — không phải lỗi wiring. Nhưng vẫn là "luật ngủ" trên thực tế: màn "Báo cáo công nợ" (`cong-no/`) — đúng nơi lẽ ra cần nhất — chỉ gọi 4 report khác, không đụng "Party Statement" (sao kê đối tác có số dư luỹ kế), "Debt Summary" (tổng hợp due/overdue/advance/net_exposure theo party-account-currency), hay "Advance Balance" (số dư tạm ứng chưa phân bổ theo Payment Entry). Năng lực server có thật, có quyền, nhưng vô hình 100% với người dùng.

### S5 — P2 — Comment giải thích trong `cong-no/data.ts` nói Aging "CHƯA nối dây" đã lỗi thời so với code server hiện tại
- **Luật ngủ:** không (đây là gap tài liệu, không phải dead-code)
- **Bằng chứng:** `client/packages/vertical-alumdoor/src/cong-no/data.ts:14` và `:217-233` (khẳng định Aging "CHƯA nối dây... gọi tên báo cáo này hiện trả Unknown report"); git blame: commit cuối của file này là `739b50ee1` lúc 2026-08-21 17:42:26 +0700, còn fix thật ở server (`index-core-base.ts:1268`) nằm ở commit `c9fcfd1fa` lúc 2026-08-21 17:43:12 +0700 — **sau đúng 46 giây**
- **Mô tả:** Không phải lỗi chạy được/không mà là tài liệu lệch thực tế: comment đúng tại thời điểm viết, nhưng 46 giây sau có commit fix riêng thêm `new FinanceQueryCompiler()` vào `context.reports` — khiến Aging Receivable/Payable giờ CHẠY ĐƯỢC. Comment chưa cập nhật, có rủi ro khiến lập trình viên sau này tưởng nhầm Aging vẫn chết, hoặc không nhận ra đúng dạng lỗi "nối thiếu N bậc kế thừa" đã lặp lại y hệt ở 2 finding P0 trên (S1, S2).

## 2. Zero-candidate notes (nguyên văn agent)

2 trong 6 file được giao KHÔNG có ứng viên sleeping-law:
- **`daily-detailed-ledger.ts`** (`D1DailyDetailedLedgerService`) — route đầy đủ qua `server/apps/tenant-worker/src/daily-ledger-api.ts` (cả REST lẫn Frappe-method), đăng ký thật trong `operational-stock-routes.ts`, có UI thật ở `client/apps/runtime/src/experiences/DailyDetailedLedger.tsx` — code sống, không đưa vào danh sách.
- **`sales-order-progress.ts`** (`deriveSalesOrderProgress`) — hàm thuần được gọi thật từ `document-kernel/src/d1-store.ts` và `in-memory-store.ts` (`hydrateDerived`) — code sống.

Về field vô hình cấp DocType: đã grep 8 tên report tài chính trên toàn bộ `server/briefs/*.json` — 0 kết quả ở TẤT CẢ file brief (không report nào có mục `reports[]`/menu item khai trong brief; các report này chỉ tồn tại dưới dạng lời gọi `runReport()` cứng trong code, không qua cơ chế brief/report registry chuẩn — không đủ cơ sở tách thành finding "field DocType" riêng, đã gộp vào S1/S2/S4).

**0 ứng viên P0 thuần "mất dữ liệu/sai số tiền trực tiếp"** — cả 2 finding P0 (S1, S2) thuộc loại "chặn công cụ phát hiện sai lệch" (đối soát), không phải bản thân phép tính tiền bị sai — ghi rõ để không đánh đồng mức độ nghiêm trọng.

## 3. Lane SCREEN — CHƯA CHẠY (việc treo cho vòng sau)

Chưa có agent audit khoảng trống UI riêng cho module Công nợ trong vòng 3. Gợi ý vòng sau: kiểm màn `cong-no/` có nút/khu vực nào đã có UI (ví dụ nút "Sao kê đối tác") nhưng gọi sai tên report hay không — nếu người phát triển UI *biết* về Party Statement/Debt Summary nhưng chỉ chưa nối đúng, đó sẽ nâng mức độ ưu tiên sửa S4 lên đáng kể so với việc hoàn toàn không ai biết.

## 4. Sổ đăng ký luật ngủ mới (để cộng vào README) — mẫu lỗi lặp lại quan trọng nhất vòng 3

| Ca | Nguồn | Lệnh xác nhận nhanh |
|---|---|---|
| **S1 — FinanceClosureQueryCompiler thiếu bậc kế thừa ở context.reports** | `finance-closure.ts:16` vs `index-core-base.ts:1268` | `grep -n "new FinanceQueryCompiler\|new FinanceClosureQueryCompiler" server/apps/tenant-worker/src/index-core-base.ts` → kỳ vọng chỉ dòng đầu khớp |
| **S2 — AccountsPayableQueryCompiler cùng lỗi** | `ap-reconciliation.ts:15` | `grep -rn "Supplier Statement\|Supplier Reconciliation" client` → kỳ vọng 0 |
| S3 công nợ giao hàng NCC mồ côi | `purchase-supplier-debt-report.ts:79` | `grep -rn "D1PurchaseAllocationOperatorTimelineService" server/apps server/apps-src` → kỳ vọng 0 |
| S4 3 report Party/Debt/Advance chưa nối UI | `finance-aging.ts:45-47` | `grep -rn "Party Statement\|Debt Summary\|Advance Balance" client` → kỳ vọng 0 |

**⚠ Khuyến nghị sửa ưu tiên nhất vòng 3:** S1 + S2 cùng gốc — chỉ cần đổi `new FinanceQueryCompiler()` thành `new FinanceClosureQueryCompiler()` (kế thừa đủ cả `AccountsPayableQueryCompiler`) tại `index-core-base.ts:1268` là mở khoá được CẢ 4 report đối soát tài chính quan trọng nhất hệ thống (Daily Detailed Ledger, Finance Reconciliation Diagnostics, Supplier Statement, Supplier Reconciliation) cùng lúc — tỷ lệ chi phí sửa/giá trị mở khoá cực cao, nên là ứng viên đầu tiên khi bắt đầu sửa code thật.

## 5. Tổng kết

| Hạng | Server (Screen: chưa chạy) | Tổng |
|---|:--:|:--:|
| **P0** | **2** | **2** |
| P1 | 2 | 2 |
| P2 | 1 | 1 |
| **Tổng** | 5 | **5** |
