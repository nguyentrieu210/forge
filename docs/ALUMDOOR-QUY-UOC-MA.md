# ALUMDOOR — QUY ƯỚC MÃ HÀNG, MÀU VÀ ĐƠN VỊ

> Chốt 2026-07-29. Thay thế toàn bộ mã cũ. Dựng từ **dữ liệu thật**: nhật ký mua (sheet `NHẬP`,
> 254 dòng) và nhật ký bán (`T2.2026`–`T7.2026`) trong `2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx`.

## 1. Vì sao phải làm lại

Kiểm kê 477 mã đang có:

| Vấn đề | Số mã |
|---|---:|
| có **khoảng trắng** trong mã | 121 |
| có **chữ thường** | 147 |
| có **dấu tiếng Việt** | 26 |
| dùng gạch ngang `-` | 429 |
| dùng gạch dưới `_` | 153 |
| có dấu chấm, ngoặc, dấu phẩy | 62 |

Mã là **khoá của bản ghi**: nó đi vào URL, vào ô tìm kiếm, vào file xuất, vào tên tệp in. Một mã
có khoảng trắng và dấu tiếng Việt hỏng ở cả bốn chỗ, và hỏng lặng lẽ.

Nặng hơn là tiền tố **không còn nghĩa gì**: 275 mã mang tiền tố `TP-` trong khi chỉ 139 mã thật
sự là thành phẩm. `TP-TOLEKEM124_6D` là tôn kẽm — nguyên liệu. Ai đọc mã cũng không suy ra được
món đó là gì, nên tiền tố chỉ còn là ký tự thừa.

---

## 2. Dạng mã

```
<LOẠI>-<HỌ>[-<ĐẶC TRƯNG>]
```

**Luật cứng:**

1. Chỉ `A–Z`, `0–9`, dấu `-` và dấu `.` trong số đo. **Không** khoảng trắng, **không** dấu tiếng
   Việt, **không** chữ thường, **không** `_ ( ) ,`
2. **Màu không bao giờ nằm trong mã.** Xem mục 4.
3. Dài tối đa 24 ký tự.
4. Tiền tố nói món đó **LÀ GÌ**, không nói nó đến từ đâu hay ai bán.

### Tiền tố

| Tiền tố | Nghĩa | Ví dụ thật |
|---|---|---|
| `NHOM` | Nhôm cây / lá — nguyên liệu mua thô | `NHOM-AL595` · `NHOM-AL70-2LOP` · `NHOM-DL-8D` |
| `CUA` | Cửa thành phẩm bán theo m² | `CUA-KT-4.6D` · `CUA-MTN-5.2D` · `CUA-UC-KT-4.5D` |
| `RAY` | Ray các loại | `RAY-HOP-U76` · `RAY-SAT` · `RAY-SAT-RON` · `RAY-DON` |
| `TRUC` | Trục cuốn | `TRUC-114` · `TRUC-168` · `TRUC-114-2.4LY` |
| `MOTO` | Mô tơ | `MOTO-TANKER-600` · `MOTO-YHLD-500` · `MOTO-ALUMAX-600` |
| `PIN` | Bình lưu điện | `PIN-E800I` · `PIN-E1000I` |
| `LUOI` | Cửa lưới | `LUOI-MV` · `LUOI-SN-13X26` |
| `PK` | Phụ kiện | `PK-CONLAN` · `PK-PULY-114L` · `PK-COI` · `PK-RON-DAY-UC` |
| `VT` | Vật tư khác (tôn, xốp, vis, ron cuộn, hoá chất) | `VT-TON-0.33X598` · `VT-XOP-45` · `VT-VIS-DU-2P` |
| `DV` | Dịch vụ, phụ thu, tiền công, vận chuyển | `DV-PHUTHU-SON-RAY` · `DV-CONG-LAP-DAT` · `DV-VAN-CHUYEN` |

Mười tiền tố, mỗi cái trả lời đúng một câu: **món này là gì**. So với hiện trạng 14 tiền tố mà
tiền tố lớn nhất (`TP`, 275 mã) không mang nghĩa nào.

### Số đo giữ nguyên cách xưởng đọc

`4.6D`, `U76`, `2.4LY`, `600KG` → viết `4.6D`, `U76`, `2.4LY`, `600`. Giữ dấu chấm thập phân vì
xưởng đọc "bốn chấm sáu đê"; đổi thành `46D` là bắt người ta dịch lại trong đầu mỗi lần.

---

## 3. Đơn vị tính

Nhật ký mua thật dùng 21 đơn vị. Danh mục app có 16, **thiếu 7** và thừa vài cái.

### Thêm

| ĐVT | Lần dùng | Ghi chú |
|---|---:|---|
| **LÁ** | có | Đơn vị tự nhiên của lá cửa. Thiếu nó là thiếu đơn vị chính của mặt hàng chính. |
| **THÂN** | 3 | Thân mô tơ |

### Đồng nghĩa phải gộp, không tạo thêm mã

`M` ≡ **Mét** · `CUỐN` ≡ **Cuộn** · `TÂM` ≡ **Tấm**

Đây là lỗi gõ trong file nguồn, không phải đơn vị mới. Tạo thêm `CUỐN` bên cạnh `Cuộn` là chẻ
tồn kho làm hai vì một lần gõ nhầm.

### Xem lại, mỗi thứ dùng đúng 1 lần

`BĂNG` · `BẢNG` · `VỈ` · `THÙNG` — nhiều khả năng là quy cách đóng gói của một lần mua lẻ, không
phải đơn vị tồn. Không tạo cho tới khi thấy dùng lại.

### Ba đơn vị của một mặt hàng

Mua / Tồn / Bán là **ba câu hỏi khác nhau**, và luật đã chốt với chủ xưởng:

| Nhóm | Mua | Tồn | Bán |
|---|---|---|---|
| Nhôm cây/lá | Kg | **Kg** | m² (qua thành phẩm) |
| Lá nhiều kích thước | Kg | Cây | m² |
| Ray, trục | Kg | Kg | Mét |
| Ron nhựa / inox | Kg | Kg | Mét |
| Cửa thành phẩm | — | **Bộ** | **m²** (hệ số động theo kích thước) |
| Phụ kiện | Cái/Bộ/Cặp | như mua | như mua |

Hiện có **126 mã** khai ĐVT bán khác ĐVT tồn — mỗi mã trong số đó **bắt buộc** phải có hệ số quy
đổi, trừ nhóm bán m² dùng hệ số động.

---

## 4. Màu — tách hẳn khỏi mã hàng

### Bằng chứng từ dữ liệu thật

Nhật ký mua 254 dòng, cột MÀU chỉ có ba giá trị:

```
THÔ  56    GS  5    9512  1
```

**Xưởng mua nhôm THÔ rồi tự sơn.** Màu không phải thuộc tính của thứ mua vào — nó sinh ra ở công
đoạn sơn. Nhét màu vào mã hàng là ghi một sự thật ở sai thời điểm.

### Màu sống ở ba chỗ, không chỗ nào là mã hàng

| Chỗ | Câu trả lời |
|---|---|
| **Lô nhôm tồn** | còn bao nhiêu cây AL595 màu ghi sần |
| **Dòng chứng từ bán / lệnh sản xuất** | khách đặt cửa màu gì |
| **Định mức** (`Bill of Materials.color`) | công thức thay đổi theo màu |

Nhờ vậy trả lời được **cả hai** câu mà mô hình cũ chỉ trả lời được một: *"còn bao nhiêu AL595 màu
ghi sần"* và *"còn tất cả bao nhiêu AL595"*.

### Bảng màu chuẩn — 24 màu

| Loại | Số | Áp dụng |
|---|---:|---|
| Thô (chưa sơn) | 1 | mọi nhôm mua vào |
| Sơn tĩnh điện | 18 | Cửa CN Đức, Úc, Siêu Trường, Đài Loan, Lưới, Phụ kiện |
| Mạ màu | 5 | Cửa Úc / Đài Loan tuỳ màu |

Mã màu dùng **tên đầy đủ**, không viết tắt: bảng có cả "XANH LÁ CÂY" lẫn "XÁM LÔNG CHUỘT" — cùng
viết tắt `XLC`. Đoán một trong hai là gán sai màu cho cửa đã bán, mà sai màu thì sơn lại cả bộ.

`9512` là mã sơn RAL, giữ làm `supplier_color_code` của TRẮNG chứ không làm một màu riêng.

---

## 5. Bảng chuyển từ mã cũ

Ví dụ đối chiếu, đọc từ nhật ký bán:

| Xưởng gọi | Mã cũ trong app | Mã mới |
|---|---|---|
| AL595 | `AL595`, `TD-AL595`, `NVL-AL595-GS`, `NVL-AL595-VK`, `NVL_TDAL595THO` | `NHOM-AL595` (một mã, màu ở lô) |
| AL70 2 lớp | `AL70 - 2 LỚP`, `TP-TD-AL70 (2 LỚP)`, `NVL-TDAL70THO`, `NVL-TDAL70GS`, `NVL-TDAL70VK` | `NHOM-AL70-2LOP` |
| RAY HỘP TD U76 | `TP-RAYHOP`, `TP-RHM8` | `RAY-HOP-U76` |
| TRỤC 114 1.8LY | `TP-TRỤC 114_1.8LY`, `NVL-TRUC114_1.8LY`, `TRUC114_1.8LY` | `TRUC-114-1.8LY` |
| CON LĂN | `TP-CON LĂN` | `PK-CONLAN` |
| MOTOR TANKER 600KG | `TP-MT-TANKER600KG` | `MOTO-TANKER-600` |
| Phụ thu sơn ray | `PHUTHU_SONRAY_MSK` | `DV-PHUTHU-SON-RAY` |

Dòng AL595: **năm mã cũ gộp về một**. Đó là điều làm được khi màu rời khỏi mã.

---

## 6. Những gì KHÔNG đổi

- Nhôm nhập và định giá theo **kg thực cân**; sổ tồn nhôm giữ **kg**
- Cửa bán theo **m²**, tồn theo **Bộ**, hệ số quy đổi **động** theo kích thước từng cửa
- Luật đo: đại lý đo phủ bì nhựa (`RCL + 0,02`), khách lẻ đo phủ bì ray (`RCL + 0,08`) —
  xem `ALUMDOOR-LUAT-DO-VA-GIA.md`, đã được sheet `GHI CHÚ` xác nhận độc lập
- Cao và Rộng tính bằng **mét**
