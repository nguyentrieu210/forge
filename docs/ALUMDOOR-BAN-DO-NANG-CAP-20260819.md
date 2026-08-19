# Alumdoor — bản đồ nâng cấp nền tảng danh mục

*Đo bằng `server/scripts/audit-alumdoor-catalog-foundation.mjs` (đọc-chỉ). Mọi con số dưới đây
lấy từ D1 thật, không phải ước lượng. App ở `2.9.0`.*

---

## 1. Đo được gì, sửa được gì

| Hạng mục | Trước | Sau | Còn lại |
|---|---:|---:|---|
| Liên kết treo (giá trị) | 16 | **2** | 2 = xung đột dữ liệu, cần chủ xưởng |
| Trường tính toán thiếu mô tả tiếng Việt | 118 | **0** | — |
| Màn danh mục đáng ngờ | 45 | **38** | 25 rỗng+không ai dùng (đều đã ẩn khỏi menu) |
| Mã nhồi thuộc tính | 385 | **298** | cần quyết định gộp |
| Mã có dấu cách | 117 | **0** | — |
| Tên hàng trùng nhau | 39 nhóm | 39 nhóm | cần chủ xưởng |

---

## 2. Đã làm

### Liên kết — 14/16 giá trị treo đã nối lại

| Chỗ hỏng | Số | Bản chất | Cách sửa |
|---|---:|---|---|
| `BOM Rule.source_field` → `billable_area_sqm` | 11 | Geometry Field chưa từng được khai, dù 11 quy tắc đã trỏ vào (vd "20 CÁI/M2") | Khai vào danh mục, trục `OTHER` |
| `BOM Rule.result_uom` → `KG/CÁI`, `KG/CẶP`, `KG/M2` | 3 | Tỉ số nhét vào ô đơn vị — ô đó là Link(UOM) nên không bao giờ khớp | Đơn vị là `Kg`; **mẫu số chép sang `source_note`** để không mất bằng chứng |
| `Bill of Materials.item` trỏ mã không tồn tại | 2 | Xem mục 4 | Không sửa — xung đột dữ liệu |

### Mô tả tiếng Việt — 119 ô

Khai theo **tên trường**, không theo doctype: `stock_qty` mang cùng nghĩa ở chín chứng từ nên
mô tả một lần rồi áp cho cả chín, thay vì chép chín lần rồi để chúng trôi dạt.

Việc nở khai rút gọn dùng `parseField` của chính bộ biên dịch. Chú thích trong đó nói thẳng lý
do: `notes:Small Text Ghi chú` mà cắt theo dấu cách đầu tiên thì ra kiểu trường tên "Small" —
đúng cái bẫy regex tự viết sẽ mắc.

### Mã đơn giản — 117 mã bỏ dấu cách

Không phải chuyện thẩm mỹ. Bằng chứng nằm ngay trong dữ liệu: `DM-2026-0207/0208` trỏ vào
`TP-CUADL1LY-XN-VK_TRONBO_3-4M` trong khi mã thật là `TP-CUADL1LY XN-VK_TRONBO_3-4m²` — ai đó
gõ tay và thay dấu cách bằng gạch ngang. Mã có dấu cách còn vỡ khi xuất Excel và khi in mã vạch.

Phép biến đổi cố ý **hẹp**: chỉ thay khoảng trắng thành gạch ngang. Không đụng hoa/thường,
không bỏ dấu tiếng Việt — mỗi thứ đó là một quyết định riêng, trộn vào một lượt thì không ai
soát được nữa.

### Nối dây hai danh mục dựng cùng ngày nhưng chưa ai đọc

| Danh mục | Dòng | Nối vào đâu |
|---|---:|---|
| `Ngưỡng chọn Motor` | 17 | `alumdoor.motor.suggest` — diện tích → motor, tải motor → bình lưu điện |
| `Nguyên nhân cửa lỗi` | 11 | `Warranty Claim.issue_cause` đổi Select → Link |

Audit bắt được đúng chỗ này: danh mục có dữ liệu, lên menu, nhưng không trường nào trỏ tới và
không đoạn mã nào đọc. Dựng kho mà chưa nối dây thì người bán vẫn phải nhớ bảng trong đầu.

### Màn Danh mục

Con số cạnh mỗi tiêu đề nhóm đang đếm **số đường dẫn**, nhưng đặt cạnh "Vật tư & quy cách" thì
người đọc hiểu là số mặt hàng. Bỏ. Thay bằng **số bước**, vì thứ tự các nhóm thật sự là thứ tự
phải khai — không có đơn vị tính thì không tạo được mặt hàng, không có mặt hàng thì không có
giá lẫn định mức.

---

## 3. Trạng thái theo tầng

| Tầng | Bản ghi | Nhận xét |
|---|---:|---|
| L0 nền tảng | 115 | Đủ. Hai kho dữ liệu khớp nhau |
| L1 quy cách kỹ thuật | 57 | Đủ |
| L2 mặt hàng | 587 | Mã sạch dấu cách; **còn nhồi thuộc tính** |
| L3 giá | 653 | `area_tier` = 0/558 — danh mục 8 bậc đứng không |
| L4 định mức / sản xuất | 771 | `sales_mode` = 0/349 |
| L5 đối tác | 466 | `Supplier Item` rỗng — đã ẩn khỏi menu |
| L6 vận hành / địa bàn | 3.380 | `Địa chỉ giao lắp` rỗng |

**Nút thắt duy nhất:** L2, L3, L4 khoá lẫn nhau. Chỗ chứa đã dựng (`Bậc diện tích`, `area_tier`,
`sales_mode`) nhưng dữ liệu chưa chuyển vào, nên "một mặt hàng, tám mức giá" vẫn đang là **tám
mã hàng**. Gỡ được nút này thì cả ba tầng xong cùng lúc.

---

## 4. Cần chủ xưởng quyết — máy không thay được

| Việc | Số | Vì sao |
|---|---:|---|
| Họ mã gộp | 52 họ (215 mã) | "Hai mã này có phải cùng một mặt hàng không" |
| Tên hàng trùng | 39 nhóm (99 mã) | `PULY 140` có cả `PK-PULY-140` lẫn `PK-PL140` |
| Mã vượt 24 ký tự | 13 | Rút gọn là đặt tên |
| Mã nhồi cách bán / bậc diện tích / màu / độ dày | 96 / 88 / 85 / 29 | Rút ra khỏi mã = gộp mã, xem hàng đầu |
| 2 định mức mồ côi | 2 | Xem dưới |
| 3 `spec_code` trùng chữ | 3 | Xác nhận là trùng, không phải liên kết |
| Nguyên nhân "Vận chuyển/lắp đặt" | — | Select cũ có nhóm này, danh mục chưa có nguyên nhân tương ứng |

### 2 định mức mồ côi — vì sao không tự sửa

`DM-2026-0207/0208` trỏ vào mã gõ sai. Nhưng:

- Mặt hàng thật **đã có** định mức riêng (`DM-2026-0212/0213`) → sửa trỏ sẽ thành hai định mức
  cho một mặt hàng, tệ hơn hiện trạng.
- Bản mồ côi mang **số lượng thật** (1.312, 11.64) trong khi bản đang gắn đúng mặt hàng để
  trống 3/4 dòng → xoá là mất số.

Bản nào là bản chuẩn thì chỉ chủ xưởng trả lời được. Adapter ghi nhận và đi tiếp, có log
`ALUMDOOR_LINK_REPAIR_BOM_CONFLICT`.

---

## 5. Hai lỗi của chính bộ đo

Ghi lại vì cả hai đều suýt dẫn tới hành động sai.

**"Không ai trỏ tới" ≠ "không ai dùng".** Bản đầu báo `Item Price` (558), `Pricing Rule` (83),
`BOM Rule` (110) là danh mục vô chủ — trong khi chúng là đầu vào chính của máy tính giá và máy
định mức. Chúng được đọc thẳng bằng tên doctype trong mã nguồn, không qua trường Link. Nếu tin
báo cáo mà đi gỡ menu thì hỏng đúng ba màn quan trọng nhất.

**Chuỗi con không phải tham chiếu.** Cổng chặn báo `deferred_components_json` còn mã chết, soi
ra là `"source_item_code":"NVL-RNINOX-DR"` chứa `RNINOX-DR` — chuỗi con của một mã **khác**, mà
mã khác đó còn không tồn tại. Trong dữ liệu có cấu trúc thì câu hỏi này trả lời chính xác được:
vị trí tham chiếu trong JSON là các **lá**, trong chuỗi nối dấu hai chấm là các **đoạn**; ngoài
đó là trùng chữ.

---

## 6. Chạy lại bộ đo

```bash
cd server && node scripts/audit-alumdoor-catalog-foundation.mjs /tmp/audit.json
```

Đọc-chỉ, không ghi gì vào D1.
