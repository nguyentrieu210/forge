# SỔ LỖI THIẾT KẾ — rà soát 2026-07-30

> 6 phát hiện từ vòng rà độc lập. **Cả 6 đều đúng.** Ghi ở đây thay vì sửa lặng lẽ, vì hai trong số
> đó làm **sai tiền** và một cái làm **scorecard nói quá**.

---

## D1 · P0 — Giá trị nhập kho tính sai khi catch weight

`clouderp-core/src/controllers.ts:221` và `:239`:

```ts
const value = multiplyScaled(item.qty, 6, item.valuation_rate ?? item.rate, …);
```

Giá trị = **`qty` × `rate`**. QĐ-2 đặt `qty` của nhôm là **số CÂY**, còn NCC báo giá **đ/kg**
(bảng giá thật: 98.000–107.000 đ/kg).

| | Nhập 200 cây · 1.200 kg · 100.000 đ/kg |
|---|---|
| Nhân ghi | `200 × 100.000` = **20.000.000** |
| Đúng phải là | `1.200 × 100.000` = **120.000.000** |

**Sai 6 lần, và sổ vẫn cân** — đúng kiểu hỏng mà cả dự án này sinh ra để chống.

Điều trớ trêu: doc-comment ngay trên dòng đó đã cảnh báo một biến thể khác của chính lỗi này
(*"117 mét × giá-một-cây, tồn kho phình lên gần sáu lần"*). Thiết kế V2 đọc được cảnh báo ấy mà
**vẫn không nối `rate` với đơn vị của nó**.

### Phải chốt: `rate` tính theo đơn vị nào

| Cách | Việc phải làm | Đánh đổi |
|---|---|---|
| **A. `rate` theo `weight_uom`** (đ/kg) | Giá trị = `actual_weight_kg × rate`; `valuation_rate_minor` = `value ÷ qty_bar` | Khớp hoá đơn NCC — số người nhập gõ đúng thứ họ đọc trên giấy |
| B. Quy `rate` về đ/cây khi nhập | Người nhập tự chia, hoặc client tự tính | Bắt người dùng nhẩm; lệch làm tròn |

⇒ **Chọn A.** Nhưng phải khai rõ **`rate_uom`** trên dòng chứng từ, nếu không lại là một đơn vị ngầm nữa.

---

## D2 · P0 — `actual_weight_micros` mới chỉ có trong tài liệu

Migration ở `TECHNICAL_DESIGN.md §2.1` thêm cột SQL. Nhưng trường **chưa tồn tại** ở:

| Nơi | Bằng chứng |
|---|---|
| Kiểu `StockLedgerEntry` | `contracts/src/index.ts` — đã đọc, không có trường |
| Câu INSERT vào D1 | `document-kernel/src/d1-store.ts:628` |
| `TrackedStockRequest` | `clouderp-stock/src/tracking.ts:7` |

⇒ Chạy migration xong thì **mọi bút toán mới vẫn để khối lượng NULL**. Danh sách M1–M5 của em
**thiếu ba chỗ sửa**. Bổ sung:

- **M1b** `contracts/src/index.ts` — thêm `actual_weight_micros?: number` vào `StockLedgerEntry`
- **M1c** `d1-store.ts` — thêm cột vào INSERT và vào SELECT của `getStockLedgerHistory`
- **M1d** `tracking.ts` — `TrackedStockRequest.weightMicros`, chia theo tỉ lệ như `stockValueMinor`
- **M1e** `in-memory-store.ts` — cùng trường, nếu không test xanh giả

---

## D3 · P0 — Hồ sơ entity tự mâu thuẫn, chưa giao build được

`delivery-note.md` **dòng 49** vẫn ghi *"D4 · Thêm `batch` trên dòng"*, trong khi **dòng 59** đã
đổi sang `serial_and_batch_bundle`. Banner cảnh báo ở đầu file **không xoá được mâu thuẫn bên trong**.

Tình trạng tương tự ở `cut-order.md`, `stock-entry.md`, `purchase-receipt.md`, `aluminium-batch.md` —
em mới sửa **bảng field**, chưa sửa **bảng "Thay đổi V2"** phía trên.

⇒ Phải rà từng file, xoá hết dòng khai `batch` như trường Link. **Chưa làm xong thì chưa phải đặc tả
giao thẳng cho build được** — đúng như nhận xét.

---

## D4 · P1 — Định giá theo lô chưa có luồng chạy hoàn chỉnh

M5 của em chỉ trỏ `tracking.ts:65`. Nhưng vấn đề nằm **phía trên**: caller tính giá cho **cả dòng**
rồi mới đưa xuống bundle.

| Nơi | Bằng chứng |
|---|---|
| Delivery Note | `clouderp-selling/src/controllers.ts:217` |
| Stock Entry | `clouderp-erpnext/src/controllers.ts:104` |

Thiết kế **phải chốt một trong hai**, không được để mở:

| Cách | Nội dung | Đánh đổi |
|---|---|---|
| **A. Một dòng chứng từ = một batch** | Bundle chỉ được 1 entry cho item catch-weight | Đơn giản; nhưng cắt từ 3 lô phải thành 3 dòng — mất cái lợi của bundle nhiều dòng |
| **B. Nạp bundle TRƯỚC, định giá từng batch** | Caller đọc bundle → với mỗi entry gọi `deriveOutgoingValuation(batchNo)` → dựng SLE riêng | Đúng nghiệp vụ; sửa nhiều hơn: 2 caller + `tracking.ts` |

⇒ **Chọn B** — vì A phá chính lý do dùng bundle. Nhưng B đụng cả `clouderp-selling` và
`clouderp-erpnext`, không chỉ `tracking.ts`. **M5 phải viết lại phạm vi.**

---

## D5 · P1 — Scorecard nói quá

| Chỗ | Đã ghi | Sự thật |
|---|---|---|
| Cổng 1 | tự chấm **4/5 + 1 ⚠️** rồi ngay sau đó ghi "đã duyệt" | Mục ⚠️ (*giá phải trả*) chỉ được trả lời ở Cổng 2, không phải lúc qua Cổng 1 |
| Cổng 2 | tài liệu ghi **8 ✅ + 2 ⚠️**, nhưng tin nhắn của agent nói **"10/10"** | Nói quá. Hai mục ⚠️ vẫn là ⚠️ |
| Cổng 2 tiêu chí 2 | "26 màn / 26 khai" | Phần lớn chỉ **trỏ sang file entity**, không có Screen Spec 6 khối riêng. Đây là **bảng chỉ mục**, không phải card |

⇒ Sửa cả ba chỗ về đúng con số. **Không nâng điểm bằng cách đổi cách đếm.**

---

## D6 · P1 — Master data và FK chưa nhất quán

| Mâu thuẫn | Nơi |
|---|---|
| `Item Color.applies_to`: BRD chốt đổi thành **bảng con Link(Item Group)**, TECHNICAL_DESIGN vẫn ghi **Small Text không ép được** | `BRD.md:770` vs `TECHNICAL_DESIGN.md:257` |
| `Lý do huỷ` · `Nguyên nhân chênh lệch` · `Item Allowed Color` được dùng làm FK nhưng **không có ledger riêng** | scorecard tiêu chí 4 vẫn ghi *"mọi FK trỏ bảng thật"* |

⇒ Ba danh mục trên phải có ledger, và `applies_to` phải thống nhất một phía. Scorecard tiêu chí 4
**chưa đạt** cho tới lúc đó.

---

## Trạng thái sau rà soát

**Cổng 3 KHÔNG còn 8/8.** Đánh giá lại:

| Tiêu chí | Trước | Sau |
|---|---|---|
| 1. Mọi bảng có ledger | ✅ | ⚠️ thiếu 3 danh mục (D6) |
| 4. Mọi FK trỏ bảng thật | ✅ | ❌ **D6** |
| Migration đủ | ✅ | ❌ **D2** — thiếu 4 chỗ sửa mã |
| Định giá theo lô | ✅ | ❌ **D4** — phạm vi M5 sai |
| — | — | ❌ **D1** — lỗi tiền, chưa có trong bất kỳ danh sách nào |

**Kết luận: PHA 5 chưa được bắt đầu.** Phải đóng D1–D4 trước, và sửa scorecard về số thật.
