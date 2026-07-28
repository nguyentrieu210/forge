# ALUMDOOR — Quy trình & những chỗ còn thiếu

> **Bản 2** — viết lại sau khi đọc **hết** 14 sheet của file đơn hàng và 11 sheet của file
> báo giá Sáu Hồng. Bản 1 hỏi anh 9 điều; đọc kỹ thì **5 điều đã có sẵn câu trả lời trong
> chính file anh gửi**. Phần đó ghi lại dưới đây, kèm nguồn — anh chỉ cần xác nhận đúng/sai,
> không phải gõ lại.
>
> | Ký hiệu | Nghĩa |
> |---|---|
> | ✅ **CHẠY THẬT** | Đã chạy trên `alu.kairo.vn` với dữ liệu thật, có phép thử chặn hồi quy |
> | 🟡 **ĐÃ KHAI, CHƯA CHỨNG MINH** | Cấu trúc có nhưng chưa chạy end-to-end — **chưa được tin** |
> | 📄 **CÓ DỮ LIỆU, CHƯA LÀM** | Số liệu đã có trong file của xưởng, chỉ chưa đưa vào app |
> | ⛔ **CHƯA CÓ** | Chưa có cả dữ liệu lẫn code |

---

## 0. Những gì em đã đọc

| File | Sheet | Đã đọc |
|---|---|---|
| `2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx` | 14 sheet | ✅ hết |
| `TỒN NHÔM 2026 NEW.xlsx` | 15 sheet (mỗi mã nhôm 1 sheet) | ✅ đã nạp 1.256 lô |
| `CÔNG THỨC CHIA LÁ.pdf` | — | ✅ đã thành code + 11 phép thử |
| `CTY SÁU HỒNG.xlsx` | 11 sheet | ✅ (sheet BÁO GIÁ là quan trọng nhất) |
| Ảnh bảng trọng lượng | 40 dòng | ✅ đã lưu `data/trong-luong-nhom.json` |
| Ảnh bảng giá NCC 2026 | 7 mốc giá × 5 loại | ✅ chép trong tài liệu này |

---

## 1. Bức tranh tổng thể

```
        MUA                          BÁN                        LÀM
   ┌─────────────┐            ┌──────────────┐         ┌──────────────────┐
   │ NCC (kg)    │            │ Báo giá      │         │ Lệnh sản xuất    │
   │   ↓         │            │   ↓ khách OK │         │   ↓              │
   │ Nhập nhôm   │            │ Đơn hàng     │────────▶│ Cắt nhôm (lá)    │
   │   ↓         │            │   ↓          │         │   ↓              │
   │ TỒN: số LÁ  │───────────▶│ Xuất kho     │         │ Sơn (THÔ→màu)    │
   │ theo khổ    │            │   ↓          │         │   ↓              │
   └─────────────┘            │ Hoá đơn      │         │ Lắp ráp          │
         │                    │   ↓          │         └──────────────────┘
   Công nợ PHẢI TRẢ ⛔        │ Thu tiền ✅  │
                              └──────────────┘
```

---

## 2. Dòng BÁN — ✅ chạy thật

| Bước | Trạng thái |
|---|---|
| Báo giá (BG-) có workflow Nháp → Đã gửi → Khách đồng ý/từ chối | ✅ |
| Báo giá → Đơn hàng, bấm nhiều lần vẫn ra **đúng một đơn** | ✅ |
| Bảng giá: chọn thì **server quyết giá**; để trống thì gõ tay | ✅ |
| Phiếu xuất kho — trừ tồn thật, **từ chối khi không đủ** | ✅ |
| Hoá đơn → công nợ · Phiếu thu → trừ nợ | ✅ |
| In hoá đơn / báo giá, có dòng hàng và dấu phân cách tiền | ✅ |

### 2.1 — 📄 Giá bán: **file Sáu Hồng đã trả lời**, em hỏi thừa

Sheet `BÁO GIÁ` là một báo giá thật, và nó cho thấy **chính xác** cách xưởng tính tiền:

| Sản phẩm & quy cách | CAO PB (m) | RỘNG PBRAY (m) | SL | KHỐI LƯỢNG | ĐƠN GIÁ | ĐVT | THÀNH TIỀN |
|---|---|---|---|---|---|---|---|
| Cửa lưới MV inox 304 (ray U80) | 3,5 | 4,90 | 2 | 17,15 | 1.490.000 | **M2** | 51.107.000 |
| Cửa lưới MV inox 304 (ray U100) | 3,5 | 6,40 | 2 | 22,40 | 1.490.000 | **M2** | 66.752.000 |
| Cửa Đức Alum **AL501N** | 3,2 | 5,15 | 3 | 49,44 | 1.066.000 | **M2** | 158.109.120 |
| **CK 15%** | 3 | 49,44 | | | −159.900 | **M2** | −7.905.456 |
| BỘ TỰ DỪNG | | | 3 | | 80.000 | **BỘ** | 240.000 |
| RAY HỘP TD | 3,1 | | 6 | | 165.000 | **M** | 3.069.000 |
| TRỤC 114 | 5,3 | | 3 | | 140.000 | **M** | 2.226.000 |
| CON LĂN | | | 3 | | 90.000 | **CẶP** | 270.000 |
| PULY LỚN | | | 24 | | 24.000 | **CÁI** | 576.000 |
| | | | | | | | **TỔNG 333.529.614** |

**Rút ra được ngay bốn điều:**

1. **Cửa bán theo m²** — `1.490.000 đ/m²` (cửa lưới), `1.066.000 đ/m²` (Đức Alum AL501N)
2. **Chiết khấu là một DÒNG ÂM theo m²**, không phải % ẩn: `CK 15%` = `−159.900 đ/m²`
   (đúng 15% của 1.066.000). Cách này hay — hoá đơn nhìn thấy rõ đã giảm bao nhiêu.
3. **Phụ kiện bán tách món, mỗi thứ một ĐVT riêng** — đây chính là câu "bán tách món" anh nói:

   | Món | Đơn vị | Giá |
   |---|---|---|
   | Ray hộp TD | **mét dài** | 165.000 đ/m |
   | Trục 114 | **mét dài** | 140.000 đ/m |
   | Con lăn | cặp | 90.000 đ/cặp |
   | Puly lớn | cái | 24.000 đ/cái |
   | Bộ tự dừng | bộ | 80.000 đ/bộ |

4. Cột `CÒN LẠI` là **luỹ kế cộng dồn** — báo giá tự cộng tới dòng cuối.

> ❓ **Chỉ còn một chỗ em chưa chắc — cách tính m²:**
> - Cửa Đức: `3,2 × 5,15 × 3 bộ = 49,44` ✓ nhân số lượng
> - Cửa lưới: `3,5 × 4,90 = 17,15` với SL = 2 → **không** nhân số lượng
>
> Nghĩa là ở cửa lưới, `RỘNG PBRAY 4,90` đã là **tổng chiều rộng cả 2 cánh**? Anh xác nhận
> giúp em cách hiểu đúng.

### 2.2 — ⛔ Giá **LÁ RỜI** vẫn chưa có

Báo giá trên có ray, trục, con lăn, puly, bộ tự dừng — **nhưng không có dòng lá rời nào**.

> ❓ **Cần anh cho:** khách mua lá rời (không mua cả bộ) thì tính theo **lá**, theo **mét
> dài**, hay theo **kg**? Nhìn cách ray và trục tính theo **mét dài**, em đoán lá cũng vậy —
> nhưng đoán chỗ này là đoán tiền, nên em không tự quyết.

---

## 3. Dòng LÀM (sản xuất)

| Bước | Trạng thái |
|---|---|
| Công thức chia lá — 19 mã, 11 phép thử lấy từ ví dụ của xưởng | ✅ |
| Tồn nhôm theo lô — 1.256 lô, 43.601 lá | ✅ |
| Cắt nhôm — chọn khổ nhỏ nhất còn đủ dài, từ chối kèm số lá thiếu | ✅ |
| Hoàn cắt / trả hàng | ✅ |
| In phiếu sản xuất (số đo in TO) | ✅ |
| **Định mức (BOM)** | 📄 **dữ liệu CÓ — xem 3.1** |
| **Lịch sản xuất / tăng ca** | 📄 **định mức giờ CÓ — xem 3.4** |
| Lệnh sản xuất → trừ vật tư | 🟡 chưa chạy thử |
| Sơn / lò sơn | 🟡 có định mức mẻ sơn, chưa có quy trình |
| Danh sách lỗi | 📄 cấu trúc rõ, chưa làm |
| Bảo hành | 📄 cấu trúc rõ, chưa làm |

### 3.1 — 📄 ĐỊNH MỨC: sheet `HOÀNG LAI` là một bảng định mức trá hình

Em nói "không có dòng định mức nào" là **sai**. Sheet `HOÀNG LAI` là đơn công trình 95 bộ,
và vì nó liệt kê vật tư theo từng lô nên **chia ra là ra ngay tỷ lệ mỗi bộ**:

| Nhóm | Số bộ | Ray hộp | Trục | Puly lớn | Còi báo | Con lăn | Motor | Bình lưu điện |
|---|---|---|---|---|---|---|---|---|
| CC1 (AL548+AL503) | 86 | 172 cây | 86 cây | 516 cái | 86 | 86 cặp | 86 bộ | 86 bộ |
| CC2 | 5 | 10 cây | 5 cây | 25 cái | 5 | 5 cặp | 5 bộ | 5 bộ |
| CC3 | 1 | 2 cây | 1 cây | 4 cái | 1 | 1 cặp | 1 bộ | 1 bộ |
| CC4 | 1 | 2 cây | 1 cây | 6 cái | 1 | 1 cặp | 1 bộ | 1 bộ |
| CK1 | 2 | 4 cây | 2 cây | 12 cái | — | — | — | — |

**Định mức mỗi bộ cửa (suy ra, nhất quán ở mọi nhóm):**

```
Ray hộp        2 cây      ← luôn luôn 2
Trục           1 cây      ← luôn luôn 1
Còi báo        1 cái
Con lăn        1 cặp
Motor          1 bộ
Bình lưu điện  1 bộ
Puly lớn       4–6 cái    ← THAY ĐỔI: 6/6/6 nhưng CC2=5, CC3=4
Lá nhôm        theo công thức chia lá ✅ (em tính được rồi)
```

**Và chiều dài vật tư đi theo kích thước cửa:**

| Cửa | Trục | Ray hộp |
|---|---|---|
| RPBN 3840 | TRỤC 3900 | RAY 4300 |
| RPBN 3240 | TRỤC 3300 | RAY 4300 |
| RPBN 3050 | TRỤC 3200 | RAY 4300 |
| RPBN 2790 | TRỤC 2900 | RAY 4300 |

→ **Trục dài hơn rộng phủ bì khoảng 60–150 mm**, còn **ray cắt theo chiều cao** (CPB 4480 → ray 4300).

> ❓ **Chỉ còn ba chỗ cần anh chốt:**
> 1. **Puly lớn** vì sao lúc 4, lúc 5, lúc 6? Theo chiều rộng cửa, hay theo cân nặng?
> 2. **Trục** dài hơn RPB bao nhiêu — có công thức không, hay làm tròn lên cây có sẵn?
> 3. **Ray** = CPB trừ đi bao nhiêu? (4480 → 4300 là trừ 180)

### 3.2 — ⛔ Bảng chọn mô tơ

Trong `HOÀNG LAI` mọi bộ đều dùng `MOTOR ALUMAX 600KG`, nên chưa suy ra được quy tắc chọn.

> ❓ **Cần anh cho:** bảng kiểu `cửa dưới … m² hoặc dưới … kg → mô tơ 400/600/800 kg`.
> Nhắc lại: bảng trọng lượng anh gửi cho phép app **tự tính cân nặng cánh cửa**, nên chỉ cần
> anh cho ngưỡng là app chọn mô tơ được.

### 3.3 — 🟡 Công đoạn SƠN

Từ `LỊCH SẢN XUẤT`: **`LÒ SƠN: 1 màu sơn (sơn được 345 lá) × tổng 11,5 m dài / 3 tiếng 1 mẻ`**

Nghĩa là: một mẻ sơn **3 tiếng**, mỗi mẻ **345 lá** hoặc **11,5 m dài**, và **một mẻ chỉ một
màu** — nên gom cùng màu vào một mẻ là việc phải tính khi lên lịch.

Bảng giá NCC cũng phân biệt `THÔ` / `MÀU CHƯA DẬP` / `MÀU ĐÃ DẬP` với giá khác nhau.

> ❓ **Cần anh mô tả:** sơn ở lò của xưởng hay thuê ngoài? Nhôm đi sơn có làm phiếu không?
> **"Dập"** là công đoạn gì — trước hay sau sơn? Có hao hụt khi sơn không?

### 3.4 — 📄 ĐỊNH MỨC GIỜ: sheet `LỊCH SẢN XUẤT` **không rỗng** — em đã nói sai

Em báo hai lần rằng sheet này rỗng và em bị chặn. **Sai.** Nó có sẵn định mức đầy đủ:

| Bộ phận | Định mức nguyên văn | Quy ra |
|---|---|---|
| **ÚC** | `1h45' / 12 m²` | 8,75 phút/m² |
| **LƯỚI** | `4h / 9 m²` | 26,7 phút/m² |
| **ĐỨC** | `cắt dập 40', 40' hoàn thiện, 20' lấy nhôm` | **100 phút/bộ** |
| **ĐÀI LOAN** | `30'/BỘ` | 30 phút/bộ |
| **SIÊU TRƯỜNG** | `30'/BỘ` | 30 phút/bộ |
| **LÒ SƠN** | `345 lá × 11,5 m dài / 3 tiếng 1 mẻ` | 3 giờ/mẻ |

Chú ý: **ÚC và LƯỚI tính theo m², ba nhóm kia tính theo BỘ.** Hai cách tính khác nhau, app
phải hiểu cả hai.

> ❓ **Chỉ còn thiếu một con số:** **số người mỗi tổ**.
> Có nó là em tính được: `tổng giờ cần ÷ (số người × 8 giờ)` → ngày nào phải tăng ca.

### 3.5 — 📄 DANH SÁCH LỖI — cấu trúc đã rõ

Cột: `NGÀY ĐẶT HÀNG · NGÀY NHẬP LỖI · SỐ CHỨNG TỪ · KHÁCH HÀNG · NCC · NỘI DUNG ·
NGƯỜI PHỤ TRÁCH · NGUYÊN NHÂN · TÌNH TRẠNG XỬ LÝ CHO KH · TÌNH TRẠNG XỬ LÝ CHO NCC`

Điểm quan trọng: **lỗi được xử lý theo HAI phía song song** — với khách và với NCC. Ví dụ
thật: *bình lưu điện E800I hỏng → nguyên nhân `LỖI NCC` → `ĐÃ ĐỔI TRẢ` cho khách, đồng thời
trả về NCC*. Nên nó không phải một ô ghi chú, mà là **hai đường xử lý phải theo dõi riêng**.

> ❓ **Cần anh cho:** `NGUYÊN NHÂN` có mấy loại cố định? (em mới thấy `LỖI NCC`; còn lỗi thợ,
> lỗi vận chuyển, lỗi thiết kế…?)

### 3.6 — 📄 BẢO HÀNH — cấu trúc đã rõ

Sheet `DS BẢO HÀNH` theo dõi **bốn mốc thời gian có số lượng riêng**:

```
NGÀY NHẬP LỖI (SL) → NGÀY XUẤT ĐỔI (SL) → NGÀY GỬI BẢO HÀNH (SL) → NGÀY TRẢ BẢO HÀNH (SL)
```

Kèm `NCC · KHÁCH HÀNG · LOẠI HÀNG · TÌNH TRẠNG`.

Đọc ra được quy trình thật: khách báo hỏng → **xưởng đổi hàng mới cho khách ngay** → rồi mới
gửi hàng hỏng về NCC → NCC trả lại. Nghĩa là **xưởng ứng hàng trước, đòi NCC sau** — và số
hàng đang nằm ở NCC là một loại tồn kho cần theo dõi.

---

## 4. Dòng MUA — ⛔ vẫn là chỗ hở lớn nhất

**App chưa có đường nhập nhôm.** 1.256 lô hiện có là em nạp thẳng từ Excel, không qua chứng
từ. Nên: không biết lô nào mua của ai, ngày nào, giá bao nhiêu → **không có công nợ phải
trả**, và **không có giá vốn** → không tính được lãi mỗi bộ cửa.

### 4.1 — Đơn vị tính: hai đơn vị cho cùng một thứ

Sheet `NHẬP` cho thấy ĐVT thực tế có **5 loại**: `LÁ · CÂY · BỘ · SỢI · KG`. Anh cho biết
**hoá đơn NCC theo kg**, còn xưởng **đếm và cắt theo lá**.

```
SỐ LÁ   ← thủ kho ĐẾM   → TỒN KHO, thứ đem đi cắt
SỐ KG   ← hoá đơn NCC   → TIỀN, thứ lên công nợ phải trả
KG lý thuyết = số lá × khổ × trọng lượng(kg/m)   → chỉ để ĐỐI CHIẾU
```

**Vì sao không lấy kg chia ra số lá:** anh nói *"nhiều khi nhập có sai số"*. Suy số lá từ cân
nặng sẽ ra số lẻ kiểu `29,7 lá` trong khi thợ đếm `30` — app và thực tế lệch **ngay từ lúc
nhập và lệch mãi**. Cân nặng không được quyết định tồn kho.

**Giá vốn mỗi lá** thì không cần hằng số nào: `thành tiền ÷ số lá thực nhận`.

### 4.2 — ⚠️ Trọng lượng: em nghĩ là **kg/mét dài**, không phải kg/m²

| Nếu hiểu `AL548N = 0,425` là | 1 m² cửa cuốn nặng |
|---|---|
| kg/**mét dài** | 0,425 ÷ 0,055 = **7,7 kg/m²** ← đúng tầm cửa thật |
| kg/**m²** | **0,425 kg/m²** ← nhẹ hơn tờ bìa |

Thêm bằng chứng: `RHU100 = 1,419` là **ray hộp** — ray là thanh thẳng, không ai tính theo m².

App sẽ hiện **kg lý thuyết cạnh kg hoá đơn** nên lô nhập đầu tiên tự lộ ra ai đúng.

Bảng đã lưu `data/trong-luong-nhom.json`: **40 dòng, 28 khớp mã nhôm**. 12 dòng chưa khớp:

```
TD325 · TD326 · TD327 · A282 · TD-TG-ALD · RHM8 · RHU100
TD87A1 · RHM8(2.4MM) · CQ-VM111 · TDU26 · AL-YST
```

> ❓ Đây là ray / lá đáy / lá yếm / thanh đáy — **cần anh cho biết chúng ứng với mã nào**
> trong danh mục, hoặc xác nhận là mã riêng cần tạo mới.

### 4.3 — 📄 Bảng giá NCC theo ngày (đ/kg)

| Loại hàng | 11/12/25 | 11/03 | 08/04 | 07/05 | 25/06 | 01/07 | 13/07 |
|---|---|---|---|---|---|---|---|
| THÔ | 96.000 | 106.000 | 109.000 | 108.000 | 105.000 | 103.000 | 98.000 |
| MÀU – chưa dập | 103.000 | 113.000 | 116.000 | 115.000 | 112.000 | 110.000 | 105.000 |
| MÀU – đã dập | 104.000 | 114.000 | 117.000 | 116.000 | 113.000 | 111.000 | 106.000 |
| RAY MÀU | 105.000 | 115.000 | 118.000 | 117.000 | 114.000 | 112.000 | 107.000 |
| RAY THÔ | 98.000 | 108.000 | 111.000 | 110.000 | 107.000 | 105.000 | 100.000 |

Nền tảng đã có `Bảng giá` + `Chính sách giá` có **hiệu lực từ/đến** — nạp thẳng được.

> ❓ **Cần anh cho:** cùng một mã nhôm có mua được ở **cả 3 dạng** (thô / màu chưa dập / màu
> đã dập) không? Nếu có thì **"thô" và "màu" là hai trạng thái tồn kho khác nhau** của cùng
> một mã — và đó chính là chỗ nối với công đoạn sơn ở mục 3.3.

### 4.4 — ⛔ Công nợ phải trả chưa có

App mới có **phải thu**. Chưa có **phải trả** cho NCC.

> ❓ Có cần theo dõi trong app không, hay kế toán làm ngoài? Nếu cần: thanh toán NCC theo
> hình thức nào (tiền mặt / chuyển khoản / gối đầu bao nhiêu ngày)?

---

## 5. TỒN KHO — bốn con số, tuyệt đối đừng gộp làm một

Anh mô tả đúng mô hình chuẩn:

```
TỒN TỔNG (vật lý)          thứ đang nằm trong kho, đếm tay ra được
  −  ĐÃ CÓ ĐƠN (giữ chỗ)   còn trong kho nhưng ĐÃ HỨA cho một đơn nào đó
  −  HAO HỤT               còn trong kho nhưng KHÔNG dùng được
  ────────────────────────
  =  TỒN KHẢ DỤNG          con số người bán được phép hứa với khách
```

### 5.1 — Vì sao phải tách ra: mỗi con số trả lời một người khác nhau

| Ai hỏi | Hỏi gì | Đọc con số nào |
|---|---|---|
| Thủ kho | "Trong kho có bao nhiêu?" | **Tồn tổng** |
| Kinh doanh | "Tôi bán được bao nhiêu?" | **Tồn khả dụng** |
| Kế toán | "Tài sản tồn kho bao nhiêu tiền?" | **Tồn tổng** × giá vốn |
| Chủ xưởng | "Mất bao nhiêu?" | **Hao hụt** |

Gộp lại thì hỏng theo kiểu **im lặng**: kinh doanh mở app thấy `348 lá AL548`, hứa hết 348 cho
khách mới — trong khi 300 lá đã hứa cho đơn đang sản xuất. **Không có gì báo lỗi.** Nó chỉ lộ
ra khi thợ ra kho cắt và thiếu hàng, lúc đó đã trót hẹn ngày giao với khách.

Đây đúng kiểu lỗi mà cả app này đang cố tránh: **ghi thành công nhưng sai**.

### 5.2 — Hiện app có gì

| Con số | Trạng thái | Nằm ở đâu |
|---|---|---|
| **Tồn tổng** | ✅ | `Lô nhôm tồn.số lá` — 1.256 lô, 43.601 lá |
| **Đã có đơn (giữ chỗ)** | ⛔ **KHÔNG CÓ** | Không có gì đánh dấu lá đã hứa cho đơn nào |
| **Hao hụt** | 🟡 ghi rời rạc | `Phiếu cắt.phế mỗi lá` có ghi, nhưng **chưa cộng lại thành số** |
| **Tồn khả dụng** | ⛔ **KHÔNG CÓ** | Hệ quả tất yếu của hai dòng trên |

Báo cáo `Xuất nhập tồn` của nền tảng cũng **chỉ có `actual_qty`** — không cột giữ chỗ, không
cột khả dụng. Nên hiện tại **cả hệ thống không có chỗ nào trả lời được "bán được bao nhiêu"**.

### 5.3 — Hao hụt của nhôm có BA nguồn, và HAI loại rất khác nhau

**Ba nguồn:**

1. **Phế cắt** — `khổ − rộng cắt`, phát sinh mỗi lần cắt. Đã ghi trên phiếu cắt ✅
2. **Khổ quá ngắn** — lúc nạp Excel có **106 dòng khổ < 0,25 m** em đánh dấu là phế
3. **Lá lỗi** — móp, xước, kêu (file có ví dụ thật: *"LÁ KÊU, HOÀN LẠI"*)

**Hai loại, và đây mới là chỗ quan trọng:**

| Loại | Nghĩa | Xử lý |
|---|---|---|
| **Còn dùng được** | đoạn ngắn, vẫn cắt được cửa nhỏ | vẫn là **tồn kho**, chỉ là khổ ngắn |
| **Bỏ đi** | quá ngắn / lỗi không sửa được | ra khỏi tồn, **bán phế liệu theo kg** |

Gộp hai loại này là mất tiền thật: một đống đoạn 1,2 m vẫn cắt được cửa 1,1 m, mà ghi chung
là "hao hụt" thì không ai đi tìm nó nữa, và xưởng lại cắt cây mới.

> ❓ **Cần anh cho biết:** đoạn thừa **ngắn hơn bao nhiêu mét** thì coi là bỏ hẳn?
> Lúc nạp em tự đặt ngưỡng **0,25 m** — con số đó **em bịa**, cần anh chốt lại.
> Và phế liệu bán lại theo **kg** phải không, giá khoảng bao nhiêu?

### 5.4 — Câu quyết định: **giữ chỗ từ lúc nào?**

Đây là chỗ phải chọn, và chọn sai kiểu nào cũng đau:

| Giữ chỗ từ khi | Hệ quả |
|---|---|
| **Báo giá** | Quá sớm — khách chưa chốt mà hàng đã bị khoá, mất cơ hội bán |
| **Đơn hàng được duyệt** | An toàn nhất, nhưng hàng nằm chờ lâu nếu đơn hẹn giao xa ngày |
| **Phát lệnh sản xuất** | Sát thực tế nhất — sheet T6 ghi *"kế toán bấm chọn lệnh sản xuất"* |
| **Lúc cắt** | Quá muộn — hai đơn cùng hứa một số lá, tới lúc cắt mới biết thiếu |

> ❓ **Cần anh chọn một.** Em nghiêng về **phát lệnh sản xuất**, vì đó là mốc xưởng thật sự
> nhận việc và file của anh cũng đang mốc ở đó. Nhưng đơn ký xa ngày có thể phải giữ sớm hơn.

### 5.5 — Chỗ riêng của nhôm: giữ chỗ theo KHỔ, không theo LÔ

Hàng thường thì giữ chỗ đơn giản — "giữ 10 cái mô tơ".

Nhôm thì khác: một đơn cần **"51 lá khổ ≥ 3,5 m"**, không cần lô cụ thể nào. Lúc cắt app mới
chọn lô khổ nhỏ nhất còn đủ dài (đã chạy ✅). Nên giữ chỗ phải giữ theo
**(mã · màu · đời · khổ tối thiểu)**, không phải khoá một lô.

Hệ quả: **tồn khả dụng của nhôm không phải một con số, mà là một bảng theo khổ.** Còn 40 lá
khổ 3,8 m nghĩa là bán được 40 lá cho cửa rộng ≤ 3,8 m — nhưng **không** bán được lá 4,0 m nào.

Nên báo cáo tồn khả dụng của nhôm nên có dạng:

```
AL548 · màu GS · đời MỚI
   khổ ≥ 4,5 m :   12 lá khả dụng   (tổng  18, giữ chỗ  6)
   khổ ≥ 3,8 m :   52 lá khả dụng   (tổng  70, giữ chỗ 18)
   khổ ≥ 3,0 m :  145 lá khả dụng   (tổng 180, giữ chỗ 35)
```

Đọc dồn xuống: lá khổ dài luôn dùng được cho cửa ngắn hơn, nên số khả dụng **cộng dồn** khi
khổ yêu cầu giảm.

> ❓ **Cần anh xác nhận** cách đọc này có đúng cách xưởng nghĩ không — hay thợ chỉ quan tâm
> "còn tổng cộng bao nhiêu lá".

---

## 6. Cấu trúc đơn hàng hằng tháng (T2 → T7.2026)

Bảy sheet tháng, mỗi sheet ~2.400 → **50.000 dòng**. Cột thay đổi dần qua các tháng —
sheet T6/T7 là bản mới nhất và đầy đủ nhất:

```
STT · Năm · Số chứng từ · ĐẠI LÝ · NGƯỜI PHỤ TRÁCH · LOẠI · MÃ HÀNG · LỖI SP
· ĐƠN HÀNG · PHIẾU XUẤT KHO · GHI CHÚ · NGÀY GIAO · LỆNH XUẤT KHO · LỆNH SX · SỐ LƯỢNG TỒN
```

Quan sát quan trọng: **một số chứng từ = nhiều dòng hàng**. Ví dụ chứng từ `000086`:
```
000086  AL501   AL501 CPB 3M66 X RPBR 2M7 TRẮNG SỨ
000086  Trục 114  TRỤC 2M8 X 1 CÂY
```
→ Đúng mô hình **Đơn hàng có nhiều dòng** mà app đang dùng ✅. Và nó **xác nhận lại việc bán
tách món**: một đơn có cả cửa lẫn phụ kiện rời.

Ô ghi chú trong sheet T6 còn ghi rõ: *"kế toán bấm chọn lệnh sản xuất"* — tức là **kế toán là
người phát lệnh sản xuất**, không phải xưởng tự phát.

> ❓ **Cần anh xác nhận:** đúng là kế toán bấm phát lệnh SX phải không? Và **`LỆNH XUẤT KHO`
> khác `PHIẾU XUẤT KHO`** ở chỗ nào?

---

## 7. Những thứ khác

| Việc | Trạng thái | Ghi chú |
|---|---|---|
| Danh sách KH/NCC | 📄 | Sheet `DS KH-NCC` có: tên · người phụ trách · **KH/NCC/KH LẺ** · SĐT · **chành xe / địa chỉ giao** |
| Đổ Google Sheet | ⛔ | Chờ **khoá service account** |
| Lắp đặt / đội lắp | 🟡 | Phiếu xuất có ô đội lắp + ngày lắp, có báo cáo theo đội |
| Nhiều ĐVT (CÂY/BỘ/SỢI) | ⛔ | ĐVT hiện chỉ là **nhãn** — máy chưa quy đổi. Ray mua theo cây, bán theo **mét** (165.000 đ/m) nên **bắt buộc phải quy đổi** |
| Hai kho Xưởng 1 / Xưởng 2 | 🟡 | Chọn kho đã chạy; 1.256 lô đang để hết ở Kho 1 |

> ❓ Tồn nhôm thực tế chia thế nào giữa hai xưởng?

---

## 8. Dữ liệu rác cần dọn

| Bảng | Số bản ghi | Đề xuất |
|---|---|---|
| Đơn hàng · Phiếu xuất · Hoá đơn · Phiếu thu | ~140 | Xoá hết |
| Kho (`Kho nhôm 19697`…) | 45 | Xoá rác, giữ Xưởng 1 + Xưởng 2 |
| Khách hàng · Hàng hoá | 35 · 59 | Giữ 17 mã nhôm thật |
| Công ty | 3 | Giữ **ALUMDOOR**, xoá `Sáu Hồng` + `Xưởng` |
| **Lô nhôm tồn** | **1.256** | ⚠️ **GIỮ NGUYÊN** |

---

## 9. Tóm tắt: **7 thứ** cần anh

Bản 1 hỏi 9 điều. Đọc kỹ file thì 5 điều đã tự trả lời, nhưng lòi ra vài câu mới. Còn lại:

| # | Cần gì | Vì sao chặn |
|---|---|---|
| 1 | **Giá LÁ RỜI** — theo lá, mét dài, hay kg? | Đoán sai là sai tiền. Ray/trục bán theo **mét**, nên em nghi lá cũng vậy |
| 2 | **Số người mỗi tổ** | Có rồi là chạy được lịch sản xuất + tăng ca (định mức giờ đã đủ) |
| 3 | **Bảng chọn mô tơ** theo m² hoặc kg cửa | App tự tính được cân nặng cửa rồi, chỉ thiếu ngưỡng |
| 4 | **12 mã ray/lá đáy/thanh đáy** ứng mã nào | Chặn phần nhập kho phụ kiện |
| 5 | **Cùng mã nhôm mua được cả thô lẫn màu?** | Quyết định "thô/màu" có phải hai trạng thái tồn kho không → nối với công đoạn sơn |
| 6 | **Mốc giữ chỗ tồn kho** — từ đơn hàng hay từ lệnh sản xuất? | Không có nó thì không tính được **tồn khả dụng**, và kinh doanh sẽ hứa trùng hàng *(mục 5.4)* |
| 7 | **Khoá Google service account** | Chặn phần đổ Sheet |

Kèm 6 câu xác nhận ngắn (đúng/sai là đủ):

- Cách tính m² ở cửa lưới — `RỘNG PBRAY` là tổng cả 2 cánh? *(mục 2.1)*
- Trọng lượng là **kg/mét dài** phải không? *(mục 4.2)*
- Puly lớn 4/5/6 cái — theo cái gì? *(mục 3.1)*
- Trục dài hơn rộng phủ bì bao nhiêu, ray ngắn hơn cao phủ bì bao nhiêu? *(mục 3.1)*
- **Kế toán** là người bấm phát lệnh sản xuất? *(mục 5)*
- Tồn nhôm chia hai xưởng thế nào? *(mục 7)*
- Đoạn nhôm thừa ngắn hơn **bao nhiêu mét** thì coi là bỏ hẳn? *(em đang tự đặt 0,25 m — mục 5.3)*
- Tồn khả dụng của nhôm đọc **theo bảng khổ** có đúng cách xưởng nghĩ không? *(mục 5.5)*

---

## Phụ lục — đã chứng minh chạy trên tenant thật

```bash
FORGE_ADMIN_PASSWORD=… node scripts/verify-alumdoor.mjs --origin https://alu.kairo.vn
```

Phép thử đọc **SỔ** (sổ kho, sổ công nợ), không đọc chứng từ — vì chứng từ ghi thành công vẫn
có thể chẳng động vào sổ nào, và đó là kiểu hỏng im lặng nguy hiểm nhất.

Gồm: nhập kho · đơn hàng · xuất kho trừ tồn · chặn xuất quá tồn · chặn xuất quá đơn · hoá đơn
lên công nợ · phiếu thu trừ nợ · đề xuất cắt · cắt thật · cắt từ nhiều lô · từ chối khi thiếu
nhôm · hoàn cắt · chặn hoàn hai lần · trả hàng · bảng giá server quyết · chặn thiếu giá ·
báo giá → đơn hàng · chặn chuyển hai lần.
