# Field Ledger — G02 HR, payroll và self-service

## Employee (external HRM — fields Wave 1 dùng)

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| employee_number | payload Data | series | unique company+number | `EMP-.#####` | system/readonly | HR; own read | immutable | mã nhân viên |
| employee_name | payload Data | NOT NULL | title/search | 1–160 | user/editable | HR; own read | editable while active | họ tên |
| user_id | payload Link User | NULL | unique | active, one Employee | link/set-once | HR Manager; own | unlink needs reason | self-service identity |
| company | payload Link Company | NOT NULL | scope index | active | link/set-once | HR Manager | transfer workflow only | pháp nhân |
| branch | payload Link Branch | NOT NULL | scope index | same company | link/editable via transfer | HR Manager | effective-dated transfer | chi nhánh |
| department | payload Link Department | NOT NULL | scope index | same branch/company | link/editable via transfer | HR Manager | effective-dated transfer | phòng ban |
| manager_employee | payload Link Employee | NULL | hierarchy index | active, no manager cycle | link/editable | HR Manager | effective-dated | quản lý trực tiếp |
| tax_code | payload Data | NULL | lookup | VN tax id validator | user/editable | permlevel 1, masked | recent-auth for unmask | MST cá nhân |
| bank_account | payload Data | NULL | none | account format/provider rule | user/editable | permlevel 1, masked | audit every unmask/change | tài khoản nhận lương |
| insurance_number | payload Data | NULL | lookup | VN insurance rule version | user/editable | permlevel 1, masked | audit | mã bảo hiểm |
| status | payload Select | Active | index | Active/On Leave/Left/Disabled | workflow/readonly | HR Manager | Active↔On Leave; Active→Left→Disabled | vòng đời nhân sự |

## Employment Contract

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| contract_number | payload Data | series | unique company | legal series | system/readonly | HR/employee own | immutable | số hợp đồng |
| employee | payload Link Employee | NOT NULL | interval index | active/in scope | link/set-once | HR; own read | immutable after approve | nhân viên |
| contract_type | payload Select | NOT NULL | filter | registry/master | user/set-once | HR Manager | locked after approve | loại HĐ |
| from_date | payload Date | NOT NULL | interval index | <= to | user/set-once | HR Manager | immutable after approve | hiệu lực từ |
| to_date | payload Date | NULL | interval index | no illegal overlap | user/set-once | HR Manager | extension via amendment | hiệu lực đến |
| salary_basis_minor | payload Currency | NULL | payroll input | >=0 | user/editable | Payroll Manager, masked | immutable after approve; new amendment | cơ sở lương |
| document_file | payload Attach | NULL | R2 link | private, MIME/size | user/editable | HR/own read | versioned | bản hợp đồng |
| status | payload Select | Draft | index | Draft/Review/Approved/Active/Expired/Terminated | workflow/readonly | HR Manager | Draft→Review→Approved→Active→Expired; Active→Terminated | vòng đời |

## Attendance

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| employee | payload Link Employee | NOT NULL | unique employee+date | active/in scope | link/set-once | own/HR | locked after approve | nhân viên |
| attendance_date | payload Date | NOT NULL | unique/index | valid employment date | user/set-once | own/HR | locked after approve | ngày công |
| shift_assignment | payload Link Shift Assignment | NULL | FK | effective on date | formula/readonly | own/HR | recompute before approve | ca nguồn |
| attendance_status | payload Select | Present | index | Present/Absent/Half Day/On Leave/Remote | user/editable | HR/manager | locked after approve | trạng thái |
| working_minutes | payload Int | 0 | payroll aggregate | 0..policy max | formula/readonly | own/HR/payroll | immutable after approve | phút làm việc |
| source | payload Select | Manual | filter | Manual/Device/Import/Correction | system/readonly | HR | immutable | nguồn dữ liệu |
| status | payload Select | Draft | index | Draft/Pending/Approved/Rejected/Corrected | workflow/readonly | manager/HR | Draft→Pending→Approved/Rejected; Approved→Corrected via new record/ref | duyệt |

## Leave Application

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| employee | payload Link Employee | NOT NULL | scope index | own or HR-authorized | link/set-once | own/HR/manager | immutable after submit | người nghỉ |
| leave_type | payload Link Leave Type | NOT NULL | balance index | active policy | link/set-once | own/HR | immutable after submit | loại phép |
| from_date | payload Date | NOT NULL | calendar index | <= to, employment date | user/set-once | own/HR | immutable after submit | từ ngày |
| to_date | payload Date | NOT NULL | calendar index | no overlap approved | user/set-once | own/HR | immutable after submit | đến ngày |
| total_days | payload Float | 0 | balance | calendar/half-day formula | formula/readonly | own/HR/manager | frozen on approval | số ngày |
| reason | payload Small Text | NOT NULL | none | 3–500 | user/editable | own/approver/HR | locked after submit | lý do |
| approver | payload Link User | NULL | inbox index | manager tree/delegation | workflow/readonly | own/HR/approver | recalculated if doc version changes | người duyệt |
| status | payload Select | Draft | index | Draft/Pending/Approved/Rejected/Cancelled | workflow/readonly | action-specific | Draft→Pending→Approved/Rejected; Pending/Approved→Cancelled policy | vòng đời |

## Shift Assignment

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| employee | payload Link Employee | NOT NULL | interval index | active/in scope | link/set-once | HR | immutable after approve | nhân viên |
| shift_type | payload Link Shift Type | NOT NULL | interval index | active | link/set-once | HR | immutable after approve | loại ca |
| start_date | payload Date | NOT NULL | calendar index | <= end | user/set-once | HR | immutable after approve | bắt đầu |
| end_date | payload Date | NULL | calendar index | no overlap | user/set-once | HR | amendment to change | kết thúc |
| branch | payload Link Branch | NOT NULL | scope index | employee branch/effective transfer | formula/readonly | HR | frozen per assignment | chi nhánh |
| status | payload Select | Draft | index | Draft/Approved/Active/Ended/Cancelled | workflow/readonly | HR Manager | Draft→Approved→Active→Ended; Draft/Approved→Cancelled | vòng đời |

## Salary Structure Assignment

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| employee | payload Link Employee | NOT NULL | unique employee+from | active | link/set-once | Payroll | immutable after approve | nhân viên |
| salary_structure | payload Link Salary Structure | NOT NULL | FK | active | link/set-once | Payroll | immutable after approve | cấu trúc lương |
| payroll_rule | payload Link VN Payroll Rule | NOT NULL | effective index | approved/effective | link/set-once | Payroll Manager | immutable after approve | phiên bản công thức |
| effective_from | payload Date | NOT NULL | interval index | no overlap | user/set-once | Payroll Manager | immutable | hiệu lực |
| base_minor | payload Currency | 0 | payroll input | >=0 | user/editable | permlevel 1, masked | locked after approve | lương cơ sở |
| dimensions_json | payload JSON | `{}` | account mapping | company/branch/cost center valid | link/formula | Payroll/Accountant | locked after approve | chiều kế toán |
| status | payload Select | Draft | index | Draft/Approved/Active/Superseded | workflow/readonly | Payroll Manager | Draft→Approved→Active→Superseded | vòng đời |

## Payroll Entry (external HRM — fields Wave 1 dùng)

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| payroll_code | payload Data | series | unique | `PAY-.YYYYMM.-.#####` | system/readonly | Payroll | immutable | mã đợt |
| company | payload Link Company | NOT NULL | scope index | active | link/set-once | Payroll | immutable after preview | pháp nhân |
| branch | payload Link Branch | NULL | scope index | same company | link/set-once | Payroll | immutable after preview | chi nhánh |
| start_date | payload Date | NOT NULL | unique scope+period | <= end | user/set-once | Payroll | immutable after preview | đầu kỳ |
| end_date | payload Date | NOT NULL | unique scope+period | period open | user/set-once | Payroll | immutable after preview | cuối kỳ |
| input_hash | payload Data | NULL | unique run fingerprint | canonical SHA-256 | system/readonly | Payroll/Auditor | changes invalidate run | dấu đầu vào |
| gross_minor | payload Currency | 0 | aggregate | sum slips | formula/readonly | Payroll/Chief, masked | immutable after approve | tổng gross |
| deduction_minor | payload Currency | 0 | aggregate | sum slips | formula/readonly | Payroll/Chief, masked | immutable after approve | tổng khấu trừ |
| net_minor | payload Currency | 0 | aggregate | gross-deduction | formula/readonly | Payroll/Chief, masked | immutable after approve | tổng net |
| status | payload Select | Draft | index | Draft/Previewed/Verified/Approved/Posted/Cancelled/Invalidated | workflow/readonly | action-specific | Draft→Previewed→Verified→Approved→Posted; input change→Invalidated | vòng đời |

## Salary Slip (external HRM — fields Wave 1 dùng)

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| employee | payload Link Employee | NOT NULL | unique payroll+employee | in payroll scope | system/readonly | own/payroll | immutable | nhân viên |
| payroll_entry | payload Link Payroll Entry | NOT NULL | unique component | valid run | system/readonly | own/payroll | immutable | đợt lương |
| input_hash | payload Data | NOT NULL | fingerprint | employee input slice hash | system/readonly | Payroll/Auditor | immutable per calculation | dấu đầu vào |
| gross_minor | payload Currency | 0 | aggregate | component sum | formula/readonly | own/payroll, masked | immutable after verify | gross |
| deduction_minor | payload Currency | 0 | aggregate | component sum | formula/readonly | own/payroll, masked | immutable after verify | khấu trừ |
| net_minor | payload Currency | 0 | aggregate | gross-deduction | formula/readonly | own/payroll, masked | immutable after verify | thực lĩnh |
| rule_trace | payload JSON | `{}` | evidence | payroll/tax/insurance versions | formula/readonly | own/payroll/auditor | immutable after verify | giải thích lương |
| status | payload Select | Draft | index | Draft/Verified/Approved/Posted/Cancelled/Invalidated | workflow/readonly | action-specific | Draft→Verified→Approved→Posted; source change→Invalidated | vòng đời |

## Payroll Accounting Batch

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| batch_code | payload Data | series | unique | `PAY-GL-.YYYYMM.-.#####` | system/readonly | Payroll/Accounts | immutable | mã bridge |
| payroll_entry | payload Link Payroll Entry | NOT NULL | unique effective | approved payroll | link/set-once | Accountant | immutable | nguồn payroll |
| journal_entry | payload Link Journal Entry | NULL | unique effective | balanced JE | system/readonly | Accountant/Chief | set on preview/post | chứng từ GL |
| account_mapping_json | payload JSON | `{}` | mapping hash | active/effective accounts/dimensions | formula/readonly | Accountant/Auditor | immutable after verify | mapping |
| rule_trace | payload JSON | `{}` | evidence | rule versions | formula/readonly | Accountant/Auditor | immutable after verify | dấu rule |
| debit_minor | payload Currency | 0 | balance | >=0 | formula/readonly | Accounts | immutable | tổng Nợ |
| credit_minor | payload Currency | 0 | balance | equals debit | formula/readonly | Accounts | immutable | tổng Có |
| status | payload Select | Draft | index | Draft/Previewed/Verified/Posted/Reversed/Failed | workflow/readonly | action-specific | Draft→Previewed→Verified→Posted; Posted→Reversed | vòng đời |

## Employee Advance

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| advance_code | payload Data | series | unique | `ADV-.YYYY.-.#####` | system/readonly | own/HR/Accounts | immutable | mã tạm ứng |
| employee | payload Link Employee | NOT NULL | scope index | own/in scope | link/set-once | own/HR | immutable after submit | người nhận |
| request_date | payload Date | today | index | employment active | default/set-once | own/HR | immutable after submit | ngày yêu cầu |
| amount_minor | payload Currency | NOT NULL | limit query | >0, policy limit | user/set-once | own/approver/Accounts, masked | immutable after approve | số tiền |
| purpose | payload Small Text | NOT NULL | search | 3–500 | user/editable | own/approver/Accounts | locked after submit | mục đích |
| settlement_type | payload Select | NULL | filter | Expense/Payroll/Payment/Return | user/editable | Accountant | locked after settle | cách tất toán |
| settlement_ref | payload Dynamic Link | NULL | unique allocation | required to settle, not reused | link/set-once | Accountant | immutable after settle | chứng từ tất toán |
| status | payload Select | Draft | index | Draft/Pending/Approved/Paid/Partly Settled/Settled/Rejected/Cancelled | workflow/readonly | action-specific | Draft→Pending→Approved→Paid→Partly Settled→Settled; Pending→Rejected | vòng đời |

## State machines G02

- Employee: `Active ↔ On Leave`; `Active → Left → Disabled`. Chuyển công tác là assignment hiệu lực, không sửa lịch sử.
- Contract: `Draft → Review → Approved → Active → Expired`; chấm dứt `Active → Terminated` cần lý do/evidence.
- Attendance/Leave: draft/pending/approved/rejected; correction/cancel tạo timeline và không làm mất bản đã dùng cho payroll.
- Payroll: `Draft → Previewed → Verified → Approved → Posted`; input hash đổi ở bất kỳ bước chưa post → `Invalidated`. Sau post sửa bằng reversal/rerun version mới.
- Employee Advance: chỉ settlement có chứng từ tham chiếu được chuyển `Settled`; không tất toán hai lần.
