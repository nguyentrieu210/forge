# E03 — Stock Ledger Entry (Sổ kho)

> **Tầng LEDGER — cột SQL thật**, bảng `stock_ledger_entries`. Đổi cột = **phải viết migration**.
>
> Đây là **quyển sổ DUY NHẤT** của tồn kho sau QĐ-1. Mọi thay đổi tồn — nhập, xuất, chuyển, cắt, kiểm kê
> — đều thành dòng ở đây. Không có bảng tồn nào khác được phép ghi.

---

## 1. Schema hiện có (đã xác minh trên D1 `cloudforge-alu` 2026-07-29)

```sql
CREATE TABLE stock_ledger_entries (
  tenant_id TEXT NOT NULL,
  voucher_type TEXT NOT NULL,
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL,
  line_key TEXT NOT NULL,
  item_code TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  actual_qty_micros INTEGER NOT NULL,
  valuation_rate_minor INTEGER NOT NULL CHECK (valuation_rate_minor >= 0),
  stock_value_difference_minor INTEGER NOT NULL,
  qty_scale INTEGER NOT NULL DEFAULT 6 CHECK (qty_scale=6),
  currency_scale INTEGER NOT NULL CHECK (currency_scale BETWEEN 0 AND 6),
  currency TEXT NOT NULL,
  posting_at TEXT NOT NULL,
  batch_no TEXT,          -- ĐÃ CÓ SẴN, chưa ai dùng
  serial_no TEXT,
  allow_negative_stock INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative_stock IN (0,1)),
  PRIMARY KEY (tenant_id, voucher_type, voucher_no, voucher_revision, line_key)
)
```

Thiết kế sẵn có **đúng và giữ nguyên**: số lượng lưu **micros** (`qty_scale = 6`), tiền lưu **minor
integer** — không có số thực dấu phẩy động trong sổ, nên không có sai số cộng dồn.

---

## 2. Thay đổi V2

| # | Thay đổi | Vì sao | Cần migration? |
|---|---|---|---|
| M1 | **Thêm cột `actual_weight_micros INTEGER`** | QĐ-2 catch weight — mỗi dòng sổ mang **hai** con số: số lượng (cây/lá) và khối lượng (kg) | ✅ `ALTER TABLE ADD COLUMN` — nullable, mặc định NULL cho dòng cũ |
| M2 | **Thêm index** `(tenant_id, item_code, warehouse, batch_no, posting_at)` | Replay giá vốn **thu hẹp theo batch** phải nhanh; không có index thì mỗi lần cắt quét cả sổ | ✅ `CREATE INDEX` |
| M3 | Sửa `deriveOutgoingValuation` nhận thêm `batchNo`; `getStockLedgerHistory` lọc `batch_no` khi `item.has_batch_no` | QĐ-1 — hiện định giá **bỏ qua lô** dù cột có sẵn | ❌ chỉ sửa mã |
| M4 | Sửa `normalizeValuationMethod` — giá trị lạ **TỪ CHỐI** thay vì âm thầm thành FIFO | `valuation.ts:18` | ❌ chỉ sửa mã |

> **M1 không phá dữ liệu cũ:** cột nullable. Dòng sổ của mặt hàng không catch-weight để NULL vĩnh viễn.
> Nhưng **tenant `alu` hiện có 0 dòng sổ** (chủ xưởng đã xoá sạch để làm lại) nên lần này không có dữ
> liệu cũ để lo — điều kiện thuận lợi hiếm có, đúng lúc để đổi schema sổ.

---

## 3. Bảng field

| Field | Kiểu SQL | Ràng buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `tenant_id` | TEXT | PK, NOT NULL | — | Khách nào |
| `voucher_type` | TEXT | PK, NOT NULL | ∈ {Purchase Receipt, Delivery Note, Stock Entry, Stock Reconciliation, Cut Order} | Chứng từ nào sinh ra dòng này |
| `voucher_no` | TEXT | PK, NOT NULL | chứng từ phải tồn tại và `docstatus = 1` | Số chứng từ |
| `voucher_revision` | INTEGER | PK, NOT NULL | tăng khi chứng từ bị sửa/đảo | Cho phép đảo bút toán mà **không xoá dòng cũ** |
| `line_key` | TEXT | PK, NOT NULL | duy nhất trong 1 chứng từ | Dòng thứ mấy của chứng từ |
| `item_code` | TEXT | NOT NULL, FK→Item | mặt hàng phải `is_stock_item` → *"«X» không phải hàng tồn kho"* | — |
| `warehouse` | TEXT | NOT NULL, FK→Warehouse | phải là **kho lá** → *"«Kho Alumdoor» là nút nhóm, không phát sinh tồn"* | — |
| `batch_no` | TEXT | nullable, FK→Aluminium Batch | **BẮT BUỘC khi `item.has_batch_no`** → *"Mặt hàng «X» quản lý theo lô — phải chọn lô"* | ⚠️ Trước V2 cột này bỏ trống hoàn toàn. Đây là mắt xích của QĐ-1 |
| `actual_qty_micros` | INTEGER | NOT NULL | `≠ 0`; âm = xuất, dương = nhập | **Số lượng theo `item.stock_uom`** — với nhôm là **Cây/Lá**, không phải Kg (QĐ-2) |
| `actual_weight_micros` | INTEGER | **MỚI**, nullable | BẮT BUỘC khi `item.has_catch_weight` → *"Mặt hàng cân theo kiện phải ghi khối lượng"*; cùng dấu với `actual_qty_micros` | **Kg thực cân** — catch weight. Nguồn cho giá vốn và công nợ NCC |
| `valuation_rate_minor` | INTEGER | NOT NULL, `≥ 0` | — | Giá vốn một đơn vị tồn tại thời điểm này |
| `stock_value_difference_minor` | INTEGER | NOT NULL | — | Ảnh hưởng lên sổ cái của dòng này |
| `qty_scale` | INTEGER | NOT NULL, `= 6` | — | Số lượng lưu micros — cố định |
| `currency_scale` | INTEGER | NOT NULL, 0–6 | — | VND scale 0 |
| `currency` | TEXT | NOT NULL | `= VND` | — |
| `posting_at` | TEXT | NOT NULL | ISO; **không vượt kỳ đã khoá** → *"Kỳ kế toán tháng 6/2026 đã khoá — không ghi sổ lùi ngày được"* | Thứ tự replay giá vốn |
| `serial_no` | TEXT | nullable | không dùng trong V2 | — |
| `allow_negative_stock` | INTEGER | NOT NULL, 0/1 | mặc định 0 | Bật cần quyền Chủ xưởng |

---

## 4. Bất biến của sổ — không thương lượng

1. **Chỉ INSERT, không UPDATE, không DELETE.** Sửa = ghi `voucher_revision` mới + bút toán đảo. Bản ghi cũ
   nằm nguyên để kiểm toán soi.
2. **Không ai ghi thẳng vào sổ.** Mọi dòng sinh ra từ một chứng từ đã ghi sổ. Không có màn hình nào cho
   người dùng gõ số tồn (`screen-catalog` mục Inventory).
3. **`batch_no` bắt buộc khi mặt hàng theo lô** — thiếu là từ chối ghi, không ghi NULL rồi tính sau.
4. **Giá vốn thu hẹp theo batch** khi `item.has_batch_no`. Một batch nhập một lần ⇒ hàng đợi FIFO có đúng
   một lớp ⇒ đích danh. Đây là điều làm cho *vật lý* và *kế toán* trùng nhau.
5. **Khoá kỳ là bắt buộc, không phải tuỳ chọn.** Giá trị mỗi dòng phụ thuộc mọi dòng trước nó — chèn lùi
   ngày là phải tính lại toàn bộ dòng sau. ERPNext gọi việc này là *Repost Item Valuation* và ghi rõ nó
   *"chậm và tốn tài nguyên"*. Bảng `accounting_period_locks` đã có sẵn trong D1 — V2 phải dùng thật.

---

## 5. Vì sao lỗi cũ biến mất

| Trước V2 | Sau V2 |
|---|---|
| `cut.propose` chọn lô khổ nhỏ nhất còn đủ dài → cắt lô B. Định giá replay theo `(item, warehouse)` → trừ tiền lô A cũ hơn. **Sổ vẫn cân, không ai biết.** | Định giá replay theo `(item, warehouse, batch_no = B)` → trừ đúng tiền lô B |
| Kg ở sổ, cây/lá ở doctype riêng → hai quyển sổ, phải viết hook nối | Cả hai nằm trên **cùng một dòng sổ** (`actual_qty_micros` + `actual_weight_micros`) — không còn gì để nối |
| Không biết còn bán được bao nhiêu | `SUM` theo batch, trừ giữ chỗ E17, nhóm theo `length_m` → bảng khả dụng cộng dồn theo khổ |

---

## 6. Test bắt buộc (`testing-contract.md`)

| Pattern | Test cụ thể |
|---|---|
| Giá vốn theo lô | Nhập lô A 100 cây @98k, hôm sau lô B 100 cây @105k. Cắt từ **lô B** → `stock_value_difference` phải theo **105k**, KHÔNG phải 98k |
| Catch weight | Nhập 200 cây / 560,16 kg → sổ có `actual_qty_micros = 200e6` **và** `actual_weight_micros = 560.160.000` |
| Bắt buộc batch | Ghi sổ mặt hàng `has_batch_no` mà thiếu `batch_no` → 422 *"Mặt hàng «X» quản lý theo lô — phải chọn lô"* |
| Khoá kỳ | Ghi sổ `posting_at` thuộc kỳ đã khoá → 422, không tạo dòng |
| Bất biến | `UPDATE`/`DELETE` thẳng vào `stock_ledger_entries` → bị trigger chặn |
| Phương pháp lạ | `item.valuation_method = "LIFO"` → **từ chối**, không âm thầm thành FIFO |
| Đảo bút toán | Huỷ phiếu nhập → sinh dòng `voucher_revision + 1` đối dấu; dòng cũ còn nguyên; tồn về 0 |

---

## 7. Câu hỏi còn mở

| # | Câu hỏi | Chặn gì |
|---|---|---|
| S1 | Khoá kỳ theo **tháng** hay theo **ngày chốt tay**? | Thiết kế `accounting_period_locks` |
| S2 | Ai được mở lại kỳ đã khoá? | Ma trận quyền §6 — mặc định đề xuất: chỉ Chủ xưởng, bắt buộc nhập lý do |
