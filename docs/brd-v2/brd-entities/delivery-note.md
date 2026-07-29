# E13 — Delivery Note (Phiếu xuất kho)

> ## 🛑 SỬA CƠ CHẾ LÔ 2026-07-30
>
> Mọi chỗ dưới đây khai **`batch` là trường Link trên dòng** đều **SAI CƠ CHẾ**. Nền tảng dùng
> **`Serial and Batch Bundle`**: dòng chứng từ mang `serial_and_batch_bundle:Link(...)`, bundle liệt kê
> `batch_no` + `qty` từng lô. Bản nền tảng của `Stock Entry Detail` đã có sẵn trường tên đó — brief cũ
> khai đè rồi bỏ sót, và đó là gốc của quyển sổ thứ hai.
>
> Đọc [aluminium-batch.md](aluminium-batch.md) §đầu file để biết schema thật và cách sửa.
> Phần nghiệp vụ dưới đây **vẫn đúng** — chỉ đổi chỗ chứa lô.


> Doctype chứng từ · `naming: PXK-.YYYY.-####` · **submittable** · child `Delivery Note Item`
>
> **Cửa giao tiếp #2.** Doc-comment bản cũ nói đúng vai trò của nó:
> *"Nhân kho TỪ CHỐI khi tồn không đủ — đó là chốt chặn kho âm."*

---

## 1. Bản cũ — phần tính m² đã rất tốt, giữ nguyên

Đọc `Delivery Note Item` thì phần thành phẩm cửa đã được suy nghĩ kỹ:

| Field | Vai trò |
|---|---|
| `sales_mode` Select(Trọn bộ, Tách món) | Hai cách bán, hai cơ sở rộng khác nhau |
| `has_butterfly_bracket` | Có bản bướm → đổi số trừ khi cắt |
| `mesh_height_m` | Cao lưới — cửa Lưới/Đài Loan dùng chiều cao khác |
| `formula_policy` (read-only) | **Ghi lại chính sách ĐÃ ÁP** cho dòng này |
| `width_basis` (read-only) | Ghi lại cơ sở rộng đã dùng |
| `cut_width_m` (read-only) | Rộng cắt lá máy chủ tính ra |
| `billable_area_sqm` (read-only) | Diện tích tính tiền máy chủ tính ra |
| `qty` read-only khi bán theo m² | Người bán **không gõ đè** được số m² |
| `customer_group` hidden, `fetch_from: customer.price_group` | Đại lý / Lẻ tự lấy từ khách, không cho người lập tự chọn |

Bốn trường read-only kia là một thiết kế **đúng và đáng giữ**: chúng ghi lại **máy chủ đã tính bằng luật
nào**, nên sau này soi lại chứng từ cũ vẫn biết nó ra số đó từ đâu — kể cả khi công thức đã đổi.

---

## 2. Thay đổi V2

| # | Việc | Vì sao |
|---|---|---|
| D1 | `against_sales_order`: **required → tuỳ chọn** | ✅ Chủ xưởng chốt 2026-07-30. Xưởng còn xuất mẫu, xuất đổi bảo hành, xuất nội bộ — không có đơn bán nào. Đây cũng là thứ gỡ va chạm phạm vi với QĐ-4 |
| D2 | `install_address`: **required → tuỳ chọn** | Nó `fetch_from: against_sales_order.install_address`. Bỏ bắt buộc đơn bán mà giữ bắt buộc địa chỉ lắp là chặn ở cửa sau |
| D3 | Thêm `issue_purpose` Select(Bán hàng, Xuất mẫu, Đổi bảo hành, Xuất nội bộ, Xuất gia công) | Bỏ ràng buộc đơn bán rồi thì phải biết **xuất để làm gì** — nếu không, phiếu không đơn trở thành lỗ hổng không ai giải thích được |
| D4 | Thêm **`serial_and_batch_bundle`** trên dòng (bundle chiều `Outward`) | QĐ-1. **KHÔNG phải trường `batch` Link** — lô nằm trong bundle, xem [aluminium-batch.md](aluminium-batch.md) §đầu file |
| D5 | Thêm `weight_kg` trên dòng | QĐ-2 catch weight — sổ ghi cả cây lẫn kg |
| D6 | `customer`: required → **tuỳ chọn khi `issue_purpose ≠ Bán hàng`** | Xuất nội bộ không có khách |

---

## 3. Field thêm — dòng phiếu

| Field | Kiểu | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `serial_and_batch_bundle` | Link(Serial and Batch Bundle) | ✅ khi `item.has_batch_no` | bundle chiều **`Outward`**; nhân tự kiểm từng dòng bundle: lô tồn tại, **chưa hết hạn**, đủ tồn (`tracking.ts:49-56`). V2 kiểm thêm **khả dụng** → *"Lô LO-2026-00042 chỉ còn 12 lá khả dụng (tổng 18, đã giữ chỗ 6)"* | Xuất từ những lô nào |
| `weight_kg` | Float | ✅ khi `item.has_catch_weight` | cùng dấu với `qty` | Kg xuất |

---

## 4. Ghi sổ

| Cột sổ | Giá trị |
|---|---|
| `batch_no` | lấy từ **từng dòng bundle** — xuất 3 lô là 3 bút toán |
| `actual_qty_micros` | **− `stock_qty`** |
| `actual_weight_micros` | **− `weight_kg`** |
| `valuation_rate_minor` | replay FIFO **thu hẹp theo batch** |

**Chốt chặn kho âm giữ nguyên** — tồn không đủ thì từ chối, không ghi sổ một phần. Và kiểm theo **khả
dụng** (đã trừ giữ chỗ E17), không phải tồn tổng: hàng đã hứa cho lệnh sản xuất thì không bán ra ngoài
được.

---

## 5. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | Không xoá — huỷ có lý do, giữ số |
| 3 | Audit | Cùng transaction với bút toán |
| 6 | Mã vạch | Áp dụng — quét tem lô để thêm dòng vào **bundle** |
| 7 | Kanban | Áp dụng — Nháp → Đã ghi sổ → Đã huỷ; huỷ bắt buộc chip lý do |
| 8 | AI | Áp dụng — cảnh báo dòng có **giá bán dưới giá vốn** |
| 10 | Ảnh | Áp dụng — **proof-of-delivery**: ảnh kiện hàng lúc xuất + ảnh tại điểm giao (`media-capture`: xử tranh chấp *"chưa nhận được hàng"*) |
| 11 | In ấn | Áp dụng — phiếu xuất **A5** + QR + khu chữ ký người giao / người nhận |
| 13 | Mã tự sinh | `PXK-{YYYY}-{####}` |
| 18 | Lịch sử | Áp dụng |
| 19 | Danh mục | `customer`, `warehouse`, `color`, `issue_purpose` là Link Field / danh mục |

---

## 6. Test bắt buộc

| Việc | Test |
|---|---|
| Xuất không đơn bán | `issue_purpose = Xuất mẫu`, `against_sales_order` trống → **ghi sổ được** |
| Vẫn chặn kho âm | Tồn 10, xuất 15 → 422, không ghi sổ một phần |
| Chặn theo khả dụng | Tồn 18, giữ chỗ 6, xuất 15 → **422** (khả dụng chỉ 12), dù tồn tổng đủ |
| Giá vốn đúng lô | Xuất lô B → giá vốn theo lô B |
| m² không gõ đè | Bán theo m², người lập sửa `qty` → bị chặn, máy chủ tính lại |
| Ghi lại luật đã áp | Sau khi ghi sổ, `formula_policy` + `width_basis` + `cut_width_m` đều có giá trị |
