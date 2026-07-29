# BRD — ALUMDOOR V2 (lõi vật tư nhôm)

> PHA 2 của `app-factory`, kiến trúc **Forge**. Nền: `docs/ALUMDOOR-V2-PHA1-RESEARCH.md` (Cổng 1 đã duyệt
> 2026-07-29, gồm §10 bốn quyết định kiến trúc QĐ-1…QĐ-4).
> Chuẩn nghiệm thu: **một AI/dev khác chưa từng gặp chủ xưởng đọc xong code đúng, không phải hỏi lại.**

---

## §0. NHẬT KÝ ĐỌC CONTRACT

Đọc TRƯỚC khi viết bất kỳ mục nào. Đơn vị áp dụng là **RULE**, không phải FILE — mỗi contract là hỗn hợp
giữa luật nghiệp vụ (chuyển được sang Forge) và đặc tả component React của AppWeb (không chuyển được).
Gạch cả file là vứt luôn phần luật.

| Contract | Đọc? | Rule cụ thể đã áp dụng | Áp ở mục nào |
|---|---|---|---|
| `field-ledger.md` | ✅ | "Trường không có trong ledger = không được code"; ledger 9 cột; bảng có `status` phải khai state machine ngay dưới ledger | §4 Entities → PHA 3 |
| `master-data-contract.md` | ✅ | "MỌI danh mục PHẢI là 1 bảng thật, CẤM hardcode"; FK trỏ `id` không trỏ `name` để đổi tên không vỡ dữ liệu cũ | §4 bảng "Danh mục dùng chung" |
| `backend-contract.md` | ✅ | Cấp mã bằng `UPDATE…RETURNING` trong transaction — "CẤM SELECT rồi +1 (race 2 người tạo cùng lúc = trùng mã)"; audit ghi CÙNG transaction | §6 + PHA 3 |
| `form-workflow-contract.md` | ✅ | "BRD mỗi form kèm bảng field: tên · bắt buộc · kiểu · rule validate · câu báo lỗi tiếng Việt. Thiếu bảng này = BRD chưa qua cổng 2"; autofill chỉ điền ô user CHƯA sửa tay (dirty-tracking) | §4, §7 khối Autofill |
| `data-table-contract.md` | ✅ | Wizard nhập Excel **5 bước** (file mẫu → upload → map cột → preview validate + xử lý trùng → kết quả + tải file lỗi); "không ghi dữ liệu ngay sau upload nếu chưa preview/confirm" | §7 màn Nhập liệu |
| `screen-catalog-contract.md` | ✅ | Inventory: *"Không sửa trực tiếp số tồn nếu đã có lịch sử; dùng phiếu điều chỉnh"*; Kanban BẮT BUỘC cho "công đoạn sản xuất/gia công" + dialog chip lý do không ngoại lệ; Layout 3 cột 100% màn bảng desktop | §5, §7 |
| `media-capture-contract.md` | ✅ | Điểm chụp bắt buộc: **Nhập kho = ảnh hàng nhận + phiếu giấy NCC**; ảnh gắn chứng từ đã chốt là **bất biến**, không xoá/không thay; OCR "Ảnh/PDF bảng kê NCC → dòng hàng phiếu nhập" | §7 màn Phiếu nhập |
| `print-contract.md` | ✅ | Mọi phiếu in có **số chứng từ + QR mở bản ghi + tiền bằng chữ**; phiếu nhập/xuất dùng khổ **A5** (quen mắt kế toán); khu chữ ký 2–3 bên | §7 + §9 |
| `notify-contract.md` | ✅ | "Tin TỰ ĐỘNG chỉ chạy khi rule được bật rõ ràng trong Settings (mặc định TẮT từng loại) — không âm thầm nhắn khách của người ta" | §9 Decided |
| `polish-contract.md` | ✅ | Chống sửa đè: bản ghi bị người khác lưu trước → cảnh báo + xem khác biệt, **KHÔNG ghi đè im lặng** (optimistic lock so `updated_at`) — Forge đã có khoá `modified`, khớp sẵn | §5 nhánh lỗi |
| `operator-convenience.md` | ✅ | #9 "Bảng con: **paste nhiều dòng từ Excel** vào là ra dòng hàng" (bản cũ đã có, giữ); #44 "MỌI ngưỡng nghiệp vụ chỉnh được trong Settings — cấm hardcode" → kerf và ngưỡng đầu thừa vào `Measurement Profile` | §9 Decided |
| `mobile-pwa-contract.md` | ⚠️ một phần | Áp: banner offline, form mobile full-screen, thumb zone. **KHÔNG áp**: BottomNav/FAB 56px/PWA install-update banner — đó là bộ khung shell riêng của AppWeb; Forge sinh giao diện từ metadata doctype, không có các component đó để mà tuân | ghi rõ ở §8 |
| `pos-fnb-contract.md` | N-A | Guide cho phép ghi "Không áp dụng" khi không phải F&B. Alumdoor là xưởng sản xuất, không có bàn/KDS/modifier | — |

**Kết luận phân loại:** 11 contract áp dụng gần như toàn bộ, 1 áp dụng một phần, 1 không áp dụng.
Phần duy nhất thật sự không chuyển được là **bộ khung shell mobile của AppWeb**.

---

## 0. ASSUMPTIONS & CÂU HỎI MỞ

### 0.1 Giả định đã tự quyết (theo mặc định xưởng — chờ duyệt cả gói ở Cổng 2)

| # | Giả định | Căn cứ | Rủi ro nếu sai |
|---|---|---|---|
| A1 | Kerf = **3 mm**/nhát, khai ở `Measurement Profile`, chỉnh được | cutoptim: chuẩn ngành 2–4 mm | Cửa 51 lá lệch ~15 cm tổng; cây cuối không đủ |
| A2 | **THAY 30/07: dùng 0,25 m** theo chủ xưởng, thôi chặn cắt | Chủ xưởng chốt trực tiếp | Vẫn là số tạm — sai thì vứt nhôm còn dùng được, hoặc giữ rác. Để Settings sửa được |
| A3 | Mốc giữ chỗ tồn = **phát lệnh sản xuất** | Sheet `T6` của xưởng ghi sẵn *"kế toán bấm chọn lệnh sản xuất"* | Giữ sớm → khoá hàng oan; muộn → hứa trùng |
| A4 | Tier **`shared`**: 1 D1/tenant, app worker dùng chung | ADR-001; không phải dữ liệu cư dân/công an | — |
| A5 | 5 role giữ nguyên bản cũ: Chủ xưởng · Kinh doanh · Thủ kho · Kế toán · Sản xuất | Đã có trong `briefs/alumdoor.json`, xưởng đang dùng | Thiếu role thợ cắt riêng nếu xưởng phân công chi tiết hơn |
| A6 | Ngôn ngữ UI/lỗi/tài liệu: **tiếng Việt** | mặc định xưởng | — |
| A7 | Phương pháp giá vốn nhôm = **FIFO thu hẹp theo batch** (⇒ đích danh) | QĐ-1; TT99/2025 cho phép mỗi nhóm hàng một phương pháp | — |
| A8 | Phụ kiện/ray/trục = **FIFO gộp theo item-kho** như thường | Chúng thay thế cho nhau được, không cần đích danh | — |
| A9 | Nạp dữ liệu ban đầu từ **file Excel gốc**, áp thẳng quy ước mã 29/7 | Tenant đã được chủ xưởng cố ý xoá sạch để làm lại | — |

### 0.2 Câu hỏi chờ chủ xưởng (gom hỏi 1 lượt ở Cổng 2)

| # | Câu hỏi | Chặn cái gì |
|---|---|---|
| Q1 | Đầu thừa ngắn hơn **bao nhiêu mét** thì bỏ hẳn? | A2 — chặn thao tác cắt cho tới khi có |
| Q2 | Kerf thực tế của máy cắt là bao nhiêu mm? | A1 — xác nhận hoặc sửa |
| Q3 | **Ray U100** dùng cho những dòng cửa nào? | Công thức cửa: U100 có hằng số trừ riêng (−0,09 thay vì −0,08) |
| Q4 | Mã màu `4004` có phải **ĐỎ ĐÔ**? | Mã màu cuối chưa gỡ |
| Q5 | Tồn nhôm chia thật giữa **K36 / K12** thế nào? | Seed dữ liệu ban đầu |
| Q6 | Ron nhựa: **0,10** hay **0,263 kg/m**? (bàn giao và sheet ĐM ghi khác nhau) | Định mức |
| Q7 | Giá phải trả cho 7 nỗi đau §1 (tần suất × tiền) | Xếp hạng nỗi đau bằng số thay vì bằng bằng chứng đếm |
| ~~Q8~~ | Phiếu xuất bán có bắt buộc phải có Đơn bán không? | ✅ **CHỐT 2026-07-30: KHÔNG bắt buộc.** `Delivery Note.against_sales_order` đổi từ `required` → **tuỳ chọn**; `install_address` cũng thôi bắt buộc vì nó `fetch_from` đơn bán. Kho xuất được độc lập cho xuất mẫu / đổi bảo hành / xuất nội bộ. Va chạm phạm vi với QĐ-4 được gỡ |

---

## 1. VẤN ĐỀ

Xưởng cửa cuốn Alumdoor mua nhôm **cây** theo **kg thực cân**, cắt thành **lá** theo công thức riêng từng
dòng cửa, sơn, lắp thành **bộ** bán theo **m²**.

Bài toán lõi: **một cây nhôm mang bốn con số cùng lúc — kg, khổ, số cây/lá, tiền — và mọi cách quản lý
hiện có chỉ giữ được một hoặc hai.**

### 1.1 Nỗi đau xếp hạng

| # | Nỗi đau | Bằng chứng đếm được | Giá phải trả |
|---|---|---|---|
| **1** | Hai hệ tồn không nối — sổ kg và lô cây/lá không tự đồng bộ | 1.257 lô / 43.601 lá từng có, mà **0 dòng** có `remaining_kg` | Q7 |
| **2** | Không có tồn khả dụng — không cơ chế giữ chỗ | 0 bản ghi reservation; báo cáo N-X-T chỉ có `actual_qty` | Q7 |
| **3** | Đầu thừa mất dấu sau khi cắt | 106 dòng khổ < 0,25 m bị đánh phế bằng ngưỡng tự bịa | Q7 |
| **4** | Quy đổi đơn vị thiếu → tồn sai tới ~6 lần | 126 mã có ĐVT bán ≠ ĐVT tồn | ray mua cây 5,85 m bán mét |
| **5** | Dung sai NCC ±5% làm nghẽn nhập kho | app hiện **từ chối** nhận vượt số đặt | không lập nổi phiếu |
| **6** | Mã hàng hỏng lặng lẽ | 121 khoảng trắng + 147 chữ thường + 26 có dấu / 477 mã | hỏng URL, tìm kiếm, xuất file |
| **7** | Kerf không được tính | 0 nơi nhắc tới bề rộng lưỡi cắt | 51 nhát × 2–4 mm |

**Nỗi đau #1 chỉ định màn hình chính: `Tồn nhôm theo khổ`.**

### 1.1b Xếp hạng bằng tiền — ước lượng của agent (Q12)

Chủ xưởng giao agent tự trả lời. Đây là **ước lượng có giả định ghi rõ**, không phải số đo — xưởng đối
chiếu rồi sửa. Đơn giá nhôm lấy từ bảng giá NCC thật: **98.000–107.000 đ/kg**.

| Hạng | Nỗi đau | Cách mất tiền | Ước lượng/năm | Độ chắc |
|---:|---|---|---|---|
| **1** | **#3 Đầu thừa mất dấu** | Cắt xong đoạn dư biến khỏi mọi bảng ⇒ lần sau cắt cây nguyên. Một đoạn AL595 dài 1,2 m ≈ 0,42 kg ≈ **44.000 đ**. Bỏ phí 10–20 đoạn/tuần | **25–50 tr** | Cao — mất **vật chất**, tính thẳng ra kg |
| **2** | **#2 Không có tồn khả dụng** | Hứa trùng hàng ⇒ trễ giao ⇒ mua gấp giá cao hoặc mất đơn. Ít lần nhưng mỗi lần đắt | **khó đoán, có thể lớn nhất** | Thấp — phụ thuộc mất bao nhiêu đơn |
| **3** | **#1 Hai sổ không nối** | Giá vốn sai ⇒ **lãi ảo** ⇒ báo giá sai. Không mất tiền ngay, mà làm mọi quyết định giá đứng trên số sai | hệ thống, không quy ra được | Cao về tồn tại, thấp về con số |
| **4** | **#7 Kerf không tính** | 51 nhát × 3 mm = **15,3 cm/bộ cửa**. Trên cây 8,5 m là ~1,8% nhôm không ai ghi vào đâu | ~1,8% lượng nhôm cắt | Cao — số học thuần |
| **5** | **#5 Dung sai nghẽn nhập** | Không mất vật chất, mất **thời gian**: phải sửa đơn hoặc ghi tay mỗi lần NCC giao lệch | vài giờ/tháng | Cao |
| **6** | **#4 Quy đổi đơn vị thiếu** | Tồn sai tới ~6 lần trên ray (mua cây 5,85 m, bán mét). Chỉ chạm 126 mã nhưng sai thì sai lớn | phụ thuộc mã nào | Trung bình |
| **7** | **#6 Mã hàng hỏng** | Không mất tiền trực tiếp — mất thời gian tìm, xuất file lỗi, gõ nhầm | vài giờ/tháng | Cao |

**Kết luận xếp hạng:** #3 đứng đầu vì nó là loại duy nhất **mất vật chất đo được bằng kg**. #2 xếp thứ hai
dù không đoán được số, vì mỗi lần vỡ là mất cả đơn hàng chứ không phải vài trăm nghìn.

⚠️ Nhưng **thứ tự này KHÔNG đổi thứ tự xây**: #1 và #2 phải làm trước vì #3, #4, #7 **không sửa được** khi
sổ còn tách làm hai. Đầu thừa chỉ ngừng mất dấu khi nó thành một lô có mã trên sổ — tức sau QĐ-1.

⏳ Cần xưởng cho ba số để thay ước lượng bằng đo thật: **(a)** tuần bỏ bao nhiêu đoạn thừa còn dùng được,
**(b)** năm ngoái trễ giao vì thiếu nhôm mấy lần, **(c)** mỗi lần trễ mất bao nhiêu.

### 1.2 Vì sao bản cũ không vá được, phải làm lại

Ba lỗ hổng nằm ở **mô hình Item và định giá**, không ở chỗ đi dây:

1. `deriveOutgoingValuation` (`clouderp-stock/src/valuation.ts:32`) nhận `itemCode + warehouse`, **không nhận `batch_no`** — dù `stock_ledger_entries` đã có sẵn cột đó. Trong khi `cut.propose` cố ý chọn **lô khổ nhỏ nhất còn đủ dài** — gần như không bao giờ là lô cũ nhất. ⇒ **Mỗi nhát cắt, vật lý trừ một lô còn kế toán trừ tiền của lô khác, không có gì báo lỗi.**
2. `UOM Conversion` là **hệ số tĩnh**, mà `1 cây nhôm = khổ × kg/m` với khổ thay đổi từng lô (đo thật 6,57 → 8,61 m) ⇒ **không tồn tại hệ số nào**. Bản cũ né bằng cách đẻ quyển sổ thứ hai — chính là gốc của nỗi đau #1.
3. `normalizeValuationMethod` (`valuation.ts:18`): giá trị nào không chứa chữ `"moving"` đều **âm thầm thành FIFO**.

---

## 2. MỤC TIÊU

### 2.1 Kết quả định lượng

| # | Mục tiêu | Đo bằng |
|---|---|---|
| G1 | **Một quyển sổ duy nhất** cho tồn nhôm | 0 doctype tồn song song; mọi thay đổi tồn đi qua `stock_ledger_entries` |
| G2 | Giá vốn xuất **khớp đúng lô bị cắt** | Test: cắt lô B (mới, khổ vừa) → giá vốn ghi theo lô B, không theo lô A cũ hơn |
| G3 | Trả lời được **"còn bán được bao nhiêu"** theo khổ | Màn Tồn nhôm theo khổ: tổng · giữ chỗ · khả dụng, cộng dồn theo khổ |
| G4 | Đầu thừa **không biến mất** sau cắt | Mỗi lần cắt sinh bản ghi đầu thừa hoặc phế, có ngưỡng phân định |
| G5 | Nhập được phiếu khi NCC giao **lệch ±5%** | Test: đặt 300 cây, nhận 315 → ghi sổ thành công; nhận 320 → chặn kèm lý do rõ |
| G6 | Mã hàng **không thể hỏng lặng lẽ** | Validate chặn ký tự ngoài `A–Z 0–9 - .`; 0 mã mới có khoảng trắng/dấu |
| G7 | Cắt có tính **kerf** | Công thức trừ kerf × số nhát; hiện trên bản xem trước |

### 2.2 Quy tắc nghiệp vụ bất biến

1. **Sổ kho không sửa trực tiếp** — có lịch sử rồi thì chỉ điều chỉnh bằng chứng từ (`screen-catalog` mục Inventory).
2. **Chứng từ đã ghi sổ không xoá cứng** — chỉ huỷ/đảo bút toán, giữ số.
3. **Ảnh gắn chứng từ đã chốt là bất biến** — không xoá, không thay (`media-capture`).
4. **Audit ghi cùng transaction** với thao tác — thiếu audit = bug chặn PR (`backend-contract`).
5. **Số cây/lá là sự thật do người đếm**, không bao giờ suy ra từ cân nặng (QĐ-2).
6. **Không đoán màu** — mã màu chưa xác định thì để trống, không gán bừa.

### 2.3 Điều kiện tin dùng — "làm được gì thì xưởng BỎ được Excel"

Pain-drill nấc 4 thường lấy bằng cách hỏi khách. Ở đây **không hỏi được** (chủ xưởng không ngồi cùng), nhưng
cũng **không cần đoán**: chủ xưởng đã viết sẵn câu trả lời trong `25.7 QUY TRÌNH.docx` và sổ yêu cầu
30/07 — họ mô tả chính cái Excel không làm được. Sáu điều kiện dưới đây **rút từ chữ của họ**, mỗi điều
kèm nguồn; điều nào là suy luận thì ghi rõ.

| # | Điều kiện nghiệm thu | Nguồn — chữ của chủ xưởng |
|---|---|---|
| **ĐK1** | **Nhập một lần, mọi nơi tự đổi.** Ghi phiếu xong thì tồn, công nợ, lịch sử tự cập nhật — không chép tay sang chỗ thứ hai | `.docx`: *"Hàng ngày bấm chữ cập nhật thì mọi thông tin từ FILE 1 đổ về FILE 3 vào sổ chi tiết"*. Họ phải dựng 3 file Excel và một nút "cập nhật" để mô phỏng thứ mà một CSDL làm sẵn |
| **ĐK2** | **Tìm lô để cắt không phải mở file khác.** Máy đề xuất lô theo mã + khổ gần nhất + màu; thợ chỉ xác nhận | `.docx` bước 3 cửa Đức: *"Vào **File tồn nhôm** tìm «Tên vật tư/SP» (mỗi tên vật tư/SP là 1 sheet) → tìm kiếm theo Tên SP / **kích thước gần nhất với rộng cắt lá** / màu sắc"*. **Đây là việc lặp nhiều nhất của cả quy trình** — mỗi bộ cửa một lần, dò bằng mắt trên file 23 sheet |
| **ĐK3** | **Cắt xong tự trừ tồn VÀ tự nhập lại phần dư** | `.docx` bước 5: *"bấm vào cắt nhôm ⇒ **tự động trừ và nhập lại phần dư**, cập nhật ngày nhập lại"*. Yêu cầu đầu thừa là **do chính chủ xưởng viết ra**, không phải ý của agent |
| **ĐK4** | **Số đã chốt thì không sửa lén được** — chỉ người phụ trách sửa, và sửa thì có dấu vết | `.docx`: *"tránh trường hợp cập nhật rồi, kế toán có tự ý thay đổi số liệu… chỉ có người phụ trách được sửa và thay đổi"*. Đây là điều kiện **TIN**, không phải tính năng — Excel thua ở chỗ ai cũng sửa được mọi ô |
| **ĐK5** | **Nhìn ra nhà máy còn nợ bao nhiêu cây, về ngày nào** | Sổ yêu cầu 30/07: *"phải có **lịch sử diễn giải ngày hàng về** sau mỗi đơn hàng và **lịch sử trừ hàng nhập về**, còn lại chính xác"* |
| **ĐK6** | **Hoàn cắt / trả hàng làm được ngay trong app** | `.docx` bước 5: *"muốn thu hồi đối tượng vật tư vừa chọn ⇒ nhập số chứng từ ⇒ chọn hoàn cắt / trả hàng"*. Họ đã nghĩ tới cả đường lùi — app không có là không dùng được |

**Suy luận (không có chữ trực tiếp):** không phải nhớ mã hàng khi nhập — dựa trên 477 mã có 121 khoảng
trắng, 147 chữ thường, 26 dấu tiếng Việt. Đánh dấu là **suy luận**, cần xác nhận.

### 2.3b Ba câu nguyên văn khác đáng giữ

> *"nhiều khi nhập có sai số"* — nên cân nặng không được quyết định tồn kho (QĐ-2).

> *"Bản cũ nhiều lỗ hổng… bản mới này thay thế hoàn toàn nó"* (2026-07-29).

Và hai câu chủ xưởng **hỏi ngược lại** trong `.docx`, đều đang chờ trả lời: cột "LỖI" trên sổ theo dõi đơn
hàng nên làm thế nào, và cách tính tổng giờ sản xuất/ngày để biết cần tăng ca bao lâu. Cả hai **ngoài
phạm vi V2** nhưng ghi lại để không rơi.

---

## 3. ACTOR & VAI TRÒ

Giữ 5 role đã có trong `briefs/alumdoor.json` (A5).

| Role | Nhiệm vụ chính | Phạm vi dữ liệu thấy | Không được làm |
|---|---|---|---|
| **Chủ xưởng** | Chốt danh mục, công thức cửa, ngưỡng; xem toàn bộ | Tất cả, mọi kho | — |
| **Thủ kho** | Đếm và ghi sổ: nhập, xuất, chuyển kho, kiểm kê | Tất cả kho; thấy số lượng + giá vốn | Sửa công thức cửa, sửa danh mục Item |
| **Sản xuất** | Trích nhôm để cắt, ghi phiếu cắt, ghi đầu thừa | Tồn theo khổ (số lượng), lệnh của mình | **Không thấy giá vốn**, không ghi sổ tiền |
| **Kế toán** | Đối chiếu sổ, kiểm kê, xử lý chênh lệch, khoá kỳ | Toàn bộ sổ + tiền | Sửa số tồn trực tiếp |
| **Kinh doanh** | Tra tồn khả dụng trước khi hứa với khách | Tồn **khả dụng** theo khổ, mọi kho | Không thấy giá vốn; không ghi sổ kho |

**Ranh giới quan trọng:** *Sản xuất* thấy **số lượng** nhưng không thấy **tiền** — vì thợ cần biết còn bao
nhiêu lá khổ 3,8 m, không cần biết lá đó giá bao nhiêu. Enforce ở **server**, không chỉ ẩn cột.

---

## 4. THỰC THỂ DỮ LIỆU

> 19 entity ⇒ theo `brd-writing-guide.md` §1.1 phải TÁCH FILE. Mục này giữ **bảng chỉ mục**;
> chi tiết field từng entity ở `brd-entities/<slug>.md`.

### 4.0 Hai tầng lưu trữ của Forge — đọc trước khi xem bảng field

Khác app AppWeb (mọi thứ là cột SQL), Forge có **hai tầng**:

| Tầng | Lưu ở đâu | Dùng cho | Hệ quả |
|---|---|---|---|
| **Doctype** | JSON trong `master_records.data_json` (danh mục) hoặc `documents.payload_json` (chứng từ) | Item, Kho, Công thức cửa, phiếu nhập/xuất/cắt | Thêm trường = sửa brief, không cần migration |
| **Sổ (ledger)** | **Cột SQL thật** — `stock_ledger_entries`, `gl_entries`, `payment_ledger_entries` | Sổ kho, sổ cái | Đổi cột = **phải viết migration**; đây là nơi tiền và tồn sống |

Nên bảng field dưới dùng cột **"Kiểu (Forge)"** thay cho "Kiểu D1", và ghi rõ **"Lưu ở đâu"**.
Cột **"Nhân ĐỌC?"** (đặc thù Forge — khai sai tên trường thì lệnh ghi vẫn THÀNH CÔNG nhưng không sinh
bút toán nào) để dành cho Field Ledger ở PHA 3, không lặp ở BRD.

### 4.1 Bảng chỉ mục entity

| # | Entity | Tầng | Vai trò | File chi tiết | Trạng thái |
|---|---|---|---|---|---|
| E01 | **Item** — Hàng hoá / Vật tư | Doctype (danh mục) | Sự thật ỔN ĐỊNH của một mặt hàng | [item.md](brd-entities/item.md) | ✅ |
| E02 | **Aluminium Batch** — Lô nhôm | Doctype + khoá vào ledger | Màu · khổ · tình trạng · kg thực cân của MỘT chuyến hàng cụ thể (QĐ-1) | [aluminium-batch.md](brd-entities/aluminium-batch.md) | ✅ |
| E03 | **Stock Ledger Entry** — Sổ kho | **Ledger (SQL)** | Quyển sổ DUY NHẤT của tồn; bất biến | [stock-ledger-entry.md](brd-entities/stock-ledger-entry.md) | ✅ |
| E04 | **Measurement Profile** — Bộ quy cách | Doctype (danh mục) | Item cần đại lượng vật lý nào; giữ kerf + ngưỡng phế + bản lá | [measurement-profile.md](brd-entities/measurement-profile.md) | ✅ |
| E05 | **Warehouse** — Kho | Doctype (danh mục, cây) | K36 · K12 · kho ĐẦU THỪA (loại khỏi khả dụng) | [warehouse.md](brd-entities/warehouse.md) | ✅ |
| E06 | **Item Group** — Nhóm hàng | Doctype (danh mục, cây) | Phân nhóm; quyết định phương pháp giá vốn theo nhóm | [danh-muc-nho.md](brd-entities/danh-muc-nho.md#e06--item-group-nhóm-hàng--tree) | ✅ |
| E07 | **UOM** — Đơn vị tính | Doctype (danh mục) | 14 đơn vị + **LÁ** + **THÂN** (thiếu ở bản cũ) | [danh-muc-nho.md](brd-entities/danh-muc-nho.md#e07--uom-đơn-vị-tính) | ✅ |
| E08 | **UOM Conversion** | Child của Item | Hệ số TĨNH — dùng cho ray/trục/phụ kiện, **KHÔNG dùng cho nhôm** (QĐ-2) | [danh-muc-nho.md](brd-entities/danh-muc-nho.md#e08--uom-conversion-child-của-item) | ✅ |
| E09 | **Item Color** — Màu | Doctype (danh mục) | 24 màu chuẩn + THÔ; bảng quy đổi mã cũ đã chốt | [danh-muc-nho.md](brd-entities/danh-muc-nho.md#e09--item-color-màu) | ✅ |
| E10 | **Cutting Policy** — Công thức cửa | Doctype (danh mục) | Hằng số trừ theo dòng cửa **và theo loại ray U75/U100** | [cutting-policy.md](brd-entities/cutting-policy.md) | ✅ |
| E11 | **Supplier** — Nhà cung cấp | Doctype (danh mục) | Tiến Đạt, Anh Đạt Motor, Bột Sơn Ti Gia…; **+ `receipt_tolerance_pct`** | [danh-muc-nho.md](brd-entities/danh-muc-nho.md#e11--supplier-nhà-cung-cấp) | ✅ |
| E13 | **Delivery Note** (+ Item) — Phiếu xuất bán | Doctype (chứng từ) | ⚠️ **VA CHẠM PHẠM VI** — `against_sales_order` là **required** trong doctype hiện tại, mà Sales Order thuộc chuỗi thương mại đã bị QĐ-4 đẩy ra ngoài phạm vi. Không xuất được hàng nếu không có đơn bán. Phải quyết ở Cổng 2 — xem §0.2 Q8 | ⏳ | ⚠️ chặn |
| E12 | **Purchase Receipt** (+ Item) — Phiếu nhập mua | Doctype (chứng từ) | Cửa giao tiếp #1; nơi bắt kg thực cân + số cây + khổ | [purchase-receipt.md](brd-entities/purchase-receipt.md) | ✅ |
| E14 | **Stock Entry** (+ Item) — Phiếu chuyển/điều chỉnh kho | Doctype (chứng từ) | Chuyển K36↔K12; điều chỉnh (KHÔNG sửa tồn trực tiếp) | ⏳ | ⏳ |
| E15 | **Stock Reconciliation** (+ Item) — Kiểm kê | Doctype (chứng từ) | Đếm thực tế; chênh lệch bắt buộc chọn **nguyên nhân** | [stock-reconciliation.md](brd-entities/stock-reconciliation.md) | ✅ |
| E16 | **Cut Order** (+ Item) — Phiếu cắt | Doctype (chứng từ) | Trích lô theo khổ, tính kerf, sinh đầu thừa | [cut-order.md](brd-entities/cut-order.md) | ✅ |
| E17 | **Stock Reservation** — Giữ chỗ | Doctype | Giữ theo (mã · màu · tình trạng · **khổ tối thiểu**), không khoá lô cụ thể | [stock-reservation.md](brd-entities/stock-reservation.md) | ✅ |
| ~~E18~~ | ~~Supplier Delivery Ledger~~ → **BÁO CÁO, không phải entity** | — | ❌ **ĐÃ HUỶ 2026-07-29.** Sổ đã tồn tại: `purchase_order_progress_entries` (migration `0005_erp_core.sql`) — đủ `purchase_order · kind · item_code · qty_micros · posting_at` + index + trigger, ghi bằng đơn vị tồn. *"Còn nợ bao nhiêu cây"* = `đã đặt − SUM(kind='Receipt')`; *"lịch sử ngày hàng về"* = đọc bảng đó theo `posting_at`. Dựng doctype mới là **đẻ trùng sổ** — đúng lỗi mà cả BRD này sinh ra để chống | — | ❌ huỷ |
| ~~E19~~ | ~~Import Job~~ → **dùng bảng nền tảng** | Ledger (SQL) | ❌ **ĐÃ HUỶ 2026-07-29.** `import_jobs` đã có ở `0004_frappe_platform.sql`, `status` gồm sẵn `'Preview'` ⇒ wizard 5 bước map thẳng vào, không dựng bảng mới | — | ❌ huỷ |

### 4.2 Danh mục dùng chung (`master-data-contract.md` §5)

Luật: mọi field "chọn 1 trong danh sách admin tự cấu hình được" PHẢI là doctype riêng, **cấm hardcode**.

| Danh mục | Field nào / entity nào dùng | Cha-con? | Seed mặc định | Ai sửa |
|---|---|---|---|---|
| **Nhóm hàng** (E06) | `Item.item_group` | ✅ cây | 13 nhóm đang có | Chủ xưởng |
| **Đơn vị tính** (E07) | `Item.stock_uom`, `.default_purchase_uom`, `.default_sales_uom`, `UOM Conversion.uom`, mọi dòng chứng từ | Không | 14 UOM hiện có **+ LÁ + THÂN** | Chủ xưởng |
| **Màu** (E09) | `Aluminium Batch.color`, `Cut Order Item.color`, `Item.default_color`, `Item Allowed Color` | Không | 24 màu (18 STĐ + 5 mạ + THÔ) | Chủ xưởng |
| **Kho** (E05) | `Stock Ledger Entry.warehouse`, mọi dòng chứng từ, `Item.default_warehouse` | ✅ cây | Kho Alumdoor › K36 · K12 · **Đầu thừa** | Chủ xưởng |
| **Bộ quy cách** (E04) | `Item.measurement_profile` | Không | 6 bộ hiện có | Chủ xưởng |
| **Công thức cửa** (E10) | `Item.cutting_policy` | Không | 5 dòng cửa + biến thể ray U75/U100 | Chủ xưởng |
| **Nhà cung cấp** (E11) | `Purchase Receipt.supplier`, `Supplier Delivery Ledger.supplier` | Không | Tiến Đạt · Anh Đạt Motor · Bột Sơn Ti Gia · Anh Huy Bạc Đạn… | Chủ xưởng, Kế toán |
| **Nguyên nhân chênh lệch kiểm kê** | `Stock Reconciliation Item.variance_reason` | Không | Sai cân đo · Quên ghi · Hỏng/mất · Thợ cắt sai không báo · Khác | Chủ xưởng |
| **Nguyên nhân huỷ/đảo chứng từ** | `*.cancel_reason` (chip lý do Kanban) | Không | Nhập nhầm · Sai số lượng · Sai lô · NCC đổi hàng · Khác | Chủ xưởng, Kế toán |

**Field CHỌN-TỪ-DANH-SÁCH nhưng cố ý giữ enum cứng** (theo `master-data-contract.md` §1 — hằng số kỹ
thuật, không đổi theo khách):

| Field | Vì sao enum cứng |
|---|---|
| `Item.item_nature` (Hàng tồn kho/Dịch vụ/Tài sản) | Quyết định nhánh xử lý của nhân, không phải danh sách khách tự thêm |
| `Item.inventory_mode` | Mỗi giá trị ứng với một nhánh code riêng — thêm giá trị mới mà không có code là app im lặng chạy sai |
| `*.docstatus` (0/1/2) và `status` các chứng từ | State machine, không phải danh mục (`master-data-contract.md` §1 ghi rõ) |
| `Aluminium Batch.condition` (Thô/Đã sơn/Lỗi) | **Cần xác nhận ở Cổng 2** — nếu xưởng có thêm tình trạng khác (đã dập, chờ sơn) thì phải chuyển thành danh mục |

## 5. LUỒNG NGHIỆP VỤ

> 6 luồng ⇒ dưới ngưỡng 10 của `brd-writing-guide.md` §1.1, giữ trong file này.
>
> **Điều chỉnh khuôn cho Forge:** cột *"Làm gì"* của khuôn gốc ghi "màn hình + component React". Forge
> sinh giao diện từ metadata nên đơn vị tương đương là **form / list / action của doctype** — ghi theo
> đúng thực tế đó, không bịa tên component không tồn tại.

---

### F1 — Nhập mua nhôm về kho

| Bước | Ai | Làm gì | Hệ thống làm gì | Ai thấy gì tiếp theo |
|---|---|---|---|---|
| 1 | Thủ kho | List **Phiếu nhập mua** → `Tạo mới`. Chọn NCC, chọn `Đơn mua` ở **từng dòng** (một chuyến xe chở hàng hai đơn thì hai dòng trỏ hai đơn) | Tự điền `supplier_group`, `company`, `currency`, tiền tệ từ đơn mua | Form phiếu với bảng dòng trống |
| 2 | Thủ kho | Bấm **Đọc phiếu bằng ảnh** → chụp bảng kê NCC | `alumdoor.ocr.read` — Workers AI đọc ảnh → đề xuất dòng hàng. **Mã không khớp thì để TRỐNG**, ghi nguyên văn vào ghi chú | Bảng lớn hiện dòng nháp, ô AI điền có nền nhạt + icon ✨ |
| 3 | Thủ kho | Soát và sửa từng dòng: mã hàng, **màu**, **tình trạng** (Thô/Đã sơn), **khổ**, **số cây ĐẾM được**, **kg thực cân**, đơn giá, kho nhập | Tự tính `total_length_m`, `theoretical_kg`, `weight_variance_pct`. Lệch > ngưỡng → **cảnh báo vàng ngay tại dòng**, không chặn | Thủ kho thấy dòng nào lệch cân bất thường trước khi ghi sổ |
| 4 | Thủ kho | Đính **ảnh hàng nhận** + ảnh phiếu giấy NCC | Nén client ≤ 500 KB, lên R2, key `purchase-receipt/<id>/<uuid>.jpg` | Thumbnail trên phiếu |
| 5 | Thủ kho | Bấm **Ghi sổ** | Gom dòng `byOrder` → kiểm hạn mức **theo từng đơn** với dung sai `supplier.receipt_tolerance_pct`. Mỗi dòng nhôm: **tạo `Aluminium Batch`** + ghi **1 bút toán** `+cây / +kg` kèm `batch_no`. Ghi `purchase_order_progress_entries`. Audit **cùng transaction** | Thủ kho: toast *"Đã nhập PNM-2026-0031 — 3 lô mới"*. Kinh doanh: tồn khả dụng tăng. Chủ xưởng: dashboard *"Nhôm NCC còn nợ"* giảm |
| 6 | Thủ kho | Bấm **In tem lô** | Sinh tem 35×22 mm mỗi lô: mã lô + mã nhôm + màu + khổ + QR | Dán lên bó nhôm — lần sau quét là ra thẻ lô |

**Nhánh lỗi:**

| Bước | Lỗi | Hệ thống phản ứng |
|---|---|---|
| 3 | Mặt hàng theo lô mà thiếu màu/khổ | 422 *"Nhôm cây/lá phải có màu và khổ mới tạo được lô"* |
| 3 | Mặt hàng catch-weight mà thiếu kg | 422 *"Mặt hàng cân theo kiện phải ghi khối lượng"* |
| 5 | **Nhận vượt trong dung sai** | ✅ Ghi sổ, **đơn ĐÓNG**, lưu chênh lệch. Toast *"Đơn DMH-2026-0076 nhận 210/200 cây — trong dung sai 5%, đã đóng đơn"* |
| 5 | **Nhận vượt quá dung sai** | 422 *"Đơn DMH-2026-0076 đặt 200 cây, đã nhận 195, chuyến này 20 → vượt 15 cây so với mức cho phép (±5% = 10). Sửa đơn mua hoặc tạo đơn mới."* |
| 5 | Nhận thiếu | ✅ Ghi sổ, **đơn vẫn MỞ** — nhà máy còn nợ, không tự tất toán |
| 5 | Kỳ đã khoá | 422 *"Kỳ kế toán tháng 6/2026 đã khoá — không ghi sổ lùi ngày được"* |
| 5 | Submit hai lần | PK sổ `(voucher_type, voucher_no, revision, line_key)` chặn; dòng đã có `batch` thì **dùng lại**, không tạo lô thứ hai |

---

### F2 — Giữ chỗ khi phát lệnh sản xuất

| Bước | Ai | Làm gì | Hệ thống làm gì | Ai thấy gì tiếp theo |
|---|---|---|---|---|
| 1 | Kế toán | Mở lệnh sản xuất → bấm **Phát lệnh** | Đọc `Cutting Policy` → tính **số lá + rộng cắt** cho từng bộ cửa → suy ra yêu cầu `(mã · màu · tình trạng · khổ tối thiểu)` | Bảng "Nhôm cần giữ" hiện trước khi xác nhận |
| 2 | Kế toán | Xác nhận | Tạo `Stock Reservation` từng dòng. Kiểm **khả dụng đọc dồn theo khổ** trước khi ghi | Kinh doanh: tồn khả dụng tụt tương ứng. Sản xuất: lệnh vào hàng đợi cắt |
| 3 | Sản xuất | Cắt (F3) | Nhả đúng phần đã cắt, `qty_reserved` giảm dần | — |
| 4 | Hệ thống | Cron sáng | Quét `expires_at` quá hạn → `state = Hết hạn`, khả dụng trả lại | Người phụ trách lệnh nhận thông báo in-app |

**Nhánh lỗi:**

| Bước | Lỗi | Phản ứng |
|---|---|---|
| 2 | Không đủ khả dụng | 422 kèm **ba số**: *"Chỉ còn 12 lá khổ ≥ 4,5 m khả dụng (tổng 18, đã giữ 6) — không giữ được 20"* |
| 2 | Hai lệnh cùng xin | Lệnh sau bị chặn ở phần còn lại; **không** cho cả hai giữ cùng số lá |
| 4 | Cron không chạy | ⚠️ Giữ chỗ mồ côi tích tụ, khả dụng tụt dần không lý do → `/api/health` phải báo lần chạy cron cuối |

---

### F3 — Cắt nhôm

| Bước | Ai | Làm gì | Hệ thống làm gì | Ai thấy gì tiếp theo |
|---|---|---|---|---|
| 1 | Sản xuất | Màn **Cắt nhôm** → nhập CPB, RPB, số bộ, nhóm khách | `alumdoor.cut.propose`: đọc `Cutting Policy` theo `(door_type, ray_type, item_group)` → tính rộng cắt lá + số lá (trừ 1 rồi làm tròn ngưỡng 0,6) + kg dự toán | Bản xem trước ba số: **rộng cắt · số lá · kg** |
| 2 | Sản xuất | Bấm **Đề xuất lô** | **Kiểm kho Đầu thừa TRƯỚC.** Không đủ dài mới sang kho chính, chọn lô khổ nhỏ nhất còn đủ. Lọc theo mã·màu·tình trạng, bỏ phần đã giữ chỗ | Danh sách lô đề xuất, mỗi lô ghi rõ ở kho nào, khổ bao nhiêu |
| 3 | Sản xuất | Quét tem lô hoặc chọn tay, nhập số lá lấy từng lô | Tính `cuts_count`, `kerf_total_m = kerf_mm × nhát ÷ 1000`, `offcut_length_m` | Thấy trước đầu thừa còn lại bao nhiêu mét |
| 4 | Sản xuất | Bấm **Ghi sổ** | Mỗi dòng: **2 bút toán** — xuất lô mẹ `−lá / −kg`, nhập đầu thừa `+1 cây / +kg`. Đầu thừa **thừa hưởng giá vốn lô mẹ theo tỉ lệ chiều dài**. Nhả giữ chỗ đúng phần đã cắt | Sản xuất: toast + phiếu cắt in được. Thủ kho: kho Đầu thừa có lô mới. Kế toán: giá vốn ghi đúng lô bị cắt |
| 5 | Sản xuất | Bấm **In phiếu cắt** | A5, **số đo in TO** cho thợ đọc ngoài xưởng, có QR | Thợ cầm ra máy cắt |

**Nhánh lỗi:**

| Bước | Lỗi | Phản ứng |
|---|---|---|
| 1 | Hai chính sách cùng mức ưu tiên | 422 *"Có 2 công thức cùng mức ưu tiên cho «Cửa Đức + U75». Sửa độ ưu tiên hoặc ngừng bớt một cái — hệ thống không đoán."* |
| 3 | **Chưa khai ngưỡng đầu thừa** | 422 *"Chưa khai ngưỡng đầu thừa cho «AL595» — hỏi chủ xưởng: đoạn ngắn hơn bao nhiêu mét thì bỏ hẳn?"* — **chặn cắt**, không đoán |
| 3 | Rộng cắt > khổ cây | 422 *"Rộng cắt 4,10 m lớn hơn khổ cây 3,95 m — chọn lô khác"* |
| 4 | Không đủ lá | 422 kèm **số lá thiếu**; **không cắt một phần im lặng** |
| 4 | Đầu thừa dưới ngưỡng | Không tạo lô, ghi `scrap_m`, hàng ra khỏi tồn — bán phế theo kg |
| — | Hoàn cắt | Bút toán đối dấu **đúng `kg_consumed` đã ghi lần đầu**, không tính lại theo số hiện tại; lô đầu thừa bị đảo theo |
| — | Trả hàng sau cắt | **Tạo lô khổ MỚI**, không nhập lại khổ gốc — nhôm đã thành lá rồi |

---

### F4 — Chuyển kho K36 ↔ K12

| Bước | Ai | Làm gì | Hệ thống làm gì | Ai thấy gì tiếp theo |
|---|---|---|---|---|
| 1 | Thủ kho | **Phiếu kho** → `purpose = Material Transfer` | — | Bảng dòng |
| 2 | Thủ kho | Quét tem lô, nhập số lá + kg, chọn kho nguồn/đích **trên từng dòng** | Kiểm tồn **ở kho nguồn** đủ không | — |
| 3 | Thủ kho | Ghi sổ | **2 bút toán cùng `batch_no`**: `−` ở nguồn, `+` ở đích. **`received_warehouse` của lô KHÔNG đổi** | Lô hiện ở hai kho nếu chuyển một phần |

**Nhánh lỗi:** thiếu ở kho nguồn → 422 *"Lô LO-2026-00042 chỉ còn 3 lá ở K36"*. Chuyển vào **nút nhóm** → 422 *"«Kho Alumdoor» là nút nhóm, không phát sinh tồn"*.

---

### F5 — Xuất kho

| Bước | Ai | Làm gì | Hệ thống làm gì | Ai thấy gì tiếp theo |
|---|---|---|---|---|
| 1 | Thủ kho | **Phiếu xuất kho** → chọn `issue_purpose` (Bán hàng / Xuất mẫu / Đổi bảo hành / Xuất nội bộ / Xuất gia công) | `Bán hàng` → hiện ô khách + đơn bán (**tuỳ chọn**). Mục đích khác → ẩn | — |
| 2 | Thủ kho | Chọn mặt hàng, lô, số lượng, kho xuất | Bán thành phẩm theo m²: máy chủ tính `billable_area_sqm` từ `Cutting Policy`, **ô m² read-only** | Người bán không gõ đè được diện tích |
| 3 | Thủ kho | Chụp **ảnh kiện hàng** | Lên R2 | — |
| 4 | Thủ kho | Ghi sổ | Kiểm **KHẢ DỤNG** (đã trừ giữ chỗ), không phải tồn tổng. Ghi bút toán `−cây / −kg` theo `batch_no`. Ghi lại `formula_policy` + `width_basis` + `cut_width_m` đã áp | Kế toán: giá vốn theo đúng lô. Kinh doanh: khả dụng giảm |
| 5 | Người giao | Giao hàng → chụp **ảnh tại điểm giao** | Proof-of-delivery gắn phiếu, **bất biến** | Xử tranh chấp *"chưa nhận được hàng"* |

**Nhánh lỗi:**

| Lỗi | Phản ứng |
|---|---|
| Tồn không đủ | 422 — **chốt chặn kho âm**, không ghi sổ một phần |
| Tồn tổng đủ nhưng khả dụng không đủ | 422 *"Tồn 18 lá nhưng 6 lá đã giữ cho lệnh SX LSX-2026-0012 — chỉ xuất được 12"* |
| Giá bán dưới giá vốn | ⚠️ Cảnh báo AI trên dòng, **không chặn** — có thể là hàng thanh lý |

---

### F6 — Kiểm kê

| Bước | Ai | Làm gì | Hệ thống làm gì | Ai thấy gì tiếp theo |
|---|---|---|---|---|
| 1 | Thủ kho | **Kiểm kê** → chọn kho + phạm vi → `Chốt số sổ` | **CHỤP số sổ tại `snapshot_at`** vào `book_qty`/`book_weight_kg` từng dòng | Danh sách lô cần đếm, cột "Số sổ" đã khoá |
| 2 | Thủ kho | Ra kho, quét tem lô, nhập số đếm + kg cân | Tính `variance_*` ngay | Dòng lệch tô màu |
| 3 | Thủ kho | Chọn **nguyên nhân** cho từng dòng lệch | Bắt buộc, không cho bỏ trống | — |
| 4 | Thủ kho | Nộp → `Chờ duyệt` | — | Chủ xưởng nhận thông báo |
| 5 | **Chủ xưởng** | Duyệt | Sinh bút toán điều chỉnh **tại `snapshot_at`**, chỉ cho dòng lệch. Audit ai đếm / ai duyệt | Kế toán: sổ khớp thực tế. Báo cáo chênh lệch cập nhật |
| 6 | Kế toán | In **Biên bản kiểm kê A4** | Hai chữ ký + số chứng từ + QR + mọi dòng lệch kèm nguyên nhân | Lưu hồ sơ — yêu cầu pháp lý TT99/2025 |

**Nhánh lỗi:**

| Lỗi | Phản ứng |
|---|---|
| Có phiếu phát sinh sau `snapshot_at` | ⚠️ Cảnh báo *"Có 3 phiếu phát sinh sau thời điểm chốt số. Số điều chỉnh vẫn tính theo mốc đã chốt."* — **không chặn** |
| Dòng lệch thiếu nguyên nhân | 422 *"Dòng AL548 lệch −3 lá — phải chọn nguyên nhân trước khi ghi sổ"* |
| Người đếm tự duyệt | 403 — tách vai bắt buộc |
| Sửa sau khi đã ghi sổ | 422 — **bất biến**; sai thì lập phiếu kiểm kê mới |

## 6. MA TRẬN QUYỀN

### 6.0 Cơ chế quyền của Forge — khác AppWeb, phải nói rõ

Khuôn gốc (`brd-writing-guide.md` §6) yêu cầu liệt kê **từng endpoint HTTP tự viết**. Forge không hoạt
động vậy: app **không tự viết route CRUD**. Quyền gắn vào **doctype + chữ cái**, router của nền tảng
resolve ra endpoint. Nên ma trận dưới bind vào `(doctype, letters)` và `(action)` — đó là đơn vị nhân
thật sự đọc, không phải một danh sách URL bịa ra cho đẹp biểu mẫu.

**Sáu chữ quyền** (`scripts/lib/compile-brief.mjs:19-21`, đã đọc):

| Chữ | Nghĩa |
|---|---|
| `r` | đọc |
| `w` | sửa |
| `c` | tạo |
| `s` | ghi sổ (submit) |
| `x` | huỷ (cancel) |
| `a` | sửa lại sau huỷ (amend) |

> **KHÔNG có chữ `d` (delete).** Compiler **từ chối** chữ `d` chứ không nhận-rồi-lờ-đi, kèm ghi chú
> *"the difference matters"*. Tức bất biến **"không xoá cứng"** của BRD này (§2.2 mục 2) **được nền tảng
> ép sẵn ở tầng biên dịch** — không phải quy ước trên giấy. Không ai cấp được quyền xoá kể cả muốn.

Chữ `w`/`c`/`s`/`x`/`a` **kéo theo `r`** (compiler tự điền quyền đọc ngầm).

---

### 6.1 Ma trận doctype

| Doctype | Chủ xưởng | Thủ kho | Sản xuất | Kế toán | Kinh doanh |
|---|---|---|---|---|---|
| **Item** | `rwc` | `rwc` | `r` | `r` | `r` |
| **Measurement Profile** | `rwc` | `r` | `r` | `r` | `r` |
| **Cutting Policy** | `rwc` | `r` | `r` | `r` | `r` |
| **Item Group · UOM · Item Color · Warehouse** | `rwc` | `rwc`¹ | `r` | `r` | `r` |
| **Supplier** | `rwc` | `r` | — | `rwc` | `r` |
| **Aluminium Batch** | `rwc` | `rwc` | `r` | `r` | `r` |
| **Purchase Receipt** | `rwcsxa` | `rwcsxa` | — | `rwcsxa` | `r` |
| **Delivery Note** | `rwcsxa` | `rwcsxa` | — | `rwcsxa` | `r` |
| **Stock Entry** | `rwcsxa` | `rwcsxa` | `rwc`² | `rwcsxa` | `r` |
| **Cut Order** | `rwcsxa` | `rwcsxa` | `rwcsxa` | `r` | — |
| **Stock Reconciliation** | `rwcsxa` | `rwc`³ | — | `rwcs` | — |
| **Stock Reservation** | `rwcsxa` | `r` | `r` | `r` | `r` |

¹ Thủ kho sửa được Kho (thêm kệ/khu) nhưng **không** sửa được Item — tránh việc đổi ĐVT tồn giữa chừng.
² Sản xuất **tạo** được phiếu xuất vật tư nhưng **không ghi sổ** được — thủ kho ghi.
³ Thủ kho **đếm** nhưng **không duyệt** (thiếu `s`) — tách vai bắt buộc, xem F6.

---

### 6.2 Ma trận action (nghiệp vụ, không phải CRUD)

| Action | Chủ xưởng | Thủ kho | Sản xuất | Kế toán | Kinh doanh | Ghi chú |
|---|---|---|---|---|---|---|
| `tinh-cong-thuc-cua` — máy tính công thức | ✅ | ✅ | ✅ | ✅ | ✅ | Chỉ tính, không ghi gì |
| `de-xuat-lo-cat` — đề xuất lô | ✅ | ✅ | ✅ | — | — | Chỉ đọc |
| `cat-nhom` — cắt | ✅ | ✅ | ✅ | — | — | Ghi sổ |
| `hoan-cat` — hoàn cắt | ✅ | ✅ | ✅ | — | — | Bắt buộc lý do |
| `tra-hang` — trả hàng sau cắt | ✅ | ✅ | — | — | — | Sinh lô khổ mới |
| `giu-cho` / `nha-giu-cho` | ✅ | — | — | ✅ | — | Mốc = phát lệnh SX |
| `chot-so-so-kiem-ke` | ✅ | ✅ | — | ✅ | — | Chụp số sổ |
| `duyet-kiem-ke` | ✅ | ❌ | — | ❌ | — | **Chỉ Chủ xưởng** (K2 — chờ chốt) |
| `doc-anh-chung-tu` — OCR phiếu | ✅ | ✅ | — | ✅ | — | Ra bản nháp |
| `khoa-ky` / `mo-ky` | ✅ | — | — | — | — | Bắt buộc lý do (S2) |
| `hoi-ai` | ✅ | ✅ | ✅ | ✅ | ✅ | Chạy **dưới session người hỏi** |

---

### 6.3 Scope hàng — ai thấy dòng nào

Cách ly khách↔khách là **vật lý** (1 D1/tenant, ADR-001) — **không** dùng cột `tenant_id` trong query.
Scope dưới đây là scope **TRONG một khách**:

| Role | Scope |
|---|---|
| Chủ xưởng · Kế toán | Mọi kho, mọi chứng từ |
| Thủ kho | Mọi kho (xưởng chỉ có K36/K12; nếu sau này phân thủ kho theo kho thì scope theo `Warehouse.keeper`) |
| Sản xuất | Mọi lô **về số lượng**; chứng từ cắt của mình |
| Kinh doanh | Tồn **khả dụng** mọi kho; chứng từ bán |

---

### 6.4 ⚠️ Rủi ro chưa gỡ: quyền theo TRƯỜNG

BRD §3 chốt **"Sản xuất thấy số lượng nhưng KHÔNG thấy tiền"** — thợ cần biết còn bao nhiêu lá khổ 3,8 m,
không cần biết lá đó giá bao nhiêu.

Nhưng ma trận trên là **quyền theo DOCTYPE**, không phải theo trường. Cho `Sản xuất` quyền `r` trên
`Aluminium Batch` là cho đọc **cả** `valuation_rate` nếu trường đó nằm trên cùng doctype.

### ✅ ĐÃ XÁC MINH 2026-07-30 — nhân KHÔNG có quyền theo trường

Grep `permlevel` · `field_level` · `mask` trong `packages/policy/src` → **không dòng nào**. Cộng với
`PERMISSION_LETTERS` chỉ có 6 chữ ở mức **doctype** (`compile-brief.mjs:19`), và mọi doctype trong brief
khai `permissions: { role: "letters" }` — mô hình quyền của Forge là **theo doctype, không theo trường**.

⇒ **Chọn đường (b): giá vốn KHÔNG nằm trên doctype mà Sản xuất đọc được.**

| Nơi | Có gì | Sản xuất |
|---|---|---|
| `Batch` (doctype) | danh tính: mã · màu · tình trạng · khổ · kho nhập | ✅ `r` |
| `stock_ledger_entries` (sổ SQL) | **số lượng VÀ tiền** | ❌ không quyền |
| Báo cáo `Tồn nhôm theo khổ` | chỉ cột số lượng + khả dụng | ✅ |
| Báo cáo `Stock Ledger` | có giá vốn | ❌ |

Nhất quán với QĐ-1 một cách gọn gàng: **batch giữ danh tính, sổ giữ số và tiền**. Thợ tra khổ và số lá
qua báo cáo tồn — thứ họ cần — mà không đi qua chỗ có giá vốn.

⚠️ Hệ quả phải nhớ ở PHA 5: **không được thêm trường giá vốn nào lên `Batch`** cho tiện hiển thị. Thêm một
lần là thủng cả lớp phân quyền này, và thủng im lặng.

## 7. MÀN HÌNH MVP

### 7.0 Screen Spec của Forge khác AppWeb — nói rõ chỗ lệch

Khuôn gốc (`brd-writing-guide.md` §4) đòi mỗi màn 6 khối, trong đó **Khối 2 = "Layout Desktop / Mobile,
hai cột riêng, cấm ghi giống desktop"** và **Khối 3 = bảng component đến từng component nhỏ nhất**.

Forge **không dựng màn hình bằng tay**: khai `navigation.items` là ra list + form; cột list lấy từ mảng
`list` của doctype; form dựng từ `fields` + `Tab Break`/`Section Break` + `depends_on`. Shell 3 cột,
Ctrl+K, link picker, bảng lớn kiểu Excel đều **của nền tảng**, dùng chung mọi app.

Nên hai khối đó **không áp dụng** — không có component riêng của app để mà kê. Thay bằng:

| Khối gốc | Ở đây |
|---|---|
| 1. Định danh | ✅ giữ |
| 2. Layout desktop/mobile | ❌ **không áp dụng** — shell của nền tảng, app không đổi được |
| 2b. Nghiệp vụ bắt buộc | ✅ giữ nguyên, đã kê trong từng file `brd-entities/*.md` |
| 3. Bảng component | ➜ **thay bằng: khai metadata** (`list` · `search` · action · report) |
| 4. Bảng hành động | ✅ giữ |
| 5. Bảng autofill | ✅ giữ — đã kê ở `brd-entities/*.md` |
| 6. 7 trạng thái màn hình | ➜ **của nền tảng**, app không tự làm; chỉ khai chỗ app cần câu chữ riêng |

---

### 7.1 Khai navigation V2

**Đổi `home`:** `"Sales Order"` → **`"report:Tồn nhôm theo khổ"`**.
Lý do: nỗi đau #1 chỉ định màn chính (§1.1), và đơn bán nằm ngoài phạm vi V2.

**`groups`** rút từ 8 xuống **5**: `Kho · Mua hàng · Sản xuất · Báo cáo · Danh mục`
(bỏ `Bán hàng` gộp vào Kho, bỏ `Công nợ` và `Bảo hành` — ngoài phạm vi QĐ-4).

```
Kho        Aluminium Batch · Stock Entry · Delivery Note · Stock Reconciliation · Stock Reservation
Mua hàng   Purchase Receipt · action:doc-anh-chung-tu
Sản xuất   Cut Order · action:cat-nhom · action:hoan-cat · action:tra-hang · action:tinh-cong-thuc-cua
Báo cáo    report:Tồn nhôm theo khổ · report:Stock Balance · report:Stock Ledger
           report:Đầu thừa dùng lại được · report:NCC còn nợ hàng · report:Chênh lệch kiểm kê
Danh mục   Item · Item Group · UOM · Warehouse · Item Color · Measurement Profile
           · Cutting Policy · Supplier
```

⚠️ **`Danh mục` là nhóm sidebar RIÊNG**, không chìm trong Cài đặt — `master-data-contract.md` §3 ghi rõ.

---

### 7.2 Màn chính — `Tồn nhôm theo khổ` (làm mẫu đầy đủ)

**1. Định danh:** report `Tồn nhôm theo khổ` · `home` của app · mọi role · nguồn: `stock_ledger_entries`
gộp theo `(item_code, color, condition, length_m, warehouse)` trừ `Stock Reservation`.

**2b. Nghiệp vụ bắt buộc:**

| §2 | Khai |
|---|---|
| 4 Báo cáo | ✅ chính nó |
| 7 Kanban | Không áp dụng — báo cáo, không có giai đoạn |
| 8 AI | ✅ ô **"Hỏi AI"**: *"còn bán được bao nhiêu lá AL548 khổ trên 4 m"* → chạy **dưới session người hỏi** |
| 18 Lịch sử | Không áp dụng — bấm dòng mở thẻ lô, lịch sử ở đó |
| 6 Mã vạch | ✅ quét tem lô → nhảy thẳng dòng đó |
| 19 Danh mục | Bộ lọc mã/màu/kho đều là Link Field |

**3. Metadata:** cột `Mã nhôm · Màu · Tình trạng · Khổ (m) · Tổng · Giữ chỗ · **Khả dụng** · Kho`.
Nhóm theo mã+màu+tình trạng, trong mỗi nhóm **xếp khổ giảm dần và cộng dồn**:

```
AL548 · GHI SẦN · Đã sơn
   khổ ≥ 4,5 m :   12 khả dụng   (tổng  18, giữ chỗ  6)
   khổ ≥ 3,8 m :   52 khả dụng   (tổng  70, giữ chỗ 18)
   khổ ≥ 3,0 m :  145 khả dụng   (tổng 180, giữ chỗ 35)
```

**4. Hành động:**

| Thao tác | Đi đâu | Ghi chú |
|---|---|---|
| Bấm một mức khổ | Mở list `Aluminium Batch` đã lọc sẵn `length_m ≥ L` | 100% số phải bấm được (`polish-contract`) |
| `Cắt từ đây` | Mở `action:cat-nhom` prefill mã·màu·khổ | Prefill chéo bắt buộc |
| Xuất Excel | Theo **bộ lọc hiện tại**, không phải trang đang xem | `data-table-contract` |

**5. Autofill:** không áp dụng — màn chỉ đọc, không có form.

**6. Trạng thái:** loading/empty/lỗi do nền tảng lo. Câu chữ riêng của app:
- Chưa có lô nào → *"Chưa nhập nhôm. Tạo Phiếu nhập mua để bắt đầu."* + nút
- Lọc không ra → *"Không có lô nào khớp"* + nút xoá lọc
- **Chưa khai `scrap_threshold_m`** → banner vàng *"Chưa khai ngưỡng đầu thừa — chưa cắt được. Hỏi chủ xưởng."*

---

### 7.3 Các màn còn lại — bảng chỉ mục

| # | Màn | Kiểu | Đặc tả chi tiết ở |
|---|---|---|---|
| S1 | **Tồn nhôm theo khổ** | report · `home` | §7.2 ↑ |
| S2 | Lô nhôm | doctype list+form | [aluminium-batch.md](brd-entities/aluminium-batch.md) |
| S3 | Phiếu nhập mua | doctype submittable | [purchase-receipt.md](brd-entities/purchase-receipt.md) |
| S4 | Phiếu cắt | doctype submittable + Kanban | [cut-order.md](brd-entities/cut-order.md) |
| S5 | Phiếu kho | doctype submittable | [stock-entry.md](brd-entities/stock-entry.md) |
| S6 | Phiếu xuất kho | doctype submittable | [delivery-note.md](brd-entities/delivery-note.md) |
| S7 | Kiểm kê | doctype submittable + Kanban 5 trạng thái | [stock-reconciliation.md](brd-entities/stock-reconciliation.md) |
| S8 | Giữ chỗ | doctype list | [stock-reservation.md](brd-entities/stock-reservation.md) |
| S9 | **Máy tính công thức cửa** | `action:tinh-cong-thuc-cua` | §7.4 ↓ |
| S10 | Cắt nhôm | `action:cat-nhom` | Luồng F3 §5 |
| S11 | Đọc ảnh chứng từ | `action:doc-anh-chung-tu` | Luồng F1 bước 2 |
| S12 | Nhập liệu (wizard 5 bước) | dùng `import_jobs` nền tảng | §7.5 ↓ |
| S13–S20 | 8 màn Danh mục | doctype list+form | [item.md](brd-entities/item.md) · [danh-muc-nho.md](brd-entities/danh-muc-nho.md) · [measurement-profile.md](brd-entities/measurement-profile.md) · [cutting-policy.md](brd-entities/cutting-policy.md) · [warehouse.md](brd-entities/warehouse.md) |
| S21–S25 | 5 báo cáo còn lại | report | §7.6 ↓ |
| S26 | Đăng nhập | **của nền tảng** | App không tự làm — Forge lo auth. `brd-writing-guide.md` §8 không áp dụng |

---

### 7.4 `Máy tính công thức cửa`

Nhập `CLL` hoặc `CPB`, `RLL`/`RPB`, số bộ, nhóm khách, loại ray, có bản bướm → ra **ba số từ MỘT luật**:

| Ra | Dùng ở |
|---|---|
| Rộng cắt lá + **số lá** + kerf | Phiếu cắt |
| **m² tính tiền** | Dòng bán |
| **kg mua dự toán** | Đơn mua |

Đây là màn chống chính cái sai cũ: ba luồng dùng ba bảng số khác nhau. Máy chủ tính, client chỉ hiện.

---

### 7.5 Nhập liệu — wizard 5 bước

Theo `data-table-contract.md`, chạy trên bảng `import_jobs` có sẵn (status đã có `'Preview'`):

`Tải file mẫu` → `Upload` → `Map cột` (AI tự khớp tên lạ, có confidence) → **`Preview + validate TOÀN BỘ`**
(đếm rõ *X hợp lệ / Y lỗi*, xử lý trùng: bỏ qua / ghi đè / tạo mới) → `Kết quả + tải file lỗi`.

**Không ghi dữ liệu ngay sau upload nếu chưa preview/confirm.** Đây là màn nạp lại toàn bộ dữ liệu từ
Excel gốc (A9) nên nó phải chạy đúng ngay lần đầu.

---

### 7.6 Năm báo cáo còn lại

| Báo cáo | Trả lời câu gì |
|---|---|
| `Stock Balance` | Tồn từng mã × kho, có cả cây lẫn kg |
| `Stock Ledger` | Từng bút toán — soi khi sổ và thực tế lệch |
| **`Đầu thừa dùng lại được`** | Còn bao nhiêu đoạn dư, khổ nào, ở đâu — thứ trước nay biến mất sau khi cắt |
| **`NCC còn nợ hàng`** | Đọc `purchase_order_progress_entries`: đặt bao nhiêu, về bao nhiêu, còn nợ mấy cây, kèm **lịch sử từng lần về** (yêu cầu nguyên văn sổ 30/07) |
| **`Chênh lệch kiểm kê`** | Xưởng mất bao nhiêu, vì nguyên nhân gì, theo kỳ/kho |

## 8. NGOÀI PHẠM VI

Theo QĐ-4 — giữ nguyên bản cũ, ghép sau khi lõi đứng vững:

báo giá · đơn bán · hoá đơn · công nợ tiền · thu-chi · chuỗi 8 chứng từ mua · bảo hành · lỗi sản phẩm ·
lịch sản xuất & tăng ca · gia công sơn (Hải Kỳ) · BOM/định mức đầy đủ.

Ngoài ra **không làm** trong V2: bộ khung shell mobile kiểu AppWeb (BottomNav/FAB/PWA banner) — Forge
sinh giao diện từ metadata, không có các component đó.

## 9. RÀNG BUỘC ĐÃ CHỐT

### 9.1 Hằng số nghiệp vụ

| Tham số | Giá trị | Khai ở đâu | Nguồn |
|---|---|---|---|
| Kerf (bề rộng lưỡi cắt) | **3 mm** (chỉnh được) | `Measurement Profile.kerf_mm` | A1 — chuẩn ngành 2–4 mm; chờ Q2 xác nhận |
| Ngưỡng đầu thừa bỏ hẳn | **0,25 m** (TẠM) | `Measurement Profile.scrap_threshold_m` | ✅ chủ xưởng chốt 30/07. ⚠️ Là số TẠM — bản cũ cũng dùng 0,25 và tự nhận là bịa. Để ở Settings, sửa không cần dev |
| Dung sai nhận hàng | **±5%** | `Supplier.receipt_tolerance_pct` | Sổ yêu cầu 30/07 |
| Trừ khi cắt — cửa Đức, ray U75 | đại lý **0,02** · lẻ **0,08** | `Cutting Policy` | ✅ chủ xưởng chốt 29/07 |
| Trừ khi cắt — cửa Đức, ray U100 | chưa dùng ở V2 | `Cutting Policy.ray_type` vẫn dựng, chỉ seed U75 | chủ xưởng chốt 30/07: cửa Đức dùng 0,08. Dựng sẵn chiều `ray_type` để sau thêm U100 khỏi sửa cấu trúc |
| Bản bướm | **0,035** | `Cutting Policy.butterfly_cut_deduction_m` | Bản cũ, giữ |
| Cao phủ bì | `CPB = CLL + **0,5 m**` | `Cutting Policy.height_pb_offset_m` | Sheet `GHI CHÚ` |
| Chia lá — trừ chiều cao | **0,13 m** | `Cutting Policy.leaf_height_deduction_m` | `.docx` |
| Chia lá — làm tròn | **trừ 1 TRƯỚC, làm tròn ngưỡng 0,6 SAU** | `Cutting Policy.leaf_rounding` | ✅ chủ xưởng chốt 29/07 |
| Chia lá — áp cho | **MỌI loại cửa** | `Cutting Policy.leaf_formula` | ✅ chủ xưởng chốt 29/07 |
| Ước số chia — Úc | **0,465**, cộng k = 2 / 1,5 / 1,3 | `Cutting Policy` + `Leaf Variant` | `.docx` |
| Ước số chia — tấm liền Úc | **0,068** | `Cutting Policy.leaf_divisor_const` | `.docx` |
| Ngưỡng cảnh báo lệch cân | **13%** | `Measurement Profile.weight_tolerance_pct` | Sai số đo thật 6,57→8,61 m/cây |
| Mốc giữ chỗ tồn | **phát lệnh sản xuất** | — | A3 — sheet `T6` của xưởng |
| Ngưỡng buộc duyệt kiểm kê | **>5% hoặc >10 lá** | Settings | K3 — chờ chốt |

### 9.2 Quy ước mã hàng

10 tiền tố: `NHOM-` `CUA-` `RAY-` `TRUC-` `MOTO-` `PIN-` `LUOI-` `PK-` `VT-` `DV-`
Chỉ `A–Z 0–9 - .`, tối đa 24 ký tự, **màu KHÔNG bao giờ nằm trong mã**.
Số đo giữ cách xưởng đọc: `4.6D` `U76` `2.4LY` — không đổi thành `46D`.
Nguồn: `docs/ALUMDOOR-QUY-UOC-MA.md`.

### 9.3 Đánh số chứng từ

`PNM-{YYYY}-{####}` nhập mua · `PXK-{YYYY}-{####}` xuất kho · `PK-{YYYY}-{####}` phiếu kho ·
`CN-{YYYY}-{#####}` cắt · `KK-{YYYY}-{####}` kiểm kê · `LO-{YYYY}-{#####}` lô · `GC-{YYYY}-{#####}` giữ chỗ.
Cấp **lúc LƯU** qua counter atomic; **huỷ giữ số**, không tái dùng.

### 9.4 Bất biến kỹ thuật

1. Sổ kho **chỉ INSERT** — sửa = `voucher_revision + 1` đối dấu.
2. **Không có quyền `d`elete** — nền tảng ép ở tầng biên dịch (§6.0).
3. Số lượng lưu **micros** (`qty_scale = 6`), tiền lưu **minor integer** — không có số thực trong sổ.
4. `VALIDATOR_TIMEOUT_MS` = **5.000 ms**, **không hạ lại 2.000 ms**; chậm thì gộp lời gọi ở phía app.
5. Deploy app worker **bắt buộc** `--dispatch-namespace cloudforge-production`; dispatch lan **40–110 giây**
   — trong khoảng đó 401 và "vá không ăn" đều là giả.
6. Tin tự động **mặc định TẮT từng loại** trong Settings — không âm thầm nhắn khách của người ta.
7. `valuation_method` phải **nhất quán giữa các kỳ** (TT99/2025) — đổi giữa chừng bắt buộc ghi audit.

---

## 10. ĐỊNH DANH SẢN PHẨM

Đọc header `briefs/alumdoor.json` (đã xác minh):

| Khoá | Bản cũ | **V2** | Ghi chú |
|---|---|---|---|
| `id` | `alumdoor` | **`alumdoor`** (giữ) | V2 **thay thế** bản cũ chứ không chạy song song ⇒ cùng id, nâng version. Cài đè sẽ chạy migration metadata |
| `name` | `Alumdoor` | `Alumdoor` | — |
| `version` | `1.27.0` (brief) / **`1.26.2`** (đang cài thật) | **`2.0.0`** | ⚠️ Brief và tenant đang **lệch nhau một bản** — phải đối chiếu trước khi deploy |
| `module` · `domain` | `Alumdoor` · `alumdoor` | giữ | — |
| `brand` | `warm` | giữ | — |
| `worker` | `cloudforge-app-alumdoor` | giữ | — |
| `roles` | 5 role | giữ nguyên 5 | A5 |
| `locale.currency` | `VND` | giữ | — |
| `locale.numberFormat` | `#.###,##` | giữ | — |
| `locale.dateFormat` | `dd-mm-yyyy` | **`dd/MM/yyyy`** | chủ xưởng chốt 30/07 — gạch chéo |

**Tier:** `shared` (A4) — 1 D1/tenant `cloudforge-alu`, app worker dùng chung trong dispatch namespace.
Không phải dữ liệu cư dân/công an nên không cần `isolated`.

**Ngành:** `cua-cuon-nhom` — entry derive mới, đã ghi ở `ALUMDOOR-V2-PHA1-RESEARCH.md` §6.

⚠️ **Rủi ro cài đè cùng `id`:** `app_objects` có `FOREIGN KEY … ON DELETE CASCADE` tới `installed_apps`.
Gỡ app là **cascade xoá toàn bộ đăng ký doctype**. V2 bỏ nhiều doctype cũ (`Aluminium Lot`,
`Item Variant Attribute`…) nên phải **diễn tập trên backup** và kiểm migration chạy lần hai không phát
sinh thay đổi — trước khi đụng production.

---

## 11. SCORECARD CỔNG 2 — tự chấm

| # | Tiêu chí | Đạt? | Bằng chứng |
|---|---|---|---|
| 1 | Đủ 11 mục cấu trúc, đúng thứ tự | ✅ | Mục 0–10 của file này |
| 2 | MỌI màn có Screen Spec đủ 6 khối + Khối 2b | ⚠️ | **26 màn / 26 khai.** Nhưng Khối 2 (layout desktop/mobile) và Khối 3 (bảng component) **cố ý không áp dụng** — Forge sinh UI từ metadata, app không sở hữu component nào để kê. Lý do ghi ở §7.0. Khối 2b khai đủ trong từng file `brd-entities/*.md` |
| 3 | MỌI entity có bảng field đủ cột | ✅ | **17/17** — 9 file chi tiết + 5 gộp ở `danh-muc-nho.md`; 2 entity đã **huỷ** vì đẻ trùng sổ có sẵn (ghi rõ lý do trong bảng chỉ mục §4.1) |
| 4 | MỌI luồng có kịch bản per-actor + nhánh lỗi từng bước | ✅ | §5 — 6 luồng F1–F6, mỗi luồng một bảng nhánh lỗi riêng |
| 5 | Ma trận quyền phủ 100% | ✅ | §6.1 doctype × 5 role · §6.2 11 action · §6.3 scope hàng |
| 6 | Danh sách nghiệp vụ bắt buộc (§2 guide): từng mục có kết luận | ✅ | Khai theo TỪNG entity trong `brd-entities/*.md`, mục nào không áp dụng ghi rõ lý do |
| 7 | Assumptions & Câu hỏi mở đã lập, gom 1 lượt | ✅ | §0.1 A1–A9 · §0.2 Q1–Q9; 3 câu đã chốt ghi ✅ tại chỗ |
| 8 | Định danh sản phẩm chốt đủ | ⚠️ | §10 — đủ trừ `locale.dateFormat` (Q9) |
| 9 | Không còn placeholder | ✅ | Không còn "đang viết"/"sẽ bổ sung"/"tương tự trên" |
| 10 | Nhật ký đọc contract đủ MỌI file, cột rule không bỏ trống | ✅ | §0 — 13/13 contract, mỗi dòng có rule trích dẫn cụ thể |

**Tự chấm: 8 ✅ + 2 ⚠️.** Hai mục ⚠️ đều là **lệch có chủ đích đã ghi lý do**, không phải bỏ sót:
tiêu chí 2 vì kiến trúc Forge khác AppWeb, tiêu chí 8 vì còn đúng một câu hỏi định dạng ngày.

### Câu hỏi Cổng 2 — ✅ CHỦ XƯỞNG ĐÃ TRẢ LỜI HẾT (2026-07-30)

| # | Câu hỏi | Trả lời | Ghi chú thi hành |
|---|---|---|---|
| Q1 | Ngưỡng đầu thừa bỏ hẳn | **0,25 m** (tạm) | ⚠️ **Đổi A2**: thôi chặn cắt, dùng 0,25. Nhưng ghi rõ là **tạm** — bản cũ cũng dùng số này và tự nhận là bịa. Đưa lên Settings để sửa không cần dev |
| Q2 | Kerf | **3 mm** (tạm) | Xác nhận A1 |
| Q3 | Ray U100 | **Cửa Đức dùng 0,08** — chưa tách U100 | ⚠️ `ray_type` **vẫn dựng** trong `Cutting Policy` nhưng V2 chỉ seed U75. Dựng sẵn chỗ để sau thêm U100 mà không phải sửa cấu trúc |
| Q4 | Ray sắt U70 | **Chỉ cửa tấm liền Úc** | Chốt |
| Q5 | Bản lá Lưới/ĐL/Siêu Trường | **Lấy giống cửa Đức, sửa sau.** Nhiều dòng KHÔNG trừ 0,13. **Tập trung cửa Đức** | ⚠️ Ghi `leaf_height_deduction_m = 0` cho ba dòng đó thay vì 0,13 — vì chủ xưởng đã nói "nhiều cái không trừ". Đánh dấu **cần xác nhận từng dòng** trước khi bán cho xưởng khác |
| Q6 | Chia K36 / K12 | **Tập trung K36** — kho vật liệu. K12 cập nhật sau | Seed toàn bộ nhôm vào K36; K12 vẫn dựng trong cây kho |
| Q7 | Mã màu `4004` | **ĐỎ** | Map `4004` → ĐỎ ĐÔ; sửa màu sau nếu cần |
| Q8 | Ron nhựa | **0,263 kg/m** | Lấy số của sheet ĐM, không lấy 0,10 của bàn giao |
| Q9 | Ai duyệt kiểm kê | **Chủ xưởng.** Phân quyền lại khi mở rộng | Khớp §6.2 |
| Q10 | Ép màu ↔ nhóm SP | **CÓ — dữ liệu đã có sẵn trong ảnh bảng màu** | ✅ **Đổi I4**: bảng màu chủ xưởng gửi có sẵn cột **"Nhóm SP áp dụng"** (STĐ → Cửa CN Đức/Úc/Siêu Trường/Đài Loan/Lưới/Phụ kiện; Mạ màu → chỉ Cửa Úc và Đài Loan). ⇒ đổi `Item Color.applies_to` từ Small Text tự do thành **bảng con Link(Item Group)** và ÉP thật |
| Q11 | Định dạng ngày | **`dd/MM/yyyy`** — gạch chéo | Đổi `locale.dateFormat` |
| Q12 | Giá phải trả 7 nỗi đau | *"mày tự trả lời"* | Xem §1.1b — xếp hạng ước lượng của agent, cần xưởng hiệu chỉnh |

### Câu hỏi phụ — AGENT TỰ QUYẾT 2026-07-30

Chủ xưởng không ngồi cùng, người đặt hàng không nắm nghiệp vụ. Mọi câu dưới đây **agent quyết dựa trên
bằng chứng có sẵn**, ghi rõ căn cứ, và **sửa được sau** — không câu nào chặn việc.

| # | Câu | Quyết | Căn cứ |
|---|---|---|---|
| I1 | Một mã nhôm mua được **cả thô lẫn màu**? | **CÓ** | Bảng giá NCC có THÔ / MÀU chưa dập / MÀU đã dập cho **cùng loại hàng** ⇒ cùng mã, nhiều trạng thái. Đây chính là lý do `condition` nằm ở **lô**, không ở mã |
| I2 | `min_area_sqm` từng loại cửa? | **Để trống, không chặn** | **0/117 mã** có giá trị ⇒ xưởng hiện không dùng luật diện tích tối thiểu. Bật khi có số thật — không bịa |
| B1 | Đầu thừa **đời thứ mấy** thì thôi cắt? | **Không giới hạn đời.** Giới hạn bằng **độ dài** (`0,25 m`) | Chiều dài mới quyết định cắt được hay không; `cut_generation` chỉ để truy vết + cảnh báo khi > 3 (dấu hiệu quản lý kém) |
| B2 | Thành phẩm cửa có **theo lô** không? | **KHÔNG** — V2 chỉ nhôm theo lô | Cửa làm theo đơn, không tồn lâu. Bật `has_batch_no` cho cửa = **mọi phiếu xuất phải có bundle** — chi phí lớn, đổi lại không gì |
| B3 | `condition` thêm giá trị nào? | **Giữ 3: Thô · Đã sơn · Lỗi.** Chiều "dập" tách riêng thành `is_stamped` Check | Sơn và dập là **hai chiều độc lập** (đã sơn + chưa dập là tổ hợp có thật trong bảng giá NCC). Nhét vào một Select là nhân đôi giá trị vô ích |
| P2 | Ngưỡng đầu thừa **mỗi mã hay chung**? | **Theo `Measurement Profile`** | Đúng tầng — mã cùng profile có cùng đặc tính vật lý. Mã nào cần khác thì tạo profile riêng, không đẻ trường mới |
| P3 | Bản lá có **đổi theo lô** không? | **KHÔNG** — thuộc tính của mã | Sheet `GHI CHÚ` liệt kê 23 bản lá theo **MÃ**, không theo lô. Nếu sau thấy lô khác bản lá thì đó là **hai mã khác nhau**, không phải một mã hai bản |
| S1 | Khoá kỳ theo **tháng hay ngày**? | **Tháng, khoá thủ công** | Kế toán VN chốt sổ theo tháng. Khoá tự động dễ kẹt khi chứng từ về muộn |
| S2 | Ai **mở lại** kỳ đã khoá? | **Chỉ Chủ xưởng**, bắt buộc lý do, ghi audit | Khớp Q9 — chủ xưởng đã là người duyệt kiểm kê |
| K1 | Kiểm kê **định kỳ bao lâu**? | **Tháng** cho kho chính, **quý** cho kho đầu thừa. Nhắc qua cron, chỉnh trong Settings | Nhôm giá trị cao (98–107k/kg) và biến động hằng ngày; đầu thừa ít biến động hơn |
| K3 | Ngưỡng lệch **buộc duyệt**? | **>5% hoặc >10 lá** | Giữ đề xuất, đặt trong Settings |
| W-Q2 | Đầu thừa **một kho chung hay mỗi kho một kho con**? | **Mỗi kho chính một kho con**: `K36 › Đầu thừa`, `K12 › Đầu thừa` | Thợ ở K36 không đi lấy đầu thừa để ở K12. Gộp một kho thì đề xuất cắt sẽ chỉ ra lô ở kho khác và thợ phải đi tìm — đúng nỗi đau *"mặt bằng hạn chế, sắp xếp nhôm rất khó"* |

### Hai câu chủ xưởng hỏi ngược — agent trả lời (ngoài phạm vi V2, ghi để không rơi)

**Cột "LỖI" nên làm thế nào?** Không làm một cột trên sổ đơn hàng, mà làm **doctype `Phiếu lỗi` riêng**
trỏ về số chứng từ gốc. Vì sheet `CỬA LỖI` của xưởng cho thấy mỗi lỗi có **hai đường xử lý song song** —
với khách và với NCC — nên nó là một bản ghi có vòng đời, không phải một ô đánh dấu. Bốn nguyên nhân đã
có sẵn trong `.docx`: lỗi motor/bình điện (bảo hành 1 năm) · lỗi sản xuất · lỗi NCC (tự trừ công nợ NCC) ·
lỗi khách (chi phí theo công đoạn).

**Tính tổng giờ sản xuất/ngày để biết tăng ca?** Công thức chia hai nhánh vì xưởng đo hai kiểu:

```
Đức · Đài Loan · Siêu Trường :  Σ (số bộ × phút/bộ)      — Đức 100', ĐL 30', ST 30'
Úc · Lưới                    :  Σ (m²  × phút/m²)        — Úc 8,75', Lưới 26,7'
cần tăng ca  =  tổng giờ  −  (số người × 8 giờ)
```

Định mức giờ **đã có đủ** trong sheet `LỊCH SẢN XUẤT`. Thiếu đúng **một** số: **số người mỗi tổ**. Có nó
là chạy được ngay — đó là câu duy nhất phải hỏi xưởng, và nó không chặn V2.

---

**Định hướng chung rút ra từ câu trả lời: MVP tập trung CỬA ĐỨC + KHO K36.** Các dòng cửa khác và K12
vẫn dựng đủ cấu trúc nhưng seed sau. Đây là thu hẹp **phạm vi DỮ LIỆU**, không thu hẹp phạm vi thiết kế.
