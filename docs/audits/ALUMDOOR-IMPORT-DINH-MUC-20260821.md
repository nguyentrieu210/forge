# ALUMDOOR — NHẬP ĐỊNH MỨC (BOM) THẬT CỦA XƯỞNG VÀO DATABASE

Ngày: 21/08/2026 · Nguyên văn chủ xưởng: *"Import dữ liệu BOM vào database"*
Nguồn: `nhap/du-lieu/DM-BOM.csv` (**2.061 dòng**, trích sheet `ĐM` của `MS LIÊN BS.xlsx`)
và `nhap/du-lieu/DANH-MUC-SP.csv` (**287 mã sản phẩm**).

> Mọi con số dưới đây **đo trực tiếp**: đếm dòng trên hai file CSV, và truy D1 local
> `server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06f….sqlite`
> (bản chụp 21/08/2026 18:30, 404 `Item`, 304 `Item Price`, 4 `Bill of Materials`).
> **Chưa ghi một dòng nào vào D1** — phiên này chỉ dựng script và bảng ánh xạ.

---

## 0. Kết luận một trang

| Câu hỏi | Trả lời |
|---|---|
| Import vào đâu? | **`Bill of Materials` + `BOM Item`** (không phải `BOM Template`) |
| Nhập được bao nhiêu? | **33 định mức · 73 dòng cấu phần · 33 mã thành phẩm** |
| Bỏ lại bao nhiêu? | **1.625 dòng CSV**, mỗi dòng có lý do ghi rõ trong `nhap/du-lieu/29-dong-bi-bo-qua.csv` |
| Ánh xạ mã | 650 mục sổ tay → **211 khớp chắc · 146 mơ hồ · 293 không thấy** |
| Mã bán có định mức | từ **1/227** lên **~30/227** (33 BOM, trong đó 3 là mã cửa/lưới bán ra) |
| Có ghi đè giá không? | **Không.** Lệch giá chỉ được báo ở §5, không script nào chạm vào `Item Price`. |

---

## 1. QUYẾT ĐỊNH KIẾN TRÚC — vì sao `Bill of Materials`

Hệ có ba lớp (đã khảo sát ở `docs/audits/ALUMDOOR-UPS-BOM-RULE-20260821.md` §B1). Dữ liệu
sheet `ĐM` **không đồng nhất**: nó trộn ba loại số vào cùng một cột, và ba loại đó thuộc ba lớp
khác nhau.

| Loại số trong sheet `ĐM` | Ví dụ thật | Lớp đúng | Phiên này |
|---|---|---|---|
| **Hằng số trên một đơn vị thành phẩm** | `CON LĂN` cần `2 CÁI` cục nhựa, `0,096 KG/CON` bù lon | **`Bill of Materials` + `BOM Item`** | ✅ **nhập** |
| **Hệ số trên một đơn vị đo** (`KG/M2`, `KG/M ngang`) | `4,4 KG/M2` tôn lá | `Bill of Materials` với `BOM Item.qty_basis` | ✅ nhập khi ĐVT nói rõ trục |
| **Công thức hình học** (ô ĐM để trống hoặc = 0) | `Lá ruột (kg)`, `Lá đầu + Bộ 03 lá đáy` | **`BOM Rule` / `BOM Component Rule`** | ❌ **không nhập** |

### 1.1 Vì sao KHÔNG dùng `BOM Template`

`BOM Template` + `BOM Component Rule` là lớp **sinh số lượng bằng công thức** trên trường hình
học (`CONSTANT` / `FIELD` / `PRODUCT` / `QUOTIENT`, `multiply`, `rounding`…). Nhét hằng số
"2 cái cục nhựa" vào đó là dùng sai lớp. Thêm hai lý do thực tế:

- `BOM Template` **không có mục trên menu và không có editor** (`catalog-readiness.ts:77` đã ghi
  nhận). Nhập vào đó là nhập vào chỗ chủ xưởng **không mở ra sửa được**.
- `BOM Template.conditions` **chỉ so BẰNG, không so LỚN/NHỎ** (`bom-template-core.ts:143-147`),
  nên các dòng ĐM phân theo bậc diện tích (`TRỌN BỘ 3-4m²`, `>10m²`) không khai vào đó được.

### 1.2 `qty_basis` là chỗ chứa đúng nghĩa của `KG/M2`, `KG/M ngang`

`BOM Item` có sẵn ô `qty_basis` với 5 giá trị: `Cố định` · `Theo chiều cao` · `Theo chiều rộng` ·
`Theo diện tích` · `Theo số lá`. Quy ước dịch ĐVT của xưởng sang ô đó:

| ĐVT trong sheet `ĐM` | `qty_basis` | Số dòng có ĐM > 0 |
|---|---|---:|
| `CÁI` · `CON` · `KG` · `TẤM` · `BỘ` · `CẶP` · `CÂY` · `BỌ` · `KG/CON` · `KG/CÁI` · `KG/CẶP` | `Cố định` | 541 |
| `M2` · `KG/M2` | `Theo diện tích` | 120 |
| `KG/M ngang` · `M NGANG` | `Theo chiều rộng` | 25 |
| `KG/M cao` | `Theo chiều cao` | 2 |
| **`KG/M` · `M` (trần)** | **KHÔNG dịch được** | **260** |

### 1.3 Phần dữ liệu KHÔNG có chỗ chứa đúng nghĩa — nói thẳng

**260 dòng ĐVT `KG/M` và `M` trần** không nhập được. `KG/M` nghĩa là "trên một mét", nhưng
sheet **không ghi mét theo chiều CAO hay chiều RỘNG**, mà `qty_basis` bắt buộc phải chọn một
trong hai. Ví dụ trên cửa Đức: `Ron đáy đức` (`KG/M` 0,117) chạy theo chiều rộng, còn
`Lông nheo nhỏ` (`M`) chạy theo chiều cao ×2 — **hai dòng cùng ĐVT nhưng khác trục**. Máy đoán
được thì cũng chỉ là đoán, và đoán sai nghĩa là xuất kho sai vật tư.

⇒ Chúng nằm trong `29-dong-bi-bo-qua.csv` với lý do `ĐVT "KG/M" — chưa rõ theo chiều CAO hay RỘNG`.
Chủ xưởng chỉ cần trả lời **một lần cho mỗi tên vật tư** (xem §6, câu **Đ1**), không phải 260 lần.

---

## 2. ĐÃ NHẬP ĐƯỢC GÌ — 33 định mức

Ghi vào `Bill of Materials`, mỗi bản `quantity = 1` (định mức cho **một** đơn vị thành phẩm),
`bom_status = Draft`, `is_active = true`, `note` mang lineage nguyên văn (dòng nào của sheet `ĐM`,
tên và mã sổ tay gốc). Mỗi dòng `BOM Item` mang `source_note` ghi số dòng CSV và ĐVT nguồn.

| Số chứng từ | Mã hàng D1 | Tên hàng | Số cấu phần |
|---|---|---|---:|
| `DM-2026-0014` | `PKDUC_CON_LAN` | CON LĂN | 5 |
| `DM-2026-0015` | `PKC_BO_2VIS_752_VIPST700` | BỌ 2VIS 752-VIPST700 | 2 |
| `DM-2026-0016` | `PKC_BO_1VIS_AL702LOP` | BỌ 1 VIS-AL702LOP | 1 |
| `DM-2026-0017` | `PKC_BO_1VIS_AL701LOP` | BỌ 1 VIS-AL701LOP | 2 |
| `DM-2026-0018` | `PKC_BO_1VIS_AL75` | BỌ 1VIS-AL75 | 2 |
| `DM-2026-0019` | `PKC_BO_1VIS_AL503C` | BỌ 1VIS AL503C | 2 |
| `DM-2026-0020` | `PKDUC_BO_1VIS_503N_71_595` | BỌ 1VIS 503N-71-595 | 2 |
| `DM-2026-0021` | `PKDUC_BO_2VIS_501_552` | BỌ 2VIS 501N-552 | 2 |
| `DM-2026-0022` | `PKDUC_BO_2VIS_652_548C` | BỌ 2VIS-652-548C | 1 |
| `DM-2026-0023` | `MT_TANKER400KG` | MOTOR TANKER 400KG | 1 |
| `DM-2026-0024` | `MT_YHLD300KG` | MOTOR YHLD 300KG | 2 |
| `DM-2026-0025` | `MT_YHLD500KG` | MOTOR YHLD 500KG | 2 |
| `DM-2026-0026` | `MT_YHLD800KG` | MOTOR YHLD 800KG | 2 |
| `DM-2026-0027` | `MT_YHLD1000KG` | MOTOR YHLD 1000KG | 2 |
| `DM-2026-0028` | `MT_JG300KG` | MOTOR JG 300KG | 2 |
| `DM-2026-0029` | `MT_JG400KG` | MOTOR JG 400KG | 1 |
| `DM-2026-0030` | `MT_JG500KG` | MOTOR JG 500KG | 1 |
| `DM-2026-0031` | `MT_JG600KG` | MOTOR JG 600KG | 1 |
| `DM-2026-0032` | `MT_JG800KG` | MOTOR JG 800KG | 1 |
| `DM-2026-0033` | `MT_JG1000KG` | MOTOR JG 1000KG | 3 |
| `DM-2026-0034` | `MT_JG1500KG` | MOTOR JG 1500KG | 3 |
| `DM-2026-0035` | `MT_TANKER600KG` | MOTOR TANKER 600KG | 1 |
| `DM-2026-0036` | `MT_TANKE800KG` | MOTOR TANKER 800KG | 2 |
| `DM-2026-0037` | `DK_MULLER` | BỘ ĐIỀU KHIỂN ĐIỆN THOẠI MULLER | 1 |
| `DM-2026-0038` | `PKC_GOIGANG` | GỐI GANG | 1 |
| `DM-2026-0039` | `LKMT_PAT_CODAY` | PHÍM ÂM TƯỜNG CÓ DÂY | 1 |
| `DM-2026-0040` | `MT_ALUMAX400KG` | MOTOR ALUMAX 400KG | 3 |
| `DM-2026-0041` | `MT_ALUMAX600KG` | MOTOR ALUMAX 600KG | 1 |
| `DM-2026-0042` | `PKC_RONDAYUC` | RON ĐÁY ÚC | 1 |
| `DM-2026-0043` | `PKC_BKAN` | BÁT KHÓA ÂM NỀN | 1 |
| `DM-2026-0044` | `CDUC_DUC_KT_AL70_2_LOP` | CỬA ĐỨC KÉO TAY AL70 (2 LỚP) | 10 |
| `DM-2026-0045` | `CDUC_DUC_KT_AL70` | CỬA ĐỨC KÉO TAY AL70 (1 LỚP) | 10 |
| `DM-2026-0046` | `CLUOI_LUOI_SNPHI19_INOX_TRONBO` | CỬA LƯỚI SN PHI 19 INOX- TRỌN BỘ | 1 |

**Đọc thẳng ra**: phần nhập được chủ yếu là **cụm lắp ráp và phụ kiện** (con lăn, bọ, motor,
điều khiển) — thứ có định mức hằng số. **Cửa bán ra hầu như chưa vào được**, vì cấu phần chính
của cửa là lá nhôm, và lá nhôm luôn tính bằng công thức hình học (§1.3, §3).

---

## 3. VÌ SAO 1.625 DÒNG BỊ BỎ LẠI

Chi tiết từng dòng: **`nhap/du-lieu/29-dong-bi-bo-qua.csv`** (có cột `dong_csv` để mở lại đúng
dòng trong `DM-BOM.csv`).

| Số dòng | Lý do | Đường đi đúng |
|---:|---|---|
| **662** | ĐM để trống | `BOM Rule` — công thức hình học |
| **88** | ĐM = 0 | `BOM Rule` — ô để trống bị ghi thành 0, **không phải định mức bằng 0** |
| **268** | Vật tư **không tra ra** mã trong 404 `Item` | chủ xưởng chỉ mã, hoặc thêm mã vào danh mục |
| **86** | Vật tư **mơ hồ** (nhiều ứng viên / tên lệch) | chủ xưởng chốt — §4 |
| **118 + 99** | ĐVT `M` / `KG/M` trần | chủ xưởng trả lời "cao hay rộng" — §6 câu **Đ1** |
| **304** | Thành phẩm cha chưa tra ra mã ⇒ cả cụm cấu phần rơi theo | §4.1 |

> **`ĐM = 0` là cái bẫy nguy hiểm nhất của file này.** 88 dòng ghi số 0 — toàn bộ là
> `Lá ruột (kg)` và `Lá đầu (kg) + Bộ 03 lá đáy (kg)`. Nhập 0 vào BOM nghĩa là xưởng xuất kho
> **không lá nào**, và không có gì kêu lên. Script từ chối nhập mọi `dinh_muc = 0`.

---

## 4. BẢNG ÁNH XẠ MÃ — 3 NHÓM

Ánh xạ theo **TÊN tiếng Việt là chính** (Excel `ten_vat_tu` ⇄ D1 `item_name`), mã chỉ để đối
chiếu phụ. Bảng đầy đủ 650 dòng: **`nhap/du-lieu/29-anh-xa-vat-tu.csv`**.

Bốn tầng căn cứ, xếp từ chắc xuống lỏng:
1. **trùng TÊN** nguyên văn và D1 chỉ có một mã mang tên đó → **A-KHỚP**
2. **trùng MÃ** nguyên văn → **A-KHỚP**
3. **trùng ĐUÔI MÃ** sau khi bỏ tiền tố (`NVL-CHNHUA` ⇄ `PKC_CHNHUA`) **và** tên giống ≥ 0,70 → **A-KHỚP**; tên lệch → **B-MƠ HỒ**
4. chỉ gần đúng tên, hoặc nhiều ứng viên → **B-MƠ HỒ**; không có gì → **C-KHÔNG THẤY**

| Nhóm | Tổng 650 mục | Trong đó có ĐM > 0 (434 mục) |
|---|---:|---:|
| **(a) A-KHỚP — chắc chắn** | **211** | **139** |
| **(b) B-MƠ HỒ — nhiều ứng viên / tên lệch** | **146** | **117** |
| **(c) C-KHÔNG THẤY** | **293** | **178** |

Script import **bỏ qua toàn bộ (b) và (c)**. Không đoán, không bịa mã.

### 4.1 Nhóm (b) — kiểu mơ hồ và cách chốt nhanh

| Kiểu | Số mục | Việc chủ xưởng cần làm |
|---|---:|---|
| **Đuôi màu/bề mặt** — Excel tách `XN-VK` / `XR-CF` / `TR-XLC` / `KU-GU` / `GS` / `VK` / `MSK`, D1 gộp mọi màu vào MỘT mã | **63** | trả lời câu **Đ2** một lần cho cả 63 |
| Chỉ gần đúng tên | 25 | soát từng dòng trong CSV |
| Trùng đuôi mã nhưng tên lệch | 9 | xác nhận Đ/S |
| Nhiều ứng viên | ~20 | chọn 1 |

Ví dụ điển hình của kiểu đuôi màu (mỗi dòng là một biến thể riêng trong Excel, D1 chỉ có một mã):

| Excel | Mã sổ tay | Ứng viên D1 duy nhất |
|---|---|---|
| `CỬA ÚC KT 4.6D XN-VK` / `XR-CF` / `TR-XLC` / `KU-GU` | `TP-UC KT 4.6D …` | `CUC_UC_KT_4_6D` |
| `CỬA ÚC KT 5.5D` × 4 màu | `TP-UC KT 5.5D …` | `CUC_UC_KT_5_5D` |
| `ĐỨC AL595 - GS` / `- VK` / `- MSK` | `TD-AL595 GS`… | `CDUC_TD_AL595` |
| `LÁ ĐÀI LOAN 1LY_XN-VK` / `_XN-XLC` | `NVL-TON-DL9.2Dx124-…` | `LA_DLK_1LY` |

⚠ **Ba biến thể bề mặt của cùng một cửa có ĐỊNH MỨC KHÁC NHAU trong Excel.** Ví dụ `ĐỨC AL595`:
`Lông nheo nhỏ` là `0,190404` ở bản GS nhưng `5,1` ở bản VK; `Puly đen` là `1,0` ở GS và `0,5`
ở VK. Nếu ba biến thể cùng trỏ về `CDUC_TD_AL595` thì **một mã hàng nhận ba bộ định mức mâu
thuẫn** — engine cấm hai BOM cùng mức (`bom-template-core.ts:226` *"hệ thống không đoán"*).
Script vì thế **bỏ hết cả ba** thay vì chọn bừa một bản. Xem câu **Đ2**.

### 4.2 Nhóm (c) — không tra ra, xếp theo mức độ chặn (số dòng ĐM bị chặn)

| Excel | Mã sổ tay | Dòng bị chặn | Ứng viên gần nhất trong D1 |
|---|---|---:|---|
| `RAY SẮT (KHÔNG RON) U70` | `NVL-TOLE1.2x190-KRON` | 21 | `RT_RAY_U70_KRON` *(audit trước đã dùng mã này — cần xác nhận)* |
| `CÂY KÉO CỬA (INOX + NHỰA+MÓC)` | `NVL-INOX, NVL-NHUA, NVL-MOC` | 12 | **ba mã gộp một ô** — `PKC_INOX` + ? + ? |
| `JG_HopDK` | `TP-JG-HDK` | 10 | không có mã "hộp ĐK JG" nào |
| `JG_TayDK` | `TP-JG_TayDK` | 10 | `PKD_TAY_JG` |
| `TANKER_ALUMAX_HopDK` / `_TayDK` | `TP-Tanker-Alumax-…` | 10 + 10 | `DK_TANKER_ALUMAX_BODK` / `PKD_TAY_TANKER_ALUMAX` |
| `LÁ ĐÀI LOAN 6D/7D/8D/1LY` × `XN-VK`/`XN-XLC` | `NVL-TON-DL*x124-*` | 8 mỗi mã (64) | `TON_DLM_6D_K124`, `TON_DLM_7D_K124`, `TON_DLM_8D_K124`… |
| `LÁ ĐÀI LOAN STĐ …_MSK` | `NVL-TOLEKEM124_*` | 25 | `LA_DLK_*` — **và mã sổ tay lệch bậc**: `NVL-TOLEKEM124_6D_MSK` mang tên "8D" |
| `YHTAIWAN_TayDK` / `YHLD_HopDK` / `YHLD_TayDK` | `TP-YH*` | 8 / 7 / 7 | `PKD_TAY_YHTAIWAN` / — / `PKD_TAY_YHLD` |
| `LÁ TÔN 4.6D XN-VK` / `XR-CF` / `KU-GU` / `TR-XLC` | `NVL-TOLE0.42x598-*` | 6 / 4 / 4 / 3 | **không có ứng viên nào** |
| `BỌ 2VIS 548C-501C-AL652` | `NVL-BO2VIS-548C-501C-AL652` | 4 | `PKDUC_BO_2VIS_652_548C`? |
| 8 mã lò xo `NVL-LX-…` / `NVL-LV-…` | | 9+9+4+3 | `PKC_LX…` — **D1 có 2 mã trùng nghĩa cho mỗi quy cách** |

### 4.3 Bẫy đã xử lý

- **Đảo cột** (`row 19-21`, `ten_vat_tu` chứa mã, `ma_vat_tu` chứa tên): bộ tra thử **cả hai
  cột** làm tên rồi mới kết luận, nên đảo cột không còn ảnh hưởng. Ví dụ `TP-RHM8 | TP-RAYHOP`
  vẫn ra `RT_RAYHOP` qua đường "trùng đuôi mã".
- **Đuôi tên thành phẩm cha** (`Vis - CỬA ĐỨC KÉO TAY AL70 (1 LỚP)`): chỉ được bỏ khi phần đuôi
  **đúng bằng** tên thành phẩm cha. Nếu bỏ đuôi vô điều kiện thì `ĐỨC AL595 - GS` sẽ bị gộp
  nhầm vào `ĐỨC AL595` — đúng cái lỗi §4.1 nói.
- **Lỗi danh mục D1 tự phát hiện được**: `TP LÁ ĐÀI LOAN 8D` là tên của **hai** mã
  (`TON_DLM_8D_K124` và `LA_DLK_8D`); mỗi quy cách lò xo có hai mã (`PKC_LX_5.5_X_70_X_46V` và
  `PKC_LX5.5X70X46V`). Đây là **lỗi danh mục**, không phải lỗi ánh xạ.

### 4.4 Ba file tham chiếu cũ KHÔNG dùng được

`nhap/du-lieu/anh-xa-ma.json`, `docs/alumdoor-item-code-mapping.json`,
`docs/ALUMDOOR-ANH-XA-MA-HANG-20260819.md` đều ánh xạ **587 mã cũ → 424 mã đề xuất**
(`CUA-AL595`, `NHOM-BO-2VIS-…`). Danh mục D1 hiện hành lại dùng **hệ mã thứ ba**
(`CDUC_TD_AL595`, `PKC_*`, `RT_*`, `MT_*`). Đã kiểm: **không mã `424` nào có mặt trong 404 `Item`**.
Nên phiên này ánh xạ lại từ đầu theo tên, không dựa vào ba file đó.

---

## 5. DỮ LIỆU PHỤ TRONG `DANH-MUC-SP.csv` — CHỈ BÁO, KHÔNG GHI ĐÈ

Tra được **188/287** mã sản phẩm sang `Item` của D1 (99 mã còn lại là mã "không lắc /
không bộ điều khiển" và mã nhôm cây, xem `29-anh-xa-vat-tu.csv`).

### 5.1 Bản lá (`leaf_divisor_m`) — audit trước SAI, trường này ĐÃ CÓ

Audit `ALUMDOOR-UPS-BOM-RULE-20260821.md` §G4 ghi *"không thấy trường bản lá trên `Item`"*.
**Sai.** Đo D1: `Item.leaf_divisor_m` **có thật và đã có dữ liệu** — 19 mã cửa Đức đều mang giá
trị (`CDUC_TD_AL595 = 0.06`, `CDUC_TD_AL71N = 0.057`…). Giả định `Bản lá 60 = 0,060 m` được
**xác minh đúng**: `CDUC_TD_AL595` có `Thông số = "Bản lá 60"` và `leaf_divisor_m = 0.06`.

Đối chiếu 13 mã có ghi `Bản lá` trong cột `Thông số`: **8 khớp · 5 lệch · 0 trống**.

| Mã D1 | Tên | Excel | D1 hiện tại | |
|---|---|---:|---:|---|
| `CDUC_TD_AL71N` | ĐỨC AL71N | **0,055** | 0,057 | LỆCH |
| `CDUC_TD_AL501N` | ĐỨC AL501N | **0,056** | 0,057 | LỆCH |
| `CDUC_ALD_DL552` | ĐỨC AL552N | **0,056** | 0,057 | LỆCH |
| `CDUC_ALVIPST500` | ĐỨC AL-VIPST500 | **0,055** | 0,053 | LỆCH |
| `CDUC_AL75` | ĐỨC AL75 | **0,066** | 0,067 | LỆCH |

> `AL71N` chính là mã mà audit trước đã đánh dấu *"⚠ nguồn có 2 giá trị khác nhau"*. File
> chủ xưởng gửi hôm nay nói **0,055**; D1 đang giữ **0,057**. Chênh 2 mm trên bản lá làm lệch
> **1–2 lá** trên một cửa cao 3 m. **Cần chốt (câu Đ3).** Không script nào ở đây sửa nó.

### 5.2 Giá — Excel là bảng MỚI HƠN ở nhóm cửa Đức

| Đối chiếu | Số mã |
|---|---:|
| `Giá niêm yết` **KHỚP** với `Item Price` (`STANDARD`) | **140** |
| `Giá niêm yết` **LỆCH** với dòng `CHI_LA` | **15** |
| `Giá niêm yết` **LỆCH** với dòng `STANDARD` | **9** |
| `Giá có ray` **LỆCH** với dòng `TANG_RAY` | **15** |
| D1 **chưa có** dòng `TANG_RAY` | 153 |
| D1 **không có dòng giá nào** | 23 |

140/188 khớp tuyệt đối ⇒ Excel và D1 **là cùng một bảng giá**, chỉ khác ở nhóm cửa Đức.
Cặp cột **đúng là `CHI_LA` / `TANG_RAY`** như dự đoán: cả 15 mã đều có
`Giá có ray − Giá niêm yết = 75.000` và D1 cũng có `TANG_RAY − CHI_LA = 75.000`. Nhưng **mức nền
lệch**, và Excel luôn **cao hơn**:

| Mã | Excel niêm yết | D1 `CHI_LA` | Chênh |
|---|---:|---:|---:|
| `CDUC_TD_AL595` | 1.049.000 | 1.020.000 | +29.000 |
| `CDUC_TD_AL71N` | 1.132.000 | 1.095.000 | +37.000 |
| `CDUC_TD_AL503N26` | 1.243.000 | 1.200.000 | +43.000 |
| `CDUC_ALD_548N` | 1.335.000 | 1.287.000 | +48.000 |
| `CDUC_TD_AL501N` | 1.421.000 | 1.371.000 | +50.000 |

Chênh **không phải hằng số** ⇒ không phải lỗi quy đổi, mà là **hai lần chốt giá khác nhau**.
**Không ghi đè.** Chủ xưởng xác nhận bảng nào là bảng đang bán (câu **Đ4**), rồi mới nhập.

### 5.3 `Có ray tặng`

287/287 dòng ghi `True` cho 15 mã tra ra được; **không mã nào ghi `False`**. `Item` trong D1
**không có trường nào tương ứng**. Vì cột này không phân biệt được mã nào, nó **chưa mang thông
tin gì** — đề nghị chủ xưởng đánh dấu lại mã nào KHÔNG tặng ray trước khi thêm trường (câu **Đ5**).

---

## 6. CÂU HỎI CHO CHỦ XƯỞNG (trả lời ngắn là mở khoá được nhiều dòng)

- **Đ1.** Vật tư ĐVT `KG/M` / `M` trên cửa: đo theo **chiều CAO** hay **chiều RỘNG**?
  (`Ron đáy đức`, `Lông nheo nhỏ`, `Ron nhựa/lông cạnh ray`, `Ron nhựa đáy ray`, `Ron inox đáy ray`,
  `RAY SẮT U70`, `TRỤC 114`) — mở khoá **260 dòng**.
- **Đ2.** Cửa cùng model khác **màu/bề mặt** (`XN-VK`, `XR-CF`, `TR-XLC`, `KU-GU`, `GS`, `VK`, `MSK`)
  dùng **một mã hàng** như D1 đang làm, hay phải tách thành mã riêng? Nếu dùng một mã thì
  **định mức của bản nào là bản đúng** (ví dụ `ĐỨC AL595`: `Lông nheo nhỏ` 0,190404 hay 5,1)?
  — mở khoá **63 mục ánh xạ + 304 dòng**.
- **Đ3.** Bản lá đúng của `AL71N` / `AL501N` / `AL552N` / `AL-VIPST500` / `AL75` là số nào —
  Excel (0,055 / 0,056 / 0,056 / 0,055 / 0,066) hay D1 (0,057 / 0,057 / 0,057 / 0,053 / 0,067)?
- **Đ4.** Giá cửa Đức đang bán là bảng **Excel hôm nay** (cao hơn) hay bảng **trong máy**?
- **Đ5.** Mã nào **KHÔNG** được tặng ray? (cột `Có ray tặng` đang ghi `True` cho tất cả)
- **Đ6.** `CÂY KÉO CỬA (INOX + NHỰA+MÓC)` là **ba** vật tư gộp một ô — ba mã D1 là gì?
- **Đ7.** `JG_HopDK` / `TANKER_ALUMAX_HopDK` / `YHLD_HopDK` — D1 chỉ có `DK_*` (bộ điều khiển)
  và `PKD_TAY_*` (tay điều khiển), **không có "hộp điều khiển"**. Hộp ĐK là mã riêng hay chính
  là `DK_*`?
- **Đ8.** D1 có **hai mã trùng nghĩa** cho mỗi quy cách lò xo (`PKC_LX_5.5_X_70_X_46V` và
  `PKC_LX5.5X70X46V`) và hai mã cùng tên `TP LÁ ĐÀI LOAN 8D` (`TON_DLM_8D_K124`, `LA_DLK_8D`).
  Bỏ mã nào?

---

## 7. HƯỚNG DẪN CHẠY

### Bước 1 — chạy thử (an toàn, **chạy được cả khi backend đang mở**)

```
cd C:\alumdoor
node nhap\import-dinh-muc-bom.mjs
```

Chỉ đọc, không ghi gì. In ra: sẽ ghi bao nhiêu BOM / cấu phần, bỏ qua bao nhiêu dòng và vì sao,
có mã nào script định dùng mà D1 thiếu không, có trùng số chứng từ không.

### Bước 2 — ghi thật

```
cd C:\alumdoor
node nhap\import-dinh-muc-bom.mjs --that
```

**Phải TẮT backend/Desk trước.** Script tự chặn nếu cổng `8799` hoặc `5173` còn nghe — ghi song
song với miniflare đang giữ file D1 sẽ tạo ra hai bản sự thật. Trước khi ghi, script **tự sao
lưu** toàn bộ D1 vào `nhap\.sao-luu\d1-truoc-29-dinh-muc-bom-<thời-điểm>.sqlite`.

### Đặc tính của script

| | |
|---|---|
| Mặc định | chạy thử, chỉ đọc |
| Ghi thật | chỉ khi có cờ `--that` |
| Sao lưu | **bắt buộc**, không có cờ tắt |
| Giao dịch | toàn bộ trong `BEGIN`/`COMMIT`, hỏng thì `ROLLBACK` |
| Idempotent | ghi theo `doc_key = "Bill of Materials:DM-2026-00xx"`, chạy hai lần **không nhân đôi**, và chỉ tăng `version` khi payload thực sự khác |
| Chặn tham chiếu | `kiemThamChieu` — mọi `item_code` phải có trong `Item`, thiếu một mã là **DỪNG**, không ghi mã treo |
| Chặn ghi đè | nếu số chứng từ `DM-2026-00xx` đã bị người khác dùng, script **DỪNG** thay vì đè |
| Bộ đếm chứng từ | tự đẩy `naming_series` lên `46` để BOM tạo tay sau này không đâm vào tên cũ |

### Sau khi chạy

`Bill of Materials` trong D1: **4 → 37**. Mở màn `Định mức` để soát; ba bản `DM-2026-0011/0012/0013`
là **rác do e2e** (`"Định mức tối thiểu dựng bởi e2e … để thử luồng sản xuất"`) — nên xoá tay,
script này **không tự xoá** vì `DM-2026-0013` đã ở trạng thái `docstatus = 1`.

---

## 8. FILE CỦA ĐỢT NÀY

| File | Nội dung |
|---|---|
| `nhap/import-dinh-muc-bom.mjs` | script import |
| `nhap/du-lieu/29-dinh-muc-bom.json` | 33 bản ghi `Bill of Materials` đã dựng sẵn (nguồn của script) |
| `nhap/du-lieu/29-anh-xa-vat-tu.csv` | bảng ánh xạ 650 mục, 3 nhóm, kèm căn cứ |
| `nhap/du-lieu/29-dong-bi-bo-qua.csv` | 1.625 dòng bị bỏ, mỗi dòng một lý do |
| `nhap/du-lieu/29-lech-ban-la-va-gia.csv` | lệch bản lá và lệch giá, để đối chiếu |
| `docs/audits/ALUMDOOR-IMPORT-DINH-MUC-20260821.md` | tài liệu này |
