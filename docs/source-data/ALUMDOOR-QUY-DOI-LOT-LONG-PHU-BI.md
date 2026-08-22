# Quy đổi lọt lòng ↔ phủ bì, và bảng bản lá

**Nguồn:** `MS LIÊN BS.xlsx` · sheet `GHI CHÚ` · dòng 1–30.
Chép nguyên văn ngày 22/08/2026. Không suy diễn, không làm tròn.

Sheet này nằm ngay trong file nguồn từ đầu nhưng chưa lần trích xuất nào chạm tới — mọi đợt
nhập trước chỉ đọc sheet `ĐM`. Đây là lý do bộ Cutting Policy hiện tại **không có** luật quy
đổi lọt lòng sang phủ bì: dữ liệu không thiếu, chỉ là chưa ai đọc tới.

## Ký hiệu

| Viết tắt | Nghĩa |
|---|---|
| `CLL` / `RLL` | Cao / Rộng **lọt lòng** — số đo khoảng hở thật của công trình |
| `CPB` | Cao **phủ bì** |
| `RPBR` | Rộng phủ bì **ray** |
| `RPBN` | Rộng phủ bì **nhựa** |
| `RCL` | Rộng **cắt lá** |

## 1. Cửa Đức

```
Tính tiền = CPB × RPBN
CPB       = CLL + 500mm (0,5m)
CPB       = Số lá × bản lá

Ray U75:   RPBR = RLL  + 150mm (0,15m)
           RPBN = RPBR − 60mm  (0,06m)
           RPBN = RLL  + 90mm  (0,09m)
           RPBN = RCL  + 20mm  (0,02m)

Ray U100:  RPBR = RLL  + 200mm (0,2m)
           RPBN = RPBR − 70mm  (0,07m)
           → RPBN = RLL + 130mm (0,13m)
```

Ba dòng U75 nhất quán với nhau: `RLL + 0,15 − 0,06 = RLL + 0,09`. ✔

## 2. Cửa Úc

```
Tính tiền = CPB × RPBR
CPB       = CLL + 500mm (0,5m)
RPBR      = RCL + 30mm  (0,03m)
RPBR      = RLL + 140mm (0,14m)

Ray U100: RPBR = RLL + 200mm (0,2m)
```

## 3. Cửa Đài Loan + Cửa Lưới

```
Tính tiền = CPB × RCL   (mua cả bộ thì tính khác — xem ghi chú gốc)
CPB       = CLL + 500mm (0,5m)
CPB       = Số lá × 0,077

Ray U75:   RCL  = RPBR − 30mm  (0,03m)
           RCL  = RLL  + 110mm (0,11m)
           RPBR = RCL  + 30mm  (0,03m)

Ray U100:  RPBR = RLL  + 200mm (0,2m)
           RCL  = RPBR − 30mm  (0,03m)
           → RCL = RLL + 170mm (0,17m)
```

Bộ U75 nhất quán: `RLL + 0,11 + 0,03 = RLL + 0,14`… nhưng bảng ghi `RPBR = RCL + 0,03` và
`RCL = RLL + 0,11`, suy ra `RPBR = RLL + 0,14` — trùng đúng công thức cửa Úc. ✔

## 4. Công thức chia lá — CÓ ĐIỀU KIỆN

```
n     = (CPB − 130mm) / bản lá
Số lá = n − 1   khi n <  20,5
        n       khi n >= 20,5
```

`130mm = 0,13m` khớp với `leaf_height_deduction_m: 0.13` đã có sẵn trong Cutting Policy
"Cửa Đức — công thức chuẩn".

Ba ô cạnh nhau trong sheet:

```
G3 = "(1320-130)/0,057"        ← biểu thức viết tay
G4 = 20877,19298               ← kết quả, vì trộn mm với mét
G5 = "DƯỚI 20,5 THÌ TRUWF LÁ TRÊN 20,5 K TRỪ"
```

Tính lại cho đúng đơn vị: `(1320 − 130)mm ÷ 57mm = 20,877 lá`. Con số 20 877 ở G4 chính là
20,877 bị lệch 1000 lần do đơn vị. (`TRUWF` là `TRỪ` gõ telex thiếu dấu.)

**SỬA LẠI 23/08/2026 — đừng đọc G5 thành "dưới 20,5 LÁ thì trừ một lá".** Cách đọc đó bị
chính ba ví dụ có sẵn của xưởng bác bỏ: `52,18 → 51 lá`, `"52,6 thì là 52"`, `"<52,5 thì là
51"`. Ở vùng 52 lá mà xưởng vẫn trừ một lá, nên không thể có ngưỡng "trên 20,5 lá thì thôi
không trừ". Luật khớp cả ba ví dụ là **luôn trừ một lá, rồi làm tròn phần thập phân với
ngưỡng 0,6** — đúng thứ `calculateLeafPlan` đang thi hành, và ô `leaf_round_threshold` là
phân số 0–1 chứ không phải số lá.

`20,5` trong ô G5 **vẫn chưa giải nghĩa được**. Chưa đem vào thi hành.

**Ngoại lệ ghi rõ trong bảng:** riêng `AL71C` ghi `(CPB−130)/bản lá`, không kèm `-1 LÁ`.
22 mã còn lại đều có. Chưa rõ đây là ngoại lệ thật hay chỉ là ô bị bỏ sót khi chép.

Ô `H4` ghi *"LÁ RUỘT"* — nhãn cho biết phép tính này áp cho lá ruột, không phải bộ 3 lá đáy.

## 5. Bảng bản lá (23 loại)

| Mã | Bản lá (m) | | Mã | Bản lá (m) |
|---|---|---|---|---|
| AL71C | 0,055 | | AL552C | 0,05 |
| AL71N | 0,057 | | AL552N | 0,057 |
| AL70 | 0,068 | | **AL595** | **0,06** |
| AL75N | 0,067 | | AL652C | 0,05 |
| AL75C | 0,068 | | AL752C | 0,05 |
| AL503C | 0,05 | | AL50C | 0,05 |
| AL503N | 0,055 | | AL50N | 0,055 |
| AL548C | 0,05 | | ALVIP50C | 0,05 |
| AL548N | 0,055 | | ALVIP50N | 0,055 |
| AL501C | 0,05 | | VIPST500N | 0,053 |
| AL501N | 0,057 | | VIPST500C | 0,05 |
| | | | VIPST700 | 0,05 |

Quy luật đặt tên: hậu tố `C` = lá **cong**, `N` = lá **nghiêng** (suy từ việc mọi mã đều đi
theo cặp C/N và bản lá khác nhau). **Chưa được chủ xưởng xác nhận.**

## Việc phải làm với dữ liệu này

1. Thêm `LOT_LONG_CAO`, `LOT_LONG_RONG` làm trường **INPUT** vào các Geometry Profile —
   hai trường này đã có trong D1 (cứu lại từ tầng documents ngày 22/08) nhưng chưa bộ nào dùng.
2. Thêm luật quy đổi vào Cutting Policy. Vướng: engine hiện chỉ có `COPY` / `SUBTRACT` / `ADD`
   trên **một** nguồn, và bắt buộc nguồn phải là trường `INPUT`. Chuỗi
   `RLL → RPBR → RPBN` cần **bắc cầu** qua một trường `CALCULATED`, điều mà
   `evaluateGeometryRules` cố ý không cho. Phải mở rộng engine, không phải chỉ nhập dữ liệu.
3. `billable_area_sqm` cần phép **nhân** (`CPB × RPBN`), engine cũng chưa có. Đây là lý do
   trường đó đang nằm không trong danh mục.
4. Bảng bản lá 23 dòng nên thành bản ghi tra cứu, thay vì chôn trong công thức từng BOM.
