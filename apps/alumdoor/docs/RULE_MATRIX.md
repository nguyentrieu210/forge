# Ma trận luật nghiệp vụ — Alumdoor

> Phiên bản 1.0 — 2026-08-25  
> Nguồn ưu tiên: yêu cầu đã chốt trong [BRD.md](BRD.md), sau đó mới tới file Excel/tài liệu gốc. Tài liệu thiết kế cũ chỉ dùng để truy vết; số liệu mâu thuẫn phải theo BRD đã duyệt.

## 1. Nguyên tắc engine

- Server là nguồn đúng duy nhất; client chỉ gọi calculate có debounce và hiển thị kết quả.
- Preview/create/update cùng gọi một `order_calculation_service`.
- Không dùng tên mã để tính bằng chuỗi nếu đã có metadata. Khi import, tên mã chỉ dùng để suy ra metadata lần đầu rồi lưu tường minh.
- Tiền lưu Currency/Decimal, làm tròn đến đồng theo `HALF_UP` sau từng adjustment; kích thước lưu mm, diện tích tính Decimal tối thiểu 6 số lẻ.
- `Số lượng` là số vật lý cần sản xuất/giao; `Khối lượng` là đại lượng nhân đơn giá. Hai số không thay thế nhau.
- Mọi kết quả trả `rule_id`, `source_ref`, `formula`, `input`, `output` trong `explain`.

## 2. Thứ tự tính cố định

| Bước | Kết quả | Quy tắc |
|---:|---|---|
| 1 | Kích thước chuẩn hóa | Resolve measurement profile theo item/loại cửa/loại khách/ray |
| 2 | Khối lượng tính tiền | Bộ, cái, m hoặc m² theo basis của item |
| 3 | Giá gốc dòng | `khối lượng × đơn giá` từ price list hiệu lực |
| 4 | Chiết khấu dòng | Chỉ trên phần giá cửa/lá được phép chiết khấu |
| 5 | Phụ thu dòng | Màu, ray, V4/V5, ngang rộng…; không bị chiết khấu lại |
| 6 | Phụ thu đơn/chuyến | Dedupe theo `dedupe_key`; mỗi loại tối đa một lần |
| 7 | Trước VAT | Tổng sau chiết khấu + mọi phụ thu |
| 8 | VAT | `% VAT × tổng trước VAT`; mặc định 8% |
| 9 | Thanh toán | Tổng thanh toán − cọc đã nhập − các Payment đã submit |

## 3. Cột động và tính hợp lệ

| ID | Điều kiện | Hiện/cho nhập | Ẩn/read-only | Chặn server |
|---|---|---|---|---|
| UI-01 | Chưa chọn mã | Mã, số lượng | Cột kỹ thuật khác | Không calculate giá |
| UI-02 | Item có measurement profile | Chỉ các field profile khai báo | Field ngoài profile | Payload chứa field ngoài profile bị bỏ khỏi calculation và ghi warning |
| UI-03 | Cửa Đức + Đại lý | PB nhựa và các số đo nguồn cần thiết | PB ray nếu profile không dùng | Basis tính tiền phải đúng `dealer_basis` |
| UI-04 | Cửa Đức + Khách lẻ | PB ray và số đo nguồn cần thiết | PB nhựa nếu profile không dùng | Basis tính tiền phải đúng `retail_basis` |
| UI-05 | Không phải Cửa Đức | Field riêng theo profile cửa đó | PB ray/PB nhựa riêng của Đức | Không nhận hai field Đức |
| UI-06 | Item bán theo mét | Chiều dài, số lượng | Field diện tích/cửa | Chiều dài > 0 |
| UI-07 | Cửa lưới | Chiều cao lưới và field profile | Field không thuộc lưới | Đúng range profile |
| UI-08 | SKU có rail configuration | Loại ray; màu/sơn ray nếu rule cho phép | — | Ray phải thuộc option item |
| UI-09 | SKU không có ray | — | Toàn bộ cột ray/sơn ray | Payload ray là lỗi `FIELD_NOT_ALLOWED` |
| UI-10 | Tên mã chứa `MTN` | “Mô tơ ngoài” read-only | Dropdown chọn motor | Giá trị motor khác bị từ chối |
| UI-11 | Màu | Chỉ màu trong `Item Color Allowance` đang hiệu lực | Màu còn lại không có trong dropdown | Màu ngoài allowance trả `COLOR_NOT_ALLOWED` |
| UI-12 | Cách bán trọn bộ | Nút mở cấu kiện snapshot | — | Component rules phải tồn tại |
| UI-13 | Không có mã trọn bộ/gói | — | Khu cấu kiện | Không tự nổ cấu kiện |
| UI-14 | Đơn đã duyệt, chưa khóa | Field nghiệp vụ theo role; lý do sửa bắt buộc | Đơn giá/phụ thu/cấu kiện read-only | Mọi sửa nội dung invalidated approval |
| UI-15 | Đã submit xuất kho | Chỉ xem/in/return/adjustment | Toàn đơn không sửa | `ORDER_STOCK_LOCKED` |

## 4. Kích thước và công thức

| ID | Luật | Biên/chi tiết | Nguồn |
|---|---|---|---|
| DIM-01 | Mỗi item/loại cửa có Measurement Profile riêng | Profile quyết định field visible/required/basis; không có một lưới cột cố định cho mọi cửa | BRD §6.2, §14.1 |
| DIM-02 | Loại ray là tham số bắt buộc khi công thức cần ray | U75/U100 và các loại khác resolve theo option của mã | Tài liệu nguồn `CT TT-SX`; BRD §6.2 |
| DIM-03 | Cơ sở bán phụ thuộc loại khách | Dealer/Retail dùng basis cấu hình; ví dụ Cửa Đức Đại lý dùng rộng PB nhựa | BRD §6.2; quyết định Q98 |
| DIM-04 | Giới hạn chiều rộng là nghiêm ngặt | `basis_width < max_width`; bằng max không hợp lệ | BRD §7.5, §14.1 |
| DIM-05 | Làm tròn số lá | phần lẻ `≤ 0,6` xuống; `> 0,6` lên theo đơn vị/bậc công thức | BRD §7.5 |
| DIM-06 | Kerf | mặc định 3mm, đọc Company Settings/rule version | BRD §7.5 |
| DIM-07 | Công thức không dùng eval | AST allowlist hoặc handler định danh/versioned | Technical Design ADR-003 |
| DIM-08 | Mốc và đơn vị | UI có thể nhập m/mm theo profile nhưng server normalize về mm | Field Ledger |

## 5. Gói bán và cấu kiện

| ID | Điều kiện | Kết quả |
|---|---|---|
| CMP-01 | Dòng có `Sales Package` hiệu lực | Nổ `Component Snapshot` tại calculate và lưu bất biến khi tạo/sửa |
| CMP-02 | Dòng không có package | Không sinh cấu kiện chỉ vì item cùng nhóm |
| CMP-03 | Số lượng cấu kiện | Là số cái/bộ/thanh sản xuất: ví dụ 1 cửa, 2 ray, 1 lá trung gian; không đổi thành mét |
| CMP-04 | Khối lượng cấu kiện | Tách `measure_qty/measure_uom` nếu cần m hoặc m² để cắt/tính; không ghi đè `qty` |
| CMP-05 | Bộ 3 lá đáy | Sinh ba item độc lập: lá yếm, lá trung gian, lá đáy lớn, theo mã trong tài liệu/import |
| CMP-06 | Rule thiếu item/UOM/formula | Toàn dòng lỗi; không lưu package thiếu cấu kiện |
| CMP-07 | Master thay sau duyệt | Snapshot cũ không tự đổi; revision mới mới resolve lại |
| CMP-08 | Item `is_manufactured_item=0` | Bán/xuất trực tiếp; không tạo Production Unit dù có kích thước bán |
| CMP-09 | Đơn hỗn hợp | Production Order chỉ chứa dòng manufactured; Stock Issue cuối gồm cấu kiện và item bán rời |

## 6. Giá, chiết khấu, VAT và cọc

| ID | Điều kiện | Kết quả | Duyệt |
|---|---|---|---|
| PR-01 | Price List/Item Price đúng ngày, loại khách, variant, basis | Chọn rule có priority cao nhất; hòa priority là lỗi cấu hình | Không |
| PR-02 | Cửa Đức + Đại lý | Chiết khấu mặc định 15% | Không nếu giữ 15% |
| PR-03 | Người dùng sửa chiết khấu | Chỉ `% chiết khấu` sửa được; đơn giá, tiền chiết khấu, phụ thu, cấu kiện read-only | Có nếu khác mặc định |
| PR-04 | Đổi bảng giá mặc định | Recalculate toàn đơn | Chủ xưởng |
| PR-05 | VAT | Mặc định 8%, cho sửa; tính sau chiết khấu và phụ thu | Không vì VAT |
| PR-06 | Cọc Draft | `0 ≤ cọc ≤ tổng thanh toán`; chỉ là dự kiến, không tăng `paid_amount` | Không |
| PR-06A | Gửi đơn có cọc > 0 | Bắt buộc Money Account; tự tạo Receipt Submitted cùng transaction/idempotency | Không |
| PR-07 | Tiền hiển thị | Phân cách hàng nghìn bằng dấu chấm; input lưu số sạch | Không |
| PR-08 | Sửa đơn đã duyệt | Tính lại toàn bộ, tạo diff và yêu cầu lý do | Duyệt lại toàn bộ |

## 7. Phụ thu và quà tặng đã chốt

| ID | Điều kiện chính xác | Công thức/kết quả | Phạm vi/dedupe |
|---|---|---|---|
| ADJ-01 | Màu thuộc nhóm Sơn vân gỗ và cửa Đức/Úc/Siêu Trường/Đài Loan | `465.000 × area_m2` | Dòng |
| ADJ-02 | Sơn vân gỗ trên ray thuộc: ray hộp TD, ray hộp TD U100, ray đơn TD, ray sắt không ron | `55.000 × rail_length_m` | Dòng |
| ADJ-03 | Sơn ray màu khác, không phải vàng kem/ghi sần, trên cùng nhóm ray ADJ-02 | `15.000 × rail_length_m` | Dòng; không cộng đồng thời ADJ-02 |
| ADJ-04 | V4 hoặc V5 sơn tĩnh điện | `15.000 × length_m` | Dòng |
| ADJ-05 | Cửa Đức hoặc cửa lưới, diện tích `< 8m²`, cần vận chuyển | 300.000 | Toàn đơn/chuyến, key `TRANSPORT_TRIP` |
| ADJ-06 | Cửa Úc, `4m² < area < 7m²` | 300.000 | Toàn đơn/chuyến, cùng key `TRANSPORT_TRIP` |
| ADJ-07 | Cửa Úc, `area < 4m²` | Khối lượng giá = số bộ | Dòng; không kích hoạt ADJ-06 |
| ADJ-08 | Cửa Úc, `area = 4m²` | Khối lượng giá = diện tích | Không ADJ-06 |
| ADJ-09 | Cửa Úc, `area = 7m²` | Theo basis giá của mã | Không ADJ-06 |
| ADJ-10 | Nhiều dòng kích hoạt vận chuyển | Chỉ một khoản 300.000 | Toàn đơn/chuyến |
| ADJ-11 | Rule mã cho phép tặng ray và `area ≥ 8m²` | Ray có `is_gift=1`, thành tiền 0 nhưng vẫn có qty/measure cho sản xuất | Dòng |
| ADJ-12 | `6m < basis_width ≤ 7,5m` | `40.000 × area_m2` | Dòng, bậc ngang thấp |
| ADJ-13 | `7,5m < basis_width < 9m` | `60.000 × area_m2` | Dòng, bậc ngang cao |
| ADJ-14 | `basis_width ≤ 6m` | Không phụ thu ngang | Dòng |
| ADJ-15 | `basis_width ≥ max_width` của item/rule | Không cho bán/calculate hoàn tất | Lỗi, không phải phụ thu |

Nguồn ADJ-01..11: BRD §7.4 và quyết định người dùng. Nguồn ADJ-12..15: bảng nguồn được truy vết tại `BRD-ban-1-goc.md` §4.6; cận 7,5 được BRD duyệt làm rõ theo bậc thấp `≤ 7,5`, bậc cao `> 7,5`.

## 8. Duyệt, khóa và hủy

| ID | Sự kiện | Kết quả |
|---|---|---|
| WF-01 | Submit đơn không đổi bảng giá/chiết khấu mặc định | Auto Approved và tạo Production Request idempotent |
| WF-02 | Khác price list mặc định hoặc discount mặc định | `Pending Owner Approval`; Chủ xưởng duyệt/từ chối |
| WF-03 | VAT khác 8% | Không tự tạo lý do duyệt |
| WF-04 | Sửa đơn Approved, dù chỉ kích thước | Bắt buộc lý do, lưu revision before/after, invalidated approval, duyệt lại |
| WF-05 | Đơn đã vào sản xuất | Vẫn cho sửa trước stock lock nhưng cảnh báo rõ; Production Order chặn tiếp cho đến khi Accountant/Owner acknowledge diff |
| WF-06 | Submit phiếu xuất kho | Transaction ghi ledger và khóa toàn đơn vĩnh viễn |
| WF-07 | Sau stock lock | Không sửa/hủy đơn; dùng return/adjustment/đơn thay thế |
| WF-08 | Hủy trước stock lock | Cho Owner/Accountant; Sale chỉ đơn mình tạo; bắt buộc lý do |
| WF-09 | Production nghiệm thu đạt | Owner xác nhận Accepted → Ready to Deliver |
| WF-10 | Phiếu xuất thường tạo trước một ngày | Draft không khóa; chỉ Submit mới khóa/trừ tồn |
| WF-11 | Đơn không có dòng manufactured | Không tạo Production Request; chuyển hàng đợi xuất kho trực tiếp sau duyệt |
| WF-12 | Nghiệm thu nhiều bộ | Nghiệm thu từng Unit; có một Unit Rework thì Order chưa Ready to Deliver |
| WF-13 | Đảo phiếu xuất đã submit | Ghi reversal nhưng không mở `is_stock_locked` |

## 9. Kho, mua, giao, thu chi

| ID | Luật |
|---|---|
| INV-01 | Không cho tồn âm tại thời điểm submit; kiểm và ghi ledger cùng transaction. |
| INV-02 | Kho chỉ quản số lượng, không valuation/giá vốn/hạch toán. |
| INV-03 | Stock Entry Submitted bất biến; sửa sai bằng cancel đảo, return hoặc adjustment. |
| INV-04 | Purchase chỉ gồm Purchase Order và Purchase Receipt; không đề xuất mua; Owner có quyền mua. |
| INV-05 | Nhà cung cấp không cần phân nhóm; một Partner có thể vừa Customer vừa Supplier. |
| INV-06 | Delivery v1 là giao toàn bộ; partial delivery bị chặn. |
| INV-07 | Cọc là số lần đầu trên đơn; các lần thu/chi sau nằm ở Payment Entry theo đơn. |
| INV-08 | Phí vận chuyển là theo chuyến xe/toàn đơn, không nhân số dòng. |
| INV-09 | Hủy đơn có tiền đã thu đặt `refund_due`; hoàn bằng Payment loại Payment, không sửa/xóa Receipt. |
| INV-10 | Purchase Receipt cho phép nhận từng phần và cộng dồn `received_quantity`; Delivery khách vẫn full-only. |
| INV-11 | Giá trên Purchase Order chỉ là thương mại; Stock Ledger không nhận rate/value. |

## 10. Import

| ID | Luật |
|---|---|
| IMP-01 | Upload → parse → map → validate toàn file → preview lỗi/cảnh báo → commit. |
| IMP-02 | `Có một lỗi thì không ghi dòng nào`; khác default generic wizard. |
| IMP-03 | Import thẳng master sau khi toàn file hợp lệ; dùng một transaction. |
| IMP-04 | Duplicate key trong file hoặc DB là lỗi nếu không chọn chế độ update được Owner cho phép. |
| IMP-05 | Lưu file private, checksum, mapping, người chạy, thời điểm, tổng dòng và lỗi. |

## 11. Bộ test biên bắt buộc

| Test | Input | Expected |
|---|---|---|
| T-DIM-01 | Cửa Úc MTN | Motor ngoài read-only, không dropdown |
| T-DIM-02 | Đức/Dealer rồi đổi Retail | Basis/cột đổi đúng; field cũ bị loại khỏi payload authority |
| T-DIM-03 | Cửa khác Đức | Không PB ray/PB nhựa Đức |
| T-DIM-04 | width = max_width | Lỗi max strict |
| T-DIM-05 | fractional leaf 0,60 và 0,61 | xuống / lên đúng |
| T-CMP-01 | Package 1 cửa, 2 ray, 1 lá TG | qty giữ 1/2/1; measure tách riêng |
| T-CMP-02 | Bộ 3 lá đáy | Có đúng 3 item riêng |
| T-PRICE-01 | Úc 3,99m² | Tính theo bộ |
| T-PRICE-02 | Úc 4,00m² | Tính diện tích, không 300k |
| T-PRICE-03 | Úc 4,01 và 6,99m² | Có 300k chuyến |
| T-PRICE-04 | Úc 7,00m² | Không ADJ-06 |
| T-PRICE-05 | 2 dòng cùng cần chuyến | Chỉ một 300k |
| T-PRICE-06 | 7,99 và 8,00m² rule tặng ray | Không tặng / tặng |
| T-PRICE-07 | ngang 6,00 / 6,01 / 7,50 / 7,51m | 0 / 40k / 40k / 60k mỗi m² |
| T-PRICE-08 | Vân gỗ cửa Đức | 465k/m², không dùng 360k tài liệu cũ |
| T-PRICE-09 | Vân gỗ ray / màu khác / vàng kem | 55k / 15k / 0 theo mét |
| T-PRICE-10 | Đức Dealer default | 15%; sửa 14,9 hoặc 15,1 → pending |
| T-PRICE-11 | VAT 8%, cọc | VAT tính trước cọc; cọc không vượt tổng |
| T-WF-01 | Default submit | Auto Approved + một Production Request |
| T-WF-02 | Double click/retry | Cùng idempotency key không sinh chứng từ thứ hai |
| T-WF-03 | Sửa Approved | Lý do bắt buộc, approval invalidated, có diff |
| T-WF-04 | Submit stock draft đã chuẩn bị | Khóa đơn đúng lúc submit, không lúc tạo draft |
| T-WF-05 | Đơn toàn hàng bán rời | Approved nhưng không sinh Production Request |
| T-WF-06 | 5 bộ, 1 bộ Rework | Production Order chưa Ready; không tạo full Delivery |
| T-WF-07 | Cancel stock issue | Ledger đảo, order vẫn locked |
| T-INV-01 | Hai người xuất cùng tồn | Một thành công; người kia nhận insufficient stock |
| T-INV-02 | Xuất làm âm | Transaction rollback toàn bộ |
| T-INV-03 | Draft cọc 2 triệu | Không có Payment; Submit có account tạo đúng 1 Receipt Submitted |
| T-INV-04 | Hủy đơn đã thu 2 triệu | `refund_due=2 triệu`; lịch sử Receipt còn nguyên |
| T-INV-05 | PO 100, receipt 60 rồi 40 | Partly Received rồi Received; ledger +60/+40 |
| T-IMP-01 | 100 dòng, dòng 99 lỗi | DB ghi 0 dòng |

## 12. Cổng ma trận

- [x] Cột động có điều kiện visible/editable/server guard.
- [x] Kích thước, component, price, surcharge, VAT có biên rõ.
- [x] Duyệt/khóa/hủy/kho/import có luật và test.
- [x] Mâu thuẫn 360k vân gỗ ở tài liệu cũ bị thay bằng quyết định mới 465k.
