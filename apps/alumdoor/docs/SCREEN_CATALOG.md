# Screen Catalog — Alumdoor

> Thiết kế frontend v1 cho Forge React kết nối Frappe. Brand Alumdoor thắng preset ngành; skeleton, accessibility và state contract theo appweb-frontend.

## 1. Shell, brand và breakpoint

- Desktop `≥768px`: sidebar tối thu gọn được, header gọn, content max phù hợp dữ liệu; Ctrl+K tìm nhanh.
- Mobile `<768px`: shell riêng, bottom navigation tối đa 5 mục, FAB theo màn; không thu nhỏ nguyên bảng desktop.
- Logo Alumdoor hiện có; primary lấy từ cam logo sau khi đo tương phản. Nếu chữ trắng không AA, dùng shade cam đậm cho nút, giữ cam gốc làm accent/logo.
- Nền slate lạnh, card trắng/dark tương ứng theme; success/warning/danger dùng semantic token, không dùng cam brand làm cảnh báo.
- Touch target tối thiểu 44px; focus visible; form có label; lỗi đặt sát field và summary đầu form.
- Chuẩn hiển thị: ngày `dd/MM/yyyy`, tiền `1.234.567 đ`, kích thước theo profile; dữ liệu gửi server không chứa separator.

## 2. Điều hướng

### Desktop sidebar

1. Tổng quan
2. Bán hàng
   - Đơn hàng
   - Tạo đơn hàng
3. Sản xuất
   - Yêu cầu sản xuất
   - Lệnh sản xuất
4. Kho
   - Tồn kho
   - Nhập/xuất/điều chuyển
5. Mua hàng
   - Đơn mua
   - Nhập kho mua
6. Giao hàng & Thu chi
7. Danh mục
   - Đối tác, Vật tư hàng hóa, Nhóm vật tư, Đơn vị tính, Màu/bề mặt, Kho
   - Cấu hình cửa, Công thức, Gói bán, Bảng giá, Quy tắc giá
8. Hệ thống
   - Trung tâm phân quyền, Nhập dữ liệu, Thiết lập doanh nghiệp, Nhật ký

Menu theo role; không có mục Báo giá, Quotation, AI hoặc Zalo.

### Mobile bottom nav

`Tổng quan | Đơn hàng | Sản xuất | Kho | Thêm`; FAB “Tạo đơn” cho O/A/S. Mục Thêm mở sheet Mua/Giao/Thu chi/Danh mục.

## 3. Bảy trạng thái bắt buộc

Mọi list/detail/form có: `loading` skeleton đúng hình; `empty` có CTA; `error` có thông báo + thử lại + request_id; `success`; `disabled`; `permission denied`; `offline`. Mutation offline bị chặn và giữ draft local có nhãn “Chưa gửi”; không giả báo lưu thành công.

## 4. Danh mục màn hình

| Route | Màn/type | Role | Desktop | Mobile | Primary action |
|---|---|---|---|---|---|
| `/app/dashboard` | Dashboard | O/A/S | KPI + hàng chờ + cảnh báo | Card dọc | Tạo đơn |
| `/app/sales-orders` | List Đơn hàng | O/A/S | DataTable 3 vùng | Card list | Tạo đơn |
| `/app/sales-orders/new` | Tạo đơn | O/A/S | Workbench grid | Card editor | Lưu/Gửi đơn |
| `/app/sales-orders/:id` | Chi tiết/sửa | O/A/S | Header + items + timeline | Sections | Action theo state |
| `/app/production-requests` | Queue | O/A, S xem | Queue table | Cards | Tạo lệnh |
| `/app/production-orders/:id` | Detail/workflow | O/A, S xem | Units/components/diff | Steps | Action trạng thái |
| `/app/stock` | Dashboard tồn | O/A, S xem | Filters + balance table | Search/cards | Tạo phiếu |
| `/app/stock-entries/*` | List/form/detail | O/A | Table/form | Wizard cards | Submit |
| `/app/purchase-orders/*` | List/form/detail | O, A xem/nhập nhận | Table/form | Cards | Tạo đơn mua |
| `/app/purchase-receipts/*` | List/form/detail | O/A | Table/form | Wizard | Submit nhập |
| `/app/deliveries/*` | List/form/detail | O/A, S xem | Table/form | Cards | Xác nhận giao |
| `/app/payments/*` | List/form/detail | O/A, S xem | Table/form | Cards | Thu/chi |
| `/app/masters/:doctype` | CRUD master | O; O/A/S đọc | DataTable + drawer | Card + full screen form | Thêm |
| `/app/import` | Import wizard | O | 5 bước | 5 bước | Commit |
| `/app/settings` | Settings | O | Tabs | Sections | Lưu |
| `/app/audit` | Audit/revisions | O; A xem chứng từ | Diff/table | Timeline | Export |

## 5. Dashboard

### KPI

- Đơn chờ duyệt ngoại lệ.
- Đơn đang sản xuất.
- Đơn sẵn sàng giao.
- Đơn sắp trễ/quá hạn.
- Còn phải thu.
- Vật tư thiếu cho lệnh đã duyệt.

Mỗi card có số, nhãn, thời gian dữ liệu và click tới list đã filter. Không có chart trang trí. Dưới KPI là “Việc cần xử lý” theo quyền và “Hoạt động gần đây”.

## 6. List pattern

Desktop tối đa ba vùng chính: định danh; trạng thái/nghiệp vụ; số tiền/ngày. Cột phụ vào popover “Hiện cột”, preference lưu theo user. Header sticky, horizontal scroll chỉ khi thật cần, action row trong menu; không nhét mọi field vào một bảng.

Mobile mỗi record là card:

```text
[Mã đơn]              [Trạng thái]
Khách hàng
Giao: dd/MM      Còn thu: ...
[Action chính]               [⋯]
```

Filters dùng Sheet; search có debounce; empty CTA theo role; pagination/cursor rõ.

## 7. Màn Tạo đơn hàng — màn trọng tâm

### 7.1 Tiêu đề

Chỉ một tiêu đề `Tạo đơn hàng`; bỏ hoàn toàn dòng “Tạo Alumdoor Quotation” và mọi chữ “Báo giá”. Bên phải: `Xem trước`, `Lưu nháp`, `Gửi đơn`; dưới 768px đưa actions vào sticky bottom bar.

### 7.2 Header snapshot

Desktop chia hai card cân đối, không trải 8 ô thành một hàng:

```text
┌ Khách hàng & phụ trách ─────────┐  ┌ Giao dịch & thanh toán ─────────┐
│ Khách hàng [Link..............] │  │ Ngày đơn  [........]            │
│ Loại khách [snapshot]           │  │ Ngày giao [........]            │
│ Người phụ trách [Link.........] │  │ Bảng giá  [........]            │
│ Điện thoại/địa chỉ [snapshot]   │  │ Thanh toán [....]  TK NH [....] │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

- Ngày đơn/ngày giao là một cụm trên/dưới.
- Loại khách/người phụ trách là một cụm cạnh nhau theo logic đọc.
- Bảng giá nằm bên phải cùng thanh toán và tài khoản ngân hàng.
- Loại khách, liên hệ, địa chỉ là snapshot: hiện nhưng không sửa trực tiếp trong đơn.

### 7.3 Dòng hàng desktop

Không có cột “Cơ sở giá”, “Diện tích cửa” hoặc “Số bộ”. Cột trái/phải ngắn; grid đổi theo Measurement Profile:

```text
[▸] [Mã mặt hàng            ] [Màu       ] [Kích thước động...] [SL] [ĐVT] [Khối lượng] [Đơn giá] [Thành tiền] [⋯]
```

- `Số lượng`: số cái/bộ/thanh sản xuất.
- `Khối lượng`: đại lượng nhân đơn giá, read-only.
- Mã MTN hiện “Mô tơ ngoài” read-only trong vùng thuộc tính, không dropdown.
- Chỉ Cửa Đức hiện PB ray/PB nhựa phù hợp Đại lý/Khách lẻ. Cửa khác dùng field profile riêng.
- Sơn ray chỉ hiện khi SKU/ray có option này; checkbox “Sơn ray” bật thì mới hiện màu ray và chiều dài tính phụ thu.
- Màu dropdown chỉ chứa option được phép; option cố định hiện nhưng disabled.
- Giá trị calculate tức thời qua lifecycle hook: mỗi đổi input tăng revision, hủy request cũ, chỉ nhận response revision mới nhất. Không spinner toàn trang; row đang tính có indicator nhỏ.

### 7.4 Dòng giải thích và cấu kiện

Ngay dưới mỗi dòng có strip:

```text
Giá gốc 12.000.000  − CK 15% (1.800.000)  + Phụ thu vân gỗ 465.000/m² (...)  = ...
```

Chỉ dòng có mã trọn bộ mới có nút `▸ Cấu kiện (n)`; mở bảng `Mã | Tên | Số lượng | ĐVT | Khối lượng | ĐVT đo | Ghi chú`. Số lượng không quy thành mét. Bộ 3 lá đáy thể hiện ba item riêng.

### 7.5 Mobile item editor

Mỗi item là card tóm tắt. Tap mở full-screen editor chỉ render field profile liên quan. Sticky footer hiển thị thành tiền và `Xong`. Cấu kiện là accordion. Không render bảng rộng có scroll ngang.

### 7.6 Tổng kết và tiền cọc

Khối tổng kết nằm sau bảng, align phải desktop/full width mobile:

```text
Tiền hàng                         ...
Chiết khấu                        ...
Phụ thu dòng                      ...
Vận chuyển/chuyến                 ...
Tổng trước VAT                    ...
VAT                    [ 8 ] %    ...
TỔNG THANH TOÁN                   ...
Tiền cọc               [2.000.000]
Đã thu khác                        ...
CÒN PHẢI THU                       ...
```

VAT nhập ở đây và tính tức thời. Tiền cọc đặt đúng cạnh summary thanh toán, format dấu chấm khi blur/hiển thị, không dùng input number có spinner. Không có “dòng hàng” giả cho VAT/cọc.

### 7.7 Validation và submit

- Lỗi field inline + focus dòng đầu lỗi; lỗi rule có message nghiệp vụ, không mã kỹ thuật trần.
- Gửi mặc định: toast Approved + link Production Request.
- Gửi ngoại lệ: banner “Chờ Chủ xưởng duyệt” liệt kê nguyên nhân.
- Retry dùng cùng idempotency key.

## 8. Chi tiết đơn và sửa sau duyệt

- Header có mã, trạng thái, khách, ngày giao, còn thu; actions đúng state.
- Tabs/sections: Dòng hàng, Cấu kiện, Sản xuất, Kho & giao, Thu chi, Lịch sử.
- `Xem trước bản in` luôn có cả khi draft local đã calculate và sau lưu.
- Sửa Approved mở warning “Đơn đang/đã vào sản xuất”; bắt buộc lý do trước save; xem diff trước xác nhận.
- Sau save: status Pending Owner Approval, Production Order có banner yêu cầu ack diff.
- Sau stock lock: toàn form readonly, chỉ còn In/Xuất PDF, Tạo phiếu trả/điều chỉnh thích hợp.

## 9. Sản xuất

Queue ưu tiên: thay đổi chưa ack, quá ngày, chờ tạo lệnh, đang làm, chờ nghiệm thu. Production detail hiển thị snapshot kích thước và bảng cấu kiện làm việc; mỗi unit có qty vật lý, không khoét nghĩa bằng measure. Chủ xưởng có action `Nghiệm thu đạt`; không có role sản xuất riêng.

## 10. Kho

- Balance: tìm item, kho, vị trí; số hiện tại và phát sinh gần nhất.
- Phiếu xuất từ lệnh sản xuất có preview nhu cầu/current/projected; số âm tô danger và chặn submit.
- Draft được chuẩn bị trước ngày giao nhưng banner nói rõ “Chưa trừ tồn, chưa khóa đơn”. Dialog submit nói “Thao tác này trừ tồn và khóa toàn bộ đơn hàng”.
- Không hiện cột giá vốn/giá trị tồn.

## 11. Mua, giao và thu chi

- Purchase Order: Supplier, ngày, item/qty/uom/note; Owner tạo/submit.
- Purchase Receipt: chọn PO, warehouse, outstanding qty; O/A submit ghi tồn.
- Delivery: chỉ chọn toàn bộ đơn; v1 không có partial qty editor.
- Payment: Receipt/Payment, order, account, amount, date, note; summary đơn cập nhật sau submit.

## 12. Danh mục và Link field

Link field tìm server-side, keyboard usable, hiển thị mã + tên; không load hàng nghìn option. Form master dùng drawer desktop/full-screen mobile. Không xóa record đã tham chiếu; dùng `is_active` và lý do vô hiệu hóa.

Các nhóm phải có màn: Đối tác/Loại đối tác, Nhân viên, Nhóm vật tư, ĐVT/quy đổi, Vật tư, Màu/bề mặt/màu cho phép, Kho, Measurement Profile, Door Type/System/Formula, Sales Package/Component Rule, Price List/Item Price/Pricing Rule, tài khoản tiền và Settings.

## 13. Import wizard

Năm bước: `Chọn bộ dữ liệu → Tải file → Ghép cột → Kiểm tra → Ghi dữ liệu`. Preview lỗi theo dòng/cột, tải file lỗi được. Quy tắc Alumdoor override wizard chung: chỉ bật Commit khi toàn bộ file không còn lỗi; commit là all-or-nothing. Không có lựa chọn “bỏ qua dòng lỗi”.

## 14. In

- Preview modal/panel từ cùng dữ liệu calculate; A4 mặc định, A5 tùy chọn.
- Bản gửi khách chỉ có thông tin cơ bản, dòng hàng, tổng, VAT/cọc/điều khoản; không lộ công thức nội bộ.
- Dòng trọn bộ có thể hiện cấu kiện theo option print; dòng thường không dựng cấu kiện giả.
- HTML server sanitized, logo nhúng đúng, page break không cắt dòng/tổng/chữ ký.

## 15. Accessibility, performance và QA

- WCAG AA cho text/control/status; status không chỉ phân biệt bằng màu.
- Tab order theo thị giác; Escape đóng popover; Enter không vô tình submit form lớn.
- Virtualize/search server cho danh mục lớn; calculate không blocking toàn màn.
- Visual QA bắt buộc ở 1440×900, 1280×720, 390×844 và 360×800; light/dark nếu app giữ dark mode.
- Test keyboard, screen reader label, offline, permission denied, empty/error/loading.

## 16. Cổng màn hình

- [x] Navigation và role rõ; bỏ hoàn toàn Báo giá.
- [x] Màn Tạo đơn kế thừa đúng logic cũ/tài liệu nhưng dùng contract mới.
- [x] Desktop/mobile là hai cây render phù hợp.
- [x] Đủ bảy trạng thái, import, print và accessibility.
