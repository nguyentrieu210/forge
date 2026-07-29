# E06–E09, E11 — Nhóm danh mục nhỏ

> Gộp 5 doctype danh mục vào một file. Lý do: mỗi cái 3–11 trường, tách ra thành 5 file gần rỗng làm
> loãng chỉ mục mà không thêm thông tin gì. `brd-writing-guide.md` §1.1 đặt ngưỡng tách file để **chống
> tràn context**, không phải để tách bằng mọi giá. Entity nặng vẫn có file riêng.

---

## E06 — Item Group (Nhóm hàng) · tree

**Bản cũ:** `item_group_name` · `parent_item_group` · `is_group` · `default_inventory_account` ·
`default_cogs_account` · `default_income_account` · `default_expense_account` · `disabled`

| Thay đổi V2 | Vì sao |
|---|---|
| **Thêm `default_valuation_method`** Select(FIFO, Bình quân di động) | [item.md](item.md) khai *"`valuation_method` kế thừa `item_group`"* — nhưng nhóm hàng hiện **chỉ có 4 tài khoản mặc định, không có phương pháp giá vốn**. Nếu không thêm thì câu đó là nói suông. TT99/2025 cho phép mỗi nhóm một phương pháp, nên đây là chỗ đúng để khai |
| **Thêm `default_measurement_profile`** Link | Tạo mặt hàng mới trong nhóm "Nhôm cây" thì tự có bộ quy cách, khỏi chọn tay |

| Field | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|
| `item_group_name` | ✅ | UNIQUE | — |
| `parent_item_group` | — | không tạo vòng | Cây nhóm |
| `is_group` | — | **nhóm chứa KHÔNG gán được cho Item** → *"Nhóm «Nguyên vật liệu» là nhóm chứa; hãy chọn một nhóm con"* | Luật này bản cũ đã có (`leafGroup()` trong script nạp định mức đã phải xử) |
| `default_*_account` ×4 | — | — | Item kế thừa khi tạo |
| `default_valuation_method` | — | **MỚI** | Item kế thừa |
| `default_measurement_profile` | — | **MỚI** | Item kế thừa |
| `disabled` | — | chặn tắt khi còn Item đang dùng | — |

---

## E07 — UOM (Đơn vị tính)

**Bản cũ:** `uom_name` · `must_be_whole_number` · `disabled` — gọn và đủ.

`must_be_whole_number` **dùng luôn cho Cây / Lá / Tấm** — khỏi tự chế validate riêng. Đây là ví dụ của
luật "không tự chế thứ đã có".

| Thay đổi V2 | Vì sao |
|---|---|
| **Thêm 2 đơn vị: `LÁ` và `THÂN`** | Nhật ký mua thật dùng 21 đơn vị, danh mục app có 14 ⇒ thiếu. `LÁ` là **đơn vị tự nhiên của lá cửa** — thiếu nó là thiếu đơn vị của mặt hàng chính. `THÂN` dùng 3 lần cho thân mô tơ |
| **Gộp đồng nghĩa, KHÔNG tạo mã mới**: `M` ≡ Mét · `CUỐN` ≡ Cuộn · `TÂM` ≡ Tấm | Đây là **lỗi gõ trong file nguồn**, không phải đơn vị mới. Tạo `CUỐN` bên cạnh `Cuộn` là **chẻ tồn kho làm hai vì một lần gõ nhầm** |
| **KHÔNG tạo**: `BĂNG` · `BẢNG` · `VỈ` · `THÙNG` | Mỗi thứ dùng **đúng 1 lần** — nhiều khả năng là quy cách đóng gói của một lần mua lẻ, không phải đơn vị tồn. Không tạo cho tới khi thấy dùng lại |

---

## E08 — UOM Conversion (child của Item)

**Bản cũ:** `uom` · `conversion_factor` · `note` — và doc-comment của nó đã cảnh báo đúng chỗ:

> *"Nhân đọc đúng hai tên này (`clouderp-core/src/uom.ts:41-49`) — đổi tên là quy đổi im lặng trở về hệ
> số 1, và tồn kho sai gần sáu lần mà không có gì báo."*

| Thay đổi V2 | Vì sao |
|---|---|
| **CHẶN khai cho Item có `has_catch_weight`** | QĐ-2 — `1 cây = khổ × kg/m`, khổ đổi từng lô (đo thật 6,57→8,61 m) ⇒ không tồn tại hệ số tĩnh. Câu lỗi: *"Mặt hàng cân theo kiện không dùng hệ số quy đổi cố định — khối lượng bắt tại từng dòng phiếu nhập"* |

Giữ nguyên cho ray/trục/phụ kiện: `1 Cây = 5,85 Mét`. Và giữ nguyên luật **hệ số trên DÒNG thắng bảng ở
Item** — vì cây nhôm không phải lúc nào cũng đúng 5,85 m.

---

## E09 — Item Color (Màu)

**Bản cũ:** `color_code` · `color_name` · `finish` Select(Thô, Sơn tĩnh điện, Anode, Vân gỗ, Mạ, Khác) ·
`applies_to` **Small Text** · `supplier_color_code` · `disabled`

| Thay đổi V2 | Vì sao |
|---|---|
| Seed **24 màu chuẩn**: 18 sơn tĩnh điện + 5 mạ màu + `THÔ` | Bảng màu chủ xưởng gửi. Bản cũ từng có 13 mã là **chữ viết tắt nhặt từ sheet ĐM**, không phải bảng màu |
| `THÔ` giữ với `finish = Thô` | Nhôm chưa sơn là một **TÌNH TRẠNG** thật, không phải màu sơn. Xoá là 883 lô mất màu mà không có chỗ chuyển tới |
| `9512` → `supplier_color_code` của TRẮNG | Mã sơn RAL của NCC, không phải một màu riêng |
| `applies_to` giữ nguyên **Small Text** | ⚠️ Xem dưới |

**Bảng quy đổi mã cũ — chủ xưởng đã chốt 2026-07-29:**

| Mã cũ | Màu chuẩn | Loại |
|---|---|---|
| `GS` · `VK` · `CF` | GHI SẦN · VÀNG KEM · CAFÉ | STĐ |
| `XF` | **XÁM XINGFA** | STĐ |
| `XLC` | **XANH LÁ CÂY** | STĐ |
| `XN-VK` | XANH NGỌC – VÀNG KEM | Mạ màu |
| `GU-KU` / `KU-GU` | GHI ÚC – KEM ÚC | Mạ màu |
| `XR-CF` | XANH RÊU – CAFÉ | Mạ màu |
| `4004` | ⏳ nghi **ĐỎ ĐÔ** (RAL 4004 là đỏ rượu vang) — **chưa xác nhận**, giữ nguyên tới khi có (Q4) |

⚠️ **`applies_to` không ép được.** Nó là Small Text tự do, và doc-comment bản cũ nói rõ:
*"GHI LẠI chứ chưa CHẶN: luật chặn hiện chạy từ chiều ngược lại (`Item.allowed_colors`)."* Muốn ép thật
phải đổi thành bảng con Link(Item Group) — xem câu hỏi I4 ở [item.md](item.md).

---

## E11 — Supplier (Nhà cung cấp)

**Bản cũ:** `supplier_name` · `supplier_group` Select(Nhôm, Mô tơ, Sơn, Phụ kiện, Vận chuyển, Khác) ·
`account_manager` · `contact_person` · `phone` · `email` · `address` · `tax_id` · `payment_terms` ·
`note` · `disabled`

| Thay đổi V2 | Vì sao |
|---|---|
| **Thêm `receipt_tolerance_pct`** Float, mặc định **5** | Dung sai giao hàng ±5% ([purchase-receipt.md](purchase-receipt.md) §3). Khai theo NCC vì mỗi bên có thói quen khác nhau. `operator-convenience` #44: *"MỌI ngưỡng nghiệp vụ chỉnh được trong Settings — cấm hardcode"* |
| `phone` validate SĐT VN | `form-workflow-contract`: 10 số, đầu 03/05/07/08/09, tự normalize `+84`→`0` |

**Seed từ nhật ký mua thật:** TIẾN ĐẠT (Nhôm, 76 dòng) · ANH ĐẠT MOTOR (Mô tơ, 29) · VIỆT ĐÔNG HƯNG (16) ·
PHÚ XUÂN VIỆT (8) · BỘT SƠN TI GIA (Sơn, 8) · ANH HUY BẠC ĐẠN (Phụ kiện, 7) · NHỰA APC · NAM PHÁT ·
QUỐC HUY 2 (6 mỗi bên) · **HẢI KỲ** (Sơn — gia công sơn thuê ngoài).

---

## Nghiệp vụ bắt buộc — chung cho cả 5

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | Không xoá khi còn tham chiếu — chỉ `disabled`, báo rõ *"Đang dùng ở N bản ghi"* |
| 3 | Audit | Đổi `default_valuation_method`, `conversion_factor`, `receipt_tolerance_pct` ghi trước→sau |
| 7 | Kanban | Không áp dụng — danh mục không có giai đoạn |
| 8 | AI | Chỉ E09: gợi ý màu gần giống khi gõ, **không tự gán** |
| 18 | Lịch sử | Áp dụng ở mức đổi hằng số |
| 19 | Danh mục | Cả 5 **là** danh mục — sidebar có mục "Danh mục" riêng, không chìm trong Cài đặt |
