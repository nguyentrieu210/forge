# ALUMDOOR — Kết quả test thủ công dòng BÁN trên UI (23/08/2026)

Môi trường: `http://localhost:5173` (tenant local `127.0.0.1:8799`), đăng nhập `dev@example.com`.
Test bằng trình duyệt như người dùng thật, không chạy script.

Đối chiếu với:
- `docs/ALUMDOOR-QUY-TRINH.md` — mục 2 (dòng BÁN), mục 5 (tồn kho 4 con số), mục 6 (cấu trúc đơn)
- `docs/sales/SALES_GOLDEN_FLOW_AND_TEST_PLAN.md` — INV-01…08, PA-*, QO-*, GF-01…08, GF-F01…F08

Chứng từ đã tạo trong lúc test: `DH-2026-0002`, `DH-2026-0003`, `HD-2026-0010`, `BG-2026-0005` (dữ liệu test, nên dọn).

---

## 1. Tổng kết đối chiếu

| Yêu cầu | Nguồn | Kết quả |
|---|---|---|
| Đơn hàng nhiều dòng, một chứng từ | QT mục 6 | ✅ Đúng |
| Bán cửa theo m², phụ kiện tách món theo mét | QT mục 2.1 / GF-04, GF-06 | ✅ Đúng |
| Bảng giá chọn → server quyết giá, client không sửa được tiền | QT mục 2 / INV-02 | ✅ Đúng (trên Đơn hàng) |
| Giá bậc diện tích + công thức chia lá + BOM tự xổ | QT mục 3.1 | ✅ Đúng, có trace "vì sao ra con số này" |
| Thiếu giá thì báo lỗi, không fallback 0 | PA-02 / GF-F01 | ✅ Đúng (fail closed) |
| Xuất kho từ chối khi không đủ tồn | QT mục 2 | ✅ Đúng |
| Bán theo mét / tồn theo kg (hệ số quy đổi) | QT mục 4.2, 4.5 | ✅ Đúng (`Mét` → `Kg`, factor 1,419) |
| **Một câu trả lời giá: Báo giá == Đơn hàng** | **INV-01** | ❌ **Sai** — xem §2.1 |
| **Hoá đơn giữ đúng số tiền của đơn** | **INV-02, FL-03** | ❌ **Sai tiền** — xem §2.2 |
| **Chiết khấu ngoài chuẩn phải được duyệt mới ghi sổ** | **PA-14** | ❌ **Không có** — xem §2.3 |
| **Giữ chỗ tồn từ đơn hàng / tồn khả dụng** | **QT mục 5.2, 5.4** | ❌ **Chưa nối** — xem §2.4 |
| Sales Option (Có ray / Không ray / Trọn bộ / Tách món) chọn được trên chứng từ | PV-05, GF-01…06 | ❌ Không có ô chọn — biến thể suy ra ngầm từ mã hàng |
| Đơn hàng buộc có Kho xuất trước khi ghi sổ | — | ⚠️ Chặn muộn — xem §3 |

---

## 2. Lỗi chặn (blocker)

### 2.1 Báo giá và Đơn hàng dùng hai biến thể giá khác nhau → không tạo được báo giá cho cửa

Cùng mã `CDL_DLM_1LY`, cùng bảng giá `Alumdoor 2026`, cùng ĐVT `m2`:

- **Đơn hàng** giải giá qua `Alumdoor 2026:CDL_DLM_1LY:m2:**TRON_BO**:DT-8-9M2` → 540.000 đ/m². Chạy tốt.
- **Báo giá** giải giá qua variant `**STANDARD**` → lỗi:
  `Item Price Alumdoor 2026:CDL_DLM_1LY:m2 does not exist for variant STANDARD`

Hệ quả: **không lưu được báo giá nào có mặt hàng cửa trọn bộ**. Phụ kiện (ray, trục) thì báo giá chạy bình thường (RAY HỘP TD U76: 5,6 m × 175.000 = 980.000 ✓), nên đây là lỗi riêng của biến thể trọn bộ, không phải lỗi bảng giá.

Vi phạm **INV-01** (một câu trả lời giá cho cùng dữ kiện) và chặn toàn bộ GF-01…GF-08 vốn đều bắt đầu từ báo giá.

### 2.2 Hoá đơn tạo từ đơn hàng đánh rơi VAT

Đọc thẳng từ API:

| Chứng từ | total_amount | vat_rate | vat_amount | grand_total |
|---|---|---|---|---|
| `DH-2026-0001` | 2.360.000 | 8% | 188.800 | **2.548.800** |
| `HD-2026-0010` (tạo từ đơn trên) | — | *không có trường VAT* | — | **2.360.000** |

Hoá đơn thiếu **188.800 đ**. Doctype `Sales Invoice` không có trường VAT nào (`Object.keys` chỉ có `grand_total`, `outstanding_amount`), nên đây là thiếu ở tầng dữ liệu chứ không phải lỗi hiển thị. Công nợ phải thu sẽ thiếu đúng phần VAT.

Vi phạm **INV-02** (server sở hữu tiền, có tax trong danh sách bắt buộc) và **QO-04/FL-03**.

### 2.3 Cảnh báo "cần duyệt" chỉ là trang trí

Trên `DH-2026-0003` đặt chiết khấu 10% cho dòng ray. UI hiện đúng:
> `CK 10% khác chuẩn 0% — cần duyệt` · badge `1 dòng / thay đổi cần duyệt`

Nhưng bấm **Ghi sổ đơn** vẫn ghi thẳng, `docstatus = 1`. Kiểm tra document: `Sales Order` **không có trường approval/workflow_state nào**; cột "Trạng thái duyệt" trong danh sách hiển thị "Không cần duyệt" cho chính đơn này.

Vi phạm **PA-14** ("submit is denied when approval required") và **GF-F03/GF-F05**.

### 2.4 Giữ chỗ tồn chưa nối vào đơn hàng

Màn `Kho → Giữ chỗ tồn` có đúng mô hình mục 5.5 (mã nhôm · màu · **khổ tối thiểu** · số lá giữ · trạng thái), và báo cáo `Tồn nhôm theo khổ` đã có đủ cột `Tổng cây / Đã giữ / Khả dụng` — tức là mục 5 đã được thiết kế đúng.

Nhưng ghi sổ 3 đơn hàng **không sinh bản ghi giữ chỗ nào**; danh sách vẫn rỗng. Câu hỏi mục 5.4 ("giữ chỗ từ lúc nào?") vẫn chưa được chốt và chưa nối dây. Đúng trạng thái 🟡 *đã khai, chưa chứng minh*.

---

## 3. Lỗi thường

| # | Mô tả | Bằng chứng |
|---|---|---|
| 1 | `Tạo hoá đơn nháp` treo ~40 s rồi **tự reload trang, không báo lỗi, không tạo gì**. Lần chạy lại thì thành công. Số hoá đơn nhảy 0008 → 0010, nghi lần treo đã tiêu một số. | `alumdoor.sales.invoice_from_order` status `pending`, sau đó `get_app_manifest`/`get_boot` chạy lại |
| 2 | Đơn hàng ghi sổ được khi dòng **chưa có Kho xuất**; tới màn Phiếu giao hàng mới chặn `DH-2026-0003 dòng items-1 chưa có Kho xuất` | Chặn muộn — nên chặn ngay lúc ghi sổ |
| 3 | Lỗi lộ raw HTTP + tiếng Anh ra người dùng: `Không xem trước được FIFO kho (HTTP 417): Insufficient stock for CDL_DLM_1LY in K36`, `Valid till is required`, `Item Price ... does not exist for variant STANDARD` | i18n chưa phủ |
| 4 | Bảng preview `Đơn hàng → Hoá đơn` toàn tiếng Anh: `Sales order / Customer / Lines / Row id / Item name / Inventory mode / Measurement profile / Min area sqm / Width pb ray m / Set count` | |
| 5 | Cùng bảng đó tiêu đề ghi **"Dòng phiếu nhập sẽ tạo"** — đang tạo hoá đơn bán, không phải phiếu nhập | Sai từ nghiệp vụ |
| 6 | Gợi ý motor in số float thô: `vì cửa 8.959999999999999 m² < ngưỡng 15 m²` | Thiếu làm tròn |
| 7 | Màn Phiếu giao hàng: khi `Thời điểm giao` sai định dạng thì báo **"Không có Đơn bán còn phải giao"** thay vì chỉ ra lỗi ngày; sửa ngày xong đơn hiện ra ngay | Thông báo đánh lạc hướng |
| 8 | Trường `Báo giá có hiệu lực đến` bắt buộc nhưng **không có dấu \*** và nằm ở tab `Nâng cao`; báo giá cũng để `Bảng giá` ở tab phụ trong khi đơn hàng để ngay đầu form | Không nhất quán |
| 9 | Ghi sổ đơn trống chỉ hiện toast `Cần chọn khách hàng.`; ô Khách hàng không viền đỏ, không auto-focus | |
| 10 | Tab `Nâng cao` trên panel chi tiết Hoá đơn bấm không đổi tab | |
| 11 | Danh sách Kho xuất có `K36`, `Kho đầu thừa`, `Kho xưởng` — **thiếu `K12`** so với chuẩn kho production mục 0.1 | Cần rà lại chuẩn kho hoặc cập nhật tài liệu |
| 12 | Cảnh báo thường trực `Mặt hàng chưa gán quy cách kỹ thuật — CDL_DLM_1LY`, `Mặt hàng chưa có bộ quy cách hình học — RT_RAY_HOP_TD_U100`, `Chiều dài cây chuẩn chưa khai` nhưng vẫn cho ghi sổ | Dữ liệu danh mục còn thiếu |
| 13 | `run-local.log`: cài `alumdoor@2.10.0` **FAILED** — `HTTP 417: Custom field color collides with a standard field on Batch`. Metadata đang chạy là bản cũ hơn | Có thể là nguyên nhân gốc của một vài lệch trên |

---

## 4. Những chỗ làm tốt, nên giữ

- Panel **"CÒN THIẾU ĐỂ CHỐT ĐƯỢC DÒNG NÀY"** liệt kê đúng thiếu gì và sửa ở đâu (Danh mục → Bậc diện tích, Danh mục → Mặt hàng → …).
- Panel **"VÌ SAO RA CON SỐ NÀY"**: dòng giá, bậc diện tích, công thức cửa, rộng cắt lá, diễn giải phép tính, ghi chú giá. Đây gần như đã là bằng chứng mà PA-15 yêu cầu — chỉ cần nối vào báo giá nữa.
- Giá bậc diện tích chính xác ở biên: 9 m² rơi đúng bậc `DT-8-9M2`, 8,96 m² và 17,92 m² đều ra đúng tiền.
- BOM tự xổ và tự tính lại khi đổi kích thước/số lượng (ray 2,7 m, V4 3,17 m × 2, trục 3,15 m).
- Client không thể áp giá tay khi đã chọn bảng giá — gõ 111.000 vào Đơn giá bị bỏ qua.
- Gợi ý motor/bình lưu điện theo m² từng cánh và theo tải motor, có nêu lý do.
- Phiếu giao hàng gộp nhiều đơn một phiếu, có FIFO theo lô.
