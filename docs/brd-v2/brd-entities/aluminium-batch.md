# E02 — Lô nhôm

> ## 🛑 SỬA LỚN 2026-07-30 — CƠ CHẾ TRONG FILE NÀY SAI, ĐỌC TRƯỚC KHI DÙNG
>
> Đọc `packages/clouderp-stock/src/tracking.ts` thì nền tảng **đã có sẵn** hai thứ mà file này bỏ qua:
>
> **1. Doctype `Batch` đã tồn tại** — `getMasterRecordData(tenant, "Batch", batch_no)`, có `expiry_date`
> (`tracking.ts:50-52`). Dựng thêm doctype `Aluminium Batch` riêng là **đẻ quyển sổ lô thứ hai** — đúng
> cái QĐ-1 sinh ra để diệt, chỉ đổi tên. ⇒ **Dùng `Batch` của nền tảng**, thêm trường riêng cho nhôm
> (màu · tình trạng · khổ · kg nhập · đầu thừa) qua Custom Field.
>
> **2. Lô KHÔNG nằm trên dòng chứng từ** — nó nằm trong **`Serial and Batch Bundle`**, một chứng từ
> submittable riêng: `item_code` · `warehouse` · `type` (Inward|Outward) · `entries[]` (mỗi dòng
> `batch_no` + `qty`). Dòng chứng từ chỉ trỏ `bundleName`.
>
> ⇒ Mọi chỗ trong file này (và ở [purchase-receipt.md](purchase-receipt.md), [cut-order.md](cut-order.md),
> [delivery-note.md](delivery-note.md), [stock-entry.md](stock-entry.md)) khai *"thêm trường `batch`
> Link trên dòng"* đều **SAI CƠ CHẾ**. Phải sửa thành: dòng mang `bundle`, bundle liệt kê lô.
>
> **Luật bundle phải tuân** (`tracking.ts:28-43`):
> - Item bật `has_batch_no` mà **thiếu bundle → submit BỊ TỪ CHỐI**
> - Bundle phải khớp **item + kho + chiều**, tổng lượng **bằng đúng** dòng chứng từ
> - Bundle **chỉ dùng được MỘT lần** (`isStockBundleUsed`)
> - Xuất: kiểm lô tồn tại, **chưa hết hạn**, và đủ tồn theo `getTrackedStockBalanceMicros`
> - `allow_negative_stock` bị **ép false** cho hàng theo lô — khớp bất biến của BRD
>
> **Điểm tốt:** bundle nhiều dòng hợp **hoàn hảo** với cắt nhiều lô — một phiếu cắt lấy từ 3 lô thì
> bundle có 3 dòng, nền tảng tự tách thành 3 bút toán sổ.
>
> ### Schema thật của nền tảng (đã đọc `migrations/tenant/0007_erpnext_core.sql`)
>
> ```
> Batch                        module Stock · autoname field:batch_id · KHÔNG submittable
>   batch_id:Data!             ← tên lô; V2 dùng LO-{YYYY}-{#####}
>   item:Link(Item)!  ·  manufacturing_date:Date  ·  expiry_date:Date  ·  disabled:Check
>
> Serial and Batch Bundle      module Stock · SUBMITTABLE · autoname SABB-.YYYY.-#####
>   item_code:Link(Item)!  ·  warehouse:Link(Warehouse)!
>   type:Select(Inward,Outward)!  ·  posting_at:Datetime!
>   entries:Table(Serial and Batch Bundle Entry)!  ·  total_qty:Float (read-only)
>
> Serial and Batch Bundle Entry   child
>   qty:Float!  ·  serial_no:Link(Serial No)  ·  batch_no:Link(Batch)
> ```
>
> ### 🔴 Vì sao bản cũ không bao giờ chạm tới cơ chế này
>
> Bản nền tảng của **`Stock Entry Detail` CÓ trường `serial_and_batch_bundle`** (Link → Serial and Batch
> Bundle), và `Stock Entry` có `finished_good_bundle`.
>
> Nhưng brief alumdoor **tự khai đè** bằng doctype tên khác — `Stock Entry Item` — **và bỏ mất trường
> đó**. Tương tự `Purchase Receipt Item`, `Delivery Note Item` cũng không có.
>
> ⇒ App đã **tự cắt đường nối tới cơ chế lô của nền tảng**, rồi phải tự dựng `Aluminium Lot` thay thế —
> và đó chính là gốc của quyển sổ thứ hai. Không phải nền tảng thiếu, mà là app khai đè rồi bỏ sót.
>
> **Sửa V2:** mọi doctype dòng có tồn (`Purchase Receipt Item`, `Delivery Note Item`, `Stock Entry Item`,
> `Cut Order Item`) phải khai `serial_and_batch_bundle:Link(Serial and Batch Bundle)` — copy đúng tên
> trường của nền tảng, vì `buildTrackedStockLines` đọc `request.bundleName` từ đó.
>
> **Lô nhôm V2 = `Batch` + Custom Field:** `color` · `condition` · `length_m` · `intake_kg` ·
> `is_offcut` · `parent_batch` · `cut_generation` · `received_warehouse` · `intake_note` · `photo`.
> Trường `expiry_date` sẵn có **không dùng** cho nhôm (nhôm không hết hạn) — để trống.
>
> ### ✅ QĐ-1 vẫn ĐÚNG và vẫn cần
>
> `buildTrackedStockLines` ghi **cùng một `valuation_rate_minor` cho MỌI dòng bundle** (`tracking.ts:65`)
> rồi chia giá trị theo tỉ lệ. Tức **giá vốn xuất vẫn tính theo (item, kho), vẫn bỏ qua lô** — đúng như
> QĐ-1 đã chỉ ra. Bundle giải quyết *ghi lô nào*, **không** giải quyết *tính tiền theo lô*.
>
> Phần còn lại của file (không lưu số lượng trên lô, kho đọc từ sổ, đầu thừa, catch weight) **vẫn đúng** —
> chỉ đổi chỗ chứa: từ doctype riêng sang `Batch` + Custom Field.

> Doctype · lưu JSON trong `master_records.data_json` · `naming: LO-{YYYY}-{#####}`
>
> **Đây là hiện thân của QĐ-1.** Bản cũ có doctype `Aluminium Lot` **tự giữ số lượng tồn**
> (`sheet_count`, `remaining_kg`) — tạo ra quyển sổ thứ hai song song với `stock_ledger_entries`, và
> toàn bộ nỗi đau #1 sinh ra từ đó. V2: batch chỉ giữ **DANH TÍNH**, số lượng **luôn tính từ sổ**.

---

## 1. Luật nền — đọc trước bảng field

> ### ❌ CẤM lưu số lượng tồn trên batch
>
> Không có trường `remaining_qty`, `sheet_count`, `remaining_kg` hay bất kỳ tên nào tương đương.
> Số lá còn lại và kg còn lại **luôn được tính bằng cách cộng `stock_ledger_entries` lọc theo `batch_no`**.
>
> Vì sao cứng rắn: một con số lưu ở hai nơi thì sớm muộn cũng lệch — đó là định luật, không phải lỗi
> lập trình. Bản cũ đã trả giá: 1.257 lô có `sheet_count` mà **0 lô** có `remaining_kg`, và phải viết
> hook `lots-from-receipt.ts` chỉ để cố nối hai quyển sổ.
>
> Muốn nhanh thì **cache có nguồn rõ ràng** (bảng tổng hợp dựng lại được từ sổ, như `Bin` của ERPNext),
> KHÔNG phải trường ghi tay trên batch. Cache sai thì dựng lại; sổ sai thì mất tiền.

**Batch = một chuyến hàng cụ thể của một mặt hàng.** Hai cây AL595 cùng khổ 7,2 m nhưng nhập hai lần,
hai giá, hai màu ⇒ **hai batch**. Cùng chuyến, cùng màu, cùng khổ ⇒ **một batch** dù 200 cây.

---

## 2. Bảng field

### 2.1 Danh tính

| Field | Kiểu (Forge) | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `batch_no` | Data | ✅ (tự sinh) | UNIQUE · cấp lúc LƯU qua counter atomic | Khoá nối vào `stock_ledger_entries.batch_no`. Huỷ phiếu **giữ nguyên số**, không tái dùng |
| `item_code` | Link(Item) | ✅ | `item.has_batch_no = ✔` → *"Mặt hàng «X» không quản lý theo lô — không tạo lô được"* | Mặt hàng của lô |
| `color` | Link(Item Color) | ✅ khi `profile.require_color` | phải nằm trong `item.allowed_colors` nếu có khai → *"Màu «X» không áp dụng cho mặt hàng này"* | **Màu sống ở đây, không nằm trong mã hàng** — nhờ vậy trả lời được cả *"còn bao nhiêu AL595 màu ghi sần"* lẫn *"còn tất cả bao nhiêu AL595"* |
| `condition` | Select(Thô, Đã sơn, Lỗi) | ✅ khi `profile.require_condition` | — | ⚠️ **Cần xác nhận Cổng 2** — nếu xưởng có thêm *đã dập / chờ sơn* thì phải chuyển thành danh mục (BRD §4.2) |
| `length_m` | Float | ✅ khi `profile.require_length` | `> 0` và `≤ 12` → *"Khổ phải lớn hơn 0 và không quá 12 m"* | **Khổ cây/lá — đơn vị MÉT.** Đây là `length_m`, KHÔNG phải `width_m` (rộng cửa). ⚠️ Bản cũ từng gộp hai cột và chọn sai bên: người nhập gõ khổ 8,5 vào ô rộng cửa, kg/m không bao giờ ra số |
| `received_warehouse` | Link(Warehouse) | ✅ | phải là **kho lá** → *"«Kho Alumdoor» là nút nhóm, không phát sinh tồn"* | ⚠️ **Kho NHẬP BAN ĐẦU — KHÔNG phải vị trí hiện tại.** Xem cảnh báo dưới |

> ### ❌ Batch KHÔNG giữ vị trí hiện tại
>
> **Sửa lại bản nháp trước của chính tài liệu này**, vốn khai `warehouse` như thể là kho đang chứa lô.
>
> `Stock Entry` có `source_warehouse`/`target_warehouse` **trên từng dòng**, nên một lô chuyển kho được,
> và mỗi bút toán sổ mang `warehouse` riêng. Nếu batch cũng giữ một trường kho thì hai chỗ sẽ lệch nhau
> **ngay lần chuyển kho đầu tiên** — đúng lỗi hai quyển sổ mà QĐ-1 sinh ra để diệt, chỉ ở quy mô nhỏ hơn.
>
> Một lô thậm chí có thể **nằm ở hai kho cùng lúc** (chuyển một phần). ERPNext giải bài này bằng cách để
> Batch **độc lập với kho**, còn tồn theo `(item, warehouse, batch)` đọc từ sổ. V2 làm y vậy:
>
> ```
> vị trí hiện tại của lô = GROUP BY warehouse trên stock_ledger_entries lọc batch_no
> ```
>
> `received_warehouse` chỉ để truy nguồn ("lô này nhập vào K36 ngày nào"), không dùng để tính tồn.

### 2.2 Nguồn gốc

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `source_voucher_type` | Select(Purchase Receipt, Cut Order, Stock Reconciliation) | ✅ | — | Lô sinh ra từ đâu: nhập mua · cắt (đầu thừa) · kiểm kê phát hiện thừa |
| `source_voucher_no` | Data | ✅ | chứng từ phải tồn tại và đã ghi sổ → *"Chứng từ nguồn «X» chưa ghi sổ"* | Truy ngược |
| `received_at` | Datetime | ✅ | không ở tương lai → *"Ngày nhập lô không thể ở tương lai"* | Dùng cho FIFO khi mặt hàng KHÔNG theo lô; với lô thì chỉ để tra cứu |
| `supplier` | Link(Supplier) | — | — | Tiến Đạt… — để đối chiếu công nợ hàng (E18) |
| `intake_kg` | Float | ✅ khi `item.has_catch_weight` | `> 0` → *"Lô nhôm phải có số kg thực cân"* | **Kg thực cân lúc nhập** — QĐ-2. Đây là nguồn tiền, không phải nguồn tồn |
| `intake_qty` | Float | ✅ | `> 0`, số nguyên khi ĐVT là Cây/Lá → *"Số cây phải là số nguyên"* | **Số cây/lá thủ kho ĐẾM** — nguồn tồn |

> **Hai con số này không suy ra nhau.** `intake_kg ÷ (length_m × kg/m)` sẽ ra `29,7` trong khi thợ đếm
> `30`. App ghi **cả hai như đã nhận**, rồi so lệch để cảnh báo — không bao giờ tính một cái từ cái kia.

### 2.3 Đầu thừa

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `is_offcut` | Check | — | — | Lô sinh ra từ phần dư sau khi cắt |
| `parent_batch` | Link(Batch) | ✅ khi `is_offcut` | không tự trỏ chính nó; không tạo vòng | Cắt từ lô nào ra — chuỗi truy ngược tới cây nguyên |
| `cut_generation` | Int | — | `≥ 0`, tự tăng theo `parent_batch` | Cây nguyên = 0; cắt lần 1 ra đầu thừa = 1… Cảnh báo khi vượt ngưỡng |

> **Đầu thừa nằm ở kho RIÊNG và bị LOẠI khỏi tồn khả dụng** (chuẩn ngành: Acumatica, CutWize) — MRP/
> đề xuất cắt chỉ nhìn kho chính. Trước khi xuất cây nguyên, hệ thống **bắt buộc kiểm kho Đầu thừa trước**;
> chỉ khi không đầu thừa nào đủ dài mới được đụng cây nguyên.

### 2.4 Trạng thái & ghi chú

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `stock_state` | Select(Tồn, Sắp hết, Hết) | — | **DẪN XUẤT — chỉ đọc, không cho gõ** | Tính từ số lượng còn lại của sổ so với ngưỡng trong `Measurement Profile`. ⚠️ Bản cũ để người gõ tay → 55 dòng "Sắp hết" mà không ai biết ngưỡng do đâu |
| `selected_for_cut` | Check | — | — | Thợ đánh dấu "chọn cắt" — gợi ý, không giữ chỗ. Giữ chỗ thật là E17 |
| `intake_note` | Small Text | — | max 500 | Nhập / ghi chú của thủ kho |
| `photo` | Attach Image | — | ≤ 10 MB, nén client ≤ 500 KB | `media-capture`: nhập kho **bắt buộc** ảnh hàng nhận + phiếu giấy NCC. Ảnh gắn chứng từ đã chốt là **bất biến** |

### 2.5 Trường DẪN XUẤT — tính từ sổ, không lưu

| Tên hiển thị | Tính thế nào |
|---|---|
| **Số lá còn lại** | `SUM(actual_qty_micros)` trên `stock_ledger_entries` lọc `batch_no` |
| **Kg còn lại** | `SUM(actual_weight_micros)` cùng bộ lọc |
| **Giá vốn còn lại** | replay FIFO **thu hẹp theo batch** — một batch nhập một lần ⇒ đúng một lớp ⇒ chính là **đích danh** |
| **Đã giữ chỗ** | `SUM` từ E17 khớp (mã · màu · tình trạng · khổ ≥ yêu cầu) |
| **Khả dụng** | Còn lại − Giữ chỗ |

---

## 3. State machine

`stock_state` là **dẫn xuất**, không phải trạng thái người bấm. Vòng đời thật của batch:

```
[Tạo từ chứng từ nguồn] → Tồn ──(xuất/cắt dần)──> Sắp hết ──> Hết
                            │
                            └──(cắt)──> sinh batch con is_offcut, cut_generation +1
```

- **Không có nút đổi trạng thái.** Muốn đổi số lượng thì lập chứng từ (`screen-catalog` mục Inventory:
  *"Không sửa trực tiếp số tồn nếu đã có lịch sử; dùng phiếu điều chỉnh"*).
- Batch `Hết` **không xoá** — giữ để truy ngược giá vốn và lịch sử cắt.

---

## 4. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | **Không xoá** dưới mọi hình thức khi đã có bút toán — batch là mắt xích truy ngược giá vốn |
| 3 | Audit | Đổi `warehouse`, `color`, `condition`, `length_m` ghi audit trước→sau. ⚠️ Chỉ cho đổi khi batch **chưa có bút toán nào**; có rồi thì phải qua Phiếu chuyển kho / điều chỉnh |
| 6 | Mã vạch | Áp dụng — mỗi batch in **tem QR** dán lên bó nhôm, quét ra thẻ lô |
| 7 | Kanban | **Không áp dụng** — batch không chảy qua giai đoạn; công đoạn nằm ở Cut Order (E16) |
| 8 | AI | Áp dụng — cảnh báo *"kg thực cân lệch >13% so với khổ × kg/m barem"* ngay lúc nhập |
| 10 | Ảnh | Áp dụng — ảnh hàng nhận, bất biến sau khi chốt |
| 11 | In ấn | Áp dụng — tem lô (khổ 35×22 mm) + thẻ kho A5 có QR |
| 13 | Mã tự sinh | Áp dụng — `LO-{YYYY}-{#####}`, cấp lúc lưu, huỷ giữ số |
| 18 | Lịch sử | Áp dụng — timeline: nhập → từng lần cắt (lấy bao nhiêu lá, ra đầu thừa nào) → hết |
| 19 | Danh mục | Áp dụng — `color`, `warehouse`, `supplier` là Link Field có "+ Thêm mới" |

---

## 5. Câu hỏi còn mở

| # | Câu hỏi | Chặn gì |
|---|---|---|
| B1 | Đầu thừa đời thứ mấy thì thôi không cắt tiếp? | `cut_generation` — chưa có ngưỡng cảnh báo |
| B2 | Thành phẩm cửa có theo lô không, hay chỉ nhôm? | Nếu có thì `has_batch_no` bật cho cả cửa — đổi phạm vi |
| B3 | `condition` có thêm giá trị nào ngoài Thô/Đã sơn/Lỗi? | Quyết định enum cứng hay danh mục (BRD §4.2) |
