# Audit màn Tạo đơn hàng Alumdoor

Ngày audit: 2026-08-25. Phạm vi: màn pure-Frappe `Alumdoor Quotation` và đối chiếu màn cũ `AlumdoorSalesOrderWorkbenchComplete`.

## Đã sửa trong đợt này

- Chỉ còn một tiêu đề ngoài: **Tạo đơn hàng**. Bỏ header con “Tạo báo giá / đơn bán hàng” và nút quay lại bị lặp.
- Tên menu, dashboard và thao tác tạo mới thống nhất là **Đơn hàng**; tên DocType kỹ thuật vẫn giữ để không phá dữ liệu và API hiện có.
- Nút X của dialog đi qua luồng đóng của workbench; nếu đã sửa dữ liệu thì hỏi xác nhận trước khi bỏ.
- Khách hàng và mã mặt hàng dùng Link combobox tìm kiếm của runtime, có lọc bản ghi đang dùng và chống race tích hợp; không tải một danh sách native dài hàng trăm lựa chọn ra màn.
- Thêm sequence guard riêng cho chọn khách, chọn mã và tính dòng để response cũ không ghi đè lựa chọn mới.
- Lỗi validate/server có vùng cảnh báo trực tiếp trong form, ngoài toast.
- Loading dùng skeleton. Nút chỉ có icon có nhãn trợ năng.
- Desktop giữ bảng dày; mobile dùng card theo từng dòng và không phụ thuộc bảng rộng cuộn ngang.
- Footer báo rõ dòng chưa tính / đang tính / đã sẵn sàng; tổng tiền và hành động vẫn luôn ở cuối workbench.
- Header được gom thành các khối nghiệp vụ: Khách hàng–liên hệ, Ngày đặt–Ngày giao, Loại khách–Người phụ trách, Bảng giá, Thanh toán–Tài khoản ngân hàng. Tài khoản chỉ xuất hiện khi chọn Chuyển khoản.
- Footer không hiện “Dòng hàng/Diện tích”; thứ tự là Tiền hàng → Chiết khấu → Phụ thu → VAT (%) → Tiền VAT → Tổng thanh toán → Tiền cọc → Còn phải thu. Tiền cọc nhập theo định dạng dấu chấm Việt Nam.

## Logic đã kế thừa đúng ở backend pure-Frappe

- Khách hàng quyết định Nhóm giá và Bảng giá.
- Mỗi dòng bắt đầu từ mã hàng bán thật; màu bị giới hạn theo mã mặt hàng.
- Chỉ một ô `Số lượng` biểu diễn số cấu kiện/bộ cần sản xuất; `Khối lượng` là kết quả quy đổi để tính tiền theo m, m², bộ hoặc cái.
- Mỗi thay đổi mã hàng, cách bán, màu, kích thước hoặc số lượng được tính lại tức thời theo vòng đời của dòng; kết quả cũ bị xoá và phản hồi đến muộn không được ghi đè dữ liệu mới.
- Chiết khấu, phụ thu, VAT, tiền cọc và còn phải thu được tách riêng; VAT nhập phần trăm ở footer và tính tức thời. Riêng nhóm cửa Đức mặc định chiết khấu 15%; người bán được sửa trực tiếp trong dòng chi tiết, ngay dưới ô phần trăm hiện tiền chiết khấu, phụ thu và tiền phải thu giống màn cũ.
- Khi lưu, server tính lại từng dòng và kiểm tra màu; client không được tự quyết tổng tiền.
- `get_item_sales_context` trả hợp đồng cột/nhãn/bắt buộc/readonly theo mã hàng và nhóm khách; desktop lẫn mobile cùng render từ hợp đồng này.
- Cách bán đã nằm trong SKU (`MTN`, `KT`, `TRỌN BỘ`, `TÁCH MÓN`) nên không hiện lại thành cột chọn. Cửa Đức `Tặng ray/Chỉ lá` là kết quả tự động theo ngưỡng diện tích, server bỏ qua giá trị ép tay.
- Ma trận cột đo: chỉ cửa Đức đổi giữa `PB nhựa` (Đại lý) và `PB ray` (Khách lẻ); Úc, Đài Loan, Siêu trường và Lưới dùng `PB ray`; Lưới thêm `Cao lưới`; dòng tách món dùng `Rộng cắt lá`; ray/vật tư mét dùng `Dài`.
- `Sơn ray` chỉ xuất hiện cho cửa Trọn bộ. Tích mới mở `Màu ray`; màu ray lấy danh mục màu phụ kiện, không dùng lại phạm vi màu của tấm cửa. Ray bán rời chỉ có một cột `Màu` và không lặp `Màu ray`.
- Dòng cửa đã resolve `Sales Package` và hiển thị cấu kiện sản xuất theo số cái/bộ/cặp riêng với quy cách–tiêu hao m/m². Ví dụ cửa Đài Loan thử nghiệm cho 1 bộ cửa, 2 cái ray, 1 V4, 1 trục.
- Phụ thu/giảm trừ lấy từ `Alumdoor Pricing Rule` trong snapshot cấu kiện; giá trị âm vào Chiết khấu, giá trị dương vào Phụ thu.

## Khoảng cách còn lại so với màn cũ

| Mức | Năng lực màn cũ | Trạng thái pure-Frappe hiện tại | Việc phải làm |
|---|---|---|---|
| Đã xong | `item_context` + field overrides quyết định ô đo/nhãn/required theo mã | Service trả `visible_fields`, `required_fields`, `read_only_fields`, nhãn và màu; UI render động | Tiếp tục bổ sung luật riêng khi tài liệu xác nhận thêm họ mã |
| Đã xong | Cách bán động, tự đổi đúng SKU/biến thể và khóa tổ hợp sai | Đã có 7 biến thể chuẩn; đổi đúng SKU theo họ mã, tặng ray tự xét 8 m² | Bổ sung Motor trong nếu danh mục pure-Frappe có cặp SKU xác nhận |
| Đã xong | Phụ thu tự động: vân gỗ, sơn ray, V4/V5, vận chuyển, cửa Úc | Preview resolve Pricing Rule và ghi `adjustment_amount` readonly | Bổ sung test dữ liệu khi thêm quy tắc mới |
| Đã xong | Package, kiểm tra ngưỡng và cấu kiện sản xuất | Dòng đơn resolve Package, hiện cấu kiện và lưu `component_snapshot_json` | Bổ sung package khi có họ SKU mới |
| P0 | NCC có thể được thêm vai trò khách ngay trong màn | Chỉ chọn `Customer/Both`; Supplier-only bị loại | Thêm API kích hoạt vai trò `Both`, bắt chọn Nhóm giá trước khi bán |
| P1 | Preview toàn chứng từ, stale-clock, trạng thái dòng chưa resolve | Đã chống stale theo request dòng; chưa có document preview clock | Thêm document revision và cổng chặn lưu khi bất kỳ preview nào còn bay |
| P1 | Duyệt chiết khấu/override, cảnh báo trừ hai lần | Chưa có approval policy | Thêm trạng thái duyệt và quyền phê duyệt trước khi ghi sổ |
| P1 | Lưu nháp, ghi sổ, in đơn, sản xuất, xuất kho, hủy duyệt | Hiện mới lưu nháp theo state machine báo giá | Chốt workflow Đơn hàng và nối chứng từ kế tiếp |
| P1 | Tỉnh/xã/địa chỉ phụ thuộc | Mới có địa chỉ tự do | Nối danh mục hành chính và địa chỉ khách |
| P2 | Nhân bản dòng, thêm 5 dòng, xóa chọn, chi tiết BOM | Chưa có | Bổ sung sau khi P0/P1 ổn định |

## Kết luận

Màn hiện tại đã kế thừa khung tạo, nhập tìm kiếm, an toàn đóng, race-condition, responsive, ma trận cột động, phụ thu tự động và snapshot cấu kiện. Các khoảng cách còn lại là workflow hậu đơn (duyệt/in/sản xuất/xuất kho), quyền phê duyệt và mở vai trò khách cho đối tác đang là NCC; không được phát sản xuất từ dòng chưa có snapshot cấu kiện.
