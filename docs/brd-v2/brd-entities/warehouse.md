# E05 — Warehouse (Kho)

> Doctype danh mục · **tree** · `naming: field:warehouse_name`

---

## 1. Bản cũ

```
warehouse_name:Data*!  ·  parent_warehouse:Link(Warehouse)  ·  is_group:Check
address:Small Text  ·  keeper:Data  ·  disabled:Check
```

Cây kho đã đúng. Hai chỗ cần sửa, một chỗ cần thêm.

---

## 2. Thay đổi V2

| # | Việc | Vì sao |
|---|---|---|
| W1 | `keeper` đổi từ **Data** → **Link(User)** | Thủ kho phụ trách kiểu chuỗi tự do thì không dùng để giới hạn quyền được, cũng không gửi thông báo cho ai được. Gõ "Anh Tuấn" hay "tuấn kho" đều lưu được và không khớp gì |
| W2 | Thêm **`stock_role`** | Phân biệt kho chính / đầu thừa / phế / gửi gia công — quyết định kho nào vào tồn khả dụng |
| W3 | Thêm **`is_available_for_sale`** (dẫn xuất từ `stock_role`, chỉ đọc) | Kho Đầu thừa và kho Gia công ngoài **bị loại khỏi tồn khả dụng** |

---

## 3. Bảng field

| Field | Kiểu | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `warehouse_name` | Data | ✅ | UNIQUE | Tên kho |
| `parent_warehouse` | Link(Warehouse) | — | không tự trỏ chính nó; không tạo vòng → *"Kho cha tạo thành vòng lặp"* | Cây kho |
| `is_group` | Check | — | **kho nhóm KHÔNG được phát sinh tồn** → *"«Kho Alumdoor» là nút nhóm, không phát sinh tồn — chọn kho con"* | Nút chứa |
| `stock_role` | Select(Kho chính, Kho đầu thừa, Kho phế, Kho gửi gia công) | ✅ | mặc định `Kho chính` | **MỚI** — xem §4 |
| `is_available_for_sale` | Check | — (dẫn xuất, chỉ đọc) | — | `Kho chính` = ✔; ba loại còn lại = ✘ |
| `keeper` | Link(User) | — | user phải còn hoạt động | **Đổi kiểu (W1)** — dùng để scope quyền và gửi thông báo |
| `address` | Small Text | — | — | Địa chỉ |
| `disabled` | Check | — | **chặn tắt khi còn tồn** → *"Kho K12 còn 143 bản ghi tồn — chuyển hết hàng đi trước khi ngừng dùng"* | Ngừng dùng |

---

## 4. `stock_role` — vì sao cần

| Vai trò | Vào tồn khả dụng? | Dùng cho |
|---|---|---|
| **Kho chính** | ✅ | K36 (NVL nhôm) · K12 (cửa sắt, motor, phụ kiện) |
| **Kho đầu thừa** | ❌ | Đoạn dư sau khi cắt. **Loại khỏi khả dụng** để đề xuất cắt chỉ nhìn kho chính, rồi mới quay lại vét đầu thừa (chuẩn ngành — xem [cut-order.md](cut-order.md) §5) |
| **Kho phế** | ❌ | Ngắn hơn `scrap_threshold_m` hoặc lá lỗi — bán phế theo kg |
| **Kho gửi gia công** | ❌ | Nhôm đang ở chỗ sơn Hải Kỳ. **Vẫn là tài sản của xưởng**, nhưng không bán được vì không nằm trong kho |

> Kho gửi gia công là chỗ mà xưởng hiện **không nhìn thấy gì cả**. Nhôm đi sơn rồi thì trên sổ nó biến
> mất cho tới lúc quay về. Sơn thuê ngoài Hải Kỳ đã được xác nhận có thật (sheet `CHI TIẾT SƠN` có bảng
> giá gia công theo từng loại cửa), nên kho này chuẩn bị sẵn chỗ dù luồng sơn nằm **ngoài phạm vi V2**.

---

## 5. Cây kho chốt cho Alumdoor

```
Kho Alumdoor            (is_group ✔ — không phát sinh tồn)
├── K36                 Kho chính  — NVL nhôm
├── K12                 Kho chính  — cửa sắt, thép, motor, phụ kiện rời
├── Đầu thừa            Kho đầu thừa
├── Phế                 Kho phế
└── Gửi gia công        Kho gửi gia công  (dựng sẵn, chưa dùng ở V2)
```

⚠️ **Q5 vẫn treo**: chia thật giữa K36 / K12 thế nào. Bản cũ gán **toàn bộ 1.257 lô vào K36** chỉ vì file
Excel nguồn không có cột kho — một giả định, không phải sự thật. Tenant đã xoá sạch nên lần này nhập lại
là cơ hội gán đúng ngay từ đầu.

---

## 6. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | Không xoá khi còn tồn hoặc còn bút toán — chỉ `disabled` |
| 3 | Audit | Đổi `stock_role` ghi audit — đổi vai trò kho là đổi tồn khả dụng của cả xưởng |
| 7 | Kanban | Không áp dụng |
| 8 | AI | Không áp dụng |
| 18 | Lịch sử | Áp dụng — đổi thủ kho, đổi vai trò |
| 19 | Danh mục | Chính nó là danh mục (BRD §4.2) |

---

## 7. Câu hỏi còn mở

| # | Câu hỏi | Chặn gì |
|---|---|---|
| W-Q1 | Chia thật K36 / K12 (trùng Q5) | Seed dữ liệu ban đầu |
| W-Q2 | Đầu thừa để **một kho chung** hay **mỗi kho chính một kho đầu thừa con**? | Nếu thợ K36 không lấy được đầu thừa để ở K12 thì phải tách |
