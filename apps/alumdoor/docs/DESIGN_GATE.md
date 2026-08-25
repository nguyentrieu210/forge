# Cổng 3 — duyệt thiết kế Alumdoor

> Ngày trình duyệt: 2026-08-25  
> Ngày duyệt: 2026-08-25  
> Trạng thái: **ĐÃ DUYỆT Cổng 3 — được phép chuyển sang chuẩn bị/build.**

## Hồ sơ

| Tài liệu | Nội dung | Trạng thái |
|---|---|---|
| [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) | ADR, kiến trúc Frappe/Forge, transaction, state, role | Hoàn tất |
| [FIELD_LEDGER.md](FIELD_LEDGER.md) | Toàn bộ DocType/field, đủ 9 cột contract | Hoàn tất |
| [RULE_MATRIX.md](RULE_MATRIX.md) | Cột động, kích thước, giá, phụ thu, duyệt, kho, test biên | Hoàn tất |
| [API_CONTRACT.md](API_CONTRACT.md) | Payload/response/action/quyền/lỗi/idempotency | Hoàn tất |
| [SCREEN_CATALOG.md](SCREEN_CATALOG.md) | Desktop/mobile, màn Tạo đơn, 7 trạng thái, print/import | Hoàn tất |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Canonical source, backup, mapping, cutover, rollback | Hoàn tất |

## Quyết định khóa khi duyệt

1. Frappe v16/MariaDB là nguồn dữ liệu đúng; Forge React là UI.
2. Bỏ cơ chế Báo giá; dùng thẳng `Alumdoor Sales Order`.
3. Preview/create/update dùng cùng một calculation service phía server.
4. Chỉ `% chiết khấu` cho sửa; VAT mặc định 8% và không tự cần duyệt.
5. Sửa Approved luôn cần lý do và duyệt lại; submit xuất kho khóa toàn đơn.
6. `Số lượng` vật lý tách `Khối lượng` tính tiền; cấu kiện chỉ sinh cho gói trọn bộ.
7. Kho chỉ số lượng, cấm âm; không kế toán/valuation.
8. Import all-or-nothing; không bỏ qua dòng lỗi.
9. Không AI/Zalo ở bản đầu.
10. Không dual-write hay drop dữ liệu cũ trong release cutover.

## Sau khi duyệt

Pha 4/5 mới được phép: backup site, đưa backend vào nguồn Git canonical, dựng/đổi DocType và API, thay màn Tạo đơn, migrate dữ liệu, chạy test/visual QA. Mọi sai khác so với hồ sơ này phải quay lại xin quyết định.

## Xác nhận

- [x] **Chủ xưởng duyệt Cổng 3 và cho phép bắt đầu build/migration theo hồ sơ trên.**

## Phụ lục quyết định sau grill

| ID | Quyết định đã duyệt |
|---|---|
| Q118 | Item có cờ `is_manufactured_item`; hàng bán rời lấy kho bỏ qua sản xuất. |
| Q119/Q123/Q126 | Cọc là tiền thu thật; Draft chỉ giữ dự kiến, khi Gửi đơn mới tạo Phiếu thu đã xác nhận và bắt buộc tài khoản tiền. |
| Q120 | Giữ master đã nhập; backup rồi archive giao dịch demo, không biến thành đơn thật. |
| Q121 | Sửa sau khi đã cắt: cảnh báo + diff + xác nhận; phế/hoàn vật tư đi bằng Phiếu điều chỉnh riêng. |
| Q122 | Đơn hỗn hợp giữ một đơn; lệnh chỉ có dòng sản xuất; phiếu xuất cuối gồm cả cấu kiện và hàng bán rời. |
| Q124 | Đơn mua có giá/tổng thương mại; kho chỉ ghi số lượng, không giá vốn/hạch toán. |
| Q125 | Nghiệm thu từng bộ; toàn lệnh chỉ sẵn sàng giao khi mọi bộ đạt, bộ lỗi chuyển Làm lại. |
| Q127 | Hủy đơn có cọc giữ Phiếu thu; hiển thị `Cần hoàn khách`, hoàn bằng Phiếu chi hoặc ghi lý do giữ lại. |
| Q128 | Hủy/đảo phiếu xuất không mở khóa đơn đã từng xuất. |
| Q129 | Mua vào cho phép nhận từng phần; giao khách v1 vẫn toàn bộ. |
