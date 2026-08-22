# ALUMDOOR — QUY CÁCH SẢN XUẤT / MUA VÀO / BÁN RA + QUY TẮC BOM

> **Nguồn duy nhất:** `QUY CÁCH  (3).xlsx` do chủ xưởng gửi 21/08/2026
> (bản gốc `C:\Users\Admin\Downloads\QUY CÁCH  (3).xlsx`, 530.745 bytes, mtime 1786718373236).
> Trích nguyên văn 3 sheet: `CT TT-SX`, `ĐƠN GIÁ TRỌN BỘ`, `MS`.
> **Mọi ô trong tài liệu này là NGUYÊN VĂN của chủ xưởng** — không diễn giải thêm.
> Chỗ nào tôi nhận xét/đối chiếu đều đánh dấu rõ bằng `> ⚠ ĐỐI CHIẾU`.

---

## 1. Rộng cắt lá — quy về một đại lượng duy nhất

Nguyên văn: *"Tất cả chiều rộng đều quy về rộng cắt lá"*

| Loại cửa | Công thức rộng cắt lá | Ô nguồn |
|---|---|---|
| **CỬA ĐỨC** | CT1: `R PB ray − 0.08` (m) — CT2: `R PB nhựa − 0.02` (m) | `CT TT-SX!B3` |
| **CỬA ÚC** | `R PB ray − 0.03` (m) | `CT TT-SX!B4` |
| **CỬA LƯỚI** (mắt võng — song ngang phi 19) | `R PB ray − 0.03`; **nếu đơn có phát sinh lá Đài Loan bắn bướm → `R PB ray − 0.035`** | `CT TT-SX!B5` |
| **CỬA ĐÀI LOAN** | `R PB ray − 0.03`; bắn bướm → `R PB ray − 0.035` | `CT TT-SX!B6` |
| **CỬA SIÊU TRƯỜNG** | `R PB ray − 0.03`; bắn bướm → `R PB ray − 0.035` | `CT TT-SX!B7` |

> ⚠ ĐỐI CHIẾU — cần kiểm tra trong code:
> 1. Màn hình sống đang hiện `Rộng cắt lá = Phủ bì nhựa 3 − 0.02 = 2.98 m` cho `CDUC_TD_AL501N` → **khớp CT2 cửa Đức**.
> 2. Hằng `0.08` (cửa Đức, CT1): audit đối chiếu quy trình phát hiện tài liệu cũ của chủ xưởng ghi `− 0,06`,
>    bản chốt 29/07 ghi `− 0,08`, máy đang chạy `0,08`. **File quy cách này xác nhận `0.08`** → coi như đã chốt.
> 3. Điều kiện chọn CT1 hay CT2 cho cửa Đức: file KHÔNG nói. Suy đoán hợp lý là theo `width_basis`
>    người bán chọn (PB ray → CT1, PB nhựa → CT2), nhưng **phải xác nhận với chủ xưởng**.
> 4. Nhánh `− 0.035` khi "có lá Đài Loan bắn bướm": cần tìm xem code có cờ nào biểu diễn "bắn bướm" không.

---

## 2. Công thức MUA VÀO

| Loại cửa | Công thức | Ô nguồn |
|---|---|---|
| **CỬA ĐỨC** | `số kg × đơn giá` | `CT TT-SX!C3` |
| **CỬA ÚC** | `Số kg barem/m² × (Cao PB × Rộng cắt lá) × đơn giá` | `CT TT-SX!C4` |
| **CỬA LƯỚI** | `Số kg barem/m² × (Cao lưới × Rộng cắt lá) × đơn giá` | `CT TT-SX!C5` |
| **CỬA ĐÀI LOAN** | `Số kg barem/m² × (Cao lưới × Rộng cắt lá) × đơn giá` | `CT TT-SX!C6` |
| **CỬA SIÊU TRƯỜNG** | `Số kg barem/m² × (Cao lưới × Rộng cắt lá) × đơn giá` | `CT TT-SX!C7` |

> ⚠ ĐỐI CHIẾU:
> - Cửa Úc dùng **Cao PB**; Lưới / Đài Loan / Siêu Trường dùng **Cao lưới**. Đây là khác biệt thật, dễ code nhầm.
> - Audit riêng đã đo: **0/404 mã đã khai barem kg/m²** → công thức mua vào của 4 nhóm này hiện không chạy được.
>   Cần chủ xưởng cấp bảng barem.

---

## 3. Công thức BÁN RA — diện tích tính tiền

Cột `ĐẠI LÝ` và `KHÁCH LẺ` là **hai công thức khác nhau**.

| Loại cửa | ĐẠI LÝ | KHÁCH LẺ | Ô nguồn |
|---|---|---|---|
| **CỬA ĐỨC** | `Cao PB × R **PB nhựa**` | `Cao PB × R **PB ray**` | `D3` / `E3` |
| **CỬA ÚC** | `Cao PB × R PB ray` | `Cao PB × R PB ray` | `D4` / `E4` |
| **CỬA LƯỚI** | • tách món (chỉ lấy lưới): `Cao PB × R **cắt lá**`<br>• trọn bộ: `Cao PB × R PB ray` | `Cao PB × R PB ray` | `D5` / `E5` |
| **CỬA ĐÀI LOAN** | • tách món (chỉ lấy lá ĐL): `Cao PB × R **cắt lá**`<br>• trọn bộ: `Cao PB × R PB ray`<br>• **kéo tay**: `Cao PB × R PB ray` | `Cao PB × R PB ray` | `D6` / `E6` |
| **CỬA SIÊU TRƯỜNG** | `Cao PB × R **cắt lá**` | `Cao PB × R PB ray` | `D7` / `E7` |

> ⚠ ĐỐI CHIẾU — đây là chỗ dễ sai tiền nhất:
> - Code hiện tại (`sales-order-v2/model.ts:529-550`) chỉ có 2 nhánh: `alwaysUsesPbRay` → PB ray,
>   và `customerGroup === "Lẻ"` → PB ray, còn lại → PB nhựa.
> - **Bảng trên đòi 3 cơ sở** (PB nhựa / PB ray / **rộng cắt lá**) và phụ thuộc **cả `sales_mode`** (trọn bộ vs tách món).
>   Nhánh "rộng cắt lá" (Lưới tách món, Đài Loan tách món, Siêu Trường đại lý) **chưa thấy tồn tại trong code**
>   → nghi ngờ **tính sai diện tích ⇒ sai tiền** cho 3 trường hợp đó. Phải xác minh và sửa.
> - Đài Loan có thêm nhánh riêng cho **kéo tay** — cần tìm cờ tương ứng trong code.

---

## 4. QUY TẮC BOM — DÒNG TỰ SINH (đây chính là phần chủ xưởng nói "chưa có")

Nguyên tắc chung theo nguyên văn: chọn một loại đơn giá thì hệ thống **"nhảy ra các dòng"** phụ kiện kèm theo,
kích thước tính theo công thức, và **"khóa cột đơn giá"** (người bán không sửa được giá dòng phụ kiện).

### 4.1 CỬA ĐỨC

| Đơn giá | Hành vi | Ô nguồn |
|---|---|---|
| `ĐƠN GIÁ CHỈ LÁ (MUA TÁCH MÓN)` | chiết khấu **15% × đơn giá chỉ lá** | `B2`/`C2` |
| `ĐƠN GIÁ TẶNG RAY` | chiết khấu **15% × đơn giá chỉ lá** | `B3`/`C3` |

**Dòng tự sinh khi chọn ĐƠN GIÁ TẶNG RAY** (`C4`, nguyên văn):
> *"khi chọn đơn giá tặng ray thì sẽ nhảy 1 dòng ray hộp TD: công thức = chiều cao phủ bì − 0,2
> (vd: cpb 3m thì ray sẽ là 2m8 x sl 2 cây) và khóa cột đơn giá.
> **áp dụng cho cửa có diện tích trên 10m2**"*

| Vật tư | Kích thước | SL | Giá |
|---|---|---|---|
| Ray hộp TD | `Cao PB − 0,2` (m) | 2 cây | **khóa** |

> ⚠ ĐỐI CHIẾU — **HAI LỆCH NGHIÊM TRỌNG, chạm tiền:**
> 1. **Ngưỡng diện tích**: file quy cách ghi **trên 10 m²**. Code/dữ liệu đang chạy luật tên
>    `"Tặng ray cửa Đức từ 8 m²"` (`DUC-GIFT-RAIL-8M2`, `model.ts:648`) → **ngưỡng 8 m²**.
>    Lệch 2 m². **CẦN CHỦ XƯỞNG CHỐT: 8 hay 10 m²?**
> 2. **Chiết khấu 15% tính trên ĐƠN GIÁ CHỈ LÁ**, kể cả khi bán theo đơn giá tặng ray.
>    Đây là bằng chứng độc lập củng cố finding P0 "chiết khấu 15% bị trừ hai lần":
>    15% là **một** khoản duy nhất, không phải hai.

### 4.2 CỬA ÚC — `ĐƠN GIÁ TRỌN BỘ`

Nguyên văn `C5`: *"Khi chọn cửa úc sễ nhảy ra các dòng sau:"*

| # | Dòng | Kích thước | SL | Giá |
|---|---|---|---|---|
| 1 | Nhập kích thước cửa | (người bán nhập) | — | — |
| 2 | Ray sắt U70 (**không ron**) | `Cao PB − 0,1` (m) | 2 cây | **khóa** |
| 3 | Giá T | — | 1 cặp | **khóa** |

### 4.3 CỬA ĐÀI LOAN — `ĐƠN GIÁ TRỌN BỘ`

Nguyên văn `C6`: *"khi chọn đơn giá trọn bộ thì sẽ nhảy ra các dòng sau:"*

| # | Dòng | Kích thước | Giá |
|---|---|---|---|
| 1 | Cửa cuốn Đài Loan trọn bộ | nhập kích thước cửa ⇒ **tự tính diện tích, áp đơn giá theo bảng giá** | theo bậc diện tích |
| 2 | Ray sắt U70 **có ron** | `Cao PB − 0,1` (m) | **khóa** |
| 3 | v4 | `R PB ray − 0,03` (m) | **khóa** |
| 4 | trục 114-1ly8 | `R PB ray − 0,05` (m) | **khóa** |

`ĐƠN GIÁ CHỈ LÁ (MUA TÁCH MÓN)` (`C7`): *"mua gì tự chọn cái đó"* → **không tự sinh dòng nào.**

### 4.4 CỬA LƯỚI — `ĐƠN GIÁ CHỈ LÁ (TRỌN BỘ)`

Nguyên văn `C9`:
> *"khi chọn đơn giá trọn bộ thì sẽ nhảy ra các dòng sau:
> **ĐƠN GIÁ TRỌN BỘ (TỔNG DIỆN TÍCH 2 LÁ VÀ LƯỚI × ĐƠN GIÁ TRỌN BỘ)**"*

| # | Dòng | Kích thước | Giá |
|---|---|---|---|
| 0 | *(tiền cửa)* | **tổng diện tích 2 lá + lưới** × đơn giá trọn bộ | — |
| 1 | Lá Đài Loan STĐ 8D | nhập `cao × R PB ray × sl` | **khóa** |
| 2 | Lưới (theo loại chọn đặt hàng) | nhập `cao × R PB ray × sl` | **khóa** |
| 3 | Ray sắt U70 **có ron** | `Cao PB − 0,1` (m) | **khóa** |
| 4 | v4 | `R PB ray − 0,03` (m) | **khóa** |
| 5 | trục 114-1ly8 | `R PB ray − 0,05` (m) | **khóa** |

`ĐƠN GIÁ CHỈ LÁ (MUA TÁCH MÓN)` (`C8`): *"LẤY GÌ TÍNH TIỀN CÁI ĐÓ"* → không tự sinh dòng.

### 4.5 CỬA SIÊU TRƯỜNG

`ĐƠN GIÁ CHỈ LÁ (MUA TÁCH MÓN)` (`C10`): *"mua gì tự chọn cái đó"* → không tự sinh dòng.
Không có mục "trọn bộ" cho Siêu Trường trong file.

### 4.6 Tổng hợp hằng số cắt phụ kiện (dùng chung, để code một chỗ)

| Vật tư | Công thức | Xuất hiện ở |
|---|---|---|
| Ray hộp TD | `Cao PB − 0,20` × 2 cây | Đức tặng ray |
| Ray sắt U70 (không ron) | `Cao PB − 0,10` × 2 cây | Úc trọn bộ |
| Ray sắt U70 (có ron) | `Cao PB − 0,10` | Đài Loan trọn bộ, Lưới trọn bộ |
| v4 | `R PB ray − 0,03` | Đài Loan trọn bộ, Lưới trọn bộ |
| trục 114-1ly8 | `R PB ray − 0,05` | Đài Loan trọn bộ, Lưới trọn bộ |
| Giá T | — × 1 cặp | Úc trọn bộ |

---

## 5. MS — Bảng màu và nhóm sản phẩm áp dụng (sheet `MS`, 23 dòng)

### 5.1 Sơn tĩnh điện (STĐ) — 18 màu
Nhóm áp dụng (giống nhau cho cả 18): **Cửa CN Đức, Úc, Siêu Trường, Đài Loan, Lưới, Phụ kiện cần sơn tĩnh điện**

CAFÉ · XANH NGỌC · MIDNIGHT BLUE · TRẮNG · XÁM MỜ · VÀNG KEM · GHI SẦN · NÂU XINGFA · XÁM XINGFA ·
ĐEN XINGFA · VÀNG KEM BÓNG · XANH NGỌC BÓNG · XANH LÁ CÂY · XÁM LÔNG CHUỘT · CAM · ĐỎ ĐÔ · KEM SỮA · XANH DƯƠNG

### 5.2 Mạ màu (MM) — 5 tổ hợp, phạm vi HẸP HƠN

| Màu | Nhóm SP áp dụng |
|---|---|
| XANH NGỌC − VÀNG KEM | Cửa Úc, Đài Loan |
| XÁM − TRẮNG | **Chỉ cửa Úc** |
| GHI ÚC − KEM ÚC | **Chỉ cửa Úc** |
| XANH RÊU − CAFÉ | **Chỉ cửa Úc** |
| XÁM − XANH NGỌC | **Chỉ cửa Đài Loan** |

> ⚠ ĐỐI CHIẾU: đây là bảng **ràng buộc màu theo nhóm hàng** — dropdown màu phải lọc theo bảng này.
> Audit trước ghi nhận `G14` (dropdown màu lọc theo phạm vi Bề mặt) đã sống, nhưng cần kiểm
> dữ liệu `Item Color` / `Pricing Scope` có đúng 23 dòng này không, đặc biệt 5 dòng Mạ màu phạm vi hẹp.
> Cũng cần kiểm màu `VAN_GO` (audit phát hiện là **mã thô duy nhất** giữa 24 tên tiếng Việt,
> và là lựa chọn +465.000 đ/m²) — **file quy cách này KHÔNG có màu Vân gỗ.** Cần hỏi chủ xưởng.

---

## 6. Câu hỏi phát sinh trực tiếp từ file quy cách (cần chủ xưởng trả lời)

1. **Ngưỡng tặng ray cửa Đức: 8 m² hay 10 m²?** (file ghi "trên 10m2"; máy đang chạy 8 m²)
2. Cửa Đức chọn CT1 (`PB ray − 0.08`) hay CT2 (`PB nhựa − 0.02`) **theo tiêu chí nào**?
3. "Lá Đài Loan **bắn bướm**" nhận biết bằng gì trên đơn — mã hàng riêng, hay một ô tick?
4. Barem **kg/m²** của Úc / Lưới / Đài Loan / Siêu Trường là bao nhiêu? (hiện 0/404 mã đã khai → công thức mua vào chết)
5. Cửa Úc dùng **Cao PB**, còn Lưới/ĐL/ST dùng **Cao lưới** — đúng không, hay là lỗi đánh máy trong file?
6. Cửa Siêu Trường **có bán trọn bộ** không? (file chỉ có "mua tách món")
7. Màu **Vân gỗ** (+465.000 đ/m², đang có trong máy) không có trong bảng MS — còn dùng không?
8. Dòng phụ kiện tự sinh **khóa đơn giá** — nghĩa là giá 0đ (tặng kèm) hay có giá nhưng người bán không sửa được?
9. Cửa Lưới trọn bộ: "**TỔNG DIỆN TÍCH 2 LÁ VÀ LƯỚI**" — 2 lá đây là 2 lá Đài Loan, hay 1 lá + 1 lưới?
10. Khi cửa **dưới** ngưỡng tặng ray mà người bán vẫn chọn đơn giá tặng ray — chặn, cảnh báo, hay cho qua?
