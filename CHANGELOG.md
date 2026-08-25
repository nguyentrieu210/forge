# CHANGELOG

## Unreleased

### Added

- Bổ sung biến thể giá `CHI_LA` / `TANG_RAY` ngay trên `Alumdoor Item Price` và patch nhập thẳng 594 dòng giá cho hai bảng `BG_DAI_LY`, `BG_KHACH_LE` từ `danh mục sản phẩm.xlsx`; mỗi snapshot giá giữ lại đúng dòng nguồn đã dùng.
- Alumdoor pure-Frappe có workbench TSX “Báo giá cửa” theo màn đơn bán hàng cũ: chọn khách để tự lấy nhóm/bảng giá, nhập nhiều mã hàng thật theo dòng, lọc màu được phép theo từng mã, tách số bộ xưởng khỏi khối lượng m/m² tính tiền và tính lại tổng ở server.
- Alumdoor bổ sung luồng WMS cho lập kế hoạch lấy hàng FIFO, kiểm tra đóng gói, lập kế hoạch cất hàng và gom sóng lấy hàng; dữ liệu lô/serial đọc từ sổ tồn kho thực tế và có kiểm tra số lượng, cấu trúc kiện trước khi xử lý.
- Quy tắc BOM bán hàng có thể tự sinh cấu phần còn thiếu theo biến thể giá và khoảng diện tích; quy tắc tặng ray chỉ áp dụng đúng phương án bán và ngưỡng từ 8 m².
- Lịch sử giá nhà cung cấp lọc quyền đọc trên từng chứng từ nguồn trước khi tổng hợp.
- HR Lite có màn Cài đặt Nhân viên & Lương để chọn và lưu công ty, địa điểm làm việc và ngày trả lương; doanh nghiệp có nhiều công ty không còn bị chặn khi tạo nhân viên.
- Nút `+` cạnh các trường liên kết có thể tạo mới, mở đúng biểu mẫu tạo nhanh và tự chọn bản ghi vừa lưu.

### Changed

- Màn Đơn hàng Alumdoor gọi một API `calculate_order` cho toàn bộ chứng từ, đọc tổng tiền/VAT/cọc/còn phải thu từ server và thực sự áp dụng bảng giá được chọn. Không còn fallback âm thầm về `standard_selling_rate` khi thiếu giá chính xác.
- Sửa vòng đời tính tức thời: callback commit trễ mang cùng giá trị không còn tăng revision làm rơi kết quả server. Nhập cửa Đức 3,5 × 2 m hiện ngay Khối lượng 7 m², giá 1.400.000, chiết khấu 15%, VAT 8%; tiền cọc 2.000.000 hiển thị dấu chấm và còn phải thu 6.996.400.
- Khối lượng trên dòng Đơn hàng Alumdoor luôn hiện nhưng chỉ tự tính từ đúng nguồn kích thước mà metadata của mã hàng yêu cầu: PB nhựa, PB ray hoặc rộng cắt lá. Thiếu đúng cột thì hiện `—`; không còn lấy Số lượng hay một cột rộng khác làm fallback. Hàng bán theo mét vẫn nhân chiều dài, hàng bán theo bộ/cái/thanh/con vẫn dùng Số lượng.
- Màn Tạo đơn hàng Frappe thuần Alumdoor dùng lại nguyên bảng dòng hàng hoàn chỉnh của màn cũ thay vì bảng rút gọn riêng: giữ cột động, đổi độ rộng, chọn nhiều, nhân bản, tặng ray theo điều kiện, chiết khấu/phụ thu/tiền phải thu và các dòng cấu kiện. Link được chuyển sang đúng `Alumdoor Item`, `Alumdoor Color`, `Alumdoor Quotation Item`; khối gợi ý mô-tơ ERPNext cũ được tắt vì kiểu mô-tơ đã nằm trong SKU. API cấu kiện sửa khóa nối từ mặt hàng bán sang thành phần cha của Sales Package, nên AL548N hiện đúng 1 lá yếm, 1 lá trung gian, 1 lá đáy lớn và 2 ray theo số cái, đồng thời tự áp phụ thu vận chuyển 300.000 cho cửa nhỏ.
- Workbench Tạo đơn hàng pure-Frappe Alumdoor bám lại ma trận màn cũ: chỉ cửa Đức đổi PB nhựa/PB ray theo Đại lý–Khách lẻ; Úc, Đài Loan, Siêu trường, Lưới dùng PB ray và chỉ hiện thông số chuyên biệt. MTN/KT/Trọn bộ/Tách món không lặp thành cột Cách bán; Tặng ray được server tự xét theo diện tích. Sơn ray chỉ dành cho cửa Trọn bộ, tích mới mở màu phụ kiện; ray rời chỉ còn Màu và Dài.
- Cửa Đức lấy sẵn chiết khấu 15% nhưng vẫn cho phép sửa; dòng chi tiết bám màn cũ, hiển thị ngay số tiền chiết khấu, phụ thu và tiền phải thu, cập nhật tức thời sau khi đổi phần trăm.
- Header đơn hàng được gom theo cặp nghiệp vụ, footer bỏ Dòng hàng/Diện tích, đặt VAT (%) và Tiền cọc đúng chuỗi tổng tiền; tiền cọc định dạng dấu chấm Việt Nam. Chi tiết dòng hiện snapshot cấu kiện theo số cái và quy cách tiêu hao, phụ thu/giảm trừ tự động tách đúng vào Phụ thu/Chiết khấu.
- Màn tạo chứng từ pure-Frappe Alumdoor dùng duy nhất tiêu đề “Tạo đơn hàng”, bỏ tiêu đề con bị lặp; nút đóng nay cảnh báo khi còn dữ liệu chưa lưu. Khách hàng và mã mặt hàng chuyển sang Link combobox tìm kiếm có lọc quyền, phản hồi màu/giá cũ không còn ghi đè lựa chọn mới, trạng thái lỗi có vùng cảnh báo trực tiếp và điện thoại dùng thẻ dòng hàng riêng thay vì bảng cuộn ngang.
- Alumdoor đồng bộ chiết khấu mặc định với kết quả tính giá thực tế, giữ đúng quà tặng khi dùng báo giá đã khóa và kiểm tra Link/Dynamic Link cả trong bảng con trước khi lưu.
- Các truy vấn công nợ theo danh sách lớn được chia trang an toàn; Phiếu giao hàng chặn gửi khi dòng hàng còn đang tải và số phân bổ chi phí mua hàng hiển thị đúng đơn vị tiền/tỷ trọng.
- Khi mở Đơn hàng Alumdoor từ màn danh sách, hệ thống dùng đúng biểu mẫu bán hàng chuyên dụng (gồm bảng dòng hàng, cách bán và thông số cửa) thay cho Form chi tiết chung; đơn nháp được lưu sửa trực tiếp, đơn đã khóa chuyển sang chỉ xem.
- Cách bán `Kéo tay/Motor ngoài/Motor trong` tự đồng bộ và khóa trường `Kiểu lá / motor` để đơn bán và dữ liệu sản xuất không lệch nhau; Worker đối chiếu không phân biệt hoa thường. Bổ sung đủ sáu Chính sách công thức cửa và ước số bản lá đã kiểm kê cho 15 mã Cửa Đức, đồng thời đưa các giá trị này vào bộ sinh dữ liệu cho lần cài mới.
- Màn Đơn hàng Alumdoor dùng một ô `Số lượng` duy nhất cho số cửa/cấu kiện cần sản xuất; kết quả quy đổi tính tiền mang nhãn `Khối lượng`. Dòng tự tính lại sau 180 ms khi đổi mã hàng, cách bán, màu, kích thước hoặc số lượng; phản hồi cũ không được ghi đè dữ liệu mới.
- Ô `Cách bán` trên đơn Alumdoor giờ là lựa chọn nghiệp vụ thật: Úc đổi hai chiều `Kéo tay ↔ Motor ngoài`, cửa lưới và Đài Loan đổi `Trọn bộ ↔ Tách món`; khi đổi hệ thống tự chuyển sang đúng SKU có giá/package tương ứng. Riêng Đài Loan chọn SKU trọn bộ theo bậc diện tích hiện tại. Trường ánh xạ mở rộng được đọc qua bản ghi chi tiết Sales Option, không gửi vào API danh sách nên tương thích đúng allowlist của Forge. Các lựa chọn có điều kiện như Cửa Đức tặng ray vẫn hiện trong danh sách và trả lỗi tiếng Việt nếu chưa đủ điều kiện.
- Hoàn thiện cấu hình bán Alumdoor sau audit: Úc, Đài Loan và cửa lưới dùng ba Sales Package chung lấy động đúng SKU trọn bộ; Đài Loan Inox, siêu trường và các SKU tách món không bung Package; hai mã Đức kéo tay AL70 có Cách bán `Kéo tay` riêng. Mã `HH-CUAKEODL` chưa có giá/cách bán xác nhận được khóa khỏi danh sách bán thay vì tạo dòng 0 đồng.
- Thông báo lỗi tính giá dòng hàng không còn che mất nguyên nhân từ máy chủ; các lỗi thiếu kích thước Package, thiếu biến thể giá và Package không hợp lệ được dịch rõ sang tiếng Việt, lỗi chưa có bản dịch vẫn hiện nguyên văn.
- Gom Cửa Đức về hai Cách bán cấp nhóm `Chỉ lá` và `Tặng ray từ 8 m²`; loại bỏ 15 cấu hình Cách bán/Package lặp theo mã, lọc lựa chọn theo biến thể giá hiện có và dùng một Package chung lấy động mặt hàng từ dòng đơn hàng.
- Cách bán tặng ray hiển thị thêm dòng khóa ngay dưới dòng `Chi tiết`; mã hàng, vai trò, ĐVT, khóa cấu phần và số lượng đều đọc từ Sales Package, không hard-code nhãn ray trong giao diện; đơn giá và thành tiền là `0đ`, không tạo doanh thu hoặc xuất kho trùng.
- Chiết khấu mặc định `15%` của nhóm `Cửa CN Đức` được chuyển thành `Pricing Rule` chính thức và điền ngay sau khi nhận diện nhóm mặt hàng, không chờ tải xong cách bán/bảng giá; khi đổi mặt hàng hệ thống xóa tỷ lệ cũ và các nhóm không có quy tắc chiết khấu mặc định về `0%`.
- Cảnh báo lỗi dòng hàng trên màn tạo Đơn hàng được gom lên đầu bảng `Chi tiết bán hàng`, hiển thị chữ đỏ đậm bằng tiếng Việt và không còn chen dưới ô chọn mặt hàng.
- Điều kiện `Sales Option` theo diện tích luôn đọc lại số m² tính giá mới nhất của dòng hàng và đồng bộ các facts `billable_area_sqm`, `area_sqm`, `sqm2` trước khi kiểm tra phương án bán.
- Màn tạo Đơn hàng hiển thị mọi thông số mở rộng của mặt hàng thành một dòng `Chi tiết` ngang ngay dưới dòng hàng tương ứng; không xuống nhiều hàng, có cuộn ngang khi thiếu chỗ và bỏ panel thông số riêng theo dòng đang chọn.
- Màn tạo Đơn hàng dùng danh mục mặt hàng chỉ như bộ chọn nhập nhanh, không cho tạo/sửa danh mục tại dòng hàng; lựa chọn được lưu thành `Sales Order Item` của đơn. Các bản ghi xen kẽ theo token nền và mọi ô dữ liệu dùng cùng kiểu bo tròn căn giữa.
- Màn tạo Đơn hàng tự chọn bảng giá có `effective_date` mới nhất đang hoạt động tại ngày đặt hàng; khi có nhóm giá khách hàng thì ưu tiên bảng mới nhất đúng nhóm. Nếu chỉ có một bảng giá chưa ngừng dùng thì tự chọn cả với dữ liệu cũ chưa có ngày hiệu lực.
- Restored the runtime-level Glide editor portal so Link, Select, and numeric editors open inside Excel-style grids.
- Alumdoor Sales Order grid link fields now use `Sales Order Item` metadata for item and sales-option editors instead of hard-coded target doctypes.
- Fixed the Alumdoor Sales Order item picker closing immediately after clicking a grid row, which also prevented the dependent sales-method choices from appearing.
- Alumdoor Sales Order creation now exposes the `Bảng giá` selector in the customer header and re-previews line prices when it changes.
- Đơn giá theo bảng giá lưu độc lập theo phương án bán; phương án được lọc theo nhóm sản phẩm và tự ánh xạ sang biến thể giá dùng bởi máy chủ.
- Chính sách ca AlumDoor đã duyệt cho phép quản lý sửa tên, múi giờ, các mốc ca, giới hạn công, chu kỳ QR và khoảng hiệu lực; có thể xoá chính sách khi không còn bản ghi tham chiếu hoặc phát sinh sổ cái.
- Chính sách ca AlumDoor nhập các mốc ca bằng giờ 24 giờ `HH:mm` và giới hạn công bằng `giờ + phút`; backend vẫn lưu phút để giữ nguyên thuật toán chấm công/lương và tương thích dữ liệu cũ.
- The sales-line mesh-height field appears only for Cửa Lưới.
- Sales Orders now select the latest active price list for the customer's price group, while preserving a manual override.
- Renamed the Item tracking section to “Quản lý lô & serial”.
- The Item tracking section hides expiry, negative-stock, origin/specification, and per-item valuation fields while retaining BOM, lot, serial, and retirement controls.
- Form checkboxes stay square even when the touch-density layout is enabled.
- The Item identity section now retains only the allowed-colors table.
- The Item form no longer shows the unused catch-weight setting.
- The Item list's Item Group filter now shows only active leaf groups, matching the Item form.

- Ẩn các dòng mô tả phụ của trường trên toàn bộ biểu mẫu để bố cục gọn và cân bằng hơn.
- Dòng hàng Đơn hàng không còn đọc `Item.default_warehouse`; kho xuất chỉ lấy từ lựa chọn của chứng từ/dòng hàng.
- Ô chọn Nhóm hàng của Mặt hàng chỉ hiển thị nhóm lá đang hoạt động, không còn nhóm cha.

## 0.2.0 — Enterprise Parallel Baseline — 2026-08-03

### Added

- Forge Enterprise Completion Skill.
- Enterprise North Star và capability map có ID ổn định.
- Parallel Agent Board, execution protocol và prompt chuẩn.
- 18 workstream branch cho architecture/kernel, finance/VN, CRM, procurement, inventory/WMS, manufacturing/QMS, HCM/payroll, project/service, BI/AI, BPM/App Factory, integrations, security/SaaS, SRE/data safety, migration/implementation, frontend/mobile, workplace/DMS, logistics/POS/commerce và Alumdoor reference vertical.
- Product versioning policy cho monorepo Forge.

### Changed

- Root Forge product/integration version: `0.1.0` -> `0.2.0`.
- Enterprise completion được đo bằng capability maturity/evidence thay vì số màn hình/module.
- Parallel development dùng explicit branch ownership và dependency requests thay vì nhiều agent cùng sửa shared hotspots.

### Cleanup

- PR coordination #293 merged vào `main`.
- Đóng các PR stale/superseded/temporary đã xác định rõ: #224, #248, #256, #257, #259, #285.
- Giữ các PR substantive chưa supersede để agent owner audit/cherry-pick/rebase theo exact state thay vì xóa mất lịch sử có giá trị.

### Release boundary

Đây là **source baseline**, không phải xác nhận production release. Không production migration/deploy/secret/DNS/customer-data mutation chỉ vì version được bump.
