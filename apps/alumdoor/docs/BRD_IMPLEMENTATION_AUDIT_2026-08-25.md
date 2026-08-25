# Audit mức độ triển khai BRD — Alumdoor Frappe Pure

> Ngày audit: 2026-08-25  
> BRD đối chiếu: `BRD.md` v3.0, đã duyệt Cổng 2  
> Kết luận: **CHƯA HOÀN THÀNH BRD, CHƯA QUA CỔNG VERIFY, CHƯA SẴN SÀNG VẬN HÀNH**

## 1. Tóm tắt điều hành

Implementation hiện tại mới hình thành nền danh mục và một lát cắt của luồng Đơn hàng. Ước lượng theo capability có trọng số, hệ thống mới đạt khoảng **25–35% BRD**. Con số này không phải phần trăm dòng code; một file giao diện cũ tồn tại không được tính là capability hoàn thành nếu chưa có DocType, service, quyền, state machine, transaction và test chạy thật theo BRD mới.

### Cập nhật khắc phục P0 trong ngày audit

- **P0-01 đã khắc phục ở biên runtime Đơn hàng:** frontend không còn gọi endpoint `quotation_service`; customer/item context, calculate và save đều đi qua `api_v1` của Sales Order. Tên file/service nội bộ cũ vẫn phải tách và archive ở lát cắt migration sau.
- **P0-02 đã khắc phục:** bảng giá người dùng chọn được kiểm hiệu lực, dùng thật khi tính/lưu; engine chỉ nhận dòng `Alumdoor Item Price` khớp đúng bảng giá + biến thể, không fallback về giá chuẩn của Item.
- Đã thêm `price_variant`, chạy migration tạo **594 dòng giá** từ file nguồn cho hai bảng Đại lý/Khách lẻ. Kiểm thử live AL501C: dưới 8 m² dùng `CHI_LA` 1.400.000/m²; từ 8 m² dùng `TANG_RAY` 1.475.000/m².
- Đã sửa race condition lifecycle làm màn treo “Đang tính”. Browser live xác nhận 3,5 × 2 m → 7 m²; tiền hàng 9.800.000; giảm 15%; VAT 8%; tổng 8.996.400; cọc 2.000.000 → còn 6.996.400.
- Frappe integration hiện **17/17 đạt**; test frontend tập trung phần vừa sửa **12/12 đạt**; typecheck vertical đạt. Global verify vẫn đỏ do ba test baseline ngoài lát cắt này và các capability BRD còn thiếu, nên kết luận tổng thể “chưa hoàn thành BRD” không thay đổi.

Các bằng chứng định lượng:

- Field Ledger yêu cầu 48 DocType đích được kiểm kê trực tiếp; source hiện có 26, còn thiếu 22.
- API mới chỉ công bố 6 action của Sales Order: calculate, save, submit, approve, reject, cancel.
- Chưa có service mới cho Production Order/Unit, Stock Entry/Ledger, Purchase, Delivery, Payment workflow, Import, Audit và Request Key.
- Frappe integration test: **13/15 đạt**, 1 fail + 1 error.
- Test frontend tập trung vừa chạy: **11/11 đạt**; đây chỉ phủ nguồn tính Khối lượng, preview coordinator và registration.
- `pnpm run verify`: **FAIL** tại test suite nền; cổng DoD chưa xanh.
- Browser thật desktop: màn Tạo đơn có form cơ bản và bảng dòng hàng, nhưng không có action Xem trước/In theo BRD.
- Browser thật 390×844: form vẫn render bảng desktop rộng, chưa chuyển thành mobile item cards/full-screen editor.

## 2. Ma trận theo nhóm BRD

| Nhóm | Trạng thái | Đã có | Thiếu hoặc sai |
|---|---|---|---|
| Kiến trúc Frappe thuần | Một phần | DocType và service mới nằm trong app `alumdoor`; MariaDB/Frappe là nơi lưu đơn | Frontend vẫn gọi `quotation_service.preview_quotation_line`; cơ chế Quotation và Configured Product cũ còn hoạt động |
| Danh mục nền | Một phần | Partner, Item, Item Group, UOM, màu, kho, giá, formula, Sales Package và Component Rule | Thiếu Item Color Allowance riêng, Bin Location, Measurement Profile/Field đúng mô hình mới, Settings; dữ liệu/package chưa được chứng minh đủ 100% |
| Đơn hàng | Một phần | Sales Order/Item, calculate/save/submit/approve/reject/cancel, VAT 8%, discount Đức đại lý, revision record, deposit receipt, Production Request | UI/action chưa đúng hợp đồng hoàn chỉnh; chưa có preview HTML; không có cancel UI; status còn tiếng Anh; create/update chưa theo envelope/idempotency/concurrency đầy đủ |
| Giá và phụ thu | Một phần | Có engine server và nhiều rule nguồn; test nguồn đã phủ một số phụ thu/biên | Calculate từng dòng đi qua service Quotation cũ; đổi bảng giá không thực sự dùng bảng được chọn; chưa có bộ acceptance test cho toàn bộ ADJ-01…15 trên Frappe live |
| Cấu kiện/snapshot | Một phần | Preview có thể trả component; Sales Order Item có JSON snapshot | Test tìm package từ parent đang error; thiếu Component Snapshot/Adjustment Snapshot riêng; chưa chứng minh đủ bộ 3 lá đáy và toàn bộ mã trọn bộ |
| Duyệt và sửa đơn | Một phần | Ngoại lệ discount/price list tạo trạng thái chờ; sửa đơn sau duyệt bắt lý do và tạo revision | Owner đang đồng nhất với Administrator/System Manager; không có role Chủ xưởng/Kế toán/Sale; diff chỉ ghi `recalculated=true`; không có Production ack change |
| Sản xuất | Gần như chưa có | Production Request tối giản | Thiếu Production Order, Production Unit, mã từng bộ, release/start/complete, nghiệm thu/rework, snapshot cấu kiện làm việc và ack revision |
| Kho | Chưa có theo BRD mới | Có master Warehouse; các file UI/ERPNext cũ tồn tại | Thiếu Stock Entry/Item/Ledger mới, kiểm âm kho, transaction submit/reversal, xuất từ sản xuất và cơ chế khóa đơn thật |
| Mua hàng | Chưa có theo BRD mới | Có file UI cũ cho Purchase Order/Receipt | Không có DocType/service pure-Frappe mới; chưa có partial receipt và ledger số lượng |
| Giao hàng | Chưa có theo BRD mới | Có file UI Delivery Note cũ | Không có DocType/service mới; chưa chặn partial delivery; chưa cập nhật trạng thái Delivered |
| Thu chi | Một phần rất nhỏ | Money Account, Cashflow Category, Payment Entry và tự tạo phiếu cọc | Payment controller rỗng; không có create/submit/cancel service, kiểm vượt tổng, hoàn tiền và màn thu/chi theo đơn đầy đủ |
| Import | Chưa có | Tài liệu hợp đồng đã viết | Thiếu Import Job/Error, validate toàn file, checksum, commit nguyên tử và wizard 5 bước |
| Audit/idempotency/concurrency | Chưa đạt | DocType có `track_changes`; save có kiểm `modified` tùy chọn | Thiếu Audit Event, Request Key, request_id/envelope chuẩn; hầu hết workflow không nhận expected_modified/idempotency |
| Phân quyền | Sai mô hình | API đọc chung có dùng permission Frappe; approve có chặn System Manager | Operational DocType chỉ cấp System Manager; chưa có 3 role BRD; cancel không áp luật Sale chỉ hủy đơn mình; chưa test bypass UI |
| UI desktop | Một phần | Danh sách, form tạo đơn, summary VAT/cọc, line table, cột Khối lượng | Menu thiếu Kho/Mua/Giao/Import/Audit theo BRD; thiếu preview/in; flow duyệt dùng `window.prompt`; chưa đủ 7 trạng thái UI |
| UI mobile | Không đạt | List ngoài chuyển thành card | Form tạo đơn vẫn render nguyên bảng desktop ở 390×844; chưa có mobile item editor/full-screen/sticky action đúng contract |
| In/preview | Chưa có cho chứng từ mới | Code cũ có mapping print cho DocType ERPNext | Không có HTML preview/sanitization/print format cho `Alumdoor Sales Order`; không kiểm A4/A5/cấu kiện tùy chọn |
| Migration bỏ báo giá | Chưa đạt | Menu chính không còn mục Báo giá | `Alumdoor Quotation`, `Alumdoor Quotation Item`, `quotation_service` và workbench tên Quotation vẫn tồn tại và còn được gọi runtime |
| Test/DoD/release | Không đạt | Typecheck vertical xanh; 11 test tập trung xanh; đã smoke browser | Frappe 13/15; global verify đỏ; thiếu RBAC/API/state-machine/E2E; thiếu AI_PROJECT_CONTEXT và PROJECT_STRUCTURE; chưa có CI/PR xanh |

## 3. Các sai lệch P0 có bằng chứng trực tiếp

### P0-01 — Runtime Đơn hàng vẫn phụ thuộc cơ chế Báo giá

`AlumdoorQuotationWorkbench.tsx` gọi trực tiếp `quotation_service.preview_quotation_line`. Source vẫn có `Alumdoor Quotation`, `Alumdoor Quotation Item`, `save_quotation` và `submit_quotation`. Điều này vi phạm bất biến “Không có báo giá” và nguyên tắc một API calculate duy nhất.

### P0-02 — Đổi bảng giá không thực sự đổi nguồn giá

`sales_order_service.calculate_order()` luôn truyền `context["price_list"]` vào `_preview_line()`. Payload `price_list` khác chỉ được dùng để thêm lý do duyệt. Khi lưu, `doc.price_list` lại bị gán về bảng mặc định của khách. Tức là UI/BRD nói cho đổi bảng giá nhưng implementation không áp dụng bảng được chọn.

### P0-03 — Chưa có mốc khóa đơn bằng xuất kho

Sales Order có cờ `is_stock_locked`, nhưng toàn bộ Stock Entry/Stock Ledger service theo BRD chưa tồn tại. Vì vậy chưa có transaction nào vừa kiểm tồn không âm, ghi ledger, submit phiếu xuất và khóa đơn. Bất biến 8 và 9 chưa được triển khai end-to-end.

### P0-04 — Sản xuất dừng ở “Yêu cầu sản xuất”

Sau duyệt chỉ sinh `Alumdoor Production Request` có JSON snapshot. Không có Production Order, Production Unit, mã `DH-...-01`, nghiệm thu/rework hoặc ack thay đổi. Do đó chưa thể thực hiện luồng “đơn → sản xuất → nghiệm thu → sẵn sàng giao”.

### P0-05 — Phân quyền không đúng 3 vai trò đã chốt

Các DocType vận hành mới chỉ cấp `System Manager`. Hàm duyệt coi Administrator/System Manager là Chủ xưởng. Chưa có ma trận Chủ xưởng/Kế toán/Sale ở server và chưa có integration test gọi thẳng API với tài khoản quyền thấp.

### P0-06 — Cổng chất lượng đang đỏ

Frappe app test đang fail vì manifest expectation cũ và component package resolution trả `None`. Global verify còn fail ở test/fixture của nền Alumdoor. Theo Definition of Done, chưa được đánh dấu hoàn thành hay đưa vào vận hành.

## 4. Thứ tự hoàn thiện bắt buộc

1. **Khóa một nguồn nghiệp vụ Đơn hàng:** bỏ runtime call vào Quotation, gom bootstrap/calculate/preview/create/update/workflow vào API mới; sửa đổi bảng giá thực sự có hiệu lực.
2. **Hoàn tất trust layer:** 3 role, document permission, expected_modified, idempotency Request Key, Audit Event, error envelope/request_id; viết test bypass UI.
3. **Khép luồng Sản xuất:** Production Order + Unit + component snapshot + revision ack + nghiệm thu/rework.
4. **Khép luồng Kho:** Stock Entry/Ledger, không âm, submit/reversal, khóa đơn vĩnh viễn khi xác nhận xuất.
5. **Làm Mua/Giao/Thu chi:** PO/partial receipt, full delivery, payment/refund theo đơn.
6. **Làm Import và In:** import nguyên tử; preview HTML/print mới cho Sales Order.
7. **Hoàn thiện UI:** menu đầy đủ, desktop/mobile riêng, bảy trạng thái, action theo quyền; xóa/archival bề mặt Quotation cũ.
8. **Chạy nghiệm thu:** test toàn bộ ID trong Rule Matrix, Frappe integration, browser desktop/mobile, RBAC bypass API và `pnpm run verify` xanh.

## 5. Điều kiện được phép nói “xong BRD”

Chỉ chốt hoàn thành khi không còn mục “Một phần/Chưa có/Sai” trong ma trận trên, 48 DocType đích (hoặc ADR thay thế được duyệt) có đủ controller/service/quyền, toàn bộ endpoint hợp đồng chạy thật, các test biên bắt buộc đều có automation, Frappe tests và global verify xanh, và browser QA đạt desktop/mobile.
