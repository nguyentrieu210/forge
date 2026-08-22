# Quyết định của chủ xưởng — 22/08/2026

Hồ sơ này là **bằng chứng** cho các mục đã gỡ khỏi danh sách chặn của
`server/scripts/audit-alumdoor-import-gate-local.mjs`. Mỗi mục ghi: hỏi gì, chủ xưởng trả
lời gì, đã sửa ở đâu. Không có mục nào trong đây được suy đoán.

Mã hồ sơ: `ALUMDOOR-QD-20260822`

---

## QĐ-1 — Cột "Định mức" trong sheet ĐM không phải định mức

**Hỏi:** ô `ĐM!G1088` ghi `0,066 KG` cho BỌ 1VIS cửa Đức kéo tay, còn ô `I1088` ghi công
thức `rộng cắt lá × TL 0,117`. Tương tự `G1089/I1089` cho Vis (`0,0341` ⇄
`Cao × Rộng cắt lá × TL 0,0093`). Lấy số hay lấy công thức?

**Trả lời:** *"cái số định mức đó bỏ qua đi"* — lấy công thức.

**Lý do đằng sau:** con số ở cột G là **kết quả tính cho một cỡ cửa cụ thể** nào đó, không
phải định mức cố định. Bằng chứng nội tại: cùng bộ cấu kiện ấy, bản cửa 2 lớp
(`DM-2026-0023`, dòng nguồn 1063/1064) đã để trống số và tính theo công thức, chỉ bản 1 lớp
còn giữ số cứng.

**Đã sửa:** 42 dòng BOM chuyển sang `qty_basis = "Theo kích thước"`, giữ nguyên
`source_note` để không mất dấu số cũ.

**Phạm vi có giới hạn:** chỉ chuyển những dòng **đã có BOM Rule tính ra được**. 94 dòng
khác cũng vừa có số vừa có công thức nhưng chưa có luật — giữ nguyên số, vì xoá số mà không
có gì thay thế là biến một con số hơi lệch thành không có số nào. Và không phải chuỗi nào ở
cột I cũng là công thức: `PKC_GIAT` ghi *"1 bộ 1 cặp"*, ở đó `qty = 1` chính là đúng.

---

## QĐ-2 — Số KG ở cột Định mức là hệ số cân, không phải số lượng

**Hỏi:** `ĐM!G1184`, `G1192`, `G1212` ghi `4,4` cho TRỤC114_1.8LY, còn cột I ghi
`Rpbray+20cm`. Hai ô này mâu thuẫn nhau?

**Trả lời:** *"kg kia là kg/con"* — số ở cột G là **hệ số cân**.

**Kết luận:** ba ô này **không hề mâu thuẫn**. Cột G là hệ số quy đổi (4,4 kg/mét), cột I là
công thức chiều dài. Hai đại lượng khác nhau bị đặt cạnh nhau. Cổng bắt nhầm.

Lỗi thật ở đây là **nhãn đơn vị**: dòng 1184 và 1192 ghi ĐVT `KG/M`, dòng 1212 ghi `KG` —
cùng vật tư, cùng số 4,4, hai nhãn khác nhau. Nhãn ở 1212 sai.

**Đã có sẵn:** `RT_TR114_1.8` mang hệ số `1 Mét = 4,4 Kg`.

---

## QĐ-3 — Trục cửa lưới: nguồn ghi +20cm, thực tế +2cm

**Hỏi:** `ĐM` ghi công thức trục cửa lưới là `Rpbray+20cm`.

**Trả lời:** *"20cm sửa đi"* — xác nhận lại quyết định đã cho ngày **19/08/2026**, lưu ở
`server/local-imports/alumdoor-bom-rules/owner-overrides.json`: quy cách thực tế là
**Rộng phủ bì ray + 2cm**.

**Đã sửa:** `BOM Rule BOMR-CUA-LUOI-RT-TR114-1-8` đổi `operand 0,2 → 0,02`,
`formula_display` thành `PB_RAY_RONG + 0,02`, `authority_type = OWNER_CONFIRMED`.
Giữ nguyên `source_formula_text = "Rpbray+20cm"` để không mất dấu vết nguồn.

**Không đụng** hai luật `+0,4` của cửa tấm liền Úc (`BOMR-CUA-TAM-LIEN-UC-RT-TR114-1-8`,
`BOMR-CUA-TAM-LIEN-UC-RT-TRUC34`, nguồn ghi `+40cm`). Cửa Úc lắp motor bên trong nên trục
phải thò ra hai đầu; 40cm là hợp lý về mặt vật lý và chủ xưởng chỉ nói sửa cái 20cm.

---

## QĐ-4 — "CỐT" và "TRỤC 140" là hai mặt hàng khác nhau

**Hỏi:** tên `CỐT TRỤC 140` trong nguồn ứng với một mặt hàng hay hai?

**Trả lời:** *"cốt trục khác nhau"* — hai thứ.

**Trạng thái D1:** `LKMT_COT` (CỐT, đang dùng) và `RT_TRUC140` (TRỤC 140, đã ngừng dùng,
thay bằng `RT_TR140`). Cả hai đều đã có mã, không thiếu gì.

---

## QĐ-5 — `ĐM!G1254` không phải mâu thuẫn, là lỗi sao chép trong nguồn

Không phải câu hỏi cho chủ xưởng — tìm ra khi soi hai dòng cạnh nhau:

```
dòng 1254   NVL-TOLEKEM124_6D   ĐVT KG   ĐM = 8,2    công thức "DT*SL*12,6kg/m2"
dòng 1257   NVL-TOLEKEM124_8D   ĐVT KG   ĐM = 12,6   công thức "DT*SL*12,6kg/m2"
```

Dòng 8D có định mức khớp hệ số trong công thức của nó. Dòng 6D thì **công thức bị chép từ
dòng 8D mà quên đổi hệ số** — tôn 6D mỏng hơn tôn 8D nên không thể cùng 12,6 kg/m².

Theo QĐ-2, số ở cột G là hệ số cân, nên hệ số đúng của tôn kẽm 124 6D là **8,2 kg/m²**,
của 8D là **12,6 kg/m²**. Cần sửa công thức ở dòng 1254 của file nguồn.

Chưa ghi hệ số này vào D1: `TON_DLK_*_K124` hiện chỉ khai một đơn vị (Kg), chưa có đơn vị
thứ hai để quy đổi sang. Thêm m² vào đó là đổi mô hình mặt hàng, không phải điền số —
để lại chờ quyết định.

---

## QĐ-6 — `TP-PULYDEN 114N/114L` là puly 114 nhỏ/lớn, đã có mã

Chủ xưởng bảo tra `danh mục sản phẩm.xlsx`. Tra ra ngay:

```
dòng 145   TP-PULY 114N | PULY 114 NHỎ | Phụ kiện | Cái | 22.000 đ
dòng 146   TP-PULY 114L | PULY 114 LỚN | Phụ kiện | Cái | 30.000 đ
```

Tên trong danh sách chặn (`TP-PULYDEN`) **sai chính tả** so với nguồn (`TP-PULY`). Cả hai
đều đang có mã chạy trong D1: `PKDUC_PULY_114N` (22.000/Cái) và `PKDUC_PULY_114L`
(30.000/Cái) — giá khớp danh mục.

**Kèm theo, phát hiện trùng mã.** Cùng mặt hàng mang hai mã, mỗi mã một phân hệ dùng:

| Mã | Ai dùng | Giá |
|---|---|---|
| `PKDUC_PL114_LON` / `_NHO` | BOM (đều là BOM rỗng tự trỏ) | không có |
| `PKDUC_PULY_114L` / `_114N` | bảng giá | 30.000 / 22.000 |

Giữ mã **có giá**, vì giá của nó khớp cả `danh mục sản phẩm.xlsx` lẫn giao dịch thật ở sheet
`chi tiết nhập hàng ngày`. Đã ngừng dùng hai mã kia kèm ghi chú thay thế, xoá hai BOM rỗng,
và đặt lại tên hiển thị theo danh mục ("PULY 114 LỚN" thay cho "PULY 114L").

> ⚠ Sheet `DANH MỤC` của chính `MS LIÊN BS.xlsx` ghi **chéo** hai giá này (114L→22.000,
> 114N→30.000). Giao dịch thật và `danh mục sản phẩm.xlsx` đều nói ngược lại. **Không lấy
> sheet DANH MỤC làm chuẩn giá.**

## QĐ-7 — Bốn ô công thức hỏng là hàm Google Sheets, không phải mất dữ liệu

Chủ xưởng bảo *"thì mở đi xem đi"*. Đã mở từng ô bằng `openpyxl`, đọc cả giá trị lẫn công
thức gốc. Chi tiết đầy đủ: `docs/source-data/ALUMDOOR-O-CONG-THUC-HONG.md`.

File làm trên **Google Sheets** rồi tải về `.xlsx`. Excel không có hàm mảng động của Google
Sheets nên chúng xuất thành `__xludf.DUMMYFUNCTION(…)` kèm giá trị lỗi đóng băng:

```
ĐM!C1925    =UNIQUE(FILTER((C34:C382),(B34:B382="")))
ĐM!C1983    =UNIQUE(FILTER(C689:C1056,B689:B1056=""))
BCKQKD!M24  =SUM(FILTER('chi tiết nhập hàng ngày'!X:X, …))
BCKQKD!M21  =sum(M22:M29)                            ← lan từ M24
```

Hai ô trong sheet `ĐM` chỉ là **bảng chiếu lại** dữ liệu đã nằm sẵn ở dòng 34–382 và
689–1056. Không mất cấu kiện nào của `ĐỨC AL595 - GS` — khối 1925+ là vùng công thức tràn,
không phải vùng nhập liệu. Bốn ô này **gỡ chặn**.

**Hai ô còn lại là lỗi thật, vẫn chặn:**

| Ô | Lỗi |
|---|---|
| `chi tiết nhập hàng ngày!S323` | gõ chữ **"tính lại"** vào ô đơn giá. Dòng: LÁ ĐÀI LOAN STĐ 8D, 4 × 5,18 = 20,72 m², đã thu 6.630.400 → đơn giá đáng lẽ ≈ 320.000/m². T/V/X323 lan theo. |
| `chi tiết nhập hàng ngày!T491` | `=T491*8%` — **ô tự trỏ vào chính nó**. Đã thu 497.245; nhiều khả năng định gõ `=W491*8%`. V/X491 lan theo. |

Cả hai nằm ở sổ bán hàng, không đụng danh mục hay định mức — nhưng làm sai sổ nên giữ chặn
cho tới khi xưởng sửa file.

## QĐ-8 — Chia lá có ngưỡng, không phải luôn trừ 1 lá

Tìm được khi đọc trọn sheet `GHI CHÚ` (trước đó ô bị cắt ngang nên chỉ thấy một nửa):

```
G3 = "(1320-130)/0,057"      G4 = 20877,19298
G5 = "DƯỚI 20,5 THÌ TRUWF LÁ TRÊN 20,5 K TRỪ"
```

`(1320 − 130)mm ÷ 57mm = 20,877 lá`. Con số 20 877 ở G4 là kết quả lệch 1000 lần do trộn mm
với mét.

**SỬA LẠI 23/08/2026 — cách đọc "20,5 là số lá" ở trên là SAI.** Nó suy ra luật *"n < 20,5
thì trừ một lá, n ≥ 20,5 thì không trừ"*. Chính ba ví dụ có sẵn của xưởng bác bỏ luật đó:

| Ví dụ của xưởng | Luật "ngưỡng 20,5" cho ra | Xưởng ghi |
|---|---|---|
| 52,18 lá | 52 (vì 52,18 ≥ 20,5 nên không trừ) | **51** |
| "52,6 thì là 52" | 53 | **52** |
| "<52,5 thì là 51" | 52 | **51** |

Ở vùng 52 lá mà xưởng **vẫn trừ một lá**, nên không thể có ngưỡng 20,5 lá. Luật thật là:
**luôn trừ một lá, rồi làm tròn theo phần thập phân với ngưỡng 0,6**, khớp cả ba ví dụ:

```
n     = (CPB − 130mm) / bản lá
sau   = n − 1
Số lá = ceil(sau)   khi phần thập phân của sau >= 0,6
        floor(sau)  khi nhỏ hơn
```

Đây đúng là điều `calculateLeafPlan` đang thi hành, và ô `leaf_round_threshold` là **phân số
0–1**, không phải số lá — engine từ chối giá trị lớn hơn 1. Vậy `20,5` trong ô `GHI CHÚ!G5`
vẫn **chưa giải nghĩa được**; nó nằm ở mục "Còn treo" bên dưới, không được đem vào thi hành.

Bảng quy đổi đầy đủ ở `docs/source-data/ALUMDOOR-QUY-DOI-LOT-LONG-PHU-BI.md`.

---

## Còn treo

| Mục | Cần gì |
|---|---|
| `ĐM!C1925` `#REF!` | Thuộc sản phẩm `ĐỨC AL595 - GS` (mã D1 `CDUC_TD_AL595`, 1.095.000/m²). Cấu kiện mất tên nhiều khả năng là `NVL-AL595-GS` "Lá ruột (kg) AL595 GS" — thấy trong sheet `chi tiết nhập hàng ngày` dòng 220–221. Cần mở ô C1925 trong Excel xác nhận. |
| `ĐM!C1983` `#REF!` | Dòng trống hẳn, không có thành phẩm. Nhiều khả năng là rác, xoá được. |
| Hệ số kg/m² của tôn kẽm | Chờ quyết định có đưa m² thành đơn vị thứ hai của `TON_DLK_*` không. |
| Ngưỡng "20,5" ở sheet `GHI CHÚ` | Ghi chú *"DƯỚI 20,5 THÌ TRỪ LÁ, TRÊN 20,5 K…"* bị cắt ngang trong ô. 20,5 là gì? |
| Hậu tố `C`/`N` của mã bản lá | Suy là lá **cong** / **nghiêng**; chưa được xác nhận. Xem `docs/source-data/ALUMDOOR-QUY-DOI-LOT-LONG-PHU-BI.md`. |
