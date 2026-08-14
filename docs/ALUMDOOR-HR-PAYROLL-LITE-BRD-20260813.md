# BRD 360° — AlumDoor HR & Lương Lite

- Phiên bản: `1.0-approved`
- Ngày: `13/08/2026`
- Trạng thái: Đã duyệt Cổng 2 ngày `13/08/2026`
- Phạm vi: Nhân viên, hồ sơ lương, tính lương, phiếu lương và trả lương cho doanh nghiệp nhỏ
- Quyết định của chủ doanh nghiệp: không quản lý phòng ban; tăng ca cố định `50.000 VND/giờ`
- Kế thừa: bằng chứng chấm công và nguyên tắc bất biến tài chính trong [ALUMDOOR-CHAM-CONG-TINH-LUONG-BRD-20260810.md](./ALUMDOOR-CHAM-CONG-TINH-LUONG-BRD-20260810.md)
- Thay thế: các phần giao diện Employee/Payroll và quy tắc hệ số tăng ca trong tài liệu cũ

## 0. Tóm tắt quyết định sản phẩm

AlumDoor HR & Lương Lite không phải một bản rút gọn bằng cách ẩn CSS trên form Employee chung. Đây là bề mặt nghiệp vụ riêng, dùng các chứng từ HRM/Payroll hiện có ở tầng dữ liệu nhưng chỉ hỏi người dùng những gì máy không thể tự suy ra.

Luồng chính của chủ doanh nghiệp:

1. Tạo nhân viên bằng `Họ và tên`, `Số điện thoại`, `Ngày bắt đầu`.
2. Nhập mức lương tháng/ngày; tăng ca luôn là `50.000 VND/giờ` ở bề mặt sản phẩm.
3. Mở tháng hiện tại, bấm `Tính thử`, xử lý ngoại lệ nếu có, rồi `Chốt lương`.
4. Trả tiền và bấm `Đánh dấu đã trả`; nhân viên xem phiếu lương của chính mình.

Hệ thống vẫn tự quản lý công ty, nơi làm việc, vùng lương tối thiểu, phiên bản quy tắc pháp lý, chứng từ nguồn, audit và khóa kỳ. `Phòng ban` không tồn tại trong giao diện và không được là điều kiện bắt buộc của luồng AlumDoor.

---

## 1. Vấn đề

### 1.1 Thực trạng

- Form tạo Employee tại cổng 5174 đang hiển thị hơn 18 trường, gồm nhiều danh mục chỉ phù hợp doanh nghiệp lớn: công ty, chi nhánh, phòng ban, chức danh, loại lao động, trung tâm chi phí.
- Một số trường nhạy cảm bị render thành dấu chấm do `permlevel`, khiến người dùng tưởng dữ liệu bị lỗi thay vì hiểu rằng mình không có quyền.
- Tiêu đề form dùng tên kỹ thuật `employee` thay vì `Nhân viên`.
- Luồng tạo kỳ lương hiện bắt nhập công ty, chi nhánh, từ ngày, đến ngày và ngày công chuẩn; sau đó phải đi qua nhiều trạng thái kỹ thuật.
- Bảng kết quả lương có quá nhiều cột và phải cuộn ngang trên điện thoại.
- Công thức hiện tại dùng một hệ số tăng ca theo lương cơ bản; quyết định mới của doanh nghiệp là trả cố định `50.000 VND/giờ`.
- Luồng hiện tại chưa bao phủ đầy đủ kiểm tra lương tối thiểu vùng, BHXH/PIT theo ngày hiệu lực, giới hạn khấu trừ và phân loại thời gian tăng ca để đối chiếu mức tối thiểu luật định.
- `department` vẫn bị yêu cầu ở một số controller chấm công/lương, dù doanh nghiệp không có nhu cầu quản lý phòng ban.

### 1.2 Nỗi đau cần giải quyết

| Nỗi đau | Hậu quả | Mức độ | Bằng chứng/giả định kiểm thử |
|---|---|---:|---|
| Tạo nhân viên phải hiểu cấu trúc ERP | Nhập sai hoặc bỏ dở | P0 | Ảnh cổng 5174 và metadata Employee hiện tại |
| Chuẩn bị kỳ lương có nhiều đầu vào thủ công | Sai kỳ, sai số ngày công | P0 | Màn Payroll hiện tại |
| Một hệ số tăng ca khó hiểu | Không khớp chính sách 50.000đ/giờ | P0 | Quyết định người dùng ngày 13/08/2026 |
| Dữ liệu lương/bank render không đúng quyền | Rủi ro riêng tư và khó hiểu | P0 | Permlevel hiện tại |
| Ngoại lệ chấm công lẫn vào bảng lương | Khó biết phải sửa gì trước | P1 | Luồng tính lương hiện tại |
| Không có phiếu lương giải thích dễ hiểu | Nhân viên phải hỏi lại | P1 | Yêu cầu Điều 95 Bộ luật Lao động |

### 1.3 Nguyên tắc giải quyết

- Không dùng Property Setter toàn tenant để phá form Employee chuẩn dùng chung.
- Không tạo lại hệ thống bảng lương song song; Salary Slip/Payroll Entry vẫn là chứng từ thẩm quyền.
- Dữ liệu kỹ thuật được điền ở server, không render rồi disable trên form.
- Không xóa cứng nhân viên, kỳ lương, phiếu lương, khoản điều chỉnh hoặc audit.
- Không cho chốt lương khi còn lỗi có thể làm thay đổi số tiền hoặc vi phạm quy tắc bắt buộc.

---

## 2. Mục tiêu và chỉ số nghiệm thu

### 2.1 Mục tiêu định lượng

| Mục tiêu | Chỉ số đạt |
|---|---:|
| Tạo một nhân viên | Tối đa 3 trường nhập; dưới 45 giây |
| Thiết lập lương lần đầu | Tối đa 4 trường thấy ngay; dưới 60 giây |
| Chuẩn bị kỳ lương ≤30 nhân viên | Dưới 5 phút nếu không có ngoại lệ |
| Quyết định của chủ mỗi kỳ | `Tính thử` và `Chốt lương`; trả tiền là bước riêng |
| Bảng lương desktop | Không quá 6 cột nghiệp vụ chính ngoài cột khung chuẩn |
| Mobile | Không có bảng cuộn ngang; thao tác chính trong vùng ngón cái |
| Truy vết | 100% số tiền có source, rule version và formula trace |
| Dữ liệu nhạy cảm | 0 API trả trường salary/bank/PIT ngoài quyền |
| Khóa kỳ | 0 bản ghi chấm công bị sửa âm thầm sau khi chốt |
| Tính lặp lại | Cùng snapshot đầu vào + rule version luôn cho cùng kết quả/hash |

Mốc 30 nhân viên dùng làm bộ dữ liệu nghiệm thu cho doanh nghiệp nhỏ, không phải giới hạn hệ thống.

### 2.2 Quy tắc bất biến

1. Tiền lưu và tính bằng số nguyên VND; không dùng floating point làm giá trị thẩm quyền.
2. Thời lượng lương lưu bằng phút nguyên; tăng ca trả theo tỷ lệ phút thực tế đã được duyệt.
3. Chính sách doanh nghiệp: `50.000 VND/giờ tăng ca`; phép tính giữ dạng phân số `50.000/60 VND/phút` và chỉ làm tròn một lần ở tổng tiền tăng ca theo half-up đến VND.
4. Ví dụ: `90 phút × 50.000 / 60 = 75.000 VND`.
5. `50.000 VND/giờ` là mức trả doanh nghiệp, không thay thế kiểm tra mức tối thiểu luật định theo loại ngày/giờ. Nếu mức này thấp hơn sàn áp dụng cho một dòng tăng ca, kỳ bị chặn và nêu rõ nhân viên/ngày/chênh lệch; hệ thống không âm thầm đổi chính sách.
6. Kỳ đã chốt là bất biến. Sửa sai bằng hủy/điều chỉnh có lý do và tạo phiên bản mới, không sửa trực tiếp.
7. Nhân viên đã phát sinh chấm công/lương không được xóa; dùng trạng thái `Nghỉ việc`.
8. Dữ liệu phòng ban không được bắt buộc ở API HR Lite, Attendance Lite hoặc Payroll Lite.
9. Quy tắc BHXH, PIT, lương tối thiểu và pháp lý phải có `effective_from/effective_to`; không hard-code vĩnh viễn vào UI.

### 2.3 Tiêu chí “hoàn thiện mảng lương”

Một kỳ chỉ được chốt khi:

- Không trùng hoặc chồng kỳ đang hoạt động.
- Tất cả nhân viên thuộc kỳ có hồ sơ lương hiệu lực.
- Mọi ngày công thuộc kỳ đã `approved` hoặc được loại trừ có căn cứ.
- Không còn chấm công thiếu giờ vào/ra chưa xử lý.
- Lương cơ sở đáp ứng kiểm tra tối thiểu vùng theo nơi làm việc và ngày hiệu lực.
- Mức tăng ca cố định 50.000đ/giờ không thấp hơn sàn luật định cho từng nhóm phút.
- Hồ sơ BHXH/PIT cần thiết đã đủ hoặc có trạng thái miễn/không thuộc diện kèm căn cứ.
- Mọi khoản trừ có loại, nguồn, lý do và phê duyệt hợp lệ.
- Thực nhận không âm.
- Snapshot, formula trace, rule version và hash đã được tạo.

---

## 3. Actor và vai trò

| Vai trò sản phẩm | Mapping vai trò hiện có | Nhiệm vụ | Phạm vi dữ liệu |
|---|---|---|---|
| Chủ doanh nghiệp | System Manager / HR Manager / AlumDoor Payroll Approver | Quản lý nhân viên, cấu hình lương, tính/chốt/trả lương, xem báo cáo | Toàn tenant |
| Người làm lương | AlumDoor Payroll User | Chuẩn bị hồ sơ lương, tính thử, xử lý khoản cộng/trừ | Toàn tenant nhưng không chốt/trả nếu không có quyền duyệt |
| Người chấm công | AlumDoor Attendance Manager | Xem và duyệt ngoại lệ chấm công | Nhân viên và ngày công; không thấy số lương/bank/PIT |
| Kế toán | Accounts Manager / Accounts User | Xem kỳ đã chốt, xuất danh sách chuyển, ghi nhận đã trả theo quyền | Kỳ đã chốt; không sửa hồ sơ nhân sự |
| Nhân viên | Employee | Xem thông tin cơ bản và phiếu lương của chính mình | Chỉ record gắn `user_id` của session |
| Hệ thống | AlumDoor Attendance/Payroll System | Tổng hợp chấm công, tính số, khóa snapshot | Service role; không có UI đăng nhập |

### 3.1 Chế độ doanh nghiệp nhỏ

- Mặc định `owner_only_mode = true`.
- Chủ doanh nghiệp được vừa chuẩn bị vừa chốt; UI không hiện hàng đợi “Gửi duyệt”.
- Audit vẫn ghi riêng `prepared_by/prepared_at` và `finalized_by/finalized_at`, dù cùng một người.
- Khi tenant bật người làm lương riêng, hệ thống tự mở luồng `Chuẩn bị → Gửi chủ chốt` mà không đổi dữ liệu lõi.

---

## 4. Thực thể dữ liệu và trường

Các bảng dưới đây là mô hình nghiệp vụ logic, dùng kiểu tương thích SQLite/D1 và map vào DocType hiện có ở PHA 3. Mọi thực thể nghiệp vụ có các trường chung sau; bảng con chỉ lược lại chúng để tránh lặp.

| Trường chung | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa |
|---|---|---|---|---|
| `tenant_id` | TEXT | NOT NULL, indexed; là thành phần của mọi UNIQUE nghiệp vụ | Luôn lấy từ session/service context, không lấy từ body | RLS tenant |
| `created_at` | TEXT | NOT NULL, ISO datetime | Server clock | Thời điểm tạo |
| `created_by` | TEXT | NOT NULL, FK User/service identity | Actor từ session/service context | Người hoặc hệ thống tạo |
| `updated_at` | TEXT | NOT NULL, ISO datetime | Server clock; cập nhật atomically | Thời điểm sửa gần nhất |
| `updated_by` | TEXT | NOT NULL, FK User/service identity | Actor từ session/service context | Người hoặc hệ thống sửa gần nhất |

### 4.1 Employee — hồ sơ nhân viên lõi

Map ưu tiên: DocType `Employee` hiện có.

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `name` | TEXT | PK, NOT NULL | Server cấp mã | ID kỹ thuật, không cho nhập |
| `tenant_id` | TEXT | NOT NULL, indexed | Bằng tenant session | RLS bắt buộc |
| `employee_number` | TEXT | UNIQUE `(tenant_id, employee_number)` | Pattern cấu hình; atomic counter | Mã NV tự sinh, ví dụ `NV-2026-0001` |
| `employee_name` | TEXT | NOT NULL | Trim, gộp khoảng trắng, 2–120 ký tự | `Họ và tên *` |
| `mobile` | TEXT | NOT NULL, indexed | Normalize +84→0; SĐT VN 10 số | `Số điện thoại *`; cảnh báo trùng on-blur |
| `date_of_joining` | TEXT | NOT NULL, ISO date | Không sau hôm nay quá 31 ngày; ngoại lệ cần quyền Owner | `Ngày bắt đầu *`, mặc định hôm nay |
| `employee_status` | TEXT | NOT NULL | Enum `ACTIVE, PAUSED, LEFT, ARCHIVED` | UI: Đang làm, Tạm nghỉ, Nghỉ việc |
| `job_title_text` | TEXT | NULL | Tối đa 100 ký tự | Tùy chọn trong “Thông tin thêm”; không có danh mục chức danh |
| `photo_file_id` | TEXT | FK files, NULL | Ảnh ≤5MB; MIME ảnh; quyền HR | Avatar tùy chọn, đổi từ ô avatar |
| `user_id` | TEXT | UNIQUE nullable | User cùng tenant | Chỉ tạo khi bấm `Mời dùng app` |
| `company` | TEXT | NOT NULL, FK | Server lấy từ payroll settings | Ẩn hoàn toàn |
| `branch` | TEXT | NOT NULL, FK | Server lấy workplace mặc định | Ẩn; dùng xác định nơi làm việc/vùng |
| `department` | TEXT | NULL | API Lite không yêu cầu | Không render; dữ liệu cũ được giữ |
| `cost_center` | TEXT | NULL | Server resolve nếu accounting cần | Không render trong HR Lite |
| `relieving_date` | TEXT | NULL, ISO date | ≥ `date_of_joining` | Ngày nghỉ việc |
| `archived_at` | TEXT | NULL, ISO datetime | Chỉ record nháp không phát sinh; Owner | Soft archive, không hard-delete |

Khóa tự nhiên nhập Excel: ưu tiên `employee_number`; nếu thiếu mã thì đối chiếu `mobile`. Trùng SĐT khi tạo tay là cảnh báo vàng có link mở record, Owner có thể xác nhận nếu thực sự dùng chung số.

### 4.2 Employee Legal & Payment Profile — hồ sơ pháp lý/thanh toán

Map vào các field permlevel cao của Employee hoặc DocType phụ; quyết định vật lý ở PHA 3.

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `id` | TEXT | PK | Server UUID | ID phiên bản hồ sơ |
| `tenant_id` | TEXT | NOT NULL, indexed | Session tenant | RLS |
| `employee_id` | TEXT | FK Employee, NOT NULL; UNIQUE `(tenant_id, employee_id, effective_from)` | Cùng tenant | Một nhân viên có nhiều phiên bản không chồng hiệu lực |
| `tax_code` | TEXT | NULL, indexed | 10 hoặc 13 số | MST cá nhân |
| `social_insurance_number` | TEXT | NULL, indexed | 10 số nếu nhập | Mã BHXH |
| `insurance_status` | TEXT | NOT NULL | Enum `NOT_REQUIRED, REQUIRED, ACTIVE, PAUSED` | Trạng thái tham gia bảo hiểm |
| `insurance_salary_vnd` | INTEGER | NOT NULL DEFAULT 0 | Số nguyên ≥0; kiểm tra ngưỡng/rule hiệu lực | Mức làm căn cứ bảo hiểm |
| `pit_status` | TEXT | NOT NULL | Enum `NOT_REQUIRED, WITHHOLD, FINALIZE_ELSEWHERE` | Cách xử lý PIT |
| `tax_residency` | TEXT | NOT NULL | Enum theo rule pháp lý | Cư trú/không cư trú |
| `payment_method` | TEXT | NOT NULL | Enum `CASH, BANK` | Mặc định tiền mặt |
| `bank_name` | TEXT | NULL | Bắt buộc khi BANK; 2–120 ký tự | Chỉ Owner/Payroll/Accountant được xem |
| `bank_account_no` | TEXT | NULL | Bắt buộc khi BANK; 6–30 chữ số/ký tự cho phép | Không trả trong API danh sách thường |
| `account_holder_name` | TEXT | NULL | Mặc định từ tên NV, cho sửa | Chủ tài khoản |
| `effective_from` | TEXT | NOT NULL, ISO date | Không chồng phiên bản | Ngày hiệu lực |
| `effective_to` | TEXT | NULL, ISO date | ≥ effective_from | Kết thúc hiệu lực |
| `legal_basis_note` | TEXT | NULL | Tối đa 500 ký tự | Bắt buộc khi chọn NOT_REQUIRED/FINALIZE_ELSEWHERE |

### 4.3 Payroll Dependent — người phụ thuộc PIT

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `id` | TEXT | PK | Server UUID | ID nội bộ |
| `tenant_id` | TEXT | NOT NULL, indexed | Session tenant | RLS |
| `employee_id` | TEXT | FK Employee, NOT NULL | Cùng tenant | Nhân viên khai giảm trừ |
| `full_name` | TEXT | NOT NULL | 2–120 ký tự | Họ tên người phụ thuộc |
| `relationship` | TEXT | NOT NULL | Enum cấu hình pháp lý | Quan hệ |
| `registration_code` | TEXT | NULL | Theo chứng từ đăng ký | Mã đăng ký nếu có |
| `effective_from` | TEXT | NOT NULL | ISO date | Bắt đầu tính giảm trừ |
| `effective_to` | TEXT | NULL | ≥ effective_from | Kết thúc |
| `status` | TEXT | NOT NULL | `DRAFT, VERIFIED, ENDED` | Chỉ VERIFIED được tính |

Không yêu cầu nhập người phụ thuộc lúc tạo nhân viên. Mục này chỉ xuất hiện khi `pit_status = WITHHOLD`.

### 4.4 AlumDoor Pay Profile — hồ sơ lương theo phiên bản

Map ưu tiên: `AlumDoor Pay Profile`; loại bỏ `overtime_multiplier_bp` khỏi bề mặt nghiệp vụ.

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `name` | TEXT | PK | Server cấp | ID hồ sơ |
| `tenant_id` | TEXT | NOT NULL | Session tenant | RLS |
| `profile_code` | TEXT | UNIQUE tenant | Atomic counter | Mã tự sinh |
| `employee_id` | TEXT | FK Employee, NOT NULL | ACTIVE/PAUSED, cùng tenant | Nhân viên |
| `pay_mode` | TEXT | NOT NULL | `MONTHLY` hoặc `DAILY` | `Lương tháng` / `Lương ngày` |
| `base_salary_vnd` | INTEGER | NOT NULL | Số nguyên >0, ≤999.999.999.999 | Mức lương/tháng hoặc ngày |
| `fixed_allowance_vnd` | INTEGER | NOT NULL DEFAULT 0 | Số nguyên ≥0 | Phụ cấp cố định; nằm trong “Thêm khoản” |
| `effective_from` | TEXT | NOT NULL | ISO date; không chồng profile APPROVED | Mặc định ngày vào làm hoặc ngày đầu tháng |
| `effective_to` | TEXT | NULL | ≥ effective_from | Server tự đóng profile cũ khi profile mới được duyệt |
| `profile_key` | TEXT | UNIQUE | Hash employee + effective range | Chống trùng phiên bản |
| `status` | TEXT | NOT NULL | `DRAFT, APPROVED, RETIRED` | Owner-only có thể lưu+duyệt một thao tác |
| `approved_by` | TEXT | NULL | User có quyền finalize profile | Audit |
| `approved_at` | TEXT | NULL | Server time | Audit |
| `company` | TEXT | NOT NULL | Server từ Employee | Ẩn |
| `branch` | TEXT | NOT NULL | Server từ Employee | Ẩn |

Không lưu `50.000` vào từng hồ sơ nhân viên. Kỳ lương snapshot mức tăng ca từ Payroll Settings để đổi chính sách sau này không làm thay đổi kỳ cũ.

### 4.5 Payroll Settings — cấu hình một lần của doanh nghiệp

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `tenant_id` | TEXT | PK | Session tenant | Một cấu hình/tenant |
| `company_id` | TEXT | NOT NULL, FK | Company hoạt động | Điền từ tenant; chỉ Owner thấy trong cài đặt nâng cao |
| `default_workplace_id` | TEXT | NOT NULL, FK Branch | Cùng company | Nơi làm việc nội bộ, không gọi là chi nhánh trên UI |
| `minimum_wage_region` | TEXT | NOT NULL | `I, II, III, IV` theo rule hiệu lực | `Vùng lương tối thiểu *` |
| `currency` | TEXT | NOT NULL DEFAULT `VND` | Chỉ VND ở bản này | Ẩn |
| `timezone` | TEXT | NOT NULL DEFAULT `Asia/Ho_Chi_Minh` | IANA timezone | Ẩn |
| `standard_minutes_per_day` | INTEGER | NOT NULL DEFAULT 480 | 1–1440 | 8 giờ/ngày; nâng cao |
| `overtime_rate_vnd_per_hour` | INTEGER | NOT NULL DEFAULT 50000 | Khóa ở `50000` theo quyết định hiện tại | Hiện read-only: `50.000đ/giờ` |
| `pay_day_of_month` | INTEGER | NOT NULL DEFAULT 5 | 1–28 | Ngày trả lương mặc định của tháng sau |
| `owner_only_mode` | INTEGER | NOT NULL DEFAULT 1 | Boolean 0/1 | Gộp bước duyệt trên UI |
| `legal_rule_set_id` | TEXT | FK Legal Rule Set, NOT NULL | Rule hiệu lực và đã VERIFIED | Bộ quy tắc pháp lý hiện hành |
| `updated_at` | TEXT | NOT NULL, ISO datetime | Server clock | Thời điểm đổi gần nhất |
| `updated_by` | TEXT | NOT NULL, FK User | Owner session | Người đổi; audit lưu cả before/after |

### 4.6 AlumDoor Attendance Day — nguồn ngày công

Map: DocType hiện có, bổ sung phân loại phục vụ kiểm tra pháp lý.

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `name` | TEXT | PK | Server | ID ngày công |
| `tenant_id` | TEXT | NOT NULL | Session/system tenant | RLS |
| `employee_id` | TEXT | FK Employee, NOT NULL | Cùng tenant | Nhân viên |
| `work_date` | TEXT | NOT NULL | ISO date; UNIQUE employee/date | Ngày công |
| `day_type` | TEXT | NOT NULL | `REGULAR, WEEKLY_REST, PUBLIC_HOLIDAY, PAID_LEAVE` | Phân loại theo lịch nghỉ có phiên bản |
| `regular_minutes` | INTEGER | NOT NULL DEFAULT 0 | 0–1440 | Phút công thường |
| `approved_overtime_minutes` | INTEGER | NOT NULL DEFAULT 0 | 0–1440; chỉ từ segment đủ/đã duyệt | Phút tăng ca được trả 50.000đ/giờ |
| `night_minutes` | INTEGER | NOT NULL DEFAULT 0 | Tập con trong 22:00–06:00 | Đối chiếu phụ trội đêm |
| `overtime_night_minutes` | INTEGER | NOT NULL DEFAULT 0 | ≤ approved OT | Đối chiếu tăng ca ban đêm |
| `payable_work_fraction_bp` | INTEGER | NOT NULL DEFAULT 0 | 0–10000/ngày, có lý do nếu >10000 | Phần ngày công trả lương |
| `state` | TEXT | NOT NULL | `OPEN, COMPLETE, EXCEPTION, APPROVED, LOCKED` | Chỉ APPROVED được đưa vào preview cuối |
| `exception_code` | TEXT | NULL | Enum | Thiếu vào/ra, qua ngày, sửa tay... |
| `locked_by_payroll_id` | TEXT | NULL, FK | Chỉ set khi finalize | Khóa bằng chứng kỳ |
| `calculated_at` | TEXT | NOT NULL | Server time | Truy vết |
| `department` | TEXT | NULL | Không validate required | Giữ tương thích dữ liệu cũ, không render |

### 4.7 Payroll Period — kỳ lương

Map ưu tiên: `Payroll Entry` với các field AlumDoor.

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `name` | TEXT | PK | Server | Mã kỳ |
| `tenant_id` | TEXT | NOT NULL | Session tenant | RLS |
| `period_key` | TEXT | UNIQUE tenant | Regex `YYYY-MM` | Tháng lương |
| `company_id` | TEXT | NOT NULL | Từ settings | Ẩn |
| `workplace_id` | TEXT | NOT NULL | Từ settings | Ẩn |
| `start_date` | TEXT | NOT NULL | Ngày đầu period_key | Tự điền |
| `end_date` | TEXT | NOT NULL | Ngày cuối period_key | Tự điền |
| `pay_date` | TEXT | NOT NULL | Từ pay day setting | Có thể sửa trước khi chốt |
| `standard_work_days_bp` | INTEGER | NOT NULL | Tính từ lịch; 1–310000 | Không hỏi người dùng |
| `overtime_rate_snapshot_vnd` | INTEGER | NOT NULL | Phải bằng settings khi preview | Snapshot 50.000 |
| `legal_rule_set_snapshot_id` | TEXT | NOT NULL | VERIFIED và hiệu lực | Snapshot luật |
| `state` | TEXT | NOT NULL | `DRAFT, READY, FINALIZED, PAID, CANCELLED` | UI: Tính thử, Sẵn sàng, Đã chốt, Đã trả, Đã hủy |
| `employee_count` | INTEGER | NOT NULL DEFAULT 0 | Dẫn xuất | Số NV |
| `gross_total_vnd` | INTEGER | NOT NULL DEFAULT 0 | Dẫn xuất | Tổng thu nhập |
| `deduction_total_vnd` | INTEGER | NOT NULL DEFAULT 0 | Dẫn xuất | Tổng trừ |
| `net_total_vnd` | INTEGER | NOT NULL DEFAULT 0 | Dẫn xuất | Tổng thực nhận |
| `blocking_error_count` | INTEGER | NOT NULL DEFAULT 0 | Dẫn xuất | Không được finalize nếu >0 |
| `snapshot_hash` | TEXT | NULL | SHA-256 canonical payload | Bắt buộc khi FINALIZED |
| `prepared_by` | TEXT | NULL, FK User | Actor tính thử gần nhất | Người chuẩn bị |
| `prepared_at` | TEXT | NULL, ISO datetime | Server clock | Lúc chuẩn bị |
| `finalized_by` | TEXT | NULL, FK User | Role Owner/Approver | Người chốt |
| `finalized_at` | TEXT | NULL, ISO datetime | Server clock | Lúc chốt |
| `paid_by` | TEXT | NULL, FK User | Role Owner/Accountant | Người xác nhận trả |
| `paid_at` | TEXT | NULL, ISO datetime | Server clock | Lúc xác nhận trả |
| `payment_reference` | TEXT | NULL | ≤120 ký tự | Mã UNC/ghi chú tiền mặt |
| `cancel_reason` | TEXT | NULL | 10–500 ký tự khi CANCELLED | Không xóa kỳ |

### 4.8 Salary Slip — phiếu lương

Map: `Salary Slip` hiện có; không tạo bảng tổng hợp thay thế.

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `name` | TEXT | PK | Server | Số phiếu tự sinh |
| `tenant_id` | TEXT | NOT NULL | Period tenant | RLS |
| `payroll_period_id` | TEXT | FK, NOT NULL | UNIQUE period/employee | Kỳ lương |
| `employee_id` | TEXT | FK, NOT NULL | Nhân viên thuộc kỳ | Nhân viên |
| `pay_profile_snapshot_id` | TEXT | NOT NULL | Profile APPROVED hiệu lực | Truy vết mức lương |
| `pay_mode` | TEXT | NOT NULL | MONTHLY/DAILY snapshot | Cách trả |
| `base_salary_snapshot_vnd` | INTEGER | NOT NULL | >0 | Mức lương snapshot |
| `payable_work_fraction_bp` | INTEGER | NOT NULL | Tổng ngày công | Số công thực tế |
| `standard_work_days_bp` | INTEGER | NOT NULL | Từ period | Số công chuẩn |
| `regular_minutes` | INTEGER | NOT NULL | ≥0 | Phút công thường |
| `overtime_minutes` | INTEGER | NOT NULL | ≥0 | Phút tăng ca duyệt |
| `overtime_rate_vnd_per_hour` | INTEGER | NOT NULL | `50000` | Hiện rõ trên phiếu |
| `overtime_pay_vnd` | INTEGER | NOT NULL | `round(minutes×50000/60)` | Tiền tăng ca |
| `legal_overtime_floor_vnd` | INTEGER | NOT NULL | Rule engine theo buckets | Chỉ dùng validation/trace |
| `base_pay_vnd` | INTEGER | NOT NULL | Công thức pay mode | Lương theo công |
| `fixed_allowance_vnd` | INTEGER | NOT NULL DEFAULT 0 | Snapshot profile | Phụ cấp |
| `gross_pay_vnd` | INTEGER | NOT NULL | base+OT+earnings | Tổng thu nhập |
| `insurance_employee_vnd` | INTEGER | NOT NULL DEFAULT 0 | Rule hiệu lực | Khấu trừ bảo hiểm NLĐ |
| `pit_vnd` | INTEGER | NOT NULL DEFAULT 0 | Rule hiệu lực | Thuế TNCN |
| `advance_vnd` | INTEGER | NOT NULL DEFAULT 0 | Tổng adjustment ADVANCE | Tạm ứng |
| `damage_deduction_vnd` | INTEGER | NOT NULL DEFAULT 0 | Có evidence; kiểm tra cap | Bồi thường/khấu trừ hợp lệ |
| `other_legal_deduction_vnd` | INTEGER | NOT NULL DEFAULT 0 | Có rule code + evidence | Không có ô “khấu trừ khác” tự do |
| `total_deduction_vnd` | INTEGER | NOT NULL | Tổng deductions | Tổng trừ |
| `net_pay_vnd` | INTEGER | NOT NULL | ≥0 | Thực nhận |
| `formula_trace_json` | TEXT | NOT NULL | JSON schema versioned | Công thức từng dòng |
| `rule_trace_json` | TEXT | NOT NULL | Rule IDs/effective dates | Truy vết pháp lý |
| `source_hash` | TEXT | NOT NULL | Hash attendance+profile+adjustments | Phát hiện thay đầu vào |
| `state` | TEXT | NOT NULL | `DRAFT, FINALIZED, PAID, CANCELLED` | Theo kỳ |
| `paid_at` | TEXT | NULL, ISO datetime | Chỉ set khi PAID | Thời điểm trả |
| `payment_reference` | TEXT | NULL | Tối đa 120 ký tự; cùng payment event của period | Mã tham chiếu trả lương |

### 4.9 Payroll Adjustment — khoản cộng/trừ có nguồn

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa/UI |
|---|---|---|---|---|
| `id` | TEXT | PK | Server | ID khoản |
| `tenant_id` | TEXT | NOT NULL | Session tenant | RLS |
| `period_id` | TEXT | FK, NOT NULL | Period DRAFT/READY | Kỳ áp dụng |
| `employee_id` | TEXT | FK, NOT NULL | Thuộc kỳ | Nhân viên |
| `type` | TEXT | NOT NULL | `ALLOWANCE, BONUS, ADVANCE, DAMAGE_COMPENSATION, OTHER_LEGAL` | Không có MANUAL_DEDUCTION tự do |
| `direction` | TEXT | NOT NULL | `EARNING, DEDUCTION` suy từ type | Không cho client tự đổi |
| `amount_vnd` | INTEGER | NOT NULL | >0 | Số tiền |
| `reason` | TEXT | NOT NULL | 10–500 ký tự | Lý do hiển thị trên phiếu |
| `evidence_file_id` | TEXT | NULL FK files | Bắt buộc cho DAMAGE/OTHER_LEGAL | Căn cứ |
| `legal_rule_code` | TEXT | NULL | Bắt buộc cho OTHER_LEGAL | Rule đã VERIFIED |
| `status` | TEXT | NOT NULL | `DRAFT, APPROVED, REJECTED, LOCKED` | Owner-only lưu là APPROVED sau confirm |
| `approved_by` | TEXT | NULL, FK User | Quyền Owner/Approver | Người duyệt |
| `approved_at` | TEXT | NULL, ISO datetime | Server clock khi APPROVED | Lúc duyệt |
| `created_by` | TEXT | NOT NULL, FK User | Actor session | Người tạo |
| `created_at` | TEXT | NOT NULL, ISO datetime | Server clock | Lúc tạo |

### 4.10 Legal Rule Set — bộ quy tắc theo ngày hiệu lực

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa |
|---|---|---|---|---|
| `id` | TEXT | PK | Server UUID/version ID | ID bộ rule |
| `document_no` | TEXT | NOT NULL, indexed | Số văn bản/nguồn chính thức | Căn cứ |
| `effective_from` | TEXT | NOT NULL, ISO date | Không chồng cùng phạm vi nếu VERIFIED | Bắt đầu hiệu lực |
| `effective_to` | TEXT | NULL, ISO date | ≥ effective_from | Kết thúc hiệu lực |
| `taxpayer_segment` | TEXT | NOT NULL | Enum phạm vi doanh nghiệp/NLĐ | Chọn đúng đối tượng |
| `location_scope` | TEXT | NOT NULL | `NATIONAL` hoặc mã vùng/địa bàn | Lương tối thiểu vùng |
| `schema_version` | INTEGER | NOT NULL | Số nguyên dương | Version payload |
| `payload_json` | TEXT | NOT NULL | JSON schema validate; không nhận code thực thi | Tỷ lệ, ngưỡng và công thức khai báo |
| `checksum` | TEXT | NOT NULL, UNIQUE | SHA-256 canonical payload | Chống sửa âm thầm |
| `status` | TEXT | NOT NULL | `DRAFT, VERIFIED, RETIRED` | Chỉ VERIFIED được tính |
| `verified_by` | TEXT | NULL, FK User | Người có thẩm quyền cấu hình | Người xác nhận |
| `verified_at` | TEXT | NULL, ISO datetime | Bắt buộc khi VERIFIED | Lúc xác nhận |
| `supersedes_rule_id` | TEXT | NULL, FK self | Không tự tham chiếu | Rule bị thay thế |

### 4.11 Audit Log — nhật ký bất biến

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa |
|---|---|---|---|---|
| `id` | TEXT | PK | Server UUID | ID log |
| `tenant_id` | TEXT | NOT NULL, indexed | Context tenant | RLS |
| `actor_id` | TEXT | NOT NULL | Session/service identity | Ai thực hiện |
| `action` | TEXT | NOT NULL, indexed | Enum allowlist | Xem/xuất/tạo/sửa/chốt/trả/hủy |
| `entity_type` | TEXT | NOT NULL, indexed | Entity allowlist | Loại record |
| `entity_id` | TEXT | NOT NULL, indexed | Record tồn tại hoặc tombstone | Record bị tác động |
| `before_json` | TEXT | NULL | JSON canonical; lọc secret/token | Giá trị trước |
| `after_json` | TEXT | NULL | JSON canonical; lọc secret/token | Giá trị sau |
| `reason` | TEXT | NULL | Bắt buộc cho hủy/override | Lý do nghiệp vụ |
| `occurred_at` | TEXT | NOT NULL, ISO datetime | Server clock | Thời điểm |
| `correlation_id` | TEXT | NOT NULL, indexed | Theo request/transaction | Tra cứu xuyên luồng |

Audit Log là append-only; không có API UPDATE/DELETE sản phẩm.

### 4.12 File Metadata — bằng chứng và bản in

| Trường | Kiểu | Khóa/ràng buộc | Validate server | Ý nghĩa |
|---|---|---|---|---|
| `id` | TEXT | PK | Server UUID | ID file |
| `tenant_id` | TEXT | NOT NULL, indexed | Session tenant | RLS |
| `object_key` | TEXT | NOT NULL, UNIQUE | Key R2 do server cấp | Vị trí blob |
| `original_name` | TEXT | NOT NULL | Bỏ path/control chars | Tên tải lên |
| `mime_type` | TEXT | NOT NULL | Allowlist theo use case | Loại file |
| `size_bytes` | INTEGER | NOT NULL | >0; ≤ giới hạn use case | Kích thước |
| `classification` | TEXT | NOT NULL | `HR_CONFIDENTIAL, PAYROLL_PDF, AVATAR` | Chính sách truy cập/lưu giữ |
| `checksum` | TEXT | NOT NULL | SHA-256 blob | Toàn vẹn |
| `created_by` | TEXT | NOT NULL, FK User/service | Context actor | Người tạo |
| `created_at` | TEXT | NOT NULL, ISO datetime | Server clock | Lúc tạo |

Download dùng URL ký ngắn hạn sau khi server kiểm permission; không lưu public URL lâu dài.

`need_legal_check=true` cho bộ tỷ lệ/rule 2026 cho đến khi kế toán/pháp lý xác nhận chính thức trước production. BRD chốt kiến trúc phiên bản, không tự tuyên bố số thuế/bảo hiểm cuối cùng.

---

## 5. Luồng nghiệp vụ

### 5.1 Thiết lập lần đầu

1. Owner mở `Cài đặt → Nhân viên & Lương`.
2. Hệ thống tự chọn company/workplace duy nhất nếu tenant chỉ có một.
3. Owner xác nhận `Vùng lương tối thiểu`, `Ngày trả lương` và chế độ Owner-only.
4. Dòng tăng ca hiển thị read-only: `50.000đ/giờ — chính sách doanh nghiệp`.
5. Hệ thống kiểm tra legal rule set hiệu lực; nếu chưa VERIFIED, cho lưu cấu hình nhưng chặn chốt kỳ.

### 5.2 Tạo nhân viên

1. Từ desktop bấm `Thêm nhân viên`; mobile bấm FAB `+` → `Nhân viên`.
2. Form chỉ hiện ba trường bắt buộc.
3. Server normalize tên/SĐT, check trùng, cấp mã atomically, gán company/workplace/status.
4. Lưu thành công mở panel `Bước tiếp theo`: `Thiết lập lương` (chính), `Mời dùng app`, `Đóng`.
5. Không tạo Department/Designation/Employment Type/Cost Center từ form này.

Ngoại lệ:

- SĐT trùng: cảnh báo record trùng; Owner chọn mở record hoặc xác nhận dùng chung số.
- Workplace settings thiếu: chặn lưu với lời nhắc mở đúng mục Cài đặt.
- Mất mạng: giữ draft cục bộ, không auto retry tạo trùng.

### 5.3 Thiết lập hoặc đổi mức lương

1. Chọn `Lương tháng` hoặc `Lương ngày`.
2. Nhập mức lương và ngày áp dụng; phụ cấp nằm trong `Thêm khoản`.
3. Server kiểm tra không chồng profile hiệu lực và kiểm tra tối thiểu vùng.
4. Owner-only: bấm `Lưu mức lương` và confirm; profile APPROVED ngay, audit đủ.
5. Đổi lương tạo profile mới và tự đóng profile cũ; không sửa ngược profile đã dùng trong kỳ chốt.

### 5.4 Hoàn thiện hồ sơ pháp lý/thanh toán

- Nếu trả tiền mặt và chưa thuộc diện PIT/BHXH cần khai, không hiện bank/dependent.
- Chọn BANK mới mở ba trường ngân hàng.
- Chọn PIT WITHHOLD mới mở MST/người phụ thuộc.
- Chọn bảo hiểm REQUIRED/ACTIVE mới mở số BHXH và mức lương bảo hiểm.
- Thiếu dữ liệu không chặn tạo nhân viên; chỉ trở thành blocker khi một kỳ thực sự cần rule đó.

### 5.5 Chuẩn bị chấm công cho lương

1. Check-in/segment là bằng chứng nguồn bất biến.
2. Hệ thống tổng hợp `Attendance Day`, phân loại ngày và phút đêm.
3. Ngày thiếu cặp vào/ra thành `EXCEPTION`, không tự ước lượng trả lương.
4. Người chấm công sửa qua phiếu điều chỉnh có lý do/evidence; sau duyệt, ngày thành `APPROVED`.
5. Department không tham gia resolve Employee hoặc Attendance Day.

### 5.6 Tính thử kỳ lương

1. Mở `Tính lương`; mặc định tháng hiện tại.
2. Server tạo/tải Payroll Period theo `YYYY-MM`, tự xác định ngày đầu/cuối, ngày công chuẩn và ngày trả.
3. Tự lấy nhân viên ACTIVE/PAUSED có giao cắt ngày làm việc với kỳ.
4. Chạy preflight trước khi tính:
   - Thiếu/chéo hồ sơ lương.
   - Attendance EXCEPTION/OPEN.
   - Thiếu legal profile bắt buộc.
   - Base salary dưới sàn vùng.
   - 50.000đ/giờ dưới sàn tăng ca của bất kỳ bucket.
   - Adjustment thiếu lý do/evidence/quyền duyệt.
   - Period chồng hoặc đầu vào đang bị kỳ khác khóa.
5. Tạo/cập nhật Salary Slip DRAFT idempotently theo period+employee.
6. UI hiển thị tổng và nhóm ngoại lệ; người dùng không cần xem công thức nếu không mở chi tiết.

### 5.7 Công thức tính

Cho mỗi nhân viên:

- Lương ngày: `base_pay = daily_rate × payable_work_fraction`.
- Lương tháng: `base_pay = monthly_salary × payable_work_fraction / standard_work_days`.
- Tăng ca: `overtime_pay = round_half_up(approved_overtime_minutes × 50.000 / 60)`.
- Tổng thu nhập: `base_pay + overtime_pay + fixed_allowance + approved_earnings`.
- Tổng trừ: `insurance + PIT + advance + approved_legal_deductions`.
- Thực nhận: `gross_pay - total_deduction`, phải `≥ 0`.

Ví dụ hợp lệ:

- NV A lương tháng, kỳ có 26 công chuẩn, làm 25 công, tăng ca 90 phút, phụ cấp 300.000đ.
- `base_pay = round(lương_tháng × 25/26)`.
- `overtime_pay = 90 × 50.000 / 60 = 75.000đ`.
- Formula trace lưu từng tử số/mẫu số và kết quả làm tròn.

Ví dụ bị chặn:

- Một bucket ngày lễ có mức tối thiểu rule engine tính ra lớn hơn 50.000đ/giờ.
- Kỳ hiển thị: `NV A — 2 giờ ngày 02/09: mức 50.000đ/giờ thấp hơn mức tối thiểu áp dụng`; Owner phải đổi chính sách/căn cứ trước khi chốt.

### 5.8 Khoản cộng/trừ

- `Tạm ứng` phải tham chiếu chứng từ tạm ứng hoặc Adjustment đã duyệt.
- `Bồi thường` bắt buộc lý do, evidence và kiểm tra giới hạn khấu trừ áp dụng.
- `Khác theo quy định` bắt buộc legal rule code; không nhận text tự do làm căn cứ.
- Bonus/allowance hiển thị bên thu nhập.
- Sau khi kỳ FINALIZED, adjustment bị LOCKED; sửa bằng adjustment kỳ sau hoặc hủy/amend kỳ có lý do.

### 5.9 Chốt lương

1. Owner bấm `Chốt lương`.
2. Dialog hiển thị tháng, số nhân viên, tổng thực nhận và cam kết khóa dữ liệu.
3. Server chạy lại toàn bộ preflight trong cùng transaction; không tin preview client.
4. Tạo snapshot/hash, submit Salary Slips, khóa Attendance Days và chuyển period FINALIZED.
5. Nếu một đầu vào thay đổi giữa preview và chốt, trả `409`, giữ màn và yêu cầu `Tính lại`.
6. Không có API “sửa nhanh số thực nhận” sau chốt.

### 5.10 Trả lương

1. Period FINALIZED mở action `Đánh dấu đã trả`.
2. Tiền mặt: nhập ngày trả và ghi chú tùy chọn.
3. Ngân hàng: xuất danh sách chuyển gồm người nhận, bank, account, amount; sau chuyển nhập mã tham chiếu.
4. Accountant/Owner xác nhận; period và slips chuyển PAID, audit từng người.
5. Tích hợp bank trực tiếp nằm ngoài bản này; không tự coi webhook tiền ra là thành công nếu chưa đối soát.

### 5.11 Phiếu lương nhân viên

- Phiếu thể hiện kỳ, ngày công, mức/cách lương, tăng ca `số giờ × 50.000đ`, phụ cấp, từng khoản trừ, thực nhận và trạng thái trả.
- Nhân viên chỉ xem phiếu của mình sau FINALIZED.
- Gửi thông báo in-app; nếu bật Zalo/email chỉ gửi câu “Phiếu lương tháng MM/YYYY đã sẵn sàng” và link yêu cầu đăng nhập, không gửi số tiền trong tin.
- PDF/A5 có QR trỏ tới route cần đăng nhập; QR không chứa số lương/token dài hạn.

### 5.12 Nghỉ việc

1. Owner chọn `Cho nghỉ việc`, nhập ngày và lý do.
2. Hệ thống kiểm tra kỳ lương cuối chưa xử lý.
3. Employee chuyển LEFT; không xóa profile/slip/attendance.
4. Các kỳ sau không tự đưa vào, nhưng kỳ giao cắt ngày nghỉ vẫn tính đến relieving date.

### 5.13 Import/export và báo cáo

- Nhân viên: import wizard 5 bước; template chỉ bắt buộc tên, SĐT, ngày bắt đầu. Company/workplace/code/status do server điền.
- Payroll không cho import “thực nhận” để ghi đè tính toán.
- Export bảng lương theo filter; dữ liệu bank chỉ có trong export chuyển khoản riêng và audit.
- Báo cáo tối thiểu: tổng lương theo tháng, giờ/tiền tăng ca, khoản cộng/trừ, kỳ chưa trả, so sánh tháng trước.

### 5.14 AI hỗ trợ thật, không tự ghi dữ liệu

Entry point là ô `Hỏi AI` phụ trên toolbar, không chen vào luồng chính. AI chỉ gọi tool read-only dưới session hiện tại.

Câu hỏi HR mẫu:

1. “Ai chưa thiết lập lương?”
2. “Tháng này có bao nhiêu nhân viên mới?”
3. “Tìm nhân viên số điện thoại 4 số cuối 6789.”
4. “Ai đang tạm nghỉ?”
5. “Ai chưa liên kết tài khoản dùng app?”

Câu hỏi Payroll mẫu:

1. “Tổng lương dự kiến tháng này là bao nhiêu?”
2. “Ai còn lỗi chấm công nên chưa chốt được?”
3. “Tổng số giờ tăng ca tháng này?”
4. “Tổng thực nhận tăng giảm thế nào so với tháng trước?”
5. “Kỳ nào đã chốt nhưng chưa trả?”

AI không được thấy salary/bank nếu role hỏi không có quyền; không được chốt kỳ, sửa profile hoặc gửi phiếu.

---

## 6. API và ma trận quyền server

### 6.1 Quy tắc chung

- Mọi route xác thực session, derive `tenant_id` từ session; không nhận tenant từ payload làm nguồn thẩm quyền.
- Mọi read/write thêm scope tenant ở server.
- Employee self-scope resolve bằng `Employee.user_id = session.user_id`.
- Trường salary/bank/legal dùng projection riêng; endpoint danh sách nhân viên không select/trả các trường đó.
- Mutation nhạy cảm ghi audit trong cùng transaction.
- Endpoint tạo/tính/chốt có idempotency key và optimistic version/hash.
- Không có DELETE cho payroll period, salary slip, adjustment đã duyệt, attendance đã khóa hoặc employee có lịch sử.

### 6.2 Endpoint hẹp và quyền

Ký hiệu: `O` Owner, `P` Payroll User, `T` Attendance Manager, `A` Accountant, `E` Employee self, `S` System role.

| Method + endpoint | O | P | T | A | E | Kiểm tra server/RLS |
|---|:---:|:---:|:---:|:---:|:---:|---|
| `GET /api/alumdoor/hr-lite/employees` | ✓ | ✓ | ✓ | — | — | tenant; projection theo role; không salary/bank |
| `POST /api/alumdoor/hr-lite/employees` | ✓ | — | — | — | — | tenant settings đủ; normalize; atomic employee code |
| `GET /api/alumdoor/hr-lite/employees/:id` | ✓ | ✓ | ✓ | — | self | tenant + self; field projection |
| `PUT /api/alumdoor/hr-lite/employees/:id` | ✓ | — | — | — | self-basic | employee tenant; self không đổi status/company/legal |
| `POST /api/alumdoor/hr-lite/employees/:id/end-employment` | ✓ | — | — | — | — | kỳ cuối; reason; audit |
| `POST /api/alumdoor/hr-lite/employees/:id/invite` | ✓ | — | — | — | — | user cùng tenant; idempotent |
| `GET /api/alumdoor/hr-lite/employees/:id/legal-profile` | ✓ | ✓ | — | ✓ | self | salary-sensitive scope |
| `PUT /api/alumdoor/hr-lite/employees/:id/legal-profile` | ✓ | ✓ | — | limited | self-basic | Accountant chỉ payment fields; self đề xuất, Owner duyệt dữ liệu pháp lý |
| `GET /api/alumdoor/hr-lite/employees/:id/pay-profile` | ✓ | ✓ | — | read-final | self-current | Chỉ profile hiệu lực; self không thấy audit nội bộ |
| `PUT /api/alumdoor/hr-lite/employees/:id/pay-profile` | ✓ | ✓ | — | — | — | period overlap + legal minimum; P tạo DRAFT |
| `POST /api/alumdoor/hr-lite/pay-profiles/:id/approve` | ✓ | — | — | — | — | state transition + audit |
| `GET /api/alumdoor/payroll-lite/settings` | ✓ | ✓ | — | read | — | tenant; P/A không thấy field ngoài nhiệm vụ |
| `PUT /api/alumdoor/payroll-lite/settings` | ✓ | — | — | — | — | validate rule set; audit before/after |
| `GET /api/alumdoor/payroll-lite/periods` | ✓ | ✓ | — | ✓ | — | tenant; filters month/state |
| `POST /api/alumdoor/payroll-lite/periods/preview` | ✓ | ✓ | — | — | — | idempotent period key; preflight; no lock |
| `GET /api/alumdoor/payroll-lite/periods/:id` | ✓ | ✓ | — | ✓ | — | tenant; projection by role |
| `POST /api/alumdoor/payroll-lite/periods/:id/recalculate` | ✓ | ✓ | — | — | — | only DRAFT/READY; optimistic hash |
| `GET /api/alumdoor/payroll-lite/periods/:id/blockers` | ✓ | ✓ | T-limited | A-limited | — | T chỉ attendance blocker; không salary amount |
| `POST /api/alumdoor/payroll-lite/periods/:id/finalize` | ✓ | — | — | — | — | preflight again; transaction; lock; audit |
| `POST /api/alumdoor/payroll-lite/periods/:id/cancel` | ✓ | — | — | — | — | reason; state rules; immutable log |
| `POST /api/alumdoor/payroll-lite/periods/:id/mark-paid` | ✓ | — | — | ✓ | — | FINALIZED only; payment ref; audit |
| `GET /api/alumdoor/payroll-lite/periods/:id/slips` | ✓ | ✓ | — | ✓ | — | tenant; no bank in generic response |
| `GET /api/alumdoor/payroll-lite/slips/:id` | ✓ | ✓ | — | ✓ | self | tenant + self; FINALIZED required for E |
| `GET /api/alumdoor/payroll-lite/slips/:id/pdf` | ✓ | ✓ | — | ✓ | self | short-lived download; audit |
| `POST /api/alumdoor/payroll-lite/periods/:id/adjustments` | ✓ | ✓ | — | — | — | only DRAFT/READY; type/evidence; P creates DRAFT |
| `POST /api/alumdoor/payroll-lite/adjustments/:id/approve` | ✓ | — | — | — | — | state transition + audit |
| `GET /api/alumdoor/payroll-lite/periods/:id/export` | ✓ | ✓ | — | ✓ | — | role columns; audit export/filter/count |
| `GET /api/alumdoor/payroll-lite/periods/:id/bank-transfer` | ✓ | — | — | ✓ | — | FINALIZED; bank fields; audit |
| `POST /api/alumdoor/attendance-lite/days/:id/approve` | ✓ | — | ✓ | — | — | tenant, not locked, reason if corrected |
| `POST /api/alumdoor/ai/query` | ✓ | ✓ | T-scope | A-scope | self-scope | Tool allowlist; inherit exact role/RLS; read-only |
| `POST /internal/alumdoor/payroll/rebuild-attendance-day` | — | — | — | — | — | S only; signed internal request; idempotent |

### 6.3 Field-level permission

| Nhóm trường | Owner | Payroll | Attendance | Accountant | Employee self |
|---|---|---|---|---|---|
| Tên, mã, trạng thái, SĐT công việc | RW | R | R | R tối thiểu | R own |
| Lương/profile/formula | RW/finalize | RW draft | Không | R finalized | R own finalized |
| Bank | RW | RW | Không | R/W payment | R own |
| PIT/BHXH/dependent | RW | RW | Không | R phục vụ payroll | R own/propose |
| Attendance details | R | R payroll summary | RW/approve | R summary | R own |
| Audit salary | R | R own actions | Không | R payment actions | Không |

Không hiển thị `••••••` thay cho dữ liệu không có quyền. API không trả field và UI không render row/label đó.

---

## 7. Thông số màn hình MVP

### 7.1 Điều hướng

Desktop sidebar nhóm `Nhân viên & Lương`:

- Nhân viên
- Chấm công
- Tính lương
- Phiếu lương của tôi — chỉ Employee

Không có menu Phòng ban, Chức danh, Chi nhánh, Cấu trúc lương hoặc Payroll Entry kỹ thuật.

Mobile BottomNav dùng shell chung:

- Trái: `Tổng quan`
- FAB giữa: `+`
- Phải: `Danh sách`, `Cài đặt` nếu có quyền
- Sheet `Danh sách`: Nhân viên, Chấm công, Tính lương, Phiếu lương của tôi theo role
- FAB sheet: Thêm nhân viên, Tạo khoản cộng/trừ; chỉ hiện action có quyền

### 7.2 Màn Nhân viên

Desktop:

- Header: `Nhân viên`, subtitle số đang làm; action `Thêm nhân viên`.
- Toolbar: tìm không dấu theo tên/mã/SĐT/4 số cuối; filter trạng thái; `Hỏi AI`; menu Excel.
- Bảng full width khi chưa chọn; cột khung: checkbox, STT, avatar; cột nghiệp vụ: Nhân viên, Điện thoại, Ngày bắt đầu, Tình trạng lương, Trạng thái; action.
- Chọn row mở layout 3 cột: trái danh sách gọn; giữa detail tabs `Thông tin · Chấm công · Lương`; phải là bước tiếp theo/audit/AI.
- FormDrawer tạo mới rộng 680px nhưng body chỉ có ba field; footer `Hủy · Lưu & thiết lập lương`.

Mobile:

- Search full width + chips `Đang làm`, `Thiếu lương`, `Nghỉ việc`.
- Card: avatar, tên, mã, badge; dòng phụ SĐT bấm gọi/Zalo; meta ngày bắt đầu và tình trạng lương.
- Primary action `Xem`; menu ⋯ cho sửa/thiết lập lương/nghỉ việc.
- Vuốt trái lộ `Gọi · Zalo`; vuốt phải lộ `Sửa`, chỉ lộ nút, không thực thi ngay.
- Tạo/sửa là full-screen; nút Lưu ở footer vùng ngón cái.

Form tạo nhân viên:

| Field | Bắt buộc | Control | Validate/lỗi tiếng Việt | Autofill |
|---|:---:|---|---|---|
| Họ và tên | ✓ | Input | “Nhập họ và tên từ 2 đến 120 ký tự” | Normalize viết hoa/gộp khoảng trắng |
| Số điện thoại | ✓ | Tel input | “SĐT phải 10 số, bắt đầu 03/05/07/08/09” | Normalize +84/khoảng trắng |
| Ngày bắt đầu | ✓ | Date picker | “Ngày bắt đầu chưa hợp lệ” | Hôm nay |
| Mã/Công ty/Nơi làm/Trạng thái | Ẩn | — | Server validate | Mã counter; tenant settings; ACTIVE |

Sau lưu: `Thiết lập lương` là action chính; `Mời dùng app` và `Đóng` là action phụ.

### 7.3 Màn hồ sơ lương nhân viên

Desktop: nằm trong tab `Lương` của detail, không là danh mục riêng. Profile hiện tại dạng summary card; lịch sử mức lương là timeline. `Thay đổi mức lương` mở FormDrawer.

Mobile: màn stack từ detail nhân viên; card lớn hiển thị cách trả, mức lương, hiệu lực; nút `Thay đổi mức lương` ở nửa dưới.

| Field thấy ngay | Bắt buộc | Control | Validate/lỗi | Autofill |
|---|:---:|---|---|---|
| Cách trả lương | ✓ | Segmented `Tháng/Ngày` | Chọn một cách trả | MONTHLY |
| Mức lương | ✓ | Money input VND | “Mức lương phải lớn hơn 0” | Trống |
| Hiệu lực từ | ✓ | Date | Không chồng profile | Ngày vào làm hoặc đầu tháng kế |
| Phụ cấp cố định | — | Money trong accordion `Thêm khoản` | ≥0 | 0 |
| Tăng ca | Read-only | Summary row | — | `50.000đ/giờ` từ settings |

Footer: `Hủy · Lưu mức lương`. Owner-only hiển thị confirm “Mức lương này có hiệu lực từ …”.

### 7.4 Màn Tính lương

Desktop ≥1280px dùng layout ba vùng ngay cả khi chưa chọn nhân viên:

- Trái 300–340px: danh sách kỳ theo tháng, badge trạng thái, search/filter năm.
- Giữa: header tháng + 4 summary `Nhân viên · Tổng công · Tăng ca · Thực nhận`; toolbar `Tính thử/Tính lại`, `Hỏi AI`, Export; bảng kết quả.
- Bảng nghiệp vụ chỉ gồm `Nhân viên · Ngày công · Tăng ca · Cộng/Trừ · Thực nhận · Trạng thái`; checkbox/STT/avatar theo contract.
- Phải 300px: `Việc cần xử lý` theo nhóm; khi chọn nhân viên chuyển sang formula breakdown và action adjustment.
- 1024–1279px: cột phải thành drawer.

Mobile:

- Month picker ở top, summary cards 2×2.
- Nếu có blocker, khối `Cần xử lý (N)` nằm trước danh sách.
- Salary cards: tên/badge; ngày công và giờ OT; dòng thực nhận lớn; primary `Xem chi tiết`.
- Không checkbox/bulk mặc định vì thao tác tài chính hiếm trên mobile; export nằm trong menu.
- Bottom action bar chỉ có action hợp lệ: DRAFT `Tính thử`; READY `Chốt lương`; FINALIZED `Đánh dấu đã trả` theo quyền.
- Pull-to-refresh chỉ refetch; không tự recalculate.

Dialog chốt:

- Tiêu đề `Chốt lương tháng MM/YYYY?`
- Hiện số NV, tổng thực nhận, ngày trả.
- Cảnh báo “Sau khi chốt, chấm công và phiếu lương của kỳ sẽ bị khóa.”
- Nút `Quay lại` và `Chốt lương`.

### 7.5 Chi tiết phiếu lương

Desktop: cột giữa/detail route gồm:

1. Header số phiếu, nhân viên, kỳ, badge.
2. Số `Thực nhận` lớn.
3. `Thu nhập`: lương theo công; tăng ca `X giờ × 50.000đ`; phụ cấp/bonus.
4. `Khấu trừ`: bảo hiểm, PIT, tạm ứng, khoản hợp lệ khác kèm lý do.
5. `Cách tính`: mở theo accordion, không chiếm diện tích mặc định.
6. Timeline chốt/trả.
7. Action `Tải PDF/In` và `Quay lại`.

Mobile: cùng thứ tự nhưng thành card một cột; share sheet cho PDF. Không hiển thị internal hash/rule JSON; có link `Xem cách tính` chuyển sang diễn giải tiếng Việt.

Phiếu in A5/A4:

- Đen trắng; thông tin công ty từ Settings; số phiếu và QR auth-only.
- Bảng thu nhập/khấu trừ, tổng thực nhận, ngày trả, người lập.
- Khu ký `Người lập · Người lao động · Chủ doanh nghiệp` tùy cấu hình.
- Không in full bank account; chỉ bốn số cuối nếu cần đối chiếu.

### 7.6 Phiếu lương của tôi

- Chỉ Employee đã liên kết user.
- Danh sách tháng dạng card; kỳ mới nhất ở đầu.
- Card: tháng, thực nhận, trạng thái đã trả/chưa trả, action xem/tải.
- Không có search người khác, export hàng loạt hoặc AI hỏi dữ liệu toàn công ty.
- Empty state hướng dẫn liên hệ Owner nếu chưa có phiếu.

### 7.7 Cài đặt Nhân viên & Lương

Không là form dài. Desktop dùng các card; mobile dùng route con.

Card `Tính lương`:

- Vùng lương tối thiểu.
- Ngày trả lương mặc định.
- Tăng ca `50.000đ/giờ` read-only theo quyết định đã chốt.
- Chế độ `Chủ tự làm lương`.

Card `Pháp lý`:

- Legal rule set đang áp dụng, ngày hiệu lực, trạng thái VERIFIED/NEED CHECK.
- Không cho Owner tự sửa tỷ lệ luật; chỉ chọn version đã xác minh.

Card `Quyền riêng tư`:

- Ai được xem lương; session; 2FA Owner; xuất toàn bộ dữ liệu.

Mọi thay đổi có confirm nếu ảnh hưởng kỳ tương lai và audit before/after.

### 7.8 Báo cáo

Không tạo dashboard BI riêng trong menu. Màn Tính lương có tab `Báo cáo`:

- 4 KPI: tổng gross, tổng thực nhận, tổng giờ OT, số NV.
- So sánh tháng trước và drill-down 100% vào danh sách đã lọc.
- Biểu đồ tối đa hai: tổng lương theo tháng; giờ/tiền tăng ca theo tháng.
- Owner/Payroll/Accountant theo quyền; Employee không thấy.

### 7.9 Trạng thái UI bắt buộc

| Màn | Loading | Chưa có dữ liệu | Lọc không ra | Error | Không quyền | Thành công/đã lưu | Offline |
|---|---|---|---|---|---|---|---|
| Nhân viên | Skeleton row/card | “Chưa có nhân viên” + Thêm | “Không có nhân viên phù hợp” + Xóa lọc | Khối lỗi + Thử lại | Không render list | Toast + bước thiết lập lương | Banner; draft form giữ cục bộ |
| Hồ sơ lương | Skeleton summary | “Chưa thiết lập lương” + action | N/A | Khối lỗi | Không render tab Lương | “Đã lưu mức lương” | Không submit; giữ form |
| Tính lương | Skeleton KPI+rows | “Chưa có kỳ lương” + Tính thử | “Không có kỳ phù hợp” | Khối lỗi có mã tra cứu | Không render amount | Banner trạng thái + toast | Cho xem cache có nhãn cũ; cấm chốt/trả |
| Phiếu lương | Skeleton breakdown | “Chưa có phiếu” | N/A | Khối lỗi | Trang 403 thân thiện | Tải/in thành công | Cho xem bản cache đã mã hóa nếu chính sách cho phép; không tải mới |
| Cài đặt | Skeleton cards | Wizard setup | Search cài đặt không ra | Khối lỗi | Ẩn card | Toast + audit reference | Không lưu |

Mọi submit: disabled/loading, chống bấm hai lần; lỗi field inline; server 409/422 giữ nguyên form; toast không lộ stack hoặc mã kỹ thuật.

### 7.10 Autofill toàn module

| Khi mở/chọn | Field tự điền | Nguồn/rule |
|---|---|---|
| Tạo nhân viên | ngày bắt đầu, status, code, company, workplace | Today; ACTIVE; counter; tenant settings |
| Từ nhân viên → thiết lập lương | employee, effective_from, pay_mode, allowance | Record vừa tạo; joining date; MONTHLY; 0 |
| Chọn tháng | start/end, pay_date, standard days, company/workplace | Calendar + settings |
| Preview kỳ | employee list, attendance, profile, legal rule, OT rate | Server queries theo effective date |
| Tạo adjustment từ slip | employee, period, direction | Context đang chọn + type |
| Đánh dấu đã trả | pay date, bank/cash rows | Settings + Employee Payment Profile |

Autofill không ghi đè field người dùng đã sửa; server luôn tính/validate lại.

### 7.11 AI và điểm nhúng

| Form/bảng chính | Điểm AI |
|---|---|
| Bảng Nhân viên | Hỏi AI để tìm/lọc và cảnh báo profile thiếu |
| Form Nhân viên | Cảnh báo trùng tên/SĐT bằng rule xác định; không cần generative AI |
| Hồ sơ lương | Gợi ý blocker pháp lý/minimum từ rule engine, không tự đổi số |
| Bảng Tính lương | Hỏi AI tổng hợp kỳ và áp filter blocker |
| Chi tiết phiếu | “Giải thích cách tính” từ formula trace bằng template/tool; không bịa số |

Các điểm “AI” có số liệu phải query DB thật, dẫn kỳ/bộ lọc và kiểm quyền. Output chỉ đọc/nháp.

### 7.12 Đối chiếu các hợp đồng bổ trợ

| Hạng mục app-factory | Áp dụng |
|---|---|
| Tài khoản/RLS | Có; mục 3 và 6 |
| Soft delete/bất biến tài chính | Có; không hard-delete employee history/payroll |
| Audit log | Có; mutation + xem/export nhạy cảm |
| Dashboard/report/Excel | Có nhưng đặt trong luồng, không thêm menu rối |
| Shift/notification | Dùng Attendance hiện có; in-app payslip |
| Barcode/inventory | Không áp dụng: module không quản hàng hóa |
| Kanban | Không áp dụng: kỳ lương là chứng từ tài chính tuần tự, dùng state action và khóa; kéo-thả gây rủi ro |
| AI | Có, read-only và secondary |
| Layout 3 cột | Có cho bảng desktop |
| Ảnh/chữ ký/QR | Avatar tùy chọn; phiếu in có khu ký + QR auth-only; không thu CCCD ảnh trong MVP |
| In | Phiếu lương PDF/A5/A4 |
| Zalo/notify | Adapter có thể bật; mặc định chỉ in-app, không gửi số lương ra tin |
| Mã tự động | Employee, profile, period, slip |
| Calendar | Chấm công/ca hiện hữu chịu trách nhiệm; Payroll Lite chỉ chọn tháng |
| Tiện ích VN | SĐT gọi/Zalo, VND, tìm không dấu, export toàn bộ |
| Smart defaults | Có; mục 7.10 |
| Polish | Phím tắt, skeleton, offline banner, 2FA Owner, optimistic lock |

---

## 8. Ngoài phạm vi phiên bản này

- Tuyển dụng, onboarding nhiều bước, đào tạo, đánh giá hiệu suất.
- Cây tổ chức, phòng ban, danh mục chức danh, quản lý nhiều cấp quản lý.
- Nghỉ phép/phép năm đầy đủ; Attendance hiện tại vẫn là nguồn số công.
- Trình tạo công thức lương tùy ý hoặc nhiều cấu trúc lương do người dùng tự kéo-thả.
- Hoa hồng theo đơn/sản phẩm; nếu có sẽ là earning source riêng sau khi có yêu cầu nghiệp vụ.
- Khoản vay nhân viên dài hạn và lịch trả nợ phức tạp.
- Kết nối chuyển khoản trực tiếp với từng ngân hàng; bản này xuất danh sách và ghi reference.
- Tự động nộp tờ khai PIT/BHXH hoặc gửi dữ liệu sang cổng cơ quan nhà nước.
- Tự động ghi sổ GL từ nút UI Lite khi chưa chốt mapping chế độ kế toán; khi tích hợp phải đi qua chứng từ Salary Slip/Payroll Entry chuẩn, không journal tay.
- OCR CCCD/hồ sơ nhân viên để tránh thu thập dữ liệu cá nhân không cần thiết.
- Public link phiếu lương không cần đăng nhập.
- Đổi chính sách tăng ca từ giao diện: đang khóa ở 50.000đ/giờ theo quyết định ngày 13/08/2026.

---

## 9. Ràng buộc đã chốt

| ID | Quyết định | Trạng thái |
|---|---|---|
| DEC-HR-001 | Không có Phòng ban trong giao diện và không bắt buộc ở API Lite | Đã chốt |
| DEC-HR-002 | Form tạo nhân viên chỉ có tên, SĐT, ngày bắt đầu | Đã chốt Cổng 1 |
| DEC-HR-003 | Company/workplace/code/status tự điền server-side | Đã chốt Cổng 1 |
| DEC-PAY-001 | Tăng ca cố định 50.000 VND/giờ cho mọi phút OT được duyệt | Đã chốt 13/08/2026 |
| DEC-PAY-002 | Tiền OT tính theo phút: round-half-up tổng `minutes×50.000/60` | Đã duyệt Cổng 2 |
| DEC-PAY-003 | Nếu 50.000 thấp hơn sàn luật định của bucket, chặn chốt; không tự tăng âm thầm | Bắt buộc an toàn/pháp lý |
| DEC-PAY-004 | Owner-only UI: Tính thử → Chốt lương → Đã trả | Đã chốt Cổng 1 |
| DEC-PAY-005 | Không có ô khấu trừ khác tự do | Đã duyệt Cổng 2 |
| DEC-PAY-006 | Salary Slip/Payroll Entry là chứng từ thẩm quyền | Kế thừa kiến trúc hiện có |
| DEC-SEC-001 | Không có quyền thì API không trả field; không render dấu chấm | Đã chốt Cổng 1 |
| DEC-DATA-001 | Không xóa cứng dữ liệu nhân sự/lương đã phát sinh | Bắt buộc |
| DEC-LEGAL-001 | Rule pháp lý versioned theo ngày hiệu lực; production cần người có thẩm quyền xác nhận | Bắt buộc |

### 9.1 Các giả định cần được duyệt cùng BRD

1. `50.000đ/giờ` áp dụng tỷ lệ theo phút thực tế đã duyệt; không làm tròn mỗi ca thành giờ nguyên.
2. Nếu 50.000đ/giờ thấp hơn mức tối thiểu luật định trong trường hợp cụ thể, hệ thống chặn chốt thay vì vẫn trả đúng 50.000.
3. Doanh nghiệp mặc định có một company và một nơi làm việc; nếu nhiều địa điểm, mỗi nhân viên vẫn được server gắn một workplace để xác định vùng nhưng không có màn quản lý phòng ban.
4. Mặc định chủ doanh nghiệp tự làm và tự chốt lương; vai trò Payroll/Accountant chỉ mở khi cấp tài khoản.
5. Ngày trả lương mặc định là ngày 5 tháng kế tiếp, Owner có thể đổi trong Settings.
6. Tiền lương chỉ dùng VND và một tenant không chạy hai kỳ trùng nhau cho cùng workplace.

---

## 10. Nguồn pháp lý và kiểm tra trước production

- Bộ luật Lao động 45/2019/QH14: bảng kê trả lương, làm thêm giờ, làm đêm và khấu trừ lương: <https://vanban.chinhphu.vn/?classid=1&docid=198540&pageid=27160&typegroupid=3>
- Nghị định 293/2025/NĐ-CP, mức lương tối thiểu áp dụng từ 01/01/2026: <https://xaydungchinhsach.chinhphu.vn/nghi-dinh-so-293-2025-nd-cp-quy-dinh-muc-luong-toi-thieu-doi-voi-nguoi-lao-dong-lam-viec-theo-hop-dong-lao-dong-119251110172808433.htm>
- Luật BHXH 41/2024/QH15 và phạm vi tiền lương làm căn cứ: <https://baohiemxahoi.gov.vn/tintuc/Pages/linh-vuc-bao-hiem-xa-hoi.aspx?CateID=168&ItemID=23352>
- Hướng dẫn quyết toán PIT đối với tiền lương năm 2026: <https://xaydungchinhsach.chinhphu.vn/huong-dan-quyet-toan-thue-thu-nhap-ca-nhan-doi-voi-thu-nhap-tu-tien-luong-tien-cong-119260306092819051.htm>
- Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15, hiệu lực 01/01/2026: <https://vanban.chinhphu.vn/?docid=214590&pageid=27160>

Checklist trước production:

- [ ] Kế toán/pháp lý xác nhận Legal Rule Set cho ngày go-live.
- [ ] Xác nhận vùng lương tối thiểu theo địa điểm thực tế.
- [ ] Chạy test 50.000đ/giờ ở ngày thường, ngày nghỉ, ngày lễ, ban đêm.
- [ ] Chạy test giới hạn khấu trừ và hồ sơ evidence.
- [ ] Chạy test BHXH/PIT theo hồ sơ nhân viên mẫu.
- [ ] Kiểm tra RLS bằng tài khoản Employee, Attendance Manager và API gọi thẳng.
- [ ] In thử phiếu A5/A4 và quét QR bằng tài khoản đúng/sai quyền.

---

## 11. Điều kiện qua Cổng 2

- [x] Có đủ Problem, Goal, Actors, Entities/Fields, Flows, Permission/API, Screens desktop/mobile, Out of Scope, Decided.
- [x] Mỗi form có field/validate/autofill và bước tiếp theo.
- [x] Có state loading/empty/filter/error/permission/success/offline.
- [x] Có quy tắc tăng ca 50.000đ/giờ và ví dụ cụ thể.
- [x] Có permission server/RLS và bất biến tài chính.
- [x] Có desktop/mobile riêng, print, report, import/export và AI read-only.
- [x] Người dùng duyệt Cổng 2 ngày 13/08/2026.
