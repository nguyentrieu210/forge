# ALUMDOOR — Kết quả test thủ công phân hệ MUA HÀNG trên UI (23/08/2026)

Môi trường: `http://localhost:5173`, tenant local, đăng nhập `dev@example.com`.
Test bằng trình duyệt như người dùng thật.

Đối chiếu với `docs/ALUMDOOR-MUA-HANG-HDSD.md` (bản hướng dẫn cho người ở xưởng) và
`docs/ALUMDOOR-QUY-TRINH.md` mục 4 (dòng MUA).

---

## 1. Tổng kết đối chiếu

| Yêu cầu | Nguồn | Kết quả |
|---|---|---|
| Cột nhôm trên đơn: kích thước · định mức kg/m · số cây · kg barem · màu · dập | HDSD §1 | ✅ Đủ, thêm Số bó và Số SO NCC |
| `Kg barem = kích thước × định mức × số cây` | HDSD §1 | ✅ `7,2 × 0,389 × 200 = 560,16` — khớp đúng ví dụ AL71 |
| `Thành tiền = kg barem × đơn giá` | HDSD §1 | ✅ `560,16 × 62.000 = 34.729.920 đ` |
| Đơn đặt **không có** kg thực cân | HDSD §1 | ✅ Không có cột đó |
| Ô "Theo báo giá NCC" và "Theo yêu cầu vật tư" trên đơn | HDSD §3, §4 | ✅ Có sẵn trên form |
| Một chuyến xe · nhiều dòng · nhiều đơn | HDSD §1 | ✅ Màn "Nhận hàng" làm được (khác cách — xem §3) |
| Báo cáo "Mua hàng theo nhà cung cấp" | HDSD §8 | ✅ 7 đơn / 12.600.000 đ — đúng |
| **Đặt mua nhôm cây** | **HDSD §1 — luồng chính** | ❌ **Không ghi sổ được** — xem §2.1 |
| **Báo cáo "Đơn mua chưa nhận đủ"** | **HDSD §8** | ❌ **Sai toàn bộ** — xem §2.2 |
| **Nút "Đơn mua → Phiếu nhập"** | **HDSD §1 "Hàng về"** | ❌ **Không có trên màn** — xem §2.3 |
| **Nút In "Đơn mua hàng ALUMDOOR"** | **HDSD §1** | ❌ Không có |
| Quy đổi ĐVT mua CÂY / bán MÉT, cột "Quy ra" | HDSD §2 | ❌ Hỏng — xem §2.1 và §2.4 |
| 8 chứng từ trên menu Mua hàng | HDSD mở đầu | ❌ Chỉ có 3/8 — xem §4 |
| 6 báo cáo mua hàng | HDSD §8 | ❌ Có 2/6 — xem §4 |
| Màn "Chụp ảnh → chứng từ mua" | HDSD §7 | ❌ Không có trên menu |

---

## 2. Lỗi chặn (blocker)

### 2.1 Không đặt mua được nhôm cây — hệ số quy đổi bị từ chối

Làm đúng theo HDSD §1: NCC `TIẾN ĐẠT` · mã `AL71` · màu `THÔ` · dài `7,2 m` · `200` cây ·
`Dập = Không` · đơn giá `62.000 đ/kg`. Màn tính đúng `Kg đặt 560,16` và
`Thành tiền 34.729.920 đ`. Bấm **Ghi sổ đơn** →

> `Dòng 1 (NHOM_AL71): hệ số quy đổi phải là 0.3570408454727221 theo Item, không nhập tuỳ ý trên chứng từ.`

Không đơn nào được tạo (danh sách vẫn đứng ở 7 đơn cũ). **Luồng chính của phân hệ đứng hẳn.**

Gốc rễ nằm ở danh mục — đọc thẳng `Item/NHOM_AL71`:

```json
{ "stock_uom": "Cây",
  "default_purchase_uom": "Kg",
  "uom_conversions": [
    { "uom": "Kg", "conversion_factor": "1.000000",
      "note": "ĐIỀN TẠM 1 ngày 2026-08-22 theo yêu cầu \"dùng được ngay\" —
               CHƯA CÂN, SỐ NÀY SAI. Phải thay bằng số cân thực tế trước khi tin tồn kho." } ] }
```

Bảng quy đổi đang khai **1 Kg = 1 Cây** và tự ghi chú là sai. Màn thì suy hệ số thật từ barem
(`1 / (7,2 × 0,389) = 0,357`), server so với Item rồi từ chối. Hai bên không thể khớp nhau
chừng nào Item còn hệ số cố định, vì **kg mỗi cây đổi theo chiều dài từng chuyến** — đúng
tình huống HDSD §2 mô tả ("cây 6 m thay vì 5,85 m") và HDSD nói rõ **"Hệ số trên dòng luôn
thắng bảng"**. Server đang làm ngược lại: cấm hệ số trên dòng.

> Cần chốt: nhôm cây thì hệ số Kg↔Cây là **thuộc tính của dòng chứng từ**, không phải của mặt
> hàng. Hoặc sửa server cho phép hệ số dòng, hoặc bỏ `stock_uom = Cây` cho nhóm nhôm.

### 2.2 Báo cáo "Đơn mua chưa nhận đủ" liệt kê cả đơn đã nhận đủ

Báo cáo hiện **7/7 đơn**, tất cả `Đã nhận 0,00%`. Nhưng đọc thẳng chứng từ thì cả 6 đơn có dữ
liệu đều `received_percentage = 100.00`, `status = To Bill`:

| Đọc từ | `received_percentage` của `DMH-2026-0009` |
|---|---|
| Document (`/api/resource/Purchase Order/DMH-2026-0009`) | **100.00** |
| List view (`metaforge.api.get_list_view`) | **0.00** |

Cùng một trường, hai đường đọc ra hai số. Cột "Đã nhận (%)" trên danh sách Đơn mua hàng cũng
sai theo. Hậu quả thực tế: thủ kho đi giục nhà cung cấp những đơn đã về đủ.

Thêm một lỗi dùng được ngay: báo cáo **không có cột mã đơn** — 7 dòng giống hệt nhau
(`TIẾN ĐẠT · 21/08/2026 · 1.800.000 đ · 0,00% · 0,00%`), không biết dòng nào là đơn nào.

### 2.3 Không có nút "Đơn mua → Phiếu nhập" và nút In

HDSD §1 "Hàng về" nói: *"Mở đơn mua → nút 'Đơn mua → Phiếu nhập'"*, và *"In gửi NCC: mở đơn →
In → Đơn mua hàng ALUMDOOR"*.

Mở `DMH-2026-0009` (đã ghi sổ), thanh nút chỉ có đúng hai nút: **Đóng** và **Tính lại**.
Không có nút tạo phiếu nhập, không có nút In. Người dùng phải tự sang màn khác và gõ lại.

### 2.4 Bảng tổng quan quy mọi thứ ra "cây" nên ra 0

Màn **Phiếu nhập mua → Tổng quan** của `TIẾN ĐẠT`:

```
Đơn mua 7,00 · Phiếu nhập 7,00 · Giá trị PO 12.600.000 đ     ← đúng
Đã đặt 0,00 cây · Đã nhận 0,00 cây · Còn phải giao 0,00 cây  ← sai
RT_RAYHOP · Không dập:  Đã đặt 0,00 · Đã nhận 0,00 · Kg barem 0,00 · Kg thực 700,00 · "Đã giao đủ"
```

`RT_RAYHOP` có `stock_uom = Kg`, mua theo `Kg`, chỉ có quy đổi `Mét ↔ Kg` — **không có đơn vị
"cây" nào**. Bốn ô KPI đang gắn nhãn "cây" cứng nên mặt hàng mua theo Kg luôn ra 0. Con số
đúng (`Kg thực 700,00`) thì nằm tận cột cuối bảng chi tiết.

Đây đúng kiểu hỏng mà HDSD §2 cảnh báo: *"sai thì không có gì báo"* — bảng vẫn xanh
"Đã giao đủ" trong khi ba con số chính đều là 0.

---

## 3. Lệch so với hướng dẫn (không sai, nhưng khác)

| # | HDSD nói | App làm |
|---|---|---|
| 1 | Trên **từng dòng** phiếu nhập có ô "Đơn mua của dòng này" | Màn Nhận hàng ghi *"Hệ thống tự trừ PO cũ nhất phù hợp"* — không cho chọn tay |
| 2 | Ô **Dập** mặc định `Không` | Mặc định `—` (trống), phải tự chọn |
| 3 | Menu 8 chứng từ theo thứ tự việc chạy | Menu 5 mục, thứ tự khác, có thêm 2 màn không nằm trong HDSD |
| 4 | Cột "Kích thước (chiều rộng)" | Nhãn trên UI là "Dài một cây/đoạn (m)" |

Riêng hai màn **"Nhập nhôm hàng loạt"** và **"Đối soát giao hàng NCC"** là *thêm* so với HDSD,
và màn "Theo dõi giao hàng nhà cung cấp" (4 tab: Tổng quan · Nhận hàng · Lịch sử & đối soát ·
Giá & hoá đơn) giàu hơn hẳn mô tả trong tài liệu. Tài liệu đang cũ hơn code ở phần này.

---

## 4. Thiếu màn hình và báo cáo

**Chứng từ có DocType nhưng không có lối vào trên menu Mua hàng** (kiểm bằng
`frappe.desk.form.load.getdoctype`, tất cả trả `200`):

| Chứng từ | DocType | Trên menu? |
|---|---|---|
| Yêu cầu vật tư | `Material Request` | ❌ |
| Yêu cầu báo giá | `Request for Quotation` | ❌ |
| Báo giá NCC | `Supplier Quotation` | ❌ (chỉ có action "Báo giá NCC → Đơn mua") |
| Hoá đơn mua | `Purchase Invoice` | ❌ |
| Giấy báo Nợ NCC | `Debit Note` | ❌ |
| Trả hàng NCC | — (`Purchase Return` trả `404`) | ❌ — chưa rõ dùng doctype nào |
| Chụp ảnh → chứng từ mua | — | ❌ |

**Báo cáo** — HDSD §8 liệt kê 6, hiện có 2:

| Báo cáo | Có? |
|---|---|
| Mua hàng theo nhà cung cấp | ✅ |
| Đơn mua chưa nhận đủ | ✅ nhưng sai số (§2.2) |
| So sánh báo giá NCC | ❌ |
| Yêu cầu vật tư theo tổ | ❌ |
| Giảm trừ theo nhà cung cấp | ❌ |
| Công nợ phải trả | ⚠️ nằm ở phân hệ Công nợ, không ở Mua hàng |

Bù lại có thêm 2 báo cáo ngoài HDSD: **Nhập kho theo nhà cung cấp**, **Lệch cân khi nhập**.

---

## 5. Lỗi thường

| # | Mô tả |
|---|---|
| 1 | Console error: `Each child in a list should have a unique "key" prop` — `AlumdoorPurchaseOrderItemsGrid.tsx:199` |
| 2 | Ô tìm mã hàng hiện kết quả của lần gõ trước (~1 s): gõ `AL71` ra `BOSTEC BỘ ĐIỀU KHIỂN`, `CHTAIWAN BỘ ĐIỀU KHIỂN`… rồi mới lọc đúng |
| 3 | Đơn cũ thuộc công ty `CÔNG TY TNHH INTERNATIONAL ALUMINUM APPLICATION`, đơn mới mặc định `ALUMDOOR` — hai công ty lẫn trong cùng một danh sách |
| 4 | Panel chi tiết đơn mua bị cắt bên phải, nút cuối bị hai icon panel che; phải mở toàn màn hình mới đọc hết |
| 5 | Toast lỗi hiện ở góc dưới-phải, ngay sát thanh nút — dễ bị bỏ qua như bên màn bán hàng |

---

## 6. Những chỗ làm tốt

- **Barem nhôm tính đúng tuyệt đối** và hiện ngay trên dòng: `Kg/m 0,389` đọc từ quy cách,
  `Kg đặt 560,16`, tổng `Số cây/lá đặt 200` · `Kg nhôm 560,16 kg`.
- Đơn đặt **không có ô kg thực cân** — đúng ranh giới "số đặt ≠ số đếm" của HDSD.
- Màn **Theo dõi giao hàng nhà cung cấp** gom đúng 4 câu hỏi của thủ kho: đã đặt · đã giao ·
  còn phải giao · đối soát giá; có ô Số phiếu giao và Người giao/lái xe.
- Bảng "Theo từng mặt hàng / quy cách" **tách theo mã + chiều dài + màu + dập**, ghi rõ
  *"không gộp nhầm chỉ vì cùng mã"* và *"Nguồn: chứng từ đã ghi sổ"*.
- Nút **"Kiểm tra cả chuyến"** cho soát trước khi ghi sổ.
- Ô **"Theo yêu cầu vật tư"** có sẵn trên đơn — nền cho luật "từ chối đặt quá số đã yêu cầu".
