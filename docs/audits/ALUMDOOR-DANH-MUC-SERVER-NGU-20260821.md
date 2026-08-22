# Alumdoor — năng lực danh mục "ngủ" ở tầng server (ngoài phạm vi Bán hàng 21/08)

*Lane DM-A của `docs/ALUMDOOR-PROMPT-AUDIT-DANH-MUC-MAN-HINH-20260821.md`. Đọc-chỉ, không có phiên
D1 local khi audit (localhost:5173/:8799 không nghe lúc đo). Kế thừa và KHÔNG lặp lại 17 khoảng
trống đã ghi trong `ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md` /
`ALUMDOOR-BAN-HANG-TSX-GAP-20260821.md` cùng ngày.*

---

## 0. Phạm vi và cách làm

Đã đọc: `catalog-readiness.ts` (462 dòng), `item-catalog-invariants.ts` (113 dòng), `color-scopes.ts` (337 dòng), `clouderp-pricing/src/{index,matrix,commercial-policy,types}.ts` (~1500 dòng gộp), `clouderp-selling/src/commercial-line-resolver.ts` (258 dòng), toàn bộ 20 file `.ts` trong `clouderp-stock/src` (2066 dòng, đọc kỹ 6/20, lướt export của 14 file còn lại), `server/briefs/alumdoor-v2.json` qua `jq` (100 DocType).

**Trước khi quét tiếp**, phát hiện repo đã có sẵn 3 tài liệu audit đúng là đợt `feat/ban-hang-danh-muc` mà đề bài nhắc tới:
`docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md` (G1–G17, làn A/server),
`ALUMDOOR-BAN-HANG-TSX-GAP-20260821.md` (làn B/client, G1–G13 đánh số riêng),
`ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md` (hợp đồng field). Đã đọc trọn 2 file đầu, chỉ đọc mục lục file thứ ba (nội dung trùng field đã thấy trong 2 file kia). **Toàn bộ G1–G17 và các mục N1–N6 trong 2 file này bị loại khỏi báo cáo dưới đây**, kể cả những cái không nằm trong 4 ví dụ đề bài nêu (ví dụ G9 "Ngưỡng chọn Motor ngủ hoàn toàn" — đã biết, đã quyết định hoãn, không nhắc lại). Cả server (`alumdoor-commercial.ts`, `router.ts`) lẫn client (`model.ts`, `AlumdoorSalesOrderWorkbenchComplete.tsx`) đều có code mang mốc `2026-08-21` khớp đúng nội dung 2 tài liệu này — tức phần lớn G1–G17 **đã được vá trong hôm nay**, không còn là khoảng trống sống.

Hai lần tự sửa trong lúc đo (ghi lại vì đúng nguyên tắc #1 — nguồn thắng bản trích):
- Nghi `alumdoor.catalog.readiness` cũng "ngủ" như comment lịch sử của chính nó gợi ý → kiểm lại thấy `main-base.tsx:971` gọi thật. **Không phải khoảng trống.**
- Nghi `assertItemPriceTierIsUnambiguous` (chặn hai dòng giá cùng khớp một bậc diện tích) chưa ai gọi vì 4 vị trí tự nhiên (`clouderp-pricing`, `clouderp-selling`, `document-kernel`, `alumdoor-worker`) đều ra 0 → mở rộng ra `server/packages` mới thấy `frappe-api/src/router.ts:3401` gọi nó, vá cùng ngày 21/08. **Không phải khoảng trống.**
- Lệnh mẫu đề bài gợi ý (`grep -o '"fieldname":"[^"]*"'`) không khớp vì `alumdoor-v2.json` là JSON đã format đẹp, không phải minify — đã đổi sang `jq` cho mọi phép đo trên brief.
- Client Alumdoor không chỉ nằm ở `client/packages` — màn Danh mục thật (`AlumdoorMasterDataScreen.tsx`, `main-base.tsx`) nằm ở `client/apps/runtime/src`. Mọi lệnh grep phía dưới quét cả `client/apps` lẫn `client/packages`, không chỉ `client/packages` như đề bài gợi ý.

Sau khi loại hết phần đã biết, phần "còn lại" tìm được **không có ứng viên P0 mới** — mọi khoảng trống mới đều là năng lực xây xong nhưng chưa nối, không phải số tiền đang sai ngay bây giờ. Ghi rõ điều này thay vì cố nặn thêm P0.

---

## 1. Bảng chính

| # | Năng lực danh mục (field/method, nguồn) | Có nơi nào đọc? (số + lệnh grep) | Hạng | Ngủ? |
|---|---|---|:--:|:--:|
| D1 | `readItemPriceMatrix` / `commitItemPriceMatrix` / `createPriceList` — lưới quản trị Item Price × ĐVT × Bảng giá, có OCC + idempotency + tự phát hiện ô trùng. Nguồn: `server/packages/clouderp-pricing/src/matrix.ts` (441 dòng) | `grep -rn "readItemPriceMatrix\|commitItemPriceMatrix\|ItemPriceMatrix" server/apps-src` → **0/21 worker**. `grep -rn "readItemPriceMatrix\|commitItemPriceMatrix\|createPriceList\b\|PRICING_MATRIX_*" server/packages` → 13 khớp, **cả 13 nằm trong chính `matrix.ts`**. `grep -rn "ItemPriceMatrix\|pricing_matrix" client` → **0** | P2 | Sâu hơn ngủ — chưa từng thành method nên chưa từng chạy trong sản phẩm thật (khác 4 luật đã biết: những luật đó CHẠY MỖI REQUEST) |
| D2 | `Item.reorder_levels` (bảng con "Item Reorder": `warehouse`, `safety_stock`, `reorder_level`, `reorder_qty`, `lead_time_days`) | `grep -in "reorder" server/apps-src/alumdoor-worker/src/*.ts` → 1 khớp DUY NHẤT, và chỉ để bắt lỗi "dịch vụ không được có mức đặt lại" (`item-catalog-invariants.ts:60`) — không đọc giá trị. `grep -rin "reorder" client/packages/vertical-alumdoor/src client/apps/runtime/src` → **0** | P2 | Không hẳn — không phải logic chạy-rồi-bỏ, mà logic đọc/so sánh 4 trường này CHƯA TỪNG ĐƯỢC VIẾT |
| D3 | `Supplier Item.minimum_order_qty` (Số lượng mua tối thiểu) | `grep -rn "minimum_order_qty" server/apps-src/alumdoor-worker/src client/packages/vertical-alumdoor/src client/apps/runtime/src` → **0/3** | P2 | Không — cùng cảnh D2 |
| D4 | `allocateLandedCost` (phân bổ chi phí nhập — cước, thuế — vào giá vốn theo largest-remainder). Nguồn: `clouderp-stock/src/landed-cost.ts` | `grep -in "landed.cost\|landed_cost" server/apps-src/alumdoor-worker/src/*.ts` → **0**. `grep -n "clouderp-stock" server/packages/clouderp-erpnext/src/alumdoor-inventory.ts` → chỉ import `buildTrackedStockLines`, `normalizeBundleRows`, KHÔNG có `allocateLandedCost`. Brief: `jq -r '.doctypes[].name' … \| grep -i "cost\|landed\|freight"` → chỉ ra "Warranty Cost Item", **không có khái niệm Landed Cost nào trong 100 DocType** | P1 | Không |
| D5 | `Pricing Scope Member` — bảng thành viên (Item/Item Group) của một phạm vi giá, đọc bởi `commercial-policy.ts::scopeIncludes` | `grep -rn "Pricing Scope\|pricing_scope" client/packages/vertical-alumdoor/src` → 4 khớp, **cả 4 đều đọc-chỉ** (`pricing_scope_by_rule` hiển thị tên luật→tên phạm vi; 1 dòng ghi chú "UI chỉ hiển thị, server là authority"). **0 chỗ tạo/sửa `members`** | P2 | Không |
| D6 | Nhóm audit/toàn vẹn tồn kho của `clouderp-stock`: `auditOutgoingValuation` (valuation-audit.ts), `RepostItemValuationController`+`…IntegrityController`, `SerialAndBatchBundleController`+`…IntegrityController`, cộng `warehouse-location.ts`, `wms-{picking,packing,putaway,wave}.ts`, `inventory-{analytics,policy,scan,scan-resolution}.ts` | `grep -rl "clouderp-stock" server/apps-src/alumdoor-worker/src` → **0**. `clouderp-erpnext/src/alumdoor-inventory.ts` (1012 dòng, file Alumdoor DÙNG THẬT để dựng dòng sổ kho) chỉ import 2/… hàm kể trên (`buildTrackedStockLines`, `normalizeBundleRows`) — không import bất kỳ hàm audit nào ở trên. Brief: `jq -r '.doctypes[].name' … \| grep -i "repost\|batch bundle\|serial"` → **0/100** — "Repost Item Valuation" và "Serial and Batch Bundle" không tồn tại như DocType của Alumdoor | P1 (chưa chắc — xem §3) | Không xác định chắc |

---

## 2. Mục "Luật đang ngủ" (theo đúng định nghĩa: đã chạy đúng ở server, không ai đọc kết quả)

**Không có mục nào trong đợt quét này đạt đúng định nghĩa "luật ngủ" như 4 luật đã biết.** Lý do: cả 4 luật đã biết đều là logic THỰC THI Ở SERVER MỖI KHI CÓ REQUEST (server tính `finish_color_context`, tính `uom`/`source_uom`, fail-closed theo `area_tier`...) rồi bị vứt trên đường về hoặc bị bỏ đói lệnh gọi. Sáu mục D1–D6 tìm được trong đợt này thuộc một dạng khác — **năng lực có sẵn nhưng chưa từng được kích hoạt bởi bất kỳ ai** (D1, D4, D6: hàm/controller viết xong nhưng 0 lệnh gọi trong toàn bộ đường đi từ client tới server; D2, D3: dữ liệu khai trong brief nhưng chưa có lấy một dòng code đọc giá trị của nó, dù để hiển thị hay để tính toán). Xin không gán nhãn "ngủ" cho chúng để giữ đúng nghĩa hẹp của thuật ngữ này trong repo.

Đáng nói riêng nhất là **D1**: `matrix.ts` là 441 dòng có OCC (`expectedVersion`/`itemPriceVersions`), idempotency key theo `sha256Hex`, phát hiện ô-giá-trùng trước khi tạo (`Multiple active Item Price records match matrix cell`), rollback từng phần khi commit dở dang (`PRICING_MATRIX_PARTIAL_FAILURE`) — tức đây là hạ tầng cho một màn "sửa nhanh cả bảng giá của một mã hàng" hoàn chỉnh, không phải bản nháp. Nó không đứng cạnh 4 luật đã biết chỉ vì nó CHƯA TỪNG chạy trong sản phẩm thật (không có route nào gọi tới `readItemPriceMatrix`/`commitItemPriceMatrix` ở bất kỳ trong 21 worker hay bất kỳ package nào khác), nên không thể nói nó "đã chạy đúng".

**Hậu quả nghiệp vụ cụ thể:**

- **D1** — Ai bị ảnh hưởng: người sửa giá bán (kế toán/chủ xưởng khi đổi bảng giá theo mùa, hoặc thêm ĐVT mới cho một mã). Hiện phải mở từng bản ghi `Item Price` qua form DocType chung, tự nhớ đúng khoá đặt tên 5 đoạn (`price_list:item_code:uom:price_variant:area_tier`) mà `clouderp-pricing/src/index.ts` đã cảnh báo dài dòng là dễ tạo trùng khoá. Rủi ro trùng khoá **không còn là lỗ hổng tiền** kể từ bản vá `router.ts:3401` cùng ngày (chặn ở cửa ghi REST rồi), nên đây thuần là thao tác chậm, không phải tiền sai — đúng lý do xếp P2 dù quy mô code lớn.
- **D2/D3** — Ai bị ảnh hưởng: người mua hàng (kế toán mua/chủ xưởng). Khi xưởng nhập nguyên liệu định kỳ, không có màn nào nói "mã X đã dưới điểm đặt hàng lại" hay "mã Y phải mua tối thiểu N Con mỗi lần vì nhà cung cấp yêu cầu" — dù cả hai con số đã được ai đó nhập vào danh mục. Rủi ro là quyết định mua dựa hoàn toàn vào trí nhớ, đúng kiểu lỗi mà `motor.suggest` (đã biết, đã hoãn) đang mắc phải ở phía bán.
- **D4** — Ai bị ảnh hưởng: kế toán giá vốn, NẾU xưởng có phát sinh cước/thuế nhập cho lô nhôm. Không có cách nào trong code phân bổ chi phí đó vào giá vốn theo lô nhận hàng; nếu nghiệp vụ này có thật thì giá vốn tồn kho đang thiếu một cấu phần (ảnh hưởng number tiền thật — vì vậy xếp P1 thay vì P2), nhưng tôi **không có bằng chứng xưởng có phát sinh chi phí này** (xem §4).
- **D6** — Ai bị ảnh hưởng: tiềm tàng, chưa xác nhận. Nếu quy trình mua/xuất kho tự viết của Alumdoor (`purchase-fifo-receipt.ts`, `bulk-purchase-fifo-receipt.ts`, `bulk-sales-delivery.ts`…) có sai lệch định giá do lỗi logic hay dữ liệu backdated, **không có công cụ audit chung nào của nền tảng chạm tới được** để phát hiện — công cụ đó (`auditOutgoingValuation`) tồn tại nhưng chỉ áp cho luồng generic mà Alumdoor không dùng.

---

## 3. Không đo được trong lượt này

- **Bộ khung controller registry toàn cục**: không lần ra được nơi tổng hợp mọi `register*Controllers()` (của `clouderp-stock`, `clouderp-selling`, `clouderp-erpnext`...) thành một registry chung áp cho mọi tenant. Vì vậy **D6 chỉ chắc chắn ở phần đã đo** (0 import trực tiếp trong `alumdoor-worker`; `alumdoor-inventory.ts` chỉ dùng 2/nhiều hàm của `clouderp-stock`; 2 DocType liên quan không có trong brief Alumdoor) — chưa chắc chắn 100% rằng KHÔNG có đường gián tiếp nào khác khiến `RepostItemValuationIntegrityController`/`SerialAndBatchBundleIntegrityController` vẫn chạy nền cho dữ liệu Alumdoor. Cần thêm thời gian truy vết `document-kernel`/nơi khởi tạo Worker.
- **Có D1–D6 thực sự cần thiết cho nghiệp vụ Alumdoor hay không** — tất cả đều là "capability tồn tại, chưa đo được nhu cầu thật". Không có phiên D1 local để xem có bao nhiêu mã hàng đã điền `reorder_level`/`minimum_order_qty` (có điền thì gap có ý nghĩa ngay; điền toàn 0/trống thì gap chỉ là lý thuyết). Ghi rõ theo đúng nguyên tắc #6, không bịa số.
- **14/20 file của `clouderp-stock`** (`inventory-scan.ts`, `inventory-scan-resolution.ts`, `wms-{picking,packing,putaway,wave}.ts`, `warehouse-location.ts`, `warehouse-scope.ts`, `uom-conversion.ts`, `tracking.ts`, `inventory-policy.ts`) — đã lướt export, chưa đọc từng dòng. Gộp chung vào D6 vì cùng gốc "không có đường vào từ Alumdoor", nhưng không loại trừ khả năng một trong số này có chi tiết đáng thành phát hiện riêng nếu đọc kỹ hơn.
- **`ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md`** — chỉ đọc mục lục (11 heading), không đọc thân bài. Rủi ro nhỏ là tài liệu này có 1-2 chi tiết field không trùng với 2 tài liệu kia mà tôi vô tình báo lại như "mới". Đã giảm rủi ro này bằng cách đối chiếu tên field cụ thể (`price_explain`, `catalog_context`…) qua code thật (`alumdoor-commercial.ts`, `model.ts`) thay vì chỉ tin vào tài liệu.
- **`bom-rule-sales-preview.ts`, `Cutting Policy Rule`, `BOM Rule Applicability`, `Geometry Profile Scope`** — nằm trong brief, chưa đọc kỹ; nhiều khả năng đã được phủ bởi luồng `production_line_context`/`door.calculate` (theo ghi chú "cố ý không làm" của DANH-MUC-GAP §4), nhưng chưa tự kiểm chứng.

---

## 4. Câu hỏi mở

**a) Suy được từ dữ liệu — chưa làm, không cần hỏi thêm:**
- Cảnh báo "cần đặt hàng lại" khi tồn hiện tại chạm `Item.reorder_levels[].reorder_level` (D2) — công thức đã rõ trong tên trường, không cần quyết định nghiệp vụ mới để bắt đầu.
- Hiện `Supplier Item.minimum_order_qty` khi lập Purchase Order/Material Request cho đúng nhà cung cấp đó (D3).
- Nối `commitItemPriceMatrix` vào một nút "sửa nhanh bảng giá" trên màn Danh mục, ít nhất cho phần đọc (`readItemPriceMatrix`) trước — không đổi hành vi nghiệp vụ, chỉ đỡ thao tác.

**b) Phải hỏi chủ xưởng:**
- Nhập nhôm/phụ kiện có phát sinh cước vận chuyển hoặc thuế nhập cần cộng vào giá vốn theo lô không? Nếu có, phân bổ theo cơ sở nào — theo giá trị dòng, theo cân, theo mét dài? (Quyết định này mở khoá D4; nếu câu trả lời là "không, giá mua đã gồm hết" thì D4 đóng lại, không phải làm gì thêm.)
- `reorder_level`/`safety_stock`/`lead_time_days` (D2) và `minimum_order_qty` (D3) đã được nhập cho mặt hàng nào chưa, hay là trường khai sẵn trong brief nhưng chưa ai điền? Nếu trống toàn bộ, xây cảnh báo dựa trên nó chưa có ý nghĩa cho tới khi nhập liệu xong.
- Ai thực sự sửa Item Price/Pricing Rule/Pricing Scope, tần suất bao nhiêu? Nếu là việc làm thường xuyên (theo mùa, theo đợt tăng giá nhôm), nối `matrix.ts` (D1) đáng công; nếu vài tháng mới sửa một lần, giữ form đơn lẻ là đủ.

**c) Dữ liệu tự mâu thuẫn:**
- Không phát hiện mâu thuẫn dữ liệu nào trong đợt quét này (khác 3 tài liệu audit trước, vốn đã liệt kê cụ thể — ví dụ 16 mã bán được mà không có giá). Các phát hiện D1–D6 đều là "khoảng trống chưa nối", không phải "hai nguồn nói khác nhau". Ghi rõ mục này còn trống thay vì bỏ qua, đúng yêu cầu định dạng.
