# PHƯƠNG ÁN AUDIT TỪNG TẦNG — Alumdoor

Lập ngày 22/08/2026. Trạng thái nền: cổng nhập `NO-GO`, 852 blocker.

---

## 1. Vì sao cổng hiện tại chưa đủ

Cổng `audit-alumdoor-import-gate-local.mjs` là cổng **an toàn khi ghi**: nó
chặn không cho ghi đè lên dữ liệu chưa rõ nguồn. Nó không phải cổng **đúng
nghiệp vụ**. Ba giới hạn cần biết rõ:

1. **Nó đọc file, không đọc D1** ở phần định mức. `bom_rule_pending` lấy thẳng
   `rows_pending` trong `local-imports/alumdoor-bom-rules/alumdoor-bom-rules-audit.json`
   — một file tĩnh. Viết bao nhiêu BOM Rule vào D1 con số đó cũng đứng yên ở
   643. Đây là lý do đợt vừa rồi ghi 31 luật mà cổng không nhúc nhích.
2. **Nó đếm, không đối chiếu.** Nó biết "có 213 BOM", không biết 213 BOM đó
   thiếu 51 mã bán, cũng không biết một luật cắt V4 ghi −0,05 trong khi bảng
   chuẩn nói −0,03.
3. **Nó không chạy thử.** Không có bước nào nạp một bộ số đo cửa thật vào engine
   xem ra kết quả gì.

Đối chiếu với thực tế: **cả ba lỗi nặng nhất của đợt vừa rồi đều lọt cổng.**

| Lỗi | Thiệt hại | Cổng báo? |
|---|---|---|
| Tách nhóm sai vì tên lệch một dấu gạch | mất 90% BOM (1/227 thay vì 176/227) | không |
| Luật V4 lấy nhầm công thức của trục | sai kích thước cắt 2cm × mọi cửa | không |
| Cột I của sheet ĐM bị bỏ qua hoàn toàn | mất toàn bộ 87 công thức | không |

Cả ba chỉ lộ ra khi **đem tầng này soi vào tầng kia**. Đó là cốt lõi của phương
án dưới đây.

---

## 2. Nguyên tắc: mỗi tầng ba câu hỏi

| | Câu hỏi | Cách trả lời |
|---|---|---|
| **ĐỦ** | Có thiếu bản ghi nào không? | đếm và so với danh sách kỳ vọng |
| **ĐÚNG** | Bản ghi có khớp nguồn / khớp tầng dưới không? | đối chiếu chéo |
| **CHẠY** | Nạp dữ liệu thật vào có ra số đúng không? | gọi engine, so kết quả |

Cổng hiện có trả lời được **ĐỦ**, một phần **ĐÚNG**, và không trả lời **CHẠY**.
Phải bổ sung đủ ba cho từng tầng.

---

## 3. Bảy tầng

### Tầng 0 — Nguồn (3 file Excel)

Đối tượng: `MS LIÊN BS.xlsx` · `QUY CÁCH (3).xlsx` · `danh mục sản phẩm.xlsx`

| | |
|---|---|
| ĐỦ | hash 3 file khớp hằng số trong cổng — **đang đạt** |
| ĐÚNG | 10 ô lỗi công thức (`#REF!`/`#VALUE!`), 6 ô tự mâu thuẫn, 5 khoảng trống vòng đời |
| CHẠY | trích lại toàn bộ, đếm dòng/cột phải trùng lần trích trước |

Đạt khi: 21 điểm trên về 0. **Cần chủ xưởng sửa file gốc — tôi không tự đoán được.**

---

### Tầng 1 — Danh mục nền ⚠ ƯU TIÊN CAO NHẤT

Đối tượng: Item (404) · Item Group (21/31) · Item Color (25/47) · UOM (19/18) ·
Warehouse (6/7) · Geometry Field (11/9) · Bậc diện tích (11/9)

**Vấn đề gốc: hai tầng lưu song song, hai bộ từ vựng.**

```
Geometry Field   doc: CAO-PB  RONG-PB-RAY  RONG-PB-NHUA  CAO-LOT-LONG  RONG-LOT-LONG …
                 mas: PB_CAO  PB_RAY_RONG  PB_NHUA_RONG  RAY_DAI  CAT_LA_RONG …
                 → trùng tên: 0/11
Bậc diện tích    doc: DT-DUOI-4M2  DT-TREN-4M2  DT-3-4M2  DT-4-5M2 …
                 mas: BAC-3-4  BAC-4-5  BAC-5-6 …
                 → trùng tên: 1/11
```

Engine có bảng alias (`GEOMETRY_FIELD_ALIASES` trong `geometry-policy.ts`) nên
chạy không lỗi. Nhưng chưa ai chốt bộ nào là chính chủ, mà **bản `documents`
giữ 2 trường lọt lòng mà bản master không có** — đúng hai trường cần cho việc
quy đổi lọt lòng → phủ bì còn treo. Bên `Bậc diện tích` thì bản `documents` có
cả `DT-DUOI-4M2` lẫn `DT-TREN-4M2` chồng lên `DT-4-5M2`: nghi vấn bậc chồng bậc.

| | |
|---|---|
| ĐỦ | 34 tham chiếu treo (mã Item cho BOM Template), 5 mã chết còn bị trỏ |
| ĐÚNG | 9 xung đột hai tầng · 22 Item Color thừa · 11 Item Group thừa · trùng tên khác mã (`TON_DLM_8D_K124`/`LA_DLK_8D`, `LA_DLK_1_2LY`/`LA_DLK_1_2LY_K175`) · màu "XANH LÁ CÂY" chủ xưởng nói không có nhưng D1 và QUY CÁCH đều có |
| CHẠY | mở 1 form nhập liệu, kiểm ô Link nào đổ ra danh sách của tầng nào |

Đạt khi: mỗi loại chỉ còn **một** tầng chính chủ, tầng kia hoặc xoá hoặc thành
alias có khai báo; 0 tham chiếu treo.

**Không có tầng này sạch thì audit tầng trên đều vô nghĩa** — vì không biết đang
soi vào bản nào.

---

### Tầng 2 — Đơn vị & quy đổi

Đối tượng: `uom_conversions`, ĐVT mặc định trên Item

| | |
|---|---|
| ĐỦ | 72 Item thiếu ĐVT mặc định |
| ĐÚNG | 49 hệ số sai/bằng 0: **17 đã có đề xuất chờ duyệt** · 2 mâu thuẫn (V4 1,312 hay 1,464?) · 33 chưa có số |
| CHẠY | với mỗi mã mua-kg-bán-mét: đổi xuôi rồi đổi ngược phải về đúng số cũ |

Đạt khi: mọi mã có ≥2 ĐVT đều có hệ số ≠ 0 và đúng 1 ĐVT mặc định.
**33 hệ số phải cân thực tế ngoài xưởng.**

---

### Tầng 3 — Hình học

Đối tượng: Geometry Profile (5) · Cutting Policy (8) · Measurement Profile (9/7)
· `alumdoor-cutting-policy-catalog.mjs` (6 bộ / 18 luật)

| | |
|---|---|
| ĐỦ | mỗi bộ quy cách: mọi trường `CALCULATED` phải có ít nhất 1 luật; thiếu luật lọt lòng → phủ bì (đã cất ở `GO-BO-cutting-policy-geometry-profile-documents.json`) |
| ĐÚNG | không được có 2 luật cùng mức ưu tiên cho một trường (engine sẽ ném lỗi, không đoán) |
| CHẠY | **ma trận ngữ cảnh**: {Đại lý, Lẻ} × {U70, U75, U76, U100} × {có/không bọ bướm} = 16 tổ hợp, nạp một bộ số đo thật, in ra bảng kết quả để chủ xưởng gật đầu từng ô |

Đạt khi: 16/16 tổ hợp ra số, và số đó khớp cách thợ đang cắt ngoài xưởng.

Đây là tầng **bắt buộc phải chạy thử**, không đọc mắt được. Bảng 16 dòng đó là
thứ chủ xưởng xác nhận nhanh nhất.

---

### Tầng 4 — Định mức

Đối tượng: Bill of Materials (213, 1.085 dòng) · BOM Rule (36) · BOM Template (5)

| | |
|---|---|
| ĐỦ | phủ 176/227 mã bán → **51 mã chưa có BOM** (8 mã thật sự không có trong nguồn: nhóm Siêu Trường, `CLUOI_LUOI_SNPHI19_INOX_TM`, `LA_DLK_1_1LY`, `LA_RUOT_AL71N`) |
| ĐÚNG | mỗi BOM phải đủ **họ cấu kiện bắt buộc** theo dòng cửa (cửa Đài Loan thiếu ray là sai chắc chắn, không cần chủ xưởng xác nhận); mỗi dòng phải có luật số lượng, không được để trống |
| CHẠY | dựng thử BOM cho 1 đơn cụ thể: ra danh sách cấu kiện + số lượng + kích thước cắt |

Đạt khi: 219/227 có BOM (trừ 8 mã nguồn không có), 0 dòng không có luật, và
bảng dựng thử đọc lên nghe hợp lý.

**Kiểm tra rẻ tiền mà bắt được nhiều lỗi nhất:** lập ma trận *dòng cửa × họ cấu
kiện*, ô nào trống thì soi. Chính kiểu này lộ ra vụ mất 90% BOM.

---

### Tầng 5 — Giá

Đối tượng: Item Price (304) · Pricing Rule (89) · Price List (1) · Bậc diện tích

| | |
|---|---|
| ĐỦ | mã bán nào chưa có giá cho đủ bậc diện tích × màu |
| ĐÚNG | 16 giá còn cắm cờ `TAM_CHUA_CHOT`; bậc diện tích chồng nhau (xem tầng 1) |
| CHẠY | báo 3 đơn thật, so với báo giá xưởng đã gửi khách |

Đạt khi: 0 giá tạm, các bậc phủ kín và không chồng nhau, 3 đơn thử khớp.

---

### Tầng 6 — Chứng từ & vận hành

Đối tượng: Sales Order (35) · Quotation · Delivery Note · Stock Entry · Payment

| | |
|---|---|
| ĐỦ | `PRAGMA foreign_key_check` = 0 — **đang đạt** |
| ĐÚNG | chứng từ cũ còn trỏ tới master đã đổi tên/xoá (đợt trước đã dính: `DH-2026-0068` và `PXK-2026-0009` trỏ Cutting Policy đã xoá) |
| CHẠY | đi trọn một vòng: báo giá → đơn → lệnh sản xuất → xuất kho → hoá đơn |

Đạt khi: vòng đó chạy hết không kẹt.

---

## 4. Đối chiếu chéo — nơi lỗi thật sự ẩn

Sáu phép này quan trọng hơn cả sáu tầng ở trên, vì lỗi trong tầng thì đếm ra
được, còn lỗi *giữa* hai tầng thì mỗi bên nhìn riêng đều thấy bình thường.

| Cặp | Soi cái gì | Đã từng bắt được |
|---|---|---|
| 0 ↔ 1 | mỗi tên vật tư trong ĐM ánh xạ đúng 1 mã D1 | lỗi thứ tự chữ "RAY SẮT (CÓ RON) U70" vs "RAY SẮT U70 (CÓ RON)" |
| 1 ↔ 4 | BOM chỉ được trỏ mã còn sống | 71 tham chiếu mã chết |
| **3 ↔ 4** | **luật BOM Rule phải khớp bảng cắt chuẩn** | **V4 ghi −0,05 đáng lẽ −0,03** |
| 2 ↔ 4 | dòng BOM ĐVT kg phải có hệ số quy đổi | hệ số cân bị đọc nhầm thành số lượng |
| 4 ↔ 5 | mã có BOM mà không giá, và ngược lại | chưa soi |
| 1 ↔ 6 | chứng từ trỏ master đã xoá | 2 chứng từ chết |

Cặp 3↔4 nên chạy **tự động sau mỗi lần sửa luật**, vì nó rẻ và đã bắt được lỗi thật.

---

## 5. Thứ tự thi công

Từ dưới lên. Tầng dưới chưa chốt thì tầng trên có sửa cũng phải làm lại.

**Đợt A — nền móng (làm được ngay, không cần chủ xưởng)**
1. Tầng 1: chốt tầng chính chủ cho Geometry Field và Bậc diện tích
2. Tầng 1: dọn trùng tên khác mã, gỡ 34 tham chiếu treo
3. Đối chiếu 1↔4 và 3↔4, chạy lại sau mỗi lần sửa

**Đợt B — cần chủ xưởng ngồi cùng ~1 buổi**
4. Tầng 3: bảng 16 tổ hợp ngữ cảnh → gật/lắc từng ô
5. Tầng 4: ma trận dòng cửa × họ cấu kiện → chỉ ra ô trống nào là thiếu thật
6. Tầng 2: 17 hệ số đã đề xuất → duyệt; 2 hệ số mâu thuẫn → chốt

**Đợt C — cần số liệu mới từ xưởng**
7. 33 hệ số quy đổi chưa có → cân thực tế
8. 16 giá tạm → chốt giá
9. Tầng 0: sửa 21 điểm hỏng trong file Excel gốc
10. Tầng 6: chạy trọn một vòng chứng từ

---

## 6. Sản phẩm giao

Mỗi tầng một script chỉ đọc, không ghi, đặt tại `server/scripts/audit/`:

```
audit-tang1-danh-muc.mjs      → work/audit/tang1.json
audit-tang2-quy-doi.mjs       → work/audit/tang2.json
audit-tang3-hinh-hoc.mjs      → work/audit/tang3.json   (có chạy engine)
audit-tang4-dinh-muc.mjs      → work/audit/tang4.json
audit-tang5-gia.mjs           → work/audit/tang5.json
audit-tang6-chung-tu.mjs      → work/audit/tang6.json
audit-doi-chieu-cheo.mjs      → work/audit/cheo.json
audit-tong-hop.mjs            → work/audit/BAO-CAO.md
```

Ràng buộc bắt buộc, theo đúng khuôn cổng hiện có:
mở SQLite `readOnly: true` · từ chối mọi cờ `--apply/--fix/--import` · mỗi phát
hiện phải kèm **bằng chứng dẫn được về tận dòng nguồn** (tên file · sheet · số
dòng), không nhận kết luận không có dẫn chứng.

Báo cáo tổng in ra một bảng: 7 tầng × 3 cột ĐỦ/ĐÚNG/CHẠY, mỗi ô một con số và
màu. Nhìn một cái biết đang kẹt ở đâu.

---

## 7. Ước lượng

| Việc | Ai làm | Thời gian |
|---|---|---|
| Viết 8 script audit | tôi | 1 ngày |
| Đợt A | tôi | 1 ngày |
| Đợt B | tôi + chủ xưởng | 1 buổi ngồi cùng |
| Đợt C | xưởng cân/chốt số | tuỳ xưởng |

Đợt A + B xong thì cổng còn lại chủ yếu là các con số chờ chủ xưởng điền, không
còn lỗi cấu trúc.
