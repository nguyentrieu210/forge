# E12 — Purchase Receipt (Phiếu nhập mua)

> ## 🛑 SỬA CƠ CHẾ LÔ 2026-07-30
>
> Mọi chỗ dưới đây khai **`batch` là trường Link trên dòng** đều **SAI CƠ CHẾ**. Nền tảng dùng
> **`Serial and Batch Bundle`**: dòng chứng từ mang `serial_and_batch_bundle:Link(...)`, bundle liệt kê
> `batch_no` + `qty` từng lô. Bản nền tảng của `Stock Entry Detail` đã có sẵn trường tên đó — brief cũ
> khai đè rồi bỏ sót, và đó là gốc của quyển sổ thứ hai.
>
> Đọc [aluminium-batch.md](aluminium-batch.md) §đầu file để biết schema thật và cách sửa.
> Phần nghiệp vụ dưới đây **vẫn đúng** — chỉ đổi chỗ chứa lô.


> Doctype chứng từ · `naming: PNM-.YYYY.-####` · **submittable** · child `Purchase Receipt Item`
>
> **Cửa giao tiếp #1** giữa lõi vật tư và chuỗi thương mại. Đây là nơi kg thực cân và số cây đếm được
> lần đầu bước vào hệ thống — sai ở đây thì mọi thứ phía sau sai theo.

---

## 1. Bản cũ ĐÃ ĐÚNG nhiều — giữ nguyên

Đọc `briefs/alumdoor.json` + `clouderp-core/src/controllers.ts:191-210`:

| Đã có | Giải quyết việc gì |
|---|---|
| `purchase_order` **trên DÒNG** (không phải đầu phiếu) | Một chuyến xe của NCC chở hàng của **hai đơn** vào **một phiếu**. Nhân đọc dòng trước, không có mới lấy đầu phiếu (`orderOf`) |
| Controller gom `byOrder` rồi kiểm **theo từng đơn** (`controllers.ts:207-209`) | Gom cả phiếu vào một đơn thì vừa từ chối nhầm, vừa cho lọt phần vượt của đơn kia |
| So sánh hạn mức bằng **đơn vị tồn** | Doc-comment: *"Đặt 20 CÂY rồi nhận 117 MÉT là nhận đúng đủ, không phải nhận vượt 97 lần"* |
| `item_code.link_filters = {is_purchase_item:1, disabled:0}` | Ô chọn chỉ hiện mặt hàng được mua — 300 mã gồm cả dịch vụ và phụ thu |
| `qty_bar` · `length_m` · `color` · `total_length_m` | Số cây, khổ, màu của nhôm đã có chỗ ghi |
| `actual_weight_kg` · `actual_kg_per_m` · `actual_kg_per_sqm` | Kg thực cân và TL trung bình theo đúng đơn vị vật lý để đối chiếu |
| `conversion_factor` · `stock_qty` · `valuation_rate` trên dòng | Hệ số của dòng **thắng** bảng ở Item — đúng, vì cây nhôm không phải lúc nào cũng 5,85 m |
| `warehouse` bắt buộc **trên dòng** | Nhân từ chối nếu thiếu |
| `grand_total` · `total_qty` | Người nhập soát được tổng ngay lúc gõ |

Thiết kế này tốt hơn hẳn ấn tượng ban đầu. V2 **không đập đi**, chỉ nối vào batch và nới đúng hai chỗ.

---

## 2. Thay đổi V2

| # | Việc | Vì sao |
|---|---|---|
| R1 | **Mỗi dòng nhôm sinh một `Batch`** (doctype nền tảng) + **một `Serial and Batch Bundle` chiều `Inward`**; dòng trỏ bundle qua `serial_and_batch_bundle` | QĐ-1 — hết quyển sổ thứ hai. Bản cũ có hook `lots-from-receipt.ts` làm dở việc này vì đã đánh rơi trường bundle lúc khai đè doctype |
| R2 | `actual_weight_kg` từ *"số đối chiếu, không vào sổ"* → **vào sổ** ở cột `actual_weight_micros` | QĐ-2 catch weight. Bản cũ ghi rõ trường này *"không thay đổi số lượng mua hay tồn kho"* — đúng với mô hình cũ, sai với mô hình mới |
| R3 | `qty` của nhôm đổi nghĩa: **số CÂY**, không phải kg | QĐ-2 — đơn vị tồn của nhôm là Cây/Lá |
| R4 | **Dung sai ±5%** khi đóng hạn mức đơn mua | Sổ yêu cầu 30/07: *"nhà máy có thể giao thiếu hoặc hơn số lượng cây là ±5%"*. Hiện `assertPurchaseRemaining` từ chối mọi phần vượt ⇒ **không lập nổi phiếu** |
| R5 | Ảnh bắt buộc: **hàng nhận + phiếu giấy NCC** | `media-capture-contract`: nhập kho là điểm chụp bắt buộc |
| R6 | Cảnh báo lệch cân | `|kg thực − kg barem| ÷ kg barem > weight_tolerance_pct` → cảnh báo vàng, **không chặn** |
| R7 | Cửa/tấm hiện trực tiếp **Cao · Rộng · Số cái/bộ · Tổng kg · TL thực kg/m²** | Người nhập không phải tính tay; `TL kg/m² = Tổng kg ÷ (Cao × Rộng × Số cái/bộ)`. Tách khỏi `kg/m` của nhôm cây |

---

## 3. Dung sai ±5% — luật chính xác

Đọc kỹ ví dụ chủ xưởng viết trong sổ yêu cầu 30/07 thì luật gồm **hai phần tách biệt**, dễ trộn lẫn:

### 3.1 Phân bổ FIFO — trừ ĐÚNG số đặt, không tràn theo dung sai

```
Ngày 1  đặt AL71 7,2 m × 200 cây   (barem 7,2 × 0,389 × 200 = 560,16 kg)
Ngày 2  đặt AL71 7,2 m × 100 cây   (280,08 kg)
Ngày 3  VỀ HÀNG        230 cây     (644,184 kg)

→ trừ đơn CŨ NHẤT trước: 200 cây cho ngày 1 (hết đơn)
→ 30 cây còn lại sang ngày 2
→ nhà máy CÒN NỢ 70 cây của ngày 2
```

Ba con số barem đều **kiểm đúng**: `khổ × kg/m × số cây`.

⚠️ **Dung sai KHÔNG dùng để tràn sang đơn sau.** Đơn ngày 1 nhận đúng 200 rồi mới sang ngày 2 — không
nhận 210 rồi mới tràn. Dung sai chỉ là **khoản dôi khi tất toán**, không phải khoản được nhận thừa.

### 3.2 Dung sai — áp lúc ĐÓNG số dư

```
Tổng đặt   = 300 cây      → dung sai 5% = 15 cây
Đã nhận    = 230 cây
Còn nợ     = 70 cây
→ chuyến cuối hợp lệ trong khoảng 55 … 85 cây
```

Vì 5% tuyến tính nên dung sai theo từng đơn (`5%×200 + 5%×100`) **bằng đúng** dung sai trên tổng
(`5%×300`) — hai cách chủ xưởng mô tả không mâu thuẫn nhau.

### 3.3 Sửa nhân

`assertPurchaseRemaining(context, po, lines, "Receipt")` hiện từ chối mọi `received > ordered`.

```
đã nhận + đang nhận  ≤  đã đặt                      → nhận, đơn còn mở
đã đặt < …           ≤  đã đặt × (1 + tolerance)    → nhận, đơn ĐÓNG, ghi chênh lệch
                     >  đã đặt × (1 + tolerance)    → TỪ CHỐI
```

Câu từ chối phải nói rõ số: *"Đơn DMH-2026-0076 đặt 200 cây, đã nhận 195, chuyến này 20 cây → vượt 15
cây so với mức cho phép (±5% = 10 cây). Sửa đơn mua hoặc tạo đơn mới."*

`tolerance_pct` khai ở **Settings theo nhà cung cấp** (mặc định 5), không hardcode — `operator-convenience`
#44: *"MỌI ngưỡng nghiệp vụ chỉnh được trong Settings"*.

Thiếu hàng thì **không tự đóng đơn** — nhà máy còn nợ cho tới khi người dùng chủ động tất toán.

---

## 4. Field thêm mới

### 4.1 Đầu phiếu

| Field | Kiểu | Bắt buộc | Nghiệp vụ |
|---|---|---|---|
| `goods_photo` | Attach Image | ✅ | **MỚI (R5)** — ảnh hàng nhận. Bất biến sau khi ghi sổ |
| `supplier_note_photo` | Attach Image | — | Ảnh phiếu giao giấy của NCC |

### 4.2 Dòng phiếu

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `height_m` | Float | ✅ với cửa/tấm | >0 → *"Cần nhập Cao lớn hơn 0"* | Cao thực nhận, đơn vị mét |
| `width_m` | Float | ✅ với cửa/tấm | >0 → *"Cần nhập Rộng lớn hơn 0"* | Rộng thực nhận, đơn vị mét |
| `set_count` | Int | ✅ với cửa/tấm | >0 → *"Số cái/bộ phải lớn hơn 0"* | Số tấm hoặc số bộ cửa |
| `actual_weight_kg` | Float | ✅ với nhôm; tùy chọn với cửa/tấm | nếu đã nhập thì >0 | Tổng kg thực cân |
| `actual_kg_per_m` | Float, read-only | — | nhôm: `Tổng kg ÷ (length_m × qty_bar)` | Chỉ dùng cho nhôm cây/lá |
| `actual_kg_per_sqm` | Float, read-only | — | cửa/tấm: `Tổng kg ÷ (height_m × width_m × set_count)`; server từ chối snapshot sai | TL thực theo diện tích, không nhập tay |

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `serial_and_batch_bundle` | Link(Serial and Batch Bundle) | ✅ khi `item.has_batch_no` | thiếu → `buildTrackedStockLines` **TỪ CHỐI submit** (`tracking.ts:29`) | **MỚI (R1)** — bundle chiều `Inward`, mỗi dòng bundle là một lô. Nhập một chuyến vào một lô ⇒ bundle 1 dòng. Tên trường **copy đúng của nền tảng**, đổi tên là mất kết nối |
| `condition` | Select(Thô, Đã sơn, Lỗi) | ✅ khi `profile.require_condition` | — | **MỚI** — chưa có ở bản cũ, mà bảng giá NCC phân biệt THÔ / MÀU chưa dập / MÀU đã dập |
| `is_stamped` | Check | — | — | **MỚI** — dập / chưa dập, quyết định bậc giá NCC |
| `theoretical_kg` | Float | — (dẫn xuất) | — | **MỚI** — `length_m × profile.theoretical_kg_per_m × qty_bar`, để so lệch cân |
| `weight_variance_pct` | Float | — (dẫn xuất) | — | **MỚI** — lệch quá ngưỡng thì cảnh báo vàng (R6) |

---

## 5. Ghi sổ

Mỗi dòng nhôm sinh **một bút toán** trên `stock_ledger_entries`:

Nhân **không** đọc trường lô trên dòng — nó đọc **bundle**, rồi tự tách một bút toán cho mỗi dòng bundle
(`tracking.ts:61-70`). Nhập vào một lô ⇒ bundle một dòng ⇒ một bút toán:

| Cột | Giá trị |
|---|---|
| `batch_no` | lấy từ **dòng bundle**, không từ dòng phiếu |
| `actual_qty_micros` | **+ `qty_bar`** (số cây đếm được) |
| `actual_weight_micros` | **+ `actual_weight_kg`** (kg thực cân) |
| `valuation_rate_minor` | `amount ÷ qty_bar` — giá vốn một cây |

**Chống chạy lặp:** khoá `(voucher_type, voucher_no, voucher_revision, line_key)` là PK của sổ ⇒ submit
lại không tạo bút toán hai lần. Thêm một lớp nữa của nền tảng: **bundle chỉ dùng được MỘT lần** (`isStockBundleUsed`, `tracking.ts:32`). Batch cũng phải idempotent: dòng đã có bundle thì dùng lại, không tạo lô mới.

**Huỷ phiếu:** ghi `voucher_revision + 1` đối dấu. **Từ chối huỷ nếu lô đã bị cắt** →
*"Lô LO-2026-00042 đã cắt 12 lá ở phiếu CN-2026-00007 — hoàn cắt trước rồi mới huỷ phiếu nhập."*

---

## 6. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | Không xoá — huỷ có lý do, giữ số |
| 3 | Audit | Cùng transaction với bút toán |
| 6 | Mã vạch | Áp dụng — quét mã hàng để thêm dòng; in tem lô sau khi ghi sổ |
| 7 | Kanban | Áp dụng — Nháp → Đã ghi sổ → Đã huỷ; huỷ **bắt buộc** chip lý do |
| 8 | AI | Áp dụng — **đọc ảnh bảng kê NCC → dòng hàng** (bản cũ đã có, giữ); gợi ý giá nhập lần trước + **cảnh báo giá lệch bất thường** |
| 10 | Ảnh | ✅ **bắt buộc** (R5) |
| 11 | In ấn | Áp dụng — phiếu nhập **A5** + QR + số chứng từ |
| 13 | Mã tự sinh | `PNM-{YYYY}-{####}`, cấp lúc lưu, huỷ giữ số |
| 18 | Lịch sử | Áp dụng — timeline phiếu và lô sinh ra |
| 19 | Danh mục | `supplier`, `warehouse`, `color`, `condition` là Link Field có "+ Thêm mới" |

---

## 7. Test bắt buộc

| Việc | Test |
|---|---|
| Sinh lô | Nhập 200 cây AL71 khổ 7,2 m màu THÔ → tạo **1 batch**, sổ có 1 bút toán `+200 cây / +560,16 kg` |
| Idempotent | Submit lại cùng phiếu → **không** tạo batch thứ hai, **không** nhân đôi bút toán |
| Gộp hai đơn | Một phiếu, dòng 1 trỏ đơn A, dòng 2 trỏ đơn B → hạn mức kiểm **riêng từng đơn** |
| Dung sai trong ngưỡng | Đơn 200 cây, nhận 210 → **ghi sổ được**, đơn đóng, ghi chênh lệch +10 |
| Dung sai vượt | Đơn 200 cây, nhận 215 → **từ chối**, câu lỗi nêu đủ số |
| FIFO không tràn | Đơn A 200 + đơn B 100, về 230 → A nhận **đúng 200**, B nhận 30, còn nợ B 70 |
| Lệch cân | 200 cây × 7,2 m, barem 0,389 → lý thuyết 560,16; cân thật 640 (+14%) → **cảnh báo vàng**, vẫn ghi được |
| TL thực cửa/tấm | Cao 2 m × Rộng 3 m × 4 bộ, Tổng kg 48 → `actual_kg_per_sqm = 2 kg/m²`; gửi API với 3 kg/m² → **từ chối** |
| Huỷ khi đã cắt | Lô đã cắt → huỷ phiếu nhập bị **từ chối** kèm số phiếu cắt |
