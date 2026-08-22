# Alumdoor — Trải nghiệm thật màn Danh mục (bổ sung sau vòng đọc-mã 21/08)

*Phụ lục của `docs/ALUMDOOR-PROMPT-AUDIT-DANH-MUC-MAN-HINH-20260821.md` §6 (giới hạn đã biết: "trình
duyệt sống chưa mở được"). Tài liệu này đóng khoảng đó — backend + frontend cục bộ đã bật thật trên
`desktop-jtfcutt` (`pnpm run dev:alumdoor-local` + `pnpm run dev` theo đúng RUNBOOK_LOCAL.md), đăng
nhập thật (`dev@example.com`), điều khiển qua Claude in Chrome. Không sửa dữ liệu — mọi form "Tạo mới"
mở ra đều đóng bằng "Huỷ", không bấm Lưu.*

---

## 0. Cảnh báo phương pháp — đọc trước khi dùng số ở dưới

**D1 cục bộ trên máy này KHÔNG phải bản sao của bộ dữ liệu mà các audit trước (20/08–21/08) đo.**
Đo trực tiếp trên UI thật:

- `Hàng hoá / Vật tư`: **404** bản ghi (`1–20 / 404` ở chân bảng) — các audit trước luôn trích dẫn
  **566** mã hàng làm baseline (`ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §5.1 và toàn bộ 5 báo cáo lane hôm
  nay). Chênh **162 mã**, chưa rõ lý do (D1 cục bộ seed lại từ brief tĩnh, không đồng bộ với nguồn
  566 mã).
- `Supplier Item`: **0** bản ghi — trong khi lane Mua hàng hôm nay trích dẫn "✅ ĐÃ LÀM… 13 Supplier
  Item · 34 giá nhập" từ một nguồn khác.

**Kết luận dùng cho phần dưới:** số lượng bản ghi trên D1 cục bộ này **không dùng để xác nhận hay bác
bỏ** các con số khối lượng (566, 13, 34…) trong 5 báo cáo lane — hai nơi đo trên hai bộ dữ liệu khác
nhau. Phần có giá trị thật của lượt trải nghiệm này là **hành vi/cấu trúc UI** (field có hiện hay
không, có mô tả hay không, route có sống hay không) — thứ không phụ thuộc vào bộ dữ liệu đang nạp.

---

## 1. Đối chiếu cấu trúc màn Danh mục — khớp đúng báo cáo Lane DM-B

Vào `http://localhost:5173/master-data` (đúng route `AlumdoorMasterDataScreen.tsx` mà Lane DM-B xác
định, không phải `workspace-extension.tsx`). Đếm trực tiếp trên UI: **8 nhóm, 30 mục hiện ra**:

01 Vật tư & quy cách (10) · 02 Kho (1) · 03 Khách hàng & giá bán (6) · 04 Bán hàng & sản xuất (5) ·
**05 Mua hàng & nhà cung cấp (chỉ 1 — "Nhà cung cấp", KHÔNG có "Mã hàng nhà cung cấp")** · 06 Địa bàn &
giao lắp (3) · 07 Lý do vận hành (3) · 08 Kế toán (1).

30 mục hiện + 1 mục khai nhưng ẩn (Supplier Item, xem mục 2) = 31 — khớp chính xác con số
`MASTER_DATA_DECLARED_KEYS = 31` mà Lane DM-B đếm bằng `grep -c 'key: "'` trên mã nguồn.

## 2. F1 — Supplier Item vắng mặt trên menu: xác nhận sống

Vào thẳng `http://localhost:5173/app/Supplier Item` (không qua menu Danh mục) — **route vẫn sống**,
render đúng tiêu đề "Supplier Item", danh sách trống (0 bản ghi, xem cảnh báo §0). Xác nhận đúng cơ
chế Lane DM-B mô tả: `menu:false` chỉ ẩn khỏi điều hướng, engine CRUD chung (`DoctypeWorkspace.tsx`)
vẫn phục vụ DocType này qua route trực tiếp — không phải "xoá", chỉ "giấu lối vào".

## 3. F2 — `last_purchase_rate` vắng mặt cả hai tab: xác nhận sống, có ảnh

Mở "Tạo mã hàng nhà cung cấp" (`/app/Supplier Item/new`):

- Tab **Thông tin chính**: chỉ 3 trường — Nhà cung cấp, Mặt hàng, Mã của nhà cung cấp.
- Tab **Nâng cao**: Nhà cung cấp ưu tiên, **Số lượng mua tối thiểu** (có mặt — khác `last_purchase_rate`),
  Thời gian giao (ngày), Ghi chú, Ngừng dùng.

**Không tab nào có ô "Giá mua gần nhất".** Khớp chính xác F2: field `hidden:true`, không sửa được qua
form ở bất kỳ đâu, chỉ qua import. Ảnh chụp: `supplier-item-advanced-tab.jpg`.

## 4. F3 — Bậc diện tích required + default câm lặng: xác nhận sống, có ảnh

Mở "Tạo đơn giá theo bảng giá" (`/app/Item Price/new`): trường **"* Bậc diện tích"** có dấu `*` đỏ
(bắt buộc) nhưng đã **tự điền sẵn "Mọi diện tích · MOI-DIEN-TICH"** — người dùng có thể bấm Lưu ngay
mà không chạm vào ô này. Không có dòng mô tả/gợi ý nào bên dưới giải thích bậc diện tích là gì hay hệ
quả bỏ qua nó. Khớp chính xác F3. Ảnh chụp: `item-price-area-tier-default.jpg`.

## 5. F4 — Pricing Rule: 1/26 field bắt buộc, xác nhận sống, có ảnh

Mở "Tạo chính sách giá" (`/app/Pricing Rule/new`) — tab **Thông tin chính chỉ có đúng 1 ô: "* Tên
chính sách"**. Sang tab Nâng cao: toàn bộ 20+ field còn lại — Chỉ áp cho mặt hàng, Chỉ áp cho đối tác,
Chỉ áp cho nhóm giá, Kiểu tác động, Cách tính điều chỉnh, Mức điều chỉnh, Giá cố định, % giảm, Phạm vi
áp dụng… — **không một field nào có dấu `*` bắt buộc**. Bấm "Lưu và mở" ngay ở bước đầu (chưa thử,
nhưng schema cho phép) sẽ tạo được một chính sách giá có tên, không phạm vi, không tác động. Khớp
chính xác F4. Ảnh chụp: `pricing-rule-advanced-empty.jpg`.

## 6. F5 — Pricing Scope: bảng thành viên không bắt buộc, xác nhận sống, có ảnh

Mở "Tạo phạm vi áp dụng chính sách" (`/app/Pricing Scope/new`): "* Tên phạm vi" bắt buộc, nhưng bảng
"Mặt hàng / nhóm hàng áp dụng" — nơi khai thành viên phạm vi — **không có dấu bắt buộc**, mặc định
"Chưa có dòng nào". Không cảnh báo nào ở màn lưu nói phạm vi rỗng thì chính sách nào tham chiếu nó sẽ
không áp cho ai. Khớp chính xác F5. Ảnh chụp: `pricing-scope-zero-members.jpg`.

## 7. Measurement Profile — 7 cờ định vị đúng vị trí, xác nhận sống, có ảnh

Mở "Tạo bộ theo dõi vật tư" (`/app/Measurement Profile/new`), tab Nâng cao: đủ 7 cờ đúng tên tiếng
Việt — Theo dõi lô kích thước, **Bắt buộc màu**, Bắt buộc tình trạng, Bắt buộc chiều dài, Bắt buộc
chiều rộng, Bắt buộc số cây/lá/tấm, Theo dõi số bó — cộng "Ngưỡng cảnh báo lệch cân (%)" mặc định
**13**, khớp đúng số nền tảng WH báo cáo trích dẫn. Đây là **tầng khai dữ liệu** (đúng, không phải
gap) — WH#4 nói về tầng **tiêu thụ** (6/7 cờ này, trừ "Bắt buộc màu" vừa được vá, không có nơi nào ở
Purchase Receipt/Manufacturing Stock Entry đọc lại để bắt buộc field tương ứng lúc tạo Batch). Do D1
cục bộ không có sẵn mặt hàng nào đã gán các cờ này = true (xem cảnh báo §0), không dựng lại được kịch
bản đầu-cuối trong lượt này — giữ nguyên bằng chứng grep tĩnh của WH#4 làm căn cứ chính. Ảnh chụp:
`measurement-profile-7-flags.jpg`.

## 8. Bán hàng vs Xuất kho — xác nhận cấu trúc "không hỏi tồn" / "có hỏi tồn"

- **Đơn hàng** (`/app/Sales Order/new`, màn `AlumdoorSalesOrderWorkbenchComplete.tsx`): bảng dòng chỉ
  có STT · Mã hàng · Tên hàng · Màu · SL · ĐVT · Khối lượng · Đơn giá · Thành tiền — **không một cột
  Kho hay Tồn nào**, không ô chọn kho ở đầu phiếu. Khớp đúng quyết định 21/08 ghi trong chính mã nguồn
  (`AlumdoorSalesOrderWorkbenchComplete.tsx:672-681`, đã trích ở báo cáo Kho §2).
- **Phiếu giao hàng** (`/app/Delivery Note/new`, `AlumdoorDeliveryNoteWorkbench.tsx`): có hẳn ô "Kho
  xuất mặc định" ở đầu phiếu VÀ cột "Tồn & cảnh báo" trong bảng dòng — đúng như báo cáo mô tả, năng
  lực tồn kho dồn hết về đây.
- **Phát hiện phụ mới** (không nằm trong 5 báo cáo lane): chân phiếu Giao hàng tự ghi một dòng cảnh
  báo về khoá trùng — *"Lưu nháp theo số thực giao… đường này chưa có khoá chống trùng ở máy chủ — chỉ
  bấm một lần"*. Cùng họ với nguyên tắc OCC/idempotency mà toàn bộ audit đề cao, nhưng là một khoảng hở
  cụ thể (một luồng lưu KHÔNG có khoá) mà UI tự thú nhận — nên ghi lại dù ngoài phạm vi 5 lane.
- Không dựng được kịch bản "tồn thiếu, bấm Ghi sổ vẫn được" (WH#9) trong lượt này vì D1 cục bộ không
  có Sales Order thật đã đặt để tải vào Phiếu giao — cần D1 có dữ liệu giao dịch thật, không chỉ danh
  mục.

## 9. Mua hàng — giá nhập và gợi ý chiều dài đều trống, xác nhận sống, có ảnh

Mở "Tạo đơn mua hàng" (`/app/Purchase Order/new`), chọn NCC thật ("TRẦN ĐẠT BẾN TRE" — dữ liệu D1 cục
bộ có tên NCC thật, không phải placeholder), chọn mã hàng thật **AL71** (đúng mã dùng làm ví dụ barem
trong báo cáo DM-A):

- **Kg/m tự điền đúng 0,389** (từ `Material Specification.theoretical_kg_per_m`) — phần này ĐANG chạy
  đúng.
- **"Dài một cây/đoạn (m)" trống, không gợi ý** — xác nhận PUR#5 (`standard_length_m` chỉ được đọc ở
  màn Nhập, không ở màn Đặt) dù cùng dùng chung `material_specification` để tra bảng.
- **"Đơn giá" trống, không gợi ý, không placeholder** — xác nhận trực tiếp PUR#3: dù NCC này CÓ hay
  KHÔNG có `last_purchase_rate` đã nạp cho AL71 (không kiểm được vì Supplier Item = 0 bản ghi ở D1 cục
  bộ, xem §0), **cơ chế gợi ý giá hoàn toàn không tồn tại trên chính màn hình** — không phải "có dữ
  liệu mà quên hiện", mà "chưa từng xây chỗ hiện".
- Bảng dòng đầy đủ cột chuyên biệt nhôm (Màu, Dài một cây/đoạn, Kg/m, Số bó, Số cây/lá, Kg đặt, Dập)
  nhưng **không có cột "Quy ra"/hệ số quy đổi** để đổi ĐVT dòng — khớp PUR#6.

Ảnh chụp: `purchase-order-al71-empty-price.jpg`. Đơn mua này **không lưu** — đóng bằng điều hướng đi
nơi khác (Chrome tự hỏi "rời trang, mất thay đổi?", đã xác nhận rời — không có bản ghi nào được tạo).

## 10. S1 — Sơn thuê ngoài: 0 field NCC/giá/công thức trên CẢ HAI tab, xác nhận sống, có ảnh

Đây là **P0 duy nhất** của vòng đọc-mã 21/08 — kiểm kỹ nhất. Mở "Tạo việc sơn" (`/app/Paint Job/new`,
qua Sản xuất → Quy trình → Việc sơn):

- Tab Thông tin chính (7 field): Lệnh sản xuất, Phiếu cắt, Lô thô, Mã vật tư, Màu cần sơn, Số lượng,
  Trạng thái.
- Tab Nâng cao (7 field): Yêu cầu sản xuất, Khoá bộ sản xuất, Màu hiện tại, Ngày vào lò dự kiến, Hoàn
  thành lúc, KCS xác nhận, Ghi chú.

**Tổng 14 field, đúng số Lane MFG-ACC đếm được từ mã nguồn — và xác nhận trực tiếp bằng mắt: không một
ô nào cho Nhà cung cấp, Đơn giá, hay Công thức tính tiền.** Một xưởng thuê sơn ngoài (NCC HẢI KỲ, công
thức riêng theo m²/số lá/số lớp — `CHI-TIẾT-SƠN.md`) không có bất kỳ chỗ nào trong toàn bộ form này để
ghi lại ai đã sơn, giá bao nhiêu, hay tính theo công thức nào. Đây là bằng chứng hình ảnh trực tiếp,
đầy đủ nhất trong toàn bộ lượt trải nghiệm — không suy luận từ code, nhìn thấy tận mắt cả hai tab.
Ảnh chụp: `paint-job-main-tab.jpg`, `paint-job-advanced-no-supplier-price.jpg`.

## 11. Khách hàng — `credit_limit` tồn tại nhưng trống toàn bộ, xác nhận một phần

- Mở "Tạo khách hàng" (`/app/Customer/new`) tab Nâng cao: field **"Hạn mức công nợ"** có thật, nằm
  cạnh Điều khoản thanh toán — xác nhận field tồn tại trên form (không chỉ trên schema).
  Danh sách 256 khách hàng thật (`/app/Customer`, tên doanh nghiệp thật — "CỬA CUỐN MINH ĐỨC", "ANH
  NGỌC AUSTDOOR"…) có cột "Hạn mức công nợ" — **toàn bộ các dòng nhìn thấy đều `—` (trống)**, khớp
  đúng ghi chú của K2 rằng `customer-export.xlsx` (nguồn field này) đã bị "moi ruột" chỉ còn 1 dòng
  tính đến 20/08.
- **Chưa kiểm được** phần "không đọc lại ở Debt Workbench" (K2's second half) — bấm nhầm sang màn Sản
  xuất do sidebar đổi vị trí item; hết ngân sách thời gian để quay lại đúng màn Công nợ trong lượt
  này.

## 12. Chưa trải nghiệm được (còn lại)

F6 (viewPolicy/validationMethod — 0/100 DocType Danh mục dùng: khó "nhìn thấy" qua UI vì đây là một
cơ chế KHÔNG kích hoạt, không tạo ra khác biệt hình ảnh nào để chụp), S4 (tab Giá vốn/Biến động trên
Work Order Workbench), K3 (Aging panel tự báo "unavailable"), WH#7 (3 API giữ chỗ tồn — đúng bản chất
"0 UI gọi tới" nên không có gì để bấm), WH#9 (nút Ghi sổ Xuất kho có khoá cứng khi thiếu tồn hay
không — cần dữ liệu giao dịch thật, D1 cục bộ chưa có). Muốn đóng hết các mục này cần: (a) D1 cục bộ
có dữ liệu giao dịch thật (không chỉ danh mục), (b) thêm thời gian một lượt trải nghiệm riêng.
