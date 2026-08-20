# Prompt — Vòng audit 2: danh mục đủ để vận hành toàn chuỗi

*Soạn 2026-08-20, sau vòng 1. Vòng 1 đóng được tính nhất quán NỘI BỘ của danh mục; vòng này
hỏi câu khác hẳn: danh mục có đủ để chạy được toàn bộ nghiệp vụ không.*

---

## 0. Đọc phần này trước — vòng 1 đã hụt ở đâu

Ba điều dưới đây là lý do vòng 2 tồn tại. Đừng lặp lại.

**Bốn nguồn nhất trí KHÔNG phải bằng chứng khi chúng cùng một gốc.** Vòng 1 kết luận "ron bán
theo mét" sau khi tra danh mục, bảng giá, dòng định mức và bản trích nguồn — cả bốn đều nói
"Mét". Nhưng cả bốn đều phái sinh từ `local-imports/alumdoor-item-source-records.json`, mà bản
trích đó giữ **14 trường** trong khi nguồn gốc có tới **55 cột**. Hoá đơn thật ghi
`"RON INOX + NHỰA 4M X 2 SỢI"` — bán theo **sợi có chiều dài**, thông tin nằm ở cột đã bị cắt.

**Phần lớn tài liệu nguồn CHƯA TỪNG vào đường ống.** Đường ống chỉ đọc 6/28 file:

| Tài liệu | Dòng | Vì sao quan trọng |
|---|---:|---|
| `ms-lien/DANH-MỤC.md` | 393 | Có cột **MÃ NHẬP · GIÁ NHẬP · ĐVT · GIÁ BÁN · ĐVT · NCC · GHI CHÚ · GIÁ VỐN** — hai ĐVT tách bạch mua/bán kèm hệ số quy đổi ghi bằng lời (`"57 con/1KG"`, `"1 CẶP X 2 CÁI"`, `"TẤT CẢ QUY VỀ SỐ M, MỖI LẦN NHẬP 1M=?KG"`) |
| `don-hang-xuat-hang/DS-KH-NCC.md` | 455 | Danh sách KH/NCC — trong khi bước import `customer` đang hỏng vì "thiếu nguồn" |
| `don-hang-xuat-hang/T3–T7.2026` | ~5.000 | Đơn hàng thật 5 tháng — chứng từ để đối chiếu thay vì suy từ danh mục |
| `ms-lien/CHI-TIẾT-CNO-KH.md` | 452 | Chi tiết công nợ: mã xuất, mã nhập, ĐVT, số lượng, chiều dài, số sợi |
| `ms-lien/CỬA-LỖI.md` · `CHI-TIẾT-SƠN.md` | 225 | Lỗi thật và theo dõi sơn |
| `app-vat-tu/BaoCao.md` · `app-khach-hang/BaoCao.md` | 298 | Báo cáo từ app đang dùng |
| `quy-trinh-van-ban.md` | — | Quy trình bằng lời; chính nó định nghĩa "bộ 3 lá đáy = lá yếm + lá trung gian + lá đáy lớn" |

**Quy tắc bắt buộc cho vòng 2:** mọi kết luận phải truy được về **nguồn gốc**, không phải bản
trích. Khi bản trích và nguồn gốc lệch nhau, nguồn gốc thắng, và phải ghi lại chỗ lệch.

---

## 1. Câu hỏi trung tâm: gộp mã hay tách mã, và thuộc tính đi đâu

Hiện có **566 mặt hàng đang dùng**, trong đó:

```
96  mã nhồi TRỌN BỘ / TÁCH MÓN
88  mã nhồi BẬC DIỆN TÍCH (3-4m², >10m² …)
149 mã nhồi MÀU (GS, VK, THÔ, XLC, CF, KU-GU …)
29  mã nhồi ĐỘ DÀY (1.8LY, 2.1LY …)
```

Một mã đang gánh tới ba thứ cùng lúc: `TP-CUADL1LY-XN-VK_TRONBO_3-4m²`.

Chỗ chứa đã dựng ở vòng 1 nhưng **rỗng**:

```
Item Price.area_tier      0 / 558
BOM Template.sales_mode   0 / 349
dòng chứng từ có color    8
```

### Với TỪNG trục, phải chọn một trong bốn và nêu hệ quả

| | Cách | Hệ quả phải nêu |
|---|---|---|
| A | Giữ trong mã hàng | Số mã bùng nổ theo tích các trục; giá và định mức nhân bản |
| B | Trường trên DÒNG chứng từ | Một mã; phải có ô chọn ở mọi màn bán/mua/sản xuất |
| C | DocType biến thể riêng | Mã cha + biến thể; tồn kho theo biến thể |
| D | Chính sách giá / bảng giá | Một mã, nhiều dòng giá theo điều kiện |

Áp cho: **màu · bề mặt · cách bán · bậc diện tích · độ dày · quy cách/khẩu độ**.

Không trả lời chung chung. Mỗi trục phải kèm:
- bằng chứng từ nguồn gốc (xưởng nhập kho riêng theo màu không? bán theo bậc hay theo m² liên tục?)
- ảnh hưởng tới tồn kho: hai màu có phải hai dòng tồn riêng không
- ảnh hưởng tới giá vốn
- số mã trước và sau

### Câu hỏi bắt buộc trả lời
- Có cần **DocType mới** không (ví dụ `Item Variant`, `Product Bundle`)? Nếu có thì nó thay thế cái gì đang có, và ai đọc nó?
- Nếu đưa vào **chính sách giá**: `Pricing Rule` hiện có `pricing_scope`, `adjustment_basis`, `price_variant`, `exclusive_group` — đủ chưa, hay còn thiếu điều kiện?
- Mã sau khi rút thuộc tính có **trùng nhau** không? Trùng thì gộp — nhưng gộp là thao tác **không lùi được** với danh tính mặt hàng, nên phải có kế hoạch dời lịch sử.

---

## 2. Chính sách giá — soi hết mọi kiểu

Đã biết tồn tại: `Price List`, `Item Price`, `Pricing Rule`, `Pricing Scope`, `Bậc diện tích`,
`price_variant`, `exclusive_group`, `adjustment_basis` (FIXED / AREA_SQM / LENGTH_M / SET_COUNT /
PRICED_QTY), phụ thu sơn vân gỗ 360.000/m², "tặng ray" cho cửa ≥ 8 m², phụ vận chuyển 300.000/bộ
cho cửa < 8 m².

Phải trả lời:

1. **Bậc giá** — bậc diện tích 8 mức đã dựng nhưng 0/558 dòng giá dùng. Bậc là thuộc tính của
   *dòng giá* hay của *mặt hàng*? Cận trên đóng hay mở (`BRD §4.11` nói `min < S ≤ max`)?
2. **Kiểu giá** — đại lý vs lẻ; giá theo m² vs theo bộ vs theo mét vs theo kg. Bao nhiêu kiểu,
   mỗi kiểu cần danh mục gì?
3. **Biến thể giá** — `ALUMDOOR_MOTOR_NO_LAC`, `MOTOR_LAC36`, `HAND_PULL_CONVERSION`,
   `RAY_SON_MSK`, `V5_STD`… liệt kê ĐỦ, mỗi cái: điều kiện kích hoạt, phạm vi, nguồn.
4. **Phụ thu / chiết khấu / tặng kèm** — phụ thu sơn, tặng ray, phí vận chuyển: đang nằm ở đâu,
   có phải chính sách giá không, hay đang nhồi vào mã hàng (`PHUTHU_SONRAY_MSK` là một mã hàng!).
5. **Giá vốn** — `DANH-MỤC.md` có cột GIÁ VỐN. Hệ đang tính giá vốn từ đâu?
6. **Giá theo khách** — `DANH-MỤC.md` gắn giá theo từng khách hàng. Đó là bảng giá riêng, chính
   sách giá, hay hợp đồng?

---

## 3. Định mức — phân biệt cho rõ các kiểu BOM

Hiện có **ba** thứ mang tên BOM, và vòng 1 chưa làm rõ ranh giới:

```
Bill of Materials   234   định mức thật, có cấu phần và số lượng
BOM Template        349   khuôn, có component_rules và công thức
BOM Rule            110   quy tắc tính lượng, có applicability
```

Phải trả lời:
1. **BOM bán hàng vs BOM sản xuất** — cái nào dùng lúc báo giá, cái nào lúc cắt? Có phải cùng
   một bản không? Nguồn nói "trọn bộ 5 cấu phần, tách món 1 cấu phần" — đó là hai BOM hay một
   BOM hai chế độ (`sales_mode`)?
2. **Ai sinh ra BOM** — người lập hay máy sinh từ cấu hình (`generated_by_configurator`)? Sinh
   rồi người sửa thì lần sinh sau xử lý thế nào?
3. **921 dòng cấu phần đang PENDING** (chưa có số lượng) — chờ cái gì, ai điền?
4. **129 định mức có `qty_basis` tính lại khác bản đã lưu** — bản nào đúng?
5. **Công thức** — `CAO_CONG_0.15_X_SL`, `((Cao PB - 130) / bản lá) - 1`, chia lá theo 19 mã
   nhôm, hệ số theo loại motor. Chúng nằm ở `Cutting Policy`, `BOM Rule.formula_json`, hay
   hard-code? Liệt kê hết và chỉ ra chỗ nào viết hai lần.

---

## 4. 360 độ — danh mục theo TỪNG mắt xích vận hành

Đây là phần vòng 1 thiếu hẳn. Với mỗi mắt xích: **cần danh mục nào · đang có gì · đang trống ·
đang thiếu hẳn · ai đọc nó**.

### 4.1 Mua hàng
Nhà cung cấp · mã hàng theo NCC · giá nhập · ĐVT nhập · hệ số quy đổi nhập→tồn · điều khoản
thanh toán · công nợ NCC · đầu mối liên hệ.
> Biết trước: `Supplier` 24 bản ghi; `Supplier Item` **rỗng hoàn toàn** (đã ẩn khỏi menu ở vòng
> 1); `DANH-MỤC.md` có sẵn MÃ NHẬP + GIÁ NHẬP + ĐVT + NCC cho từng mã.

### 4.2 Bán hàng
Khách hàng · nhóm giá · bảng giá · bậc · biến thể · màu · cách bán · địa chỉ giao · người phụ
trách · hạn mức công nợ.
> Biết trước: `Customer` 440; `DS-KH-NCC.md` 451 dòng chưa đọc; `Địa chỉ giao lắp` **rỗng**;
> `customer-export.xlsx` chỉ có 1 dòng dữ liệu trong khi importer chờ 369.

### 4.3 Kho — nhập, xuất, tồn
Kho · vai trò kho · lô · đầu thừa · ĐVT tồn · quy đổi · kiểm kê · lý do chênh lệch.
> Biết trước: 8 kho (K0 phế, K12/K36 chính, K12-DT/K36-DT đầu thừa); **mọi bảng giao dịch kho
> đều RỖNG** — `stock_ledger_entries` 0 dòng. Nghĩa là chưa lần nào chạy thật.
> `uom_conversions` chỉ có ở **20/566** mặt hàng.

### 4.4 Sản xuất
Định mức · công đoạn · máy/trạm · tiêu chuẩn sản xuất · lịch sản xuất · chia lá · cắt · sơn ·
đầu thừa · nguyên nhân lỗi · bảo hành.
> Biết trước: `Manufacturing Routing` 9, `Operation` 8, `Workstation` 6, `Production Standard` 6,
> `Cutting Policy` 8, `Nguyên nhân cửa lỗi` 11 (vừa nối vào `Warranty Claim` ở vòng 1),
> `Paint Job` tồn tại; `LỊCH-SẢN-XUẤT.md` và `CHI-TIẾT-SƠN.md` chưa đọc.

### 4.5 Kế toán
Tài khoản · thuế (VAT 8%) · công nợ khách · công nợ NCC · giá vốn · kỳ kế toán.
> Biết trước: `Account` 189; `BCKQKD.md`, `CNO-NCC.md`, `CHI-TIẾT-CNO-KH.md` chưa đọc.

### Với mỗi mắt xích phải ra được
- Danh mục nào **thiếu hẳn** (không có DocType)
- Danh mục nào **có mà rỗng**
- Danh mục nào **có dữ liệu mà không ai đọc** — lưu ý: "không trường Link nào trỏ tới" KHÔNG có
  nghĩa là không ai dùng; máy tính giá và máy định mức đọc thẳng bằng tên doctype
- Trường nào **thiếu** để mắt xích chạy được

---

## 5. Ràng buộc khi làm

1. **Nguồn gốc thắng bản trích.** Mọi con số phải truy được về file `.md` trong
   `apps/alumdoor/docs/nguon/`, không phải về JSON đã trích.
2. **Đọc-chỉ trước, ghi sau.** Vòng này ra bản đồ. Không đổi mã, không gộp mã.
3. **Gộp mã là không lùi được** — nếu đề xuất gộp thì phải kèm kế hoạch dời giá, dời định mức,
   dời lịch sử chứng từ.
4. **Nghỉ hưu, không xoá.** Nền tảng từ chối xoá bản ghi đã khai.
5. **Chỉ động vào thứ không ai tham chiếu.** Bản ghi rác mà đang được dùng thì không còn là rác.
6. **Mỗi phát hiện phải có SỐ.** "Nhiều mã bị nhồi màu" là vô dụng; "149 mã" mới dùng được.
7. **Nói rõ chỗ không biết.** Chỗ dữ liệu tự mâu thuẫn hoặc nguồn không nói thì ghi ra, đừng đoán.

---

## 6. Sản phẩm phải giao

1. **Bản đồ danh mục theo chuỗi vận hành** — 5 mắt xích × (cần gì / có gì / rỗng / thiếu / ai đọc)
2. **Quyết định kiến trúc cho 6 trục thuộc tính** — mỗi trục chọn A/B/C/D kèm bằng chứng, số mã
   trước–sau, và ảnh hưởng tới tồn kho + giá vốn
3. **Danh sách đầy đủ chính sách giá** — mọi kiểu giá, biến thể, phụ thu, chiết khấu; cái nào
   đang nhồi vào mã hàng
4. **Ranh giới ba loại BOM** — cái nào dùng khi nào, ai sinh, ai sửa
5. **Danh sách nguồn chưa đọc → đã đọc**, kèm những gì mỗi nguồn bổ sung và mỗi chỗ nó **mâu
   thuẫn với kết luận vòng 1**
6. **Kế hoạch thi hành xếp theo thứ tự phụ thuộc** — cái nào phải xong trước cái nào, cái nào
   không lùi được
7. **Danh sách câu hỏi còn mở** — chia rõ: *suy được từ dữ liệu* / *phải hỏi xưởng* / *dữ liệu
   tự mâu thuẫn*

---

## 7. Tiêu chí xong

Vòng 2 xong khi trả lời được: **"Nhận một đơn hàng thật, chạy hết từ báo giá → đơn → mua vật tư
→ nhập kho → sản xuất → xuất kho → hoá đơn → công nợ, thì danh mục thiếu chỗ nào?"**

Câu trả lời phải là một danh sách có số, không phải một lời trấn an.
