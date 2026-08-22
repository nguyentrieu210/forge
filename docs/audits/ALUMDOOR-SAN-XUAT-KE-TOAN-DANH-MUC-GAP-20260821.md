# Alumdoor — kiểm kê khoảng trống giữa DANH MỤC và nghiệp vụ SẢN XUẤT + KẾ TOÁN

*Lane MFG-ACC của `docs/ALUMDOOR-PROMPT-AUDIT-DANH-MUC-MAN-HINH-20260821.md`. Câu hỏi: danh mục đã
biết điều gì mà hai nghiệp vụ này không được nghe? Đọc-chỉ, không có phiên D1 local khi audit.*

---

*Phạm vi: đọc-chỉ, không sửa file/D1/build. Số liệu ghi "(20/08)" lấy nguyên từ `ALUMDOOR-AUDIT-VONG-2-KET-QUA.md`, không đo lại (không có D1 sống — nguyên tắc 6). Số liệu không ghi ngày là tôi tự đo lại hôm nay bằng grep/python trên mã nguồn thật, kèm lệnh để đo lại.*

---

## PHẦN 1 — SẢN XUẤT

### Câu hỏi trung tâm đã trả lời trước: UI Sản xuất có đọc `formula_explanation` không?

**Không.** Và lý do sâu hơn brief đặt ra: `formula_explanation` (câu tiếng Việt đầy đủ) chỉ được dựng trong **một** hàm — `calculateSalesProductionLine` (`server/apps-src/alumdoor-worker/src/sales-production-core.ts:1189`, `formula_explanation: `${formula.explanation}${geometry?...}${leaf?...}``) — hàm **preview lúc bán hàng**, không phải hàm tạo lệnh sản xuất. Hàm tạo lệnh sản xuất thật (`buildSalesProductionLines`, cùng file, dòng 851, khối `snapshot` dòng ~881-940) dựng `Work Order.formula_snapshot` **không hề ghi field `formula_explanation` vào đó**. Kiểu dữ liệu phía Work Order — `WorkOrderFormulaSnapshot` (`work-order-v2/model.ts:334-359`) — do đó **không khai field này** (không phải bị bỏ đọc, mà chưa từng có trong payload nó nhận). Đây là khoảng trống sâu hơn phía Bán hàng: Bán hàng ít nhất còn *nhận* được field (dù không chắc đã in ra); Work Order thì cấu trúc dữ liệu của nó **không có chỗ chứa** câu diễn giải đó.

Đo lại: `grep -n "formula_explanation" client/packages/vertical-alumdoor/src/work-order-v2/model.ts` → 0 dòng.

### Bảng chính

| # | Năng lực danh mục | Nghiệp vụ đọc tới đâu | Hậu quả đo được | Hạng | Ngủ? |
|---|---|---|---|---|---|
| S1 | **Sơn thuê ngoài** — `CHI-TIẾT-SƠN.md`: NCC HẢI KỲ, công thức riêng (Cửa Đức 6.500đ "RCL×SỐ LÁ×SỐ LỚP", Cửa Úc 50.000đ "CAO×RCL×2 MẶT") | `Paint Job` — xác nhận đủ 14/14 field (`work_order, production_request, production_request_line_key, cut_order, batch_no, item_code, source_color, target_color, qty, state, planned_on, completed_on, kcs_by, note`): **0 field** cho NCC/đơn giá/công thức. `AlumdoorWorkOrderCutPanel.tsx` chỉ đọc danh sách Paint Job **tự sinh** (`syncPaintJobsFromCut`, dòng 10, 148, 564) — không có form nhập nào cho "thuê ngoài" vì schema không có chỗ | 14/14 field Paint Job không nhận được khái niệm thuê ngoài; 0 bản ghi Paint Job (20/08). Chi phí sơn thật không có đường vào BOM/giá vốn thành phẩm | **P0** | Không — chưa từng có chỗ ghi, không phải "có mà không đọc" |
| S2 | **Diễn giải công thức + chia lá** — `formula_explanation`, `width_basis`, `leaf.explanation/leaf_formula/leaf_variant` (nguồn: `calculateDoorFormula`, `calculateLeafPlan`, `Cutting Policy.dealer_width_basis/retail_width_basis` — lệch nhau ~1,5% tiền theo `ALUMDOOR-LUAT-DO-VA-GIA.md` §2) | `WorkOrderFormulaSnapshot` nhận `formula_policy`, `formula_version`, `width_basis`, `leaf.{leaf_count, leaf_variant, leaf_formula, explanation}` — nhưng Workbench.tsx + CutPanel.tsx (kể cả panel CẮT chuyên trách) chỉ render `formula_policy` (dòng 726), `formula_version` làm hint (727), 3 số đếm lá (722, 918). `width_basis` khai ở model.ts:350 nhưng **0 điểm render**. `leaf.explanation/leaf_formula/leaf_variant` — **0 điểm render** | grep "explanation\|leaf_formula\|leaf_variant" trên 2 file trên: exit 1, 0 khớp. Người cắt thấy SỐ (rộng cắt, số lá) nhưng không thấy VÌ SAO | **P1** | ✅ |
| S3 | **BOM Template — tầng giữa** (349→181 bản ghi, 20/08) giữa `BOM Rule` (110) và `Bill of Materials` (234) | `ProductionRequestDetail.tsx` hiển thị readonly tốt (Template/BOM Template nguồn/Fingerprint, dòng 190-192, badge "Sinh từ configurator" vs "BOM tĩnh"). Nhưng **không có file `*BomTemplate*Editor*` nào** trong toàn `vertical-alumdoor/src` (ls xác nhận) — chỉ có editor cho tầng luật (`BomRuleEditor`) và tầng chốt (`BomActualEditor`) | 0 màn biên tập chuyên trách cho tầng giữa, so với 1+1 cho hai tầng còn lại | **P1** | Cố ý không kết luận (xem mục riêng) |
| S4 | **Giá vốn sản xuất chuẩn-vs-thực** — `ManufacturingCostEvidence` (13 field số + `warnings[]`: `standard_material_cost_minor`, `actual_finished_good_value_minor`, `material_variance_minor`…) | Route `POST /api/method/metaforge.manufacturing.get_work_order_cost_evidence` sống, cùng file/hàm với `get_work_order_lifecycle` (route sinh đôi, `server/apps/tenant-worker/src/manufacturing-costing-api.ts`). Lifecycle: 3 nơi gọi (`AlumdoorWorkOrderWorkbench.tsx`, `AlumdoorManufacturingStockEntryCreate.tsx`, `work-order-v2/model.ts:32-34` — trích dẫn thẳng file nguồn trong comment!). Cost evidence: **0 nơi gọi** trong toàn `client/packages` | `grep -rl "get_work_order_cost_evidence" client/packages` → 0 file. Cùng router, một nửa được dùng một nửa không | **P1** | ✅✅ — rõ nhất trong audit này |
| S5 | **`schedule_warning`** (cảnh báo vượt công suất, từ `Production Standard`) | `SalesProductionLine.schedule_warning` được server dựng — 0 nơi đọc ở cả work-order-v2 lẫn sales-order-v2 | grep 2 thư mục: 0 khớp | **P2** | ✅ (nhẹ) |
| S6 | **Công thức nằm rải 3 chỗ** (`Cutting Policy` 8 bản ghi · `BOM Rule.formula_json` 110 · `door-formulas.ts` hard-code) — KET-QUA §4 tự cảnh báo "dễ trôi dạt nhất" | `BomRuleEditor.tsx` nói rõ ranh giới với Cutting Policy trong 1 câu UI (dòng 306: "Cutting Policy vẫn chỉ tính hình học cửa cha") — điểm cộng. Nhưng không màn nào đối chiếu 2 công thức cùng áp cho 1 mã | Không có công cụ đối soát chéo 3 nơi | **P2** | Không hẳn — thiếu công cụ, không phải field bị bỏ qua |

### Luật đang ngủ (Sản xuất)

1. **`get_work_order_cost_evidence` (S4)** — ca rõ nhất. `manufacturing-costing-read.ts` (199 dòng) dựng đủ giá vốn tiêu chuẩn (từ checksum BOM đã ghi sổ) vs thực tế (từ Stock Ledger qua genealogy, trừ thu hồi đầu thừa) vs biến động — nhưng route sinh đôi với route ĐANG được Work Order Workbench gọi, chỉ khác đúng 1 từ trong path (`get_work_order_lifecycle` vs `get_work_order_cost_evidence`). Đo lại: `grep -rl "get_work_order_lifecycle" client/packages` → 3 file; `grep -rl "get_work_order_cost_evidence" client/packages` → 0 file.
2. **`leaf.explanation`/`leaf_formula`/`leaf_variant` (S2)** — sinh tại `sales-production-core.ts:881` (theo đúng comment trong `work-order-v2/model.ts:33`), đóng gói sẵn trong `formula_snapshot` mà Work Order lưu, nhưng CutPanel — panel chuyên trách CẮT — chưa từng đọc field `explanation` của chính cấu phần lá nó đang xử lý.
3. **`schedule_warning` (S5)** — nhỏ nhưng cùng dạng: server tính, không màn nào ở cả hai nghiệp vụ (Bán/Sản xuất) hiển thị.

### Cố ý không kết luận

- **`AlumdoorProductionPlanCreate.tsx`** (16.229 byte, logic chọn BOM/khoá dòng Tách món riêng) — xác nhận **không được import ở bất kỳ đâu khác** trong `client/packages` (`grep -rln "AlumdoorProductionPlanCreate" client/packages` → chỉ chính file đó; `workspace-extension.tsx` chỉ lazy-load 7 màn, không có màn này — dòng 6-13). Có 2 khả năng không phân biệt được từ mã nguồn: (a) màn này chết/orphan, hoặc (b) đã bị thay bằng luồng thật `Production Request` → `alumdoor.sales.create_production` (xác nhận sống, dùng trong `AlumdoorProductionRequestDetail.tsx`). Không đủ dữ liệu lịch sử để kết luận.
- **BOM Template không có editor (S3)** — có thể chủ ý (KET-QUA: "Máy sinh thì sửa tay sẽ bị đè ở lần sinh sau") hoặc đơn giản chưa làm. Không đủ bằng chứng để phân biệt.
- Số bản ghi Paint Job=0, BOM 234/349→181/110, Cutting Policy=8 — kế thừa nguyên số 20/08, không đo lại (không có D1 sống).
- Chưa xác minh được liệu `push("formula_explanation", "Diễn giải", …)` mới xuất hiện ở `sales-order-v2/model.ts:1040` (một hàm dựng `PriceExplanationRow[]`) có thực sự được một component Bán hàng render lên màn hình hay không — phát hiện này nằm ngoài phạm vi Sản xuất/Kế toán được giao, tôi chỉ ghi nhận nó **tồn tại trong mã nguồn** (khác hẳn kết luận "0 nơi in ra" đã cho trong bối cảnh), không tự ý phủ nhận hay xác nhận lại phát hiện gốc của đợt audit Bán hàng.

---

## PHẦN 2 — KẾ TOÁN

### Bảng chính

| # | Năng lực danh mục | Nghiệp vụ đọc tới đâu | Hậu quả đo được | Hạng | Ngủ? |
|---|---|---|---|---|---|
| K1 | **Cơ chế giá vốn** — `default_valuation_method` (FIFO/Bình quân di động, brief dòng 4263), `default_cogs_account` (4260), field "Giá vốn" lặp lại trên ≥4 vị trí dòng chứng từ (7796-7799, 8018-8021, 9923-9927, 13161: *"Giá VỐN một đơn vị tồn kho tại thời điểm ghi sổ… đi vào giá vốn hàng bán"*), `deriveOutgoingValuation()` (11981), "Giá vốn thành phẩm = tổng vật tư xuất + chi phí gia công" (10562) | `Item` doctype (31 field, xác nhận bằng python trên brief) — **0 field** khớp "cost"/"von"/"valuation"/"rate". Cột GIÁ VỐN tĩnh của `DANH-MỤC.md` **không có đích để nhập vào Item**. Cơ chế transactional (FIFO/BQ di động) có thiết kế đầy đủ nhưng `stock_ledger_entries` = 0 dòng (20/08) → chưa từng tính ra một số thật nào | 31/0 field; brief tự cảnh báo (762-777, 7866-7870): thiếu tài khoản giá vốn thì "lãi gộp hiện đúng 100% trên mọi [dòng]" | **P1** (chưa gây số sai vì chưa có giao dịch chạy; rủi ro có thật khi giao dịch bắt đầu) | Một phần — "đã viết, đã nối tài khoản, CHƯA từng chạy", khác "chạy mà không ai đọc" |
| K2 | **`Customer.credit_limit:Currency` "Hạn mức công nợ"** (nguồn `DS-KH-NCC.md`, nhắc tại `ALUMDOOR-PROMPT-AUDIT-VONG-2.md` §4.2, trả lời tại KET-QUA §5.2) | Toàn bộ `cong-no/` (`AlumdoorDebtWorkbench.tsx` 54.898B + `data.ts` + `model.ts` + `AlumdoorDebtField.tsx`) — **0 tham chiếu** `credit_limit`. Toàn server (trừ build artifact) — **đúng 1 file** chạm field này: `customer-import.ts` (người NHẬP, không phải người ĐỌC LẠI) | `grep -rl --include="*.ts" "credit_limit" server/apps-src server/packages --exclude-dir={node_modules,dist}` → 1 file. `Supplier` (11 field) **không có** field tương đương | **P1** | ✅ — field ghi-rồi-không-ai-đọc-lại kinh điển |
| K3 | **Tuổi nợ chia khoảng** — `server/packages/query/src/finance-aging.ts`, 5 khoảng (Chưa đến hạn·1-30·31-60·61-90·Trên 90) | `AgingPanel` trong `AlumdoorDebtWorkbench.tsx:604-627`: trạng thái `"unavailable"` — màn **tự chối** tính bù client-side ("dựng nguồn sự thật thứ hai cho ngày đáo hạn"), in rõ lý do + nguyên văn lỗi server. Áp dụng cho CẢ hai phía (Receivable §64 / Payable §81 `agingReport`) | 0/5 khoảng có số hiển thị hôm nay ở cả hai phía công nợ | **P1** | Gần-ngủ, nhưng UI **tự thú nhận rõ ràng** — hiếm có trong repo, đáng ghi nhận là điểm mạnh thiết kế |
| K4 | **Dashboard vận hành NCC** — `alumdoor.purchase.supplier_delivery_dashboard` (`payable_overdue`, `supplier_advance`, `overdue_purchase_order_count`, `overdue_days`/dòng) | `SupplierDeliveryPanel` (dòng 988) dùng đủ. Phía Khách hàng/Receivable **không có panel tương đương** — chỉ sổ cái + hoá đơn + phiếu thu + credit note chung | 1 dashboard chuyên trách (NCC) / 0 (KH) | **P2** | Không — bất đối xứng tính năng, không phải field có sẵn bị bỏ qua |

Xác nhận riêng (task yêu cầu): công nợ khách **VÀ** công nợ NCC đều hiển thị (`model.ts:35 partyDoctype: "Customer" | "Supplier"`, hai cấu hình song song dòng 64/81) — **không phải chỉ một phía**.

### Luật đang ngủ (Kế toán)

Xem K1-K3 ở bảng trên. Điểm chung với Sản xuất: **K1 và S4 là cùng một cụm hạ tầng** (`manufacturing-costing-read.ts`/`manufacturing-costing-api.ts`) — engine giá vốn sản xuất chuẩn-vs-thực trả lời trực tiếp câu hỏi "giá vốn tính từ đâu" cho hàng sản xuất, nhưng không nghiệp vụ nào (Sản xuất lẫn Kế toán) gọi tới.

### Cố ý không kết luận

- Xác nhận `BCKQKD.md`, `CNO-NCC.md`, `CHI-TIẾT-CNO-KH.md` **vẫn "chưa đọc"** đúng như KET-QUA §5.5 ghi: `grep -rl "BCKQKD\|CNO-NCC\|CHI-TIẾT-CNO-KH" server --exclude-dir={node_modules,dist,.wrangler}` → **0 file** trong toàn bộ mã nguồn thật. Kết luận cũ vẫn đúng, không đổi.
- Chưa mở trực tiếp `server/packages/query/src/finance-aging.ts` để tự thẩm định logic 5 khoảng đúng hay sai — chỉ dựa lời UI tự khai (`AlumdoorDebtWorkbench.tsx:617-621`) làm bằng chứng gián tiếp. File này không nằm trong danh sách được giao cho phần Kế toán.
- Không đo được tỷ lệ `Customer.credit_limit` có giá trị thật khác 0 hôm nay (không có D1 sống); theo KET-QUA §1, `customer-export.xlsx` — nguồn của field này — bị "moi ruột" chỉ còn 1 dòng dữ liệu tính đến 20/08, nên dù UI có đọc field này, phần lớn khách hàng nhiều khả năng vẫn `null` (— và `null` ở đây ≠ "hạn mức bằng 0", mà là "chưa từng nhập").
- Không mở rộng sang Sales Order controller để xem `credit_limit` có được enforce ở bước bán hàng hay không (ngoài phạm vi Kế toán được giao) — chỉ xác nhận nó không được ĐỌC LẠI ở bất kỳ đâu trong server ngoài chính importer.

---

## CÂU HỎI MỞ CHUNG (Sản xuất + Kế toán)

### Suy được từ dữ liệu, chưa làm
- Nối `get_work_order_cost_evidence` vào 1 tab "Giá vốn/Biến động" trên Work Order Workbench — hạ tầng đã đủ (route sống, 13 field kiểu dữ liệu sẵn), chỉ thiếu lệnh gọi + UI.
- Dựng khối "Vì sao ra con số này" trên Work Order từ `formula_policy` + `width_basis` + `leaf.explanation`/`leaf_formula` đã có sẵn trong snapshot — không cần sửa server, chỉ cần render.
- Hiển thị `Customer.credit_limit` đối chiếu dư nợ hiện tại trên `AlumdoorDebtWorkbench` — field đã có sẵn trên Customer, chỉ thiếu 1 dòng UI.
- Nối tuyến chạy báo cáo tới `finance-aging.ts` — UI đã tự ghi rõ việc cần làm và ở đâu.

### Phải hỏi chủ xưởng
- Sơn thuê ngoài: nên là DocType mới hay mở rộng `Paint Job`? NCC nào ngoài HẢI KỲ? (kế thừa nguyên câu hỏi mở của KET-QUA §7 — không có thêm dữ liệu để tự trả lời).
- Supplier có cần khái niệm `credit_limit` như Customer, hay công nợ NCC vốn quản trị khác (qua dashboard/settlement, không cần hạn mức cứng)?
- BOM Template: chủ trương 100% configurator-sinh (cấm sửa tay), hay cần một màn biên tập thủ công?
- Cột GIÁ VỐN tĩnh trong `DANH-MỤC.md`: dùng vào việc gì nếu `Item` không có field nhận? Có ý định thêm field "giá vốn tham chiếu" trên Item, hay chấp nhận giá vốn chỉ tính động qua stock ledger (cột nguồn chỉ mang tính lịch sử)?

### Dữ liệu tự mâu thuẫn
- Kế thừa KET-QUA §7: Bộ ba lá đáy 180.000đ (bảng giá chính thức) vs 230.000đ (danh mục) — không phát hiện mâu thuẫn dữ liệu mới trong phạm vi Sản xuất/Kế toán lần này.
- Lưu ý (không phải mâu thuẫn dữ liệu thật, mà rủi ro đọc-sai-ngữ-cảnh): `Cutting Policy` có HAI biến `dealer_width_basis`/`retail_width_basis`; `Work Order.width_basis` chỉ giữ MỘT giá trị đã chọn sẵn theo `customer_group` tại thời điểm tính. Ai đọc thẳng Cutting Policy rồi so với Work Order mà không biết nhánh nào đã được chọn sẽ tưởng lệch dữ liệu.

### Câu hỏi giá vốn (nêu ở đầu nhiệm vụ) — đã trả lời được chưa?

**Một phần — rõ hơn hẳn so với 20/08, nhưng chưa dứt điểm.**

"Chưa rõ hệ tính từ đâu" (nguyên văn vòng 2) → **nay rõ**: cơ chế là FIFO/bình quân di động chọn theo công ty, tính động tại từng chứng từ kho, có hẳn máy tính giá vốn sản xuất chuẩn-vs-thực (`ManufacturingCostEvidence`) đã nối route sống — không phải "không biết", mà là "đã thiết kế đầy đủ, có tài liệu, có route, có tài khoản".

Nhưng hai điều vòng 2 không tách ra thì lần này lộ rõ:
1. Cơ chế đó **chưa từng chạy** — 0 dòng `stock_ledger_entries` (20/08) → không có một con số giá vốn thật nào tồn tại trong hệ hôm nay.
2. Câu hỏi phụ mà vòng 2 gộp chung — "cột GIÁ VỐN tĩnh trong `DANH-MỤC.md` dùng vào việc gì" — nay có câu trả lời dứt khoát: **không vào đâu cả**, vì `Item` (31 field) không có field nào nhận nó. Đây không phải "nguồn có, đường ống chưa nối" (mẫu hình lặp lại nhiều lần trong KET-QUA), mà là **"không có chỗ để nối"** — một tầng sâu hơn.
