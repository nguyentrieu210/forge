# Field Ledger — AlumDoor HR & Lương Lite

- Phiên bản: `1.0-approved`
- Ngày: `13/08/2026`
- Trạng thái: Đã duyệt Cổng 3 ngày `13/08/2026`; là hợp đồng field cho PHA 5
- Technical Design: [ALUMDOOR-HR-PAYROLL-LITE-TECHNICAL-DESIGN-20260813.md](./ALUMDOOR-HR-PAYROLL-LITE-TECHNICAL-DESIGN-20260813.md)

## 0. Quy ước

- Mọi tiền là số nguyên VND; Zod dùng `z.number().int().safe()` ở boundary và chuyển `BigInt` trong engine.
- Date là `YYYY-MM-DD`; datetime là ISO UTC; UI đổi sang `Asia/Ho_Chi_Minh`.
- `tenant_id`, actor, company/workplace hidden không nhận từ client làm nguồn thẩm quyền.
- `*` sau tên control nghĩa là bắt buộc trên UI Lite.
- Quyền: O Owner/Approver, P Payroll User, T Attendance Manager, A Accountant, E Employee self, S service role.
- `—` nghĩa là không autofill/control áp dụng, không phải field chưa thiết kế.

### 0.1 Canonical document envelope — áp dụng cho mọi DocType

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| tenant_id | TEXT | PK-part, NOT NULL, indexed | không nhận client | hidden | `TENANT_SCOPE_INVALID` | signed identity | server only | RLS tenant |
| doc_key | TEXT | PK-part, NOT NULL | `z.string().min(3)` internal | hidden | `DOCUMENT_KEY_INVALID` | server `doctype:name` | server only | khóa vật lý |
| doctype | TEXT | NOT NULL, indexed | enum internal | hidden | `DOCTYPE_INVALID` | method/controller | server only | loại chứng từ |
| name | TEXT | UNIQUE `(tenant,doctype,name)` | `z.string().min(1).max(140)` | code-auto/read-only | `DOCUMENT_NAME_INVALID` | naming_series/UUID | R theo entity; không sửa | ID nghiệp vụ |
| owner | TEXT | NOT NULL | identity schema | hidden | `OWNER_INVALID` | actor tạo | audit/R theo quyền | chủ record kỹ thuật |
| docstatus | INTEGER | CHECK 0/1/2 | `z.union([0,1,2])` | hidden | `LIFECYCLE_INVALID` | state action | server only | draft/submitted/cancelled |
| status | TEXT | NOT NULL, indexed | entity status enum | badge/read-only | `STATE_TRANSITION_INVALID` | controller | R theo entity; action-only | trạng thái hiển thị |
| version | INTEGER | >0 | `z.number().int().positive()` | hidden | `VERSION_CONFLICT` | kernel +1 | R; client gửi expected | optimistic lock |
| created_at | TEXT | NOT NULL ISO | `z.string().datetime()` | datetime/read-only | `CREATED_AT_INVALID` | server clock | R theo entity | thời điểm tạo |
| modified_at | TEXT | NOT NULL ISO, indexed | `z.string().datetime()` | datetime/read-only | `MODIFIED_AT_INVALID` | server clock | R theo entity | sửa gần nhất |
| payload_json | TEXT | NOT NULL, json_valid | entity schema | không render raw | `PAYLOAD_SCHEMA_INVALID` | controller | field projection | business payload |

### 0.2 Canonical child envelope — áp dụng cho mọi bảng con

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| parent_key | TEXT | FK documents, PK-part | internal string | hidden | `PARENT_INVALID` | parent document | theo parent | chứng từ cha |
| fieldname | TEXT | PK-part | enum table field | hidden | `CHILD_FIELD_INVALID` | controller | server only | tên collection |
| child_doctype | TEXT | NOT NULL | enum | hidden | `CHILD_DOCTYPE_INVALID` | metadata | server only | loại row |
| row_id | TEXT | PK-part | UUID/string | hidden | `CHILD_ROW_ID_INVALID` | server UUID | R theo parent; không sửa | định danh ổn định |
| idx | INTEGER | >0, parent-order index | `z.number().int().positive()` | drag handle khi cho phép | `CHILD_ORDER_INVALID` | array order | theo quyền parent | thứ tự row |
| payload_json | TEXT | json_valid | child schema | controls theo ledger | `CHILD_SCHEMA_INVALID` | controller | field projection | dữ liệu row |

## 1. `Employee` — field dùng bởi HR Lite

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| employee_number | TEXT | UNIQUE tenant, NOT NULL | `z.string().regex(/^NV-\d{4}-\d{4,}$/)` | code-auto | “Không cấp được mã nhân viên” | naming_series `NV:YYYY` | O/P/T/E own R; không sửa | mã dễ nhận biết |
| employee_name | TEXT | NOT NULL | `z.string().trim().min(2).max(120)` | text* | “Nhập họ và tên từ 2 đến 120 ký tự” | trim/gộp khoảng trắng | O RW; P/T R; E own R | họ tên |
| mobile | TEXT | NOT NULL, index normalized | VN phone schema | tel* | “SĐT phải 10 số, bắt đầu 03/05/07/08/09” | normalize +84/khoảng trắng | O RW; P/T R; E own RW proposal | liên hệ |
| alu_mobile_normalized | TEXT | NOT NULL, indexed | `z.string().regex(/^0\d{9}$/)` | hidden | `PHONE_NORMALIZATION_FAILED` | server từ mobile | server; basic DTO có mobile | tìm/trùng |
| date_of_joining | TEXT | NOT NULL date | `z.string().date()` | date* | “Ngày bắt đầu chưa hợp lệ” | hôm nay | O RW; P/T R; E own R | bắt đầu làm |
| employee_status | TEXT | NOT NULL | `z.enum(['ACTIVE','PAUSED','LEFT','ARCHIVED'])` | badge/action | “Không thể đổi trạng thái này” | ACTIVE | O action; P/T/E R | vòng đời |
| job_title_text | TEXT | NULL | `z.string().trim().max(100).nullable()` | text | “Công việc tối đa 100 ký tự” | — | O RW; P/T/E R | mô tả việc, không danh mục |
| photo_file_id | TEXT | FK files NULL | id nullable | avatar/file | “Ảnh không hợp lệ hoặc quá 5MB” | — | O RW; E own proposal; others R | avatar |
| user_id | TEXT | UNIQUE tenant NULL | email/user id nullable | action Mời dùng app | “Tài khoản đã gắn nhân viên khác” | invite flow | O action; E own R | self-scope |
| company | TEXT | FK Company, NOT NULL | internal link | hidden | `COMPANY_SETTINGS_MISSING` | Payroll Settings | R tối thiểu; S write | scope thẩm quyền |
| branch | TEXT | FK Branch, NOT NULL | internal link | hidden | `WORKPLACE_SETTINGS_MISSING` | default workplace | R tối thiểu; S write | vùng/nơi làm |
| department | TEXT | FK Department NULL | nullable link | không render | không bắt buộc đường Lite | giữ dữ liệu cũ/null | generic HR roles; Lite không ghi | tương thích legacy |
| designation | TEXT | FK NULL | nullable link | không render | không bắt buộc trusted Lite | null | generic only | tương thích legacy |
| employment_type | TEXT | FK NULL | nullable link | không render | không bắt buộc trusted Lite | null | generic only | tương thích legacy |
| cost_center | TEXT | FK NULL | nullable link | không render | resolve khi accounting cần | settings nâng cao/null | O/A R; S write | posting tương lai |
| relieving_date | TEXT | date NULL | `z.string().date().nullable()` | date trong action nghỉ | “Ngày nghỉ không trước ngày vào làm” | ngày chọn | O action; P/T/E R | ngày nghỉ việc |
| alu_profile | TEXT | NOT NULL | `z.enum(['LITE_V1','LEGACY'])` internal | hidden | `LITE_PROFILE_SPOOFED` | trusted callback | S only | chọn validation path |
| archived_at | TEXT | datetime NULL | datetime nullable | hidden | chỉ record chưa lịch sử | server clock | O action/S | soft archive nháp |

State machine: `ACTIVE ↔ PAUSED`; `ACTIVE|PAUSED → LEFT`; record chưa attendance/payroll mới `→ ARCHIVED`. Không DELETE.

## 2. `AlumDoor Employee Legal Profile`

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| profile_code | TEXT | UNIQUE, NOT NULL | `/^HSPL-/` | code-auto | “Mã hồ sơ không hợp lệ” | naming_series | O/P/A/E own R | mã version |
| employee | TEXT | FK Employee, NOT NULL | id | link Employee* | “Nhân viên không thuộc phạm vi” | context employee | O/P RW; A/E limited | chủ hồ sơ |
| effective_from | TEXT | date, NOT NULL | date | date* | “Ngày hiệu lực không hợp lệ” | joining/đầu tháng kế | O/P RW | đầu hiệu lực |
| effective_to | TEXT | date NULL | nullable date | date | “Ngày kết thúc phải sau ngày bắt đầu” | version trước -1 ngày | O/P RW | cuối hiệu lực |
| tax_code | TEXT | index NULL | `z.string().regex(/^(\d{10}\|\d{13})$/).nullable()` | text | “MST phải có 10 hoặc 13 số” | — | O/P RW; A R; E own proposal/R | MST cá nhân |
| social_insurance_number | TEXT | index NULL | 10-digit nullable | text | “Mã BHXH phải có 10 số” | — | O/P RW; A R; E proposal/R | mã BHXH |
| insurance_status | TEXT | NOT NULL | enum NOT_REQUIRED/REQUIRED/ACTIVE/PAUSED | select* | “Chọn trạng thái bảo hiểm” | REQUIRED | O/P RW; A R; E own R | phạm vi BHXH |
| insurance_salary_vnd | INTEGER | >=0, NOT NULL | int nonnegative | money | “Mức đóng bảo hiểm không hợp lệ” | base salary gợi ý, không tự ghi khi đã sửa | O/P RW; A R; E own R | căn cứ đóng |
| pit_status | TEXT | NOT NULL | enum NOT_REQUIRED/WITHHOLD/FINALIZE_ELSEWHERE | select* | “Chọn cách xử lý thuế” | WITHHOLD | O/P RW; A R; E own R | xử lý PIT |
| tax_residency | TEXT | NOT NULL | enum RESIDENT/NON_RESIDENT | select* | “Chọn tình trạng cư trú” | RESIDENT | O/P RW; A R; E own R | công thức PIT |
| payment_method | TEXT | NOT NULL | enum CASH/BANK | segmented* | “Chọn hình thức trả” | CASH | O/P RW; A RW payment; E own R | trả lương |
| bank_name | TEXT | NULL | max120 nullable | link/text condition | “Nhập ngân hàng khi trả chuyển khoản” | — | O/P RW; A RW; E own R | ngân hàng nhận |
| bank_account_no | TEXT | NULL | digits 6..30 nullable | text condition* | “Số tài khoản không hợp lệ” | — | O/P RW; A RW; E own R | tài khoản nhận |
| bank_account_name | TEXT | NULL | max120 nullable | text condition* | “Tên chủ tài khoản không hợp lệ” | employee name | O/P RW; A RW; E own R | chủ tài khoản |
| status | TEXT | NOT NULL | enum DRAFT/APPROVED/RETIRED | badge/action | “Chuyển trạng thái hồ sơ không hợp lệ” | DRAFT | O approve; P draft; A/E R | version có hiệu lực |
| approved_by | TEXT | FK User NULL | id nullable | read-only | “Thiếu người duyệt” | actor approve | O/P/A/E own R | audit |
| approved_at | TEXT | datetime NULL | datetime nullable | read-only | “Thiếu thời điểm duyệt” | server clock | R theo profile | audit |
| source_hash | TEXT | SHA-256 NOT NULL khi approved | 64 hex nullable | hidden | `LEGAL_PROFILE_HASH_INVALID` | canonical payload | S; O/P audit R | phát hiện đổi |

State machine: `DRAFT → APPROVED → RETIRED`. APPROVED chỉ thay bằng version mới; không chồng hiệu lực.

## 3. `AlumDoor Payroll Dependent` — child Legal Profile

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| dependent_code | TEXT | unique trong employee | `z.string().min(1).max(40)` | code-auto | “Mã người phụ thuộc bị trùng” | server sequence | O/P/A/E own R | định danh |
| full_name | TEXT | NOT NULL | string 2..120 | text* | “Nhập họ tên người phụ thuộc” | normalize | O/P RW; A R; E proposal/R | họ tên |
| relationship | TEXT | NOT NULL | legal enum | select* | “Chọn quan hệ” | — | O/P RW; A/E own R | quan hệ PIT |
| date_of_birth | TEXT | date, NOT NULL | date | date* | “Ngày sinh không hợp lệ” | — | O/P RW; A/E own R | kiểm tra phụ thuộc |
| identity_or_birth_no | TEXT | NULL | max30 nullable | text | “Mã giấy tờ không hợp lệ” | — | O/P RW; A R; E proposal/R | đối chiếu |
| tax_dependent_code | TEXT | NULL | max30 nullable | text | “Mã số thuế NPT không hợp lệ” | — | O/P RW; A R; E own R | đăng ký PIT |
| effective_from | TEXT | date, NOT NULL | date | date* | “Ngày bắt đầu giảm trừ không hợp lệ” | đầu tháng | O/P RW; A/E R | đầu giảm trừ |
| effective_to | TEXT | date NULL | nullable date | date | “Ngày kết thúc không hợp lệ” | — | O/P RW; A/E R | cuối giảm trừ |
| verification_status | TEXT | NOT NULL | enum PENDING/VERIFIED/REJECTED | badge/action | “Trạng thái xác minh không hợp lệ” | PENDING | O verify; P proposal; A/E R | đủ điều kiện rule |
| evidence_file_id | TEXT | FK files NULL | id nullable | file | “Tệp căn cứ không hợp lệ” | — | O/P RW; A/E own R | căn cứ đăng ký |

State machine: `PENDING → VERIFIED|REJECTED`; thay đổi field của VERIFIED tạo version Legal Profile mới.

## 4. `AlumDoor Pay Profile`

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| profile_code | TEXT | UNIQUE, NOT NULL | `/^ALU-LUONG-/` | code-auto | “Mã hồ sơ lương không hợp lệ” | naming_series | O/P/A/E own R | mã version |
| employee | TEXT | FK Employee, NOT NULL | id | hidden/context | “Nhân viên không thuộc phạm vi” | detail employee | O/P RW; A/E own R | nhân viên |
| company | TEXT | FK Company, NOT NULL | internal link | hidden | “Công ty không khớp nhân viên” | Employee | S write; O/P R | scope |
| branch | TEXT | FK Branch, NOT NULL | internal link | hidden | “Nơi làm việc không khớp” | Employee | S write; O/P R | scope/vùng |
| pay_mode | TEXT | NOT NULL | enum MONTHLY/DAILY | segmented* | “Chọn cách trả lương” | MONTHLY | O/P RW; A/E own R | công thức lương |
| base_salary_vnd | INTEGER | >0, NOT NULL | int positive safe | money* | “Mức lương phải lớn hơn 0” | — | O/P RW; A/E own R | lương tháng/ngày |
| fixed_allowance_vnd | INTEGER | >=0, NOT NULL | int nonnegative | money accordion | “Phụ cấp không được âm” | 0/profile trước | O/P RW; A/E own R | phụ cấp cố định |
| effective_from | TEXT | date, NOT NULL | date | date* | “Ngày hiệu lực bị chồng hồ sơ” | joining/đầu tháng kế | O/P RW | đầu hiệu lực |
| effective_to | TEXT | date NULL | nullable date | date | “Ngày kết thúc không hợp lệ” | version trước -1 | O/P RW | cuối hiệu lực |
| profile_key | TEXT | UNIQUE, NOT NULL | string | hidden | `PAY_PROFILE_DUPLICATE` | employee/from/version | S | guard |
| calculation_policy | TEXT | NOT NULL | enum ALU_PAYROLL_V2 | read-only | “Policy tính không hợp lệ” | ALU_PAYROLL_V2 | S; O/P/A/E R | chọn engine |
| legacy_overtime_multiplier_bp | INTEGER | NULL | int nullable | không render | không dùng v2 | giữ v1 | System/audit R | đọc lịch sử |
| status | TEXT | NOT NULL | enum DRAFT/APPROVED/RETIRED | badge/action | “Trạng thái hồ sơ lương không hợp lệ” | DRAFT | O approve; P draft; A/E R | hiệu lực |
| approved_by | TEXT | FK User NULL | nullable id | read-only | “Thiếu người duyệt” | actor | R theo profile | audit |
| approved_at | TEXT | datetime NULL | nullable datetime | read-only | “Thiếu thời điểm duyệt” | clock | R theo profile | audit |
| input_hash | TEXT | SHA-256 khi approved | 64 hex nullable | hidden | `PAY_PROFILE_HASH_INVALID` | canonical payload | S; O/P audit R | bất biến |

State machine: `DRAFT → APPROVED → RETIRED`. APPROVED bất biến; version hiệu lực không chồng.

## 5. `AlumDoor Payroll Settings` — singleton

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| settings_key | TEXT | UNIQUE tenant, NOT NULL | literal `ALUMDOOR` | hidden | `SETTINGS_DUPLICATE` | server | O/P/A R; S write | singleton |
| company | TEXT | FK Company, NOT NULL | internal link | advanced link | “Chưa cấu hình công ty” | tenant company duy nhất | O RW; P/A R | company mặc định |
| default_workplace | TEXT | FK Branch, NOT NULL | internal link | workplace link* | “Chọn nơi làm việc” | branch duy nhất | O RW; P/A R | vùng tính lương |
| minimum_wage_region | TEXT | NOT NULL | enum I/II/III/IV | select* | “Chọn đúng vùng lương tối thiểu” | theo workplace gợi ý, O xác nhận | O RW; P/A R | rule minimum |
| currency | TEXT | NOT NULL literal VND | `z.literal('VND')` | hidden | “Bản này chỉ hỗ trợ VND” | VND | all R; S write | tiền tệ |
| timezone | TEXT | NOT NULL | IANA enum | hidden | “Múi giờ không hỗ trợ” | Asia/Ho_Chi_Minh | O R; S write | date boundary |
| standard_minutes_per_day | INTEGER | 1..1440 | int min1 max1440 | number advanced | “Số phút/ngày không hợp lệ” | 480 | O RW; P/A R | đổi ngày công |
| overtime_rate_vnd_per_hour | INTEGER | CHECK =50000 | literal 50000 | summary read-only | “Tăng ca đang khóa 50.000đ/giờ” | 50000 | all authorized R; S write | policy doanh nghiệp |
| pay_day_of_month | INTEGER | 1..28 | int min1 max28 | number* | “Ngày trả lương từ 1 đến 28” | 5 | O RW; P/A R | ngày trả mặc định |
| owner_only_mode | INTEGER | 0/1 | boolean | switch | “Chế độ duyệt không hợp lệ” | true | O RW; P/A R | gộp chuẩn bị/chốt |
| legal_bundle | TEXT | FK Legal Bundle, NOT NULL | id | link read-only/select verified | “Chưa có bộ quy tắc đã xác minh” | rule hiệu lực duy nhất | O select; P/A R | rules snapshot |
| salary_structure | TEXT | FK Salary Structure, NOT NULL | internal link | advanced | “Thiếu cấu trúc lương nền” | installer/previous | O advanced RW; S | SSA compatibility |
| holiday_list | TEXT | FK Holiday List, NOT NULL | internal link | advanced | “Thiếu lịch làm việc” | workplace | O advanced RW | standard days/day type |
| cost_center | TEXT | FK Cost Center NULL | nullable link | advanced | “Trung tâm chi phí không hợp lệ” | company default | O/A advanced RW | posting tương lai |
| expense_account | TEXT | FK Account NULL | nullable link | advanced | “Tài khoản chi phí không hợp lệ” | company setup | O/A advanced RW | posting tương lai |
| payable_account | TEXT | FK Account NULL | nullable link | advanced | “Tài khoản phải trả không hợp lệ” | company setup | O/A advanced RW | posting tương lai |
| calculation_version | INTEGER | NOT NULL =2 | literal 2 | hidden | `CALCULATION_VERSION_INVALID` | 2 | S; authorized R | engine hiện hành |
| updated_by | TEXT | FK User, NOT NULL | id | read-only | `SETTINGS_ACTOR_INVALID` | actor | authorized R | audit |

Singleton không có state machine; mọi save audit before/after. Legal Bundle phải VERIFIED trước finalize, không bắt Settings trở thành workflow dài.

## 6. `AlumDoor Attendance Day` — field payroll dùng

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| employee | TEXT | FK Employee, NOT NULL | id | link/read-only | “Nhân viên không hợp lệ” | checkin | O/T RW before lock; P R; E own R | người làm |
| company | TEXT | FK, NOT NULL | internal link | hidden | “Công ty không khớp” | Employee | S/T | scope |
| branch | TEXT | FK, NOT NULL | internal link | hidden | “Nơi làm việc không khớp” | Employee | S/T | scope/rule |
| department | TEXT | FK NULL | nullable | không render | không bắt buộc | Employee/null | legacy only | tương thích |
| work_date | TEXT | date, unique employee/date | date | date/read-only | “Ngày công bị trùng” | scan server time | O/T R; P/E own R | ngày nguồn |
| day_type | TEXT | NOT NULL | enum REGULAR/WEEKLY_REST/PUBLIC_HOLIDAY/PAID_LEAVE | badge/read-only | “Chưa phân loại loại ngày” | versioned holiday list | O/T override có reason; P R | floor bucket |
| regular_minutes | INTEGER | 0..1440 | int range | duration read-only | “Phút công thường không hợp lệ” | segments | O/T R; P/E own R | công thường |
| approved_overtime_minutes | INTEGER | 0..1440 | int range | duration read-only | “Phút OT không khớp bucket” | sum approved buckets | O/T approve; P/E own R | phút trả 50k |
| night_minutes | INTEGER | 0..1440 | int range | duration read-only | “Phút ban đêm không hợp lệ” | overlap 22:00–06:00 | O/T R; P/E own R | phụ trội đêm |
| overtime_night_minutes | INTEGER | <= approved OT | int range | duration read-only | “OT ban đêm vượt tổng OT” | buckets NIGHT | O/T R; P/E own R | floor OT đêm |
| payable_work_fraction_bp | INTEGER | 0..10000 default | int 0..10000 | number read-only | “Ngày công quy đổi không hợp lệ” | regular/standard minutes | O/T approve; P/E own R | phần ngày công |
| state | TEXT | NOT NULL | enum OPEN/COMPLETE/EXCEPTION/APPROVED/LOCKED | badge/action | “Ngày công chưa đủ điều kiện” | scan/controller | O/T action; P/E own R | khóa payroll |
| exception_code | TEXT | NULL | exception enum nullable | badge | “Mã ngoại lệ không hợp lệ” | calculation | O/T R; P/E own R | việc cần xử lý |
| correction_reason | TEXT | NULL | max500 nullable | textarea on correction | “Nhập lý do điều chỉnh” | — | O/T RW before lock | audit sửa công |
| classification_rule_hash | TEXT | SHA-256, NOT NULL khi complete | 64 hex | hidden | `DAY_CLASSIFICATION_STALE` | calendar/rule | S; O/T/P audit R | phát hiện lịch đổi |
| locked_by_payroll | TEXT | FK Payroll Entry NULL | id nullable | link/read-only | “Ngày công đã bị khóa” | finalize bundle | all authorized R; S write | kỳ khóa |
| calculated_at | TEXT | datetime, NOT NULL | datetime | read-only | `ATTENDANCE_CALC_TIME_INVALID` | server clock | authorized R | trace |

State machine: `OPEN → COMPLETE → APPROVED → LOCKED`; lỗi `→ EXCEPTION → COMPLETE`; LOCKED bất biến, sửa bằng correction/adjustment kỳ sau.

## 7. `AlumDoor Overtime Bucket` — child Attendance Day

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| bucket_key | TEXT | unique parent | string max120 | hidden | “Bucket tăng ca bị trùng” | date/category/period/source | S | định danh |
| source_segment | TEXT | NOT NULL | segment enum/id | link/read-only | “Thiếu nguồn tăng ca” | attendance segment | O/T/P R | bằng chứng |
| work_date | TEXT | date, NOT NULL | date | read-only | “Ngày bucket không khớp ngày công” | parent | authorized R | ngày rule |
| day_category | TEXT | NOT NULL | enum REGULAR/WEEKLY_REST/PUBLIC_HOLIDAY | badge/read-only | “Chưa phân loại loại ngày” | parent day_type | O/T override reason; P R | hệ số luật |
| time_category | TEXT | NOT NULL | enum DAY/NIGHT | badge/read-only | “Chưa phân loại ngày/đêm” | overlap 22:00–06:00 | O/T/P R | phụ trội đêm |
| approved_minutes | INTEGER | 1..1440 | int min1 max1440 | duration/read-only | “Số phút OT không hợp lệ” | segment overlap | O/T approve; P/E own R | phút thuộc bucket |
| policy_rate_vnd_per_hour | INTEGER | =50000 | literal 50000 | money read-only | “Rate policy phải là 50.000” | settings | authorized R; S write | rate trả |
| legal_rule_ref | TEXT | FK rule, NOT NULL | id | link/read-only | “Thiếu quy tắc pháp lý hiệu lực” | legal bundle/date | O/P/A R | rule áp dụng |
| legal_floor_vnd | INTEGER | >=0 | int nonnegative | money read-only | “Sàn OT không tính được” | rule engine preview | O/P/A R; T không amount | sàn bucket |
| classification_trace_json | TEXT | JSON, NOT NULL | typed JSON | accordion audit | `OT_TRACE_INVALID` | rule engine | O/P/A R; E own explanation | truy vết |

Bucket không có state riêng; chỉ tồn tại/được sửa khi parent chưa LOCKED và được parent approval bao phủ.

## 8. `Payroll Entry` — kỳ lương Lite v2

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| alu_period_code | TEXT | UNIQUE, NOT NULL | `/^BL-/` | code-auto | “Mã kỳ lương không hợp lệ” | naming_series `BL:YYYYMM` | O/P/A R | mã kỳ |
| alu_period_key | TEXT | unique active tenant/workplace | `/^\d{4}-\d{2}$/` | month picker* | “Kỳ lương bị trùng” | tháng hiện tại | O/P create; A R | tháng lương |
| company | TEXT | FK Company, NOT NULL | internal link | hidden | “Thiếu công ty tính lương” | settings | S write; O/P/A R | scope |
| branch | TEXT | FK Branch, NOT NULL | internal link | hidden | “Thiếu nơi làm việc” | settings | S write; O/P/A R | scope/vùng |
| start_date | TEXT | date, NOT NULL | date | read-only | “Ngày đầu kỳ không hợp lệ” | first day period | S; O/P/A R | đầu kỳ |
| end_date | TEXT | date, NOT NULL | date | read-only | “Ngày cuối kỳ không hợp lệ” | last day period | S; O/P/A R | cuối kỳ |
| pay_date | TEXT | date, NOT NULL | date | date before finalize | “Ngày trả lương không hợp lệ” | pay day settings/month+1 | O/P RW draft; A R | dự kiến trả |
| alu_standard_work_days_bp | INTEGER | 1..310000 | int positive max310000 | summary read-only | “Không tính được ngày công chuẩn” | holiday/calendar | O/P/A R; S write | mẫu số lương tháng |
| alu_overtime_rate_vnd | INTEGER | =50000 | literal 50000 | summary read-only | “Rate kỳ phải là 50.000” | settings snapshot | authorized R; S write | policy snapshot |
| alu_legal_bundle | TEXT | FK Legal Bundle, NOT NULL | id | link/read-only | “Bộ quy tắc chưa xác minh/không hiệu lực” | settings effective | O/P/A R | legal snapshot |
| alu_legal_bundle_checksum | TEXT | SHA-256, NOT NULL | 64 hex | hidden | `LEGAL_BUNDLE_CHANGED` | selected bundle | O/P/A audit R; S | chống sửa rule |
| alu_state | TEXT | NOT NULL | enum DRAFT/READY/FINALIZED/PAID/CANCELLED | badge/action | “Trạng thái kỳ lương không hợp lệ” | DRAFT | O action; P prepare; A paid; R theo role | workflow Lite |
| alu_calculation_version | INTEGER | =2 for new | int positive | read-only | `CALCULATION_VERSION_INVALID` | settings | authorized R | engine version |
| alu_employee_count | INTEGER | >=0 | int nonnegative | KPI | “Số nhân viên không khớp” | count slips | authorized R; S | số người |
| alu_regular_minutes | INTEGER | >=0 | int nonnegative | KPI detail | “Tổng phút công không khớp” | sum slips | authorized R; S | tổng công |
| alu_overtime_minutes | INTEGER | >=0 | int nonnegative | KPI | “Tổng phút OT không khớp” | sum slips | authorized R; S | tổng OT |
| alu_base_pay_vnd | INTEGER | >=0 | int nonnegative | report | “Tổng lương công không khớp” | sum slips | O/P/A R; S | tổng base |
| alu_overtime_pay_vnd | INTEGER | >=0 | int nonnegative | KPI/report | “Tổng tiền OT không khớp” | sum slips | O/P/A R; S | tổng OT |
| alu_gross_total_vnd | INTEGER | >=0 | int nonnegative | KPI | “Tổng thu nhập không khớp” | sum slips | O/P/A R; S | tổng gross |
| alu_deduction_total_vnd | INTEGER | >=0 | int nonnegative | KPI/report | “Tổng khấu trừ không khớp” | sum slips | O/P/A R; S | tổng trừ |
| alu_net_total_vnd | INTEGER | >=0 | int nonnegative | KPI lớn | “Tổng thực nhận không khớp” | sum slips | O/P/A R; S | tổng trả |
| alu_blocking_error_count | INTEGER | >=0 | int nonnegative | blocker badge | “Số lỗi chặn không khớp” | preflight | O/P R; T/A limited | readiness |
| alu_warning_count | INTEGER | >=0 | int nonnegative | warning badge | “Số cảnh báo không khớp” | preflight | role projection | cảnh báo không chặn |
| alu_source_hash | TEXT | SHA-256 NULL until preview | 64 hex nullable | hidden | `PAYROLL_SOURCE_CHANGED` | canonical sources | O/P audit R; S | optimistic aggregate |
| alu_formula_schema_version | INTEGER | NOT NULL =2 | int positive | hidden | `FORMULA_SCHEMA_UNSUPPORTED` | 2 | S; audit R | trace parser |
| alu_prepared_by | TEXT | FK User NULL | id nullable | timeline | “Thiếu người chuẩn bị” | preview actor | O/P/A R | audit |
| alu_prepared_at | TEXT | datetime NULL | datetime nullable | timeline | “Thiếu thời điểm chuẩn bị” | clock | O/P/A R | audit |
| alu_finalized_by | TEXT | FK User NULL | id nullable | timeline | “Thiếu người chốt” | finalize actor | O/P/A R | audit |
| alu_finalized_at | TEXT | datetime NULL | datetime nullable | timeline | “Thiếu thời điểm chốt” | clock | O/P/A R | audit |
| alu_paid_by | TEXT | FK User NULL | id nullable | timeline | “Thiếu người xác nhận trả” | paid actor | O/P/A R | audit |
| alu_paid_at | TEXT | datetime NULL | datetime nullable | timeline | “Thiếu thời điểm trả” | paid date/server clock | O/P/A/E slip R | audit/trạng thái |
| alu_payment_reference | TEXT | NULL max120 | trimmed max120 nullable | text in paid dialog | “Mã tham chiếu tối đa 120 ký tự” | — | O/A RW action; P R | UNC/ghi chú tiền mặt |
| alu_cancel_reason | TEXT | NULL 10..500 when cancelled | conditional string | textarea* in cancel | “Nhập lý do hủy từ 10 ký tự” | — | O action; P/A R | căn cứ hủy |

State machine: `DRAFT → READY → FINALIZED → PAID`; source đổi `READY → DRAFT`; `DRAFT|READY → CANCELLED`; FINALIZED chỉ reverse có kiểm soát mới CANCELLED. FINALIZED/PAID tiền bất biến.

## 9. `Salary Slip` — phiếu lương Lite v2

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| employee | TEXT | FK Employee, NOT NULL | id | link/read-only | “Nhân viên không thuộc kỳ” | period population | O/P/A R; E own R | người nhận |
| company | TEXT | FK, NOT NULL | internal link | hidden | “Công ty phiếu không khớp” | period | authorized R | scope |
| start_date | TEXT | date, NOT NULL | date | read-only | “Ngày đầu phiếu không khớp kỳ” | period | authorized/E own R | kỳ |
| end_date | TEXT | date, NOT NULL | date | read-only | “Ngày cuối phiếu không khớp kỳ” | period | authorized/E own R | kỳ |
| alu_payroll_entry | TEXT | FK Payroll Entry, unique with employee | id | link/read-only | “Phiếu lương bị trùng” | period | O/P/A R; E own R | aggregate |
| alu_pay_profile | TEXT | FK Pay Profile, NOT NULL | id | link/read-only | “Thiếu hồ sơ lương hiệu lực” | effective profile | O/P R; A/E own summary | source rate |
| alu_pay_mode | TEXT | NOT NULL | enum MONTHLY/DAILY | read-only | `PAY_MODE_INVALID` | profile snapshot | authorized/E own R | cách trả |
| alu_base_salary_vnd | INTEGER | >0 | int positive | money read-only | “Mức lương snapshot không hợp lệ” | profile | O/P/A/E own R | mức lương |
| alu_payable_work_fraction_bp | INTEGER | >=0 | int nonnegative | work-days summary | “Ngày công trả lương không khớp” | attendance sum | O/P/A/E own R | công thực tế |
| alu_standard_work_days_bp | INTEGER | >0 | int positive | work-days summary | “Ngày công chuẩn không hợp lệ” | period | O/P/A/E own R | mẫu số |
| alu_regular_minutes | INTEGER | >=0 | int nonnegative | duration | “Phút công không hợp lệ” | attendance | O/P/A/E own R | trace công |
| alu_overtime_minutes | INTEGER | >=0 | int nonnegative | duration | “Phút OT không hợp lệ” | buckets sum | O/P/A/E own R | OT trả |
| alu_overtime_rate_vnd | INTEGER | =50000 | literal 50000 | money read-only | “Rate OT phải là 50.000” | period | O/P/A/E own R | policy hiển thị |
| alu_overtime_pay_vnd | INTEGER | >=0 | int nonnegative | money | “Tiền OT không khớp công thức” | half-up minutes×rate/60 | O/P/A/E own R | tiền OT |
| alu_legal_overtime_floor_vnd | INTEGER | >=0 | int nonnegative | audit/explanation | “Không tính được sàn OT” | rule engine | O/P/A R; E own explanation | kiểm tra legal |
| alu_base_pay_vnd | INTEGER | >=0 | int nonnegative | money | “Lương theo công không khớp” | fixed-point engine | O/P/A/E own R | lương công |
| alu_fixed_allowance_vnd | INTEGER | >=0 | int nonnegative | money | “Phụ cấp cố định không khớp” | profile | O/P/A/E own R | thu nhập |
| alu_other_earning_vnd | INTEGER | >=0 | int nonnegative | money | “Khoản cộng không khớp” | approved adjustments | O/P/A/E own R | bonus/allowance |
| gross_pay | INTEGER | >=0 | int nonnegative | money | “Tổng thu nhập không khớp” | base+OT+earnings | O/P/A/E own R | chuẩn Salary Slip |
| alu_insurance_employee_vnd | INTEGER | >=0 | int nonnegative | money | “Khấu trừ bảo hiểm không khớp” | legal rule | O/P/A/E own R | BH NLĐ |
| alu_pit_vnd | INTEGER | >=0 | int nonnegative | money | “Thuế TNCN không khớp” | PIT ruleset | O/P/A/E own R | PIT |
| alu_advance_vnd | INTEGER | >=0 | int nonnegative | money | “Tạm ứng không khớp” | adjustments | O/P/A/E own R | trừ tạm ứng |
| alu_damage_deduction_vnd | INTEGER | >=0 | int nonnegative | money | “Khấu trừ bồi thường không hợp lệ” | evidence adjustment + cap | O/P/A/E own R | trừ hợp lệ |
| alu_other_legal_deduction_vnd | INTEGER | >=0 | int nonnegative | money | “Khoản trừ pháp lý không hợp lệ” | rule-coded adjustments | O/P/A/E own R | khoản trừ khác có luật |
| total_deduction | INTEGER | >=0 | int nonnegative | money | “Tổng khấu trừ không khớp” | sum deductions | O/P/A/E own R | chuẩn Salary Slip |
| net_pay | INTEGER | >=0 | int nonnegative | money large | “Thực nhận không được âm” | gross-deductions | O/P/A/E own R | số trả |
| alu_state | TEXT | NOT NULL | enum DRAFT/FINALIZED/PAID/CANCELLED | badge | “Trạng thái phiếu không hợp lệ” | follows period | action via period only | vòng đời |
| alu_calculation_version | INTEGER | NOT NULL | int positive | read-only | `CALCULATION_VERSION_INVALID` | period | authorized/E own R | v1/v2 |
| alu_source_hash | TEXT | SHA-256, NOT NULL | 64 hex | hidden | `SALARY_SOURCE_CHANGED` | canonical input | O/P audit R; S | nguồn bất biến |
| alu_formula_trace_json | TEXT | json_valid, NOT NULL | versioned trace schema | accordion explanation | `FORMULA_TRACE_INVALID` | engine | O/P full; A/E own explanation | cách tính |
| alu_rule_trace_json | TEXT | json_valid, NOT NULL | rule trace schema | accordion/legal refs | `RULE_TRACE_INVALID` | engine | O/P/A full; E own explanation | rules/checksum |
| alu_paid_at | TEXT | datetime NULL | datetime nullable | timeline | `PAID_TIME_INVALID` | period paid | authorized/E own R | thời điểm trả |
| alu_payment_reference | TEXT | NULL max120 | nullable max120 | text/read-only | `PAYMENT_REFERENCE_INVALID` | period paid | O/A full; P/E own masked | đối chiếu |

State machine: `DRAFT → FINALIZED → PAID`; `CANCELLED` chỉ qua period coordinator. Employee chỉ đọc khi FINALIZED/PAID.

## 10. `AlumDoor Payroll Adjustment`

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| adjustment_code | TEXT | UNIQUE, NOT NULL | `/^DC-/` | code-auto | “Mã khoản điều chỉnh không hợp lệ” | naming_series | O/P/A/E slip R | mã khoản |
| payroll_entry | TEXT | FK, NOT NULL | id | hidden/context | “Kỳ lương không còn cho phép sửa” | selected period | O/P RW draft; A/E R | kỳ áp dụng |
| employee | TEXT | FK, NOT NULL | id | link Employee* | “Nhân viên không thuộc kỳ” | selected slip | O/P RW; A/E own R | người áp dụng |
| adjustment_type | TEXT | NOT NULL | enum ALLOWANCE/BONUS/ADVANCE/DAMAGE_COMPENSATION/OTHER_LEGAL | select* | “Chọn loại khoản cộng/trừ” | context optional | O/P RW; A/E own R | phân loại |
| direction | TEXT | NOT NULL | enum EARNING/DEDUCTION | read-only | “Chiều khoản không khớp loại” | derive type | S; authorized R | cộng/trừ |
| amount_vnd | INTEGER | >0 | int positive | money* | “Số tiền phải lớn hơn 0” | — | O/P RW draft; A/E own R | giá trị |
| reason | TEXT | 10..500, NOT NULL | string min10 max500 | textarea* | “Nhập lý do từ 10 đến 500 ký tự” | — | O/P RW draft; A/E own R | giải trình phiếu |
| evidence_file_id | TEXT | FK files conditional | id nullable | file conditional* | “Khoản này cần tệp căn cứ” | — | O/P RW; A/E own R | bằng chứng |
| legal_rule_code | TEXT | FK rule conditional | id nullable | link conditional* | “Khoản trừ này cần quy tắc pháp lý” | matching bundle suggestion | O/P RW; A/E own R | căn cứ luật |
| status | TEXT | NOT NULL | enum DRAFT/APPROVED/REJECTED/LOCKED | badge/action | “Trạng thái khoản điều chỉnh không hợp lệ” | DRAFT | O approve; P draft; A/E R | workflow |
| approved_by | TEXT | FK User NULL | id nullable | timeline | “Thiếu người duyệt” | actor | authorized R | audit |
| approved_at | TEXT | datetime NULL | datetime nullable | timeline | “Thiếu thời điểm duyệt” | clock | authorized R | audit |
| locked_by_payroll | TEXT | FK Payroll Entry NULL | id nullable | hidden | “Khoản đã bị khóa” | finalize | authorized R; S | bất biến |
| input_hash | TEXT | SHA-256 when approved | 64 hex nullable | hidden | `ADJUSTMENT_HASH_INVALID` | canonical payload | S; O/P audit R | chống sửa |

State machine: `DRAFT → APPROVED → LOCKED`; `DRAFT → REJECTED`. Owner-only confirm có thể tạo rồi approve trong bundle nhưng vẫn có hai receipt/event.

## 11. `AlumDoor Payroll Legal Bundle`

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| bundle_code | TEXT | UNIQUE, NOT NULL | `/^PLR-/` | code-auto | “Mã bộ quy tắc không hợp lệ” | naming_series | O/P/A R | ID bundle |
| bundle_name | TEXT | NOT NULL | string 3..140 | text* admin | “Nhập tên bộ quy tắc” | từ hiệu lực | legal admin RW; O/P/A R | tên hiển thị |
| company | TEXT | FK Company, NOT NULL | id | link* admin | “Công ty không hợp lệ” | tenant company | legal admin RW; O/P/A R | scope |
| effective_from | TEXT | date, NOT NULL | date | date* | “Ngày hiệu lực không hợp lệ” | — | legal admin RW | đầu hiệu lực |
| effective_to | TEXT | date NULL | nullable date | date | “Ngày hết hiệu lực không hợp lệ” | — | legal admin RW | cuối hiệu lực |
| taxpayer_segment | TEXT | NOT NULL | legal enum | select* | “Đối tượng áp dụng không hợp lệ” | SME employee | legal admin RW; O/P/A R | phạm vi |
| location_scope | TEXT | NOT NULL | NATIONAL/region code | select* | “Phạm vi địa lý không hợp lệ” | settings region | legal admin RW; O/P/A R | region |
| schema_version | INTEGER | >0 | int positive | read-only | “Phiên bản schema không hợp lệ” | 1 | legal admin R; S write | parser |
| rules | TEXT/Table | child refs, nonempty | `z.array(ruleRef).min(1)` | child table admin | “Bộ quy tắc còn thiếu thành phần” | suggested required kinds | legal admin RW; O/P/A R | pinned rules |
| test_vectors_json | TEXT | json_valid, NOT NULL | typed vector schema | code/read-only admin | “Bộ ca kiểm thử không đạt” | from sources | legal admin RW; O/P/A R | kiểm chứng |
| checksum | TEXT | UNIQUE SHA-256 | 64 hex | hidden/read-only | `LEGAL_BUNDLE_CHECKSUM_INVALID` | canonical bundle | S; authorized audit R | chống sửa |
| status | TEXT | NOT NULL | enum DRAFT/VERIFIED/RETIRED | badge/action | “Trạng thái bộ quy tắc không hợp lệ” | DRAFT | authorized verifier action; O/P/A R | chỉ VERIFIED tính |
| verified_by | TEXT | FK User NULL | id nullable | timeline | “Thiếu người xác minh” | verifier | authorized R | trách nhiệm |
| verified_at | TEXT | datetime NULL | datetime nullable | timeline | “Thiếu thời điểm xác minh” | clock | authorized R | audit |
| supersedes_bundle | TEXT | FK self NULL | id nullable | link | “Không thể tự thay thế chính mình” | prior active | legal admin RW; O/P/A R | chain version |
| need_legal_check | INTEGER | 0/1, NOT NULL | boolean | warning/read-only | “Bộ quy tắc chưa được xác nhận production” | true until legal sign-off | verifier clear; all authorized R | go-live blocker |

State machine: `DRAFT → VERIFIED → RETIRED`. VERIFIED bất biến; sửa bằng bundle mới, checksum mới và supersedes link. `need_legal_check=1` chặn production/finalize theo cấu hình an toàn.

## 12. `AlumDoor Payroll Legal Rule Ref` — child Legal Bundle

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| rule_kind | TEXT | unique trong bundle | enum MINIMUM_WAGE/OVERTIME/NIGHT/DEDUCTION_CAP/PIT/INSURANCE | select* | “Thiếu hoặc trùng loại quy tắc” | required-kind template | legal admin RW; O/P/A R | chức năng rule |
| rule_doctype | TEXT | NOT NULL | enum VN Payroll Rule/VN Tax Ruleset | link type | “Loại nguồn quy tắc không hợp lệ” | derive kind | legal admin RW; O/P/A R | nguồn chuẩn |
| rule_name | TEXT | FK dynamic, NOT NULL | id | dynamic link* | “Quy tắc nguồn không tồn tại” | effective candidate | legal admin RW; O/P/A R | record pinned |
| rule_checksum | TEXT | SHA-256, NOT NULL | 64 hex | read-only | “Checksum nguồn không khớp” | source record | S; authorized R | chống sửa nguồn |
| effective_from | TEXT | date, NOT NULL | date | read-only | “Rule không phủ ngày hiệu lực bundle” | source record | authorized R | kiểm overlap |
| effective_to | TEXT | date NULL | nullable date | read-only | “Rule hết hiệu lực trước bundle” | source record | authorized R | kiểm overlap |
| source_document_no | TEXT | NOT NULL | max140 | read-only/link | “Thiếu số văn bản nguồn” | source rule/legal link | authorized R | căn cứ |
| source_url | TEXT | HTTPS, NOT NULL | url schema | external link | “Nguồn phải là HTTPS chính thức” | source record | authorized R | kiểm chứng |

Rule ref không có state riêng; bất biến cùng parent VERIFIED.

## 13. `Salary Bank Batch` — tái sử dụng

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| payroll_entry | TEXT | FK, UNIQUE active | id | hidden/context | “Kỳ chưa chốt hoặc đã có batch” | finalized period | O/A create; P R | kỳ chuyển |
| company | TEXT | FK, NOT NULL | id | read-only | “Công ty không khớp kỳ” | period | O/P/A R; S write | scope |
| transfer_date | TEXT | date, NOT NULL | date | date* | “Ngày chuyển không hợp lệ” | period pay_date | O/A RW draft | ngày chuyển |
| bank_account | TEXT | FK Bank Account, NOT NULL | id | link* | “Chọn tài khoản ngân hàng chi” | company default if unique | O/A RW; P R | nguồn tiền |
| currency | TEXT | =VND | literal VND | read-only | “Batch chỉ hỗ trợ VND” | VND | authorized R | tiền tệ |
| employee_count | INTEGER | >=0 | int nonnegative | KPI | “Số dòng chuyển không khớp” | count transfers | authorized R; S | số người |
| total_amount | INTEGER | >=0 | int nonnegative | money KPI | “Tổng chuyển không khớp” | sum rows | O/A R; P theo quyền final | tổng tiền |
| transfers | TEXT/Table | child rows | array schema | DataTable/read-only | “Danh sách chuyển không hợp lệ” | finalized slips+legal profile | O/A R/export; P limited | chi tiết chuyển |
| bank_reference | TEXT | NULL max120 | nullable max120 | text | “Mã ngân hàng quá dài” | — | O/A RW action; P R | đối chiếu |
| workflow_state | TEXT | NOT NULL | enum DRAFT/SUBMITTED/CANCELLED | badge/action | “Trạng thái batch không hợp lệ” | DRAFT | O/A action; P R | vòng đời |

State machine: `DRAFT → SUBMITTED`; có thể `CANCELLED` theo quyền. Không tự mark Payroll Entry paid khi chỉ export; paid là action riêng.

## 14. `Salary Bank Transfer Row` — child Bank Batch

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| salary_slip | TEXT | FK, unique parent | id | link/read-only | “Phiếu lương bị trùng trong batch” | finalized slip | O/A R; P limited | nguồn số tiền |
| employee | TEXT | FK, NOT NULL | id | link/read-only | “Nhân viên không hợp lệ” | slip | O/A R; P limited | người nhận |
| employee_name | TEXT | NOT NULL | max120 | read-only | “Tên nhân viên bị thiếu” | Employee snapshot | O/A R; P limited | tên đối chiếu |
| bank_name | TEXT | NOT NULL | max120 | read-only | “Thiếu ngân hàng nhận” | Legal Profile effective | O/A R/export; P no raw | ngân hàng |
| bank_account_no | TEXT | NOT NULL | digits 6..30 | masked/read-only | “Thiếu số tài khoản hợp lệ” | Legal Profile effective | O/A full; P last4 only | tài khoản |
| amount | INTEGER | >0 | int positive | money/read-only | “Số chuyển phải lớn hơn 0” | Salary Slip net_pay | O/A R; P final amount per permission | tiền chuyển |

Row không có state riêng; bất biến khi batch SUBMITTED.

## 15. `sensitive_access_events` — audit đọc/xuất nhạy cảm

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| tenant_id | TEXT | PK-part, NOT NULL | internal | hidden | `TENANT_SCOPE_INVALID` | identity | S; auditor read | tenant |
| event_id | TEXT | PK-part, NOT NULL | UUID | hidden | `AUDIT_EVENT_ID_INVALID` | server UUID | S; auditor read | ID event |
| actor_user_id | TEXT | NOT NULL, indexed | id | audit timeline | `AUDIT_ACTOR_INVALID` | session actor | auditor/Owner limited R | ai xem/xuất |
| action | TEXT | NOT NULL, indexed | enum VIEW_SALARY/DOWNLOAD_SLIP/EXPORT_PAYROLL/EXPORT_BANK/AI_QUERY | badge | `AUDIT_ACTION_INVALID` | route | auditor R | loại truy cập |
| entity_type | TEXT | NOT NULL, indexed | allowlist | read-only | `AUDIT_ENTITY_INVALID` | route | auditor R | loại dữ liệu |
| entity_id | TEXT | NULL | max140 nullable | link if permitted | `AUDIT_ENTITY_ID_INVALID` | route context | auditor R | record/kỳ |
| field_classes_json | TEXT | json_valid, NOT NULL | array enum BASIC/SALARY/BANK/TAX/INSURANCE | chips/read-only | `AUDIT_FIELD_CLASS_INVALID` | DTO projection | auditor R | nhóm field đã chạm |
| filter_json | TEXT | json_valid, NOT NULL | sanitized filter schema | accordion | `AUDIT_FILTER_INVALID` | request filters, redact secrets | auditor R | phạm vi export/query |
| row_count | INTEGER | >=0 | int nonnegative | number/read-only | `AUDIT_ROW_COUNT_INVALID` | response count | auditor R | độ lớn truy cập |
| reason | TEXT | NULL max500 | nullable max500 | read-only | `AUDIT_REASON_INVALID` | route/user reason if required | auditor R | giải trình |
| correlation_id | TEXT | NOT NULL, indexed | trace id | code/read-only | `CORRELATION_ID_INVALID` | request context | auditor R | nối logs |
| occurred_at | TEXT | NOT NULL, indexed | datetime | datetime/read-only | `AUDIT_TIME_INVALID` | server clock | auditor R | thời điểm |

Append-only: không có state và không có API UPDATE/DELETE; D1 trigger phải từ chối cả hai.

## 16. `files` — field module sử dụng

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| file_id | TEXT | PK-part | UUID/id | hidden | “ID tệp không hợp lệ” | server | owner/entity R | ID metadata |
| file_name | TEXT | NOT NULL | sanitized max255 | file label | “Tên tệp không hợp lệ” | upload filename sanitized | entity permission | tên tải |
| content_type | TEXT | NOT NULL | allowlist by classification | file | “Định dạng tệp không được hỗ trợ” | sniffed server-side | entity permission | MIME |
| size_bytes | INTEGER | >=0 | int nonnegative with use cap | upload progress | “Tệp vượt giới hạn” | upload stream | entity permission | kích thước |
| storage_key | TEXT | UNIQUE tenant | internal string | hidden | `FILE_STORAGE_KEY_INVALID` | server R2 key | S only | vị trí blob |
| attached_to_doctype | TEXT | NULL | allowlist | hidden | “Loại chứng từ đính kèm không hợp lệ” | context | S; entity R | attachment target |
| attached_to_name | TEXT | NULL | id | hidden | “Chứng từ đính kèm không tồn tại” | context | S; entity R | attachment target |
| is_private | INTEGER | =1 for module | literal true | hidden | “Tệp nhân sự phải ở chế độ riêng tư” | 1 | S; authorized download | privacy |
| owner | TEXT | NOT NULL | identity id | hidden | `FILE_OWNER_INVALID` | actor | owner/auditor R | audit |
| created_at | TEXT | NOT NULL | datetime | read-only | `FILE_TIME_INVALID` | clock | entity permission | upload time |
| classification | TEXT | logical metadata/custom payload | enum HR_CONFIDENTIAL/PAYROLL_PDF/AVATAR | hidden/read-only | “Phân loại tệp không hợp lệ” | use case | controls permission/retention | bảo mật |
| checksum | TEXT | logical SHA-256 | 64 hex | hidden | “Checksum tệp không khớp” | upload stream | S/auditor | toàn vẹn |

File không có state; xóa/retention chỉ qua policy và không được làm mất evidence của chứng từ khóa.

## 17. `notification_log` — thông báo module

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| name | TEXT | PK-part | id | hidden | `NOTIFICATION_ID_INVALID` | server UUID | recipient R | ID notify |
| for_user | TEXT | NOT NULL, unread index | user id | notification list | “Người nhận không hợp lệ” | linked employee/role | recipient only; S write | người nhận |
| subject | TEXT | NOT NULL | max200, no salary amount | notification text | “Nội dung thông báo không hợp lệ” | safe template | recipient R | thông báo gọn |
| notification_type | TEXT | NOT NULL | enum Alert | icon/badge | `NOTIFICATION_TYPE_INVALID` | Alert | recipient R | loại |
| document_type | TEXT | NULL | allowlist | deep link | “Loại liên kết không hợp lệ” | Payroll Entry/Salary Slip | recipient if entity permitted | đích |
| document_name | TEXT | NULL | id | deep link | “Không có quyền mở liên kết” | entity | recipient if permitted | đích |
| read | INTEGER | 0/1 | boolean | read state | `NOTIFICATION_READ_INVALID` | 0 | recipient RW own | đã đọc |
| from_user | TEXT | NOT NULL | user/service id | read-only | `NOTIFICATION_SENDER_INVALID` | service/actor | recipient R | nguồn |
| created_at | TEXT | NOT NULL | datetime | read-only | `NOTIFICATION_TIME_INVALID` | clock | recipient R | thời điểm |

Trạng thái duy nhất `UNREAD → READ`; không chứa gross/net/bank/tax trong subject.

## 18. `ai_logs` — trace AI read-only

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| log_id | TEXT | PK-part | UUID | hidden | `AI_LOG_ID_INVALID` | server | authorized auditor R | ID |
| user_id | TEXT | NOT NULL, indexed | identity id | hidden | `AI_USER_INVALID` | session | self/auditor R | người hỏi |
| question | TEXT | NOT NULL | string 1..2000, scrub | AI input/history | “Câu hỏi quá dài hoặc chứa dữ liệu cấm” | user | self/auditor R | yêu cầu |
| context_json | TEXT | json_valid, NOT NULL | allowlisted context schema | hidden/history summary | `AI_CONTEXT_INVALID` | route filters/entity IDs | self/auditor R | context đã kiểm quyền |
| answer | TEXT | NOT NULL | string max configured | AI response | `AI_ANSWER_INVALID` | tool-grounded response | self/auditor R | trả lời |
| model_family | TEXT | NOT NULL | allowlist | read-only | `AI_MODEL_INVALID` | configured model | auditor R | trace model |
| created_at | TEXT | NOT NULL, indexed | datetime | history time | `AI_TIME_INVALID` | clock | self/auditor R | thời điểm |

AI log không có workflow; mọi tool lương đồng thời ghi sensitive access event. Không log full bank account, token hoặc raw legal profile ngoài field cần thiết.

## 19. `Salary Structure Assignment` — bridge ẩn tái sử dụng

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| employee | TEXT | FK Employee, NOT NULL | id | không render Lite | “Nhân viên assignment không hợp lệ” | Pay Profile | S write; O/P/A R nâng cao | liên kết nhân viên |
| company | TEXT | FK Company, NOT NULL | id | không render Lite | “Công ty assignment không khớp” | Pay Profile | S write; authorized R | scope |
| branch | TEXT | FK Branch, NOT NULL | id | không render Lite | “Nơi làm việc assignment không khớp” | Pay Profile | S write; authorized R | scope |
| department | TEXT | FK Department NULL trong trusted path | nullable id | không render Lite | không bắt buộc AlumDoor Lite | null/giữ legacy | generic HR R; Lite không ghi | tương thích, không phòng ban giả |
| salary_structure | TEXT | FK submitted, NOT NULL | id | không render Lite | “Thiếu cấu trúc lương nền” | Payroll Settings | S write; O/P/A R nâng cao | engine chuẩn |
| from_date | TEXT | date, NOT NULL | date | không render Lite | “Ngày hiệu lực assignment không hợp lệ” | Pay Profile from | S write; authorized R | đầu version |
| to_date | TEXT | date NULL | nullable date | không render Lite | “Ngày kết thúc assignment không hợp lệ” | Pay Profile to | S write; authorized R | cuối version |
| base_salary | INTEGER/VND | >0, NOT NULL | int positive | không render Lite | “Lương assignment không khớp Pay Profile” | Pay Profile base | S write; salary permission R | bridge lương |
| payroll_cost_center | TEXT | FK Cost Center, NOT NULL | id | settings advanced only | “Thiếu trung tâm chi phí lương” | Payroll Settings | S write; O/A R | posting tương lai |
| expense_account | TEXT | FK Account, NOT NULL | id | settings advanced only | “Thiếu tài khoản chi phí” | Payroll Settings | S write; O/A R | posting tương lai |
| payable_account | TEXT | FK Account, NOT NULL | id | settings advanced only | “Thiếu tài khoản phải trả” | Payroll Settings | S write; O/A R | posting tương lai |
| holiday_list | TEXT | FK Holiday List, NOT NULL | id | settings advanced only | “Thiếu lịch nghỉ” | Payroll Settings | S write; authorized R | ngày công chuẩn |
| payroll_rule | TEXT | FK VN Payroll Rule, NOT NULL | id | không render Lite | “Quy tắc lương không hiệu lực” | Legal Bundle payroll ref | S write; O/P/A R | engine pháp lý |
| statutory_inputs | TEXT/Table | child values | array input schema | không render raw | “Đầu vào luật lương không hợp lệ” | Legal/Pay Profile projection | S write; O/P/A R | input rule |
| workflow_state | TEXT | NOT NULL | enum Draft/Active/Cancelled | không render Lite | “Trạng thái assignment không hợp lệ” | coordinator | S action; authorized R | submitted authority |

State machine: coordinator tạo `Draft → Active`; version cũ có `to_date` và được thay thế; cancel chỉ khi chưa được kỳ finalized tham chiếu.

## 20. `Payroll Rule Input Value` — child Salary Structure Assignment

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| input_key | TEXT | unique parent, NOT NULL | legal input key enum | không render Lite | “Khóa đầu vào luật không hợp lệ” | rule schema | S write; O/P/A R audit | tên biến rule |
| value | TEXT | NOT NULL | schema theo input_key | không render raw | “Giá trị đầu vào luật không hợp lệ” | effective profiles/settings | S write; O/P/A R audit | giá trị versioned |

Child không có state; bất biến cùng Salary Structure Assignment Active.

## 21. `VN Payroll Rule` — nguồn rule tái sử dụng

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| rule_code | TEXT | UNIQUE, NOT NULL | id/code | link/read-only Lite | “Mã quy tắc không hợp lệ” | legal registry | legal admin RW; O/P/A R | ID rule |
| rule_name | TEXT | NOT NULL | string 3..140 | read-only | “Tên quy tắc bị thiếu” | registry | legal admin RW; O/P/A R | tên |
| effective_from | TEXT | date, NOT NULL | date | read-only | “Ngày hiệu lực rule không hợp lệ” | source | legal admin RW; O/P/A R | đầu hiệu lực |
| effective_to | TEXT | date NULL | nullable date | read-only | “Ngày hết hiệu lực rule không hợp lệ” | source | legal admin RW; O/P/A R | cuối hiệu lực |
| legal_document_no | TEXT | NOT NULL | max140 | external reference | “Thiếu số văn bản pháp lý” | source | legal admin RW; O/P/A R | căn cứ |
| source_url | TEXT | HTTPS, NOT NULL | url | external link | “Nguồn pháp lý không hợp lệ” | official source | legal admin RW; O/P/A R | tra cứu |
| formula_json | TEXT | json_valid, NOT NULL | payroll rule DSL schema | không render raw Lite | “Công thức rule không hợp lệ” | curated registry | legal admin RW; O/P/A audit R | máy tính |
| approved_by | TEXT | NOT NULL | identity id | timeline | “Thiếu người duyệt rule” | verifier | authorized R | trách nhiệm |
| approved_at | TEXT | datetime, NOT NULL | datetime | timeline | “Thiếu thời điểm duyệt rule” | clock | authorized R | audit |
| disabled | INTEGER | 0/1 | boolean | badge/action admin | “Rule đã ngừng áp dụng” | false | legal admin action; O/P/A R | hiệu lực sử dụng |

State logic hiện hữu: enabled/approved → disabled. Legal Bundle pin checksum để rule nguồn không được đổi âm thầm sau khi VERIFIED.

## 22. `VN Tax Ruleset` — nguồn PIT/Insurance tái sử dụng

| Field | D1 type | Constraint/index | Zod | UI control | Validate/error | Autofill | Permission | Business meaning |
|---|---|---|---|---|---|---|---|---|
| ruleset_code | TEXT | UNIQUE, NOT NULL | id/code | link/read-only Lite | “Mã ruleset không hợp lệ” | legal registry | Tax/Chief Accountant RW; O/P/A R | ID rule |
| rule_name | TEXT | NOT NULL | string 3..140 | read-only | “Tên ruleset bị thiếu” | registry | authorized R | tên |
| company | TEXT | FK Company, NOT NULL | id | read-only | “Ruleset sai công ty” | registry | authorized R | scope |
| rule_type | TEXT | NOT NULL | enum PIT/Insurance cho module | badge | “Module chỉ nhận PIT/Insurance” | source | authorized R | loại rule |
| taxpayer_segment | TEXT | NOT NULL | legal enum | read-only | “Sai đối tượng áp dụng” | source | authorized R | phạm vi |
| schema_version | INTEGER | >0 | int positive | read-only | “Phiên bản DSL không hợp lệ” | registry | authorized R | parser |
| effective_from | TEXT | date, NOT NULL | date | read-only | “Ngày hiệu lực không hợp lệ” | source | authorized R | đầu hiệu lực |
| effective_to | TEXT | date NULL | nullable date | read-only | “Ngày hết hiệu lực không hợp lệ” | source | authorized R | cuối hiệu lực |
| expression_json | TEXT | json_valid, NOT NULL | tax DSL schema | không render raw Lite | “Biểu thức thuế/bảo hiểm không hợp lệ” | curated registry | legal admin RW; O/P/A audit R | phép tính |
| test_vectors_json | TEXT | json_valid, NOT NULL | vector schema | test status/read-only | “Bộ ca kiểm thử không đạt” | curated registry | legal admin RW; O/P/A R | xác minh |
| legal_rule | TEXT | FK VN Legal Rule, NOT NULL | id | external reference | “Thiếu văn bản nguồn” | registry | authorized R | căn cứ |
| source_hash | TEXT | SHA-256, NOT NULL | 64 hex | read-only | “Hash ruleset không hợp lệ” | canonical payload | authorized R | chống sửa |
| tax_accounts_json | TEXT | json_valid | object schema | không render Lite | “Mapping tài khoản không hợp lệ” | `{}` for payroll compute-only | O/A R | posting tương lai |
| workflow_state | TEXT | NOT NULL | approved workflow enum | badge | “Ruleset chưa được duyệt” | workflow | Chief/Accounts Manager action; O/P/A R | chỉ submitted dùng |

State machine dùng workflow hiện hữu: draft/review → submitted/verified → cancelled/retired; Legal Bundle chỉ được pin record submitted còn hiệu lực.

## 23. Hạ tầng canonical không lặp ledger

Các bảng `mutation_guard`, `mutation_receipts`, `versions`, `outbox`, `naming_series` giữ nguyên schema trong migration nền. Module chỉ gọi qua Document Kernel/naming service, không thêm field hay write trực tiếp. Hợp đồng field thẩm quyền của chúng là:

| Bảng | Field được module cấp | Field server cấp | Bất biến |
|---|---|---|---|
| mutation_guard | command_id, expected_version, action, payload_hash | tenant/doc_key/created_at | một command/tenant |
| mutation_receipts | không ghi trực tiếp | actor,doctype,name,version,result,committed_at | replay cùng hash/actor |
| versions | không ghi trực tiếp | snapshot,actor,action,version,time | append-only history |
| outbox | domain event payload không nhạy cảm | event id/status/attempts/time | publish idempotent |
| naming_series | series key qua service | current value/time | atomic increment |

## 24. Kiểm tra Field Ledger

- [x] Mọi business DocType/table/child được Technical Design tạo hoặc mở rộng có ledger.
- [x] Mỗi field có đủ 9 cột: D1, constraint, Zod, UI, validate, autofill, quyền, nghiệp vụ.
- [x] Canonical envelope và child envelope được định nghĩa một lần, áp dụng cho mọi DocType.
- [x] Mọi field tiền là integer VND; engine dùng BigInt.
- [x] Mọi ngày/datetime có định dạng rõ.
- [x] Mọi Link kiểm tenant/scope ở server.
- [x] Field dẫn xuất/read-only được server tính lại, client không là nguồn thẩm quyền.
- [x] Mọi bảng có status đều có state machine ngay dưới bảng.
- [x] Không có department bắt buộc trong đường Lite.
- [x] Không có overtime multiplier trong calculation v2; rate snapshot khóa 50.000.
- [x] Không có manual deduction tự do.
- [x] Salary/bank/PIT/BHXH dùng projection theo quyền; không render placeholder dấu chấm.
- [x] Finalize/paid có version, hash, idempotency và audit.
- [x] Người dùng duyệt Field Ledger cùng Cổng 3 ngày 13/08/2026.
