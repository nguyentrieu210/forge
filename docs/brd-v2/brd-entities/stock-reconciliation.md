# E15 — Stock Reconciliation (Kiểm kê kho)

> Doctype chứng từ · `naming: KK-.YYYY.-####` · **submittable** · child `Stock Reconciliation Item`
>
> **HOÀN TOÀN MỚI.** Đã grep: brief alumdoor không có, nền tảng Forge cũng không —
> `Bank Reconciliation` là đối soát ngân hàng, `document-kernel/reconciliation.ts` là đầu dò chỉ-đọc
> để giám sát. Kiểm kê tồn kho chưa từng tồn tại.

---

## 1. Vì sao bắt buộc phải có

**Pháp lý:** TT99/2025/TT-BTC (hiệu lực 01/01/2026, THAY Thông tư 200/2014) coi kiểm kê là nghĩa vụ, và **biên bản kiểm kê** là căn cứ quy trách nhiệm bảo
quản. Chênh lệch phải **phân loại nguyên nhân rồi mới hạch toán** — nên "nguyên nhân" là field bắt buộc,
không phải ô ghi chú tự do.

**Thực tế xưởng:** kế toán trong nghề nói thẳng — *"thợ cắt sai hoặc làm hỏng mà không báo"* → sổ và thực
tế lệch nhau. Không có kiểm kê thì lệch đó **không bao giờ được phát hiện**, chỉ tích tụ.

**Thị trường:** mọi phần mềm kho VN đều có kiểm kê. Không có là dưới chuẩn.

---

## 2. Luật nền

> **Kiểm kê KHÔNG sửa tồn trực tiếp.** Nó ghi *số đếm được*, hệ thống tự sinh **bút toán điều chỉnh** cho
> phần chênh. Sổ vẫn chỉ-thêm, không bao giờ bị ghi đè.
>
> (`screen-catalog-contract` mục Inventory: *"Không sửa trực tiếp số tồn nếu đã có lịch sử; dùng phiếu
> điều chỉnh"*.)

Và vì nhôm là catch weight, **đếm cả hai con số**: số cây/lá **và** kg.

---

## 3. Bảng field

### 3.1 Đầu phiếu

| Field | Kiểu | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `name` | — | ✅ tự sinh | `KK-{YYYY}-{####}` | Huỷ giữ số |
| `warehouse` | Link(Warehouse) | ✅ | kho lá, không phải nhóm | Kiểm kê từng kho |
| `scope` | Select(Toàn kho, Theo nhóm hàng, Theo mã hàng) | ✅ | — | Kiểm toàn bộ hay một phần |
| `item_group` / `item_code` | Link | ✅ theo `scope` | — | Phạm vi hẹp |
| `snapshot_at` | Datetime | ✅ | không ở tương lai; **không thuộc kỳ đã khoá** | **Thời điểm CHỐT SỐ SỔ** — xem §4 |
| `counted_by` | Link(User) | ✅ | — | Ai đếm |
| `witnessed_by` | Link(User) | — | ≠ `counted_by` → *"Người chứng kiến phải khác người đếm"* | Biên bản cần hai chữ ký |
| `status` | Select(Nháp, Đang đếm, Chờ duyệt, Đã ghi sổ, Đã huỷ) | ✅ | mặc định `Nháp` | Xem §6 |
| `note` | Small Text | — | — | — |

### 3.2 Dòng — `Stock Reconciliation Item`

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `batch` | Link(Aluminium Batch) | ✅ khi mặt hàng theo lô | — | Đếm **theo lô**, không gộp mã |
| `item_code` | Link(Item) | ✅ | — | — |
| `book_qty` | Float | ✅ (hệ thống điền, chỉ đọc) | — | Số sổ tại `snapshot_at` |
| `book_weight_kg` | Float | — (chỉ đọc) | — | Kg theo sổ |
| `counted_qty` | Float | ✅ | `≥ 0` → *"Số đếm không được âm"* | **Số đếm thực tế** |
| `counted_weight_kg` | Float | ✅ khi `item.has_catch_weight` | `≥ 0` | Kg cân thực tế |
| `variance_qty` | Float | — (dẫn xuất) | — | `counted_qty − book_qty` |
| `variance_weight_kg` | Float | — (dẫn xuất) | — | — |
| `variance_reason` | Link(Nguyên nhân chênh lệch) | ✅ **khi `variance_qty ≠ 0`** | không bỏ trống → *"Dòng AL548 lệch −3 lá — phải chọn nguyên nhân trước khi ghi sổ"* | Danh mục: Sai cân đo · Quên ghi · Hỏng/mất · Thợ cắt sai không báo · Khác |
| `variance_note` | Data | ✅ khi nguyên nhân là `Khác` | — | — |
| `photo` | Attach Image | — | — | Ảnh hiện trạng khi lệch lớn |

---

## 4. Chốt số sổ — chỗ dễ hỏng nhất

Đếm kho mất vài giờ, mà trong lúc đó vẫn có phiếu nhập/xuất chạy. Nếu so số đếm với số sổ **lúc bấm ghi
sổ** thì mọi giao dịch phát sinh giữa chừng đều biến thành "chênh lệch" giả.

```
1. Tạo phiếu → hệ thống CHỤP số sổ tại `snapshot_at` vào `book_qty` của từng dòng
2. Thợ đếm (có thể vài giờ, offline được)
3. Ghi sổ → so `counted_qty` với `book_qty` ĐÃ CHỤP, không đọc lại sổ
4. Bút toán điều chỉnh ghi tại `snapshot_at`, không phải giờ hiện tại
```

Nếu có giao dịch phát sinh **sau** `snapshot_at` thì cảnh báo lúc ghi sổ:
*"Có 3 phiếu phát sinh sau thời điểm chốt số. Số điều chỉnh vẫn tính theo mốc đã chốt — xem lại trước
khi duyệt."* — cảnh báo, **không chặn**, vì đó là chuyện bình thường.

---

## 5. Bút toán điều chỉnh

Mỗi dòng lệch sinh **một** bút toán trên `stock_ledger_entries`:

| Trường hợp | `actual_qty_micros` | `actual_weight_micros` | Giá vốn |
|---|---|---|---|
| **Thừa** (đếm > sổ) | `+ variance_qty` | `+ variance_weight_kg` | Giá vốn hiện hành của batch đó |
| **Thiếu** (đếm < sổ) | `− |variance_qty|` | `− |variance_weight_kg|` | Giá vốn hiện hành |

Dòng không lệch → **không sinh bút toán** (không tạo rác trong sổ).

Hạch toán phần chênh theo TT99/2025 phụ thuộc `variance_reason` — nhưng **sổ cái nằm ngoài phạm vi V2**, nên
V2 chỉ ghi sổ **kho** và lưu nguyên nhân đầy đủ để kế toán xử sau.

---

## 6. State machine

```
Nháp ──(chốt số sổ)──> Đang đếm ──(nộp)──> Chờ duyệt ──(duyệt)──> Đã ghi sổ
  │                        │                   │
  └────────────────────────┴───────────────────┴──(huỷ, bắt buộc lý do)──> Đã huỷ
```

| Trạng thái | Ai làm được | Sửa được gì |
|---|---|---|
| `Nháp` | Thủ kho, Chủ xưởng | Mọi thứ |
| `Đang đếm` | Thủ kho | Chỉ `counted_*`, `variance_reason`, ảnh |
| `Chờ duyệt` | — | Không sửa |
| `Đã ghi sổ` | — | **Bất biến.** Sai thì lập phiếu kiểm kê mới |
| `Đã huỷ` | — | Bất biến |

**Duyệt là bước riêng, không gộp vào ghi sổ** — người đếm không tự duyệt được chênh lệch của chính mình.
Ngưỡng bắt buộc duyệt khai trong Settings (mặc định: lệch > 5% hoặc > 10 lá).

---

## 7. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | Không xoá — huỷ có lý do |
| 3 | Audit | Cùng transaction với bút toán; ghi rõ ai đếm, ai duyệt |
| 4 | Báo cáo | Áp dụng — **Báo cáo chênh lệch kiểm kê** theo kỳ/kho/nguyên nhân: xưởng mất bao nhiêu, vì lý do gì |
| 6 | Mã vạch | Áp dụng — quét tem lô để nhảy dòng, đếm liên tục không cần chuột |
| 7 | Kanban | Áp dụng — cột = 5 trạng thái; huỷ **bắt buộc** chip lý do |
| 8 | AI | Áp dụng — badge cảnh báo dòng lệch bất thường; gợi ý nguyên nhân theo lịch sử lô |
| 10 | Ảnh | Áp dụng — ảnh hiện trạng khi lệch lớn |
| 11 | In ấn | ✅ **BẮT BUỘC — Biên bản kiểm kê A4**, có khu chữ ký người đếm + người chứng kiến + thủ trưởng, số chứng từ, QR. Đây là yêu cầu pháp lý, không phải tiện ích |
| 12 | Nhắc | Áp dụng — nhắc kiểm kê định kỳ theo lịch trong Settings |
| 13 | Mã tự sinh | `KK-{YYYY}-{####}` |
| 18 | Lịch sử | Áp dụng — timeline lô hiện các lần kiểm kê chạm vào nó |
| 19 | Danh mục | `variance_reason` là danh mục (BRD §4.2) |

---

## 8. Test bắt buộc

| Việc | Test |
|---|---|
| Chốt số sổ | Tạo phiếu (sổ = 100) → nhập thêm 20 → ghi sổ với đếm = 100 → chênh **0**, KHÔNG phải −20; kèm cảnh báo có phát sinh sau mốc |
| Bắt buộc nguyên nhân | Dòng lệch −3 mà `variance_reason` trống → 422 |
| Không lệch không ghi | Đếm = sổ → **không** sinh bút toán |
| Catch weight | Đếm 98 cây / 270 kg (sổ 100 / 280) → hai bút toán âm: `−2 cây`, `−10 kg` |
| Bất biến | `Đã ghi sổ` rồi sửa `counted_qty` → 422 |
| Tách vai | Người đếm bấm duyệt chính phiếu mình → 403 |
| Biên bản | In ra có đủ hai chữ ký, số chứng từ, QR, và **mọi dòng lệch kèm nguyên nhân** |

---

## 9. Câu hỏi còn mở

| # | Câu hỏi | Chặn gì |
|---|---|---|
| K1 | Kiểm kê **định kỳ bao lâu** — tháng, quý, hay khi thấy nghi? | Lịch nhắc trong Settings |
| K2 | Ai được duyệt chênh lệch — chỉ Chủ xưởng, hay Kế toán cũng được? | Ma trận quyền §6 |
| K3 | Ngưỡng lệch bắt buộc duyệt (mặc định đề xuất: >5% hoặc >10 lá) | Settings |
