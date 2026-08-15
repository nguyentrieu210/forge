# BRD — Alumdoor: quản lý xưởng cửa cuốn

> **Bản hợp nhất, 2026-08-15.** Ba nguồn gộp lại:
>
> | Tầng | Lấy từ | Vì sao |
> |---|---|---|
> | **Nền tảng** | Forge **đầy đủ** (`C:\alumdoor`, main@dd06bbc4) | Có `ledger` + `clouderp-selling/stock/pricing` — bản bóc lõi không có |
> | **Xương app** | **Bản 1** (`feat/alumdoor-v1`, 24 DocType) | Sinh thẳng từ 89 file nguồn, đã cài thật, 58/58 test |
> | **Nghiên cứu** | **Bản 2** (`ALUMDOOR-V2-PHA1-RESEARCH.md`, 18 nguồn/5 lớp) | Bảy sự thật bản 1 chưa có — §0 |
>
> Bản 1 gốc giữ nguyên ở `BRD-ban-1-goc.md` để đối chiếu.
>
> **Toàn bộ nguồn đã trích ra `docs/nguon/`** — 7 file · 41 sheet · 17.214 dòng · 28 ảnh, tra
> được bằng `grep`. Sinh lại bằng `tools/trich-nguon.py`. **Đừng trả lời từ trí nhớ.**
>
> Thứ tự thắng khi mâu thuẫn:
> 1. **Sổ nhật ký kế toán** (`MS LIÊN BS.xlsx` · `chi tiết nhập hàng ngày`) — tiền đã thu, không
>    cãi được. Đã phân xử hai vụ: bản lá `AL71N` và bước lá `AL70`.
> 2. **6 bảng giá chính thức có mộc, 31/07/2026** → `nguon/BANG-GIA-CHINH-THUC-31-07-2026.md`.
>    Thắng về **giá, chiều rộng tối đa, bảo hành, phụ thu**.
> 3. **`25.07.26 DDH - CÔNG THỨC CHIA LÁ.pdf`** — thắng về **bước lá và luật trừ-một-lá**.
> 4. **`QUY CÁCH.xlsx` sheet `CT TT-SX`** — thắng về **quy đổi kích thước**, đủ cả 5 dòng cửa.
> 5. Sheet `GHI CHÚ` của MS Liên — **đã cũ**, chỉ dùng khi 4 nguồn trên không có.
>
> `danh mục sản phẩm.xlsx` chép cột **bề rộng nan** từ bảng giá — đúng với mục đích của nó.
> Chỉ sai nếu đem số đó đi chia lá.

---

## 0. Đổi gì so với bản 1

Bảy điều dưới đây là **nghiên cứu của bản 2 mà bản 1 không có** (kiểm bằng `grep` trên toàn bộ
tài liệu bản 1: không một lần xuất hiện `kerf`, `lưỡi cắt`, `catch weight`, `khoá kỳ`, `TT99`,
`biên bản kiểm kê`, `batch`).

| # | Bổ sung | Vào mục | Rủi ro nếu bỏ qua |
|---|---|---|---|
| 1 | **Kerf 2–4 mm mỗi nhát** | §4.5 `Phieu Cat` | Cây 6 m cắt 5 nhát mất 15 mm — đủ để miếng cuối không vừa |
| 2 | **Đầu thừa có ngưỡng + kho riêng loại khỏi tồn khả dụng** | §4.6 | Bản cũ tự đặt 0,25 m và tự ghi *"con số đó em bịa"* |
| 3 | **Khoá kỳ kế toán** | §4.9 | Sửa lùi ngày kích hoạt tính lại toàn bộ sổ sau đó |
| 4 | **TT99/2025/TT-BTC** — mỗi nhóm hàng một phương pháp giá | §4.9 | TT200 đã hết hiệu lực từ 01/01/2026 |
| 5 | **Kiểm kê sinh biên bản + phân loại nguyên nhân** | §4.7 | Chênh lệch không quy được trách nhiệm |
| 6 | **Catch weight** — cây/lá và kg song song trên cùng dòng sổ | §4.3 | Suy cây từ cân ra 29,7 trong khi thợ đếm 30 |
| 7 | **Tồn khả dụng / giữ chỗ** | §4.8 | Không trả lời được "còn bán được bao nhiêu" |

**Một thay đổi kiến trúc bắt buộc.** Bản 1 khai `Cay Nhom Ton` là DocType riêng — hợp lý khi nền
bị bóc lõi, vì lúc đó không có sổ kho nào. Trên nền đầy đủ đã có `stock_ledger_entries` với cột
`batch_no` chưa ai dùng. Giữ nguyên `Cay Nhom Ton` là **dựng lại quyển sổ thứ hai** mà bản 2 đã
khai tử: *"Hai quyển sổ ghi cùng một sự thật thì lệch là tất yếu, không phải lỗi lập trình."*
⇒ §4.3 đổi thành **lô = batch**.

**Một quyết định KHÔNG kế thừa.** Bản 2 giới hạn phạm vi ở "lõi vật tư, không ôm chuỗi thương
mại" (QĐ-4) — quyết định đó ra đời khi chuỗi thương mại bản cũ đang chạy tốt. Lấy bản 1 làm gốc
thì phạm vi là **toàn chuỗi**: bán → sản xuất → giao → công nợ.

---

## 1. Vấn đề

Xưởng đang chạy **một hệ ERP viết bằng Excel**: 17 sheet, 3.059 dòng nhật ký, 2.115 dòng định
mức, 433 dòng công nợ khách, 111 dòng công nợ NCC, 243 dòng tồn NVL, 125 dòng cửa lỗi.

> Mọi con số trong tài liệu này là **số dòng đã đếm bằng script trên file gốc**, không phải ước
> lượng. Chỗ nào là "số đơn" (gom theo `Số CT`) đều ghi rõ, vì một đơn trải nhiều dòng.

Nghiệp vụ lõi không phải bán hàng thường mà là **sản xuất theo số đo**. Mỗi đơn phải:

1. Nhận số đo **lọt lòng** của ô cửa từ khách
2. Quy ra **phủ bì** theo dòng cửa (mỗi dòng một công thức khác)
3. Chia chiều cao phủ bì ra **số lá nhôm** theo bản lá riêng của từng mã **và từng đời**
4. Nổ ra định mức vật tư, xuất kho, cắt

**Sai một lá là hỏng một bộ nhôm.** Nhôm đã cắt không nối lại được. Bản lá lệch 0,002 m làm
lệch khoảng 2 lá trên cửa cao 3 m.

Bài toán nền, theo bản 2: **một cây nhôm mang bốn con số cùng lúc — kg, khổ, số cây/lá, tiền —
và mọi cách quản lý hiện có chỉ giữ được một hoặc hai.** Hệ quả: sổ kho và sổ kế toán không bao
giờ khớp, không ai trả lời được "còn bán được bao nhiêu", đầu thừa cắt xong biến mất khỏi mọi bảng.

### Nỗi đau xếp hạng

| # | Nỗi đau | Đo được | Nguồn |
|---|---|---|---|
| **1** | Cắt sai số lá → hỏng cả bộ nhôm | **125 dòng** sheet `CỬA LỖI` | Bản lá AL71N từng bị ghi 0,057 ở 2 nguồn, sổ chứng minh 0,055 |
| **2** | Tồn nhôm sổ ≠ thực tế; thợ cắt hỏng không báo | 17 sheet đối chiếu tay | *"Công nhân có thể cắt nhầm, cắt hỏng nhưng không báo lại"* |
| **3** | Không biết đơn nào lỗ | **125 đơn** chưa thu (= 515 dòng chứng từ) | `TỔNG DT THEO NV` chỉ có doanh thu, không có giá vốn |
| **4** | Không có tồn khả dụng — không cơ chế giữ chỗ | 0 bản ghi reservation | Bản 2 §4 |
| **5** | Đầu thừa mất dấu sau khi cắt | 106 dòng khổ < 0,25 m bị đánh phế bằng ngưỡng tự bịa | Bản 2 §4 |
| **6** | Kerf không được tính | 0 nơi nhắc bề rộng lưỡi cắt | Bản 2 §4 |

**Chỗ Excel bó tay (lý do trả tiền):** tra bảng chia lá thủ công · chọn lò xo theo cỡ cửa ·
đối chiếu 17 sheet tồn nhôm với sổ bán · biết đơn nào đang lỗ · đầu thừa dùng lại được bao nhiêu.

## 2. Mục tiêu

| Mục tiêu | Đo bằng |
|---|---|
| Không còn cắt sai số lá do tra nhầm bảng | Số ca `CỬA LỖI` do "cắt sai" về 0 |
| Tồn nhôm trên app khớp kiểm kê thực tế | Chênh lệch kiểm kê ≤ 1 cây/kỳ |
| Biết lãi/lỗ từng đơn ngay khi đóng đơn | 100% đơn có giá vốn |
| Trả lời được "còn bán được bao nhiêu" | Mọi mã có tồn khả dụng = tồn − giữ chỗ |
| Đầu thừa không biến mất | 100% phiếu cắt ghi đầu thừa về kho đầu thừa |
| Bỏ được file Excel | Xưởng ngừng cập nhật `MS LIÊN BS.xlsx` |

**Quy tắc nghiệp vụ bất biến:**

- **Không xóa cứng** bất kỳ chứng từ tài chính, phiếu cắt, phiếu kho nào. Chỉ `deleted_at`.
- **Số lá không được đoán.** Mã chưa có bản lá thì **từ chối tính**, không suy số gần đúng.
- **Bản lá là dữ liệu, không phải code.** Sửa bản lá là sửa bản ghi, không phải deploy.
- **Đơn giá dòng nảy ra khi bán trọn bộ = 0đ và khóa** — tiền đã tính trên dòng cửa chính.
- **Một sự thật một quyển sổ.** Tồn nhôm chỉ ghi ở sổ kho; cấm đẻ bảng tồn song song.
- **Kho không được âm.** Trừ tồn tính **trong giao dịch** và từ chối khi không đủ.

## 3. Actor & vai trò

| Vai trò | Nhiệm vụ | Phạm vi dữ liệu (row-level) | Quyền |
|---|---|---|---|
| **Sale** | Nhận đo, tạo báo giá/đơn hàng | Chỉ đơn mình phụ trách (`nguoi_phu_trach = user`) | Đọc/ghi đơn nháp; **không** sửa đơn đã duyệt |
| **Quản lý bán hàng** | Duyệt đơn, duyệt chiết khấu >15% | Toàn bộ đơn | Duyệt/từ chối, sửa mọi đơn |
| **Kế toán** | Ghi công nợ, thu chi, xuất hóa đơn, khoá kỳ | Toàn bộ chứng từ tài chính | Ghi sổ; **không** sửa số đo kỹ thuật |
| **Thủ kho** | Nhập nhôm, xuất cắt, kiểm kê | Toàn bộ kho | Ghi phiếu nhập/xuất/kiểm kê |
| **Tổ trưởng sản xuất** | Nhận lệnh cắt, báo hoàn thành, báo lỗi | Lệnh sản xuất của tổ mình | Cập nhật tiến độ, báo phế |
| **Giám đốc** | Xem toàn cảnh, duyệt ngoại lệ | Tất cả | Toàn quyền + báo cáo lãi/lỗ |

Sổ có **9 cách gõ tên** cho **5 người thật**:

```
LÊ THẾ ĐÔN (148) + LÊ THỂ ĐÔN (5) + LÊ QUÝ ĐÔN (1)   → 1 người
LÊ THUÝ (140)    + LÊ THÚY (90)                       → 1 người
LƯ CHÍ CƯỜNG (115) + CHÍ CƯỜNG (16)                   → 1 người
THÁI SƠN (125) · E HIỂN (1)                           → 2 người
```

→ **Người phụ trách bắt buộc là Link tới Nhân viên, cấm nhập tay.** Nhập dữ liệu cũ phải gộp 9
chuỗi này về 5 bản ghi, nếu không báo cáo doanh thu theo nhân viên sai ngay từ đầu.

## 4. Thực thể dữ liệu

### 4.0 Bảng mổ nguồn — Sheet → Entity → Rule → Câu hỏi mở

| Sheet nguồn | Entity | Rule rút ra | Câu hỏi còn mở |
|---|---|---|---|
| `TỒN NHÔM` (17 sheet mã nhôm) | **Lô nhôm = batch** (§4.3) | Tồn phải giữ khổ + số lá, không gộp thành 1 số | Chia thật giữa Kho 1/Kho 2 thế nào? |
| `NHẬP` (254 dòng) | 3 chứng từ khác nhau | Gộp cả mua · khách trả · NCC đổi lỗi | — |
| `T2.2026`–`T7.2026` | `Don Hang` + `Dong Don Hang` | 1 số CT = nhiều dòng ⇒ cha–con | `LỆNH XUẤT KHO` khác `PHIẾU XUẤT KHO` chỗ nào? |
| `ĐM` (2.115 dòng) | `Dinh Muc` (BOM) | Cột `[1]` có STT = dòng thành phẩm | 534 dòng trống định mức |
| `GHI CHÚ` | `Quy Cach Cua` | 23 bản lá + hằng số theo dòng cửa **và loại ray** | Đã cũ — chỉ dùng khi 4 nguồn trên không có |
| `CHI TIẾT SƠN` | Bản lá lá phụ (§4.2) | Sơn thuê ngoài có bảng giá riêng | Lò nhà và Hải Kỳ chia việc thế nào? |
| `CỬA LỖI` (125 dòng) | `Cua Loi` | Xử lý cho khách VÀ cho NCC là hai luồng | — |
| `DS BẢO HÀNH` (47 dòng) | `Bao Hanh` | 4 mốc có số lượng riêng | — |
| `LỊCH SẢN XUẤT` | `Lenh San Xuat` + `Dinh Muc Gio` | Úc/Lưới theo **m²**, Đức/ĐL/ST theo **bộ** | Số người mỗi tổ? |
| `THU-CHI` (207 dòng) | `Thu Chi` + `Tai Khoan` | 8 loại giao dịch = 6 TK ngân hàng + mặt + công nợ | — |
| `DANH MỤC` (389 dòng) | `Khach Hang`/`Nha Cung Cap`/`Vat Tu` | Mỗi món có giá nhập, giá bán, ĐVT riêng | — |
| `HOÀNG LAI` | `Dot Giao Hang` | Đơn lớn giao nhiều đợt theo lô | — |

**Dữ liệu bẩn → validation bắt buộc** (đếm trên file gốc, bản 2 §3.4):

| Hiện tượng | Số đo | Validation |
|---|---:|---|
| Mã có khoảng trắng | 121/477 | Chặn ký tự ngoài `A–Z 0–9 - .` |
| Mã có chữ thường | 147/477 | Ép in hoa |
| Mã có dấu tiếng Việt | 26/477 | Chặn |
| ĐVT bán ≠ ĐVT tồn thiếu hệ số | 126 mã | **Từ chối ghi**, không mặc định 1 |
| Đồng nghĩa đơn vị (`M`≡Mét, `CUỐN`≡Cuộn, `TÂM`≡Tấm) | 3 cặp | Gộp, không tạo mã mới |
| 9 cách gõ tên cho 5 người | 9→5 | Link Nhân viên, `ten_khac` giữ cách gõ cũ |

### 4.1 `Quy Cach Cua` — bản lá và công thức chia lá

Bảng quyết định sinh tử. Chép từ `CÔNG THỨC CHIA LÁ.pdf` (19 dòng) + `GHI CHÚ` (23 mã).

| Trường | Kiểu | Khóa/Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `ma` | TEXT | PK | `AL548N`, `AL71C`… |
| `dong_cua` | TEXT | NOT NULL, enum | Đức · Úc · Đài Loan · Lưới · Siêu Trường · Tấm liền Úc |
| `doi` | TEXT | enum `CŨ`/`MỚI` | Quyết định bản lá; chênh tới 10% |
| **`buoc_la_m`** | REAL | NOT NULL, > 0 | **Ước số CHIA** — bước lá khi gài chồng |
| **`be_rong_nan_mm`** | INTEGER | nullable | **Chỉ để nhận diện mã và tra giá** |
| **`rong_toi_da_mm`** | INTEGER | NOT NULL, > 0 | **Chặn bán** cửa rộng hơn. 4.000 → 7.600 |
| `tru_mot_la` | INTEGER | 0/1, mặc định 1 | Lá đầu chiếm chỗ một lá ruột |
| `trong_luong_kg_m2` | REAL | nullable | ±8%. Dùng cho công thức mua vào |
| `nguon` | TEXT | NOT NULL | Ghi rõ ảnh/sheet nào |

> **`buoc_la_m` và `be_rong_nan_mm` là HAI đại lượng, không được gộp.** Bảng giá gọi `AL70` là
> "bản lá 70" (bề rộng nan), nhưng chia lá phải dùng **0,068**. Năm mã có hai số khác nhau:
> `AL70` 70/0,068 · `VIP-ST500` 55/0,053 · `AL501N` 56/0,057 · `AL552` 56/0,057 · `AL75` 66/0,067.
> **Lấy nhầm là lệch tới 2 lá mỗi bộ.**

**Công thức chia lá — kerf KHÔNG tham gia ở đây.** Số lá của một bộ cửa do chiều cao quyết định;
kerf chỉ ăn vào chiều dài cây khi cắt (§4.5).

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

⇒ Bản chất của `−1`: **lá đầu chiếm chỗ đúng một lá ruột.**

**Ngoại lệ: đúng hai mã AL71.**

| Mã | Bản lá | Công thức nguyên văn | Trừ 1? |
|---|---|---|---|
| `AL71N` | **0,055** | `(CPB-130)/0,057` | **KHÔNG** |
| `AL71 (CŨ)` | 0,055 | `(CPB-130)/0,055` | **KHÔNG** |
| `AL70 (2 LỚP)` · `AL70 (1 LỚP)` | 0,068 | `((CPB-130)/0,068)-1` | CÓ |
| 16 mã còn lại | | `((CPB-130)/bản lá)-1` | CÓ |

> ### ⚠ Lỗi phải vá — AL71N đang sai trên bản chạy thật
>
> `AL71N` là dòng duy nhất có cột `BẢN LÁ` (0,055) lệch cột `CÔNG THỨC` (0,057). Sổ nhật ký phân
> xử: `TP LÁ RUỘT AL71N VK — AL71 9 LÁ RUỘT`, cao 0,495 m ⇒ `0,495/9 = 0,055`. **Dùng cột BẢN LÁ.**
>
> Nền đầy đủ đang ghi **0,057 ở hai nơi**, cùng một lý do đã bị bác:
> - `server/apps-src/alumdoor-worker/src/slats.ts:34`
> - `server/briefs/alumdoor-v2.json` khóa `//quyet-dinh-cho-cong-thuc-chia-la` mục 2
>
> Cửa CPB 3 m: `(3−0,13)/0,057 = 50` lá còn `/0,055 = 52` lá — **lệch 2 lá mỗi bộ**, đúng nỗi đau
> #1. Rủi ro **CRITICAL**. Phải sửa **cả hai nơi cùng lượt**, kèm test ghim con số.

**Cửa Úc chia lá theo luật khác hẳn** — nửa lá đếm được, làm tròn về 0 / 0,3 / 0,7 / 1,0:

```
raw = CPB / 0,465 + hệ số     ← CHIỀU CAO PHỦ BÌ
      hệ số: motor trong & kéo tay 2 · motor ngoài 1,5 · motor ngoài tự dừng 1,3
đọc CHỮ SỐ THẬP PHÂN THỨ NHẤT sau khi cắt: 0→0 · 1-3→0,3 · 4-7→0,7 · 8-9→lên 1
```

Phải đọc chữ số thập phân thứ nhất **sau khi cắt bỏ phần còn lại**: `(2m6:0,465)+1,5` giá trị thật
7,0914 nhưng đặc tả ghi 7,0 → ra 7 lá. Đọc theo phần lẻ đầy đủ sẽ ra 7,3 — thừa một phần ba lá
trên mọi cửa có phần lẻ dưới 0,1.

Cửa Úc quy rộng cắt lá: **`RCL = RPBR − 0,03`**.

### 4.2 Cấu tạo bộ cửa và bản lá của từng loại lá

**Một bộ cửa Đức gồm:** `N lá ruột + 1 lá đầu + 1 lá yếm + 1 lá trung gian + 1 lá đáy lớn`.
"Bộ 3 lá đáy" = yếm + trung gian + đáy lớn.

| Loại lá | Dòng cửa | Bản lá (m) |
|---|---|---|
| Lá ruột | theo mã | bản lá của mã (§4.1) |
| **Lá đầu** | mọi mã | **= bản lá của mã** |
| Lá yếm | Đức | **0,02** |
| Lá trung gian | Đức | **0,05** |
| Lá đáy lớn | Đức | **0,09** |
| Lá 75MM | Đài Loan | 0,085 |
| Lá yếm siêu trường | Siêu Trường | 0,5 |

⇒ Bộ 3 lá đáy cửa Đức chiếm **0,16 m** chiều cao, không phải `3 × bản lá mã`.

**Kiểm chứng** — mọi dòng khớp `m² = bản lá × số lá × KT RCL`:

```
AL548         0,055 × 156 × 4,445 = 38,14 ✓      lô 1: 156 lá ruột ÷ 2 bộ = 78 lá/bộ
lá trung gian 0,05  ×   2 × 4,445 =  0,44 ✓
lá đáy lớn    0,09  ×   2 × 4,445 =  0,80 ✓
lá yếm        0,02  ×   2 × 4,445 =  0,18 ✓
```

**Hai đại lượng chiều cao, không được gộp:**

| Đại lượng | Công thức | Dùng để |
|---|---|---|
| **Chiều cao tính tiền** | `tổng số lá × bản lá của MÃ` | Đơn giá m², thành tiền |
| **Chiều cao vật lý / cắt** | `N×bản lá mã + 0,16` (Đức) | Lệnh cắt, m² tiền sơn |

Sổ ghi `AL70 23 lá ruột + bộ 3 lá đáy` cao `1,768 = 26 × 0,068` — đó là **quy ước tính tiền**,
không phải số đo thật (`23×0,068 + 0,16 = 1,724`, lệch 44 mm). Giữ quy ước để tiền không đổi;
lệnh cắt dùng số đo thật.

### 4.3 `Lo Nhom` — lô nhôm LÀ batch của sổ kho

> **Đây là chỗ đổi lớn nhất so với bản 1.** Bản 1 khai `Cay Nhom Ton` thành DocType riêng vì nền
> bóc lõi không có sổ kho. Nền đầy đủ có `stock_ledger_entries` với cột `batch_no` chưa ai dùng.
> Giữ DocType riêng = hai quyển sổ ghi cùng một sự thật, và lệch là tất yếu.

**Chốt:** mỗi lô nhôm = **một batch** trên chính sổ kho. Màu, khổ, tình trạng, kho là thuộc tính
của batch. **Không có DocType tồn song song.**

| Thuộc tính batch | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `batch_no` | TEXT | PK, cấp qua counter lõi | Mã lô |
| `ma_nhom` | TEXT | FK → `Quy Cach Cua` | AL75, AL548… |
| `mau` | TEXT | NOT NULL | Màu sơn |
| `tinh_trang` | TEXT | enum `CŨ`/`MỚI`, NOT NULL | **Quyết định bản lá khi cắt lô này** |
| `kho_m` | REAL | > 0 | Khổ cây (m) — thay đổi từng lô, đo thật **6,57 → 8,61 m** |
| `kho` | TEXT | FK → `Kho`, NOT NULL | Kho 1 / Kho 2 |
| `ngay_kiem` | TEXT | ISO date | Lần kiểm kê gần nhất |

**Catch weight — hai đơn vị ngang hàng trên cùng dòng sổ:**

| | Đơn vị | Nguồn sự thật | Dùng cho |
|---|---|---|---|
| Số lượng | **Cây / Lá** | thủ kho **ĐẾM** | tồn kho, trích cắt, tồn khả dụng |
| Khối lượng | **Kg thực cân** | hoá đơn NCC | giá vốn, công nợ, báo cáo kế toán |

Lý do: suy số cây từ cân ra `29,7` trong khi thợ đếm `30` — lệch ngay từ lúc nhập rồi lệch mãi.
Yêu cầu "sổ kế toán đọc ra kg" vẫn đủ vì kg nằm trên **mọi** bút toán.

> **`UOM Conversion` (hệ số tĩnh trên Item) KHÔNG dùng cho nhôm** — vì `1 cây = khổ × kg/m` mà
> khổ đổi từng lô. Tỉ lệ bắt tại **dòng phiếu nhập**, không khai ở Item. `UOM Conversion` vẫn
> dùng bình thường cho ray/trục/phụ kiện (1 Cây = 5,85 Mét).

**Giá vốn đích danh không cần thêm phương pháp:** khi định giá xuất, thu hẹp lịch sử replay về
**đúng batch đó**. Một lô chỉ nhập một lần ⇒ hàng đợi FIFO của nó có đúng một lớp ⇒ chính là đích
danh. Đạt bằng cách sửa *phạm vi truy vấn*. Tiền lệ: [ERPNext PR #29804](https://github.com/frappe/erpnext/pull/29804)
— *"batch numbers were NOT considered while consuming material"*.

Đời CŨ/MỚI gắn trên **từng lô**, không tách thành hai mã hàng. Lên đơn chọn lô nào thì lấy bản lá
theo `tinh_trang` của lô đó.

### 4.4 `Chinh Sach Cat` — quy đổi kích thước và cơ sở tính tiền

**Nguồn: `QUY CÁCH.xlsx` sheet `CT TT-SX`.** Nguyên tắc chung cả 5 dòng cửa:
*"Tất cả chiều rộng đều quy về rộng cắt lá."*

#### Công thức SẢN XUẤT — ra `RCL`

| Dòng cửa | `RCL` |
|---|---|
| **Đức** | `RPBR − 0,08` **hoặc** `RPBN − 0,02` (tương đương vì `RPBN = RPBR − 0,06`) |
| **Úc** | `RPBR − 0,03` |
| **Lưới · Đài Loan · Siêu Trường** | `RPBR − 0,03`; **có bắn bướm ⇒ `RPBR − 0,035`** |

#### Công thức BÁN RA — phụ thuộc ĐẠI LÝ hay KHÁCH LẺ

| Dòng cửa | ĐẠI LÝ | KHÁCH LẺ |
|---|---|---|
| **Đức** | `CPB × RPBN` | `CPB × RPBR` |
| **Úc** | `CPB × RPBR` | `CPB × RPBR` |
| **Lưới** | tách món: `CPB × RCL`; trọn bộ: `CPB × RPBR` | `CPB × RPBR` |
| **Đài Loan** | tách món: `CPB × RCL`; trọn bộ/kéo tay: `CPB × RPBR` | `CPB × RPBR` |
| **Siêu Trường** | `CPB × RCL` | `CPB × RPBR` |

> **Khách lẻ luôn tính trên `RPBR`** ở cả 5 dòng — rộng nhất, đắt nhất.

#### Công thức MUA VÀO

| Dòng cửa | Công thức |
|---|---|
| **Đức** | `số kg × đơn giá` |
| **Úc · Lưới · Đài Loan · Siêu Trường** | `số kg barem/m² × (Cao pb × Rộng cắt lá) × đơn giá` |

Kiểm chứng kg barem: `kg = khổ(m) × trọng lượng(kg/m) × số cây` → `7,2 × 0,389 × 200 = 560,16` ✓

#### Chuỗi quy đổi từ số đo khách

| | U75 | U100 |
|---|---|---|
| Đức | `RPBR = RLL + 0,15` → `RPBN = RPBR − 0,06` | `RPBR = RLL + 0,20` → `RPBN = RPBR − 0,07` |
| Úc | `RPBR = RLL + 0,14` | `RPBR = RLL + 0,20` |
| Đài Loan · Lưới | `RCL = RLL + 0,11` → `RPBR = RCL + 0,03` | `RPBR = RLL + 0,20` → `RCL = RPBR − 0,03` |

> **Bẫy chết người — luôn đi qua `RPBR`, cấm đường tắt.** Công thức rút gọn (`RPBN = RLL + 90`,
> `RCL = RLL + 110`) **chỉ đúng với ray U75**. Đổi sang U100 thì cùng `RLL` cho ra `RPBN` lệch
> **40mm** và `RCL` lệch **60mm**. Cửa Đức tính tiền bằng `CPB × RPBN` nên nhầm chỗ này là vừa sai
> tiền vừa sai chiều rộng cắt lá.
>
> ⇒ `loai_ray` (U75/U100) là **tham số bắt buộc** của mọi phép quy đổi. Engine luôn tính
> `RLL → RPBR → (RPBN | RCL)`, không bao giờ nhảy thẳng.

Chung mọi dòng: **`CPB = CLL + 500mm`**. Đài Loan còn có `CPB = số lá × 0,077`.

Bốn khái niệm chiều rộng, **phải là 4 trường riêng**:

```
RLL   rộng lọt lòng      ← khách đo, đầu vào duy nhất
RPBR  rộng phủ bì ray    ← trạm trung chuyển bắt buộc, phụ thuộc LOẠI RAY
RPBN  rộng phủ bì nhựa   ← cửa Đức tính tiền theo cái này
RCL   rộng cắt lá        ← xưởng cắt theo cái này
```

Trường bắt buộc: `dong_cua` · `loai_ray` · `co_so_dai_ly` · `co_so_khach_le` · `cpb_offset_mm`
(=500) · `rcl_ban_buom_mm` (−35) · các hằng cộng/trừ. Lưu **hằng số**, không lưu công thức dạng
chữ — để sửa được mà không deploy.

### 4.5 `Phieu Cat` — cắt, kerf và đầu thừa

**Kerf (bề rộng lưỡi cắt) — bổ sung từ bản 2.** Mỗi nhát cắt ăn mất 2–4 mm vật liệu. Cây 6.000 mm
cắt 5 nhát mất 15 mm — *"đủ để quyết định miếng cuối có vừa hay không"*. Công thức 1D thuần bỏ qua
kerf là sai thực tế.

```
chieu_dai_dung  = so_la × RCL + so_la × kerf_mm/1000
dau_thua_m      = kho_m − chieu_dai_dung
```

| Trường | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `lenh_san_xuat` | TEXT | FK, NOT NULL | Lệnh cắt |
| `batch_no` | TEXT | FK → lô nhôm | Cắt từ lô nào |
| `so_la` | INTEGER | > 0 | Số lá cắt ra |
| `rcl_mm` | INTEGER | > 0 | Rộng cắt lá |
| `kerf_mm` | REAL | NOT NULL, mặc định **3** | **Giả định A1** — khai ở `Chinh Sach Cat` |
| `dau_thua_m` | REAL | ≥ 0, tính | Khổ còn lại sau cắt |
| `so_la_hoan` | INTEGER | ≥ 0 | Lá thừa trả về |
| `phe_lieu` | INTEGER | 0/1 | Đầu thừa dưới ngưỡng ⇒ phế |

**Chọn lô để cắt:** First Fit Decreasing — chọn **lô có khổ nhỏ nhất còn đủ**, ưu tiên đầu thừa
trước cây nguyên. Đủ tốt và dễ giải thích cho thợ.

### 4.6 `Dau Thua` — kho riêng, loại khỏi tồn khả dụng

Bản cũ tự đặt ngưỡng 0,25 m và tự ghi *"con số đó em bịa"*. Chuẩn ngành: định nghĩa ngưỡng đầu
thừa dùng lại tối thiểu; nhỏ hơn cho thẳng vào phế; đo rồi nhập chiều dài đầu thừa vào hệ thống
để phần mềm **ưu tiên dùng TRƯỚC**.

- Đầu thừa chuyển sang **kho `Đầu thừa`**, kho này **loại khỏi tồn khả dụng** để lập kế hoạch chỉ
  nhìn kho chính.
- `scrap_threshold_m` — **để trống, CHẶN cắt** tới khi xưởng điền (**Giả định A2**).
- Đầu thừa giữ nguyên `batch_no` gốc ⇒ giá vốn không đổi khi tái sử dụng.

### 4.7 `Kiem Ke` — biên bản và nguyên nhân chênh lệch

Kiểm kê định kỳ + **biên bản kiểm kê** làm căn cứ quy trách nhiệm bảo quản. App phải **sinh được
biên bản**, không chỉ đối chiếu số.

Chênh lệch phải **phân loại nguyên nhân rồi mới hạch toán** — `nguyen_nhan` là field bắt buộc có
danh mục, không phải ghi chú tự do:

| Nhóm nguyên nhân | Ví dụ |
|---|---|
| Sai cân đo | Cân lệch, đếm sót |
| Quên ghi chứng từ | Xuất không lập phiếu |
| Mất mát / hao hụt | Hỏng trong bảo quản |
| Gian lận | Chuyển điều tra |

Trường: `ky_kiem_ke` · `kho` · `batch_no` · `so_luong_so` · `so_luong_thuc` · `chenh_lech` (tính)
· `nhom_nguyen_nhan` · `nguyen_nhan` · `nguoi_kiem` · `nguoi_duyet` · `so_bien_ban`.

### 4.8 `Giu Cho` — tồn khả dụng

```
ton_kha_dung = ton_thuc_te − giu_cho
```

**Mốc giữ chỗ: phát lệnh sản xuất** (**Giả định A3**) — sheet `T6` của xưởng ghi sẵn *"kế toán bấm
chọn lệnh sản xuất"*, tức mốc này có thật trong quy trình. Giữ sớm quá thì khoá hàng oan; muộn quá
thì hứa trùng.

Giữ chỗ theo bộ khoá `(ma_nhom · mau · tinh_trang · kho_toi_thieu_m)` — không giữ đích danh một lô,
vì lô nào cũng được miễn đủ khổ.

### 4.9 Khoá kỳ và phương pháp tính giá

**Khoá kỳ — phải có từ thiết kế, không vá sau.** Giá trị mỗi bút toán kho phụ thuộc mọi bút toán
trước nó; chèn/huỷ/sửa lùi ngày kích hoạt tính lại toàn bộ sổ sau đó, *"chậm và tốn tài nguyên"*.

- `Ky Ke Toan`: `tu_ngay` · `den_ngay` · `trang_thai` (Mở/Khoá) · `nguoi_khoa` · `ngay_khoa`
- Ghi vào kỳ đã khoá ⇒ **từ chối**, đề nghị lập bút toán điều chỉnh ở kỳ mở.

**Phương pháp tính giá — theo Thông tư 99/2025/TT-BTC**, hiệu lực 01/01/2026, đã thay
TT200/2014/TT-BTC. TT99 giữ ba phương pháp *đích danh · bình quân gia quyền · nhập trước xuất
trước*, và vẫn cho **áp phương pháp khác nhau cho từng loại vật tư**:

| Nhóm hàng | Phương pháp | Vì sao |
|---|---|---|
| **Nhôm cây/lá** | **Đích danh theo lô** | Mỗi lô khổ/màu riêng, không thay thế cho nhau |
| Ray, trục, phụ kiện | Bình quân gia quyền | Thay thế được cho nhau |

TT99 siết thêm: phải **nhất quán giữa các kỳ** trừ khi đổi chính sách kế toán ⇒ đổi
`valuation_method` giữa chừng **phải ghi audit**.

> **Lỗi phải vá cùng lượt:** `normalizeValuationMethod` (`clouderp-stock/src/valuation.ts:18`) —
> giá trị nào không chứa chữ `"moving"` đều **âm thầm thành FIFO**. Gõ sai tên phương pháp không
> báo lỗi.

### 4.10 `Don Hang` / `Dong Don Hang`

`Don Hang`: `so_ct` (tự sinh, khóa duy nhất) · `ngay_dat` · `ngay_giao_du_kien` · `khach_hang`
(FK) · `nguoi_phu_trach` (FK Nhân viên) · `loai_khach` (Đại lý/Khách lẻ) · `hinh_thuc_thanh_toan`
· `trang_thai` (§5.2) · `ghi_chu` · `deleted_at`

`Dong Don Hang`: `ma_hang` (FK) · `cach_ban` (Trọn bộ/Tách món/Tặng ray) · `cll_mm` · `rll_mm` ·
`loai_ray` · `cpb_mm` (tính) · `rpbr_mm` · `rpbn_mm` · `rcl_mm` (tính) · `so_bo` ·
`dien_tich_m2` (tính) · `so_la_ruot` (tính) · `so_la_nhom` (tính) · `don_gia` · `khoa_don_gia`
(0/1) · `chiet_khau_pct` · `thanh_tien`

### 4.11 `Bang Gia` — năm cấu trúc giá khác nhau

**Nguồn: 6 bảng giá chính thức có mộc, hiệu lực 31/07/2026.** **Mỗi dòng cửa một cấu trúc giá riêng:**

| Dòng cửa | Giá tra theo | Ghi chú |
|---|---|---|
| **Đức** | **MÃ** (15 mã), hai cột `chỉ lá` / `tặng ray` | `tặng ray` chỉ áp khi **S ≥ 8m²** |
| **Úc** | **độ dày** × (`kéo tay` \| `motor ngoài`) | **Kéo tay ĐẮT hơn motor ngoài** |
| **Đài Loan tách món** | **độ dày** (mạ màu 4 mức · STĐ 3 mức) | |
| **Đài Loan trọn bộ** | **bậc diện tích** 8 × 7 cột độ dày | Bảng duy nhất dùng bậc |
| **Lưới** | (dòng lưới × chất liệu) × (`chưa PK` \| `có PK`) | 12 giá |
| **Siêu Trường** | **độ dày** (bản 100), 7 mức 1.0 → 1.6 LY | |

**Bậc diện tích Đài Loan trọn bộ — cận trên ĐÓNG, cận dưới MỞ:**

```
Trên 10m²   S > 10          4m² - 5m²   4 < S ≤ 5     ⇒ cửa đúng 5,0m² ăn bậc này
9m² - 10m²  9 < S ≤ 10      3m² - 4m²   3 < S ≤ 4
```

`S < 4` dùng **giá trọn gói theo bộ**: 4 DEM 1.800.000 · 4.6 DEM 2.000.000 · 5.2 DEM 2.200.000.

**Bảy khoản cộng/trừ ngoài giá gốc:**

```
+ 300.000đ/bộ      S < 7m²                          (mọi dòng)
+  40.000đ/m²      6m < ngang cửa < 7m5
+  60.000đ/m²      7m5 < ngang cửa < 9m
+  20.000đ/m²      cửa cuốn lò xo kéo tay           (Đài Loan)
+ 360.000đ/m²      sơn màu vân gỗ                    (Đức)
+ 300.000đ/bộ      vận chuyển khi S < 8m²            (Đức)
−  70.000đ/m²      hàng thô không sơn                (Lưới)
```

- **Chiết khấu 15% trực tiếp trên giá chỉ lá** (Đức) — sale tự duyệt tới 15%, trên 15% cần GĐ
- **VAT 8%** cộng sau cùng trên mọi đơn giá
- **Motor và UPS tra theo diện tích** — 15 loại motor ngưỡng `<15m²` → `<55m²`; UPS theo tải motor
- **Chiều rộng tối đa từng mã** — nhập rộng hơn ⇒ **chặn, không cho lưu đơn**
- **SLA giao hàng 3–7 ngày**, trừ Lễ và Chủ nhật

### 4.12 Các thực thể còn lại

| Thực thể | Nguồn | Ghi chú |
|---|---|---|
| `Khach Hang` / `Nha Cung Cap` | `DANH MỤC` 389 dòng | Gộp trùng tên khi nhập |
| `Nhan Vien` | 9 giá trị → **5 người thật** | Cách gõ cũ lưu ở `ten_khac` |
| `Vat Tu` | `DANH MỤC` + `Trang tính29` | **524** mã vật tư trong `ĐM` |
| `Dinh Muc` (BOM) | `ĐM` 2.115 dòng | Dùng được: 363 thành phẩm · 1.572 dòng NVL, **534 dòng trống = chọn lúc lên đơn** |
| `Lenh San Xuat` | 5 sheet tháng ~5.000 dòng | Đã có sẵn cột `LỆNH SX` · `LỆNH XUẤT KHO` · `PHIẾU XUẤT KHO` |
| `Bao Hanh` | `DS BẢO HÀNH` 47 dòng | **Quy trình riêng 4 chặng** — §4.13 |
| `Dinh Muc Gio` | `LỊCH SẢN XUẤT` | §4.14 |
| `Kho` | cột `KHO (1-2)` | **Hai kho** + kho `Đầu thừa` (§4.6) |
| `Dot Giao Hang` | `HOÀNG LAI` | `dot` · `lo` · `so_luong` · `da_xuat` · `ngay_giao` |
| `Cong No KH` / `Cong No NCC` | 433 + 111 dòng | |
| `Thu Chi` + `Tai Khoan` | `THU-CHI` 207 · `TTTT` | 6 TK ngân hàng + tiền mặt + công nợ |
| `Cua Loi` | `CỬA LỖI` 125 dòng | **DocType riêng** — §4.15 |

### 4.13 `Bao Hanh` — quy trình 4 chặng

Hàng bảo hành là **phụ kiện mua của NCC** (bình lưu điện, motor), không phải cửa xưởng làm.

```
NGÀY NHẬP LỖI ──> NGÀY XUẤT ĐỔI ──> NGÀY GỬI BẢO HÀNH ──> NGÀY TRẢ BẢO HÀNH
   (khách báo)      (đổi ngay          (gửi cái hỏng        (NCC trả về)
                     cho khách)          cho NCC)
```

Mỗi chặng có **ngày + số lượng riêng** — số lượng có thể lệch giữa các chặng. Xưởng ứng hàng cho
khách trước, đòi NCC sau ⇒ **hàng nằm ở NCC là một loại tồn**.

| Nhóm | Thời hạn |
|---|---|
| Motor Tanker · Alumax · YHLD | 12 tháng **đổi mới** tại xưởng |
| Motor JG | **3 tháng đổi mới + 9 tháng sửa chữa** |
| Cửa | Mất BH nếu: vận chuyển móp · sơn trầy · lắp sai · trượt hành trình xổ lô |
| Motor/UPS | Mất BH nếu: rách tem · cháy nổ · chập điện · nhiễm nước |

### 4.14 `Dinh Muc Gio` — năng lực sản xuất

**Ba kiểu định mức khác nhau**, không quy về một được:

| Bộ phận | Định mức | Kiểu |
|---|---|---|
| Úc | 1h45' / 12m² | theo **diện tích** |
| Lưới | 4h / 9m² | theo **diện tích** |
| Đài Loan · Siêu Trường | 30' / bộ | theo **bộ** |
| **Đức** | cắt dập 40' · hoàn thiện 40' · lấy nhôm 20' | theo **công đoạn** (100') |
| **Lò sơn** | 1 màu (345 lá × 11,5m) / 3 tiếng 1 mẻ | theo **MẺ** — nút thắt |

> **Lò sơn là ràng buộc gom nhóm.** Mỗi mẻ 3 tiếng chỉ chạy **một màu**. Xếp lịch phải gom đơn
> cùng màu vào một mẻ, nếu không thì mỗi đơn một mẻ và xưởng chết tắc.

### 4.15 `Cua Loi` — danh mục nguyên nhân

| Nhóm | Nguyên nhân | Ai chịu |
|---|---|---|
| Sản xuất | Cắt sai số lá · Cắt sai kích thước · Sơn lỗi · Lắp sai phụ kiện | Xưởng |
| Vật tư | Nhôm lỗi từ NCC · Phụ kiện lỗi · Sơn không đạt màu | Nhà cung cấp |
| Bán hàng | Nhận đo sai · Nhập nhầm quy cách | Sale |
| Khách | Khách đổi ý sau khi đã cắt · Khách đo sai ô chờ | Khách hàng |

Trường bắt buộc: `nhom_nguyen_nhan` · `nguyen_nhan` · `ben_chiu_trach_nhiem` · `chi_phi_uoc_tinh`.
Có `bên chịu` mới trả lời được *"tháng này mất bao nhiêu tiền vì cắt sai"* — nỗi đau #1.

## 5. Luồng nghiệp vụ

### 5.1 Bán hàng → sản xuất → giao

```
Sale nhận đo (CLL × RLL) + chọn LOẠI RAY
  → app quy ra CPB/RPBR/RPBN/RCL theo dòng cửa
  → app chia lá theo bản lá của ĐỜI lô nhôm sẽ cắt
  → app hiện TỒN KHẢ DỤNG theo khổ ngay tại màn nhập
  → chọn cách bán → nảy dòng phụ kiện (đơn giá 0đ, khóa)
  → chiết khấu ≤15% tự duyệt, >15% chờ Giám đốc
→ Duyệt đơn → sinh Lệnh sản xuất → GIỮ CHỖ tồn
  → Thủ kho chọn lô cụ thể (ưu tiên đầu thừa đủ khổ) → Phiếu cắt (có kerf)
  → trừ tồn theo batch TRONG giao dịch, từ chối khi không đủ
  → đầu thừa ≥ ngưỡng → kho Đầu thừa; < ngưỡng → phế
  → Tổ trưởng báo hoàn thành / báo phế
→ Giao hàng (có thể nhiều đợt) → Kế toán ghi công nợ → Thu tiền
```

**Ngoại lệ bắt buộc xử lý:**

| Tình huống | Xử lý |
|---|---|
| Mã chưa có bản lá | **Chặn**, không cho tạo lệnh cắt: *"Chưa có công thức chia lá cho `<mã>`"* |
| Chưa điền `scrap_threshold_m` | **Chặn cắt** — không tự bịa ngưỡng |
| Không đủ lô đúng đời | Cảnh báo, cho chọn đời khác **nhưng phải xác nhận** vì bản lá đổi → số lá đổi |
| Tồn không đủ lúc xuất | **Từ chối trong giao dịch**, không cho kho âm |
| Thợ báo cắt hỏng | Ghi `Cua Loi` + trừ tồn phần hỏng, **không** im lặng |
| Sửa đơn đã có lệnh cắt | Chặn; phải hủy lệnh cắt trước (giải phóng giữ chỗ) |
| Ghi vào kỳ đã khoá | Từ chối, đề nghị bút toán điều chỉnh ở kỳ mở |

### 5.2 Máy trạng thái đơn hàng

```
Nháp → Chờ duyệt → Đã duyệt → Đang sản xuất → Chờ giao → Đã giao → Đã thu tiền
                       ↓                ↓
                    Từ chối          Hủy (ghi lý do, giải phóng giữ chỗ)
```

Sheet hiện có trường `Tình trạng đơn hàng` nhưng **chỉ 1/3.059 dòng có dữ liệu** — xưởng cần nó mà
Excel không tiện dùng. Đây là chỗ app thắng rõ.

## 6. Ma trận quyền

| Endpoint | Method | Vai trò | Row-level ở server |
|---|---|---|---|
| `frappe.client.get_list?doctype=Don Hang` | GET | Sale | `WHERE nguoi_phu_trach = session.user AND deleted_at IS NULL` |
| " | GET | QLBH, Kế toán, GĐ | không lọc |
| `/api/v1/commands` action=`save` doctype=`Don Hang` | POST | Sale | chặn nếu `trang_thai != 'Nháp'` |
| " action=`submit` | POST | QLBH, GĐ | Sale **403** |
| `alumdoor.don_hang.duyet_chiet_khau` | POST | GĐ | chỉ khi `chiet_khau_pct > 15` |
| `alumdoor.san_xuat.tao_phieu_cat` | POST | Thủ kho | chặn nếu đơn chưa duyệt |
| `alumdoor.kho.giu_cho` | POST | Thủ kho, QLBH | theo lệnh sản xuất |
| `alumdoor.kho.kiem_ke` | POST | Thủ kho, GĐ | |
| `alumdoor.ke_toan.khoa_ky` | POST | **Kế toán, GĐ** | Thủ kho/Sale **403** |
| doctype=`Quy Cach Cua` action=`save` | POST | **chỉ GĐ** | Sửa bản lá = đổi cách cắt toàn xưởng |
| doctype=`Bang Gia` action=`save` | POST | **chỉ GĐ** | |
| `alumdoor.bao_cao.lai_lo` | GET | GĐ | Sale/Kế toán **403** |

Chặn ở **server**, không chỉ ẩn nút. Bằng chứng PHA 6 bản 1 đã xác nhận cách làm: **bỏ vai trò ra
khỏi `permissions` là không thấy gì cả**, chặt hơn mọi cách ẩn nút. Test bắt buộc: đăng nhập Sale
→ gọi thẳng API submit → phải nhận 403.

## 7. Màn hình

| Màn | Desktop | Mobile |
|---|---|---|
| **Tạo đơn** ★ | 3 cột: danh sách đơn co lại · form đơn · cột phải hiện **số lá tính ra + lô nhôm khả dụng** | Form full-screen: khách → số đo → cách bán → xem lá → lưu |
| **Tồn nhôm theo khổ** ★ | Khả dụng cộng dồn theo khổ: `khổ ≥ 4,5 m: 12 lá khả dụng (tổng 18, giữ chỗ 6)` | Card + quét mã |
| Danh sách đơn | Bảng: checkbox · STT · số CT · khách · ngày giao · trạng thái · tiền | Card list |
| Đề xuất cắt | Chọn lô khổ nhỏ nhất còn đủ, có kerf, sinh đầu thừa | Xem |
| Lệnh sản xuất | Kanban theo công đoạn (cắt → sơn → lắp → giao) | Kanban dọc |
| Kiểm kê | Nhập số thực, chênh lệch, nguyên nhân → in biên bản | Nhập tại kho |
| Công nợ | Bảng KH/NCC + tuổi nợ | Card |
| Báo cáo | Doanh thu theo NV · lãi/lỗ theo đơn · cửa lỗi theo nguyên nhân · đầu thừa dùng lại | Chỉ xem |

**Hai màn chính, do hai nỗi đau #1 chỉ định:**
- **Tạo đơn** phải hiện **số lá và lô nhôm sẽ cắt ngay lúc nhập số đo** — lý do app tồn tại.
- **Tồn nhôm theo khổ** là chỗ duy nhất trả lời được cả *"bán được bao nhiêu"* lẫn *"cắt từ lô nào"*.

## 8. Ngoài phạm vi bản này

- Luật tự chọn lò xo theo cỡ cửa — **thợ tự chọn 1 trong 8 quy cách** (chốt với chủ dự án)
- Tối ưu cắt đa cây (1D-CSP heuristic) — bản này chỉ chọn lô đơn giản theo First Fit Decreasing
- Kết nối máy cắt CNC
- Hóa đơn điện tử
- HR / chấm công / tính lương — bản 2 có tài liệu riêng, ghép sau
- App mobile cho thợ ngoài công trường

## 9. Ràng buộc đã chốt

- **Đơn giá dòng nảy ra khi bán trọn bộ = 0đ, khóa không cho sửa.** Tiền tính một lần trên dòng
  cửa chính.
- Chiết khấu **≤15% Sale tự duyệt, >15% cần Giám đốc**.
- Ray tặng chỉ áp cho cửa **từ 8m² trở lên**. Phụ thu **300.000đ** cho cửa **<7m²**.
- `CPB = CLL + 500mm` mọi dòng cửa.
- Đời CŨ/MỚI gắn trên **lô nhôm**, không tách mã hàng.
- Người phụ trách là **Link tới Nhân viên**, cấm nhập tay.
- **Cửa Lưới trọn bộ**: nhân đơn giá vào **tổng diện tích**, một lần.
- **Bộ 3 lá đáy** = yếm + trung gian + đáy lớn.
- **`AL70` không trừ 1 lá** khi đọc ở mốc *số lá nhôm* (42). Ở mốc *lá ruột* là 41.
- **`AL71N` bản lá 0,055** — theo cột BẢN LÁ, sổ kế toán phân xử. **Code đang sai, phải vá.**
- **Giá tiền mặt = giá công nợ.** Ba hình thức: trả ngay · **đặt cọc** · trả sau.
  Có cọc là cho sản xuất, **không đặt mức tối thiểu**.
- **Số chứng từ** một dạng thống nhất, cấp nguyên tử qua counter lõi. Dữ liệu cũ giữ số gốc ở
  `so_ct_goc`.
- **Nhôm tính giá đích danh theo lô; phụ kiện bình quân gia quyền** (TT99/2025).

### 9.1 Ba giả định phải xác nhận với xưởng

| Mã | Giả định | Mặc định | Rủi ro nếu sai |
|---|---|---|---|
| **A1** | Kerf mỗi nhát cắt | **3 mm** (chuẩn ngành 2–4 mm) | Lệch ~15 mm trên cây cắt 5 nhát |
| **A2** | Ngưỡng đầu thừa bỏ hẳn | **Để trống, CHẶN cắt** tới khi xưởng điền | Vứt nhôm còn dùng được, hoặc giữ rác |
| **A3** | Mốc giữ chỗ tồn | **Phát lệnh sản xuất** | Giữ sớm khoá hàng oan; muộn thì hứa trùng |

A1 và A3 chạy được ngay bằng mặc định. **A2 cố ý chặn** — bản cũ đã trả giá vì tự bịa 0,25 m.

### 9.2 Hai câu hỏi cần xưởng trả lời

| # | Câu hỏi | Chặn cái gì |
|---|---|---|
| 1 | Mã màu `4004` có phải ĐỎ ĐÔ không? | Mã màu cuối chưa gỡ |
| 2 | Số người mỗi tổ (Đức/Úc/Lưới/Đài Loan/Siêu Trường)? | Không tính được tăng ca |

Hai câu này **không chặn PHA 3** — chúng chỉ chặn phần lập lịch/tăng ca và một mã màu.

## 10. Rà 16 nghiệp vụ bổ trợ bắt buộc

| # | Nghiệp vụ | Áp dụng | Ở đâu |
|---|---|---|---|
| 1 | Phân quyền & row-level | ✅ | §6 — 6 vai trò, chặn server |
| 2 | Soft-delete & bất biến tài chính | ✅ | §2 — `deleted_at`, cấm xóa cứng chứng từ |
| 3 | Audit log | ✅ | Lõi Forge `versions`; đổi `valuation_method` bắt buộc audit (§4.9) |
| 4 | Báo cáo & thống kê | ✅ | §7 — lãi/lỗ theo đơn, cửa lỗi theo nguyên nhân, đầu thừa |
| 5 | Thông báo & ca làm việc | ⚠ Một phần | Nhắc SLA 3–7 ngày; chấm công **ngoài phạm vi** (§8) |
| 6 | Mã vạch / quét mã | ✅ | Quét lô nhôm ở nhập/xuất/kiểm kê |
| 7 | Kanban/Pipeline | ✅ | §7 — Lệnh sản xuất theo công đoạn |
| 8 | Tích hợp AI | ⚠ Chưa chốt | Ứng viên: hỏi đáp tồn kho theo quyền người hỏi |
| 9 | Layout 3 cột | ✅ | §7 — màn Tạo đơn |
| 10 | Ảnh · chữ ký · QR | ⚠ Một phần | Ảnh cửa lỗi (bằng chứng quy trách nhiệm); chữ ký biên bản kiểm kê |
| 11 | In ấn | ✅ | Biên bản kiểm kê, phiếu cắt, phiếu giao |
| 12 | Nhắc đa kênh / Zalo | ⚠ Chưa chốt | Nhắc nợ theo tuổi nợ |
| 13 | Mã sinh tự động | ✅ | §9 — counter nguyên tử; `batch_no` |
| 14 | Calendar view | ✅ | Lịch sản xuất + mẻ lò sơn (§4.14) |
| 15 | Tiện VN | ✅ | SĐT bấm gọi, tìm không dấu, xuất toàn bộ dữ liệu |
| 16 | Smart defaults | ✅ | Chọn khách → loại khách → cơ sở tính tiền (§4.4) |

Bốn mục ⚠ chốt ở PHA 3, không chặn Cổng 2.

## 11. Bẫy kỹ thuật đã trả giá — bắt buộc mang vào PHA 3

Từ `PHA-6-BANG-CHUNG.md` của bản 1 và ghi chú brief bản 2:

1. **Khai sai một tên DocType/field là rơi về controller chung** — ghi vẫn thành công nhưng
   **không có bút toán nào**: kho không trừ, công nợ không lên, và **không có gì báo lỗi**.
2. **Worker Alumdoor không tự trừ kho, không tự lên công nợ.** Nền tảng làm việc đó
   (`clouderp-selling` + `clouderp-stock` + `ledger`). Không được "kiểm rồi ghi" ngoài giao dịch —
   hai người xuất cùng lúc sẽ cùng qua cửa kiểm rồi cùng ghi, và kho âm.
3. **DocType thiếu `naming` thì cài được nhưng không tạo nổi bản ghi mới** — 15/24 DocType bản 1
   từng dính. Xanh ở `--dry-run`, chỉ lộ khi cài thật.
4. **Trường khai `!~` (bắt buộc + chỉ đọc, không mặc định) là form không có đường nào nộp.** Bất
   biến "không đổi sau khi tạo" phải do validator giữ, không phải cờ chỉ-đọc.
5. **Môi trường cục bộ không verify được app method và validator** — `tenant-worker` không có
   `dispatch_namespaces`. Cổng CRITICAL chỉ xanh được trên môi trường có Workers for Platforms.
   **Không sửa script cho xanh.**
6. **Một lượt đọc master = app → gateway → tenant → về, đo thật 2.800 ms.**
   `VALIDATOR_TIMEOUT_MS` = 5.000 ms, **không hạ về 2.000 ms** — gộp lời gọi ở phía app.
