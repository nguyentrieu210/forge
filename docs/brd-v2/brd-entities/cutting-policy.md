# E10 — Cutting Policy (Công thức cửa)

> Doctype danh mục · `naming: field:policy_name`
>
> **MỘT DÒNG = toàn bộ công thức của MỘT loại cửa**: rộng cắt lá, lượng tính tiền, và khối lượng mua dự
> toán. Ba kết quả khác nhau nhưng **phải xuất phát từ cùng một số đo** — đó là lý do nó không nằm trong
> Chính sách giá (giá chỉ trả ra đơn giá).

---

## 1. Đánh giá bản cũ — phần lớn ĐÃ ĐÚNG, giữ nguyên

Đọc `briefs/alumdoor.json` thì doctype này đã xử được nhiều thứ tưởng là thiếu. **Giữ nguyên, không đụng:**

| Đã có | Giải quyết việc gì |
|---|---|
| `dealer_width_basis` · `retail_width_basis` | Đại lý nhập rộng theo **PB nhựa**, khách lẻ theo **PB ray** — hai nhóm khách, hai cơ sở đo |
| `dealer_cut_deduction_m` · `retail_cut_deduction_m` | Số **mét trừ cố định** (không phải hệ số nhân) — đúng luật 0,02 / 0,08 |
| `butterfly_cut_deduction_m` | Bản bướm thay số trừ thường (Lưới/Đài Loan/Siêu Trường: 0,035) |
| `dealer_split_sales_basis` · `dealer_full_sales_basis` · `retail_sales_basis` | Tách món vs trọn bộ vs khách lẻ bán theo cơ sở rộng khác nhau |
| `manual_pull_sales_basis` | Ngoại lệ cửa Đài Loan kéo tay |
| `purchase_formula` + `purchase_height_basis` + `purchase_width_basis` | Cửa Đức mua theo **kg thực tế**; bốn dòng còn lại theo **barem kg/m²** với chiều cao/rộng riêng |
| `item_group` + `priority` | Nhóm hàng cụ thể ghi đè luật chung; **hai luật cùng mức ưu tiên → Worker TỪ CHỐI thay vì đoán** |

> Luật "từ chối thay vì đoán" ở đây là đúng và phải giữ nguyên trong V2 — nguyên văn lý do trong brief:
> *"vì đoán sai là cắt hỏng nhôm"*.

---

## 2. Bốn lỗ hổng — có bằng chứng

### 2.1 Không có chiều LOẠI RAY — hằng số trừ khác nhau theo ray

Sheet `GHI CHÚ` (file `MS LIÊN BS.xlsx`) ghi thẳng hai bộ hằng số:

| Dòng cửa | Ray **U75** | Ray **U100** |
|---|---|---|
| Đức | `RPBN = RPBR − 0,06` ⇒ **RCL = RPBR − 0,08** | `RPBN = RPBR − 0,07` ⇒ **RCL = RPBR − 0,09** |
| Đức theo RLL | `RPBR = RLL + 0,15` · `RPBN = RLL + 0,09` | `RPBR = RLL + 0,20` · `RPBN = RLL + 0,13` |
| Đài Loan + Lưới | `RCL = RLL + 0,11` | `RCL = RLL + **0,17**` |

Doctype hiện có **đúng một** `retail_cut_deduction_m` cho mỗi chính sách ⇒ không diễn tả được hai bộ.
Và `item_group` không dùng thay được, vì loại ray là lựa chọn **của từng đơn hàng**, không phải thuộc tính
của nhóm hàng.

**Sửa:** thêm `ray_type`, và khoá phân giải chính sách thành `(door_type, ray_type, item_group)` + `priority`.

### 2.2 Không có phần CHIA LÁ

Xác nhận từ chính tài liệu phiên trước: *"`Cutting Policy` đã có phần trừ bề rộng; phần **chia lá** thì
CHƯA ở đâu cả."* Ba công thức thật, lấy từ `25.7 QUY TRÌNH.docx` và sheet `GHI CHÚ`:

| Dòng cửa | Công thức số lá | Làm tròn |
|---|---|---|
| **Đức** | `(CPB − 0,13) ÷ bản lá − 1` | Luật "−1 lá" theo **ngưỡng 20,5** (dưới thì trừ, trên thì không). `AL71C` là ngoại lệ duy nhất không trừ |
| **Úc** | `(CPB ÷ 0,465) + k` · `k` = **2** (motor trong / kéo tay) · **1,5** (motor ngoài không tự dừng) · **1,3** (motor ngoài có tự dừng) | Làm tròn phần thập phân về nấc **{0 · 0,3 · 0,7 · 1}** — số lá là **số thập phân** |
| **Tấm liền Úc** (Đức kéo tay AL70) | `(CPB − 0,13) ÷ 0,068` | Khoá ngang ăn 1 lá *1 lớp*; mỗi hàng khe thoáng ăn thêm 1 lá *1 lớp* |

`CPB = CLL + 0,5 m` — cũng chưa có chỗ nào khai.

### ✅ Luật làm tròn — CHỦ XƯỞNG CHỐT 2026-07-29: ngưỡng **0,6**

**Trừ một lá TRƯỚC, làm tròn SAU** — đúng thứ tự này, không đảo:

```
1.  raw   = (CPB − leaf_height_deduction_m) ÷ bản lá
2.  after = raw − 1                          ← trừ một lá
3.  số lá = frac(after) ≥ 0,6  ?  ceil(after)   ← làm tròn LÊN
                               :  floor(after)  ← làm tròn XUỐNG
```

Kiểm bằng cả ba ví dụ trong `.docx` — khớp hết:

| CPB | bản lá | `raw` | `after` | frac | Số lá | Tài liệu ghi |
|---|---|---|---|---|---|---|
| 3,00 | 0,055 | 52,18 | 51,18 | 0,18 | **51** | *"52.18 – 1 = 51 lá"* ✓ |
| — | — | 52,6 | 51,6 | 0,60 | **52** | *"52.6 thì là 52"* ✓ |
| — | — | 52,4 | 51,4 | 0,40 | **51** | *"nếu <52.5 thì là 51"* ✓ |

Chính chỗ "trừ 1 rồi mới làm tròn" giải thích được vì sao `52,6` ra `52` chứ không ra `53` — thứ mà đọc
lướt tài liệu gốc rất dễ hiểu ngược.

⚠️ **Lệch với ghi chú "ngưỡng 20,5" trong sheet `GHI CHÚ`.** Ghi chú đó là ngưỡng **tuyệt đối** trên giá
trị (*"dưới 20,5 thì trừ lá, trên 20,5 không trừ"*), còn luật vừa chốt là ngưỡng trên **phần thập phân**.
Hai luật trùng nhau ở ví dụ của sheet (`raw = 20,877`: vừa > 20,5 vừa có `frac = 0,877 ≥ 0,6` → đều không
trừ) nhưng **rẽ nhau** ở các giá trị khác — vd `raw = 21,3` thì luật 20,5 nói *không trừ*, luật 0,6 nói
*trừ*. **Luật 0,6 thắng** theo lời chủ xưởng. Ghi lại đây để người sau đọc sheet không sửa ngược.

### 2.3 Không có kerf

Đã đưa vào `Measurement Profile.kerf_mm` (E04) — chính sách chỉ cần **đọc**, không khai lại.

### 2.4 `door_type` thiếu nhóm thứ 6

Hiện 5 giá trị. Sheet `1-Dong san pham` của tờ đối chiếu có nhóm **"Cửa tấm liền Úc"** (chứa
`CỬA ĐỨC KÉO TAY AL70 (1/2 LỚP)`, `CỬA ÚC KT/MTN`), và `.docx` dành hẳn một mục với công thức riêng.

---

## 3. Bảng field V2

### 3.1 Phân giải chính sách

| Field | Kiểu | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `policy_name` | Data | ✅ | UNIQUE | — |
| `door_type` | Select(Cửa Đức, Cửa Úc, Cửa Lưới, Cửa Đài Loan, Cửa Siêu Trường, **Cửa tấm liền Úc**) | ✅ | — | **+1 giá trị so với bản cũ** |
| `ray_type` | Select(U75, U100, Ray sắt U70, Không dùng ray) | ✅ | — | **MỚI** — chiều thứ hai của khoá phân giải |
| `item_group` | Link(Item Group) | — | trống = mọi nhóm của loại cửa | Ghi đè hẹp |
| `priority` | Int | — | mặc định 0 | **Hai luật cùng `(door_type, ray_type, item_group, priority)` → TỪ CHỐI** → *"Có 2 công thức cùng mức ưu tiên cho «Cửa Đức + U75». Sửa độ ưu tiên hoặc ngừng bớt một cái — hệ thống không đoán."* |
| `disabled` | Check | — | — | Ngừng áp dụng |

### 3.2 Chiều cao

| Field | Kiểu | Bắt buộc | Validate | Nghiệp vụ |
|---|---|---|---|---|
| `height_pb_offset_m` | Float | ✅ | mặc định **0,5** | **MỚI** — `CPB = CLL + offset` |

### 3.3 Rộng cắt lá — GIỮ NGUYÊN bản cũ

| Field | Bắt buộc | Nghiệp vụ |
|---|---|---|
| `dealer_width_basis` · `retail_width_basis` | ✅ | Cơ sở đo rộng khi nhập liệu |
| `dealer_cut_deduction_m` · `retail_cut_deduction_m` | ✅ | Số mét trừ cố định. Đức+U75: `0,02` / `0,08` |
| `butterfly_cut_deduction_m` | — | Có giá trị thì thay số trừ thường |

> ✅ **CHỦ XƯỞNG CHỐT 2026-07-29: khách lẻ trừ `0,08` m.**
> File `25.7 QUY TRÌNH.docx` ghi `0,06` là **chép nhầm** — `0,06` là khoảng cách giữa hai cách đo
> (`RPBN = RPBR U75 − 0,06`), không phải số trừ khi cắt. Sheet `GHI CHÚ` và bản cũ đều đúng.
> Ghi lại ở đây để người sau đọc `.docx` không sửa ngược lại.

### 3.4 Chia lá — MỚI

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `leaf_formula` | Select(Kiểu Đức, Kiểu Úc, Kiểu tấm liền Úc, Kiểu Đài Loan/Lưới) | ✅ **mọi loại cửa** | — | ✅ Chủ xưởng chốt 2026-07-29: **MỌI loại cửa đều chia lá** — bỏ lựa chọn *"Không chia lá"* |
| `leaf_height_deduction_m` | Float | ✅ khi `leaf_formula ≠ Không chia lá` | mặc định **0,13** | Số trừ khỏi CPB trước khi chia |
| `leaf_divisor_source` | Select(Bản lá của bộ quy cách, Hằng số của chính sách) | ✅ | — | Đức lấy **bản lá theo mã nhôm** (23 giá trị); Úc dùng hằng số `0,465` chung |
| `leaf_divisor_const` | Float | ✅ khi `leaf_divisor_source = Hằng số` | `> 0` | Úc `0,465` · Tấm liền Úc `0,068` |
| `leaf_rounding` | Select(Ngưỡng trừ-một-lá, Nấc 0/0.3/0.7/1, Làm tròn xuống) | ✅ | — | Đức dùng ngưỡng; Úc dùng nấc |
| `minus_one_threshold` | Float | ✅ khi `leaf_rounding = Ngưỡng trừ-một-lá` | mặc định **20,5** | Kết quả dưới ngưỡng ⇒ trừ 1 lá |
| `leaf_variants` | Table(Leaf Variant) | — | — | Úc: 3 biến thể theo loại motor |
| `exempt_items` | Table(Item) | — | — | Mã không áp luật trừ-một-lá — hiện chỉ `AL71C` |

**Child `Leaf Variant`:** `variant_label` (Motor trong / Motor ngoài không tự dừng / Motor ngoài có tự dừng)
· `addend` (2 / 1,5 / 1,3) · `note`.

### 3.5 Bán & mua — GIỮ NGUYÊN

| Field | Nghiệp vụ |
|---|---|
| `dealer_split_sales_basis` · `dealer_full_sales_basis` · `retail_sales_basis` · `manual_pull_sales_basis` | Cơ sở rộng để tính m² tính tiền |
| `purchase_formula` (Kg thực tế \| Barem kg/m2) + `purchase_height_basis` + `purchase_width_basis` | Đức = kg cân thực; bốn dòng còn lại = barem |

---

## 4. Ba kết quả từ một số đo — bất biến

Cùng `CLL`, `RLL` (hoặc rộng khai theo nhóm khách) phải sinh ra ba số **nhất quán**:

| Kết quả | Dùng ở |
|---|---|
| **Rộng cắt lá + số lá + kerf** | Phiếu cắt (E16) — thợ cắt theo |
| **m² tính tiền** | Dòng bán — khách trả theo |
| **kg mua dự toán** | Đơn mua — đặt NCC theo |

**Máy chủ tính lại cả ba và TỪ CHỐI payload ghi thẳng nếu lệch** — client chỉ xem trước. Giữ đúng cách bản
cũ đã làm cho phần rộng, mở rộng cho phần lá.

---

## 5. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 3 | Audit | Mọi thay đổi hằng số ghi audit trước→sau — đổi một số ở đây là đổi kích thước nhôm cắt ra của mọi đơn sau đó |
| 7 | Kanban | Không áp dụng |
| 8 | AI | Áp dụng — **Máy tính công thức cửa**: nhập CPB/RPB → xem trước rộng cắt, số lá, kg dự toán từ **đúng một luật** |
| 11 | In ấn | Áp dụng — in bảng công thức dán xưởng (số đo in TO) |
| 18 | Lịch sử | Áp dụng — phiên bản hằng số theo thời gian; chứng từ cũ giữ số đã dùng lúc lập |
| 19 | Danh mục | Chính nó là danh mục |

---

## 6. Câu hỏi còn mở

| # | Câu hỏi | Trạng thái |
|---|---|---|
| C2 | Khách lẻ trừ 0,06 hay 0,08? | ✅ **CHỐT `0,08`** (2026-07-29) — `.docx` ghi 0,06 là chép nhầm |
| C3 | Luật làm tròn số lá cửa Đức | ✅ **CHỐT: trừ 1 trước, làm tròn ngưỡng `0,6` sau** (2026-07-29) |
| C5 | Loại cửa nào chia lá? | ✅ **CHỐT: MỌI loại đều chia lá** (2026-07-29) |
| C1 | **Ray U100 dùng cho những dòng cửa nào?** | ⏳ chặn việc lập đủ bản ghi chính sách (trùng Q3 ở BRD) |
| C4 | `Ray sắt U70` (rộng cắt = `RPBR − 0,05`) áp cho dòng nào ngoài tấm liền Úc? | ⏳ chặn giá trị `ray_type` |
| C6 | Bản lá của **Lưới / Đài Loan / Siêu Trường** — sheet `GHI CHÚ` chỉ cho `CPB = số lá × 0,077` cho ĐL+Lưới, **không nói Siêu Trường**; và ba dòng này có trừ chiều cao `0,13` + trừ một lá như cửa Đức không? | ⏳ **mới phát sinh từ C5** — biết "mọi loại đều chia lá" rồi thì phải biết chia bằng hằng số nào |
