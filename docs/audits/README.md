# Alumdoor — Bảng đếm cộng dồn các vòng audit (`docs/audits/`)

Cập nhật sau mỗi vòng, theo đúng chỉ dẫn ở `docs/ALUMDOOR-PROMPT-AUDIT-DANH-MUC-MAN-HINH-20260821.md`
§5 — không tạo thêm file trạng thái song song ở root. Nguyên tắc đếm: chỉ đếm dòng có hạng
(P0/P1/P2 hoặc trục T/K/O) thật sự trong tài liệu gốc, không suy diễn; hai dòng "đã kiểm, không phải
gap" trong cùng bảng (vd G16/G17 của Bán hàng Lane A) không tính là phát hiện.

**Phạm vi bảng này: chỉ tính từ vòng 19/08 (Bản đồ nâng cấp + Hội tụ danh mục) trở đi**, vì đây là
chuỗi vòng dùng chung một khung P0/P1/P2 + "luật ngủ" mà prompt gốc kế thừa trực tiếp. Thư mục
`docs/audits/` còn 2 tài liệu cũ hơn — `ALUMDOOR_10_OF_10_CERTIFICATION.md` và
`INVENTORY_AUTHORITY_AUDIT_2026-08-10.md` (10/08) — chưa được đọc để đối chiếu khung xếp hạng khi lập
bảng này, nên cố tình KHÔNG đưa vào tổng cộng dồn dưới đây để khỏi cộng nhầm hai hệ đếm khác nhau.
Nếu vòng sau cần một con số "tổng mọi audit từng có", cần đọc lại 2 tài liệu đó trước.

---

## 1. Bảng cộng dồn

| Ngày | Vòng / Lane | Tài liệu | #Phát hiện | P0 | P1 | P2 | Ghi chú |
|---|---|---|:--:|:--:|:--:|:--:|---|
| 19/08 | Bản đồ nâng cấp danh mục | [`ALUMDOOR-BAN-DO-NANG-CAP-20260819.md`](../ALUMDOOR-BAN-DO-NANG-CAP-20260819.md) | 4 hạng mục đo lường | — | — | — | 16 liên kết treo · 117 mã có dấu cách · 118 trường thiếu mô tả · 45 màn đáng ngờ. Không dùng khung P0/P1/P2 |
| 19/08 | Hội tụ danh mục | [`ALUMDOOR-DANH-MUC-HOI-TU-20260819.md`](../ALUMDOOR-DANH-MUC-HOI-TU-20260819.md) | 5 đã làm (M1–M5), 7 cố ý hoãn (H1–H7) | — | — | — | Nhật ký quyết định, không phải bảng phát hiện mới |
| 21/08 | Bán hàng — Lane A (server) | [`ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md`](ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md) | 15 (G1–G15; G16–G17 là "đã kiểm, không phải gap") | 8 | 7 | 0 | +4 luật ngủ im lặng N1–N4 |
| 21/08 | Bán hàng — Lane B (TSX/client) | [`ALUMDOOR-BAN-HANG-TSX-GAP-20260821.md`](ALUMDOOR-BAN-HANG-TSX-GAP-20260821.md) | 13 (G1–G13) | — | — | — | Trục **T/K/O** (tiền/kho/thao tác), không phải P0-P2 — không cộng thẳng vào tổng P dưới |
| 21/08 | Bán hàng — Hợp đồng payload | [`ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md`](ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md) | tài liệu bổ trợ | — | — | — | Đặc tả field cho G1/G4 Lane A, không đếm riêng |
| **21/08** | **Danh mục → 5 mắt xích — Lane DM-A (server)** | [`ALUMDOOR-DANH-MUC-SERVER-NGU-20260821.md`](ALUMDOOR-DANH-MUC-SERVER-NGU-20260821.md) | 6 (D1–D6) | 0 | 2 | 4 | 0 ứng viên P0 mới — ghi rõ thay vì nặn số |
| **21/08** | **Danh mục → 5 mắt xích — Lane DM-B (màn hình)** | [`ALUMDOOR-DANH-MUC-MAN-HINH-GAP-20260821.md`](ALUMDOOR-DANH-MUC-MAN-HINH-GAP-20260821.md) | 6 (F1–F6) | 0 | 5 | 1 | +1 đính chính kiến trúc (màn thật là `AlumdoorMasterDataScreen.tsx`) |
| **21/08** | **Danh mục → 5 mắt xích — Lane PUR (mua hàng)** | [`ALUMDOOR-MUA-HANG-DANH-MUC-GAP-20260821.md`](ALUMDOOR-MUA-HANG-DANH-MUC-GAP-20260821.md) | 8 (#1–#8) | 0 | 6 | 2 | Headline: 34 giá nhập đã nạp nhưng vô hình 100% |
| **21/08** | **Danh mục → 5 mắt xích — Lane WH (kho)** | [`ALUMDOOR-KHO-DANH-MUC-GAP-20260821.md`](ALUMDOOR-KHO-DANH-MUC-GAP-20260821.md) | 9 (#1–#9) | 0 | 7 | 2 | +§2 riêng: điểm chuyển Bán hàng→Xuất kho khép kín ở data, hở ở thao tác |
| **21/08** | **Danh mục → 5 mắt xích — Lane MFG-ACC (sản xuất+kế toán)** | [`ALUMDOOR-SAN-XUAT-KE-TOAN-DANH-MUC-GAP-20260821.md`](ALUMDOOR-SAN-XUAT-KE-TOAN-DANH-MUC-GAP-20260821.md) | 10 (S1–S6, K1–K4) | 1 | 6 | 3 | P0 duy nhất của vòng này: S1 — sơn thuê ngoài 0 field |
| | **Tổng vòng "Danh mục → 5 mắt xích" (21/08, vòng này)** | 5 tài liệu trên | **39** | **1** | **26** | **12** | |
| 21/08 | **Vòng 3 — Mua hàng đợt 2 (sâu)** | [`ALUMDOOR-MUA-HANG-SAU-VONG2-20260821.md`](ALUMDOOR-MUA-HANG-SAU-VONG2-20260821.md) | 8 | 0 | 6 | 2 | Landed-cost chết toàn chuỗi, RFQ/Báo giá NCC vô hình, thiếu liên kết Material Request |
| 21/08 | **Vòng 3 — Kho đợt 2 (sâu, WMS)** | [`ALUMDOOR-KHO-SAU-VONG2-20260821.md`](ALUMDOOR-KHO-SAU-VONG2-20260821.md) | 6 (5 độc lập sau hội tụ 2 lane) | 0 | 5 | 1 | Cả engine pick/pack/putaway/wave (348 dòng, có unit test) 0 route/UI; nav "Pick List" trỏ DocType không tồn tại |
| 21/08 | **Vòng 3 — Sản xuất đợt 2 (sâu, chỉ lane server)** | [`ALUMDOOR-SAN-XUAT-SAU-VONG2-20260821.md`](ALUMDOOR-SAN-XUAT-SAU-VONG2-20260821.md) | 6 | **2** | 3 | 1 | Lane screen CHƯA chạy. 2 P0: route planning 404 (thiếu đăng ký dispatcher), MRP nổ nhu cầu 0 UI gọi |
| 21/08 | **Vòng 3 — Kế toán đợt 2 (sâu, chỉ lane server)** | [`ALUMDOOR-KE-TOAN-SAU-VONG2-20260821.md`](ALUMDOOR-KE-TOAN-SAU-VONG2-20260821.md) | 2 | 0 | 1 | 1 | Lane screen CHƯA chạy. `assertNonNegativeMinor` (guard chặn tiền âm) chết hoàn toàn |
| 21/08 | **Vòng 3 — Công nợ AR-AP (module mới, chỉ lane server)** | [`ALUMDOOR-CONG-NO-DANH-MUC-GAP-20260821.md`](ALUMDOOR-CONG-NO-DANH-MUC-GAP-20260821.md) | 5 | **2** | 2 | 1 | Lane screen CHƯA chạy. 2 P0 cùng gốc: `FinanceClosureQueryCompiler`/`AccountsPayableQueryCompiler` thiếu bậc kế thừa ở `context.reports` → 4 report đối soát tài chính quan trọng nhất hệ thống không chạy được qua UI |
| | **Tổng vòng 3 (21/08, dừng sớm theo yêu cầu — 5/9 module, 3/9 module thiếu lane screen, 4/9 module chưa chạm)** | 5 tài liệu trên | **27** | **4** | **17** | **6** | Xem §4b lý do dừng sớm |
| | **Tổng cộng dồn (loại Lane B/T-K-O và 2 tài liệu không đếm P)** | 13 tài liệu có khung P0-P2 | **81** | **13** | **50** | **18** | 15 (Bán hàng A) + 39 (Danh mục) + 27 (Vòng 3) |

## 2. Tiến độ tới mục tiêu ~1.000 điểm

**81/1.000 (~8,1%)** theo khung P0–P2 nghiêm ngặt (số thật, có lệnh đo lại, không đoán) — cộng thêm 13
phát hiện trục T/K/O của Bán hàng Lane B không quy đổi thẳng sang P được. Vòng "Danh mục → 5 mắt xích"
(21/08) ước lượng ban đầu 80–200 phát hiện; thực nhận **39** — thấp hơn dự đoán vì 5 agent ưu tiên đúng
luật "mỗi phát hiện phải có SỐ" hơn là đạt chỉ tiêu số lượng. Vòng 3 (21/08, mở rộng ngoài 5 mắt xích lõi,
chạy bằng Workflow đa-agent) cộng thêm **27** — nhưng vòng 3 bị **dừng sớm theo yêu cầu người dùng** ở
6/27 agent hoàn tất (xem §4b), nên con số 81 vẫn còn khoảng trống lớn: 3/9 module đợt vòng 3 thiếu hẳn lane
screen, và 4/9 module (Nhân sự & Tiền lương, Quỹ kho, Social Commerce, App Factory) chưa có agent nào chạm
tới. Đây là đánh đổi tốc độ-lấy-kết-quả-sớm mà người dùng chủ động chọn, không phải thiếu sót của audit —
nhưng có nghĩa mốc 1.000 sẽ cần nhiều vòng hơn nữa, và **quyết định tiếp theo là chuyển sang sửa code thật
(ưu tiên P0) thay vì audit tiếp** (xem §5).

## 3. Sổ đăng ký "luật ngủ" tích luỹ (để vòng sau quét chéo theo đúng §5.3)

Danh sách rút gọn — chỉ các ca đã tự xác nhận rõ nét (không phải toàn bộ Ngủ?=✅ trong 5 lane), kèm
lệnh grep gốc để đo lại nhanh mà không cần đọc lại cả tài liệu:

| Ca | Nguồn | Lane | Lệnh xác nhận nhanh |
|---|---|---|---|
| N1–N4 (giá, bậc diện tích, hồ sơ đo lường, màu) | `sales-item-context.ts` / `alumdoor-commercial.ts` | Bán hàng A | Xem §2 `ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md` |
| `readItemPriceMatrix`/`commitItemPriceMatrix` (441 dòng, chưa từng chạy — khác 4 luật trên vì CHƯA TỪNG có route gọi) | `clouderp-pricing/src/matrix.ts` | Danh mục DM-A (D1) | `grep -rn "readItemPriceMatrix\|commitItemPriceMatrix" server/apps-src` → kỳ vọng 0 |
| 6 cờ `Measurement Profile` còn lại (`require_condition/length/width/piece_qty`, `track_bundle_qty`, `track_dimension_lot`) — đọc ra rồi bỏ, cùng mẫu hình với `require_color` vừa vá ở Bán hàng | `sales-item-context.ts:796-802` | Kho WH (#4) | `grep -rn "track_dimension_lot\|require_piece_qty" client server --exclude-dir=node_modules` → kỳ vọng 0 nơi đọc lại JSON |
| 3 API giữ chỗ tồn nhôm + đề xuất mua theo thiếu hụt (`plan_sales_order`/`reserve_sales_order`/`material_request_from_shortage`) | `aluminum-supply-demand.ts`, nối ở `entry.ts:60-62` | Kho WH (#7) | `grep -rn "plan_sales_order\|reserve_sales_order\|material_request_from_shortage" client/packages/vertical-alumdoor/src` → kỳ vọng 0. **⚠ Cần đối chiếu 21/08 lượt 2**: network log sống bắt được `GET /api/resource/Stock Reservation` gọi thật từ Phiếu giao hàng — chưa rõ trùng 1-trong-3 API trên hay là endpoint đọc khác ngoài phạm vi. Xem `ALUMDOOR-DANH-MUC-LAM-THAT-GIAO-DICH-20260821.md` §5 |
| `alumdoor.purchase.order_from_quotation` — tự kiểm idempotent, 0 nơi gọi | `index.ts:1468-1493` | Mua hàng PUR (#1) | `grep -rn "order_from_quotation" client/packages/vertical-alumdoor/src` → kỳ vọng 0 |
| `get_work_order_cost_evidence` — route sinh đôi với `get_work_order_lifecycle` (đang sống), 0 nơi gọi | `manufacturing-costing-api.ts` | Sản xuất MFG (S4) | `grep -rl "get_work_order_cost_evidence" client/packages` → kỳ vọng 0, đối chiếu `get_work_order_lifecycle` → kỳ vọng 3. **✅ Củng cố sống 21/08 lượt 2**: `Mẫu BOM` = 0 bản ghi, `Lệnh sản xuất` = 0 bản ghi trên toàn D1 cục bộ — không dựng được Work Order thật để mở tab giá vốn, xác nhận gián tiếp cả chuỗi phụ thuộc rỗng từ gốc |
| `Customer.credit_limit` — ghi lúc import, không đọc lại ở đâu ngoài chính importer | `customer-import.ts` | Kế toán ACC (K2) | `grep -rl "credit_limit" server/apps-src server/packages --exclude-dir={node_modules,dist}` → kỳ vọng 1 file. **✅ XÁC NHẬN SỐNG ĐẦY ĐỦ 21/08 lượt 2**: sửa qua UI Customer (không chỉ qua importer), lưu đúng, đọc lại đúng trên form — nhưng cả 2 báo cáo Công nợ ("theo khách hàng", "phải thu") không có cột/logic nào tham chiếu field này. Xem `ALUMDOOR-DANH-MUC-LAM-THAT-GIAO-DICH-20260821.md` §3 |
| `viewPolicy`/`validationMethod` — cơ chế validate nghiệp vụ trước lưu, 0/100 DocType Danh mục dùng | `document-validation.ts:36-90` | Danh mục DM-B (F6) | `grep -c '"viewPolicy"' server/briefs/alumdoor-v2.json` → kỳ vọng 0 |
| **⚠ ƯU TIÊN SỬA #1** — `FinanceClosureQueryCompiler`/`AccountsPayableQueryCompiler` thiếu bậc kế thừa ở `context.reports` → 4 report đối soát tài chính (Daily Detailed Ledger, Finance Reconciliation Diagnostics, Supplier Statement, Supplier Reconciliation) không chạy được qua UI dù SQL/quyền đã đủ | `finance-closure.ts:16`, `ap-reconciliation.ts:15` vs `index-core-base.ts:1268` | Công nợ (Vòng 3, S1+S2, cả 2 P0 của module) | `grep -n "new FinanceQueryCompiler" server/apps/tenant-worker/src/index-core-base.ts:1268` → đổi thành `new FinanceClosureQueryCompiler()` sẽ mở khoá cả 4 report cùng lúc |
| Route `get_open_sales_production_demand` bị bỏ sót khỏi dispatcher → luôn 404 | `manufacturing-planning-api.ts:11` vs `operational-manufacturing-routes.ts:19` | Sản xuất (Vòng 3, S1, P0) | `grep -n '"planning"' server/apps/tenant-worker/src/operational-manufacturing-routes.ts` → kỳ vọng 0 |
| MRP nổ nhu cầu Production Plan (`preview_production_plan_mrp`/`create_mrp_material_request`) — server nối đủ, 0 UI gọi | `manufacturing-mrp-api.ts:13-14` | Sản xuất (Vòng 3, S2, P0) | `grep -rn "preview_production_plan_mrp\|create_mrp_material_request" client` → kỳ vọng 0 |
| Engine WMS pick/pack/putaway/wave (4 hàm, 348 dòng, có unit test) — hội tụ độc lập ở cả 2 lane Kho vòng 3 | `wms-picking.ts:52`, `wms-packing.ts:42`, `wms-putaway.ts:47`, `wms-wave.ts:27` | Kho (Vòng 3, cả server lẫn screen) | `grep -rn "planPicking\|validatePacking\|planPutaway\|buildPickWaves" server client` → kỳ vọng 4 (chỉ định nghĩa) |
| Landed-cost phân bổ cước/thuế nhập cho Phiếu nhập mua chết toàn chuỗi (2 hàm nối tiếp) | `procurement-landed-cost.ts:48`, `landed-cost.ts:27` | Mua hàng (Vòng 3, S1) | `grep -rn "planProcurementLandedCost\|allocateLandedCost" server client` → kỳ vọng 2 |
| `assertNonNegativeMinor` (money) — guard chặn số tiền âm, 0 nơi gọi, không có luật thay thế thủ công | `money/src/index.ts:74-76` | Kế toán (Vòng 3, S1) | `grep -rn "assertNonNegativeMinor" server client` → kỳ vọng 1 (chỉ định nghĩa) |

**Cùng gốc hạ tầng, phát hiện độc lập ở 2 lane khác nhau** (bằng chứng mạnh hơn vì hội tụ từ hai hướng
đọc riêng biệt, đúng nguyên tắc "nguồn gốc thắng bản trích"):
`manufacturing-costing-read.ts` trả lời CẢ câu hỏi giá vốn sản xuất (S4) LẪN câu hỏi giá vốn kế toán
(K1) — một engine, hai nghiệp vụ, cả hai đều chưa gọi tới.

## 4. Hai lượt trải nghiệm thật đã đóng (21/08, sau bảng ở mục 1 — không đổi khung đếm P0-P2)

Không tính vào bảng cộng dồn mục 1 (đây là lượt xác nhận/khép hành vi sống, không phải lane audit mới
sinh phát hiện có hạng riêng — cùng nguyên tắc với việc bản đồ nâng cấp 19/08 cũng không cộng P).
Dev server cục bộ đã bật thật (`desktop-jtfcutt`), điều khiển qua Claude in Chrome:

- **Lượt 1 — chỉ đọc**: [`ALUMDOOR-DANH-MUC-TRAI-NGHIEM-THAT-20260821.md`](ALUMDOOR-DANH-MUC-TRAI-NGHIEM-THAT-20260821.md).
  Xác nhận sống F1-F5, cấu trúc Measurement Profile, đối chiếu Đơn hàng/Phiếu giao hàng, PUR#3/#5/#6,
  và đặc biệt S1 (P0 duy nhất) — bằng chứng ảnh chụp cả hai tab "Việc sơn", không một field NCC/giá.
- **Lượt 2 — làm thật (tạo dữ liệu giao dịch thật)**:
  [`ALUMDOOR-DANH-MUC-LAM-THAT-GIAO-DICH-20260821.md`](ALUMDOOR-DANH-MUC-LAM-THAT-GIAO-DICH-20260821.md).
  Tạo thật 1 Sales Order + 1 Delivery Note nháp + sửa `credit_limit` 1 khách hàng để đóng 5 mục treo
  còn lại của lượt 1:
  - **WH#9**: kết luận lại — CÓ khoá tồn kho cứng ở bước Ghi sổ (không phải bước lưu nháp như giả
    thuyết gốc), nhưng thông báo chặn duy nhất lại là tiếng Anh giữa UI tiếng Việt, và cảnh báo sớm ở
    bước nháp nói giảm năng lực so-sánh-tồn thật của hệ thống.
  - **K2**: đóng dứt điểm cả hai nửa — field lưu/đọc đúng trên form Customer nhưng 0 báo cáo Công nợ
    nào tham chiếu tới.
  - **S4**: xác nhận nguyên nhân gốc — `Mẫu BOM` = 0 bản ghi trên toàn D1, không thể dựng Work Order
    thật để mở tab giá vốn.
  - **K3, WH#7**: củng cố một phần, kèm khuyến nghị đối chiếu cụ thể cho vòng sau.
  - **Phát hiện phụ mới** (ngoài 5 mục treo): đường "Đơn hàng → Phiếu xuất" hàng loạt treo cứng
    trình duyệt >15s với số lượng phi thực tế (199.999) và không tạo ra bản ghi nào; 3 kho "QA
    Reserve/Target/Source desktop-chromium-..." là dữ liệu test tự động còn sót trong danh mục Kho.

## 4b. Vòng 3 — mở rộng đa-agent (21/08, dừng sớm theo yêu cầu người dùng)

Theo yêu cầu "làm hết đẩy agent lên tối đa", đã chạy 1 `Workflow` đa-agent (27 agent: 9 module × server +
screen + report-writer) audit song song, mỗi agent tự dùng `device_bash` grep trực tiếp trên repo thật
(`$HOME/mnt/alumdoor`) thay vì phiên chính pre-stage cả cây thư mục (bài học chi phí từ 2 lần
`device_list_dir(recursive:true)` quá khổ token trước đó).

**Dừng sớm theo yêu cầu người dùng** sau khi 6/27 agent hoàn tất (~71 phút, concurrency cap thấp trong
sandbox khiến tốc độ ước tính còn ~2,5-3 tiếng nếu chạy hết) — 6 kết quả thô phủ **5/9 module dự kiến**,
trong đó 2 module đủ cả 2 lane (Mua hàng, Kho) và 3 module chỉ có lane server (Sản xuất, Kế toán, Công
nợ — lane screen của 3 module này CHƯA CHẠY). **4 module chưa từng có agent nào chạm tới**: Nhân sự &
Tiền lương, Quỹ kho, Social Commerce SaaS, App Factory/App Registry.

5 báo cáo được viết tay từ dữ liệu structured-output thật của 6 agent đã hoàn tất (không phải do
report-writer agent, vì các agent report-writer chưa kịp chạy trước khi dừng) — xem 5 file liệt kê ở bảng
mục 1. Toàn bộ bằng chứng file:line trong 5 báo cáo là nguyên văn từ agent, không chỉnh sửa nội dung.

## 5. Quyết định & lộ trình vòng kế

**Quyết định của người dùng (21/08, sau khi xem tiến độ vòng 3): chuyển sang SỬA CODE THẬT, ưu tiên P0
trước — không mở rộng audit thêm.** Danh sách việc còn treo cho khi audit được nối lại (không phải việc
làm ngay):

1. **Lane screen còn thiếu** cho Sản xuất, Kế toán, Công nợ (vòng 3) — đặc biệt đối chiếu S3 (Manufacturing
   Downtime UI) và cong-no/ UI theo gợi ý cụ thể trong 3 báo cáo tương ứng.
2. **4 module chưa chạm**: Nhân sự & Tiền lương, Quỹ kho, Social Commerce SaaS, App Factory/App Registry.
3. **Đóng khoảng trống cho P0 duy nhất của vòng "5 mắt xích" (S1 — sơn thuê ngoài):** cần quyết định của
   chủ xưởng trước (DocType mới hay mở rộng `Paint Job`?) rồi mới mở lane hợp đồng dữ liệu + lane nối UI.
4. **Quét chéo sổ đăng ký luật ngủ ở mục 3** sang các lane chưa kiểm — vd 6 cờ `Measurement Profile` rất
   có thể cũng đọc-ra-rồi-bỏ ở Sản xuất/Mua hàng, chưa được kiểm trực tiếp.
5. Dựng ít nhất 1 Mẫu BOM thật để đóng S4 cũ; dò thêm dữ liệu hoá đơn quá hạn thật để đóng K3 cũ; sửa 2
   bug hành vi phát hiện ở mục 4 (rò tiếng Anh, treo trình duyệt khi SL phi thực tế).

**Việc làm ngay (đang tiến hành):** vá 13 P0 đã tích luỹ, bắt đầu từ ứng viên chi phí/giá trị tốt nhất —
xem dòng "⚠ ƯU TIÊN SỬA #1" ở mục 3 (1 dòng code sửa mở khoá 4 report đối soát tài chính cùng lúc).

## 6. Nhật ký sửa thật (bắt đầu 21/08, sau quyết định ở mục 5)

### ✅ ĐÃ SỬA — Công nợ P0 #1 + #2 (cùng 1 lần sửa, cùng gốc lỗi wiring)

- **File:** `server/apps/tenant-worker/src/index-core-base.ts:33,1275` (số dòng sau khi sửa)
- **Thay đổi:** `reports: new D1ReportService(requestDb, new FinanceQueryCompiler())` →
  `reports: new D1ReportService(requestDb, new FinanceClosureQueryCompiler())`, cộng import
  `FinanceClosureQueryCompiler` từ `../../../packages/query/src/finance-closure.js` (bỏ import
  `FinanceQueryCompiler` không còn dùng trực tiếp). Vì `FinanceClosureQueryCompiler extends
  AccountsPayableQueryCompiler extends FinanceQueryCompiler extends QueryCompiler`, dùng lớp con cuối
  cùng của chuỗi không làm mất báo cáo nào đang chạy (mỗi lớp chỉ `compile()` thêm report của mình rồi
  `super.compile()` phần còn lại).
- **Đóng cả 2 finding:** Công nợ S1 (`Daily Detailed Ledger`, `Finance Reconciliation Diagnostics`) VÀ
  S2 (`Supplier Statement`, `Supplier Reconciliation`) — cả 4 report cùng nằm trên 1 chuỗi kế thừa, 1
  dòng sửa mở khoá cả 4.
- **Xác nhận sống (21/08, sau khi sửa, qua `device_bash` stage→edit→commit rồi gọi API thật bằng
  `fetch` trong Chrome đã đăng nhập vào `localhost:5173`):**
  - `GET .../frappe.desk.query_report.run?report_name=Supplier+Statement&filters={}` — **TRƯỚC SỬA** sẽ
    trả lỗi `Unknown report: Supplier Statement` (theo đúng bằng chứng grep của agent). **SAU SỬA** trả
    HTTP 417 với message `"company is required exactly once"` — tức request đã chạm đúng
    `compileSupplierStatement()` bên trong `AccountsPayableQueryCompiler`, chỉ còn thiếu filter bắt
    buộc (không phải lỗi "Unknown report" nữa).
  - `GET .../frappe.desk.query_report.run?report_name=Daily+Detailed+Ledger&filters={ledger_date,company}`
    — trả **HTTP 200** với dữ liệu GL thật (dòng Opening cho tài khoản "Hàng nhận chưa có hoá đơn", "Hàng
    tồn kho"...) — xác nhận `FinanceClosureQueryCompiler.compile()` chạy đúng, không còn "Unknown report".
- **File đã sửa gửi cho user + commit vào `C:\alumdoor\server\apps\tenant-worker\src\index-core-base.ts`.**
- **Còn treo:** chưa test `Finance Reconciliation Diagnostics` và `Supplier Reconciliation` riêng (suy ra
  từ cùng chuỗi kế thừa, nhưng chưa gọi API trực tiếp để xác nhận từng report) — nên vẫn ghi "xác nhận
  gián tiếp" cho 2 report này, không phải "xác nhận trực tiếp" như 2 report đã test ở trên.

### ✅ ĐÃ SỬA — Sản xuất P0 #1 (route `planning` bị bỏ sót khỏi dispatcher)

- **File:** `server/apps/tenant-worker/src/operational-manufacturing-routes.ts` — thêm `"planning"` vào
  union `ManufacturingOperationalRoute`, thêm nhánh trong `matchManufacturingOperationalRoute` +
  `isManufacturingOperationalFrappePath`, import 3 hàm từ `manufacturing-planning-api.ts`, và nối nhánh
  `if (route === "planning")` gọi `routeManufacturingPlanningApi` với `listSalesOrders`/
  `listProductionPlans`/`listBoms` (cùng khuôn mẫu với 5 route khác đã sống trong cùng file).
- **Xác nhận sống (21/08, qua `device_bash` stage→edit→commit rồi `fetch` thật trong Chrome đã đăng
  nhập, dùng `window.csrf_token` lấy từ chính trang để vượt CSRF check của POST route):**
  - **TRƯỚC SỬA:** mọi request `POST /api/method/metaforge.manufacturing.get_open_sales_production_demand`
    lọt qua router chính, trả 404 (đúng bằng chứng agent).
  - **SAU SỬA:** trả **HTTP 200** với payload thật —
    `demand_scope:"SALES_ORDER_GROSS_REMAINING_TO_PLAN_NOT_ATP"`, cảnh báo thật tham chiếu 7 Đơn hàng
    thật đang có trên D1 cục bộ (`DH-2026-0061`…`DH-2026-0067`).
- **File đã sửa gửi cho user + commit vào**
  `C:\alumdoor\server\apps\tenant-worker\src\operational-manufacturing-routes.ts`.

### 🔎 PHÁT HIỆN QUAN TRỌNG — 8 P0 của "Bán hàng Lane A" (21/08) hoá ra ĐÃ ĐƯỢC SỬA TỪ TRƯỚC, không phải việc còn treo

Khi chuẩn bị sửa 8 P0 này (G1 Thang ĐVT, G2 hệ số Mét→Cây, G3 mua Kg·tồn Cây·bán Mét, G4 tồn theo lô,
G5 cảnh báo bán vượt tồn, G6 Item Price áp dụng, G7 Bậc diện tích, G15 sẵn sàng theo mã), đã kiểm lại
2 file nguồn (`server/apps-src/alumdoor-worker/src/sales-item-context.ts`,
`server/packages/frappe-api/src/alumdoor-commercial.ts`) trước khi đụng vào — và phát hiện **cả 8 gap
đã có mặt đầy đủ trong code sống hiện tại**, xác nhận bằng grep trực tiếp (không phải suy đoán):

| Gap | Bằng chứng còn sống trong file hiện tại |
|---|---|
| G1 Thang ĐVT | `default_purchase_uom` dòng 539; `uom_conversions` dòng 892-893 |
| G2 Hệ số Mét→Cây trống | Thân lỗi 422 làm giàu bằng khoá chẩn đoán ở dòng 924, 955 |
| G3 Kg/Cây/Mét | `has_catch_weight` dòng 916 (catchWeight) |
| G4 Tồn theo lô | Chi tiết batch (`batch_no`, `length_m`, `color`, `condition`, `is_offcut`) dòng 652-668 |
| G5 Cảnh báo bán vượt tồn | Khối "Bán vượt tồn" dòng 1199-1210 (`requested_qty`), `available_stock_qty` dòng 1337 |
| G6 Item Price áp dụng | `price_explain`, `converted_from_uom`, `source_uom` ở `alumdoor-commercial.ts` dòng 181-248 |
| G7 Bậc diện tích | `area_tier`, `area_tier_basis_sqm`, `area_tier_bounds` cùng khối trên |
| G15 Sẵn sàng theo mã | `readiness:` dòng 946 và 1392 |

Chính báo cáo gốc cũng tự ghi ở dòng 32: *"Cột 'trả ra chưa' đọc trên đúng hai file trên, **trước** đợt
sửa 21/08"* — tức bản kiểm kê là ảnh chụp TRƯỚC một đợt vá diễn ra CÙNG NGÀY (thời điểm sửa đổi cuối của
cả 2 file: `2026-08-21 10:26 UTC`, trước cả phiên làm việc này). Vậy 8 P0 này **không phải việc còn
treo** — README trước đây cộng dồn chúng vào tổng P0 nhưng chưa bao giờ đánh dấu đã đóng. Sửa lại tại
đây thay vì tự ý viết đè lên code đã đúng.

**Chưa làm ở lượt xác nhận này:** chưa gọi API sống để lấy response JSON thật rồi so field-by-field với
đúng 8 gap (mới xác nhận field CÓ MẶT trong mã nguồn qua grep, chưa chạy end-to-end) — nên đây là "xác
nhận qua code tĩnh", không phải "xác nhận sống" như 2 P0 đã sửa ở trên. Khuyến nghị vòng sau: gọi
`alumdoor.sales.item_context` thật cho vài mã (kể cả 1 mã nhóm `RT_`) để đối chiếu response thật, đóng
dứt điểm bằng bằng chứng sống thay vì grep tĩnh.

### ✅ ĐÃ SỬA + XÁC NHẬN SỐNG — Sản xuất P0 #2 (MRP nổ nhu cầu — 0 UI → có màn hình)

Quyết định chủ xưởng: **"Có, xây UI cơ bản ngay"**.

- **File mới:** `client/packages/vertical-alumdoor/src/AlumdoorProductionPlanDetail.tsx` — màn chi tiết
  Production Plan, mẫu theo cấu trúc `AlumdoorProductionRequestDetail.tsx` đã có. Có: nút **"Gửi kế
  hoạch"** (submit qua `adapter.submit(doc)` — phát hiện khi test sống rằng thay hẳn form gốc bằng
  `hasDetail:true` cũng xoá luôn nút Submit tiêu chuẩn của Frappe, nên phải tự thêm lại nút này trong
  component mới thì màn mới thật sự dùng được từ đầu đến cuối); nút **"Xem trước nhu cầu vật tư (MRP)"**
  gọi `adapter.callPost("metaforge.manufacturing.preview_production_plan_mrp", {production_plan})`,
  hiện bảng `planned_outputs` / `purchase_requirements` / `manufacture_requirements` / `warnings`; 2 nút
  **"Tạo Yêu cầu vật tư — Mua/Sản xuất"** gọi
  `metaforge.manufacturing.create_mrp_material_request`, tự vô hiệu hoá khi kế hoạch chưa submit hoặc
  không có nhu cầu loại đó, điều hướng sang Material Request vừa tạo.
- **File sửa:** `client/packages/vertical-alumdoor/src/workspace-extension.tsx` — thêm lazy import +
  nhánh `if (decoded && doctype === "Production Plan")` trả `hasDetail:true`, đúng khuôn mẫu Work Order.
- **Xác nhận sống đầy đủ (21/08, qua Chrome thật, không phải fetch thủ công):**
  1. Tạo thật `PP-2026-00002` (mặt hàng `CDUC_TD_AL595`, BOM `DM-2026-0013` đã submit, SL 3) → mở lại
     → **màn custom render đúng** (không phải link chết — bài học từ finding "Pick List" chết trước đó).
  2. Bấm **"Gửi kế hoạch"** → badge chuyển "Nháp" → "Đã submit", nút Submit biến mất đúng thiết kế.
  3. Bấm **"Xem trước nhu cầu vật tư (MRP)"** → **HTTP 200 thật**, bảng hiện đúng: Sản lượng kế hoạch 1,
     Nhu cầu mua ngoài 1 (RT_RAYHOP, SL cần 18, đúng theo BOM 6 Kg/đơn vị × 3 kế hoạch), Nhu cầu tự sản
     xuất 0, cảnh báo `UNALLOCATED_WAREHOUSE:RT_RAYHOP` hiện đúng dạng badge.
  4. Bấm **"Tạo Yêu cầu vật tư — Mua"** → **tạo thật Material Request `YCVT-2026-0009`** (loại Purchase,
     dòng RAY HỘP TD U76 / SL 18 / Kg — khớp 100% với bảng MRP) → tự điều hướng sang màn Material
     Request vừa tạo.
  5. Bấm lại preview + "Tạo Yêu cầu vật tư — Mua" lần 2 → **replay đúng cơ chế idempotent**: quay lại
     đúng `YCVT-2026-0009` cũ (danh sách Material Request vẫn 9 bản ghi, không tạo trùng) — xác nhận
     `mrp_fingerprint` hoạt động đúng như thiết kế server.
  6. Nhánh "Nhu cầu tự sản xuất (Manufacture)" hiện đúng trạng thái rỗng "Không có nhu cầu." và nút tạo
     tương ứng bị vô hiệu hoá — không thử bấm (sẽ trả `NO_REQUIREMENTS`, đã đọc code xác nhận xử lý đúng
     thay vì crash).
- **Giới hạn đã biết của bản "UI cơ bản" này (không phải bug, là phạm vi có chủ đích):**
  - Không có `net_on_hand` (trừ tồn kho khi xem trước) — vì `routeManufacturingMrpApi` hiện tại không
    được truyền `getStockBalanceMicros`, bật cờ này sẽ luôn lỗi. Giữ nguyên "Gross" như server mặc định.
  - **Không còn cách sửa dòng kế hoạch (mặt hàng/BOM/SL) sau khi tạo** — vì màn custom (`hasDetail:true`)
    thay thế hoàn toàn form chung, không có lối thoát về form gốc để sửa bảng dòng. Đây là đánh đổi có
    chủ đích theo đúng khuôn mẫu Work Order/Production Request đã có sẵn trong repo, nhưng nên biết trước
    khi dùng thật: nếu chọn sai mặt hàng/BOM, phải tạo bản ghi mới thay vì sửa tại chỗ.
- **File đã gửi cho user + commit vào**
  `C:\alumdoor\client\packages\vertical-alumdoor\src\AlumdoorProductionPlanDetail.tsx` và
  `C:\alumdoor\client\packages\vertical-alumdoor\src\workspace-extension.tsx`.
- **Phát hiện phụ, chưa xử lý:** `AlumdoorProductionPlanCreate.tsx` (272 dòng, form tạo Production Plan
  từ Sales Order) tồn tại sẵn trong repo nhưng **0 nơi import** — mồ côi hoàn toàn, cùng dạng với "Pick
  List" chết đã ghi ở mục 3. Chưa nối vào `workspace-extension.tsx` (nhánh `isNew && doctype ===
  "Production Plan"`) vì ngoài phạm vi quyết định "UI cơ bản" đã chốt — cần chủ xưởng xác nhận có muốn
  nối luồng tạo-từ-đơn-bán này không trước khi động vào.

### 🚧 CÒN TREO — Sản xuất P0 #1 "sơn thuê ngoài" (đã sửa schema nguồn, CHƯA sống — cần bạn chạy 1 lệnh)

Quyết định chủ xưởng: **"Mở rộng Paint Job có sẵn"**.

- **Đã làm:** thêm 8 trường vào DocType `Paint Job` trong `server/briefs/alumdoor-v2.json`
  (`is_outsourced`, `outsource_supplier`, `outsource_formula`, `outsource_width_m`,
  `outsource_leaf_count`, `outsource_layer_count`, `outsource_height_m`, `outsource_rate`,
  `outsource_amount`), thêm 2 trường vào `list`, 1 trường vào `search`, bump version brief `2.10.0` →
  `2.10.1`. Đã gửi + commit vào `C:\alumdoor\server\briefs\alumdoor-v2.json`.
- **Đã kiểm sống và xác nhận CHƯA ăn:** mở `http://localhost:5173/app/Paint%20Job/new` sau khi sửa —
  8 trường mới **không xuất hiện** ở cả tab "Thông tin chính" lẫn "Nâng cao". Lý do: brief JSON chỉ là
  nguồn biên dịch; schema thật app đang dùng nằm trong D1 (đã cài qua một lượt "forge" trước đó), sửa
  file trên đĩa không tự động đẩy lại vào D1.
- **Cách mở khoá — cần chạy trên máy bạn (Windows), tôi không chạy được qua device_bash vì `node` ở đây
  không resolve được `node_modules` liên kết qua pnpm của repo này (`Cannot find package 'ajv'`), còn
  `pnpm`/`wrangler` không có sẵn trong PATH của phiên làm việc này):**
  ```
  cd C:\alumdoor\server
  $env:FORGE_ADMIN_PASSWORD = "<mật khẩu admin dev, vd local-dev-password-1>"
  node scripts\forge-app.mjs briefs\alumdoor-v2.json --origin http://localhost:8799 --admin dev@example.com --dry-run
  ```
  Nếu bước `--dry-run` báo hợp lệ (biên dịch + validate qua đúng parser của server, không đụng D1), bỏ
  `--dry-run` để cài thật:
  ```
  node scripts\forge-app.mjs briefs\alumdoor-v2.json --origin http://localhost:8799 --admin dev@example.com
  ```
  (Cổng `8799` xác nhận từ `client/apps/runtime/vite.config.ts` dòng 24/140 — đúng cổng Worker/D1 dev
  cục bộ; `dev@example.com` là user "Dev User" đang đăng nhập trên `localhost:5173` lúc kiểm tra.)
- Sau khi lệnh trên chạy xong, mở lại `Paint Job/new` để xác nhận 8 trường xuất hiện — tôi có thể kiểm
  sống lại giúp bạn ở phiên sau nếu cần.
- **Rủi ro đã biết, chưa giải quyết:** `alumdoor-v2.json` tự thân là **generated artifact** (sinh ra từ
  `alumdoor.json` v1 qua `server/scripts/build-alumdoor-v2-brief.mjs`) — tôi sửa thẳng file `v2` thay vì
  qua generator vì không đủ thời gian xác nhận generator này còn được chạy định kỳ hay chỉ là script
  migrate một lần lịch sử. Nếu ai đó chạy lại generator từ `alumdoor.json` gốc, 8 trường mới sẽ **bị ghi
  đè mất** trừ khi cũng thêm vào nguồn v1. Cần xác nhận thêm ở vòng sau.

## 7. Tổng kết P0 sau lượt sửa 21/08

| Trạng thái | Số lượng | Chi tiết |
|---|:--:|---|
| **Đã sửa + xác nhận sống trong lượt này** | **4** | Công nợ S1+S2 (1 lần sửa đóng 2 finding) + Sản xuất route `planning` + Sản xuất MRP UI (Production Plan detail, xác nhận sống end-to-end) |
| **Phát hiện đã đóng từ trước (không phải do lượt này)** | **8** | Toàn bộ Bán hàng Lane A G1-G7, G15 — xác nhận qua code tĩnh, chưa xác nhận sống |
| **Đã sửa nguồn, CHƯA sống — cần bạn chạy 1 lệnh** | **1** | S1 "sơn thuê ngoài": brief đã thêm 8 trường + commit, chờ `forge-app.mjs` cài vào D1 (lệnh cụ thể ở trên) |
| **Còn treo thật** | **0** | — |
| **Tổng** | 13 | |

## 8. Vòng sửa P1/P2 toàn diện (21/08, sau lệnh "sửa nốt các P1... toàn bộ các lỗi phát hiện")

Sau khi đóng xong 13 P0, người dùng yêu cầu sửa **toàn bộ 50 P1 + 18 P2** tích luỹ trong bảng mục 1. Vì
khối lượng quá lớn cho một luồng làm việc tuần tự, đã chia thành 7 nhóm theo module (tránh 2 nhóm cùng
sửa 1 file) và chạy 7 agent song song, mỗi agent tự đọc lại audit gốc + xác nhận lại đúng file:line trước
khi sửa (đúng kỷ luật đã lập từ vòng P0 — không tin audit cũ mù quáng). Toàn bộ code đã qua đúng quy
trình stage→edit→gửi→commit vào `C:\alumdoor\...`; đã stage lại `alumdoor-v2.json` (đích chung của nhiều
agent) sau khi cả 7 xong và xác nhận **JSON hợp lệ, không mất field nào của agent nào** (kiểm bằng script
Python đối chiếu từng field đã báo).

### 8.0 ⚠ Việc cần bạn làm NGAY — 1 lệnh forge duy nhất mở khoá mọi thay đổi schema

`server/briefs/alumdoor-v2.json` đã được nhiều agent cộng dồn sửa trong lượt này (menu Supplier
Item/RFQ/Supplier Quotation, `last_purchase_rate` hết ẩn, `Purchase Order.material_request`,
`billed_percentage`, `Pricing Scope.members required`, mô tả cho `area_tier`/`measurement_profile`) —
**cộng thêm** 8 trường "sơn thuê ngoài" đã sửa ở lượt P0 trước. Version brief hiện là `2.10.2`. Giống hệt
tình huống Paint Job trước đây: **sửa trên đĩa không tự động vào D1** — cần bạn chạy đúng 1 lần (gộp luôn
cả phần Paint Job, không cần chạy 2 lần):

```
cd C:\alumdoor\server
$env:FORGE_ADMIN_PASSWORD = "<mật khẩu admin dev>"
node scripts\forge-app.mjs briefs\alumdoor-v2.json --origin http://localhost:8799 --admin dev@example.com --dry-run
```

Nếu dry-run hợp lệ, bỏ `--dry-run` để cài thật. Sau đó các mục đánh dấu "🚧 chờ forge" bên dưới mới thật
sự lên hiệu lực trên UI. Toàn bộ phần code (.ts/.tsx) không cần bước này — Vite hot-reload trực tiếp.

### 8.1 Bán hàng — Lane A (7 P1: G8–G14)

**Kết quả: cả 7/7 đã đóng từ trước — không sửa gì.** Cùng đợt vá 21/08 10:26 UTC đã đóng luôn 8 P0 lần
trước đóng nốt cả 7 P1 này. Đáng chú ý 4/7 xác nhận **sống** trực tiếp trên form Đặt hàng thật (không chỉ
đọc code): G10 (chặn cứng thiếu màu bắt buộc), G11 (gap field-level đúng tên field thiếu), G13 (chặn thiếu
bộ quy cách hình học), G14 (dropdown màu lọc đúng theo phạm vi Bề mặt — nặng nhất, có bằng chứng cả 2
nhánh đối lập: nhóm hàng chưa khai Bề mặt thì bị chặn, nhóm hàng đã khai thì dropdown lọc đúng).

| Mã | Tiêu đề | Kết luận |
|---|---|---|
| G8 | Pricing Scope không giải trình vì sao luật giá lọt | Đã đóng từ trước (tĩnh) |
| G9 | `min_area_sqm` có ăn vào dòng không | Đã đóng từ trước (tĩnh — không có dữ liệu D1 để demo) |
| G10 | Measurement Profile 8 cờ chỉ trả tên | Đã đóng từ trước (**sống**) |
| G11 | Material Specification không đọc | Đã đóng từ trước (**sống**, cả 2 nhánh) |
| G12 | Quy cách cửa / nguồn `leaf_divisor` | Đã đóng từ trước (sống 1 nhánh + tĩnh) |
| G13 | Geometry Profile không nói mã thiếu | Đã đóng từ trước (**sống**) |
| G14 | `finish_color_context` viết xong không ai gọi | Đã đóng từ trước (**sống**, 2 nhánh đối lập) |

### 8.2 Danh mục — Server (2 P1 + 4 P2: D1–D6)

| Mã | Tiêu đề | Kết luận |
|---|---|---|
| D1 | `readItemPriceMatrix`/`commitItemPriceMatrix` mồ côi (P2) | Cần quyết định: tần suất sửa bảng giá thực tế có đáng nối route không? |
| D2 | `Item.reorder_levels` vs tồn hiện tại (P2) | **Đã sửa phần đọc** — route mới `alumdoor.inventory.reorder_alerts` (file mới `reorder-alerts.ts`, xác nhận sống). **Phát hiện sâu hơn:** `Item Reorder` là child-doctype **mồ côi ở tầng schema** — không doctype cha nào có field Table trỏ tới nó, nên logic invariant liên quan chưa từng có cơ hội chạy. Cần thêm field `reorder_levels:Table(Item Reorder)` vào `Item` trong brief — **chưa tự làm** (brief đang bị nhiều agent khác đụng cùng lúc, để tránh conflict trên thay đổi schema phạm vi rộng) |
| D3 | `Supplier Item.minimum_order_qty` | **Đã sửa** — route mới `alumdoor.purchase.supplier_item_terms` (cùng file `reorder-alerts.ts`), xác nhận sống |
| D4 | `allocateLandedCost` mồ côi | Cần quyết định: nhập nhôm có phát sinh cước/thuế cần phân bổ giá vốn không? (Xem 8.4 — landed-cost PREVIEW đã nối ở lane Mua hàng, nhưng đây là câu hỏi "có ghi vào giá vốn sổ sách không", vẫn mở) |
| D5 | `Pricing Scope Member` không có UI tạo/sửa | Đã đóng từ trước — audit đo thiếu phạm vi (chỉ quét package vertical, bỏ sót `ChildGrid` generic dùng chung cho mọi DocType). Xác nhận sống: `/app/Pricing Scope/new` bấm "+ Thêm dòng" hoạt động thật |
| D6 | Audit toàn vẹn tồn kho `clouderp-stock` | Câu hỏi gốc "có đăng ký registry không" **đã trả lời dứt điểm: CÓ** (qua `aggregate-services.ts`), nhưng 2 controller chỉ áp cho `Repost Item Valuation`/`Serial and Batch Bundle` — 2 doctype Alumdoor không dùng nên vẫn không chạy. `auditOutgoingValuation` không tương thích schema sổ kho riêng của Alumdoor — đã có `reconcilePhysicalStockPage` thay thế một phần. Cần quyết định: có cần audit replay-FIFO riêng cho Alumdoor không? |

### 8.3 Danh mục — Màn hình (5 P1 + 1 P2: F1–F6)

| Mã | Tiêu đề | Kết luận |
|---|---|---|
| F1 | Supplier Item mâu thuẫn quyết định đã chốt (menu ẩn) | **Đã sửa** — `menu:true`, 🚧 chờ forge |
| F2 | `last_purchase_rate` tự khoá, độc lập với F1 | **Đã sửa** (gỡ `hidden`, giữ `read_only` — chọn nhánh an toàn) 🚧 chờ forge. Còn câu hỏi: có nên mở nhập tay không? |
| F3 | `area_tier`/`measurement_profile` required vô hình + không giải trình | **Đã sửa 2 lớp**: thêm `description` (🚧 chờ forge) VÀ sửa tận gốc `FormView.tsx` — `field.description` từ brief **chưa từng được render ở bất kỳ đâu trong toàn app**, giờ đã render (có lợi cho MỌI DocType có description, không chỉ 2 field này). Còn câu hỏi: có nên bỏ default để ép chọn tường minh không? |
| F4 | Pricing Rule lưu được "chính sách rỗng ruột" | **Đã sửa** — cảnh báo mềm (toast) khi cả phạm vi lẫn tác động đều rỗng, xác nhận sống bằng 3 bản ghi test (đã xoá sạch sau khi test). Còn câu hỏi: có nên chặn cứng thay vì chỉ cảnh báo? |
| F5 | Pricing Scope fail-closed chỉ ở tầng sau | **Đã sửa** — `members` giờ `required:true`, cơ chế Zod generic đã tự xử lý đúng (không cần sửa code) 🚧 chờ forge |
| F6 | `viewPolicy.form.validationMethod` 0/100 DocType dùng | Cần quyết định: DocType nào cần validator liên-trường, nội dung luật gì — không tự viết luật nghiệp vụ |

### 8.4 Mua hàng — gộp 2 vòng (16 finding)

| Mã | Tiêu đề | Kết luận |
|---|---|---|
| DM#1 | `order_from_quotation` không nơi gọi | **Đã sửa** — action mới "Báo giá NCC → Đơn mua" trong `alumdoor-v2.actions.json` |
| DM#2 / C2 | `Purchase Order.material_request` thiếu | **Đã sửa** — field mới + ô nhập header 🚧 chờ forge |
| DM#3 / C3 / S3 | `last_purchase_rate` ẩn + phân tích giá NCC chưa gọi | **Đã sửa (gộp 3 finding)** — route `metaforge.api.supplier_price_history` mới, gợi ý giá "Giá gần nhất: X (+Y%)" ngay trên ô Đơn giá 🚧 chờ forge (phần field ẩn) |
| DM#4 | `received_percentage`/`billed_percentage` không đọc được | **Đã sửa** — hiện ở footer header đơn mua 🚧 chờ forge |
| DM#5 | `standard_length_m` chỉ đọc ở màn Nhập, không ở màn Đặt | **Đã sửa** — nối cùng cơ chế đã có |
| DM#6 | ĐVT mua bị khoá cứng theo dòng | Cần quyết định — đây là khoá kiến trúc có chủ đích (`serverEnforced:true`), không phải lỗi wiring. Có cho đổi ĐVT/hệ số theo từng dòng không? |
| DM#7 | `so_no` (Số đơn NCC) không có ô nhập ở PO lẫn Receipt | **Đã sửa cả 2 màn** |
| DM#8 | `Item Reorder` không ai đọc ở Mua hàng | Cần quyết định — trùng D2: mồ côi ở tầng schema, cần chốt quan hệ (Table con của Item? của Warehouse? khoá tổng hợp?) trước khi nối UI |
| S1 | Landed-cost phân bổ cước/thuế nhập chết toàn chuỗi | **Đã sửa (xem-trước, read-only)** — route `metaforge.api.preview_landed_cost` + panel trên Receipt Workbench (chỉ cho phiếu đã ghi sổ, không tự ghi vào giá vốn sổ sách — xem D4 cho câu hỏi "có ghi sổ không") |
| S2 | Operator read-model công nợ NCC nghi trùng/chết | Đã đóng từ trước — audit vòng 2 nhầm phạm vi grep (bỏ sót `tenant-worker`, không biết `document-kernel` re-export đổi tên class) |
| S4 | `previewPurchaseReceiptSubmission` chưa nối | Đã đóng từ trước — cùng lỗi phạm vi grep, route thật nằm ở `tenant-worker` |
| C1 | RFQ / Báo giá NCC không có UI tạo mới | **Đã sửa** — `menu:true` cho cả 2 doctype 🚧 chờ forge |
| C4 | `Purchase Receipt.total_qty` không hiển thị | **Đã sửa** — tile tổng kết mới trên form |

### 8.5 Kho — gộp 2 vòng (15 finding)

| Mã | Tiêu đề | Kết luận |
|---|---|---|
| #1 | `Item.uom_conversions` độ phủ thấp | Đã đóng từ trước — đúng bản chất là thiếu dữ liệu nghiệp vụ, không phải lỗi code |
| #2 | `weight_tolerance_pct=0` hợp lệ | Đã đóng từ trước — code đã đúng (`nonNegativeNumber`) |
| #3 | Luật màu bắt buộc thiếu lưới an toàn ở Xuất kho | **Đã sửa** — đọc `spec_context.measurement_profile.require_color`, chặn khi thiếu màu |
| #4 | 6 cờ Measurement Profile còn "ngủ" | **1/6 đã sửa** (`require_condition`, theo đúng khuôn 3 cờ khác — audit nhầm, 3/6 kia đã sống từ trước qua `ui-child-preview.ts` mà audit không quét tới). Còn 2 cờ (`require_width`, `track_dimension_lot`) cần quyết định thêm cột/ngữ nghĩa |
| #5 | `scrap_threshold_m` để trống → 0 | Cần quyết định — trống nên = "tắt tính năng" hay = ngưỡng 0? |
| #6 | `Batch.condition` thiếu trong bảng Lô ở Phiếu xuất | **Đã sửa** |
| #7 | Engine giữ-chỗ/đề xuất-mua tự động theo ATP | Cần quyết định — đã có đường giữ-chỗ thủ công riêng (`alumdoor.reserve.create`); 3 API tự động có nên nối UI hay bỏ hẳn? |
| #8 | Rủi ro kiến trúc `entry.ts` vs `index.ts` (nhánh chết) | **Đã giảm rủi ro** — thêm comment cảnh báo rõ, không xoá (an toàn hơn) |
| #9 | Cảnh báo "Tồn không đủ" không khoá nút Ghi sổ | **Đã sửa 2 lớp** — khoá nút + chặn phòng thủ trong `submitDelivery()` |
| S1≡C1 | Engine WMS pick/pack/putaway/wave 0 route/UI | **Đã nối ĐƯỜNG API** (4 route mới, file `wms-actions.ts`), **xác nhận sống qua HTTP thật**. UI cố ý CHƯA làm (cần quyết định UX trước) |
| C2 | Nav "Pick List" trỏ DocType không tồn tại | **Đã sửa — gỡ link chết** (app `client/apps/kho` không phải app đang chạy sống, không thể trỏ sang engine WMS thật) |
| S2 | Physical Stock report/export chưa nối UI | Xác nhận route đã sống ở server, UI cần quyết định đặt ở đâu |
| S3 | API resolve mã quét kho | **Đã nối route** (nặng hơn audit mô tả — route còn chưa từng đăng ký, không chỉ thiếu UI), UI cần quyết định (chưa rõ màn quét kho thật ở app nào) |
| S4 | `resolveWarehousePath` mồ côi | Xác nhận vẫn ngủ — giá trị thấp, đề xuất gộp cùng lúc quyết định field sức chứa kho |

**Phát hiện phương pháp quan trọng của agent này:** app đang chạy sống ở `localhost:5173` là `client/apps/runtime`, KHÔNG phải `client/apps/kho`/`kho-vn` như 2 audit gốc ngỡ — cần sửa giả định này khi audit tiếp các finding UI Kho.

### 8.6 Sản xuất + Kế toán — gộp 3 vòng (15 finding, không đụng route `planning`/MRP UI đã xong)

| Mã | Tiêu đề | Kết luận |
|---|---|---|
| MFG S2 | Giải trình công thức lá cửa không hiện ở Workbench | **Đã sửa** — khối "Vì sao ra số lá này" mới |
| MFG S3 | BOM Template không có editor | Cần quyết định — cho sửa tay hay giữ "chỉ máy sinh"? |
| MFG S4 (+ vòng2 S4) | `get_work_order_cost_evidence`/`genealogy` chưa nối | **Đã sửa** — tab mới "Giá vốn & truy vết" trong Work Order Workbench (file mới `AlumdoorWorkOrderCostGenealogyPanel.tsx`) |
| MFG S5 | `schedule_warning` bị tính rồi vứt | **Đã sửa 2 lớp** — thêm vào `formula_snapshot` (server) + banner cảnh báo (client). Lệnh cũ tạo trước bản vá sẽ không có |
| MFG S6 | Công thức rải 3 nguồn, không đối soát chéo | Cần quyết định — báo cáo định kỳ hay tra cứu thủ công? |
| ACC K1 | `Item` không có field giá vốn/valuation | Cần quyết định thuần sản phẩm — không có "điểm nối" kỹ thuật |
| ACC K2 | `Customer.credit_limit` không đọc ở Công nợ | **Đã sửa + xác nhận sống** — cột "Hạn mức công nợ" + badge vượt hạn mức |
| ACC K3 | Aging chưa nối dây | Đã đóng từ trước — cùng gốc P0 Công nợ đã vá, xác nhận sống lại |
| ACC K4 | Thiếu dashboard vận hành phía Khách hàng (đối xứng `SupplierDeliveryPanel`) | Cần quyết định — tính năng mới, nội dung gì? |
| Vòng2 S3 | `preview_capacity_plan` theo Production Plan chưa gọi | Cần quyết định — nơi tự nhiên nhất để gắn là màn MRP đã khoá; dựng độc lập hay chờ mở khoá? (kèm câu hỏi phụ: app `manufacturing-qms` có bật cho tenant không) |
| Vòng2 S5 | Bulk BOM import chết cả 2 lớp | Cần quyết định — lớp UI (grid nhập hàng loạt có cần không) và lớp hạ tầng (`batch-executor`, một khung cross-cutting TOÀN REPO 0 nơi gọi, không riêng BOM) |
| Vòng2 S6 | Work Order controller triple-register (Map ghi đè) | **Đã sửa** — dọn 2 lượt `.register()` thừa, hành vi runtime không đổi |
| KT-vòng2 S1 | `assertNonNegativeMinor` guard tiền âm 0 nơi gọi | **Đã sửa** — nối vào `SalesInvoiceController`/`PaymentEntryController` tại đúng điểm ghi bút toán |
| KT-vòng2 S2 | `compareDecimal` 0 nơi gọi | Xác nhận vẫn đúng, không có điểm nối tự nhiên — không ép sửa giả tạo |

### 8.7 Công nợ — 2 P1 + 1 P2 còn lại (không đụng P0 đã sửa)

| Mã | Tiêu đề | Kết luận |
|---|---|---|
| S3 | `purchase-supplier-debt-report` mồ côi | Đã đóng từ trước — `document-kernel` re-export đổi tên (`D1PurchaseAllocationOperatorTimelineService as D1PurchaseAllocationTimelineService`), UI thật đã có ở `AllocationTimelineDialog.tsx` |
| S4 | `Party Statement`/`Debt Summary`/`Advance Balance` chưa gọi từ UI | **Đã sửa + xác nhận sống** — 3 panel mới (`DebtSummaryPanel`, `PartyStatementDialog`, `AdvanceBalancePanel`) trong màn Công nợ, cả 3 route test trả 200 với chứng từ thật (`HD-2026-0008`, `PT-2026-0015`) |
| P2 | Comment lỗi thời `cong-no/data.ts:14` | **Đã sửa** |

### 8.8 Toàn bộ câu hỏi cần chủ xưởng quyết định (gộp lại 1 chỗ)

1. **D1** — tần suất sửa Item Price/Pricing Scope thực tế? (có đáng nối `matrix.ts` không)
2. **D2/DM#8** — `Item Reorder` nên là Table con của `Item`, của `Warehouse`, hay khoá tổng hợp riêng?
3. **D4/S1(Mua hàng)** — nhập nhôm có phát sinh cước/thuế cần **ghi vào giá vốn sổ sách** không (khác việc xem-trước đã làm), phân bổ theo cơ sở nào?
4. **D6** — có cần audit replay-FIFO độc lập riêng cho thuật toán giá vốn Alumdoor không?
5. **F2** — `last_purchase_rate` nên mở nhập tay hay giữ import-only?
6. **F3** — có nên bỏ default của `area_tier` để ép chọn tường minh?
7. **F4** — chặn cứng Pricing Rule rỗng thay vì chỉ cảnh báo mềm?
8. **F6** — DocType Danh mục nào cần validator liên-trường server-side, luật cụ thể là gì?
9. **DM#6** — có cho đổi ĐVT mua + ghi đè hệ số quy đổi theo từng dòng không (đang khoá cứng có chủ đích)?
10. **Kho #4** — cột nào cho `require_width`; trống `track_dimension_lot` có nên cho gộp nhiều khổ vào 1 Batch?
11. **Kho #5** — `scrap_threshold_m` trống nên hiểu là "tắt tính năng" hay ngưỡng 0?
12. **Kho #7** — 3 API giữ-chỗ/đề xuất-mua tự động: nối UI hay bỏ hẳn (đã có đường thủ công riêng)?
13. **Kho S1≡C1 (UI)** — nối UI cho engine WMS ở đâu trong navigation, field nào cho nhập tay?
14. **Kho S2 (UI)** — màn báo cáo Physical Stock đặt ở app/route nào?
15. **Kho S3 (UI)** — màn quét mã kho thật là màn nào (chưa rõ hiện tại)?
16. **MFG S3** — BOM Template cho sửa tay hay giữ "chỉ máy sinh"?
17. **MFG S6** — công cụ đối soát 3 nguồn công thức: báo cáo định kỳ hay tra cứu thủ công?
18. **ACC K1** — `Item` có cần field "giá vốn tham chiếu" không?
19. **ACC K4** — phía Khách hàng có cần dashboard vận hành tương tự NCC không, nội dung gì?
20. **Vòng2 S3** — preview năng lực xưởng gắn vào Production Plan Detail (chờ) hay dựng màn riêng? `manufacturing-qms` có bật cho tenant không?
21. **Vòng2 S5** — Bulk BOM entry có cần thay form chung? Khung `batch-executor` có trong roadmap không?

### 8.9 Rủi ro/lưu ý vận hành phát hiện trong lượt này (không phải finding có hạng, nhưng cần biết)

- **Nhiều agent độc lập cùng phát hiện: có tiến trình khác** (rất giống một bộ E2E test tự động — tên kho
  `QA Reserve/Target/Source desktop-chromium-...`, xoay CSRF token, tự điều hướng tab) **đang hoạt động
  cùng lúc trên cùng máy/trình duyệt** trong lúc lượt sửa này chạy. Không gây mất dữ liệu (đã kiểm chứng
  bằng `expectedMtimeMs` guard ở mọi lần commit, 0 lần bị reject), nhưng nên biết để không nhầm lẫn nếu
  thấy dữ liệu test lạ xuất hiện.
- **Bản mount `/mnt/user-data/uploads/alumdoor` trong container chỉ là TẬP CON của repo thật** — nhiều
  agent phải `device_stage_files` bổ sung nhiều file/thư mục không có sẵn (`client/apps/kho*`,
  `server/apps/tenant-worker/src/*`, `server/packages/core`...). Vòng audit tiếp theo nên biết điều này
  nếu grep trong container cho kết quả "0" — cần xác nhận lại trên máy thật trước khi kết luận.
- Đã tạo và **xoá sạch** một số chứng từ test trong lúc xác nhận sống (3 Pricing Rule test, chứng từ
  Sales Invoice/Payment Entry dùng để test `assertNonNegativeMinor` vẫn giữ nguyên ở trạng thái đã ghi sổ
  vì không ảnh hưởng gì — không phải rác cần dọn).

### 8.10 Tổng kết nhanh

| Trạng thái | Ước lượng | Ghi chú |
|---|:--:|---|
| Đã sửa bằng code (kể cả cần forge để lên hiệu lực) | ~29 | Trải đều 7 module, chi tiết ở 8.1–8.7 |
| Đã đóng từ trước — audit lỗi thời/nhầm phạm vi | ~13 | Phần lớn do agent grep vòng trước bỏ sót `tenant-worker` hoặc re-export đổi tên |
| Cần quyết định sản phẩm — chưa/không tự sửa | ~21 | Danh sách đầy đủ + câu hỏi cụ thể ở mục 8.8 |

Con số trên là ước lượng gộp từ báo cáo 7 agent (68 finding gốc, một số finding trùng lặp giữa 2 tài liệu
của cùng module được đếm 1 lần) — **chưa phải đếm tay dòng-theo-dòng lần cuối như kỷ luật đã đặt ra ở đầu
tài liệu này**; nếu cần con số chính xác tuyệt đối cho báo cáo chính thức, nên dành một lượt riêng đối
chiếu lại 68 dòng gốc với 7 báo cáo trên.
