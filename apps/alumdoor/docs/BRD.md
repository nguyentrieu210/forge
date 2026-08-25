# BRD — Alumdoor Frappe Pure

> Phiên bản: 3.0 — 2026-08-25
> Trạng thái: **ĐÃ DUYỆT Cổng 2 ngày 2026-08-25**
> Nguồn: dữ liệu/tài liệu Alumdoor + 117 câu grill đã chốt + [nghiên cứu nền](RESEARCH-FRAPPE-PURE-20260825.md).
> Bản này thay thế phạm vi vận hành của BRD 2026-08-15. Tài liệu cũ vẫn dùng làm nguồn công thức đã kiểm chứng, nhưng các phần báo giá, kế toán giá vốn, giữ chỗ, nhiều kho và nhiều vai trò không còn là yêu cầu bản hiện hành.

## 0. Tuyên bố sản phẩm

Alumdoor là hệ thống điều hành xưởng cửa nhôm/cửa cuốn nhỏ, chạy trên **Frappe thuần**:

```text
Forge Frontend
      ↓
Alumdoor API / Service Layer
      ↓
Frappe REST + whitelisted methods
      ↓
DocType + controller lifecycle
      ↓
MariaDB
```

Frappe/MariaDB là nguồn sự thật duy nhất. Frontend chỉ hiển thị, thu thập dữ liệu và trình bày kết quả server trả về. Không dùng ERPNext và không dựng lại logic giá/cấu kiện trong React.

### 0.1 Mười điều bất biến

1. **Không có báo giá.** Nghiệp vụ bắt đầu bằng Đơn hàng.
2. Chỉ bấm **Tạo đơn hàng** mới sinh số `DH-YYYY-00001`; preview/tính thử không tạo chứng từ.
3. Mọi giá, chiết khấu, phụ thu, VAT, kích thước và cấu kiện do server tính và kiểm tra lại khi lưu.
4. `Số lượng` là số lượng vật lý/nghiệp vụ; `Khối lượng` là cơ sở nhân đơn giá.
5. Chỉ mã được đánh dấu **Trọn bộ** mới nổ cấu kiện.
6. Mọi bộ cửa vật lý có mã theo dõi riêng `DH-YYYY-00001-01`.
7. Sửa bất kỳ dữ liệu ảnh hưởng đơn đã duyệt đều bắt buộc ghi lý do, hủy duyệt cũ và duyệt lại.
8. Chỉ **xác nhận phiếu xuất kho** mới khóa toàn bộ đơn hàng.
9. Kho không âm; không sửa số dư tồn trực tiếp.
10. Chứng từ và snapshot đã phát sinh không bị thay đổi ngầm khi danh mục/bảng giá/quy tắc đổi sau này.

## 1. Vấn đề cần giải quyết

Xưởng bán hàng theo số đo nhưng mỗi dòng cửa có cách chọn cột, tính kích thước, tính tiền và sinh cấu kiện khác nhau. Một màn chung thiếu metadata đã dẫn tới các lỗi thực tế:

- SKU đã ghi `MTN` nhưng vẫn bắt chọn “Mô tơ ngoài”.
- Cửa không phải cửa Đức vẫn hiện PB ray/PB nhựa của cửa Đức.
- Cột `Số lượng` bị dùng như mét/m² trong khi sản xuất cần biết số bộ, số ray, số lá.
- Phụ thu vận chuyển bị nhân theo dòng/bộ thay vì một chuyến xe.
- Chiết khấu, phụ thu và VAT không hiện tức thời hoặc preview khác kết quả lưu.
- Cấu kiện nổ sai hoặc xuất hiện trên mặt hàng bán lẻ.
- Code frontend và backend có thể tính khác nhau.
- BRD cũ ôm nghiệp vụ kế toán/ERP nặng hơn mô hình xưởng ít người.

### 1.1 Giá trị phải tạo ra

- Sale/Kế toán nhập một đơn đúng ngay tại chỗ, thấy tức thời khối lượng, giá, chiết khấu, phụ thu, VAT và tổng tiền.
- Kế toán tạo lệnh sản xuất từ đơn đã đủ điều kiện; cấu kiện là snapshot có thể sản xuất.
- Kho xuất đúng vật tư, không âm, và tại thời điểm xuất thì đơn được khóa.
- Chủ xưởng chỉ phải duyệt ngoại lệ thực sự: đổi bảng giá, đổi chiết khấu mặc định hoặc đơn bị sửa sau duyệt.
- Khách nhận được bản preview/in HTML rõ ràng, không lộ các trường kỹ thuật không cần thiết.

## 2. Phạm vi và mục tiêu

### 2.1 Phạm vi bản vận hành đầu

| Luồng | Trong phạm vi |
|---|---|
| Danh mục | đối tác, vật tư, nhóm, ĐVT, màu/bề mặt, kho, cấu hình kích thước, gói bán, cấu kiện, bảng giá, phụ thu, quy tắc |
| Bán hàng | tạo/sửa/duyệt/hủy Đơn hàng, preview/in, đặt cọc |
| Sản xuất | yêu cầu sản xuất, một lệnh sản xuất/đơn, theo dõi từng bộ cửa, snapshot cấu kiện |
| Kho | tồn đầu kỳ, nhập, xuất theo lệnh sản xuất, hoàn trả, phế liệu, điều chỉnh/kiểm kho |
| Mua hàng | Đơn mua do Chủ xưởng tạo, nhập hàng từ NCC |
| Giao hàng | giao toàn bộ, ngày giao dự kiến/thực tế, có thể giao khi còn nợ |
| Thu chi | cọc lần đầu trên đơn; phiếu thu/chi riêng liên kết đơn; tiền mặt/ngân hàng |
| Quản trị | quyền, audit, import nguyên tử, backup, thông báo trong app, dashboard |

### 2.2 Ngoài phạm vi bản này

- ERPNext và mọi mô-đun kế toán kép, sổ cái, giá vốn, định khoản, khóa kỳ kế toán.
- Hóa đơn điện tử và khai thuế. VAT chỉ là phép tính thương mại.
- Báo giá/Quotation dưới mọi tên gọi.
- Đề xuất mua và tự động chia đơn mua theo NCC.
- Nhiều kho và luồng điều chuyển giữa kho; bản đầu dùng một Kho chính, tùy chọn vị trí/kệ.
- Giữ chỗ tồn, tồn khả dụng và tối ưu cắt đa cây.
- Giao từng phần, vận chuyển nhiều chuyến và lịch thu tiền nhiều đợt phức tạp.
- Work center/routing/chấm công riêng cho công nhân sản xuất.
- Giá trị tồn kho, FIFO/bình quân/đích danh.
- Bảo hành, cửa lỗi chuyên sâu, QC nhiều công đoạn và lập lịch lò sơn; để pha mở rộng.
- AI, Zalo, tích hợp máy cắt/CNC.

### 2.3 Chỉ số nghiệm thu

| Mục tiêu | Tiêu chí |
|---|---|
| Một nguồn tính toán | Preview, lưu nháp và tạo đơn cho cùng một payload trả cùng kết quả |
| Không chọn sai thuộc tính | 100% SKU-encoded field chỉ hiện read-only và không nhận giá trị mâu thuẫn |
| Cấu kiện đúng | 100% ca mẫu theo tài liệu nổ đúng số lượng, ĐVT và khối lượng |
| Không đơn giá rác | Thiếu giá/quy tắc áp dụng thì chặn lưu, không fallback |
| Duyệt đúng ngoại lệ | Mặc định tự qua; đổi bảng giá/chiết khấu hoặc sửa sau duyệt phải chờ Chủ xưởng |
| Khóa đúng mốc | Phiếu xuất nháp chưa khóa; xác nhận xuất khóa toàn đơn |
| Kho đáng tin | Không âm; mọi thay đổi tồn có chứng từ và audit |
| Nhập dữ liệu đáng tin | File có một lỗi thì không ghi dòng nào, trả đủ dòng/cột lỗi |

## 3. Actor và quyền

Chỉ có ba vai trò nghiệp vụ. `Administrator` dùng kỹ thuật, không thay thế vai trò vận hành.

| Hành động | Chủ xưởng | Kế toán | Sale |
|---|:---:|:---:|:---:|
| Xem toàn bộ dữ liệu | ✓ | ✓ | ✓ |
| Tạo/sửa đơn hàng chưa khóa | ✓ | ✓ | ✓ |
| Tạo đơn với điều kiện mặc định | ✓ | ✓ | ✓ |
| Duyệt đổi bảng giá/chiết khấu/sửa sau duyệt | ✓ | — | — |
| Hủy đơn trước xuất kho | ✓ | ✓ | ✓, đơn mình tạo |
| Quản lý danh mục, bảng giá, quy tắc | ✓ | chỉ xem | chỉ xem |
| Tạo lệnh sản xuất | ✓ | ✓ | — |
| Tạo/xác nhận phiếu xuất kho | ✓ | ✓ | — |
| Tạo phiếu nhập/hoàn trả/phế/điều chỉnh | ✓ | ✓ | — |
| Tạo đơn mua | ✓ | — | — |
| Nhập hàng theo đơn mua | ✓ | ✓ | — |
| Tạo phiếu thu/chi | ✓ | ✓ | — |
| Giao hàng | ✓ | ✓ | — |
| Import dữ liệu nền | ✓ | — | — |

Quyền phải chặn ở API/controller, không chỉ ẩn nút. Chủ xưởng có toàn quyền vận hành nhưng mọi thay đổi vẫn được ghi audit.

## 4. Kiến trúc nghiệp vụ

### 4.1 Ranh giới frontend/backend

| Frontend được làm | Backend bắt buộc làm |
|---|---|
| debounce và gửi payload khi người dùng thay đổi | xác định field nào hiện/ẩn/read-only/bắt buộc |
| render cột động theo metadata | kiểm tra SKU, màu, kích thước, bảng giá, phiên bản quy tắc |
| format VND bằng dấu chấm khi nhập/hiển thị | chuẩn hóa thành số nguyên VND |
| hiển thị kết quả preview tức thời | tính khối lượng, giá, chiết khấu, phụ thu, VAT, cấu kiện |
| giữ trải nghiệm cột ngắn, resize/ẩn cột | tính lại toàn bộ khi lưu/tạo đơn |
| preview HTML server trả về | lưu snapshot và audit |

Không có hai hàm tính giá độc lập. Frontend có thể giữ kết quả gần nhất để hiển thị mượt nhưng không được tự quyết kết quả lưu.

### 4.2 Ba API nghiệp vụ cốt lõi

1. **Bootstrap:** trả danh mục, customer snapshot, metadata loại hàng và quyền.
2. **Calculate/Preview:** nhận payload chưa lưu, trả dòng đã chuẩn hóa, cấu kiện, tiền và HTML preview.
3. **Create/Update/Workflow:** server tính lại, kiểm tra phiên bản, lưu hoặc chuyển trạng thái trong một giao dịch.

Chi tiết endpoint/payload/error code được khóa ở Pha 3.

## 5. Mô hình nghiệp vụ cấp BRD

### 5.1 Danh mục nền

| Thực thể | Mục đích |
|---|---|
| `Business Partner` | Một đối tác có thể vừa là Khách hàng vừa là Nhà cung cấp |
| `Item Group` | Nhóm vật tư/sản phẩm; định tuyến hành vi và báo cáo |
| `UOM` + `UOM Conversion` | ĐVT vật lý, ĐVT mua, ĐVT bán và hệ số quy đổi |
| `Item` | Mã hàng, tên, loại, nhóm, UOM, trạng thái, thuộc tính mã hóa |
| `Color Surface` | Màu/bề mặt; ánh xạ mã màu và nhóm màu |
| `Item Color Allowance` | Danh sách màu được phép theo mã hàng |
| `Measurement Profile` | Bộ field/cột, công thức và validation theo loại cửa/mặt hàng |
| `Sales Package` | Đánh dấu Trọn bộ và liên kết phiên bản cấu kiện |
| `Sales Package Component` | Cấu kiện mặc định: item, số lượng, UOM, công thức khối lượng/kích thước |
| `Price List` / `Item Price` | Bảng giá Đại lý/Khách lẻ, ngày hiệu lực, phiên bản |
| `Pricing Rule` | Điều kiện giá, phụ thu, tặng ray, màu, kích thước |
| `Warehouse` / `Bin Location` | Một Kho chính và vị trí tùy chọn |
| `Company Settings` | VAT mặc định, kerf, ngưỡng phế theo nhóm, ngân hàng, mẫu in |

### 5.2 Chứng từ

| Thực thể | Quy tắc chính |
|---|---|
| `Sales Order` | chứng từ bán hàng duy nhất; số `DH-YYYY-#####`; customer/price/rule snapshot |
| `Sales Order Item` | dòng sản phẩm/vật tư; số lượng và khối lượng tách biệt |
| `Sales Order Component Snapshot` | cấu kiện của dòng trọn bộ tại thời điểm tạo/duyệt |
| `Production Request` | sinh khi đơn đủ điều kiện sản xuất |
| `Production Order` | một bản ghi/đơn; chứa các bộ cửa vật lý và snapshot |
| `Production Unit` | từng bộ cửa `DH-...-01`, `-02`... |
| `Stock Issue` | xuất theo lệnh sản xuất; xác nhận thì trừ kho và khóa đơn |
| `Stock Receipt` | nhập từ đơn mua hoặc nhập đầu kỳ có kiểm soát |
| `Stock Return` | trả vật tư đã xuất |
| `Scrap Entry` | ghi vật tư phế |
| `Stock Adjustment` | kiểm/điều chỉnh tồn; cấm sửa balance trực tiếp |
| `Purchase Order` | Chủ xưởng tạo thẳng cho NCC |
| `Delivery Note` | giao toàn bộ; ngày giao thực tế |
| `Payment Entry` | Thu/Chi liên kết đơn; cọc lần đầu và các lần thu sau |
| `Import Job` | file nguồn, loại import, trạng thái, lỗi chi tiết, người chạy |

Không tồn tại `Alumdoor Quotation` hay `Alumdoor Quotation Item` trong mô hình đích.

## 6. Hợp đồng dòng đơn hàng

### 6.1 Hai trục số lượng

| Trường | Ý nghĩa | Ví dụ |
|---|---|---|
| `Số lượng` | số đơn vị vật lý/nghiệp vụ cần giao hoặc sản xuất | 1 bộ cửa; 2 cái ray; 1 lá trung gian |
| `ĐVT` | đơn vị của Số lượng | bộ, cái, thanh, cây, con |
| `Khối lượng` | đại lượng nhân với Đơn giá | 12,5 m²; 3,5 m; 1 bộ |
| `ĐVT tính tiền` | đơn vị của Khối lượng | m², m, bộ, cái |

Tên `Khối lượng` được giữ vì một dòng có thể bán theo bộ/thanh/cái, không chỉ cân nặng. Tooltip phải giải thích “Số dùng để nhân đơn giá”.

### 6.2 Field động theo loại hàng

- Mỗi loại cửa có `Measurement Profile` riêng.
- Server trả `visible`, `editable`, `required`, `derived`, `options` cho từng field.
- Field không áp dụng không gửi lên server; dữ liệu cũ của field đã ẩn bị xóa khỏi draft payload.
- Field suy ra từ SKU vẫn hiển thị để người dùng hiểu mã nhưng **read-only**.
- SKU chỉ được chọn màu trong danh sách cho phép; không được nhập màu tự do.

Quy tắc hiện đã chốt:

- Chỉ **Cửa Đức** hiện PB ray/PB nhựa; Đại lý và Khách lẻ dùng cột thích hợp theo tài liệu.
- Các dòng cửa khác dùng bộ kích thước/cột riêng; không tái sử dụng cứng cột cửa Đức.
- Dòng mét hiện chiều dài; cửa lưới hiện chiều cao lưới; mã có cấu hình ray mới hiện phần ray/sơn ray.
- Mã `MTN`, `STĐ`, màu hoặc cấu hình đã nằm trong mã vẫn hiện nhãn nhưng không cho chọn lại.
- Chiều rộng cắt lá và kích thước suy ra chỉ đọc.

### 6.3 Gói bán và cấu kiện

- Chỉ Item có `is_sales_package = 1` và phiên bản package hợp lệ mới nổ cấu kiện.
- Item bán lẻ không tự biến thành package dù tên gần giống.
- Cấu kiện snapshot giữ `Số lượng + ĐVT` và `Khối lượng/chiều dài cắt + ĐVT`.
- Bộ 3 lá đáy cửa Đức tách thành ba item: lá yếm, lá trung gian, lá đáy lớn.
- Cấu kiện có thể hiện ở panel mở rộng, lệnh sản xuất và bản in của dòng trọn bộ; không biến thành dòng tính tiền độc lập.
- Số lượng nhiều bộ trên một dòng sẽ sinh từng Production Unit riêng nhưng vẫn giữ một dòng bán hàng.

## 7. Máy tính giá và điều kiện

### 7.1 Thứ tự tính cố định

```text
Giá gốc dòng
→ Chiết khấu dòng (chỉ phần giá cửa/lá được phép chiết khấu)
→ Phụ thu dòng
→ Phụ thu toàn đơn/chuyến
= Tổng trước VAT
→ VAT
= Tổng thanh toán
→ trừ tổng đã thu/cọc
= Còn phải thu
```

Mỗi thành phần tiền phải trả về: mã rule, nhãn tiếng Việt, cơ sở tính, tỷ lệ/đơn giá, số tiền và mức áp dụng (`line`, `physical_unit`, `order_trip`). Dòng “Chiết khấu/Phụ thu” hiện ngay dưới dòng hàng như bản cũ, nhưng là kết quả server.

### 7.2 Giá và chiết khấu

- Bảng giá mặc định lấy từ snapshot khách; cho phép đổi bảng giá.
- Đổi khác mặc định phải Chủ xưởng duyệt.
- Thiếu giá đúng ngày đơn/điều kiện thì chặn, không fallback giá chuẩn.
- Ngày đơn quyết định bảng giá/rule. Đổi ngày đơn làm tính lại và yêu cầu duyệt lại.
- Cửa Đức — khách Đại lý: chiết khấu mặc định **15%**.
- Chỉ cho sửa `% chiết khấu` trên dòng; không sửa đơn giá, tiền phụ thu hay cấu kiện.
- Chiết khấu mặc định không cần duyệt; khác mặc định cần Chủ xưởng duyệt.
- Chiết khấu chỉ áp dụng phần giá cửa/lá, không giảm phụ thu.
- VND lưu số nguyên; UI phân cách hàng nghìn bằng dấu chấm ngay khi nhập.

### 7.3 VAT và thanh toán

- VAT mặc định **8%**, cho phép sửa, không cần duyệt.
- VAT hiển thị ở phần tổng kết bên dưới, nhập `%` và tính tức thời.
- VAT tính trên hàng sau chiết khấu cộng phụ thu.
- Cọc không làm giảm cơ sở VAT; chỉ giảm `Còn phải thu`.
- Tiền cọc nằm trong khối Thanh toán, không nằm trong bảng dòng hàng.
- Cọc không vượt Tổng thanh toán.

### 7.4 Phụ thu/điều kiện đã chốt

| Điều kiện | Kết quả |
|---|---|
| Sơn vân gỗ cửa Đức/Úc/Siêu Trường/Đài Loan | +465.000đ/m² |
| Ray sơn vân gỗ, đúng nhóm ray quy định | +55.000đ/m |
| Ray sơn màu khác, trừ vàng kem và ghi sần | +15.000đ/m |
| V4/V5 sơn tĩnh điện | +15.000đ/m |
| Cửa Đức/Lưới nhỏ hơn 8m² cần vận chuyển | +300.000đ/chuyến |
| Cửa Úc trên 4m² và dưới 7m² | kích hoạt phí 300.000đ/chuyến |
| Cửa Úc đúng 4m² | tính theo diện tích, không kích hoạt phụ thu trên |
| Cửa Úc dưới 4m² | khối lượng tính tiền theo bộ |
| Nhiều dòng cùng kích hoạt vận chuyển | tối đa một phí 300.000đ cho toàn đơn/chuyến |
| Ray tặng | chỉ khi điều kiện quy tắc thỏa; ngưỡng hiện hành `diện tích ≥ 8m²` |
| Phụ thu ngang cửa | `≤ 7,5m` bậc thấp; `> 7,5m` bậc cao theo bảng nguồn |
| Kiểm tra rộng tối đa | so sánh nghiêm `< max`; dùng đúng loại rộng tính tiền của dòng/nhóm khách |

Phụ thu theo cửa đánh giá theo từng bộ vật lý; phụ thu vận chuyển là ngoại lệ cấp đơn/chuyến.

### 7.5 Công thức kỹ thuật

- Công thức cụ thể phải được cấu hình/phiên bản hóa từ nguồn, không hardcode theo nhãn UI.
- Làm tròn lá: đúng phần lẻ `.6` làm tròn xuống; lớn hơn `.6` làm tròn lên.
- Kerf mặc định 3mm và cấu hình theo máy/nhóm vật tư.
- Ngưỡng phế cấu hình theo nhóm vật tư; nếu chưa có thì cảnh báo và vẫn cho ghi số thực tế, không tự bịa ngưỡng.
- Các quyết định kỹ thuật đã phân xử như AL71N, cấu tạo lá đáy và quy đổi kích thước được đưa vào Rule Matrix ở Pha 3 và ghim bằng test dữ liệu nguồn.

## 8. Luồng Đơn hàng

### 8.1 Trạng thái

```text
Nháp
  ├─ điều kiện mặc định ───────────────→ Đã duyệt
  └─ có ngoại lệ ─→ Chờ chủ xưởng duyệt ─→ Đã duyệt / Từ chối

Đã duyệt → Yêu cầu sản xuất → Đang sản xuất → Sẵn sàng giao → Đã giao
                    ↓
             Phiếu xuất xác nhận → Khóa đơn

Trước xác nhận xuất: có thể Hủy (bắt buộc lý do)
```

Trạng thái thanh toán (`Chưa thu`, `Đã cọc`, `Thu một phần`, `Đã thu`) là trục riêng, không ép đơn đã giao phải đã thu đủ.

### 8.2 Tạo đơn

1. Chọn khách → tự điền snapshot nhóm giá, bảng giá, địa chỉ, liên hệ, người phụ trách.
2. Chọn mã hàng → server trả profile, màu được phép, giá và cấu hình SKU.
3. Nhập các field đang hiện → gọi Calculate có debounce.
4. Server trả khối lượng, cấu kiện, chiết khấu, phụ thu, VAT và lỗi/cảnh báo.
5. Người dùng có thể Preview trước khi lưu.
6. Bấm `Tạo đơn hàng` → server tính lại, cấp số, lưu snapshot.
7. Nếu không có ngoại lệ, tự duyệt và sinh Production Request; nếu có, chuyển chờ Chủ xưởng.

Không có nút tạo thứ hai ở cuối màn; chỉ một hành động chính cố định.

### 8.3 Sửa sau duyệt

- Cho sửa khi chưa xác nhận phiếu xuất kho.
- Bắt buộc nhập lý do trước khi lưu.
- Cảnh báo rõ nếu đơn đang sản xuất.
- Hủy approval hiện tại cho mọi thay đổi ảnh hưởng nội dung đơn, dù chiết khấu vẫn mặc định.
- Lưu snapshot trước/sau và diff theo field/dòng/cấu kiện/tổng tiền.
- Production Order hiển thị diff và Kế toán phải xác nhận đã nhận thay đổi trước khi tiếp tục.
- Sau xác nhận xuất: khóa toàn đơn. Sai phải dùng hoàn trả/điều chỉnh và đơn thay thế, không mở khóa sửa trực tiếp.

### 8.4 Hủy đơn

- Chỉ hủy trước xác nhận xuất kho.
- Bắt buộc lý do; không tái sử dụng số đơn.
- Hủy Production Request/Production Order còn mở.
- Nếu đã có cọc, giữ lịch sử; Kế toán tạo phiếu Chi hoàn cọc hoặc ghi số giữ lại.

## 9. Sản xuất, kho, mua và giao

### 9.1 Sản xuất

- Đơn được duyệt sinh Production Request.
- Kế toán/Chủ xưởng rà và bấm tạo một Production Order cho toàn đơn.
- Production Order snapshot sản phẩm, kích thước, màu, cấu kiện và phiên bản rule.
- Mỗi bộ cửa là một Production Unit; mã không đổi suốt vòng đời.
- Chủ xưởng nghiệm thu đạt thì chuyển `Sẵn sàng giao`.
- Bản đầu không cần role sản xuất, routing hay chấm công riêng.

### 9.2 Kho

- Kho theo số lượng, không tính giá trị tiền.
- Một Kho chính; có thể ghi vị trí/kệ.
- Tồn đầu kỳ import thẳng qua chứng từ hệ thống có audit.
- Phiếu xuất tạo từ Production Order và tự điền nhu cầu cấu kiện.
- Số thực xuất được phép khác nhu cầu nhưng bắt buộc lý do và hiển thị chênh lệch.
- Xác nhận xuất kiểm tra và trừ tồn trong một giao dịch; không đủ thì chặn.
- Hoàn vật tư dùng Stock Return; phế dùng Scrap Entry; chênh kiểm kho dùng Stock Adjustment.

### 9.3 Mua hàng

- Bỏ Đề xuất mua.
- Chủ xưởng tự tạo Purchase Order cho một NCC.
- Không tự chia/gom NCC.
- Nhập hàng tham chiếu Purchase Order, quy đổi ĐVT mua sang ĐVT kho.
- Đơn mua có giá thương mại để theo dõi giao dịch; kho chỉ nhận số lượng, không tính giá vốn.

### 9.4 Giao hàng

- Ngày giao dự kiến nằm trên đơn; ngày giao thực tế nằm trên Delivery Note.
- Bản đầu giao toàn bộ, không thiết kế partial delivery.
- Cho giao khi còn phải thu; cảnh báo nhưng không chặn.
- Chủ xưởng có thể đặt cờ `Tạm giữ giao`.

## 10. Màn hình

### 10.1 Điều hướng chính

| Nhóm | Màn |
|---|---|
| Điều hành | Tổng quan |
| Bán hàng | Đơn hàng, Tạo đơn hàng, Khách hàng |
| Sản xuất | Yêu cầu sản xuất, Lệnh sản xuất |
| Kho | Tồn kho, Phiếu nhập, Phiếu xuất, Hoàn trả/Phế/Điều chỉnh |
| Mua hàng | Đơn mua, Nhà cung cấp |
| Giao & tiền | Phiếu giao, Thu/Chi |
| Danh mục | Vật tư hàng hóa, Nhóm vật tư, ĐVT, Màu & bề mặt, Kho, Gói bán & cấu kiện, Bảng giá & quy tắc |
| Hệ thống | Trung tâm phân quyền, Nhập dữ liệu, Thiết lập doanh nghiệp |

### 10.2 Màn Tạo đơn hàng

- Tiêu đề duy nhất `Tạo đơn hàng`; bỏ dòng/banner tạo trùng.
- Header form tổ chức thành các cặp gọn:
  - Ngày đặt trên, Ngày giao dưới.
  - Loại khách trên, Người phụ trách dưới.
  - Khách hàng/địa chỉ/liên hệ là một khối.
  - Bảng giá nằm cạnh Thanh toán/Tài khoản ngân hàng hợp lý.
- Bảng dòng hàng có cột động, tiêu đề ngắn, cho ẩn/hiện và resize.
- Cột bên phải ngắn, không “chạy lung tung”; tính lại qua debounce và hủy request cũ.
- Dòng chiết khấu/phụ thu mở ngay dưới dòng hàng.
- Cấu kiện nằm trong panel mở rộng của dòng trọn bộ và tab/panel sản xuất.
- `Số lượng` và `Khối lượng` hiển thị đúng hợp đồng §6.1; bỏ `Số bộ` và `Diện tích cửa` khỏi giao diện.
- Khối tổng kết dưới bảng: tiền hàng, chiết khấu, phụ thu dòng, vận chuyển, tổng trước VAT, VAT %, VAT, tổng thanh toán, tiền cọc, đã thu, còn phải thu.
- Preview có trước và sau khi lưu.

### 10.3 Dashboard và thông báo

Dashboard có các card: Chờ duyệt, Đang sản xuất, Thiếu vật tư, Chờ xuất, Sẵn sàng giao, Sắp trễ, Còn phải thu.

Thông báo trong app:

- Chủ xưởng: đơn cần duyệt, import lỗi, thay đổi danh mục/rule nhạy cảm.
- Kế toán: đơn vừa duyệt, production diff chờ xác nhận, thiếu vật tư, cần xuất/giao/thu.
- Sale: đơn bị từ chối, đơn đã duyệt, giao hoàn tất.

## 11. In, import và snapshot

### 11.1 Preview/in

- HTML preview ngay trong lúc tạo và sau khi lưu.
- Bản khách chỉ hiện thông tin thương mại cơ bản; dòng trọn bộ có thể hiện cấu kiện cần thiết.
- Không in field kỹ thuật nội bộ, audit hay rule id.
- Tải file/PDF là đủ; không cần quy trình ký số.

### 11.2 Import

- Import áp dụng ngay khi toàn bộ file hợp lệ.
- All-or-nothing: một lỗi thì rollback toàn file.
- Mã là khóa: có thì cập nhật, chưa có thì tạo; không tự xóa mã vắng trong file.
- Trùng mã trong file là lỗi.
- Mã thiếu dữ liệu/rule/màu bắt buộc không được active.
- Lưu file nguồn, checksum, người import, thời gian, kết quả và danh sách lỗi dòng/cột.
- Chủ xưởng chủ động vô hiệu hóa mã không còn dùng.

## 12. Audit, bảo mật và vận hành

- Tất cả chứng từ dùng Frappe Version/audit và thêm event nghiệp vụ cho duyệt, hủy, khóa, import.
- Snapshot khách, bảng giá, rule, cấu kiện và tổng tiền không phụ thuộc bản master sau này.
- Request thay đổi có idempotency key; không tạo trùng đơn khi bấm hai lần/mạng retry.
- Số đơn cấp nguyên tử theo năm, không tái sử dụng.
- Mọi API workflow kiểm tra role và trạng thái hiện tại; không tin trạng thái do client gửi.
- Backup MariaDB + files hằng ngày; có bài test phục hồi định kỳ.
- Backend và frontend cùng được Git theo dõi. Không chấp nhận app backend bị `.gitignore` bỏ qua.
- Tìm kiếm tiếng Việt không dấu cho khách, mã và tên hàng.
- Dùng optimistic concurrency/version token: dữ liệu đã bị người khác sửa thì client phải tải lại.

## 13. Migration khỏi cơ chế báo giá hiện tại

1. Đánh dấu code/route/DocType Quotation hiện tại là deprecated ngay khi triển khai thiết kế mới.
2. Kiểm kê bản ghi Quotation đang có; môi trường hiện tại là demo nên không tự coi là dữ liệu thật.
3. Chỉ migration bản ghi được chủ xưởng xác nhận cần giữ; phần còn lại xuất backup rồi bỏ.
4. Xóa route, menu, API, service và test Quotation sau khi Sales Order đạt parity.
5. Không để compatibility layer kéo dài làm hai nguồn sự thật.

## 14. Kịch bản nghiệm thu bắt buộc

### 14.1 Dòng hàng và cột động

1. Cửa Úc MTN hiển thị “Mô tơ ngoài” read-only, không có dropdown.
2. Cửa Đức Đại lý hiện đúng PB nhựa; Khách lẻ hiện đúng PB ray theo profile nguồn.
3. Cửa không phải Đức không hiện PB ray/PB nhựa cửa Đức.
4. SKU chỉ cho chọn màu hợp lệ; gọi API trực tiếp với màu sai bị từ chối.
5. Dòng mét giữ Số lượng vật lý và Khối lượng mét riêng.
6. Dòng bán lẻ không nổ cấu kiện; dòng trọn bộ nổ đúng cấu kiện.
7. Hai bộ cửa trên một dòng sinh hai mã Production Unit.

### 14.2 Giá

8. Cửa Đức Đại lý tự điền 15%; sửa 14% hoặc 16% đều chờ Chủ xưởng.
9. Chiết khấu không giảm phụ thu.
10. Đổi bảng giá khỏi mặc định chờ duyệt.
11. Thiếu giá đúng ngày đơn bị chặn.
12. Đổi ngày đơn làm repricing và hủy duyệt.
13. Cửa Úc 3,99m² tính theo bộ; 4,00m² tính diện tích, không phụ thu; 4,01–6,99m² kích hoạt phí chuyến; 7,00m² không kích hoạt điều kiện đó.
14. Nhiều dòng kích hoạt vận chuyển vẫn chỉ cộng 300.000đ một lần.
15. Ray tặng chỉ áp khi đạt đúng điều kiện `≥ 8m²` và rule cho phép.
16. VAT 8% mặc định, sửa được, tính cuối cùng; cọc không giảm VAT.
17. Tiền hiển thị `20.000.000`, không thành `02000000`.
18. Preview, draft và create cho cùng payload có tổng giống nhau.

### 14.3 Workflow

19. Đơn mặc định tự duyệt và sinh Production Request.
20. Đơn ngoại lệ không sinh Production Request trước duyệt.
21. Sửa kích thước đơn đã duyệt bắt lý do và duyệt lại.
22. Production Order thấy diff trước/sau và yêu cầu Kế toán xác nhận.
23. Phiếu xuất nháp chưa khóa đơn.
24. Xác nhận phiếu xuất khóa toàn đơn.
25. Sau khóa, gọi API update trực tiếp bị từ chối.
26. Hủy trước xuất được với lý do; sau xuất bị chặn.
27. Hủy đơn có cọc không xóa lịch sử tiền.

### 14.4 Kho và import

28. Xác nhận xuất vượt tồn bị từ chối và không trừ một phần.
29. Xuất thực tế khác định mức bắt lý do.
30. Không endpoint nào sửa balance trực tiếp.
31. ĐVT mua quy đổi chính xác về ĐVT kho.
32. File danh mục hiện tại bị từ chối vì mã trùng/thiếu giá và trả đúng lỗi.
33. File hợp lệ cập nhật/tạo nguyên tử, không xóa mã vắng.
34. Import lưu file nguồn và audit.

### 14.5 Quyền và in

35. Sale gọi thẳng API duyệt nhận 403.
36. Kế toán gọi API sửa bảng giá/rule nhận 403.
37. Chủ xưởng duyệt được mọi ngoại lệ.
38. Preview trước lưu và sau lưu cùng bố cục/dữ liệu thương mại.
39. Bản in không lộ field nội bộ; dòng trọn bộ có cấu kiện theo cấu hình in.

## 15. Quyết định dành cho Pha 3

Không còn câu hỏi nghiệp vụ chặn thiết kế. Pha 3 phải chuyển BRD này thành:

1. Screen Catalog và interaction map.
2. Field Ledger đầy đủ: field, kiểu, nhãn, visible/editable/required/derived theo từng loại cửa.
3. DocType/data model đích và ma trận giữ–sửa–xóa các DocType hiện tại.
4. Rule Matrix có nguồn cho từng công thức giá/kích thước/cấu kiện.
5. API contract, error taxonomy, idempotency và optimistic concurrency.
6. State machine, permission matrix server và audit events.
7. Migration plan bỏ Quotation, chuyển dữ liệu/demo và đưa backend vào Git.
8. Test matrix ánh xạ 39 ca nghiệm thu ở trên.

## Cổng 2 — duyệt BRD

- [x] Vấn đề và phạm vi đã rõ.
- [x] Frappe thuần, không ERPNext.
- [x] Không báo giá; dùng thẳng Đơn hàng.
- [x] Quyền phù hợp xưởng ít người.
- [x] Giá, phụ thu, VAT và mốc duyệt/khóa đã chốt.
- [x] Sản xuất, kho, mua, giao và thu tiền ở đúng mức bản đầu.
- [x] Ngoài phạm vi được ghi rõ để không phình lại thành ERP.
- [x] **Chủ xưởng đã duyệt BRD; chuyển sang Pha 3 — thiết kế chi tiết.**
