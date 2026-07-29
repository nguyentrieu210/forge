# E17 — Stock Reservation (Giữ chỗ tồn)

> Doctype · **HOÀN TOÀN MỚI** — không có ở brief alumdoor lẫn ở nền tảng Forge (đã grep `Reserv` trong
> `packages/`: chỉ ra `Bank Reconciliation`, không liên quan).
>
> Đây là thứ giết **nỗi đau #2**: hiện cả hệ thống không có chỗ nào trả lời được *"bán được bao nhiêu"*.

---

## 1. Vì sao nhôm không giữ chỗ như hàng thường

Hàng thường: *"giữ 10 cái mô tơ"* — khoá 10 bản ghi, xong.

Nhôm thì một đơn cần **"51 lá khổ ≥ 3,5 m"**, không cần lô cụ thể nào. Lúc cắt hệ thống mới chọn lô khổ
nhỏ nhất còn đủ dài để giảm phế. Khoá cứng một lô lúc giữ chỗ là **phá luôn cơ chế chọn lô tối ưu**.

> **Giữ chỗ theo `(mã · màu · tình trạng · khổ TỐI THIỂU)`, KHÔNG khoá lô cụ thể.**

Hệ quả: **tồn khả dụng của nhôm không phải một con số, mà là một bảng theo khổ.**

---

## 2. Luật đọc dồn — chỗ dễ sai nhất

Lá khổ dài dùng được cho cửa ngắn hơn, nên số khả dụng **cộng dồn khi khổ yêu cầu giảm**:

```
AL548 · GHI SẦN · Đã sơn
   khổ ≥ 4,5 m :   12 khả dụng   (tổng  18, giữ chỗ  6)
   khổ ≥ 3,8 m :   52 khả dụng   (tổng  70, giữ chỗ 18)
   khổ ≥ 3,0 m :  145 khả dụng   (tổng 180, giữ chỗ 35)
```

⚠️ **Bẫy: giữ chỗ ở khổ CAO ăn vào cả các mức khổ THẤP hơn, không ngược lại.**

Giữ 6 lá `≥ 4,5 m` thì 6 lá đó cũng biến mất khỏi mức `≥ 3,8` và `≥ 3,0` — vì chúng là cùng những cây
nhôm đó. Nhưng giữ 12 lá `≥ 3,0 m` thì **không** làm giảm mức `≥ 4,5`, vì hệ thống sẽ ưu tiên lấy cây
ngắn cho yêu cầu ngắn.

```
khả_dụng(L) = SUM(tồn của mọi lô có length_m ≥ L)
            − SUM(giữ chỗ có min_length_m ≥ L)
```

Điều kiện `min_length_m ≥ L` chứ không phải `= L` chính là chỗ diễn tả luật trên. Sai thành `=` là
**hứa trùng hàng** mà không có gì báo.

---

## 3. Bảng field

| Field | Kiểu | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `name` | — | ✅ tự sinh | `GC-{YYYY}-{#####}` | — |
| `item_code` | Link(Item) | ✅ | `item.has_batch_no` → mới dùng kiểu giữ chỗ theo khổ | Mã nhôm |
| `color` | Link(Item Color) | — | trống = mọi màu | Để trống khi khách không kén màu |
| `condition` | Select(Thô, Đã sơn, Lỗi) | — | trống = mọi tình trạng | — |
| `min_length_m` | Float | ✅ khi `item.has_batch_no` | `> 0` | **Khổ tối thiểu** — trục của cả cơ chế |
| `warehouse` | Link(Warehouse) | — | chỉ kho có `stock_role = Kho chính` | Trống = mọi kho chính |
| `qty_reserved` | Float | ✅ | `> 0`; **không vượt khả dụng** → *"Chỉ còn 12 lá khổ ≥ 4,5 m khả dụng (tổng 18, đã giữ 6) — không giữ được 20"* | Số lá giữ |
| `source_doctype` | Select(Production Order, Sales Order, Cut Order) | ✅ | — | Giữ cho cái gì |
| `source_name` | Data | ✅ | chứng từ phải tồn tại | — |
| `reserved_at` | Datetime | ✅ | mặc định `Now` | — |
| `expires_at` | Datetime | — | `> reserved_at` | Hết hạn thì **tự nhả**, xem §5 |
| `state` | Select(Đang giữ, Đã dùng, Đã nhả, Hết hạn) | ✅ | mặc định `Đang giữ` | — |
| `released_reason` | Link(Lý do nhả) | ✅ khi `state = Đã nhả` | chip lý do, không bỏ trống | `screen-catalog` Kanban: bước lùi bắt buộc chip |

---

## 4. Mốc giữ chỗ — A3

Chốt: **phát lệnh sản xuất** (không phải báo giá, không phải đơn hàng, không phải lúc cắt).

| Mốc | Vì sao không chọn |
|---|---|
| Báo giá | Quá sớm — khách chưa chốt mà hàng đã khoá, mất cơ hội bán |
| Đơn hàng được duyệt | An toàn nhưng hàng nằm chờ lâu nếu hẹn giao xa ngày |
| **Phát lệnh sản xuất** | ✅ Sát thực tế nhất — mốc xưởng thật sự nhận việc. Sheet `T6` của xưởng ghi sẵn *"kế toán bấm chọn lệnh sản xuất"* nên mốc này **có thật trong quy trình**, không phải mình nghĩ ra |
| Lúc cắt | Quá muộn — hai đơn cùng hứa một số lá, tới lúc cắt mới biết thiếu |

---

## 5. Vòng đời

```
[Phát lệnh SX] → Đang giữ ──(cắt xong)──────→ Đã dùng
                     │
                     ├──(huỷ lệnh, có lý do)─→ Đã nhả
                     └──(quá expires_at)─────→ Hết hạn   (cron sáng tự quét)
```

- **Cắt xong nhả đúng phần đã cắt**, không nhả cả bản ghi: cắt 30/51 lá thì `qty_reserved` còn 21.
- **Nhả bằng cron, không bằng người nhớ.** Không có cron thì giữ chỗ mồ côi tích tụ và tồn khả dụng tụt
  dần mà không ai hiểu vì sao — kiểu hỏng im lặng đúng như nỗi đau #2 nhưng theo chiều ngược lại.
- Giữ chỗ **không sinh bút toán sổ kho**. Nó là lớp phủ trên sổ, không phải sổ. Tồn tổng không đổi.

---

## 6. Ai đọc con số nào

| Ai hỏi | Hỏi gì | Đọc |
|---|---|---|
| Thủ kho | "Trong kho có bao nhiêu?" | **Tồn tổng** |
| Kinh doanh | "Tôi bán được bao nhiêu?" | **Khả dụng** theo bảng khổ |
| Sản xuất | "Cắt được từ cây nào?" | **Khả dụng** + ưu tiên kho Đầu thừa |
| Kế toán | "Tài sản tồn kho bao nhiêu tiền?" | **Tồn tổng** × giá vốn |

Gộp lại thì hỏng theo kiểu im lặng: kinh doanh mở app thấy `348 lá AL548`, hứa hết 348 cho khách mới —
trong khi 300 lá đã hứa cho đơn đang sản xuất. **Không có gì báo lỗi.** Nó chỉ lộ ra khi thợ ra kho cắt
và thiếu hàng, lúc đó đã trót hẹn ngày giao.

---

## 7. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | Không xoá — nhả có lý do, giữ bản ghi |
| 3 | Audit | Tạo/nhả/hết hạn đều ghi audit |
| 4 | Báo cáo | Áp dụng — **báo cáo Tồn khả dụng theo khổ** là màn hình chính của cả app |
| 7 | Kanban | Không áp dụng — vòng đời tuyến tính đơn giản, đã có state |
| 8 | AI | Áp dụng — hỏi *"còn bán được bao nhiêu lá AL548 khổ trên 4 m"* trả lời từ dữ liệu thật |
| 12 | Nhắc | Áp dụng — giữ chỗ sắp hết hạn nhắc người phụ trách lệnh SX |
| 13 | Mã tự sinh | `GC-{YYYY}-{#####}` |
| 18 | Lịch sử | Áp dụng — timeline của lệnh SX hiện giữ bao nhiêu, dùng bao nhiêu, nhả bao nhiêu |
| 19 | Danh mục | `color`, `warehouse`, `released_reason` là Link Field |

---

## 8. Test bắt buộc

| Việc | Test |
|---|---|
| Đọc dồn | Tồn: 18 lá ≥4,5 m · 52 lá 3,8–4,5 m. Giữ 6 lá `≥4,5` → khả dụng `≥4,5` = 12, `≥3,8` = **64** (70−6), KHÔNG phải 70 |
| Chiều ngược | Giữ 12 lá `≥3,0` → khả dụng `≥4,5` **không đổi** = 18 |
| Chặn vượt | Khả dụng 12, giữ 20 → 422 kèm đủ ba số (tổng/đã giữ/khả dụng) |
| Nhả một phần | Giữ 51, cắt 30 → còn giữ 21, `state` vẫn `Đang giữ` |
| Hết hạn | Quá `expires_at` → cron chuyển `Hết hạn`, khả dụng tăng lại |
| Không đụng sổ | Tạo giữ chỗ → `stock_ledger_entries` **không có dòng mới** |
| Hứa trùng | Hai lệnh SX cùng xin 300/348 lá → lệnh thứ hai bị chặn ở 48 lá |
