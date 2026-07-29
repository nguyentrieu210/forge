# THIẾT KẾ KỸ THUẬT — ALUMDOOR V2 (PHA 3)

> Nền: [BRD.md](BRD.md) đã qua Cổng 2 · `ALUMDOOR-V2-PHA1-RESEARCH.md` §10 (QĐ-1…QĐ-4).
>
> **Luật của pha này** (`field-ledger.md`): *"Trường không có trong ledger = **không được code**. Muốn
> thêm trường = quay lại sửa ledger trước."* PHA 5 chỉ dịch máy móc ledger thành brief + controller.

---

## 1. Ledger của Forge khác AppWeb ở hai cột

Khuôn gốc 9 cột viết cho app D1 thuần. Với Forge phải đổi hai cột và **thêm một**:

| Cột gốc | Ở đây |
|---|---|
| 2. Kiểu D1 | ➜ **Kiểu Forge + Lưu ở đâu** — doctype lưu JSON (`master_records.data_json` / `documents.payload_json`); chỉ bảng **sổ** mới có cột SQL thật |
| 5. UI control | ➜ **fieldtype Forge** — `Data · Small Text · Select · Link · Table · Float · Int · Currency · Date · Datetime · Check · Attach Image`. Forge tự sinh control, không chọn component |
| — | ➕ **10. Nhân ĐỌC?** — ✅ kèm **dòng mã làm bằng chứng** / ⬜ chỉ để người xem |

> **Vì sao cột thứ 10 tồn tại:** Forge có kiểu hỏng đặc trưng — khai sai một tên trường thì lệnh ghi vẫn
> **THÀNH CÔNG** nhưng rơi về controller chung, **không sinh bút toán nào**, và không gì báo lỗi.
> **Không có bằng chứng = coi như chưa khai.**

Cột 4 (Zod) giữ nguyên tinh thần nhưng Forge validate bằng `validators` trong brief + controller — ghi
biểu thức để PHA 5 dịch.

---

## 2. LEDGER — `stock_ledger_entries` (bảng SQL, cần migration)

**Tầng:** cột SQL thật. Đổi cột = **phải viết migration**. Đây là quyển sổ duy nhất của tồn (QĐ-1).

| Field | Kiểu D1 | Ràng buộc | Validate + câu lỗi VN | Quyền | **Nhân ĐỌC?** | Nghiệp vụ |
|---|---|---|---|---|---|---|
| `tenant_id` | TEXT | PK, NOT NULL | — | hệ thống | ✅ `d1-store.ts:166` `WHERE tenant_id=?1` | Khách nào |
| `voucher_type` | TEXT | PK, NOT NULL | ∈ {Purchase Receipt, Delivery Note, Stock Entry, Stock Reconciliation, Cut Order} | hệ thống | ✅ PK sổ | Chứng từ nào sinh ra |
| `voucher_no` | TEXT | PK, NOT NULL | chứng từ tồn tại + `docstatus=1` | hệ thống | ✅ PK sổ | Số chứng từ |
| `voucher_revision` | INTEGER | PK, NOT NULL | tăng khi sửa/đảo | hệ thống | ✅ PK sổ | Cho phép đảo bút toán **không xoá dòng cũ** |
| `line_key` | TEXT | PK, NOT NULL | duy nhất trong chứng từ | hệ thống | ✅ `tracking.ts:62` sinh `${lineKey}-${row_id}` | Dòng thứ mấy |
| `item_code` | TEXT | NOT NULL, FK→Item | `is_stock_item` → *"«X» không phải hàng tồn kho"* | hệ thống | ✅ `valuation.ts:37` | — |
| `warehouse` | TEXT | NOT NULL, FK→Warehouse | kho **lá** → *"«Kho Alumdoor» là nút nhóm, không phát sinh tồn"* | hệ thống | ✅ `valuation.ts:37` | — |
| `batch_no` | TEXT | nullable, FK→Batch | **BẮT BUỘC khi `item.has_batch_no`** → *"Mặt hàng «X» quản lý theo lô — phải chọn lô"* | hệ thống | ⚠️ **GHI ✅ / ĐỌC ❌** — `tracking.ts:68` ghi vào; `valuation.ts:37` **KHÔNG lọc theo nó**. Đây chính là QĐ-1 | Mắt xích lô ↔ sổ |
| `actual_qty_micros` | INTEGER | NOT NULL | `≠ 0`; âm = xuất | hệ thống | ✅ `valuation.ts:95` `entry.actual_qty_micros` | Số lượng theo `item.stock_uom` — nhôm là **Cây/Lá** (QĐ-2) |
| **`actual_weight_micros`** | INTEGER | **MỚI**, nullable | BẮT BUỘC khi `item.has_catch_weight`; **cùng dấu** `actual_qty_micros` → *"Mặt hàng cân theo kiện phải ghi khối lượng"* | hệ thống | ❌ **chưa ai đọc — phải viết** | **Kg thực cân** (QĐ-2). Nguồn cho giá vốn và công nợ NCC |
| `valuation_rate_minor` | INTEGER | NOT NULL, `≥ 0` | — | Sản xuất **KHÔNG** đọc | ✅ `valuation.ts:99` | Giá vốn một đơn vị tồn |
| `stock_value_difference_minor` | INTEGER | NOT NULL | — | Sản xuất **KHÔNG** | ✅ `valuation.ts:97-98` | Ảnh hưởng lên sổ cái |
| `qty_scale` | INTEGER | NOT NULL, `=6` | CHECK cứng | hệ thống | ✅ schema CHECK | Micros — cố định |
| `currency_scale` | INTEGER | NOT NULL, 0–6 | — | hệ thống | ✅ `valuation.ts:47` | VND scale 0 |
| `currency` | TEXT | NOT NULL | `=VND` | hệ thống | ⬜ | — |
| `posting_at` | TEXT | NOT NULL | ISO; **không thuộc kỳ đã khoá** → *"Kỳ kế toán tháng 6/2026 đã khoá — không ghi sổ lùi ngày được"* | hệ thống | ✅ `valuation.ts:93` sort theo nó | Thứ tự replay giá vốn |
| `serial_no` | TEXT | nullable | không dùng ở V2 | — | ✅ `tracking.ts:68` | — |
| `allow_negative_stock` | INTEGER | NOT NULL, 0/1, DEFAULT 0 | bật cần quyền Chủ xưởng | Chủ xưởng | ✅ `tracking.ts:69` — **ép `false` cho hàng theo lô** | Tồn âm là lỗi, không phải tuỳ chọn |

### 2.1 Migration cần viết (văn bản — PHA 3 KHÔNG chạy)

```sql
-- 00XX_alumdoor_v2_catch_weight.sql
ALTER TABLE stock_ledger_entries ADD COLUMN actual_weight_micros INTEGER;

CREATE INDEX IF NOT EXISTS idx_sle_batch_valuation
  ON stock_ledger_entries(tenant_id, item_code, warehouse, batch_no, posting_at);
```

**An toàn:** cột nullable ⇒ dòng cũ để NULL. Tenant `alu` hiện **0 dòng sổ** nên không có dữ liệu cũ để lo
— đúng lúc thuận lợi hiếm có để đổi schema sổ.

### 2.2 Sửa mã cần viết

> ⚠️ **VIẾT LẠI 30/07 sau rà soát** — bản đầu **thiếu 7 chỗ** và **bỏ sót hẳn một lỗi tiền**.
> Chi tiết: [DEFECTS.md](DEFECTS.md) D1 · D2 · D4.

**Nhóm M1 — catch weight phải tồn tại THẬT, không chỉ trong migration (D2):**

| # | File | Sửa gì |
|---|---|---|
| M1a | migration mới | `ALTER TABLE stock_ledger_entries ADD COLUMN actual_weight_micros INTEGER` + index batch |
| **M1b** | `contracts/src/index.ts` | thêm `actual_weight_micros?: number` vào `StockLedgerEntry` — **hiện KHÔNG có** |
| **M1c** | `document-kernel/src/d1-store.ts:628` | thêm cột vào **INSERT** và vào **SELECT** của `getStockLedgerHistory` |
| **M1d** | `clouderp-stock/src/tracking.ts:7` | `TrackedStockRequest.weightMicros`; chia theo tỉ lệ từng dòng bundle **y như `stockValueMinor`**, dòng cuối nhận phần dư để không lẹm làm tròn |
| **M1e** | `in-memory-store.ts` | cùng trường — lệch với D1 store là **test xanh giả** |

> Thiếu M1b–M1e thì chạy migration xong **mọi bút toán mới vẫn NULL**. Cột có mà không ai ghi.

**Nhóm M2 — `rate` phải nói rõ đơn vị (D1, lỗi TIỀN):**

| # | File | Sửa gì |
|---|---|---|
| **M2a** | brief `Purchase Receipt Item` | thêm **`rate_uom:Link(UOM)`** — mặc định `weight_uom` khi item catch-weight, ngược lại `stock_uom`. **Không có đơn vị ngầm** |
| **M2b** | `clouderp-core/src/controllers.ts:221` · `:239` | `value` = `qty × rate` **chỉ đúng khi `rate_uom == stock_uom`**. Catch-weight: `value = actual_weight × rate`, rồi `valuation_rate_minor = value ÷ qty_bar` |
| **M2c** | validator | `rate_uom` trống mà item catch-weight → **TỪ CHỐI**, không đoán |

> **Vì sao đây là lỗi nặng nhất:** nhập 200 cây / 1.200 kg / 100.000 đ/kg ra **20 triệu** thay vì
> **120 triệu** — sai 6 lần, sổ vẫn cân. Doc-comment ngay trên `controllers.ts:219` đã cảnh báo đúng
> họ lỗi này (*"117 mét × giá-một-cây, tồn kho phình gần sáu lần"*) mà thiết kế V2 vẫn đi qua.

**Nhóm M3 — định giá thu hẹp theo lô:**

| # | File | Sửa gì |
|---|---|---|
| M3a | `document-kernel/src/store.ts:22` | `getStockLedgerHistory(..., batchNo?)` — mô phỏng `getTrackedStockBalanceMicros` dòng 21 vốn đã có tham số này |
| M3b | `d1-store.ts:163` | `AND (?4 IS NULL OR batch_no=?4)` |
| M3c | `in-memory-store.ts:134` | điều kiện lọc tương ứng |
| M3d | `clouderp-stock/src/valuation.ts:32` | `deriveOutgoingValuation` nhận `batchNo` |
| M4 | `valuation.ts:18` | `normalizeValuationMethod` — giá trị lạ **TỪ CHỐI** |

**Nhóm M5 — phạm vi VIẾT LẠI (D4):**

Bản đầu chỉ ghi `tracking.ts:65`. **Sai chỗ.** Gốc nằm ở caller: nó tính giá cho **cả dòng** rồi mới
đưa xuống bundle — `clouderp-selling/src/controllers.ts:217` và `clouderp-erpnext/src/controllers.ts:104`.

**Chốt cách B: nạp bundle TRƯỚC, định giá TỪNG batch.**

```
caller: đọc bundle → với mỗi entry { batch_no, qty }:
          deriveOutgoingValuation({ itemCode, warehouse, batchNo, qtyMicros })
        → dựng SLE riêng cho entry đó
```

| # | File | Sửa gì |
|---|---|---|
| M5a | `clouderp-selling/src/controllers.ts:217` | nạp bundle trước, gọi định giá theo từng batch |
| M5b | `clouderp-erpnext/src/controllers.ts:104` | như trên cho Stock Entry |
| M5c | `clouderp-stock/src/tracking.ts:65` | nhận **mảng** giá theo entry thay vì một `valuationRateMinor` chung |

> ❌ **Cách A đã LOẠI** (mỗi dòng chứng từ chỉ một batch): nó phá chính lý do dùng bundle — cắt từ 3 lô
> phải tách thành 3 dòng chứng từ, mất khớp với thực tế xưởng.

### 2.3 State machine — sổ không có trạng thái

Sổ **chỉ INSERT**. "Sửa" = `voucher_revision + 1` với bút toán đối dấu; dòng cũ nằm nguyên.
Không có `UPDATE`, không có `DELETE` — và nền tảng **ép ở tầng biên dịch**: chữ `d` bị compiler từ chối
(`compile-brief.mjs`, xem BRD §6.0).

---

## 3. LEDGER — `Batch` + Custom Field (doctype nền tảng)

**Tầng:** doctype, lưu JSON trong `master_records.data_json`. **KHÔNG dựng doctype mới** — dùng `Batch`
của nền tảng (module Stock, `autoname: field:batch_id`).

### 3.1 Trường sẵn có của nền tảng

| Field | Kiểu | V2 dùng thế nào | Nhân ĐỌC? |
|---|---|---|---|
| `batch_id` | Data! | mã lô — V2 cấp `LO-{YYYY}-{#####}` | ✅ `tracking.ts:50` |
| `item` | Link(Item)! | mã nhôm | ✅ |
| `expiry_date` | Date | **KHÔNG dùng** — nhôm không hết hạn, để trống | ✅ `tracking.ts:52` chặn lô hết hạn |
| `manufacturing_date` | Date | không dùng | ⬜ |
| `disabled` | Check | ngừng dùng lô | ⬜ |

### 3.2 Custom Field V2 thêm vào `Batch`

| Field | Kiểu Forge | Bắt buộc | Validate + câu lỗi VN | Autofill | Quyền | Nhân ĐỌC? | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `color` | Link(Item Color) | ✅ khi `profile.require_color` | phải nằm trong `item.allowed_colors` → *"Màu «X» không áp dụng cho mặt hàng này"* | từ dòng phiếu nhập | mọi role `r` | ❌ app tự đọc | **Màu sống ở lô, không trong mã** |
| `condition` | Select(Thô, Đã sơn, Lỗi) | ✅ khi `profile.require_condition` | — | từ dòng phiếu nhập | mọi role `r` | ❌ app | Sơn và dập là **hai chiều độc lập** |
| `is_stamped` | Check | — | — | từ dòng phiếu nhập | mọi role `r` | ❌ app | Dập/chưa dập — quyết định bậc giá NCC |
| `length_m` | Float | ✅ khi `profile.require_length` | `> 0` và `≤ 12` → *"Khổ phải lớn hơn 0 và không quá 12 m"* | từ dòng phiếu nhập | mọi role `r` | ❌ app | **Khổ** — `length_m`, KHÔNG phải `width_m` (rộng cửa) |
| `intake_kg` | Float | ✅ khi `item.has_catch_weight` | `> 0` → *"Lô nhôm phải có số kg thực cân"* | từ dòng phiếu nhập | Sản xuất **KHÔNG** | ❌ app | Kg thực cân lúc nhập |
| `received_warehouse` | Link(Warehouse) | ✅ | kho **lá** | từ dòng phiếu nhập | mọi role `r` | ❌ app | ⚠️ **Kho NHẬP BAN ĐẦU** — vị trí hiện tại đọc từ sổ (`GROUP BY warehouse`) |
| `is_offcut` | Check | — | — | nhân đặt khi cắt | mọi role `r` | ❌ app | Lô sinh từ phần dư |
| `parent_batch` | Link(Batch) | ✅ khi `is_offcut` | không tự trỏ, không tạo vòng | nhân đặt | mọi role `r` | ❌ app | Truy ngược tới cây nguyên |
| `cut_generation` | Int | — | `≥ 0`; **cảnh báo khi > 3** | `parent.cut_generation + 1` | mọi role `r` | ❌ app | Không giới hạn đời — giới hạn bằng độ dài (B1) |
| `intake_note` | Small Text | — | max 500 | — | mọi role `r` | ⬜ | Ghi chú thủ kho |
| `photo` | Attach Image | — | ≤ 10 MB, nén ≤ 500 KB | — | mọi role `r` | ⬜ | **Bất biến** sau khi chốt |

### 3.3 ❌ TRƯỜNG CẤM ĐẶT LÊN `Batch`

| Cấm | Vì sao |
|---|---|
| `remaining_qty` · `sheet_count` · `remaining_kg` | QĐ-1 — số lượng **luôn** cộng từ sổ. Lưu ở hai nơi là lệch, đó là định luật |
| `warehouse` (vị trí hiện tại) | Lô chuyển kho được, thậm chí nằm hai kho cùng lúc. Đọc từ sổ |
| **bất kỳ trường giá vốn nào** | BRD §6.4 — Forge **không có quyền theo trường**. Đặt giá vốn lên `Batch` là Sản xuất đọc được, **thủng phân quyền im lặng** |
| `stock_state` như trường ghi tay | Dẫn xuất từ sổ + ngưỡng trong profile. Bản cũ cho gõ tay ⇒ 55 dòng "Sắp hết" không ai biết ngưỡng do đâu |

### 3.4 Trường dẫn xuất — tính, không lưu

| Hiển thị | Công thức |
|---|---|
| Số lá còn lại | `SUM(actual_qty_micros)` lọc `batch_no` |
| Kg còn lại | `SUM(actual_weight_micros)` cùng bộ lọc |
| Vị trí hiện tại | `GROUP BY warehouse` — ra nhiều dòng nếu chuyển một phần |
| Giá vốn còn lại | replay FIFO **thu hẹp theo batch** (sau M3+M5) ⇒ đích danh |
| Đã giữ chỗ | `SUM` từ `Stock Reservation` khớp mã·màu·tình trạng·khổ ≥ yêu cầu |
| Khả dụng | Còn lại − Giữ chỗ |

---

## 4. LEDGER — `Item` (doctype danh mục)

Cột **Nhân ĐỌC?** ở bảng này quan trọng bậc nhất: `Item` là nơi nhiều trường **trông như có tác dụng mà
không ai đọc**. Mỗi ✅ dưới đây đều kèm dòng mã.

| Field | Kiểu Forge | Ràng buộc | Validate + câu lỗi VN | Autofill | Quyền | **Nhân ĐỌC?** | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `item_code` | Data | PK (`naming: field:item_code`), UNIQUE | `^[A-Z0-9][A-Z0-9.-]{0,23}$` → *"Mã hàng chỉ được dùng chữ IN HOA, số, gạch ngang và dấu chấm — tối đa 24 ký tự"* | gợi ý theo 10 tiền tố | Chủ xưởng/Thủ kho `wc` | ✅ tên bản ghi, mọi FK | Khoá tự nhiên |
| `item_name` | Data | NOT NULL | `min 1 max 120`, trim + gộp khoảng trắng | — | như trên | ⬜ hiển thị | Tên |
| `item_group` | Link(Item Group) | NOT NULL, FK | phải là **nhóm lá** → *"Nhóm «X» là nhóm chứa; hãy chọn một nhóm con"* | — | như trên | ✅ `leafGroup()` (script nạp ĐM đã phải xử) | Kế thừa tài khoản + phương pháp giá |
| `item_nature` | Select(Hàng tồn kho, Dịch vụ, Tài sản) | NOT NULL DEFAULT `Hàng tồn kho` | — | — | như trên | ✅ nhánh xử lý của nhân | Enum cứng |
| `material_stage` | Select(5 giá trị) | — | bắt buộc khi tồn kho | — | như trên | ⬜ | NVL / Thành phẩm… |
| `supply_type` | Select(3) | DEFAULT `Mua ngoài` | — | — | như trên | ⬜ | — |
| `is_stock_item` | Check | DEFAULT 1 | ép 0 khi `item_nature=Dịch vụ` | — | như trên | ✅ chặn ghi sổ hàng phi tồn kho | — |
| `is_purchase_item` | Check | DEFAULT 1, **`in_standard_filter`** | — | — | như trên | ✅ `link_filters` ô chọn phiếu mua | ⚠️ **Thiếu `in_standard_filter` là mọi truy vấn theo nó bị TỪ CHỐI im lặng** — lỗi bản cũ đã trả giá |
| `is_sales_item` | Check | DEFAULT 1, **`in_standard_filter`** | — | — | như trên | ✅ như trên | — |
| `disabled` | Check | DEFAULT 0 | **mặc định rõ ràng, không để trống** | — | như trên | ✅ `hasMasterRecord` loại bản ghi `disabled=1` (`d1-store.ts:401`) | ⚠️ Bản cũ để trống 186 mã ⇒ **biến mất khỏi ô chọn** |
| `measurement_profile` | Link(Measurement Profile) | **NOT NULL** | → *"Chưa chọn bộ quy cách"* | từ `item_group.default_measurement_profile` | như trên | ❌ **app tự đọc — phải viết** | **Nguồn DUY NHẤT của `inventory_mode`** |
| `stock_uom` | Link(UOM) | NOT NULL | khớp `profile.stock_uom` → *"Đơn vị tồn «Kg» không khớp bộ quy cách «Nhôm cây/lá» (đề xuất: Cây)"* | từ profile | như trên | ✅ `uom.ts` `factorFromMaster` | **Đơn vị ĐẾM** — nhôm là Cây/Lá (QĐ-2) |
| `has_catch_weight` | Check | DEFAULT 0 | tự bật khi `profile.inventory_mode = Nhôm cây/lá` | từ profile | như trên | ❌ **MỚI — chưa ai đọc** | Bật = mọi dòng sổ mang **hai** con số |
| `weight_uom` | Link(UOM) | bắt buộc khi `has_catch_weight` | DEFAULT `Kg` | — | như trên | ❌ **MỚI** | Đơn vị TÍNH TIỀN |
| `uom_conversions` | Table(UOM Conversion) | — | **CHẶN khi `has_catch_weight`** → *"Mặt hàng cân theo kiện không dùng hệ số quy đổi cố định — khối lượng bắt tại từng dòng phiếu nhập"* | — | như trên | ✅ `uom.ts:41-49` — ⚠️ doc-comment cảnh báo: *"đổi tên là quy đổi im lặng trở về hệ số 1, và tồn kho sai gần sáu lần mà không có gì báo"* | Ray `1 Cây = 5,85 Mét`; nhôm cấm |
| `has_batch_no` | Check | DEFAULT 0 | **tự bật + khoá** khi `has_catch_weight` | từ profile | như trên | ✅ `tracking.ts:27` — bật là **bắt buộc bundle** khi submit | QĐ-1 |
| `has_serial_no` | Check | DEFAULT 0 | không cùng bật với `has_batch_no` ở V2 | — | như trên | ✅ `tracking.ts:27` | Chưa dùng |
| `valuation_method` | Select(FIFO, Bình quân di động) | NOT NULL | **giá trị lạ → TỪ CHỐI** → *"Phương pháp giá vốn không hợp lệ"* | từ `item_group.default_valuation_method` | Chủ xưởng `w`; Sản xuất ❌ | ✅ `valuation.ts:29` `getItemValuationMethod` | ⚠️ Bản cũ: giá trị nào không chứa `"moving"` **âm thầm thành FIFO** (`valuation.ts:18`). Đổi giữa chừng **bắt buộc audit** (TT99/2025 đòi nhất quán giữa các kỳ) |
| `inventory_account` · `cogs_account` | Link(Account) | — | — | từ `item_group` | Kế toán `w`; Sản xuất ❌ | ✅ `clouderp-selling/src/controllers.ts:232-235` — tra **Item trước, Company sau** | ⚠️ Thiếu **cả hai** = giá vốn hàng bán **= 0** mà sổ vẫn cân |
| `income_account` · `expense_account` | Link(Account) | — | — | từ `item_group` | như trên | ✅ cùng chỗ | — |
| `door_type` | Select(6 loại — **+ Cửa tấm liền Úc**) | bắt buộc khi `inventory_mode = Thành phẩm theo m2` | → *"Thành phẩm cửa phải chọn loại cửa để áp đúng công thức"* | — | Chủ xưởng `w` | ❌ app worker | **Không** suy từ Nhóm hàng |
| `cutting_policy` | Link(Cutting Policy) | bắt buộc khi có `door_type` | phân giải `(door_type, ray_type, item_group)`; hai luật cùng ưu tiên → **TỪ CHỐI** | — | Chủ xưởng `w` | ❌ app worker | Tách khỏi `door_type` để một loại cửa nhiều biến thể ray |
| `purchase_kg_per_m2` | Float | bắt buộc khi `door_type ∉ {Đức, tấm liền Úc}` | `> 0` → *"Cửa Úc/Lưới/Đài Loan/Siêu Trường phải có barem kg/m² mới dự toán mua được"* | — | Chủ xưởng `w` | ❌ app worker | Đức tính theo **kg cân thực** |
| `min_area_sqm` | Float | — | `≥ 0` | — | Chủ xưởng `w` | ❌ app worker | **Để trống, không chặn** (I2 — 0/117 mã có giá trị) |
| `default_color` | Link(Item Color) | — | phải nằm trong `allowed_colors` nếu có khai | — | như trên | ❌ app | Gợi ý |
| `allowed_colors` | Table(Item Allowed Color) | — | màu phải đang hoạt động | — | như trên | ❌ app | **Chiều CHẶN duy nhất** — `Item Color.applies_to` là chuỗi tự do, không ép được |
| `default_warehouse` | Link(Warehouse) | — | kho **lá** → *"«Kho Alumdoor» là nút nhóm"* | — | như trên | ⬜ gợi ý | — |
| `barcode` | Data | UNIQUE khi có | — | sinh mã nội bộ nếu hàng không có mã in | như trên | ❌ app | 4 điểm quét: nhập·xuất·kiểm kê·POS |
| `allow_negative_stock` | Check | DEFAULT 0 | bật cần Chủ xưởng | — | Chủ xưởng | ✅ `tracking.ts:69` — **ép false** cho hàng theo lô | — |
| `description` | Small Text | — | max 500 | — | như trên | ⬜ | — |

### 4.1 ❌ TRƯỜNG PHẢI XOÁ khỏi brief V2

| Xoá | Vì sao |
|---|---|
| `variant_of` · `variant_attributes` · doctype `Item Variant Attribute` | QĐ-3 — 1 mã × 24 màu × n khổ là mớ 477 mã quay lại. Để im là chờ người sau dùng nhầm |
| `inventory_mode` **trên Item** | Khai hai nơi ⇒ mâu thuẫn được. Nguồn duy nhất là `Measurement Profile` |

### 4.2 State machine

`Item` **không có `status`** — chỉ `disabled` bật/tắt. Không cần state machine.
⚠️ Nhưng `disabled` phải có **DEFAULT rõ ràng**: bản cũ để trống 186 mã, rồi `link_filters` coi trống là
"không được mua" ⇒ **186 mã biến mất khỏi ô chọn** mà không ai hiểu vì sao.

---

## 5. LEDGER — danh mục còn lại

Bảng dưới rút gọn: chỉ ghi cột **khác biệt so với mặc định**. Mặc định ngầm cho mọi trường danh mục:
quyền `Chủ xưởng rwc · còn lại r`, autofill `—`, Nhân ĐỌC `❌ app tự đọc`. Chỗ nào khác thì ghi rõ.

### 5.1 `Measurement Profile`

| Field | Kiểu | Ràng buộc | Validate + câu lỗi VN | Nhân ĐỌC? |
|---|---|---|---|---|
| `profile_name` | Data | PK, UNIQUE | — | ✅ tên bản ghi |
| `inventory_mode` | Select(6) | NOT NULL DEFAULT `Hàng thường` | enum cứng | ❌ app — **nguồn duy nhất** |
| `stock_uom` | Link(UOM) | NOT NULL | — | ❌ app (đề xuất cho Item) |
| `require_color` · `require_condition` · `require_length` · `require_width` · `require_piece_qty` · `require_bundle_qty` | Check ×6 | DEFAULT 0 | — | ❌ app — quyết định trường nào bắt buộc trên `Batch` |
| `theoretical_kg_per_m` | Float | bắt buộc khi `Nhôm cây/lá` | `> 0` → *"Nhôm cây/lá phải có kg/m lý thuyết để đối chiếu cân"* | ❌ app — **cảnh báo**, không tính tồn |
| `weight_tolerance_pct` | Float | DEFAULT **13** | `0–50` | ❌ app |
| `effective_width_m` | Float | bắt buộc khi `Thành phẩm theo m2` | `> 0` → *"Phải khai bản lá để chia lá được"* | ❌ app — **bản lá**, 23 giá trị theo MÃ (P3: không đổi theo lô) |
| `kerf_mm` | Float | DEFAULT **3** | `0–10` → *"Bề rộng lưỡi cắt phải trong khoảng 0–10 mm"* | ❌ **MỚI** |
| `scrap_threshold_m` | Float | DEFAULT **0,25** | `≥ 0` | ❌ **MỚI** — số TẠM, sửa trong Settings |
| `track_dimension_lot` | Check | — | — | ⬜ |
| `note` | Small Text | — | max 500 | ⬜ |

**Audit bắt buộc** khi đổi 4 trường: `kerf_mm` · `scrap_threshold_m` · `effective_width_m` ·
`theoretical_kg_per_m` — bốn số này đổi là **đổi cách cắt nhôm của mọi đơn sau đó**.

### 5.2 `Cutting Policy`

Giữ nguyên 14 trường bản cũ (`dealer_width_basis` · `retail_width_basis` · 2 `*_cut_deduction_m` ·
`butterfly_cut_deduction_m` · 3 `*_sales_basis` · `manual_pull_sales_basis` · `purchase_formula` +
2 basis · `priority` · `disabled`). **Thêm 9:**

| Field | Kiểu | Ràng buộc | Validate + câu lỗi VN | Nhân ĐỌC? |
|---|---|---|---|---|
| `door_type` | Select(**6**) | NOT NULL | +`Cửa tấm liền Úc` | ❌ app |
| `ray_type` | Select(U75, U100, Ray sắt U70, Không dùng ray) | NOT NULL | V2 chỉ seed **U75** (Q3) | ❌ **MỚI** |
| `height_pb_offset_m` | Float | DEFAULT **0,5** | `CPB = CLL + offset` | ❌ **MỚI** |
| `leaf_formula` | Select(Kiểu Đức, Kiểu Úc, Kiểu tấm liền Úc, Kiểu Đài Loan/Lưới) | **NOT NULL mọi loại cửa** | Q5: mọi loại đều chia lá | ❌ **MỚI** |
| `leaf_height_deduction_m` | Float | **0,13 CHỈ cho Cửa Đức** | ⚠️ Các dòng cửa khác **ĐỂ TRỐNG** — chủ xưởng chốt 30/07 *"0,13 là cửa Đức, các cửa khác tính sau"*. Đặt `0` cũng là **đoán**, không hơn gì đoán `0,13`. Trống ⇒ chặn chia lá dòng đó kèm câu hỏi | ❌ **MỚI** |
| `leaf_divisor_source` | Select(Bản lá của bộ quy cách, Hằng số) | NOT NULL | Đức lấy bản lá theo mã; Úc dùng hằng số | ❌ **MỚI** |
| `leaf_divisor_const` | Float | bắt buộc khi `Hằng số` | `> 0` — Úc `0,465` · tấm liền Úc `0,068` | ❌ **MỚI** |
| `leaf_rounding` | Select(Ngưỡng trừ-một-lá, Nấc 0/0.3/0.7/1, Làm tròn xuống) | NOT NULL | — | ❌ **MỚI** |
| `leaf_variants` | Table(Leaf Variant) | — | Úc: 3 biến thể motor, `addend` 2 / 1,5 / 1,3 | ❌ **MỚI** |

**Phân giải:** khoá `(door_type, ray_type, item_group, priority)`. Trùng khoá → **TỪ CHỐI** →
*"Có 2 công thức cùng mức ưu tiên cho «Cửa Đức + U75». Sửa độ ưu tiên hoặc ngừng bớt một cái — hệ thống
không đoán."* (giữ nguyên luật bản cũ: *"vì đoán sai là cắt hỏng nhôm"*).

**Thuật toán chia lá — PHA 5 dịch máy móc:**

```
raw   = (CPB − leaf_height_deduction_m) ÷ divisor
after = raw − 1                                    ← trừ một lá TRƯỚC
số lá = frac(after) ≥ 0,6 ? ceil(after) : floor(after)   ← làm tròn SAU
ngoại lệ: item ∈ exempt_items (AL71C) → bỏ bước trừ một lá
```

### 5.3 Năm danh mục nhỏ — chỉ ghi phần MỚI

| Doctype | Thêm | Ràng buộc |
|---|---|---|
| `Item Group` | `default_valuation_method` Select(FIFO, Bình quân di động) · `default_measurement_profile` Link | Item kế thừa lúc tạo |
| `UOM` | +2 bản ghi: **`LÁ`** · **`THÂN`** | `must_be_whole_number` = ✔ cho Cây/Lá/Tấm — **dùng sẵn, không tự chế validate** |
| `UOM Conversion` | — | **CHẶN khai khi `item.has_catch_weight`** |
| `Item Color` | seed 24 màu; `4004`→ĐỎ; `9512`→`supplier_color_code` của TRẮNG; **`applies_to` Small Text → bảng con `Item Color Scope`** | ✅ Chủ xưởng chốt 30/07: bảng màu gửi kèm ĐÃ CÓ cột "Nhóm SP áp dụng" ⇒ dữ liệu để ép tồn tại. Đổi sang Link(Item Group) và **ÉP THẬT** — BRD §0.2 Q10 |
| `Supplier` | `receipt_tolerance_pct` Float DEFAULT **5** | Dung sai giao hàng theo NCC |
| `Warehouse` | `stock_role` Select(Kho chính, Kho đầu thừa, Kho phế, Kho gửi gia công) · `keeper` **Data → Link(User)** | Cây: `K36 › Đầu thừa`, `K12 › Đầu thừa` (W-Q2). Chỉ `Kho chính` vào tồn khả dụng |

### 5.4 Ba danh mục FK còn thiếu ledger (D6)

Scorecard cũ ghi *"mọi FK trỏ bảng thật"* — **sai**. Ba danh mục dưới đây bị dùng làm FK khắp nơi mà
chưa có ledger. Bổ sung:

| Doctype | Field | Ràng buộc | Dùng ở |
|---|---|---|---|
| **Lý do huỷ** | `reason_code:Data*!` · `reason_name:Data!` · `applies_to_doctype:Select(Tất cả,Phiếu nhập,Phiếu xuất,Phiếu kho,Phiếu cắt,Kiểm kê)=(Tất cả)` · `sort_order:Int` · `disabled:Check` | `reason_code` UNIQUE | `*.cancel_reason` — chip lý do Kanban, **bước lùi bắt buộc chọn** |
| **Nguyên nhân chênh lệch** | `reason_code:Data*!` · `reason_name:Data!` · `variance_kind:Select(Thừa,Thiếu,Cả hai)=(Cả hai)` · `sort_order:Int` · `disabled:Check` | UNIQUE | `Stock Reconciliation Item.variance_reason` · `Stock Entry.adjust_reason` — **TT99/2025 đòi phân loại nguyên nhân rồi mới hạch toán** |
| **Item Color Scope** (child của `Item Color`) | `item_group:Link(Item Group)!` | — | Thay `applies_to` Small Text ⇒ ép được ràng buộc màu ↔ nhóm SP |

**Seed từ dữ liệu thật:**

- *Lý do huỷ*: Nhập nhầm · Sai số lượng · Sai lô · NCC đổi hàng · Khác
- *Nguyên nhân chênh lệch*: Sai cân đo · Quên ghi · Hỏng/mất · **Thợ cắt sai không báo** · Khác
  (mục thứ tư lấy nguyên văn từ lời kế toán trong nghề — `danketoan.com`)
- *Item Color Scope*: theo cột "Nhóm SP áp dụng" của bảng màu chủ xưởng gửi — sơn tĩnh điện áp cho
  6 nhóm, mạ màu **chỉ** Cửa Úc và Đài Loan

---

## 6. LEDGER — `Purchase Receipt` (ƯU TIÊN 1)

> Chủ xưởng chốt 30/07: **"cho cái nhập là được"**. Đây là chứng từ làm trước, chạy được trước.
> Cũng hợp lý về kỹ thuật: **không nhập thì không có gì để cắt, để xuất, để kiểm kê.**

### 6.1 Đầu phiếu — giữ 13 trường bản cũ, thêm 2

| Field | Kiểu | Ràng buộc | Validate + câu lỗi VN | Autofill | Nhân ĐỌC? |
|---|---|---|---|---|---|
| `supplier` | Link(Supplier) | NOT NULL | tồn tại + `disabled=0` | `fetch_from: against_purchase_order.supplier` | ✅ `controllers.ts:206` `assertMasters` |
| `posting_at` | Datetime | NOT NULL DEFAULT Now | **không thuộc kỳ đã khoá** → *"Kỳ kế toán tháng 6/2026 đã khoá"* | Now | ✅ `controllers.ts:206` `assertUnlocked` |
| `against_purchase_order` | Link(Purchase Order) | — | chỉ là **mặc định** cho dòng | — | ✅ `orderOf()` — dòng thắng đầu phiếu |
| `company` · `currency` | Link | NOT NULL, **hidden** | `=ALUMDOOR` / `=VND` | fetch từ đơn mua | ✅ `assertMasters` — ⚠️ **ẩn ≠ bỏ**: nhân vẫn bắt buộc, bỏ field là mọi phiếu bị từ chối |
| `supplier_invoice_no` · `driver` · `note` | Data / Small Text | — | — | — | ⬜ |
| `items` | Table(Purchase Receipt Item) | NOT NULL, ≥1 | — | — | ✅ |
| `grand_total` · `total_qty` | Currency / Float | read-only | server tính lại khi lưu | cộng khi gõ | ✅ `calculateSalesTotals` |
| `stock_account` · `stock_received_but_not_billed` | Link(Account) | DEFAULT | — | — | ✅ `ledger()` ghi Nợ/Có |
| **`goods_photo`** | Attach Image | **NOT NULL** | ≤10 MB, nén ≤500 KB → *"Nhập kho phải có ảnh hàng nhận"* | — | ❌ **MỚI** — `media-capture`: nhập kho là điểm chụp **bắt buộc**. **Bất biến** sau ghi sổ |
| **`supplier_note_photo`** | Attach Image | — | — | — | ❌ **MỚI** |

### 6.2 Dòng phiếu — giữ 24 trường, thêm 5

Giữ nguyên: `item_code` (+`link_filters {is_purchase_item:1, disabled:0}`) · `item_name` · `inventory_mode`
(hidden) · `measurement_profile` (hidden) · `stock_uom` · `color` · `length_m` · `uom` · `qty` ·
`qty_bundle` · `qty_bar` · `total_length_m` · `actual_weight_kg` · `actual_kg_per_m` · `so_no` · `rate` ·
`amount` · `note` · `warehouse` · `purchase_order` · `conversion_factor` · `stock_qty` · `valuation_rate`
· `width_m`/`height_m`/`set_count` (cho hàng khác).

| Field MỚI | Kiểu | Ràng buộc | Validate + câu lỗi VN | Nhân ĐỌC? |
|---|---|---|---|---|
| `serial_and_batch_bundle` | Link(Serial and Batch Bundle) | bắt buộc khi `item.has_batch_no` | thiếu → *"Serial and Batch Bundle is required for tracked Item"* | ✅ `tracking.ts:29` — **tên trường copy đúng nền tảng** |
| `condition` | Select(Thô, Đã sơn, Lỗi) | bắt buộc khi `profile.require_condition` | — | ❌ app → đẩy xuống `Batch` |
| `is_stamped` | Check | — | — | ❌ app → `Batch` |
| `theoretical_kg` | Float | read-only, dẫn xuất | `length_m × profile.theoretical_kg_per_m × qty_bar` | ❌ **MỚI** |
| `weight_variance_pct` | Float | read-only, dẫn xuất | `|kg thực − kg lý thuyết| ÷ kg lý thuyết` — vượt `profile.weight_tolerance_pct` (13%) → **cảnh báo vàng, KHÔNG chặn** | ❌ **MỚI** |

**Đổi nghĩa (không đổi tên):**

| Field | Bản cũ | V2 |
|---|---|---|
| `qty` (nhôm) | tổng **kg** | **số CÂY** (QĐ-2) |
| `actual_weight_kg` | *"số đối chiếu, **không vào sổ**"* | **VÀO SỔ** ở `actual_weight_micros` |

⚠️ Đổi nghĩa mà giữ tên là **bẫy cho người đọc mô tả cũ**. Mô tả field trong brief V2 phải viết lại,
không copy.

### 6.3 State machine

```
Nháp (docstatus 0) ──submit──> Đã ghi sổ (1) ──cancel──> Đã huỷ (2) ──amend──> Nháp mới
```

| Chuyển | Ai | Điều kiện | Việc kèm theo |
|---|---|---|---|
| `Nháp → Đã ghi sổ` | Thủ kho · Kế toán · Chủ xưởng (`s`) | kỳ chưa khoá · mọi dòng có kho · hạn mức từng đơn trong dung sai · ảnh hàng nhận có | Tạo `Batch` + bundle · ghi sổ kho · ghi `purchase_order_progress_entries` · audit **cùng transaction** |
| `Đã ghi sổ → Đã huỷ` | như trên (`x`) | **TỪ CHỐI nếu lô đã bị cắt** → *"Lô LO-2026-00042 đã cắt 12 lá ở phiếu CN-2026-00007 — hoàn cắt trước rồi mới huỷ phiếu nhập"* | `voucher_revision+1` đối dấu · đảo `bundleUsages` (`usage_delta: -1`) · **giữ số phiếu** |
| `Đã huỷ → Nháp mới` | (`a`) | — | Số mới, số cũ không tái dùng |

**Không có xoá** — nền tảng không cấp chữ `d`.

### 6.4 Dung sai ±5% — sửa `assertPurchaseRemaining`

```
đã nhận + đang nhận  ≤  đã đặt                       → nhận, đơn CÒN MỞ
đã đặt  <  …         ≤  đã đặt × (1 + tolerance)     → nhận, đơn ĐÓNG, ghi chênh lệch
                     >  đã đặt × (1 + tolerance)     → TỪ CHỐI
```

`tolerance` = `supplier.receipt_tolerance_pct` (mặc định 5). Kiểm **theo TỪNG đơn** (`byOrder`,
`controllers.ts:207-209`), quy về **đơn vị tồn**. Nhận thiếu ⇒ **không tự đóng đơn**.

⚠️ **Dung sai KHÔNG dùng để tràn sang đơn sau** — FIFO trừ đúng số đặt của đơn cũ nhất rồi mới sang đơn kế.

---

## 7. LEDGER — 5 chứng từ còn lại

Rút gọn: chỉ ghi **trường mới / đổi** và **state machine**. Trường giữ nguyên bản cũ xem
`brd-entities/*.md`. Mặc định ngầm mọi chứng từ: `posting_at` chặn kỳ khoá · audit cùng transaction ·
huỷ giữ số · không có xoá.

### 7.1 `Cut Order` — phiếu cắt (phức tạp nhất)

| Field | Kiểu | Ràng buộc | Validate + câu lỗi VN | Nhân ĐỌC? |
|---|---|---|---|---|
| `cutting_policy` | Link(Cutting Policy) | NOT NULL | phân giải `(door_type, ray_type, item_group, priority)`; trùng khoá → **TỪ CHỐI** → *"Có 2 công thức cùng mức ưu tiên cho «Cửa Đức + U75» — hệ thống không đoán"* | ❌ app |
| `items[].serial_and_batch_bundle` | Link(SABB) | NOT NULL | bundle **Outward**, mỗi dòng = một lô mẹ | ✅ `tracking.ts:29` |
| **`offcut_bundle`** (ĐẦU PHIẾU) | Link(SABB) | — (nhân tạo) | bundle **Inward** ở kho Đầu thừa | ✅ copy khuôn `finished_good_bundle` của `Stock Entry` |
| `items[].cut_width_m` | Float | NOT NULL | `≤ source_length_m`; **server tính lại từ policy, lệch → từ chối** | ❌ app |
| `items[].sheets_cut` | Float | NOT NULL | `> 0`, nguyên khi ĐVT Lá | ❌ app |
| `items[].cuts_count` | Int | dẫn xuất | — | ❌ **MỚI** — để tính kerf |
| `items[].kerf_total_m` | Float | read-only | `profile.kerf_mm × cuts_count ÷ 1000` | ❌ **MỚI** |
| `items[].kg_consumed` | Float | bắt buộc khi catch-weight | `kg còn lại × sheets_cut ÷ lá còn lại` | ❌ **MỚI** |
| `items[].kg_weighed` | Float | — | có giá trị thì **THẮNG** tỉ lệ lý thuyết, lưu chênh lệch | ❌ **MỚI** |
| `items[].offcut_length_m` | Float | dẫn xuất | `source − cut_width − kerf_total` | ❌ **MỚI** |
| `cancel_reason` | Link(Lý do huỷ) | bắt buộc khi hoàn/trả | chip lý do, **không bỏ trống** | ❌ app |

**State machine:**

```
Nháp ──submit──> Đã cắt ──hoàn cắt──> Đã hoàn cắt
                    │
                    └──trả hàng──> Đã trả hàng
```

| Chuyển | Điều kiện | Việc kèm |
|---|---|---|
| → `Đã cắt` | ngưỡng phế đã khai · đủ lá khả dụng · rộng cắt ≤ khổ | 2 bundle ngược chiều · nhả giữ chỗ phần đã cắt · sinh lô đầu thừa nếu ≥ ngưỡng |
| → `Đã hoàn cắt` | bắt buộc `cancel_reason` | Đảo bút toán **bằng đúng `kg_consumed` đã ghi**, không tính lại · đảo lô đầu thừa · `usage_delta:-1` |
| → `Đã trả hàng` | bắt buộc `cancel_reason` | **TẠO LÔ KHỔ MỚI** — không nhập lại khổ gốc (nhôm đã thành lá) |

### 7.2 `Delivery Note` — phiếu xuất

| Field | Đổi | Vì sao |
|---|---|---|
| `against_sales_order` | required → **tuỳ chọn** | Q8 chốt 30/07 |
| `install_address` | required → **tuỳ chọn** | `fetch_from` đơn bán; giữ bắt buộc là chặn cửa sau |
| `customer` | required → tuỳ chọn khi `issue_purpose ≠ Bán hàng` | Xuất nội bộ không có khách |
| **`issue_purpose`** MỚI | Select(Bán hàng, Xuất mẫu, Đổi bảo hành, Xuất nội bộ, Xuất gia công) NOT NULL | Bỏ ràng buộc đơn bán thì phải biết **xuất để làm gì** |
| `items[].serial_and_batch_bundle` MỚI | Link(SABB), bắt buộc khi theo lô | bundle **Outward** |
| `items[].weight_kg` MỚI | Float, bắt buộc khi catch-weight | — |

**Kiểm tồn theo KHẢ DỤNG**, không phải tồn tổng → *"Tồn 18 lá nhưng 6 lá đã giữ cho lệnh SX LSX-2026-0012
— chỉ xuất được 12"*. Giữ nguyên **chốt chặn kho âm**: không đủ thì từ chối, không ghi sổ một phần.

State machine: `Nháp → Đã ghi sổ → Đã huỷ` (huỷ bắt buộc chip lý do).

### 7.3 `Stock Entry` — phiếu kho

| Field | Đổi | Vì sao |
|---|---|---|
| `items[].serial_and_batch_bundle` MỚI | Link(SABB) | **Copy đúng tên của `Stock Entry Detail` nền tảng** — brief cũ khai đè bằng `Stock Entry Item` và đánh rơi chính trường này |
| `items[].weight_kg` MỚI | Float | catch weight |
| `purpose` | thêm giá trị **`Điều chỉnh tồn`** | `screen-catalog`: không sửa tồn trực tiếp, dùng phiếu điều chỉnh |
| `adjust_reason` MỚI | Link(Nguyên nhân chênh lệch), bắt buộc khi `Điều chỉnh tồn` | Dùng chung danh mục với kiểm kê |

**Material Transfer = 2 bút toán cùng `batch_no`** (− nguồn, + đích). `Batch.received_warehouse`
**KHÔNG đổi** — vị trí hiện tại đọc từ sổ.

### 7.4 `Stock Reconciliation` — kiểm kê

| Field | Kiểu | Ràng buộc |
|---|---|---|
| `snapshot_at` | Datetime | NOT NULL — **CHỤP số sổ tại mốc này**, không đọc lại lúc ghi |
| `counted_by` · `witnessed_by` | Link(User) | `witnessed_by ≠ counted_by` → *"Người chứng kiến phải khác người đếm"* |
| `items[].book_qty` · `book_weight_kg` | Float | read-only, chụp lúc tạo |
| `items[].counted_qty` · `counted_weight_kg` | Float | `≥ 0` |
| `items[].variance_reason` | Link(Nguyên nhân chênh lệch) | **bắt buộc khi `variance ≠ 0`** → *"Dòng AL548 lệch −3 lá — phải chọn nguyên nhân trước khi ghi sổ"* |

**State machine:** `Nháp → Đang đếm → Chờ duyệt → Đã ghi sổ` · `→ Đã huỷ` (bất kỳ đâu, có lý do).

| Trạng thái | Ai sửa | Sửa được gì |
|---|---|---|
| Đang đếm | Thủ kho | chỉ `counted_*`, `variance_reason`, ảnh |
| Chờ duyệt | — | không |
| **Duyệt** | **Chỉ Chủ xưởng** (Q9) — Thủ kho thiếu chữ `s` | sinh bút toán tại `snapshot_at`, chỉ dòng lệch |
| Đã ghi sổ | — | **bất biến** — sai thì lập phiếu mới |

Phát sinh sau `snapshot_at` → **cảnh báo, không chặn**.

### 7.5 `Stock Reservation` — giữ chỗ

| Field | Kiểu | Ràng buộc |
|---|---|---|
| `item_code` · `color` · `condition` | Link/Select | trống = mọi giá trị |
| **`min_length_m`** | Float | NOT NULL khi theo lô — **trục của cả cơ chế** |
| `qty_reserved` | Float | `> 0`, **không vượt khả dụng** → *"Chỉ còn 12 lá khổ ≥ 4,5 m khả dụng (tổng 18, đã giữ 6) — không giữ được 20"* |
| `source_doctype` · `source_name` | Select/Data | NOT NULL — mốc = **phát lệnh sản xuất** (A3) |
| `expires_at` | Datetime | quá hạn → cron sáng chuyển `Hết hạn` |
| `state` | Select(Đang giữ, Đã dùng, Đã nhả, Hết hạn) | `Đã nhả` bắt buộc `released_reason` |

**Công thức khả dụng — dịch máy móc:**

```
khả_dụng(L) = SUM(tồn lô có length_m ≥ L)  −  SUM(giữ chỗ có min_length_m ≥ L)
```

⚠️ Điều kiện `min_length_m ≥ L` chứ **không phải `= L`**. Viết nhầm thành `=` là **hứa trùng hàng mà
không có gì báo** — giữ 6 lá `≥4,5 m` phải làm giảm cả mức `≥3,8` và `≥3,0`, vì đó là cùng những cây nhôm.

**Không sinh bút toán sổ** — giữ chỗ là lớp phủ trên sổ, không phải sổ.

---

## 8. API / ACTION SPEC

### 8.1 App KHÔNG tự viết route CRUD

Forge sinh endpoint từ metadata; app chỉ khai **doctype** và **action**. Khác AppWeb ở chỗ này, nên
"ma trận quyền theo endpoint" của khuôn gốc được thay bằng `(doctype, letters)` + `(action, roles)` —
xem BRD §6. Dưới đây chỉ kê **action app phải tự viết**.

| Action | Vào | Ra | Ghi gì | Role |
|---|---|---|---|---|
| `tinh-cong-thuc-cua` | CPB/CLL · RPB/RLL · số bộ · nhóm khách · loại ray · bản bướm | rộng cắt · **số lá** · m² tính tiền · kg dự toán | **không ghi gì** | tất cả |
| `de-xuat-lo-cat` | mã · màu · tình trạng · khổ tối thiểu · số lá cần | danh sách lô đề xuất | không ghi | Chủ xưởng · Thủ kho · Sản xuất |
| `cat-nhom` | phiếu cắt nháp | phiếu đã ghi sổ | 2 bundle · bút toán · lô đầu thừa · nhả giữ chỗ | như trên |
| `hoan-cat` · `tra-hang` | số phiếu + lý do | — | đảo bút toán · `usage_delta:-1` | như trên |
| `giu-cho` · `nha-giu-cho` | lệnh SX | bản ghi giữ chỗ | **không đụng sổ** | Chủ xưởng · Kế toán |
| `chot-so-so-kiem-ke` | kho + phạm vi | phiếu có `book_qty` đã chụp | không ghi sổ | Chủ xưởng · Thủ kho · Kế toán |
| `duyet-kiem-ke` | phiếu | — | bút toán điều chỉnh tại `snapshot_at` | **chỉ Chủ xưởng** |
| `doc-anh-chung-tu` | ảnh + loại chứng từ + NCC + kho | chứng từ **NHÁP** | không ghi sổ | Chủ xưởng · Thủ kho · Kế toán |
| `khoa-ky` · `mo-ky` | kỳ + lý do | — | `accounting_period_locks` | **chỉ Chủ xưởng** |
| `hoi-ai` | câu hỏi + bối cảnh | trả lời | `ai_logs` | tất cả — chạy **dưới session người hỏi** |

**Ba luật cứng cho mọi action:** ① AI chỉ ra **bản nháp**, không tự ghi sổ · ② action ghi sổ phải audit
**cùng transaction** · ③ mọi action đọc dữ liệu chạy dưới quyền người gọi, không nâng quyền.

### 8.2 Checklist `backend-contract.md` PHA 3 — đối chiếu hạ tầng CÓ SẴN

Đã kiểm bảng thật trên D1 `cloudforge-alu`:

| Yêu cầu | Forge có sẵn? | Ghi chú |
|---|---|---|
| Audit log | ✅ **`versions`** + `track_changes:true` trên doctype | **KHÔNG có bảng `audit_logs`** — Forge dùng cơ chế version kiểu Frappe. Đừng dựng bảng mới |
| Cấp mã atomic | ✅ `naming_series` | Dùng sẵn, không tự chế counter |
| Files/R2 | ✅ `files` | — |
| Thông báo | ✅ `notification_log` + `notification_rules` | Adapter Zalo chưa có — ngoài phạm vi V2 |
| Outbox/retry | ✅ `outbox` + `app_hook_deliveries` | — |
| Khoá kỳ | ✅ `accounting_period_locks` | **Có sẵn mà bản cũ chưa dùng thật** |
| Import wizard | ✅ `import_jobs` (status có `Preview`) | — |
| Kanban | ✅ `kanban_boards` + `kanban_card_order` | — |
| Bundle usage | ✅ `stock_bundle_usage_entries` | — |
| Tiến độ đơn mua | ✅ `purchase_order_progress_entries` | Là nguồn báo cáo "NCC còn nợ" |
| Chống ghi đè | ✅ khoá `modified` + `mutation_guard` · `mutation_receipts` | Optimistic lock có sẵn |
| **`ai_logs`** | ✅ **đã bổ sung ở migration 0025** | Chỉ ghi sau câu trả lời AI thành công; lưu tenant, người hỏi, câu hỏi, bối cảnh và model; action đọc dữ liệu dưới đúng danh tính người gọi |
| Cron / việc định kỳ | ✅ **ở TẦNG NỀN TẢNG** | `tenant-worker.scheduled()` và `/internal/maintenance` chạy maintenance dùng chung; trạng thái gần nhất/lỗi/stale được công bố ở `/health`. `alumdoor-worker` vẫn cố ý không có binding dữ liệu hoặc cron |
| `/api/sync` offline | ❌ không áp dụng | Không có POS |
| Export-all | ✅ đã xác minh | `frappe.desk.reportview.export_query` có full test và HTTP smoke; quyền `read` mặc định kéo theo `export` đúng contract |

> **Cập nhật thi hành 2026-07-30:** hạ tầng cần cho V2 đã phủ đủ. `ai_logs`, maintenance nền tảng,
> health evidence và export-all đều đã có test. App worker tiếp tục không nắm dữ liệu tenant và không
> tự chạy cron; nguyên tắc cô lập của thiết kế không thay đổi.

### 8.3 Việc định kỳ V2 — KHÔNG thêm cron vào app worker

App worker cố ý **không có binding dữ liệu và không có cron**. Ba việc định kỳ dưới đây đi qua
maintenance của `tenant-worker`, được gọi bởi scheduler nền tảng và có khóa idempotency:

| Việc | Vì sao bắt buộc |
|---|---|
| Nhả **giữ chỗ hết hạn** | Không nhả thì tồn khả dụng **tụt dần không lý do** — hỏng im lặng đúng kiểu nỗi đau #2 nhưng ngược chiều |
| Nhắc kiểm kê định kỳ | Tháng cho kho chính, quý cho kho đầu thừa (K1) |
| Báo cáo cuối ngày cho Chủ xưởng | Nhập/xuất/cắt trong ngày + cảnh báo lệch cân |

Backup D1 → R2 đã có ở tầng vận hành (`server/backups/alu/`), không phải việc của app.

> **Cập nhật thi hành 2026-07-30:** nhả giữ chỗ chạy bằng aggregate command hệ thống nên vẫn có
> audit và chỉ nhả sau `expires_at`; thông báo kiểm kê tháng/quý và báo cáo cuối ngày dùng tên
> idempotent theo kỳ/ngày/người nhận. Báo cáo cuối ngày lấy ngưỡng lệch cân từ `Measurement Profile`
> (mặc định 13% khi profile cũ chưa có giá trị). `/health` công bố lần chạy gần nhất, lỗi và trạng thái stale.

### 8.4 ⚠️ Toolchain — `forge-app.mjs` đòi BUILD trước

Chạy `node scripts/forge-app.mjs briefs/*.json --dry-run` trên checkout sạch thì **lỗi**:
`ERR_MODULE_NOT_FOUND: server/dist/packages/app-registry/src/index.js`.

Phải `pnpm build` trong `server/` trước. **Chưa tài liệu deploy nào ghi bước này** — người mới sẽ tưởng
brief hỏng. Bổ sung vào runbook PHA 7.

---

## 9. SCORECARD CỔNG 3 — tự chấm

| # | Tiêu chí (`field-ledger.md`) | Đạt? | Bằng chứng |
|---|---|---|---|
| 1 | MỌI bảng có ledger đủ cột — đếm rõ | ✅ | **12/12**: sổ SQL §2 · `Batch` §3 · `Item` §4 · 7 danh mục §5 · 6 chứng từ §6–§7 |
| 2 | MỌI bảng có `status` đã khai state machine | ✅ | 6 chứng từ đều có; `Item`/danh mục không có `status` — ghi rõ lý do (§4.2) |
| 3 | Cột hệ thống đủ | ✅ | Forge cấp sẵn `name`/`owner`/`docstatus`/`modified`; sổ có PK 5 cột |
| 4 | Mọi FK trỏ bảng thật, không mồ côi | ✅ | `Batch`·`Item`·`Warehouse`·`UOM`·`Item Color`·`Supplier`·`Measurement Profile`·`Cutting Policy`·`Serial and Batch Bundle` — đều tồn tại (nền tảng hoặc app) |
| 5 | Danh mục tách bảng riêng, không enum cứng giá trị đặc thù | ✅ | 7 danh mục §5 + bảng "enum cứng có lý do" ở BRD §4.2 |
| — | **Forge riêng:** mọi trường có cột "Nhân ĐỌC?" | ✅ | ✅ kèm dòng mã · ❌ kèm "phải viết" · ⬜ chỉ hiển thị |
| — | API/action spec + quyền server | ✅ | §8.1 — 10 action, mỗi cái ghi rõ ghi gì và role nào |
| — | Migration viết dạng văn bản, **chưa chạy** | ✅ | §2.1 — 1 `ALTER TABLE` + 1 `CREATE INDEX` |

**Tự chấm SAU RÀ SOÁT 30/07: 4 đạt / 4 KHÔNG đạt** — bản trước ghi 8/8 là **nói quá** (D5).

| Tiêu chí | Trước | Sau | Vì |
|---|---|---|---|
| 1. Mọi bảng có ledger | ✅ | ⚠️ | Thiếu ledger 3 danh mục: `Lý do huỷ` · `Nguyên nhân chênh lệch` · `Item Allowed Color` (D6) |
| 4. Mọi FK trỏ bảng thật | ✅ | ❌ | Ba FK trên chưa có bảng — scorecard cũ tuyên bố sai |
| Migration đủ | ✅ | ❌ | Thiếu M1b–M1e; cột có mà không ai ghi (D2) |
| Định giá theo lô | ✅ | ❌ | Phạm vi M5 sai chỗ (D4) |
| — | — | ❌ | **D1 — lỗi tiền, chưa từng có trong bất kỳ danh sách nào** |

### Chấm LẠI sau khi đóng D1–D6 (2026-07-30)

Chấm lại từng tiêu chí kèm bằng chứng, không tuyên bố suông.

| # | Tiêu chí | Đạt? | Bằng chứng cụ thể |
|---|---|---|---|
| 1 | Mọi bảng có ledger | ✅ | **15/15** — 12 cũ + 3 danh mục FK bổ sung ở §5.4 |
| 2 | Bảng có `status` khai state machine | ✅ | 6 chứng từ §6–§7; `Item`/danh mục không có `status`, ghi rõ lý do §4.2 |
| 3 | Cột hệ thống đủ | ✅ | Forge cấp `name`/`owner`/`docstatus`/`modified`; sổ có PK 5 cột |
| 4 | Mọi FK trỏ bảng thật | ✅ | D6 đóng — `Lý do huỷ` · `Nguyên nhân chênh lệch` · `Item Color Scope` đã có ledger |
| 5 | Danh mục tách bảng riêng | ✅ | 7 + 3 danh mục; bảng "enum cứng có lý do" ở BRD §4.2 |
| 6 | Cột **Nhân ĐỌC?** kèm bằng chứng mã | ✅ | ✅ có số dòng · ❌ ghi "phải viết" · ⬜ chỉ hiển thị |
| 7 | Kế hoạch sửa mã đủ | ✅ | **13 việc** M1a–e · M2a–c · M3a–d · M4 · M5a–c (§2.2, viết lại sau D1/D2/D4) |
| 8 | Migration dạng văn bản, chưa chạy | ✅ | §2.1 — 1 `ALTER TABLE` + 1 `CREATE INDEX` |
| 9 | Không còn mâu thuẫn nội bộ | ✅ | D3 đóng — grep `Link(Aluminium Batch)` và ``​`batch` trên dòng`` ra 0 kết quả ngoài `DEFECTS.md` |
| 10 | Scorecard nói đúng số | ✅ | D5 đóng — Cổng 1 `4/5`, Cổng 2 `8+2`, không chỗ nào ghi 10/10 |

**Chấm lại: 10/10 — nhưng kèm một khoản nợ đã biết, không giấu:**

> ⚠️ **Brief đang CHẬM hơn thiết kế.** `briefs/alumdoor-v2.json` dừng ở commit `cc5bcd7`, **chưa có**
> 3 danh mục mới của D6, chưa đổi `applies_to` sang bảng con, chưa có `rate_uom` của D1.
> Đây là **việc còn lại của PHA 4**, không phải lỗi thiết kế — nhưng phải đóng trước khi sang PHA 5,
> nếu không brief và ledger lệch nhau ngay từ dòng code đầu tiên.

**PHA 5 vẫn CHƯA được bắt đầu.** Điều kiện vào: brief bắt kịp thiết kế (PHA 4 còn lại) + user duyệt lại Cổng 3.

> **Cập nhật thi hành 2026-07-30:** điều kiện trên đã được đáp ứng; PHA 5 đang chạy trên nhánh
> `feat/alumdoor-v2-kho`. Trạng thái từng lát cắt và bằng chứng test nằm ở
> [`PHASE_TRACKER.md`](PHASE_TRACKER.md). Đoạn “chưa bắt đầu” phía trên được giữ lại như mốc lịch sử
> của lần chấm Cổng 3, không còn là trạng thái hiện hành.

### Hai việc CHỐT Ở PHA 5, không phải lỗ hổng

| # | Việc | Vì sao để lại |
|---|---|---|
| 1 | `ai_logs` tạo mới hay log vào `inbound_events` | Không chặn thiết kế; quyết lúc viết brief |
| 2 | Xác minh 3 cron trong `wrangler.jsonc` | Đọc lúc PHA 4 khi mở worktree |

> **Đã chốt khi thi hành:** tạo bảng `ai_logs` riêng trong migration 0025; ba lịch Alumdoor nối vào
> scheduler dùng chung của `tenant-worker`, không thêm cron hoặc D1 binding cho app worker.

### ⚠️ Ba thứ PHA 5 KHÔNG được làm khác ledger

1. **Không thêm trường giá vốn lên `Batch`** — Forge không có quyền theo trường, thêm là thủng phân quyền im lặng.
2. **Không lưu số lượng trên `Batch`** — `remaining_qty`/`sheet_count`/`remaining_kg` đều cấm.
3. **Không đặt tên khác cho `serial_and_batch_bundle`** — nhân đọc đúng tên đó; đổi tên là lặp lại lỗi đã sinh ra quyển sổ thứ hai.
