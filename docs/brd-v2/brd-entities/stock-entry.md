# E14 — Stock Entry (Phiếu kho)

> ## 🛑 SỬA CƠ CHẾ LÔ 2026-07-30
>
> Mọi chỗ dưới đây khai **`batch` là trường Link trên dòng** đều **SAI CƠ CHẾ**. Nền tảng dùng
> **`Serial and Batch Bundle`**: dòng chứng từ mang `serial_and_batch_bundle:Link(...)`, bundle liệt kê
> `batch_no` + `qty` từng lô. Bản nền tảng của `Stock Entry Detail` đã có sẵn trường tên đó — brief cũ
> khai đè rồi bỏ sót, và đó là gốc của quyển sổ thứ hai.
>
> Đọc [aluminium-batch.md](aluminium-batch.md) §đầu file để biết schema thật và cách sửa.
> Phần nghiệp vụ dưới đây **vẫn đúng** — chỉ đổi chỗ chứa lô.


> Doctype chứng từ · `naming: PK-.YYYY.-####` · **submittable** · child `Stock Entry Item`
>
> Doc-comment bản cũ: *"Phiếu kho ba dụng: NHẬP vật tư về, XUẤT vật tư cho sản xuất, CHUYỂN giữa kho."*
> Khác `Purchase Receipt` ở chỗ **không có nhà cung cấp, không lên công nợ**.

---

## 1. Bản cũ

**Đầu phiếu:** `purpose` Select(Material Receipt, Material Issue, Material Transfer, Manufacture) ·
`company` · `posting_at` · `work_order` · `finished_good_item` · `finished_good_qty` ·
`source_warehouse` · `target_warehouse` · `items` · `note`

**Dòng:** `item_code` · `qty` · `source_warehouse` · `target_warehouse` · `valuation_rate` · `note`
— với ghi chú *"`source_warehouse` / `target_warehouse` là hai tên nhân kho ĐỌC"*.

Kho khai **trên từng dòng** là thiết kế đúng: một phiếu chuyển được nhiều mặt hàng đi nhiều hướng khác
nhau. Giữ nguyên.

---

## 2. Thay đổi V2

| # | Việc | Vì sao |
|---|---|---|
| T1 | Thêm **`serial_and_batch_bundle`** trên dòng — **copy đúng tên trường của `Stock Entry Detail` nền tảng** | QĐ-1. Brief cũ khai đè bằng `Stock Entry Item` và **đánh rơi chính trường này** — đó là gốc của quyển sổ thứ hai |
| T2 | Thêm `weight_kg` trên dòng | QĐ-2 catch weight |
| T3 | Thêm giá trị `purpose = Điều chỉnh tồn` + `adjust_reason` bắt buộc | `screen-catalog` Inventory: *"Không sửa trực tiếp số tồn nếu đã có lịch sử; dùng phiếu điều chỉnh"* — phải có chứng từ để làm việc đó, và phải có **lý do** |
| T4 | `Material Transfer` **không đổi `Batch.received_warehouse`** | Vị trí hiện tại của lô đọc từ sổ, không lưu trên batch — xem [aluminium-batch.md](aluminium-batch.md) §2.1 |

---

## 3. Bốn (giờ là năm) mục đích — mỗi cái một luật

| `purpose` | Kho nguồn | Kho đích | Sổ ghi gì |
|---|---|---|---|
| **Material Receipt** — nhập vật tư về | — | ✅ | +1 dòng dương |
| **Material Issue** — xuất cho sản xuất | ✅ | — | +1 dòng âm |
| **Material Transfer** — chuyển kho | ✅ | ✅ | **2 dòng**: âm ở nguồn, dương ở đích, **cùng `batch_no`**. ⚠️ Xem §4b — cần **hai** bundle |
| **Manufacture** — nhập thành phẩm | ✅ vật tư | ✅ thành phẩm | Trừ vật tư, cộng thành phẩm |
| **Điều chỉnh tồn** ⟵ MỚI | tuỳ dấu | tuỳ dấu | 1 dòng, **bắt buộc `adjust_reason`** |

> **Chuyển kho là hai bút toán cùng batch**, không phải một dòng đổi kho. Vì tồn được đọc theo
> `(item, warehouse, batch)` từ sổ, nên chuyển một phần lô cũng chạy đúng: lô nằm ở hai kho cùng lúc.

---

## 4. Field thêm — dòng phiếu

| Field | Kiểu | Bắt buộc | Validate + câu lỗi | Nghiệp vụ |
|---|---|---|---|---|
| `serial_and_batch_bundle` | Link(Serial and Batch Bundle) | ✅ khi `item.has_batch_no` | bundle phải khớp **item + kho + chiều**; tổng lượng bundle **bằng đúng** `qty` của dòng (`tracking.ts:38-43`) → *"Lô LO-2026-00042 chỉ còn 3 lá ở K36"* | Những lô nào |
| `weight_kg` | Float | ✅ khi `item.has_catch_weight` | — | Kg đi kèm |
| `adjust_reason` | Link(Nguyên nhân chênh lệch) | ✅ khi `purpose = Điều chỉnh tồn` | không bỏ trống → *"Điều chỉnh tồn phải chọn nguyên nhân"* | Dùng chung danh mục với kiểm kê (BRD §4.2) |

---

## 5. Ranh giới với Kiểm kê

Hai thứ dễ lẫn:

| | Dùng khi | Nguồn số |
|---|---|---|
| **Stock Entry** `purpose = Điều chỉnh tồn` | Sửa **một dòng** đã biết rõ sai (nhập nhầm lô, gõ nhầm số) | Người dùng biết số đúng |
| **Stock Reconciliation** (E15) | **Đếm cả kho** rồi so với sổ | Số đếm thực tế, có biên bản, có người chứng kiến |

Điều chỉnh lẻ **không thay được kiểm kê** — nó không có biên bản, không có người thứ hai ký, nên không
dùng để hợp thức hoá chênh lệch lớn. Ngưỡng buộc phải đi đường kiểm kê khai trong Settings.

---

## 6. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 2 | Thùng rác | Không xoá — huỷ có lý do |
| 3 | Audit | Cùng transaction; `Điều chỉnh tồn` ghi thêm lý do vào audit |
| 6 | Mã vạch | Áp dụng — quét lô khi chuyển kho |
| 7 | Kanban | Áp dụng — Nháp → Đã ghi sổ → Đã huỷ |
| 8 | AI | Áp dụng — cảnh báo điều chỉnh bất thường (cùng lô bị điều chỉnh nhiều lần trong tháng) |
| 11 | In ấn | Áp dụng — phiếu kho A5 + QR |
| 13 | Mã tự sinh | `PK-{YYYY}-{####}` |
| 18 | Lịch sử | Áp dụng — timeline lô hiện các lần chuyển kho |
| 19 | Danh mục | `warehouse`, `adjust_reason` |

---

## 7. Test bắt buộc

| Việc | Test |
|---|---|
| Chuyển kho | Chuyển 5 lá lô X từ K36 → K12 → **2 bút toán cùng `batch_no`**: `−5` ở K36, `+5` ở K12 |
| Lô ở hai kho | Sau khi chuyển một phần, `GROUP BY warehouse` của lô X ra **2 dòng** |
| Batch không đổi kho | `Batch.received_warehouse` **không đổi** sau chuyển kho |
| Thiếu ở kho nguồn | Chuyển 10 mà K36 chỉ còn 3 → 422 |
| Điều chỉnh cần lý do | `purpose = Điều chỉnh tồn`, `adjust_reason` trống → 422 |
| Catch weight | Chuyển 5 lá / 14 kg → cả hai cột đều có ở cả hai bút toán |
