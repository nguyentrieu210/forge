# E16 — Cut Order (Phiếu cắt nhôm)

> ## 🛑 SỬA CƠ CHẾ LÔ 2026-07-30
>
> Mọi chỗ dưới đây khai **`batch` là trường Link trên dòng** đều **SAI CƠ CHẾ**. Nền tảng dùng
> **`Serial and Batch Bundle`**: dòng chứng từ mang `serial_and_batch_bundle:Link(...)`, bundle liệt kê
> `batch_no` + `qty` từng lô. Bản nền tảng của `Stock Entry Detail` đã có sẵn trường tên đó — brief cũ
> khai đè rồi bỏ sót, và đó là gốc của quyển sổ thứ hai.
>
> Đọc [aluminium-batch.md](aluminium-batch.md) §đầu file để biết schema thật và cách sửa.
> Phần nghiệp vụ dưới đây **vẫn đúng** — chỉ đổi chỗ chứa lô.


> Doctype chứng từ · `naming: CN-.YYYY.-#####` · **submittable**
>
> Thay `Aluminium Cut` của bản cũ. Đây là nơi **kerf**, **đầu thừa** và **kg tiêu hao** lần đầu có chỗ ở.

---

## 1. Bản cũ có gì, thiếu gì

Đọc `Aluminium Cut` trong `briefs/alumdoor.json`:

```
lot:Link(Aluminium Lot)!  ·  cut_on:Datetime!  ·  customer:Link(Customer)
voucher_no:Data!  ·  cut_width_m:Float!  ·  sheets_cut:Float!
scrap_m:Float  ·  cut_state:Select(ĐÃ CẮT, ĐÃ HOÀN CẮT, ĐÃ TRẢ HÀNG)  ·  note
```

Doc-comment của nó viết đúng một điều quan trọng và V2 giữ nguyên tinh thần đó:
*"Giữ đủ để HOÀN được — đó là việc kế toán làm thật, không phải tính năng phụ."*

| # | Thiếu | Hệ quả thật |
|---|---|---|
| 1 | **Không ghi sổ kho** — chỉ trừ `sheet_count` trên doctype lô | Chính là quyển sổ thứ hai (QĐ-1). Cắt xong sổ kho không biết gì |
| 2 | **Không có kg tiêu hao** | P0 bản cũ ghi rõ: *"cắt mới trừ `sheet_count`; chưa nối sang kg"* |
| 3 | **Không có kerf** | 51 lá = 51 nhát × 2–4 mm |
| 4 | **Không sinh đầu thừa** — `scrap_m` chỉ là một con số | Nỗi đau #3: cắt xong đầu thừa biến mất khỏi mọi bảng, lần sau lại cắt cây mới |
| 5 | **Một phiếu = một lô** (`lot` là Link đơn) | Thực tế lấy nhiều khổ khác nhau; `.docx` ghi *"có thể chọn nhiều khẩu độ khác nhau, số lá và số lần cắt"* |
| 6 | `voucher_no` là **Data tự do** | Số chứng từ gõ tay thì không chống trùng được |

---

## 2. Bảng field V2

### 2.1 Đầu phiếu

| Field | Kiểu | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `name` | — | ✅ tự sinh | `CN-{YYYY}-{#####}` cấp lúc LƯU qua counter atomic | Huỷ **giữ số** |
| `cut_on` | Datetime | ✅ | không ở tương lai; **không thuộc kỳ đã khoá** → *"Kỳ kế toán tháng 6/2026 đã khoá"* | Thời điểm ghi sổ |
| `production_order` | Link(Production Order) | — | — | Cắt cho lệnh sản xuất nào (mốc giữ chỗ — A3) |
| `customer` | Link(Customer) | — | — | Truy ngược. `Customer` thuộc phân hệ thương mại (ngoài phạm vi V2) nhưng doctype vẫn còn |
| `so_reference` | Data | — | — | Số chứng từ đơn hàng của xưởng (thay `voucher_no` tự do) |
| `cutting_policy` | Link(Cutting Policy) | ✅ | phân giải theo `(door_type, ray_type, item_group)`; hai luật cùng ưu tiên → **TỪ CHỐI** | Luật tính rộng cắt + số lá |
| `items` | Table(Cut Order Item) | ✅ | ≥ 1 dòng | **Nhiều lô trong một phiếu** — sửa lỗi #5 |
| `cut_state` | Select(Đã cắt, Đã hoàn cắt, Đã trả hàng) | ✅ | mặc định `Đã cắt` | Giữ nguyên bản cũ |
| `cancel_reason` | Link(Lý do huỷ) | ✅ khi hoàn cắt/trả hàng | chip lý do, **không cho bỏ trống** | `screen-catalog` Kanban: bước lùi bắt buộc chọn chip lý do |

### 2.2 Dòng phiếu — `Cut Order Item`

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `consume_bundle` → `serial_and_batch_bundle` | Link(Serial and Batch Bundle) | ✅ | bundle chiều **`Outward`**; mỗi dòng bundle = một lô đem cắt. Nhân kiểm đủ tồn từng lô; V2 kiểm thêm khả dụng → *"Lô LO-2026-00042 chỉ còn 12 lá khả dụng (tổng 18, đã giữ chỗ 6)"* | ✅ **Bundle nhiều dòng hợp hoàn hảo với cắt nhiều lô** — 3 lô là 3 dòng, nền tảng tự tách 3 bút toán |
| `item_code` | Link(Item) | ✅ (tự điền từ batch) | — | — |
| `source_length_m` | Float | ✅ (tự điền từ batch) | — | Khổ cây đem cắt |
| `cut_width_m` | Float | ✅ | `≤ source_length_m` → *"Rộng cắt 4,10 m lớn hơn khổ cây 3,95 m — chọn lô khác"*; **máy chủ tính lại từ Cutting Policy và từ chối nếu lệch** | Rộng cắt lá |
| `sheets_cut` | Float | ✅ | `> 0`; số nguyên với ĐVT Lá | Số lá lấy ra |
| `cuts_count` | Int | ✅ (dẫn xuất) | — | **MỚI** — số nhát cắt, để tính kerf |
| `kerf_total_m` | Float | — (dẫn xuất, chỉ đọc) | — | **MỚI** — `kerf_mm × cuts_count ÷ 1000` |
| `kg_consumed` | Float | ✅ khi `item.has_catch_weight` | — | **MỚI** — kg tiêu hao, xem §3 |
| `kg_weighed` | Float | — | — | **MỚI** — kg cân thật lúc xuất, nếu xưởng có cân |
| `offcut_length_m` | Float | — (dẫn xuất) | — | `source_length_m − cut_width_m − kerf_total_m` |
| `offcut_bundle` | Link(Serial and Batch Bundle) | — (nhân tạo ra) | bundle chiều **`Inward`** ở **kho Đầu thừa** | **MỚI** — đầu thừa nhập lại là một chuyển động NGƯỢC chiều, nên cần bundle RIÊNG. Trống nếu mọi đầu thừa đều dưới ngưỡng phế |
| `scrap_m` | Float | — | — | Phần bỏ hẳn (dưới `scrap_threshold_m`) |
| `note` | Data | — | — | — |

---

## 3. Ba luật tính — viết ra để PHA 5 dịch máy móc

### 3.1 Kerf

```
kerf_total_m = measurement_profile.kerf_mm × cuts_count ÷ 1000
```

`kerf_mm` **đọc từ Measurement Profile**, không khai lại ở đây (một luật một chỗ).

### 3.2 Đầu thừa — và ngưỡng chặn

```
offcut = source_length_m − cut_width_m − kerf_total_m

nếu measurement_profile.scrap_threshold_m CHƯA khai:
    → TỪ CHỐI ghi sổ, báo: "Chưa khai ngưỡng đầu thừa cho «AL595» —
       hỏi chủ xưởng: đoạn ngắn hơn bao nhiêu mét thì bỏ hẳn?"

nếu offcut ≥ scrap_threshold_m:
    → TẠO batch mới: is_offcut = ✔, parent_batch = batch,
      cut_generation = batch.cut_generation + 1,
      length_m = offcut, giữ nguyên color + condition của lô mẹ
    → thêm một dòng vào `offcut_bundle` (Inward, kho ĐẦU THỪA)
nếu ngược lại:
    → scrap_m = offcut, KHÔNG tạo batch (ra khỏi tồn, bán phế theo kg)
```

Đây là chỗ nỗi đau #3 chết: đầu thừa **thành một lô có mã, có khổ, có kho** chứ không còn là một con số
trên phiếu rồi thôi.

### 3.3 Kg tiêu hao — theo tỉ lệ, cân thật thắng

```
kg_consumed = kg còn lại của batch × sheets_cut ÷ số lá còn lại của batch
```

**Nếu xưởng cân thật lúc xuất (`kg_weighed` có giá trị) thì số cân thắng tỉ lệ lý thuyết**, và chênh lệch
được ghi lại để soi. Nguyên tắc chung của cả app: **số người đo/đếm luôn thắng số máy suy ra.**

---

## 4. Ghi sổ — nơi QĐ-1 thành hiện thực

Một phiếu cắt sinh **HAI bundle ngược chiều nhau**, nền tảng tự tách thành bút toán:

| Bundle | Chiều | Kho | Bút toán sinh ra |
|---|---|---|---|
| `serial_and_batch_bundle` | **Outward** | kho chứa lô mẹ | mỗi lô một dòng: **− lá**, **− kg** |
| `offcut_bundle` | **Inward** | **kho Đầu thừa** | mỗi đầu thừa một dòng: **+ 1 cây**, **+ kg** |

### ✅ ĐÃ XÁC MINH 2026-07-30 — nền tảng đã có sẵn khuôn hai chiều

Đọc `clouderp-erpnext/src/controllers.ts` (Stock Entry, mục đích `Manufacture`): nó gọi
`buildTrackedStockLines` **HAI lần** và trả về `{stock, manufacturing, bundleUsages}`. Hai bundle nằm ở
**hai chỗ khác nhau**:

| Bundle | Khai ở | Chiều |
|---|---|---|
| `serial_and_batch_bundle` | **trên DÒNG** (`Stock Entry Detail`) | Outward — vật tư tiêu hao |
| `finished_good_bundle` | **trên ĐẦU PHIẾU** (`Stock Entry`) | Inward — thành phẩm nhập kho |

**Cắt nhôm có đúng hình dạng đó**: tiêu hao lô mẹ (nhiều lô ⇒ nhiều dòng bundle), sinh ra đầu thừa
(nhập lại kho Đầu thừa). ⇒ V2 copy nguyên khuôn: `serial_and_batch_bundle` trên dòng,
**`offcut_bundle` trên đầu phiếu**.

Không phải sáng tạo gì mới — chỉ là dùng lại khuôn nền tảng đã chứng minh chạy cho `Manufacture`.
Và `bundleUsages` khi huỷ được đảo bằng `usage_delta: -1`, nên hoàn cắt có sẵn đường lùi.

Giá vốn xuất lấy bằng replay FIFO **thu hẹp theo `batch_no`** ⇒ đúng giá của chính lô bị cắt.
Đầu thừa **thừa hưởng giá vốn** của lô mẹ theo tỉ lệ chiều dài — không sinh lãi/lỗ từ việc cắt.

**Hoàn cắt** = ghi `voucher_revision + 1` với bút toán đối dấu, **kèm đúng `kg_consumed` đã ghi lần đầu**,
không tính lại theo số hiện tại. Bản ghi cũ nằm nguyên. Đầu thừa đã sinh ra bị đảo theo.

**Trả hàng sau khi cắt** ≠ hoàn cắt: hàng đã thành lá khổ mới ⇒ **tạo lô khổ mới**, KHÔNG nhập lại khổ gốc.

---

## 5. Đề xuất lô để cắt — luật chọn

1. **Kiểm kho ĐẦU THỪA trước.** Chỉ khi không đầu thừa nào đủ dài mới đụng cây nguyên (chuẩn ngành:
   *"full bars are only transferred in if the floor remnants do not have bars of sufficient length"*).
2. Trong cùng nhóm, chọn lô có **khổ nhỏ nhất còn đủ dài** — giảm phế. Giữ nguyên luật bản cũ.
3. Lọc theo **mã · màu · tình trạng** khớp yêu cầu.
4. Bỏ qua phần **đã giữ chỗ** (E17) — chỉ đề xuất trong tồn khả dụng.
5. Không đủ → **từ chối kèm số lá còn thiếu**, không cắt một phần im lặng.

---

## 6. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | **Không xoá** — chứng từ kho; huỷ = hoàn cắt có lý do, giữ số |
| 3 | Audit | Mọi lần cắt/hoàn/trả ghi audit **cùng transaction** với bút toán sổ |
| 6 | Mã vạch | Áp dụng — quét tem lô để chọn `batch`, không gõ tay |
| 7 | **Kanban** | **Áp dụng** — `screen-catalog` bắt buộc kanban cho *"công đoạn sản xuất/gia công"*. Cột = Chờ cắt → Đang cắt → Đã cắt → Đã giao xưởng. Đổi cột mở **dialog chip lý do**; bước lùi/huỷ **bắt buộc** chọn chip |
| 8 | AI | Áp dụng — **Máy tính công thức cửa** xem trước rộng cắt + số lá + kg dự toán trước khi cắt thật |
| 10 | Ảnh | Tuỳ chọn — ảnh lá đã cắt khi có tranh chấp |
| 11 | In ấn | Áp dụng — **phiếu cắt A5, số đo in TO** (thợ đọc ngoài xưởng), có QR mở bản ghi |
| 13 | Mã tự sinh | Áp dụng — `CN-{YYYY}-{#####}`, cấp lúc lưu, huỷ giữ số |
| 18 | Lịch sử | Áp dụng — timeline của **lô mẹ** hiện đủ: cắt bao nhiêu lá, cho đơn nào, ra đầu thừa nào |
| 19 | Danh mục | Áp dụng — `cancel_reason` là danh mục (BRD §4.2) |

---

## 7. Test bắt buộc

| Việc | Test |
|---|---|
| Kerf | Cắt 51 lá từ cây 8,5 m, kerf 3 mm → `kerf_total_m = 0,153`; đầu thừa trừ đủ |
| Sinh đầu thừa | Cây 8,5 m cắt 4,1 m, kerf 0,003, ngưỡng 0,3 → sinh lô đầu thừa `4,397 m` ở kho Đầu thừa |
| Dưới ngưỡng | Đầu thừa 0,2 m < ngưỡng 0,3 → **không** tạo lô, ghi `scrap_m = 0,2` |
| Chưa khai ngưỡng | `scrap_threshold_m` trống → **từ chối ghi sổ** kèm câu hỏi cho chủ xưởng |
| Giá vốn đúng lô | Lô A @98k, lô B @105k; cắt lô B → bút toán xuất theo **105k** |
| Kg đồng thời | Cắt 10/40 lá của lô 200 kg → `kg_consumed = 50`; sổ giảm cả lá lẫn kg |
| Cân thật thắng | `kg_weighed = 47` → ghi 47, lưu chênh lệch −3 |
| Hoàn cắt | Hoàn → bút toán đối dấu **đúng `kg_consumed` cũ**; lô đầu thừa bị đảo; tồn về nguyên |
| Ưu tiên đầu thừa | Có đầu thừa 4,5 m và cây nguyên 8,5 m, cần 4,1 m → đề xuất **đầu thừa** |
| Không đủ | Cần 60 lá, khả dụng 40 → từ chối, báo *"thiếu 20 lá"*, không cắt một phần |
