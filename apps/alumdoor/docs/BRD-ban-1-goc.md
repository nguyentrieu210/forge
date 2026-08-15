# BRD — Alumdoor: quản lý xưởng cửa cuốn

> Nền: `forge-core` (engine doctype). App này là **brief + DocType cắm vào lõi**, không sửa
> `server/packages`. Bài học từ bản cũ: framework từng import thẳng code Alumdoor, phải mổ ra —
> xem commit `741caeb7`.
>
> **Toàn bộ nguồn đã trích ra `docs/nguon/`** — 7 file · 41 sheet · 17.214 dòng · 28 ảnh, tra
> được bằng `grep`. Sinh lại bằng `tools/trich-nguon.py`. **Đừng trả lời từ trí nhớ.**
>
> Thứ tự thắng khi mâu thuẫn:
> 1. **Sổ nhật ký kế toán** (`MS LIÊN BS.xlsx` · `chi tiết nhập hàng ngày`) — tiền đã thu, không
>    cãi được. Đã phân xử hai vụ: bản lá `AL71N` và bước lá `AL70`.
> 2. **6 bảng giá chính thức có mộc, 31/07/2026** → `nguon/BANG-GIA-CHINH-THUC-31-07-2026.md`.
>    Thắng về **giá, chiều rộng tối đa, bảo hành, phụ thu**.
> 3. **`25.07.26 DDH - CÔNG THỨC CHIA LÁ.pdf`** — thắng về **bước lá và luật trừ-một-lá**
>    (PDF đọc được chữ, chính xác hơn ảnh `image2.png` cùng nội dung).
> 4. **`QUY CÁCH.xlsx` sheet `CT TT-SX`** — thắng về **quy đổi kích thước**, đủ cả 5 dòng cửa.
> 5. Sheet `GHI CHÚ` của MS Liên — **đã cũ**, chỉ dùng khi 4 nguồn trên không có.
>
> `danh mục sản phẩm.xlsx` chép cột **bề rộng nan** từ bảng giá — đúng với mục đích của nó,
> **không sai** như kết luận cũ. Chỉ sai nếu đem số đó đi chia lá.

---

## 1. Vấn đề

Xưởng đang chạy **một hệ ERP viết bằng Excel**: 17 sheet, 3.059 dòng nhật ký, 2.115 dòng định
mức, 433 dòng công nợ khách, 111 dòng công nợ NCC, 243 dòng tồn NVL, 125 dòng cửa lỗi.

> Mọi con số trong tài liệu này là **số dòng đã đếm bằng script trên file gốc**, không phải ước
> lượng. Chỗ nào là "số đơn" (gom theo `Số CT`) đều ghi rõ, vì một đơn trải nhiều dòng — nhầm
> hai đại lượng này là phóng đại gấp bốn lần.

Nghiệp vụ lõi không phải bán hàng thường mà là **sản xuất theo số đo**. Mỗi đơn phải:

1. Nhận số đo **lọt lòng** của ô cửa từ khách
2. Quy ra **phủ bì** theo dòng cửa (mỗi dòng một công thức khác)
3. Chia chiều cao phủ bì ra **số lá nhôm** theo bản lá riêng của từng mã **và từng đời** (cũ/mới)
4. Nổ ra định mức vật tư, xuất kho, cắt

**Sai một lá là hỏng một bộ nhôm.** Nhôm đã cắt không nối lại được. Bản lá lệch 0,002 m làm
lệch khoảng 2 lá trên cửa cao 3 m.

Ba nỗi đau xếp hạng bằng số:

| # | Nỗi đau | Đo được | Bằng chứng |
|---|---|---|---|
| **1** | Cắt sai số lá → hỏng cả bộ nhôm | **125 dòng** trong sheet `CỬA LỖI` (sheet không điền `Số CT` nên chưa quy ra được số ca) | Bản lá AL71N từng bị ghi 0,057 ở 2 nguồn, sổ chứng minh 0,055 |
| **2** | Tồn nhôm sổ ≠ thực tế; thợ cắt hỏng không báo | 17 sheet đối chiếu tay | Nguyên văn nguồn ngành: *"Công nhân có thể cắt nhầm, cắt hỏng nhưng không báo lại"* |
| **3** | Không biết đơn nào lỗ — chi phí không quy về đơn hàng | **125 đơn** bán chưa thu tiền (= 515 dòng chứng từ) | Sheet `TỔNG DT THEO NV` chỉ có doanh thu, không có giá vốn |

**Chỗ Excel bó tay (lý do trả tiền):** tra bảng chia lá thủ công · chọn lò xo theo cỡ cửa ·
đối chiếu 17 sheet tồn nhôm với sổ bán · biết đơn nào đang lỗ.

## 2. Mục tiêu

| Mục tiêu | Đo bằng |
|---|---|
| Không còn cắt sai số lá do tra nhầm bảng | Số ca `CỬA LỖI` do nguyên nhân "cắt sai" về 0 |
| Tồn nhôm trên app khớp kiểm kê thực tế | Chênh lệch kiểm kê ≤ 1 cây/kỳ |
| Biết lãi/lỗ từng đơn ngay khi đóng đơn | 100% đơn có giá vốn |
| Bỏ được file Excel | Xưởng ngừng cập nhật `MS LIÊN BS.xlsx` |

**Quy tắc nghiệp vụ bất biến:**

- **Không xóa cứng** bất kỳ chứng từ tài chính, phiếu cắt, phiếu kho nào. Chỉ `deleted_at`.
- **Số lá không được đoán.** Mã chưa có bản lá thì **từ chối tính**, không suy ra số gần đúng.
- **Bản lá là dữ liệu, không phải code.** Sửa bản lá là sửa bản ghi, không phải deploy.
- **Đơn giá dòng nảy ra khi bán trọn bộ = 0đ và khóa** — tiền đã tính trên dòng cửa chính.

## 3. Actor & vai trò

| Vai trò | Nhiệm vụ | Phạm vi dữ liệu (row-level) | Quyền |
|---|---|---|---|
| **Sale** | Nhận đo, tạo báo giá/đơn hàng | Chỉ đơn mình phụ trách (`nguoi_phu_trach = user`) | Đọc/ghi đơn nháp; **không** sửa đơn đã duyệt |
| **Quản lý bán hàng** | Duyệt đơn, duyệt chiết khấu >15% | Toàn bộ đơn | Duyệt/từ chối, sửa mọi đơn |
| **Kế toán** | Ghi công nợ, thu chi, xuất hóa đơn | Toàn bộ chứng từ tài chính | Ghi sổ; **không** sửa số đo kỹ thuật |
| **Thủ kho** | Nhập nhôm, xuất cắt, kiểm kê | Toàn bộ kho | Ghi phiếu nhập/xuất/kiểm kê |
| **Tổ trưởng sản xuất** | Nhận lệnh cắt, báo hoàn thành, báo lỗi | Lệnh sản xuất của tổ mình | Cập nhật tiến độ, báo phế |
| **Giám đốc** | Xem toàn cảnh, duyệt ngoại lệ | Tất cả | Toàn quyền + xem báo cáo lãi/lỗ |

Sổ có **9 cách gõ tên** cho **5 người thật** — ba người bị gõ nhiều kiểu:

```
LÊ THẾ ĐÔN (148) + LÊ THỂ ĐÔN (5) + LÊ QUÝ ĐÔN (1)   → 1 người
LÊ THUÝ (140)    + LÊ THÚY (90)                       → 1 người
LƯ CHÍ CƯỜNG (115) + CHÍ CƯỜNG (16)                   → 1 người
THÁI SƠN (125) · E HIỂN (1)                           → 2 người
```

→ **Người phụ trách bắt buộc là Link tới Nhân viên, cấm nhập tay.** Khi nhập dữ liệu cũ phải
gộp 9 chuỗi này về 5 bản ghi, nếu không thì báo cáo doanh thu theo nhân viên sai ngay từ đầu.

## 4. Thực thể dữ liệu

### 4.1 `Quy Cách Cửa` — bản lá và công thức chia lá

Chép từ ảnh `image2.png` (19 dòng) + `GHI CHÚ` (23 mã). Đây là bảng quyết định sinh tử.

| Trường | Kiểu | Khóa/Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `ma` | TEXT | PK | `AL548N`, `AL71C`… |
| `dong_cua` | TEXT | NOT NULL, enum | Đức · Úc · Đài Loan · Lưới · Siêu Trường · Tấm liền Úc |
| `doi` | TEXT | enum `CŨ`/`MỚI` | Quyết định bản lá; chênh tới 10% |
| **`buoc_la_m`** | REAL | NOT NULL, > 0 | **Ước số CHIA** — bước lá khi gài chồng. Nguồn: bảng chia lá 25/07 |
| **`be_rong_nan_mm`** | INTEGER | nullable | **Chỉ để nhận diện mã và tra giá.** Nguồn: cột `Bản lá` bảng giá 31/07 |
| **`rong_toi_da_mm`** | INTEGER | NOT NULL, > 0 | **Chặn bán** cửa rộng hơn. Từ 4.000 (AL595, AL71) tới 7.600 (VIP50, AL70) |
| `tru_mot_la` | INTEGER | 0/1, mặc định 1 | Lá đầu chiếm chỗ một lá ruột |
| `trong_luong_kg_m2` | REAL | nullable | ±8%. Dùng cho công thức mua vào `số kg × đơn giá` |
| `nguon` | TEXT | NOT NULL | Ghi rõ ảnh/sheet nào — để đời sau tra được |

> **`buoc_la_m` và `be_rong_nan_mm` là HAI đại lượng, không được gộp.** Bảng giá gọi `AL70` là
> "bản lá 70" (bề rộng nan), nhưng chia lá phải dùng **0,068** (bước lá khi gài chồng, lệch 2mm
> do chồng mép). Sổ nhật ký xác nhận qua **bốn giao dịch độc lập** cộng ảnh chụp app — chi tiết
> ở `nguon/BANG-GIA-CHINH-THUC-31-07-2026.md`.
>
> Năm mã có hai số khác nhau: `AL70` 70/0,068 · `VIP-ST500` 55/0,053 · `AL501N` 56/0,057 ·
> `AL552` 56/0,057 · `AL75` 66/0,067. **Lấy nhầm là lệch tới 2 lá mỗi bộ.**

**Công thức chia lá (đã kiểm chứng trên 4 ví dụ của xưởng):**

```
raw    = (CPB_mm − 130) / (buoc_la_m × 1000)     ← BƯỚC LÁ, không phải bề rộng nan
so_la  = round(raw − 1)        nếu tru_mot_la
       = round(raw)            nếu không
```

Ghi chú `"dưới 20,5 thì trừ lá, trên 20,5 không trừ"` và `"52,6 thì là 52 / <52,5 thì là 51"`
là **cùng một luật này** mô tả ở hai cỡ cửa — không phải ngoại lệ riêng mã nào.

**Ngoại lệ: đúng hai mã AL71, không phải AL70.**

Nguồn tốt nhất là **`25.07.26 DDH - CÔNG THỨC CHIA LÁ.pdf`** — cùng bảng với `image2.png` nhưng
là PDF đọc được chữ, nên không phải đoán qua ảnh:

| Mã | Bản lá | Công thức nguyên văn | Trừ 1? |
|---|---|---|---|
| `AL71N` | 0,055 | `(CPB-130)/0,057` | **KHÔNG** |
| `AL71 (CŨ)` | 0,055 | `(CPB-130)/0,055` | **KHÔNG** |
| `AL70 (2 LỚP)` · `AL70 (1 LỚP)` | 0,068 | `((CPB-130)/0,068)-1` | **CÓ** |
| 16 mã còn lại | | `((CPB-130)/bản lá)-1` | CÓ |

`AL71N` vẫn là dòng duy nhất có cột `BẢN LÁ` (0,055) lệch cột `CÔNG THỨC` (chia 0,057). Sổ nhật
ký phân xử: `TP LÁ RUỘT AL71N VK — AL71 9 LÁ RUỘT`, cao 0,495 m ⇒ `0,495/9 = 0,055`. **Dùng
cột BẢN LÁ.**

**Ba đại lượng, một phép tính** — chốt với chủ dự án 2026-08-15:

```
raw          = (CPB_mm − 130) / (buoc_la_m × 1000)
so_la_ruot   = round(raw − 1)   nếu tru_mot_la      ← số lá RUỘT phải cắt
             = round(raw)       nếu không
so_la_nhom   = so_la_ruot + 1                       ← cột "Số lá nhôm (6)" phiếu SX, GỒM lá đầu
bo_3_la_day  = 3                                    ← cột (13) riêng, KHÔNG nằm trong số lá nhôm
```

Kiểm chéo: với mã có trừ 1 thì `so_la_nhom = round(raw)`.

| Ví dụ | raw | lá ruột | số lá nhôm | Khớp nguồn |
|---|---|---|---|---|
| AL70 CPB 3m | 42,2 | 41 | **42** | ba ví dụ `image4/8/3` đều ra 42 ✓ |
| AL548 CPB 3m | 52,18 | **51** | 52 | đặc tả ghi `52,18−1 = 51 lá` ✓ |

Hai con số 41 và 42 là **cùng một phép tính đọc ở hai mốc khác nhau** — trước và sau khi cộng
lá đầu. Đặc tả AL548 báo *lá ruột*, phiếu sản xuất AL70 báo *số lá nhôm*. Không hề mâu thuẫn.

⇒ Bản chất của `−1`: **lá đầu chiếm chỗ đúng một lá ruột.** Mã nào không trừ (`AL71N`,
`AL71 CŨ`) là mã có lá đầu **không** chiếm chỗ lá ruột.

**Cửa Úc chia lá theo luật khác hẳn** — nửa lá đếm được, làm tròn về 0 / 0,3 / 0,7 / 1,0:

```
raw = CPB / 0,465 + hệ số     ← CHIỀU CAO PHỦ BÌ, không phải lọt lòng
      hệ số: motor trong & kéo tay 2 · motor ngoài 1,5 · motor ngoài tự dừng 1,3
đọc CHỮ SỐ THẬP PHÂN THỨ NHẤT sau khi cắt: 0→0 · 1-3→0,3 · 4-7→0,7 · 8-9→lên 1
```

Nguyên văn đặc tả: *"Cửa motor trong và kéo tay: (Chiêu cao PB : 0.465) + 2"*. Mười hai ví dụ
trong `25.7 QUY TRÌNH.docx` đều dùng `Cao pb`:

```
motor trong / kéo tay      2m8→8,0→8   2m9→8,2→8,3   3m→8,4→8,7    3m2→8,8→9
motor ngoài                2m6→7,0→7   2m7→7,3→7,3   2m8→7,5→7,7   3m→7,9→8
motor ngoài có tự dừng     3m15→8,0→8  3m2→8,1→8,3   3m4→8,6→8,7   3m5→8,8→9
```

Phải đọc **chữ số thập phân thứ nhất sau khi cắt bỏ phần còn lại**, không phải phần lẻ đầy đủ:
`(2m6:0,465)+1,5` giá trị thật là 7,0914 nhưng đặc tả ghi 7,0 → ra 7 lá. Đọc theo phần lẻ đầy
đủ (0,0914) sẽ rơi bậc 0,1–0,3 và ra 7,3 — thừa một phần ba lá trên mọi cửa có phần lẻ dưới 0,1.

Cửa Úc quy rộng cắt lá bằng công thức riêng: **`RCL = RPBR − 0,03`**.

### 4.2 `Chinh Sach Cat` — quy đổi kích thước và cơ sở tính tiền

**Nguồn: `QUY CÁCH.xlsx` sheet `CT TT-SX`.** Sheet `GHI CHÚ` của `MS LIÊN` đã cũ — chủ dự án
xác nhận, và nó thiếu hẳn Cửa Siêu Trường lẫn chiều Đại lý/Khách lẻ.

**Nguyên tắc chung, đúng cho cả 5 dòng cửa:** *"Tất cả chiều rộng đều quy về rộng cắt lá."*

#### Công thức SẢN XUẤT — ra `RCL`

| Dòng cửa | `RCL` |
|---|---|
| **Đức** | `RPBR − 0,08` **hoặc** `RPBN − 0,02` (hai công thức tương đương vì `RPBN = RPBR − 0,06`) |
| **Úc** | `RPBR − 0,03` |
| **Lưới · Đài Loan · Siêu Trường** | `RPBR − 0,03`<br>**Có bắn bướm ⇒ `RPBR − 0,035`** |

#### Công thức BÁN RA — **phụ thuộc ĐẠI LÝ hay KHÁCH LẺ**

Đây là chiều tôi từng bỏ sót hoàn toàn: cùng một bộ cửa, bán cho đại lý và bán lẻ **tính trên
hai chiều rộng khác nhau**.

| Dòng cửa | ĐẠI LÝ | KHÁCH LẺ |
|---|---|---|
| **Đức** | `CPB × RPBN` | `CPB × RPBR` |
| **Úc** | `CPB × RPBR` | `CPB × RPBR` |
| **Lưới** | tách món (chỉ lấy lưới): `CPB × RCL`<br>trọn bộ: `CPB × RPBR` | `CPB × RPBR` |
| **Đài Loan** | tách món (chỉ lấy lá ĐL): `CPB × RCL`<br>trọn bộ: `CPB × RPBR`<br>kéo tay: `CPB × RPBR` | `CPB × RPBR` |
| **Siêu Trường** | `CPB × RCL` | `CPB × RPBR` |

> **Khách lẻ luôn tính trên `RPBR`** ở cả 5 dòng cửa — rộng nhất, tức đắt nhất. Đại lý mới được
> tính trên chiều hẹp hơn (`RPBN` với Đức, `RCL` với Đài Loan tách món / Siêu Trường).

#### Công thức MUA VÀO

| Dòng cửa | Công thức |
|---|---|
| **Đức** | `số kg × đơn giá` |
| **Úc · Lưới · Đài Loan · Siêu Trường** | `số kg barem/m² × (Cao pb × Rộng cắt lá) × đơn giá` |

#### Chuỗi quy đổi từ số đo khách (`GHI CHÚ`, vẫn dùng được vì thuần hình học)

| | U75 | U100 |
|---|---|---|
| Đức | `RPBR = RLL + 0,15` → `RPBN = RPBR − 0,06` | `RPBR = RLL + 0,20` → `RPBN = RPBR − 0,07` |
| Úc | `RPBR = RLL + 0,14` | `RPBR = RLL + 0,20` |
| Đài Loan · Lưới | `RCL = RLL + 0,11` → `RPBR = RCL + 0,03` | `RPBR = RLL + 0,20` → `RCL = RPBR − 0,03` |

> **Bẫy chết người — luôn đi qua `RPBR`, cấm dùng đường tắt.** Các công thức rút gọn
> (`RPBN = RLL + 90`, `RCL = RLL + 110`) **chỉ đúng với ray U75**. Đổi sang U100 thì cùng một
> `RLL` cho ra `RPBN` lệch **40mm** và `RCL` lệch **60mm**. Cửa Đức tính tiền bằng `CPB × RPBN`
> nên nhầm chỗ này là vừa sai tiền vừa sai chiều rộng cắt lá.
>
> ⇒ `loai_ray` (U75 / U100) là **tham số bắt buộc** của mọi phép quy đổi, không phải trường
> tùy chọn. Engine luôn tính `RLL → RPBR → (RPBN | RCL)`, không bao giờ nhảy thẳng.

Chung mọi dòng: **`CPB = CLL + 500mm`** — khớp đúng chuẩn ngành tra được ([Austdoor](https://cuaaustdoor.com.vn/hai-cach-tinh-dien-tich-phu-bi-cua-cuon-co-ban-nhat-hien-nay.htm)).
Đài Loan còn có `CPB = số lá × 0,077`.

Bốn khái niệm chiều rộng, **phải là 4 trường riêng, không được gộp**:

```
RLL   rộng lọt lòng      ← khách đo, đầu vào duy nhất
RPBR  rộng phủ bì ray    ← trạm trung chuyển bắt buộc, phụ thuộc LOẠI RAY
RPBN  rộng phủ bì nhựa   ← cửa Đức tính tiền theo cái này
RCL   rộng cắt lá        ← xưởng cắt theo cái này
```

Trường bắt buộc của `Chinh Sach Cat`: `dong_cua` · `loai_ray` (U75/U100) · **`co_so_dai_ly`** và
**`co_so_khach_le`** (RPBN/RPBR/RCL — hai loại khách tính trên hai chiều rộng khác nhau) ·
`cpb_offset_mm` (=500) · `rcl_ban_buom_mm` (−35 khi có bắn bướm) · các hằng cộng/trừ của chuỗi
trên. Lưu **hằng số**, không lưu công thức dạng chữ — để sửa được mà không deploy.

### 4.3 `Cay Nhom Ton` — tồn nhôm theo cây

Nguồn: `TỒN NHÔM 2026 NEW.xlsx`, 17 sheet mã nhôm = **một thực thể chia theo mã**, không phải
17 thực thể.

| Trường | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `ma_nhom` | TEXT | FK → `Quy Cách Cửa` | AL75, AL548… |
| `mau` | TEXT | NOT NULL | Màu sơn |
| `tinh_trang` | TEXT | enum `CŨ`/`MỚI`, NOT NULL | **Quyết định bản lá khi cắt cây này** |
| `kho_m` | REAL | > 0 | Khổ cây (m) |
| `so_la` | INTEGER | ≥ 0 | Số lá còn trên cây |
| `kho_hoan_m` | REAL | nullable | Khổ đầu thừa sau cắt |
| `so_la_hoan` | INTEGER | nullable | Lá thừa trả về |
| `ngay_kiem` | TEXT | ISO date | Lần kiểm kê gần nhất |

Chốt với chủ dự án: **đời CŨ/MỚI gắn trên từng cây tồn**, không tách thành hai mã hàng. Lên
đơn chọn cây nào thì lấy bản lá theo `tinh_trang` của cây đó.

### 4.4 `Don Hang` / `Dong Don Hang`

Nguồn: sổ nhật ký 29 cột. Các trường số đo nằm trên **dòng**, không nằm trên đơn.

`Don Hang`: `so_ct` (tự sinh, khóa duy nhất) · `ngay_dat` · `ngay_giao_du_kien` · `khach_hang`
(FK) · `nguoi_phu_trach` (FK Nhân viên) · `loai_khach` (Đại lý/Khách lẻ) · `trang_thai`
(state machine §5) · `ghi_chu` · `deleted_at`

`Dong Don Hang`: `ma_hang` (FK) · `cach_ban` (Trọn bộ/Tách món/Tặng ray) · `cll_mm` · `rll_mm` ·
`cpb_mm` (tính) · `rpbr_mm` · `rpbn_mm` · `rcl_mm` (tính) · `so_bo` · `dien_tich_m2` (tính) ·
`so_la` (tính) · `don_gia` · `khoa_don_gia` (0/1) · `chiet_khau_pct` · `thanh_tien`

### 4.5 Các thực thể còn lại

| Thực thể | Nguồn | Ghi chú |
|---|---|---|
| `Khach Hang` / `Nha Cung Cap` | `DANH MỤC` 389 dòng | Gộp trùng tên khi nhập |
| `Nhan Vien` | 9 giá trị `Người phụ trách` → **5 người thật** (§3) | Sửa 3 cụm tên gõ sai. Cách gõ cũ lưu ở `Nhan Vien.ten_khac` để script nhập liệu tra |
| `Vat Tu` | `DANH MỤC` + `Trang tính29` | **524** mã vật tư khác nhau trong `ĐM` |
| `Dinh Muc` (BOM) | `ĐM` 2.115 dòng | Thô: 372 master · 1.737 dòng NVL. **Dùng được** (có mã hoặc tên): 363 thành phẩm · 1.572 dòng NVL, trong đó **534 dòng trống định mức = phải chọn lúc lên đơn** |
| `Lenh San Xuat` | `2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx`, 5 sheet tháng ~5.000 dòng | **Đã có sẵn trong Excel** — cột `LỆNH SX` · `LỆNH XUẤT KHO` · `PHIẾU XUẤT KHO` · `NGÀY GIAO HÀNG` · `SỐ LƯỢNG TỒN` · `KHO (1-2)` |
| `Bao Hanh` | sheet `DS BẢO HÀNH` 47 dòng | **Quy trình riêng 4 chặng**, không phải biến thể của `Cửa lỗi` — §4.8 |
| `Dinh Muc Gio` | sheet `LỊCH SẢN XUẤT` | Định mức giờ 5 dòng cửa + lò sơn theo mẻ — §4.9 |
| `Kho` | cột `KHO (1-2)` | **Hai kho**, không phải một |
| `Dot Giao Hang` | sheet `HOÀNG LAI` | Đơn lớn giao **nhiều đợt theo lô** — `ĐỢT 1 - 95 BỘ ĐÃ GIAO 2 BỘ` |
| `Phieu Cat` | `TỒN NHÔM` cột cắt/hoàn | Trừ kho theo cây |
| `Cong No KH` / `Cong No NCC` | 433 + 111 dòng | |
| `Thu Chi` + `Tai Khoan` | `THU-CHI` 207 · `TTTT` | 8 giá trị `Loại giao dịch` = 6 TK ngân hàng + tiền mặt + công nợ |
| `Cua Loi` | `CỬA LỖI` 125 dòng | **DocType riêng** — thiết kế kỹ thuật §3.8 ghi đè dòng cũ ("view lọc của chứng từ"): cần `nhom_nguyen_nhan` · `ben_chiu_trach_nhiem` · `chi_phi_uoc_tinh` mà chứng từ không có |
| `Bang Gia` | 4 ảnh `QUY CÁCH` | §4.6 |

### 4.6 `Bang Gia` — năm cấu trúc giá khác nhau

**Nguồn: 6 bảng giá chính thức có mộc công ty, hiệu lực 31/07/2026** — chép đầy đủ ở
`nguon/BANG-GIA-CHINH-THUC-31-07-2026.md`. Bảng trong `QUY CÁCH.xlsx` (07/07) đã cũ hơn.

Sai lầm của bản BRD trước: coi mọi dòng cửa đều tính giá theo **bậc diện tích**. Thực tế
**mỗi dòng cửa một cấu trúc giá riêng**:

| Dòng cửa | Giá tra theo | Ghi chú |
|---|---|---|
| **Đức** | **MÃ** (15 mã), hai cột `chỉ lá` / `tặng ray` | `tặng ray` chỉ áp khi **S ≥ 8m²** |
| **Úc** | **độ dày** × (`kéo tay` \| `motor ngoài`) | **Kéo tay ĐẮT hơn motor ngoài.** Màu bị ràng buộc theo độ dày |
| **Đài Loan tách món** | **độ dày** (mạ màu 4 mức · sơn tĩnh điện 3 mức) | |
| **Đài Loan trọn bộ** | **bậc diện tích** 8 × 7 cột độ dày | Đây là bảng duy nhất dùng bậc |
| **Lưới** | (dòng lưới × chất liệu) × (`chưa PK` \| `có PK`) | 3 dòng × 2 chất liệu × 2 cột = 12 giá |
| **Siêu Trường** | **độ dày** (bản 100), 7 mức từ 1.0 tới 1.6 LY | |

#### Bậc diện tích Đài Loan trọn bộ — cận trên ĐÓNG, cận dưới MỞ

Bậc đầu ghi `Trên 10m²` (`S > 10`), nên bậc kế `9m²-10m²` phải chứa mốc 10:

```
Trên 10m²   S > 10          4m² - 5m²   4 < S ≤ 5     ⇒ cửa đúng 5,0m² ăn bậc này
9m² - 10m²  9 < S ≤ 10      3m² - 4m²   3 < S ≤ 4
```

`S < 4` dùng **giá trọn gói theo bộ**, không tra bảng m² — ảnh ghi thẳng `"Cửa dưới 4m2"`:
4 DEM 1.800.000 · 4.6 DEM 2.000.000 · 5.2 DEM 2.200.000 (đ/bộ).

#### Bảy khoản cộng/trừ ngoài giá gốc

```
+ 300.000đ/bộ      S < 7m²                          (mọi dòng)
+  40.000đ/m²      6m < ngang cửa < 7m5
+  60.000đ/m²      7m5 < ngang cửa < 9m
+  20.000đ/m²      cửa cuốn lò xo kéo tay           (Đài Loan)
+ 360.000đ/m²      sơn màu vân gỗ                    (Đức)
+ 300.000đ/bộ      vận chuyển khi S < 8m²            (Đức)
−  70.000đ/m²      hàng thô không sơn                (Lưới)
```

#### Chiết khấu và thuế

- **Chiết khấu 15% trực tiếp trên giá chỉ lá** (cửa Đức) — sale tự duyệt tới 15%, trên 15% cần GĐ
- **VAT 8%** cộng sau cùng trên mọi đơn giá. *"Đơn giá sản phẩm trên chưa bao gồm thuế VAT 8%"*

#### Motor và bình lưu điện — tra theo diện tích cửa

15 loại motor, mỗi loại một ngưỡng diện tích từ `<15m²` tới `<55m²`; UPS tra theo **tải motor**
(`<600KG` → E-800, `<1000KG` → E-1000). Bảng đầy đủ ở nguồn. Đây là **luật tra được**, khác với
lò xo (chủ dự án chốt để thợ tự chọn).

#### Ràng buộc chiều rộng

Mỗi mã cửa Đức có **chiều rộng tối đa**, từ `<4m` (AL595, AL71) tới `<7m6` (VIP50, VIP-ST500/700,
AL70). Nhập rộng hơn ⇒ **chặn, không cho lưu đơn**.

#### SLA

Giao hàng **3–7 ngày**, trừ Lễ và Chủ nhật (ghi trên bảng giá cửa lưới).

### 4.7 Cấu tạo bộ cửa và bản lá của từng loại lá

**Một bộ cửa Đức gồm:** `N lá ruột + 1 lá đầu + 1 lá yếm + 1 lá trung gian + 1 lá đáy lớn`.
"Bộ 3 lá đáy" = yếm + trung gian + đáy lớn.

Bản lá riêng của từng loại — nguồn: bảng `CHI TIẾT SƠN` nhúng trong `25.7 QUY TRÌNH.docx`
(`word/media/image16.png`), là bảng xưởng dùng để tính m² trả tiền sơn:

| Loại lá | Dòng cửa | Bản lá (m) |
|---|---|---|
| Lá ruột | theo mã | bản lá của mã (§4.1) |
| **Lá đầu** | mọi mã | **= bản lá của mã** — cùng profile với lá ruột |
| Lá yếm | Đức | **0,02** |
| Lá trung gian | Đức | **0,05** |
| Lá đáy lớn | Đức | **0,09** |
| Lá 75MM | Đài Loan | 0,085 |
| Lá yếm siêu trường | Siêu Trường | 0,5 |

⇒ Bộ 3 lá đáy cửa Đức chiếm **0,16 m** chiều cao, không phải `3 × bản lá mã`.

**Kiểm chứng** — mọi dòng đều khớp `m² = bản lá × số lá × KT RCL`:

```
AL548         0,055 × 156 × 4,445 = 38,14 ✓      lô 1: 156 lá ruột ÷ 2 bộ = 78 lá/bộ
lá trung gian 0,05  ×   2 × 4,445 =  0,44 ✓      kèm 2 trung gian · 2 đáy lớn · 2 yếm
lá đáy lớn    0,09  ×   2 × 4,445 =  0,80 ✓      ⇒ mỗi bộ đúng 1 cái mỗi loại
lá yếm        0,02  ×   2 × 4,445 =  0,18 ✓
AL548         0,055 × 234 × 3,220 = 41,44 ✓      lô 2: 234 ÷ 3 bộ = 78 lá/bộ, kèm 3·3·3
```

Lá đầu không có dòng riêng trong bảng sơn vì cùng bản lá với lá ruột — khớp dòng sổ
`AL548 10 LÁ RUỘT + 1 LÁ ĐẦU` cao `0,605 = 11 × 0,055`.

**Hai đại lượng chiều cao, không được gộp:**

| Đại lượng | Công thức | Dùng để |
|---|---|---|
| **Chiều cao tính tiền** | `tổng số lá × bản lá của MÃ` | Đơn giá m², thành tiền — giữ đúng cách xưởng đang tính |
| **Chiều cao vật lý / cắt** | `N×bản lá mã + 0,16` (Đức) | Lệnh cắt, m² tiền sơn |

Sổ nhật ký ghi `AL70 23 lá ruột + bộ 3 lá đáy` cao `1,768 = 26 × 0,068` — đó là **quy ước tính
tiền**, không phải số đo thật (số đo thật `23×0,068 + 0,16 = 1,724`, lệch 44 mm). Giữ nguyên
quy ước để tiền không đổi so với hiện tại; lệnh cắt dùng số đo thật.

### 4.8 `Bao Hanh` — quy trình 4 chặng

Nguồn: `2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx` sheet `DS BẢO HÀNH`. **Khác hẳn `Cua Loi`**: hàng bảo
hành là **phụ kiện mua của NCC** (bình lưu điện, motor), không phải cửa xưởng làm.

```
NGÀY NHẬP LỖI ──> NGÀY XUẤT ĐỔI ──> NGÀY GỬI BẢO HÀNH ──> NGÀY TRẢ BẢO HÀNH
   (khách báo)      (đổi ngay          (gửi cái hỏng        (NCC trả về)
                     cho khách)          cho NCC)
```

Mỗi chặng có **ngày + số lượng riêng** — nên số lượng có thể lệch giữa các chặng (đổi 3 cái
nhưng chỉ gửi NCC 2 cái). Trường: `ngay_dat_hang` · 4 cặp `(ngay_*, sl_*)` · `so_ct` ·
`nha_cung_cap` · `khach_hang` · `loai_hang` · `ghi_chu`.

**Chính sách bảo hành** (bảng giá 31/07):

| Nhóm | Thời hạn |
|---|---|
| Motor Tanker · Alumax · YHLD | 12 tháng **đổi mới** tại xưởng |
| Motor JG | 12 tháng = **3 tháng đổi mới + 9 tháng sửa chữa** |
| Cửa | Mất bảo hành nếu: vận chuyển móp · sơn trầy xước · lắp sai kỹ thuật · trượt hành trình xổ lô |
| Motor/UPS | Mất bảo hành nếu: rách tem · cháy nổ · chập điện · nhiễm nước |

### 4.9 `Dinh Muc Gio` — năng lực sản xuất

Nguồn: sheet `LỊCH SẢN XUẤT`. **Ba kiểu định mức khác nhau**, không quy về một được:

| Bộ phận | Định mức | Kiểu |
|---|---|---|
| Úc | 1h45' / 12m² | theo **diện tích** |
| Lưới | 4h / 9m² | theo **diện tích** |
| Đài Loan | 30' / bộ | theo **bộ** |
| Siêu Trường | 30' / bộ | theo **bộ** |
| **Đức** | cắt dập 40' · hoàn thiện 40' · lấy nhôm 20' | theo **công đoạn** (tổng 100') |
| **Lò sơn** | 1 màu (345 lá × 11,5m dài) / 3 tiếng 1 mẻ | theo **MẺ** — nút thắt |

> **Lò sơn là ràng buộc gom nhóm.** Mỗi mẻ 3 tiếng chỉ chạy **một màu**. Xếp lịch phải gom đơn
> cùng màu vào một mẻ, nếu không thì mỗi đơn một mẻ và xưởng chết tắc. Đây là ràng buộc lập lịch
> nặng nhất, và Excel không mô hình hoá được.

### 4.10 `Kho` và `Dot Giao Hang`

**Hai kho** — cột `KHO (1-2)` trong sổ điều độ. Mọi phiếu nhập/xuất phải ghi kho.

**Giao nhiều đợt theo lô** — sheet `HOÀNG LAI` ghi `ĐỢT 1 - 95 BỘ ĐÃ GIAO HÀNG 2 BỘ`, cột
`LÔ` · `SL` · `ĐÃ XUẤT`. Đơn lớn không giao một lần. `Dot Giao Hang` là bảng con của `Don Hang`:
`dot` · `lo` · `so_luong` · `da_xuat` · `ngay_giao`.

## 5. Luồng nghiệp vụ

### 5.1 Bán hàng → sản xuất → giao

```
Sale nhận đo (CLL × RLL)
  → app quy ra CPB/RPBR/RPBN/RCL theo dòng cửa
  → app chia lá theo bản lá của ĐỜI cây nhôm sẽ cắt
  → chọn cách bán → nảy dòng phụ kiện (đơn giá 0đ, khóa)
  → chiết khấu ≤15% tự duyệt, >15% chờ Giám đốc
→ Duyệt đơn → sinh Lệnh sản xuất
  → Thủ kho chọn cây nhôm cụ thể → Phiếu cắt → trừ tồn theo cây
  → Tổ trưởng báo hoàn thành / báo phế
→ Giao hàng → Kế toán ghi công nợ → Thu tiền
```

**Ngoại lệ bắt buộc xử lý:**

| Tình huống | Xử lý |
|---|---|
| Mã chưa có bản lá | **Chặn**, không cho tạo lệnh cắt. Thông báo: *"Chưa có công thức chia lá cho `<mã>`"* |
| Không đủ cây nhôm đúng đời | Cảnh báo, cho chọn đời khác **nhưng phải xác nhận** vì bản lá đổi → số lá đổi |
| Thợ báo cắt hỏng | Ghi `Cửa lỗi` + trừ tồn phần hỏng, **không** im lặng |
| Sửa đơn đã có lệnh cắt | Chặn; phải hủy lệnh cắt trước |

### 5.2 Máy trạng thái đơn hàng

```
Nháp → Chờ duyệt → Đã duyệt → Đang sản xuất → Chờ giao → Đã giao → Đã thu tiền
                       ↓                ↓
                    Từ chối          Hủy (ghi lý do)
```

Sheet hiện có trường `Tình trạng đơn hàng` nhưng **chỉ 1/3.059 dòng có dữ liệu** — nghĩa là
xưởng cần nó mà Excel không tiện dùng. Đây là chỗ app thắng rõ.

## 6. Ma trận quyền

| Endpoint | Method | Vai trò | Row-level ở server |
|---|---|---|---|
| `/api/method/frappe.client.get_list?doctype=Don Hang` | GET | Sale | `WHERE nguoi_phu_trach = session.user AND deleted_at IS NULL` |
| " | GET | QL bán hàng, Kế toán, GĐ | không lọc |
| `/api/v1/commands` action=`save` doctype=`Don Hang` | POST | Sale | chặn nếu `trang_thai != 'Nháp'` |
| " action=`submit` | POST | QL bán hàng, GĐ | Sale **403** |
| `/api/method/alumdoor.don_hang.duyet_chiet_khau` | POST | GĐ | chỉ khi `chiet_khau_pct > 15` |
| `/api/method/alumdoor.san_xuat.tao_phieu_cat` | POST | Thủ kho | chặn nếu đơn chưa duyệt |
| `/api/method/alumdoor.kho.kiem_ke` | POST | Thủ kho, GĐ | |
| doctype=`Quy Cách Cửa` action=`save` | POST | **chỉ GĐ** | Sửa bản lá = đổi cách cắt toàn xưởng |
| doctype=`Bang Gia` action=`save` | POST | **chỉ GĐ** | |
| `/api/method/alumdoor.bao_cao.lai_lo` | GET | GĐ | Sale/Kế toán **403** |

Chặn ở **server**, không chỉ ẩn nút. Test bắt buộc: đăng nhập Sale → gọi thẳng API submit →
phải nhận 403.

## 7. Màn hình

| Màn | Desktop | Mobile |
|---|---|---|
| **Tạo đơn** ★ màn chính | 3 cột: danh sách đơn co lại · form đơn · cột phải hiện **số lá tính ra + cây nhôm khả dụng** | Form full-screen, bước: khách → số đo → cách bán → xem lá → lưu |
| Danh sách đơn | Bảng: checkbox · STT · số CT · khách · ngày giao · trạng thái · tiền. Lọc theo trạng thái/người phụ trách | Card list |
| Tồn nhôm | Bảng nhóm theo mã, cột màu/tình trạng/khổ/số lá; lọc nhanh "đủ cắt đơn này" | Card + quét mã |
| Lệnh sản xuất | Kanban theo công đoạn (cắt → sơn → lắp → giao) | Kanban dọc |
| Công nợ | Bảng KH/NCC + tuổi nợ | Card |
| Báo cáo | Doanh thu theo NV · lãi/lỗ theo đơn · cửa lỗi theo nguyên nhân | Chỉ xem |

Màn Tạo đơn phải hiện **số lá và cây nhôm sẽ cắt ngay lúc nhập số đo** — đó là toàn bộ lý do
app tồn tại.

## 8. Ngoài phạm vi bản 1

- Luật tự chọn lò xo theo cỡ cửa — **thợ tự chọn 1 trong 8 quy cách** (chốt với chủ dự án)
- Tối ưu cắt trên cây 6m để giảm phế (best practice quốc tế, chưa làm)
- Kết nối máy cắt CNC
- Hóa đơn điện tử
- App mobile cho thợ ngoài công trường

## 9. Câu hỏi còn mở

**Không còn câu nào.** Câu cuối — cột `Số lá nhôm` có gồm lá đầu không — chủ dự án chốt
**có** (2026-08-15). Công thức ba đại lượng ở §4.1.

Ghi lại để đời sau khỏi hỏi lại: **năm** câu từng bị coi là "mơ hồ" hoá ra **đều có sẵn trong
tài liệu**, chỉ do đọc chưa kỹ:

| Từng tưởng mơ hồ | Thực ra nằm ở |
|---|---|
| Ranh giới bậc giá | chữ `Trên 10m²` là mốc neo |
| Giá bộ hay giá m² | ảnh ghi thẳng `Cửa dưới 4m2` |
| Cửa Úc dùng cao nào | đặc tả ghi rõ `Chiêu cao PB` |
| Bản lá lá phụ | cột `SỐ LÁ` của bảng `CHI TIẾT SƠN` |
| **Quy đổi cửa Siêu Trường** | **sheet `CT TT-SX` của `QUY CÁCH`** — có đủ cả 5 dòng cửa |

**Trước khi hỏi xưởng: đọc lại ảnh nhúng, PDF rời, và sheet `CT TT-SX` đã.**

## 10. Ràng buộc đã chốt

- **Đơn giá dòng nảy ra khi bán trọn bộ = 0đ, khóa không cho sửa.** Tiền tính một lần trên dòng
  cửa chính. Bằng chứng: chế độ giá cửa Đức tên là `ĐƠN GIÁ TẶNG RAY`; ảnh ghi *"đơn giá cửa Úc
  tấm liền đã bao gồm phụ kiện hoàn thiện"*; cửa Lưới tính `tổng diện tích × đơn giá trọn bộ`
  rồi khóa cả dòng lá lẫn lưới.
- Chiết khấu **≤15% Sale tự duyệt, >15% cần Giám đốc**.
- Ray tặng chỉ áp cho cửa **từ 8m² trở lên** (bảng giá 31/07; bản BRD cũ ghi nhầm >10m²).
- Phụ thu **300.000đ** cho cửa **<7m²**.
- `CPB = CLL + 500mm` mọi dòng cửa.
- Đời CŨ/MỚI gắn trên **cây nhôm tồn**, không tách mã hàng.
- Người phụ trách là **Link tới Nhân viên**, cấm nhập tay.

**Chốt ngày 2026-08-15 (chủ dự án trả lời 5 câu §9):**

- **Cửa Lưới trọn bộ**: nhân đơn giá vào **tổng diện tích** (2 lá + lưới), một lần. Các dòng xổ
  ra khi bán trọn bộ tồn tại **chủ yếu để nhập kích thước**, không phải để tính tiền — khớp
  đúng luật `đơn giá = 0đ và khóa` ở trên.
- **Bộ 3 lá đáy** = yếm + trung gian + đáy lớn.
- **`AL70` không trừ 1 lá.** Nguồn `MS LIÊN` có thể cũ hơn và không còn dùng; khi `GHI CHÚ` chọi
  với ảnh trong `25.7 QUY TRÌNH`, **lấy theo QUY TRÌNH**. Lưu ý phân biệt: *sổ nhật ký* trong MS
  Liên vẫn là bằng chứng giao dịch đáng tin (nó ghi tiền đã thu); chỉ *bảng tra `GHI CHÚ`* mới
  là tài liệu tham chiếu có thể lỗi thời.
- **Nguyên nhân cửa lỗi**: do bên phát triển tự định nghĩa danh mục — đề xuất ở §10.1.
- **Giá tiền mặt = giá công nợ.** Không có hai bảng giá; khác nhau chỉ là **chính sách thanh
  toán**. Có ba hình thức: trả ngay · **đặt cọc trước** · trả hết sau khi xuất kho giao hàng.

### 10.1 Danh mục nguyên nhân cửa lỗi (tự định nghĩa)

Suy từ 125 dòng `CỬA LỖI` và cột `Loại chứng từ` (`Trả sản phẩm lỗi nhà cung cấp` = 6 ca):

| Nhóm | Nguyên nhân | Ai chịu |
|---|---|---|
| Sản xuất | Cắt sai số lá · Cắt sai kích thước · Sơn lỗi · Lắp sai phụ kiện | Xưởng |
| Vật tư | Nhôm lỗi từ NCC · Phụ kiện lỗi · Sơn không đạt màu | Nhà cung cấp |
| Bán hàng | Nhận đo sai · Nhập nhầm quy cách | Sale |
| Khách | Khách đổi ý sau khi đã cắt · Khách đo sai ô chờ | Khách hàng |

Trường bắt buộc: `nhom_nguyen_nhan` · `nguyen_nhan` · `ben_chiu_trach_nhiem` · `chi_phi_uoc_tinh`.
Có `bên chịu` mới trả lời được câu *"tháng này mất bao nhiêu tiền vì cắt sai"* — nỗi đau #1.

### 10.2 Chính sách thanh toán

| Hình thức | Luồng | Ràng buộc |
|---|---|---|
| Trả ngay | Giao → thu đủ | |
| **Đặt cọc** | Cọc khi duyệt đơn → còn lại khi giao | **Có cọc là cho sản xuất, không đặt mức tối thiểu** (chốt 2026-08-15). Ghi `so_tien_coc > 0` |
| Trả sau | Xuất kho giao hàng → trả hết | Vào công nợ; theo dõi tuổi nợ |

Đơn giá **giống hệt nhau** ở cả ba — không dựng bảng giá thứ hai.

**Số chứng từ:** sổ cũ có hai dạng lẫn nhau (`000873` thuần số 6 chữ, và `BSCT26050601` có tiền
tố + năm tháng). Chủ dự án chốt không quan trọng → app dùng **một dạng thống nhất**, cấp số
nguyên tử qua counter của lõi. Dữ liệu cũ nhập vào giữ nguyên số gốc ở trường `so_ct_goc`.
