# ALUMDOOR V2 — PHA 1: INTAKE & NGHIÊN CỨU

> Lập 2026-07-29. Quy trình: kỷ luật cổng chặn của skill `app-factory` (`C:\AppWeb`), kiến trúc
> **Forge** (brief JSON → biên dịch → cài). Tiền lệ: `ALUMDOOR-MUA-HANG-THIET-KE.md` §đầu file.
>
> **Bối cảnh chốt với chủ xưởng:** bản `alumdoor@1.26.2` hiện tại **nhiều lỗ hổng**; bản V2 sinh ra để
> **thay thế hoàn toàn** nó. Bản cũ chỉ còn giá trị **nguồn tham chiếu**. Tenant `alu` đã được chủ xưởng
> **cố ý xoá sạch dữ liệu nghiệp vụ** để làm lại — xác minh 2026-07-29: `documents`=0, `versions`=0,
> `master_records`=49 (chỉ fixture), `doctype_definitions`=234 (schema còn). ⇒ **KHÔNG có gánh nặng di trú
> mã cũ.** Dữ liệu nạp lại từ file Excel gốc, áp thẳng quy ước mã mới (`ALUMDOOR-QUY-UOC-MA.md`).

---

## 1. Bài toán — 4 dòng

Xưởng cửa cuốn Alumdoor (Công ty TNHH International Aluminum Application, Bình Tân, TP.HCM) mua nhôm
**cây** theo **kg thực cân**, cắt thành **lá** theo công thức riêng từng dòng cửa, sơn (thuê ngoài Hải Kỳ
hoặc lò nhà), lắp thành **bộ** cửa bán theo **m²**.

Bài toán lõi: **một cây nhôm mang bốn con số cùng lúc — kg, khổ, số cây/lá, tiền — và mọi cách quản lý
hiện có chỉ giữ được một hoặc hai.** Hệ quả dây chuyền: sổ kho và sổ kế toán không bao giờ khớp, không ai
trả lời được câu "còn bán được bao nhiêu", và đầu thừa cắt xong thì biến mất khỏi mọi bảng.

---

## 2. Nhật ký tra cứu — 18 nguồn / 5 lớp

### Lớp 1 — Nghiệp vụ bản địa

| Nguồn | Sự thật rút ra |
|---|---|
| [phanmemviet.com.vn — Quản lý kho nhôm, kính và phụ kiện](https://phanmemviet.com.vn/blog/hoat-dong-su-kien/quan-ly-kho-nhom-kinh-va-phu-kien-thach-thuc-lon-cua-nhieu-xuong-hien-nay) | Xưởng nhôm kính phần lớn vẫn quản bằng sổ tay + Excel rời. Đặc thù ngành: nhiều loại vật tư, nhiều kích thước, đơn theo công trình, công nợ thường xuyên → thất thoát vật tư và "lẫn giá" là hai hỏng phổ biến nhất |
| [kiotsoft.com — PM bán hàng nhôm kính](https://kiotsoft.com/phan-mem-quan-ly-ban-hang-nhom-kinh/) | Thị trường VN đã có phần mềm dọc ngành nhôm kính — nhưng nghiêng bán lẻ/báo giá, không giải bài toán cắt–đầu thừa |
| [itgtechnology.vn — quản lý kho theo vị trí](https://itgtechnology.vn/ung-dung-phan-mem-quan-ly-kho-theo-vi-tri-tiet-kiem-thoi-gian-nhan-luc-kho/) | Quản theo **vị trí** là chuẩn mong đợi của kho VN; xưởng Alumdoor mới có K36/K12, chưa có vị trí trong kho |
| [nhanh.vn — top PM quản lý kho 2026](https://nhanh.vn/top-17-phan-mem-quan-ly-kho-mien-phidung-thu-de-dung-nam-2026-n113505.html) | Mặt bằng tính năng thị trường: N-X-T, lô/date, nhiều kho, kiểm kê, báo cáo — app không có kiểm kê là dưới chuẩn thị trường |

### Lớp 2 — Pháp lý & chuẩn kế toán

> ⚠️ **SỬA 2026-07-30 — lớp này ban đầu tra NHẦM văn bản.** Em trích Thông tư 200/2014/TT-BTC, nhưng
> **Thông tư 99/2025/TT-BTC đã THAY nó, hiệu lực 01/01/2026** — tức đã chạy được 7 tháng khi viết tài
> liệu này. Chủ xưởng chỉ ra chỗ sai.
>
> **Kết luận nghiệp vụ KHÔNG đổi** (đã kiểm lại): TT99 giữ nguyên ba phương pháp *đích danh · bình quân
> gia quyền · nhập trước xuất trước*, và vẫn cho **áp phương pháp KHÁC NHAU cho từng loại vật tư** — đúng
> cái V2 cần (nhôm đích danh theo lô, phụ kiện bình quân). TT99 còn siết thêm: phải **nhất quán giữa các
> kỳ kế toán** trừ khi đổi chính sách kế toán, nên `valuation_method` đổi giữa chừng phải ghi audit.
>
> Nguồn TT99: [MISA AMIS — TT99/2025 thay TT200/2014](https://amis.misa.vn/251383/thong-tu-99-2025-tt-btc-thay-the-thong-tu-200-2014-tt-btc/) ·
> [EasyBooks — hàng tồn kho theo TT99](https://easybooks.vn/hang-ton-kho-theo-thong-tu-99-2025-tt-btc/) ·
> [Kế toán Lê Ánh — nguyên tắc kế toán HTK theo TT99](https://ketoanleanh.edu.vn/kinh-nghiem-ke-toan/nguyen-tac-ke-toan-hang-ton-kho-theo-thong-tu-99-2025-tt-btc.html) ·
> [ASOFT — phương pháp tính giá xuất kho theo TT99](https://asoft.com.vn/phuong-phap-tinh-gia-xuat-kho-theo-thong-tu-99/)
>
> Bốn dòng dưới giữ nguyên làm **nhật ký trung thực** về việc đã tra gì — không xoá để giấu lỗi.

| Nguồn | Sự thật rút ra |
|---|---|
| [thuvienphapluat.vn — Nguyên tắc kế toán HTK theo TT200 & TT133](https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/tu-van-phap-luat/47409/nguyen-tac-ke-toan-hang-ton-kho-theo-thong-tu-200-va-thong-tu-133) | HTK ghi theo giá gốc; phải lập dự phòng giảm giá; kiểm kê là nghĩa vụ |
| [sme.misa.vn — phương pháp tính giá xuất kho TT200](https://sme.misa.vn/63109/tong-hop-cac-phuong-phap-xac-dinh-gia-xuat-kho-moi-nhat-theo-thong-tu-200/) | **3 phương pháp: bình quân gia quyền · đích danh · FIFO.** Và điểm quyết định: **được áp phương pháp KHÁC NHAU cho nhóm hàng khác nhau** trong cùng công ty → nhôm cây dùng **đích danh theo lô** (vì mỗi lô có khổ/màu riêng, không thay thế được cho nhau), phụ kiện dùng **bình quân** |
| [amis.misa.vn — quy trình kiểm kê HTK](https://amis.misa.vn/37941/kiem-ke-hang-ton-kho/) | Kiểm kê định kỳ + **biên bản kiểm kê** làm căn cứ quy trách nhiệm bảo quản. App phải sinh được biên bản, không chỉ đối chiếu số |
| [acac.vn — xử lý thừa/thiếu khi kiểm kê](https://acac.vn/chenh-lech-kiem-ke-hang-ton-kho-hach-toan-the-nao/) | Chênh lệch phải phân loại nguyên nhân (sai cân đo / quên ghi / mất mát / gian lận) rồi mới hạch toán — **field "nguyên nhân" là bắt buộc**, không phải ghi chú tự do |

### Lớp 3 — Đối thủ & chuẩn sản phẩm

| Nguồn | Sự thật rút ra |
|---|---|
| [DeepWiki — ERPNext Inventory Management](https://deepwiki.com/frappe/erpnext/5-inventory-management) | Kiến trúc 2 tầng: **Stock Ledger Entry bất biến** (nhật ký) + **Bin tổng hợp** (hiệu năng). Không tính tồn bằng cách quét ledger mỗi lần |
| [docs.frappe.io — FIFO and Moving Average](https://docs.frappe.io/erpnext/fifo-and-moving-average) | FIFO = hàng đợi lớp `[qty, rate]`/item-kho. SLE giữ `qty_after_transaction`, `valuation_rate`, `stock_value`, `stock_value_difference`. **Ràng buộc chí tử: giá trị mỗi SLE phụ thuộc mọi SLE trước nó — chèn/huỷ/sửa lùi ngày kích hoạt Repost Item Valuation, tính lại toàn bộ SLE sau đó, "chậm và tốn tài nguyên"** |
| [RealSTEEL](https://www.realsteelsoftware.com/features/inventory-management/) | Ngành thép/kim loại có phần mềm chuyên: tồn thời gian thực theo cây/tấm |
| [CutWize — Bar & Linear Cutting Optimization](https://cutwize.com/blog/bar-cutting-optimization-guide) | Chuẩn ngành cắt thanh: **định nghĩa ngưỡng đầu thừa dùng lại tối thiểu (vd 500 mm) — nhỏ hơn cho thẳng vào phế**, và **đo rồi nhập chiều dài đầu thừa vào hệ thống để phần mềm ưu tiên dùng TRƯỚC** |

### Lớp 4 — Tiếng người dùng (đọc sâu)

| Nguồn | Sự thật rút ra |
|---|---|
| [danketoan.com — Cách quản lý HTK doanh nghiệp nhôm kính](https://danketoan.com/threads/cach-quan-ly-hang-ton-kho-doanh-nghiep-nhom-kinh.224926/) | Nguyên văn kế toán trong nghề: *"mặt bằng của xưởng hạn chế nên việc sắp xếp nhôm của từng công trình rất khó"*; **thợ cắt sai hoặc làm hỏng mà không báo → lệch sổ với thực tế**; nhiều hệ đặt tên khác nhau từ **Hyundai, Xingfa** gây rối mã (khớp đúng `XÁM XINGFA` trong bảng màu Alumdoor). Cách chống đã được kiểm chứng: **kỹ thuật phải cấp mã + số lượng cắt + chiều dài TRƯỚC khi kho được xuất**, và **đối chiếu hằng ngày kế hoạch dùng vs đầu thừa thực tế** |
| [Acumatica Community — Inventory Pieces/Remnants](https://community.acumatica.com/distribution-6/inventory-pieces-remnants-any-ideas-on-best-way-to-deal-with-this-8194) | Mô hình được thực địa khuyên: **rollup SKU** (gộp theo độ dày/hợp kim) + **thuộc tính lô/serial giữ kích thước từng đầu thừa** → cùng SKU nên cùng giá vốn. Kho tách: cây nguyên vs đầu thừa, **chỉ xuất cây nguyên khi đầu thừa không đủ dài**. Bẫy đã trả giá: chọn lô bằng tay lúc pick rất dễ sai; theo dõi quá chi tiết vượt sức nhân lực |
| [Acumatica — Metal sheets after cutting](https://community.acumatica.com/manufacturing-89/metal-sheets-inventory-tracking-after-cutting-operation-20732) | Đặt kho `Remnants` **loại khỏi tồn khả dụng** để MRP chỉ nhìn kho chính; sau cắt chuyển đầu thừa sang kho đó |
| [Acumatica — Tracking Steel Inventory UoM](https://community.acumatica.com/distribution-6/tracking-steel-inventory-uom-bars-sheets-20219) | Với thanh, **trọng lượng tỉ lệ 1:1 với chiều dài** → dùng ĐVT chiều dài là hợp lệ; với tấm thì phải "catch weight" |

### Lớp 5 — Best practice quốc tế

| Nguồn | Sự thật rút ra |
|---|---|
| [cutoptim — 1D vs 2D Cutting Optimization](https://cutoptim.com/guides/1d-vs-2d-cutting-optimization) | **Kerf (bề rộng lưỡi) 2–4 mm mỗi nhát.** Cây 6.000 mm cắt 5 nhát mất 15 mm chỉ vì mạt cưa — "đủ để quyết định miếng cuối có vừa hay không". Công thức 1D thuần bỏ qua kerf là sai thực tế |
| [PeerJ — 1D cutting stock, African Buffalo Optimization](https://peerj.com/articles/cs-1728/) | 1D-CSP là bài toán NP; heuristic đủ dùng cho quy mô xưởng |
| [PMC — Tree-Based Heuristic using Leftovers](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10672251/) | Có nhánh nghiên cứu riêng cho **cắt CÓ tận dụng đầu thừa (leftover-aware)** — đúng bài toán Alumdoor |
| [ScienceDirect — Exact algorithms in bar nesting](https://www.sciencedirect.com/science/article/pii/S0360835224009604) | First Fit Decreasing: sắp giảm dần rồi nhét vào cây đầu tiên còn đủ chỗ — đủ tốt, dễ giải thích cho thợ |
| [grayselectric — Managing Aluminum Inventories](https://www.grayselectric.com/blog/best-practices-managing-aluminum-inventories/) | Tồn nhôm cần dữ liệu thời gian thực để tránh đặt thừa |
| [Modula — Warehouse Inventory Best Practices](https://modula.us/blog/warehouse-inventory-management/) | Nhãn + vị trí + kiểm kê chu kỳ là nền |

### 5 sự thật quan trọng nhất mà bản cũ CHƯA có

1. **Kerf chưa từng xuất hiện** trong công thức chia lá của bản cũ. Mỗi nhát mất 2–4 mm; cửa 51 lá là 51 nhát.
2. **Ngưỡng đầu thừa phải do xưởng chốt** và đầu thừa phải nằm ở **kho riêng loại khỏi tồn khả dụng**. Bản cũ tự đặt 0,25 m — tài liệu ghi rõ *"con số đó em bịa"*.
3. **Sửa lùi ngày = tính lại toàn bộ sổ sau đó.** Phải có **khoá kỳ** ngay từ thiết kế, không vá sau.
4. **TT99/2025 cho phép mỗi nhóm hàng một phương pháp giá** → nhôm đích danh theo lô, phụ kiện bình quân. Bản cũ ép một kiểu.
5. **Kiểm kê + biên bản + nguyên nhân chênh lệch** là nghiệp vụ bắt buộc, bản cũ hoàn toàn chưa có.

---

## 3. Mổ tài liệu khách — 7 lát cắt

Nguồn: `2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx` (14 sheet) · `TỒN NHÔM 2026 NEW.xlsx` (15–23 sheet) ·
`CTY SÁU HỒNG.xlsx` (11 sheet) · `MS LIÊN BS.xlsx` (17 sheet) · `25.7 QUY TRÌNH.docx` ·
`ALUMDOOR - DOI CHIEU THANH PHAM.xlsx` · `CÔNG THỨC CHIA LÁ.pdf` · ảnh sổ yêu cầu 29–30/7 · ảnh bảng màu.

### 3.1 Sheet → Entity

| Sheet nguồn | Entity đề xuất | Rule rút ra | Câu hỏi còn mở |
|---|---|---|---|
| `TỒN NHÔM` — mỗi mã nhôm 1 sheet (23 sheet) | **Lô nhôm** (mã · màu · tình trạng · khổ · số lá · kho) | Tồn vật lý phải giữ khổ + số lá, không gộp thành 1 con số | Chia thật giữa K36/K12 thế nào? |
| `NHẬP` (254 dòng) | **3 chứng từ khác nhau**, không phải 1 | Sheet gộp cả mua · khách trả · NCC đổi lỗi — mỗi loại động vào sổ khác nhau | — |
| `T2.2026`–`T7.2026` (~50.000 dòng) | **Đơn hàng** + dòng đơn | 1 số chứng từ = nhiều dòng hàng ⇒ mô hình cha–con | `LỆNH XUẤT KHO` khác `PHIẾU XUẤT KHO` chỗ nào? |
| `ĐM` (34.678 dòng) | **Định mức (BOM)** + dòng NVL | Cột `[1]` có STT = dòng thành phẩm; không có = dòng NVL | Ron nhựa 0,10 hay 0,263 kg/m? |
| `GHI CHÚ` | **Công thức cửa** (bản lá + hằng số đo) | 23 bản lá + hằng số trừ theo dòng cửa **và theo loại ray** | — |
| `CHI TIẾT SƠN` | **Phiếu gia công sơn** (NCC Hải Kỳ) | Sơn thuê ngoài, có bảng giá + công thức tính tiền riêng từng loại | Lò nhà và Hải Kỳ chia việc thế nào? |
| `CỬA LỖI` (1.002 dòng) | **Phiếu lỗi** — 2 đường xử lý song song | Xử lý cho khách VÀ cho NCC là hai luồng riêng | — |
| `DS BẢO HÀNH` | **Bảo hành** — 4 mốc có số lượng riêng | Xưởng ứng hàng cho khách trước, đòi NCC sau ⇒ hàng nằm ở NCC là một loại tồn | — |
| `LỊCH SẢN XUẤT` | **Lệnh sản xuất** + định mức giờ | Úc/Lưới tính theo **m²**, Đức/Đài Loan/Siêu Trường theo **BỘ** — hai cách tính khác nhau | Số người mỗi tổ? |
| `THU-CHI` (1.851 dòng) | **Sổ quỹ** + tài khoản ngân hàng | 7 tài khoản: tiền mặt + ACB/TCB/MB | — |
| `DANH MỤC` | **Bảng giá** nhập/bán + quy đổi | Mỗi món có giá nhập, giá bán, ĐVT khác nhau, **và ghi chú quy đổi** | — |
| `CNO NCC` / `CHI TIẾT CNO KH` | **Công nợ** hai chiều | — | Có theo dõi công nợ NCC không? |

### 3.2 Công thức = business rule (đã dịch)

| Công thức nguồn | Nghĩa |
|---|---|
| `kg barem = khổ(m) × trọng lượng(kg/m) × số cây` | Kiểm chứng đúng trên 3 ví dụ sổ yêu cầu 30/7: `7,2 × 0,389 × 200 = 560,16` ✓ |
| `Số lá ruột = (CPB − 0,13) ÷ bản lá − 1` | Áp cho cửa Đức, 23 bản lá. AL71C là ngoại lệ duy nhất không trừ 1 |
| `Số lá cửa Úc = (CPB ÷ 0,465) + k`, `k` = 2 / 1,5 / 1,3 | Theo motor trong-kéo tay / motor ngoài không tự dừng / motor ngoài có tự dừng. **Kết quả là số thập phân**, làm tròn về nấc {0 · 0,3 · 0,7 · 1} |
| `Số lá Đức kéo tay = (CPB − 0,13) ÷ 0,068` | AL70; khoá ngang ăn 1 lá 1 lớp, mỗi hàng khe thoáng ăn thêm 1 lá 1 lớp |
| `RCL = RPBN − 0,02` (đại lý) · `RCL = RPBR − 0,08` (lẻ) | Cửa Đức, **ray U75**. Sheet `GHI CHÚ` xác nhận qua `RPBN = RPBR U75 − 0,06` |
| `RCL = RPBR U100 − 0,09` | **Ray U100 có hằng số RIÊNG** — `RPBN = RPBR U100 − 0,07`. Chưa tài liệu nào của bản cũ có |
| `Tiền sơn Đức = RCL × số lá × số lượng × 6.500` | Úc: `Cao × RCL × 2 mặt × SL × 50.000`; Lưới: `Cao lưới × rộng CL × 80.000` |
| `Số lá = (CPB−130) ÷ bản lá`, ngưỡng **20,5** | Dưới 20,5 thì trừ 1 lá, trên thì không |

### 3.3 Màu tô & trạng thái ngầm

- Ô màu `THÔ` trong đơn hàng ⇒ **tự động chuyển sang sheet Chi tiết sơn** — đây là một *trigger* nghiệp vụ,
  không phải màu trang trí.
- `stock_state` ở bản cũ: `TỒN` / `SẮP HẾT` / `HẾT` (55 và 53 dòng) — ngưỡng do ai đặt chưa rõ.

### 3.4 Dữ liệu bẩn = validation phải làm

| Hiện tượng | Số đo | Validation cần |
|---|---:|---|
| Mã có khoảng trắng | 121/477 | Chặn ký tự ngoài `A–Z 0–9 - .` |
| Mã có chữ thường | 147/477 | Ép in hoa |
| Mã có dấu tiếng Việt | 26/477 | Chặn |
| Tiền tố `TP-` vô nghĩa | 275 mã, chỉ 139 là thành phẩm thật | Quy ước tiền tố mới 10 loại |
| "Thành phẩm" thực ra là bậc giá | 56/117 | Bậc giá → Chính sách giá, không đẻ mã |
| ĐVT bán ≠ ĐVT tồn thiếu hệ số | 126 mã | **Từ chối ghi** khi thiếu quy đổi, không lấy 1 |
| Đồng nghĩa đơn vị (`M`≡Mét, `CUỐN`≡Cuộn, `TÂM`≡Tấm) | 3 cặp | Gộp, không tạo mã mới |
| Số cây nằm trong ô ghi chú tự do | 76 dòng Tiến Đạt | Tách cột riêng |

### 3.5 Chỗ Excel bó tay = lý do trả tiền

1. **Đối chiếu 2 sheet bằng mắt** — tồn nhôm ↔ đơn sản xuất, làm tay mỗi lệnh.
2. **Không biết "bán được bao nhiêu"** — không có cột giữ chỗ nào trong bất kỳ file nào.
3. **Công nợ HÀNG với Tiến Đạt** — trừ FIFO theo đơn cũ nhất, dung sai ±5%, hiện tính nhẩm.
4. **Đầu thừa** — cắt xong biến mất khỏi mọi bảng, lần sau lại cắt cây mới.

---

## 4. Nỗi đau xếp hạng

> ⚠️ Tần suất × chi phí **chưa có số của chủ xưởng** — bảng dưới xếp theo bằng chứng đếm được trong
> file/hệ thống. Cột "Giá phải trả" cần chủ xưởng điền ở Cổng 1.

| # | Nỗi đau | Bằng chứng đếm được | Giá phải trả |
|---|---|---|---|
| **1** | **Hai hệ tồn không nối** — sổ kg và lô cây/lá không tự đồng bộ | 1.257 lô / 43.601 lá từng có, mà **0 dòng** có `remaining_kg` | ? |
| **2** | **Không có tồn khả dụng** — không cơ chế giữ chỗ | 0 bản ghi reservation; báo cáo N-X-T chỉ có `actual_qty` | ? |
| **3** | **Đầu thừa mất dấu sau khi cắt** | 106 dòng khổ < 0,25 m bị đánh phế bằng ngưỡng **tự bịa** | ? |
| **4** | **Quy đổi đơn vị thiếu → tồn sai tới ~6 lần** | 126 mã ĐVT bán ≠ ĐVT tồn | ray mua cây 5,85 m bán mét |
| **5** | **Dung sai NCC ±5% làm nghẽn nhập kho** | app hiện **từ chối** nhận vượt số đặt | không lập nổi phiếu |
| **6** | **Mã hàng hỏng lặng lẽ** | 121 khoảng trắng + 147 chữ thường + 26 có dấu | hỏng URL/tìm kiếm/xuất file |
| **7** | **Kerf không được tính** | 0 nơi nhắc tới bề rộng lưỡi cắt | 51 nhát × 2–4 mm |

**Nỗi đau #1 chỉ định màn hình chính:** **Tồn nhôm theo khổ** — bảng khả dụng cộng dồn theo khổ
(`khổ ≥ 4,5 m: 12 lá khả dụng (tổng 18, giữ chỗ 6)`), vì đây là chỗ duy nhất trả lời được cả
"bán được bao nhiêu" lẫn "cắt từ cây nào".

---

## 5. Thuật ngữ ngành — chốt theo cách xưởng gọi

| Xưởng gọi | Nghĩa |
|---|---|
| **CPB** / **CLL** | Cao phủ bì / cao lọt lòng. `CPB = CLL + 0,5 m` |
| **RPBN** / **RPBR** | Rộng phủ bì nhựa (đại lý) / phủ bì ray (khách lẻ) |
| **RCL** / **RLL** | Rộng cắt lá / rộng lọt lòng |
| **Bản lá** | Bề rộng hữu ích một lá, theo mã nhôm (0,05–0,068 m) |
| **Cây** / **Lá** | Nhôm nguyên dạng mua vào / sau khi cắt |
| **Khổ** | Chiều dài cây hoặc lá |
| **Lá ruột · lá đầu · lá yếm · lá trung gian · lá đáy lớn** | Các vị trí lá trong một bộ cửa |
| **Thô** | Nhôm chưa sơn — là **tình trạng**, không phải màu |
| **Dập / chưa dập** | Công đoạn quyết định bậc giá NCC |
| **STĐ / Mạ màu** | Sơn tĩnh điện (18 màu) / mạ 2 tông (5 cặp) |
| **Tách món / Trọn bộ** | Hai cách bán, hai công thức tính m² khác nhau |
| **Bộ** | Đơn vị một cánh cửa hoàn chỉnh |

---

## 6. Entry ngành mới — derive theo registry §5

### Xưởng cửa cuốn nhôm (`cua-cuon-nhom`)
- **Cảm xúc đích:** cắt đúng ngay lần đầu — biết còn bán được bao nhiêu — không mất đầu thừa
- **Màu:** BỎ (tier `shared` → palette chung)
- **Logo:** cuộn lá cửa 3 nếp gấp 1 nét trong khiên thép + wordmark in hoa; CẤM hình cửa cuốn kín đặc (nhầm cửa sắt)
- **Chữ & icon:** sans kỹ thuật; **số đo mét 2 chữ số thập phân dạng monospace**; icon outline 1.5px
- **BottomNav:** Tồn nhôm · Đơn hàng · [FAB: Cắt nhôm] · Sản xuất · Báo cáo
- **Dashboard 4 card:** Lá khả dụng theo khổ / Đơn cần cắt hôm nay / Nhôm NCC còn nợ (cây) / Đầu thừa dùng lại được
- **Màn đặc thù:** ① **Tồn nhôm theo khổ** (khả dụng cộng dồn) ② **Máy tính công thức cửa** (nhập CPB/RPB → ra số lá + rộng cắt + kg dự toán, một luật duy nhất cho cả bán-mua-cắt) ③ **Đề xuất cắt** (chọn lô khổ nhỏ nhất còn đủ, có kerf, sinh đầu thừa)
- **Ngôn ngữ:** gọi khách là "đại lý" và "khách lẻ" (2 nhóm, không phải 4); thuật ngữ §5; giọng xưởng, ngắn
- **Demo seed:** 17 mã nhôm × 24 màu + 60 lô nhiều khổ (8 đầu thừa) + 2 kho K36/K12 + 5 công thức cửa + 3 đơn (1 thiếu nhôm) + 1 phiếu nhập Tiến Đạt còn nợ cây

---

## 7. Tier & kiến trúc

- **Tier `shared`** (mặc định ADR-001). Không phải dữ liệu cư dân/công an ⇒ không cần `isolated`.
- Trên Forge, tương đương: **1 D1/tenant** (`cloudforge-alu`), app worker dùng chung trong dispatch
  namespace `cloudforge-production`, không có binding dữ liệu — đọc master qua gateway dưới danh tính
  người gọi.
- **Ràng buộc hiệu năng đã trả học phí:** một lượt đọc master = app → gateway → tenant → về (đo thật
  2.800 ms). `VALIDATOR_TIMEOUT_MS` = 5.000 ms; **không hạ lại 2.000 ms** — gộp lời gọi ở phía app.

---

## 8. Câu hỏi mở → chốt ở Cổng 1

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| **1** | **PHẠM VI: V2 chỉ làm KHO, hay thay cả mua/bán/sản xuất của bản cũ?** | Quyết định độ lớn gấp 3–4 lần. Bản cũ đang có đủ mua/bán/cắt |
| 2 | Ngưỡng đầu thừa bao nhiêu mét thì bỏ hẳn? | Bản cũ tự bịa 0,25 m |
| 3 | Kerf bao nhiêu mm mỗi nhát? | Chưa từng có trong công thức |
| 4 | Mốc giữ chỗ: từ đơn hàng hay từ lệnh sản xuất? | Không có thì không tính được tồn khả dụng |
| 5 | Ray U100 dùng cho những dòng cửa nào? | Hằng số trừ khác U75 |
| 6 | `4004` có phải ĐỎ ĐÔ không? | Mã màu cuối chưa gỡ |
| 7 | Số người mỗi tổ (Đức/Úc/Lưới/Đài Loan/Siêu Trường)? | Không có thì không tính được tăng ca |
| 8 | Giá phải trả cho 7 nỗi đau ở §4 | Để xếp hạng bằng số thay vì bằng bằng chứng đếm |

---

## 9. Scorecard tự chấm — Cổng 1

| # | Tiêu chí (`nghiep-vu-research-pack.md` §4) | Đạt | Bằng chứng |
|---|---|---|---|
| 1 | Đủ 5 lớp từ khóa, ≥10 nguồn, có Nhật ký nguồn → sự thật | ✅ | §2 — 18 nguồn, 5 lớp, 3 nguồn đọc sâu |
| 2 | Nỗi đau xếp hạng bằng con số, ≥3 nỗi đau, #1 chỉ định màn chính | ⚠️ | §4 — 7 nỗi đau có bằng chứng đếm được, màn chính đã chỉ định; **thiếu giá phải trả** → câu hỏi mở #8 |
| 3 | Bảng mổ xẻ 7 lát, công thức/màu tô đã dịch nghĩa | ✅ | §3.1–3.5 — 12 sheet, 8 công thức, 2 trạng thái ngầm, 8 loại dữ liệu bẩn |
| 4 | Thuật ngữ ngành theo cách khách gọi | ✅ | §5 — 12 nhóm thuật ngữ lấy từ file gốc |
| 5 | Đã đọc preset ngành hoặc derive entry mới theo §5 | ✅ | §6 — preset `san-xuat` chỉnh cho ép nhựa, không hợp; derive entry `cua-cuon-nhom` đủ 9 dòng |

**Kết luận tự chấm: 4/5 ✅ + 1 ⚠️.** Mục ⚠️ chỉ khép được bằng câu trả lời của chủ xưởng, không phải
bằng nghiên cứu thêm — nên đưa vào câu hỏi mở của cổng thay vì chặn.

---

## 10. QUYẾT ĐỊNH KIẾN TRÚC — ĐÃ DUYỆT 2026-07-29

> Cổng 1 đã qua. Bốn quyết định dưới đây là **ràng buộc cứng** cho PHA 2 và PHA 3 — BRD viết trên nền
> này, không mở lại trừ khi có bằng chứng mới.

### QĐ-1 — Lô nhôm CHÍNH LÀ batch của sổ kho. Xoá quyển sổ thứ hai

Bản cũ có **hai quyển sổ song song** ghi cùng một sự thật: `stock_ledger_entries` (kg) và doctype
`Aluminium Lot` (cây/khổ/màu). Toàn bộ P0 #1 và hook `lots-from-receipt.ts` chỉ tồn tại để nối chúng.
Hai quyển sổ ghi cùng một sự thật thì lệch là tất yếu, không phải lỗi lập trình.

**Chốt:** mỗi lô nhôm = **một batch** trên chính `stock_ledger_entries` (cột `batch_no` đã có sẵn,
chưa ai dùng). Màu, khổ, tình trạng, kho là thuộc tính của batch. **Không còn doctype tồn song song.**

**Hệ quả về giá vốn — đích danh mà không cần thêm phương pháp:** khi định giá xuất, thu hẹp lịch sử
replay về **đúng batch đó**. Một lô nhôm chỉ nhập một lần ⇒ hàng đợi FIFO của nó có đúng **một lớp**
⇒ chính là **đích danh**. Đạt được bằng cách sửa *phạm vi truy vấn*, không phải viết thuật toán mới.

**Sửa cụ thể (PHA 3):**
- `clouderp-stock/src/valuation.ts:32` — `deriveOutgoingValuation` nhận thêm `batchNo`.
- `getStockLedgerHistory` lọc theo `batch_no` khi `item.has_batch_no = 1`.
- Tiền lệ: ERPNext dính đúng lỗi này và đã sửa — [PR #29804](https://github.com/frappe/erpnext/pull/29804),
  ghi nguyên văn *"batch numbers were NOT considered while consuming material"*. Batch-wise valuation
  **chỉ áp cho FIFO/LIFO**, khớp với `ValuationMethod` hiện có.

**Lỗi đang tồn tại phải vá cùng lượt:** `normalizeValuationMethod` (`valuation.ts:18`) — giá trị nào
không chứa chữ `"moving"` đều **âm thầm thành FIFO**. Gõ sai tên phương pháp không báo lỗi.

### QĐ-2 — Đơn vị tồn của nhôm là CÂY/LÁ; kg là catch weight đi kèm

⚠️ **Đây là đảo lại một quyết định đã chốt trước đó** (`ALUMDOOR-HANDOFF.md` §1.2 *"sổ tồn kế toán của
nhôm giữ theo kg"*). Lý do đảo: chính tài liệu đó ở §5/`QUY-TRINH` lại kết luận *"cân nặng KHÔNG được
quyết định tồn kho"* — vì suy số cây từ cân ra `29,7` trong khi thợ đếm `30`, lệch ngay từ lúc nhập rồi
lệch mãi. Hai câu mâu thuẫn nhau, và bản cũ giải mâu thuẫn bằng cách đẻ ra quyển sổ thứ hai (QĐ-1).

**Chốt:** dùng **catch weight / dual unit of measure** — hai đơn vị **ngang hàng trên cùng một dòng sổ**:

| | Đơn vị | Nguồn sự thật | Dùng cho |
|---|---|---|---|
| Số lượng | **Cây / Lá** | thủ kho ĐẾM | tồn kho, trích cắt, tồn khả dụng |
| Khối lượng | **Kg thực cân** | hoá đơn NCC | giá vốn, công nợ, báo cáo kế toán |

Yêu cầu *"sổ kế toán đọc ra kg"* vẫn được đáp ứng đủ — kg nằm trên **mọi** bút toán. Chỉ là kg thôi giữ
vai trò đơn vị đếm tồn. Đây là cách IFS, Dynamics AX, SAP EWM, Sage X3 làm cho mặt hàng cân từng kiện.

**Hệ quả:** `UOM Conversion` (hệ số **tĩnh** trên Item) **KHÔNG dùng cho nhôm** — vì
`1 cây = khổ × kg/m` mà khổ thay đổi từng lô (đo thật **6,57 → 8,61 m**). Tỉ lệ bắt tại **dòng phiếu
nhập**, không khai ở Item. `UOM Conversion` vẫn dùng bình thường cho ray/trục/phụ kiện (1 Cây = 5,85 Mét).

**Việc phải làm khi bàn giao:** giải thích rõ thay đổi này với chủ xưởng, không tự đổi rồi im.

### QĐ-3 — Khai tử bộ máy biến thể (Item Variant)

`variant_of` + `variant_attributes` đang nằm im trong brief. Để im = chờ người sau (hoặc agent sau)
dùng nó cho màu: 1 mã nhôm × 24 màu × n khổ ⇒ **mớ 477 mã vừa dọn xong quay lại nguyên vẹn**. Thêm nữa,
ERPNext quy định item mẫu **không dùng được trong bất kỳ chứng từ nào**, chỉ biến thể mới giao dịch được.

**Chốt:** xoá `variant_of`, `variant_attributes`, doctype `Item Variant Attribute` khỏi brief V2, kèm
một dòng `//` ghi rõ **vì sao không dùng**. Màu/khổ/tình trạng thuộc về **batch** (QĐ-1).
Luật của chính Forge: trường không ai đọc là trường nói dối.

### QĐ-4 — Phạm vi V2: lõi vật tư, không ôm chuỗi thương mại

Ba lỗ hổng trên **nằm gọn trong lõi vật tư**. Chuỗi thương mại của bản cũ (báo giá → đơn → phiếu xuất →
hoá đơn → thu tiền, và 8 chứng từ mua) **chạy được và có kiểm thử**. Đập cái đang chạy để sửa cái đang
hỏng là đi ngược.

**Trong phạm vi V2:**
- `Item` + `Measurement Profile` + danh mục (UOM, Item Group, màu, kho)
- **Lô/batch** nhôm (thay `Aluminium Lot`)
- **Sổ kho**: nhập · xuất · chuyển kho · **kiểm kê** (mới)
- **Công thức cửa** (`Cutting Policy`) — gồm ray U75 **và U100**
- **Cắt & đầu thừa** — có kerf, có ngưỡng phế
- **Tồn khả dụng** — giữ chỗ theo (mã · màu · tình trạng · khổ tối thiểu)
- Đúng **hai cửa giao tiếp**: phiếu nhập mua, phiếu xuất bán

**Ngoài phạm vi V2 (giữ nguyên bản cũ, ghép sau):** báo giá, đơn bán, hoá đơn, công nợ, thu-chi,
chuỗi 8 chứng từ mua, bảo hành, lỗi sản phẩm, lịch sản xuất/tăng ca, gia công sơn.

### Ba tham số CHƯA có, áp mặc định rồi ghi Assumptions ở PHA 2

| Tham số | Mặc định đề xuất | Căn cứ | Rủi ro nếu sai |
|---|---|---|---|
| Kerf (bề rộng lưỡi) | **3 mm**, khai ở `Measurement Profile` | cutoptim: chuẩn ngành 2–4 mm | Lệch ~15 mm trên cây cắt 5 nhát |
| Ngưỡng đầu thừa bỏ hẳn | **giữ trống, chặn cắt tới khi xưởng điền** `scrap_threshold_m` (trường ĐÃ CÓ) | bản cũ tự đặt 0,25 m và tự ghi *"con số đó em bịa"* | Vứt nhôm còn dùng được, hoặc giữ rác |
| Mốc giữ chỗ tồn | **Phát lệnh sản xuất** | sheet `T6` của xưởng ghi sẵn *"kế toán bấm chọn lệnh sản xuất"* — mốc có thật trong quy trình | Giữ sớm quá thì khoá hàng oan; muộn quá thì hứa trùng |
