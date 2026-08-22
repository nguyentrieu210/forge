# Alumdoor — Làm thật: tạo dữ liệu giao dịch sống để đóng nốt 5 mục treo (21/08)

*Phụ lục thứ hai của `docs/ALUMDOOR-PROMPT-AUDIT-DANH-MUC-MAN-HINH-20260821.md`, nối tiếp
`ALUMDOOR-DANH-MUC-TRAI-NGHIEM-THAT-20260821.md`. Lượt trước chỉ đọc (mọi form "Tạo mới" đóng bằng
"Huỷ"); lượt này theo lệnh "tiếp đi làm thật" — bấm Lưu/Ghi sổ thật trên **D1 cục bộ**
(`desktop-jtfcutt`, `localhost:5173` + `localhost:8799`), tạo dữ liệu giao dịch thật để đóng 5 mục còn
treo (S4, K3, WH#7, WH#9, nửa sau K2) mà lượt đọc-only không chạm tới được. Không đụng gì ngoài local
dev D1.*

**Dữ liệu test đã tạo trên D1 cục bộ (để biết mà dọn nếu cần):**

| Bản ghi | Nội dung |
|---|---|
| `Sales Order DH-2026-0068` | Khách "ANH MINH TUẤN" · CDUC_TD_AL71N (ĐỨC AL71N) màu ĐEN XINGFA · 1,2×1,5m · SL 199.999 bộ · đã Ghi số đơn |
| `Delivery Note PXK-2026-0009` | Theo DH-2026-0068 · kho K36 · trạng thái **nháp** (chưa Ghi sổ — bị chặn, xem §2) |
| `Customer ANH MINH TUẤN` | Sửa field Nâng cao: Hạn mức công nợ = 50.000.000 đ (trước đó trống) |

---

## 1. Đơn hàng thật xác nhận cỗ máy giá/khuyến mãi có chạy thật

Tạo `DH-2026-0068`: CDUC_TD_AL71N, màu ĐEN XINGFA, cách bán CHI_LA (1.095.000 đ/m²), kích thước
1,2×1,5m, SL 199.999 bộ (số cực lớn, cố tình để vượt mọi tồn kho thật). Bấm "Ghi sổ đơn" thành công,
hệ thống tự tính:

- Diện tích: 359.998,2 m² · 23 lá (Tổng số lá)
- **Chiết khấu của Đức 15%** (tự áp, không thao tác thêm) — trừ 59.129.704.350 đ
- **Tặng ray của Đức từ 8m² · 1 Bộ** (quy tắc tặng-kèm tự kích hoạt vì diện tích > 8m²)
- Còn phải thu: 335.938.320.300 đ

Xác nhận trực tiếp: cỗ máy tính giá/chiết khấu/tặng kèm theo bảng giá + quy tắc thật đang chạy sau
màn hình, không phải placeholder — khớp với bằng chứng "Ghi chú giá" đã thấy ở F3/F4 các lượt trước,
nay thấy nó vận hành đầu-cuối trên một đơn thật.

**Phát hiện phụ (không nằm trong 5 mục treo):** dùng đường "Đơn hàng → Phiếu xuất" (chuyển hàng loạt)
để tạo Phiếu giao hàng từ chính đơn 199.999 bộ này — nút "Tạo phiếu xuất nháp" khiến tab trình duyệt
treo cứng hơn 15 giây (nhiều lệnh chụp màn hình/click báo timeout liên tiếp), và sau khi buộc điều
hướng đi nơi khác, **không có Phiếu giao hàng nào được tạo ra** (danh sách vẫn giữ nguyên 8 phiếu cũ).
Không có thông báo lỗi, không có giới hạn số lượng ở đầu vào SL — nghi vấn: đường xử lý hàng loạt này
lặp theo từng đơn vị (một trong các bước tính "23 lá" ở trên có thể lặp theo số lượng thay vì theo
diện tích), khiến số lượng phi thực tế làm treo máy thay vì bị chặn ngay từ ô nhập liệu bằng một mức
trần hợp lý (vd. cảnh báo khi SL vượt 1.000). Đường thủ công (mục 2 dưới đây) không gặp vấn đề này.

## 2. WH#9 — kết luận lại chính xác hơn bản gốc: CÓ khoá, nhưng khoá trễ + thông báo sai ngôn ngữ

Dùng đường thủ công `/app/Delivery Note/new` → tab "Theo đơn bán" → chọn khách → "Tải đơn của khách"
→ "Nạp phần còn phải giao" (nạp đúng dòng 199.999 bộ từ DH-2026-0068, không hang):

- Cột "Tồn & cảnh báo" báo **"Tồn: 0 Bộ"** kèm cảnh báo "Không so được: Cửa bán m² tồn Bộ — hệ số quy
  đổi theo kích thước của từng dòng, không có số tĩnh."
- Chọn kho K36, bấm **"Lưu nháp theo số thực giao"** → **THÀNH CÔNG**, tạo `PXK-2026-0009` (trạng thái
  nháp) — dù tồn = 0 và SL giao ≈ 199.999 bộ. Không có khoá nào ở bước lưu nháp.
- Bấm tiếp **"Ghi sổ phiếu"** (bước chốt sổ, ảnh hưởng thật tới tồn kho) → **BỊ CHẶN CỨNG**:
  banner đỏ *"Insufficient stock for CDUC_TD_AL71N in K36"* + nút "Thử lại". Ảnh chụp:
  `delivery-note-insufficient-stock-block.jpg`.

**Kết luận chính xác hơn WH#9 gốc:** hệ thống **CÓ** khoá tồn kho cứng, nhưng chỉ ở bước **Ghi sổ**
(bước ghi sổ thật), không phải ở bước lưu nháp — điều này hợp lý vì nháp chưa ảnh hưởng tồn. Hai vấn
đề thật sự đáng ghi, khác với giả thuyết gốc:

1. **Rò ngôn ngữ**: thông báo chặn duy nhất mà người dùng thấy tại đúng khoảnh khắc quan trọng nhất
   ("Insufficient stock for CDUC_TD_AL71N in K36") là **tiếng Anh nguyên văn**, giữa một UI 100%
   tiếng Việt từ đầu đến cuối. Người dùng vận hành thực tế (nhân viên kho) nhiều khả năng không hiểu
   thông báo này.
2. **Cảnh báo sớm sai lệch với hành vi thật**: dòng "Không so được... không có số tĩnh" ở bước nháp
   khiến người dùng nghĩ hệ thống *không thể* so tồn cho mặt hàng bán theo m² — nhưng bước Ghi sổ
   ngay sau đó chứng minh hệ thống **so được thật** và tính đúng ra "insufficient". Cảnh báo sớm đang
   nói giảm năng lực thật của hệ thống, khiến người dùng không được báo trước về việc sắp bị chặn.

## 3. K2 (nửa sau) — đóng dứt điểm: `credit_limit` không được đọc lại ở bất kỳ đâu trong Công nợ

Sửa khách hàng thật "ANH MINH TUẤN" (cùng khách dùng ở đơn DH-2026-0068), tab Nâng cao, điền
"Hạn mức công nợ" = 50.000.000, bấm Lưu → toast "Đã lưu" hiện, breadcrumb đầu trang xác nhận đã lưu
đúng "Hạn mức công nợ 50.000.000". Sau đó vào module Công nợ, mở cả hai báo cáo phân tích:

- **"Công nợ theo khách hàng"**: cột chỉ gồm Khách hàng / Số hoá đơn / Tổng hoá đơn / Còn nợ — **không
  có cột Hạn mức công nợ**. Báo cáo cũng chỉ liệt kê khách có hoá đơn thật (1 dòng: CỬA CUỐN MINH ĐỨC,
  8 hoá đơn, còn nợ 73.440.000 đ) — "ANH MINH TUẤN" dù vừa có Đơn hàng + Phiếu giao hàng thật cũng
  **không xuất hiện** vì chưa có Hoá đơn bán hàng phát sinh. Ảnh chụp:
  `debt-by-customer-no-credit-limit-column.jpg`.
- **"Công nợ phải thu"**: 0 dòng, "Báo cáo chạy xong nhưng không có dòng nào khớp phạm vi và bộ lọc
  hiện tại" — trạng thái rỗng sạch (không phải lỗi).
- Dòng nào trong hai báo cáo trên cũng không có, bấm vào dòng cũng không mở chi tiết (không có
  drill-down cấp khách hàng).

**Kết luận:** K2 xác nhận đầy đủ ở cả hai nửa. `credit_limit` là field nhập liệu thuần — lưu đúng,
đọc lại đúng trên form Customer — nhưng không được bất kỳ báo cáo/luồng nghiệp vụ Công nợ nào tiêu
thụ. Không có cảnh báo "vượt hạn mức", không có cột đối chiếu, không có cách nào trong UI hiện tại để
biết một khách đang nợ có đang vượt hạn mức đã khai hay không.

## 4. S4 — không thể dựng được, nguyên nhân xác định rõ: tầng dữ liệu BOM rỗng hoàn toàn

Thử đường nhanh nhất: mở đơn DH-2026-0068 → bấm nút "Sản xuất" ở chân phiếu → hệ thống điều hướng
sang "Yêu cầu sản xuất" lọc theo đơn này — 0 dòng (chưa có yêu cầu sản xuất nào được tạo tự động).
Kiểm tiếp hai danh mục nền tảng cho toàn bộ chuỗi giá vốn sản xuất:

- **"Lệnh sản xuất"** (Work Order): 0 bản ghi trên toàn hệ thống.
- **"Mẫu BOM"** (BOM Template): **0 bản ghi trên toàn hệ thống**. Ảnh chụp: `bom-template-empty.jpg`.

**Kết luận:** không phải audit bỏ sót — D1 cục bộ này chưa từng có một mẫu BOM nào được khai từ đầu,
nên không thể tạo Lệnh sản xuất thật để mở tab giá vốn/biến động (S4) mà không tự tay dựng một BOM từ
số 0 (đòi hỏi kiến thức nghiệp vụ về công thức cắt nhôm/kính/phụ kiện mà tài liệu này không có căn cứ
để tự bịa). Đây là bằng chứng gián tiếp nhưng chắc chắn: nếu S4 nói tab giá vốn hiển thị placeholder/
rỗng, thì với 0 Mẫu BOM sẵn có, **bất kỳ** Lệnh sản xuất nào được tạo trên hệ thống thật (không chỉ
trên D1 test này) cũng khởi đầu từ một chuỗi giá vốn không có nền để tính — cùng họ vấn đề với S1 (Việc
sơn không có field giá) mà lượt trước đã xác nhận chắc chắn.

## 5. K3 và WH#7 — bằng chứng sống một phần, chưa trùng khớp tuyệt đối với mô tả gốc

- **K3 (Aging công nợ)**: không tìm thấy đúng chữ "unavailable" như báo cáo gốc trích — thay vào đó
  "Công nợ phải thu" trả về trạng thái rỗng sạch ("Chưa có dữ liệu"). Cả hai báo cáo Công nợ hiện có
  (theo khách hàng / phải thu) đều **không có cột phân theo tuổi nợ** (0-30/31-60/60+ ngày) — nhất
  quán với kết luận gốc rằng bảng tuổi nợ không hoạt động, dù không tái hiện đúng nguyên văn thông báo
  lỗi. Có thể panel "aging" gốc nằm ở một vị trí UI khác (vd. trong PDF hoá đơn, hoặc màn tổng quan)
  mà lượt này chưa dò tới — nên xem đây là **củng cố một phần**, không phải xác nhận 100% giống bản gốc.
- **WH#7 (API giữ chỗ tồn không ai gọi)**: bắt log mạng trong lúc thao tác Phiếu giao hàng, thấy có
  **một lệnh gọi thật**: `GET /api/resource/Stock Reservation?...filters=[["state","=","Đang giữ"],
  ["item_code","in",["CDUC_TD_AL71N"]]]` — nghĩa là ít nhất API **đọc/liệt kê** Stock Reservation đang
  được UI Phiếu giao hàng gọi thật (khả năng để hiển thị "có ai đang giữ mặt hàng này không" trước khi
  giao). Đây có thể trùng hoặc khác với danh sách "3 API giữ chỗ" cụ thể mà WH#7 nêu tên trong báo cáo
  Kho — báo cáo gốc không có trong ngữ cảnh lượt này để đối chiếu từng tên endpoint. **Khuyến nghị**:
  lượt audit kế tiếp đối chiếu lại 3 tên API cụ thể của WH#7 với endpoint vừa quan sát được, để biết
  đây là 1-trong-3 (làm yếu kết luận "0 UI gọi tới") hay là một endpoint đọc nằm ngoài phạm vi WH#7
  (giữ nguyên kết luận gốc cho phần ghi/giữ chỗ).

## 6. Phát hiện phụ ngoài phạm vi 5 mục treo: dữ liệu test QA còn sót trong danh mục Kho

Khi mở danh sách chọn kho ở dòng Phiếu giao hàng, ngoài kho thật "K36" còn thấy 3 kho lạ: "QA Reserve
desktop-chromium-1787273747894", "QA Target desktop-chromium-1787273743043", "QA Source
desktop-chromium-1787273743043" — tên gọi và timestamp cho thấy đây là dữ liệu để lại bởi một lượt
test tự động (Playwright/QA) chạy trên chính D1 cục bộ này trước đó, không phải kho nghiệp vụ thật.
Không ảnh hưởng nghiệp vụ nhưng gây nhiễu — nếu D1 này từng được dùng làm demo cho người dùng thật,
3 dòng này sẽ lẫn vào danh sách chọn kho thật và có thể bị chọn nhầm.

## 7. Việc chưa đóng được / cần lượt riêng

- **S4** không thể đóng bằng dữ liệu — cần một lượt riêng có thời gian dựng ít nhất 1 Mẫu BOM thật từ
  đầu (đòi hỏi người có nghiệp vụ xác nhận công thức, không nên tự suy diễn).
- **K3** đóng một phần — cần dò thêm vị trí UI khác hoặc dữ liệu hoá đơn quá hạn thật để tái hiện đúng
  trạng thái gốc.
- **WH#7** cần đối chiếu tên API cụ thể với báo cáo Kho gốc (không có trong ngữ cảnh lượt này).
