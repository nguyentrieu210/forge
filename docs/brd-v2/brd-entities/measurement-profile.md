# E04 — Measurement Profile (Bộ quy cách tồn kho)

> Doctype danh mục · `naming: field:profile_name`
>
> **Vai trò:** khai một Item cần những **đại lượng vật lý** nào, và giữ các **hằng số vật lý** của mặt
> hàng đó. Đây là nguồn DUY NHẤT của `inventory_mode` sau V2 (xem [item.md](item.md) §1).

---

## 1. Thay đổi so với bản cũ

| Việc | Bản cũ | V2 | Căn cứ |
|---|---|---|---|
| `inventory_mode` | khai ở cả Item lẫn profile | **chỉ ở đây** | Chống "luật viết hai lần rồi trôi dạt" |
| `kerf_mm` | **không có** | **thêm** | Nghiên cứu PHA 1: kerf 2–4 mm/nhát; cửa 51 lá là 51 nhát |
| `scrap_threshold_m` | có, **để trống** | giữ, **mặc định 0,25 m** | Chủ xưởng chốt 30/07. Đây là **số tạm** — chính bản cũ cũng dùng 0,25 rồi tự ghi *"con số đó em bịa"*. Khác lần này ở chỗ: nó nằm trong Settings sửa được, và được ghi rõ là chưa đo |
| `theoretical_kg_per_m` | có | giữ + dùng để **cảnh báo lệch cân** | Đo thật 6,57–8,61 m/cây ⇒ lệch ±13% là bình thường, quá thì cảnh báo |

---

## 2. Bảng field

| Field | Kiểu (Forge) | Bắt buộc | Validate + câu lỗi tiếng Việt | Nghiệp vụ |
|---|---|---|---|---|
| `profile_name` | Data | ✅ | UNIQUE | Tên bộ quy cách |
| `inventory_mode` | Select(Hàng thường, Nhôm cây/lá, Tấm/Kính, Cuộn, Lô/Serial, Thành phẩm theo m2) | ✅ | mặc định `Hàng thường` | **Nguồn duy nhất.** Enum cứng — mỗi giá trị là một nhánh code |
| `stock_uom` | Link(UOM) | ✅ | — | ĐVT tồn **đề xuất** cho Item dùng profile này |
| `require_color` | Check | — | — | Bật ⇒ `Batch.color` bắt buộc |
| `require_condition` | Check | — | — | Bật ⇒ `batch.condition` bắt buộc |
| `require_length` | Check | — | — | Bật ⇒ `batch.length_m` bắt buộc |
| `require_width` | Check | — | — | Cho tấm/kính |
| `require_piece_qty` | Check | — | — | Bắt buộc số cây/lá/tấm |
| `require_bundle_qty` | Check | — | — | Bắt buộc số bó |
| `theoretical_kg_per_m` | Float | ✅ khi `inventory_mode = Nhôm cây/lá` | `> 0` → *"Nhôm cây/lá phải có kg/m lý thuyết để đối chiếu cân"* | Barem. Dùng **CẢNH BÁO**, không dùng để tính tồn |
| `weight_tolerance_pct` | Float | — | `0–50`, mặc định **13** | Lệch quá ngưỡng thì cảnh báo lúc nhập. 13% lấy từ sai số đo thật 6,57→8,61 m |
| `effective_width_m` | Float | ✅ khi `inventory_mode = Thành phẩm theo m2` | `> 0` → *"Phải khai bản lá để chia lá được"* | **Bản lá** — 0,05 đến 0,068 m theo mã nhôm. 23 giá trị trong sheet `GHI CHÚ` |
| `kerf_mm` | Float | ✅ khi có cắt | `0–10`, mặc định **3** → *"Bề rộng lưỡi cắt phải trong khoảng 0–10 mm"* | **MỚI.** Trừ `kerf_mm × số nhát` khỏi chiều dài dùng được |
| `scrap_threshold_m` | Float | bắt buộc | `≥ 0`, mặc định **0,25** (chủ xưởng chốt 30/07, là số TẠM) | Ngắn hơn ngưỡng ⇒ **phế**, không nhập lại kho đầu thừa. Sửa được trong Settings — đừng hardcode |
| `track_dimension_lot` | Check | — | — | Theo dõi lô kích thước |
| `note` | Small Text | — | max 500 | Quy tắc áp dụng |

---

## 3. Hai hằng số tạm — và vì sao vẫn phải cảnh báo

Chủ xưởng chốt 30/07: `scrap_threshold_m = 0,25` và `kerf_mm = 3`. Cả hai **là số tạm, không phải số đo**.

`scrap_threshold_m` quyết định **vứt nhôm hay giữ nhôm**. Sai theo hai chiều đều mất tiền: ngưỡng cao quá
thì vứt đoạn 1,2 m còn cắt được cửa 1,1 m; thấp quá thì kho đầy rác không ai đụng tới. Bản cũ cũng chọn
đúng 0,25 và tự ghi rằng con số đó là bịa — rồi 106 dòng bị đánh phế theo nó.

Khác biệt của V2 không nằm ở con số, mà ở **ba thứ quanh nó**:

1. Nằm trong **Settings sửa được**, không hardcode — đo xong đổi không cần dev.
2. Đổi giá trị **ghi audit trước→sau** — biết ai đổi, khi nào, vì ngày đổi là ngày phế liệu đổi nghĩa.
3. Báo cáo **Đầu thừa dùng lại được** cho xưởng nhìn thấy hệ quả: nếu tháng nào cũng có đoạn 0,2–0,25 m
   bị bỏ mà thợ vẫn phải cắt cây mới cho cửa nhỏ, thì ngưỡng đang đặt sai — **dữ liệu tự tố cáo**.

`kerf_mm = 3` yên tâm hơn: đó là khoảng giữa của chuẩn ngành 2–4 mm, sai tối đa 1 mm/nhát.

---

## 4. Nghiệp vụ bắt buộc

| §2 | Mục | Khai |
|---|---|---|
| 3 | Audit | Đổi `kerf_mm`, `scrap_threshold_m`, `effective_width_m`, `theoretical_kg_per_m` ghi audit trước→sau — bốn số này đổi là đổi cách cắt nhôm |
| 7 | Kanban | Không áp dụng |
| 8 | AI | Không áp dụng — bảng hằng số, không có gì để gợi ý |
| 18 | Lịch sử | Áp dụng — ai đổi hằng số nào, khi nào |
| 19 | Danh mục | Chính nó **là** một danh mục (BRD §4.2) |

---

## 5. Câu hỏi còn mở

| # | Câu hỏi | Chặn gì |
|---|---|---|
| P1 | Kerf thực tế của máy cắt xưởng? | Xác nhận mặc định 3 mm (trùng Q2) |
| P2 | Ngưỡng đầu thừa từng mã nhôm — **một ngưỡng chung hay mỗi mã một ngưỡng?** | Nếu mỗi mã khác nhau thì mỗi mã cần một profile riêng |
| P3 | 23 bản lá trong sheet `GHI CHÚ` — có mã nào đổi bản lá theo lô không? | Nếu có thì `effective_width_m` phải xuống batch, không nằm ở profile |
