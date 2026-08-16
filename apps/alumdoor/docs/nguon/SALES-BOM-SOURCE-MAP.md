# Alumdoor Sales / Master / BOM — Source Map cho Agent

Mục đích: cho agent đọc nhanh đúng nguồn khi audit hoặc triển khai luồng **Danh mục Master → Bán hàng → công thức kích thước → BOM → sản xuất → cắt/tồn nhôm** của Alumdoor.

> Đây là **bản đồ nguồn + tóm tắt trích xuất**, không thay thế raw extract. Khi có mâu thuẫn, không tự hòa giải bằng trí nhớ. Đọc raw extract trước, sau đó đọc `server/briefs/alumdoor-v2.json` để biết quyết định dự án hiện hành đối với các điểm đã được chốt.

## 1. Bộ nguồn đối chiếu ngày 2026-08-16

Các file người dùng cung cấp trong phiên audit này:

| File nguồn | SHA-256 |
|---|---|
| `TỒN NHÔM 2026 NEW (1).xlsx` | `c2e6c8fa2a64dd36ba8ec3f8f64926acfc72529ef609f737efd00e077ca2e20c` |
| `25.7 QUY TRÌNH (2).docx` | `0397a208844ed5c8ad6ac75de48693582aa9e0a40b2086a5f3fc24b9ac250228` |
| `QUY CÁCH  (3).xlsx` | `37423d7702c9bf44fb3078ae69776c603072367c469a3bb134c0831c65fc1a32` |
| `MS LIÊN BS(1).xlsx` | `64820a840aa22d763875930d13095076a2a3f33d9fa7027e3263d8a7d4ee2e41` |

Raw extract hiện nằm tại `apps/alumdoor/docs/nguon/`. Mục lục đầy đủ: `00-MUC-LUC.md`. Script sinh extract: `apps/alumdoor/tools/trich-nguon.py`.

## 2. Đường đọc nhanh cho scope Sales / Master / BOM

Đọc theo thứ tự này:

1. `quy-cach/CT-TT-SX.md` — công thức sản xuất, mua vào, bán ra theo loại cửa.
2. `quy-cach/ĐƠN-GIÁ-TRỌN-BỘ.md` — trọn bộ / tách món và các dòng tự phát sinh.
3. `quy-cach/MS.md` — màu sơn tĩnh điện, mạ màu và nhóm sản phẩm áp dụng.
4. `ms-lien/GHI-CHÚ.md` — bản lá, công thức chia lá, quan hệ kích thước phủ bì/lọt lòng/rộng cắt.
5. `ms-lien/ĐM.md` — dữ liệu định mức, mã vật tư, thành phẩm, đơn vị, hệ số và công thức tính.
6. `quy-trinh-van-ban.md` — quy trình Sales → kế toán → lịch/đơn sản xuất → cắt nhôm → sơn → xuất kho; công thức riêng cho Đức/Úc/Đài Loan.
7. `ton-nhom/*.md` — snapshot tồn theo mã nhôm, khẩu độ, màu, số lá và thao tác cắt/hoàn.
8. `ton-nhom/LỊCH-SỬ.md` — lịch sử nhập/cắt/hoàn theo chứng từ.
9. `ANH-DA-CHEP.md` và các PDF/ảnh được liệt kê trong `00-MUC-LUC.md` — chỉ dùng khi raw text không đủ hoặc cần đối chiếu hình.

Sau khi đọc nguồn, đọc `server/briefs/alumdoor-v2.json` để lấy **quyết định dự án** đối với các điểm nguồn mâu thuẫn.

## 3. Luồng nghiệp vụ được nguồn mô tả

`25.7 QUY TRÌNH (2).docx` mô tả luồng sơ bộ:

```text
Sales tạo đơn hàng
  → Kế toán nhận đơn
  → Theo dõi đơn hàng - xuất hàng
  → phân bổ theo nhóm sản phẩm
      → đơn hàng sản xuất
      → lịch sản xuất
      → chi tiết sơn nếu vật tư/màu liên quan là THÔ
  → phiếu xuất kho
  → trừ định mức vật tư / cập nhật theo dõi
```

Nhóm sản xuất được nêu trong nguồn gồm: **ĐỨC, ÚC, ĐÀI LOAN, LƯỚI, SIÊU TRƯỜNG**. Một số chứng từ có nhiều loại cửa có thể được tách sang nhiều đơn/sheet sản xuất khác nhau.

Nguồn cũng nêu việc lịch sản xuất phải theo dõi ngày đặt, ngày giao, ngày sản xuất, khách hàng, nhóm sản phẩm, tên sản phẩm, cao/rộng, diện tích, thời gian sản xuất, bộ phận phụ trách, tăng ca và định mức công việc.

## 4. Công thức chiều rộng và tính tiền từ `QUY CÁCH / CT TT-SX`

Giữ nguyên thuật ngữ nguồn:

| Loại cửa | Rộng cắt lá | Bán ra Đại lý | Bán ra Khách lẻ |
|---|---|---|---|
| CỬA ĐỨC | `Rộng PB ray - 0.08` hoặc `Rộng PB nhựa - 0.02` | `Cao PB × Rộng PB nhựa` | `Cao PB × Rộng PB ray` |
| CỬA ÚC | `Rộng PB ray - 0.03` | `Cao PB × Rộng PB ray` | `Cao PB × Rộng PB ray` |
| CỬA LƯỚI | thường `Rộng PB ray - 0.03`; nếu có lá Đài Loan có bắn bướm: `- 0.035` | tách món/chỉ lưới: `Cao PB × Rộng cắt lá`; trọn bộ: `Cao PB × Rộng PB ray` | `Cao PB × Rộng PB ray` |
| CỬA ĐÀI LOAN | nguồn ghi cùng nhóm rule `-0.03`; trường hợp có lá Đài Loan/bắn bướm ghi `-0.035` | tách món/chỉ lá: `Cao PB × Rộng cắt lá`; trọn bộ hoặc Đài Loan kéo tay: `Cao PB × Rộng PB ray` | `Cao PB × Rộng PB ray` |
| CỬA SIÊU TRƯỜNG | nguồn ghi `Rộng PB ray - 0.03`, và nhánh `-0.035` tương tự | `Cao PB × Rộng cắt lá` | `Cao PB × Rộng PB ray` |

Không rút gọn các nhánh này thành một công thức chung nếu chưa có rule/priority rõ ràng.

## 5. Trọn bộ / tách món từ `QUY CÁCH / ĐƠN GIÁ TRỌN BỘ`

### Cửa Đức

- Có `ĐƠN GIÁ CHỈ LÁ (MUA TÁCH MÓN)`.
- Có `ĐƠN GIÁ TẶNG RAY`.
- Khi chọn tặng ray, nguồn ghi sinh thêm ray hộp TD với chiều dài `Cao PB - 0.2`, số lượng 2 cây; áp dụng cửa diện tích trên 10 m²; cột đơn giá ray bị khóa.

### Cửa Úc

Khi chọn trọn bộ, nguồn ghi phát sinh:

- dòng cửa theo kích thước;
- ray sắt U70 không ron: `Cao PB - 0.1`, số lượng 2 cây;
- `Giá T`, số lượng 1 cặp;
- các dòng phụ được khóa đơn giá theo mô tả nguồn.

### Cửa Đài Loan

Trọn bộ phát sinh các cấu phần được mô tả:

- cửa Đài Loan theo kích thước;
- ray sắt U70 có ron: `Cao PB - 0.1`;
- V4: `Rộng PB ray - 0.03`;
- trục 114-1ly8: `Rộng PB ray - 0.05`.

Tách món: nguồn ghi **“mua gì tự chọn cái đó”**.

### Cửa Lưới

Nguồn phân biệt tách món và trọn bộ. Trọn bộ mô tả việc phát sinh lá Đài Loan, lưới, ray U70, V4 và trục theo công thức tương ứng; giá trọn bộ tính trên tổng diện tích các phần được mô tả trong sheet.

### Cửa Siêu Trường

Nguồn ghi nhánh `ĐƠN GIÁ CHỈ LÁ (MUA TÁCH MÓN)` và “mua gì tự chọn cái đó”.

**Lưu ý cho agent:** `trọn bộ / chỉ lá / tách món` trong nguồn đang quyết định **phạm vi cấu phần được giao/sinh ra**, không được mặc định đồng nhất với một danh mục “cách bán” hay với chính sách giá khách hàng.

## 6. Master màu từ `QUY CÁCH / MS`

### Sơn tĩnh điện (STĐ)

Nguồn liệt kê: `CAFÉ`, `XANH NGỌC`, `MIDNIGHT BLUE`, `TRẮNG`, `XÁM MỜ`, `VÀNG KEM`, `GHI SẦN`, `NÂU XINGFA`, `XÁM XINGFA`, `ĐEN XINGFA`, `VÀNG KEM BÓNG`, `XANH NGỌC BÓNG`, `XANH LÁ CÂY`, `XÁM LÔNG CHUỘT`, `CAM`, `ĐỎ ĐÔ`, `KEM SỮA`, `XANH DƯƠNG`.

Nhóm áp dụng trong nguồn: cửa CN Đức, Úc, Siêu Trường, Đài Loan, Lưới và phụ kiện cần sơn tĩnh điện.

### Mạ màu (MM)

Nguồn liệt kê các cặp: `XANH NGỌC - VÀNG KEM`, `XÁM - TRẮNG`, `GHI ÚC - KEM ÚC`, `XANH RÊU - CAFÉ`, `XÁM - XANH NGỌC`; phạm vi áp dụng được ghi theo cửa Úc/Đài Loan.

## 7. Bản lá và công thức từ `MS LIÊN BS / GHI CHÚ`

Bản lá nguồn đang ghi:

| Mã | Bản lá (m) |
|---|---:|
| AL71C | 0.055 |
| AL71N | 0.057 |
| AL70 | 0.068 |
| AL75N | 0.067 |
| AL75C | 0.068 |
| AL503C | 0.050 |
| AL503N | 0.055 |
| AL548C | 0.050 |
| AL548N | 0.055 |
| AL501C | 0.050 |
| AL501N | 0.057 |
| AL552C | 0.050 |
| AL552N | 0.057 |
| AL595 | 0.060 |
| AL652C | 0.050 |
| AL752C | 0.050 |
| AL50C | 0.050 |
| AL50N | 0.055 |
| ALVIP50C | 0.050 |
| ALVIP50N | 0.055 |
| VIPST500N | 0.053 |
| VIPST500C | 0.050 |
| VIPST700 | 0.050 |

Sheet nguồn chủ yếu ghi công thức chia lá dạng `(CPB - 130) / bản lá - 1 LÁ`; riêng các dòng/ảnh đặc thù phải đối chiếu thêm `quy-trinh-van-ban.md`, PDF công thức chia lá và `ANH-DA-CHEP.md` trước khi code.

Các quan hệ kích thước khác được nguồn ghi gồm, ví dụ:

- Cửa Đức: `CPB = CLL + 0.5`; `RPBR U75 = RLL + 0.15`; `RPBN = RPBR U75 - 0.06`; `RPBN = RLL + 0.09`; `RPBN = RCL + 0.02`.
- Ray U100 trong nhóm Đức: `RPBR U100 = RLL + 0.2`; `RPBN = RPBR U100 - 0.07`.
- Cửa Úc: `CPB = CLL + 0.5`; `RPBR = RCL + 0.03`; `RPBR = RLL + 0.14`; với U100 có `RPBR U100 = RLL + 0.2`.
- Đài Loan + Lưới: nguồn ghi `Tính tiền = CPB × RCL; mua cả bộ tính RPBR`, `CPB = CLL + 0.5`, `RCL = RPBR - 0.03`, `RCL = RLL + 0.11`; có thêm nhánh U100 trong raw extract.

## 8. Các rule sản xuất quan trọng từ `quy-trinh-van-ban.md`

### Cửa Đức

Nguồn mô tả:

1. từ tên SP/vật tư và kích thước khách đặt → quy ra rộng cắt lá;
2. tính số lá ruột;
3. tìm trong tồn nhôm theo tên SP, khẩu độ gần phù hợp và màu;
4. chọn vật tư để sản xuất;
5. cắt/trừ tồn và nhập lại phần dư;
6. nếu vật tư chọn có màu `THÔ` thì chuyển sang theo dõi sơn.

Ví dụ nguồn: `AL548 ... Cpb 3m ...` dùng công thức `((Cao PB - 130) / bản lá) - 1`; ví dụ ra `51 lá ruột + 1 lá đầu + 3 lá đáy`.

### Cửa Úc

Nguồn có ba công thức số lá theo kiểu cửa:

- motor trong và kéo tay: `(Cao PB / 0.465) + 2`;
- motor ngoài không tự dừng: `(Cao PB / 0.465) + 1.5`;
- motor ngoài có tự dừng: `(Cao PB / 0.465) + 1.3`.

Sau đó có rule làm tròn theo phần mười thành các mức `0`, `0.3`, `0.7`, `1` như mô tả trong tài liệu. Rộng cắt lá nguồn ghi `Rộng PB ray - 0.03`.

### Đức kéo tay / AL70 1 lớp - 2 lớp

Nguồn mô tả tổng số lá theo `(Cao PB - 0.13) / 0.068`, rồi phân bổ giữa `AL70 (2 LỚP)` và `AL70 (1 LỚP)` tùy trường hợp. Ví dụ có khóa ngang + 3 hàng lỗ thoáng thì tài liệu cho `38` lá 2 lớp và `4` lá 1 lớp.

Rộng cắt lá trong phần này lại phụ thuộc loại ray:

- ray sắt U70 không ron: `Rộng PB ray - 0.05`;
- ray hộp U76 hoặc ray đơn U76: `Rộng PB ray - 0.08`.

### Cửa Đài Loan

Nguồn mô tả cột số lá theo `Cao PB × 13` và một luật làm tròn riêng; có ví dụ tách `lá ruột + 1 lá đáy`.

## 9. `MS LIÊN BS / ĐM` là dữ liệu BOM-like, chưa phải schema BOM chuẩn

Các cột nguồn đáng đọc nhất:

- `TÊN VẬT TƯ`
- `MÃ VẬT TƯ (DK ĐÚNG ĐỂ TRỪ VT)`
- `TÊN THÀNH PHẨM`
- `ĐVT`
- `Định mức`
- `Giá bán`
- `CÔNG THỨC TÍNH`

Ví dụ `CON LĂN` có dòng thành phẩm và các dòng thành phần như `CỤC NHỰA`, `BÁT SẮT`, `BÙ LON 12x12`, `CON TÁN 12`, `BẠC ĐẠN`, với định mức/hệ số riêng.

Các nhóm cửa cũng có nhiều dòng thành phần gắn cùng `TÊN THÀNH PHẨM` (lá, ron, bọ, vít, puly...).

**Kết luận audit, không phải raw fact:** cấu trúc này có thể dùng làm nguồn migrate sang `BOM Template / BOM Component Rule`, nhưng không nên bê nguyên công thức tồn/kế toán của sheet vào BOM engine.

## 10. Tồn nhôm là stock-piece / cut-allocation source, không phải BOM source

Các sheet mã nhôm (`AL548`, `AL70 - 1 LỚP`, `AL70 - 2 LỚP`, ...), `RAY`, `BỘ BA LÁ ĐÁY + LÁ ĐẦU` dùng cấu trúc kiểu:

- ngày nhập nhôm;
- loại / màu;
- khổ (m);
- số lá;
- hàng lấy cắt;
- màu sắc sơn;
- khổ hoàn / số lá hoàn;
- ngày nhập lại;
- theo dõi tồn;
- chọn cắt;
- LM/PHẾ;
- số kg tổng;
- ghi chú.

Một số sheet có công thức trạng thái kiểu:

- `HẾT` nếu khổ nhỏ hơn `0.2` hoặc số lá bằng 0;
- `SẮP HẾT` nếu khổ còn đủ nhưng số lá dưới ngưỡng sheet;
- `PHẾ` nếu khổ nhỏ hơn `0.15`.

`ton-nhom/LỊCH-SỬ.md` có các trường: nhập/xuất, ngày, loại, màu, tình trạng, khổ, số lá, cắt khổ, số lá cắt, khổ dư, số lá dư, khách hàng, ngày nhập, số chứng từ, hoàn lại, lý do, mã thao tác, sheet nguồn, ghi chú lỗi, chi tiết dòng gốc, dư.

**Kết luận audit, không phải raw fact:** BOM nên nói “cần vật tư/kích thước bao nhiêu”; bước allocation mới chọn lô/cây/lá tồn thực tế để cắt. Không để BOM phụ thuộc trực tiếp vào một dòng tồn cụ thể.

## 11. Điểm nguồn còn mâu thuẫn / câu hỏi mở

Không tự sửa hoặc lấp khoảng trống trong raw extract.

Các điểm nổi bật:

- AL70 có mâu thuẫn giữa công thức `-1` và các ví dụ tổng 42 lá.
- AL71N có giá trị bản lá khác nhau giữa một số nguồn/evidence.
- Ý nghĩa `MỚI/CŨ` trong tồn cần phân biệt với đời/mã sản phẩm và trạng thái vật tư.
- File tồn nhôm không có cột kho rõ ràng.
- Tài liệu quy trình kết thúc bằng câu hỏi: nếu khách **chỉ lấy lá ruột hoặc chỉ phụ kiện, không lấy hoàn thiện**, đơn sản xuất phải hiểu thế nào.

Quyết định dự án hiện hành cho các điểm đã chốt nằm trong `server/briefs/alumdoor-v2.json`. Agent phải nêu rõ khi đang dùng **raw source** hay **project resolution**.

## 12. Hướng audit/thiết kế đang dùng cho Sales → BOM

Phần này là **working architecture**, không phải nội dung nguyên văn của các file nguồn:

```text
Product / Item / Color / UOM / Rules Master
        ↓
Sales Product Configuration
        ↓
Geometry / Measurement Rules
        ↓
Calculated Configuration
        ↓
BOM Template + Conditional Component Rules
        ↓
BOM Instance / Material Requirement
        ↓
Routing (bao gồm sơn khi cần)
        ↓
Stock Piece / Lot Allocation
        ↓
Cut Order / Production
```

Guardrail:

- Form Sales chọn cấu hình sản phẩm, không bắt Sales chọn lô tồn nhôm.
- `trọn bộ / tách món / chỉ lá / chỉ phụ kiện` phải được biểu diễn như phạm vi cấu phần/obligation rõ ràng; không được ngầm biến thành logic giá hoặc hard-code UI.
- Geometry rule tách khỏi BOM component rule.
- Pricing rule tách khỏi BOM/stock allocation.
- Khi chốt báo giá/đơn hàng phải giữ snapshot số đo/cấu hình/rule đủ để đơn cũ không đổi theo master mới.
- Stock/Finance authority vẫn đi qua shared Forge authorities; vertical Alumdoor không fork ledger.

## 13. Khi agent chuẩn bị sửa code

Checklist đọc nguồn tối thiểu:

- [ ] Đọc `00-MUC-LUC.md`.
- [ ] Đọc `SALES-BOM-SOURCE-MAP.md` này.
- [ ] Mở raw extract đúng loại cửa/rule đang sửa.
- [ ] Đối chiếu `server/briefs/alumdoor-v2.json` nếu source có conflict.
- [ ] Không dùng row tồn hiện tại làm định nghĩa BOM.
- [ ] Không hard-code một công thức dùng chung khi nguồn có nhánh theo cửa/ray/khách/trọn bộ-tách món.
- [ ] Nếu chưa có nguồn hỗ trợ, đánh dấu unknown/open question thay vì tự bịa rule.
