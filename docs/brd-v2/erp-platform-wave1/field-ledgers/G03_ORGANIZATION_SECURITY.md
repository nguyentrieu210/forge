# Field Ledger — G03 Organization, Security & SoD

## Company (external/core — fields Wave 1 dùng)

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| company_code | payload Data | NOT NULL | unique tenant | 2–20 uppercase-safe | user/set-once | Owner | không đổi sau GL | mã pháp nhân |
| company_name | payload Data | NOT NULL | search/title | 1–160 ký tự | user/editable | Owner | active mới giao dịch | tên pháp lý |
| tax_id | payload Data | NULL | unique khi có | validator MST VN | user/set-once | Owner recent-auth; mask role thấp | đổi cần co-approval | mã số thuế |
| default_currency | payload Link Currency | VND | FK external | ISO, currency active | user/set-once | Chief Accountant | khóa sau GL | đồng tiền sổ |
| fiscal_year_start | payload Date | NOT NULL | rule selection index | ngày đầu FY | user/set-once | Chief Accountant | đổi chỉ qua migration | chọn chế độ/rule |
| organization_status | payload Select | Draft | filter | Draft/Active/Disabled | workflow/readonly | Owner | Draft→Active→Disabled; có thể re-enable có lý do | hiệu lực pháp nhân |

## Branch (external HRM — fields Wave 1 dùng)

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| branch_code | payload Data | NOT NULL | unique company+code | 2–20 ký tự | user/set-once | Owner/HR Manager | khóa sau giao dịch | mã chi nhánh |
| branch_name | payload Data | NOT NULL | search/title | 1–160 | user/editable | Owner/HR Manager | active/disabled | tên chi nhánh |
| company | payload Link Company | NOT NULL | FK/index | active company | link/set-once | Owner | không đổi sau phát sinh | pháp nhân cha |
| accounting_model | payload Select | Dependent | index | Dependent/Accounting Unit | user/set-once | Owner + Chief | đổi cần migration | mô hình hạch toán |
| cost_center | payload Link Cost Center | NULL | FK | cùng company | link/editable | Accountant | required khi active theo model | trung tâm chi phí mặc định |
| status | payload Select | Active | filter | Active/Disabled | workflow/readonly | Owner/HR Manager | Active↔Disabled có lý do; không disable khi còn giao dịch mở | hiệu lực |

## Department (external HRM/tree — fields Wave 1 dùng)

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| department_code | payload Data | NOT NULL | unique company+code | 2–30 ký tự | user/set-once | HR Manager | khóa khi active | mã phòng ban |
| department_name | payload Data | NOT NULL | title/search | 1–160 | user/editable | HR Manager | active/disabled | tên phòng ban |
| company | payload Link Company | NOT NULL | FK/index | active | link/set-once | HR Manager | immutable | pháp nhân |
| branch | payload Link Branch | NOT NULL | FK/index | cùng company | link/set-once | HR Manager | chuyển cần migration duyệt | chi nhánh |
| parent_department | payload Link Department | NULL | tree index | cùng branch; không cycle | link/editable | HR Manager | move node audit | cha |
| manager_employee | payload Link Employee | NULL | FK | active, cùng scope | link/editable | HR Manager | effective theo assignment | trưởng phòng |
| status | payload Select | Active | filter | Active/Disabled | workflow/readonly | HR Manager | không disable khi còn employee active | hiệu lực |

## Organization Assignment

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| assignment_code | payload Data | series | unique | `ORG-ASG-.YYYY.-.#####` | system/readonly | System Manager | immutable | mã gán |
| user | payload Link User | NOT NULL | index | user active | user/set-once | System Manager | immutable after publish | người được gán |
| company | payload Link Company | NOT NULL | scope index | active | link/set-once | System Manager | immutable after publish | scope pháp nhân |
| branch | payload Link Branch | NULL | scope index | thuộc company | link/set-once | System Manager | immutable after publish | scope chi nhánh |
| department | payload Link Department | NULL | scope index | thuộc branch/company | link/set-once | System Manager | immutable after publish | scope phòng ban |
| effective_from | payload Date | NOT NULL | interval index | <= effective_to | user/set-once | System Manager | immutable after publish | bắt đầu |
| effective_to | payload Date | NULL | interval index | >= from | user/editable before publish | System Manager | retire sets date | kết thúc |
| status | payload Select | Draft | filter | Draft/Published/Retired | workflow/readonly | System Manager/Owner | Draft→Published→Retired | hiệu lực assignment |

## Role Policy

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| policy_code | payload Data | series | unique | `ROLE-POL-.#####` | system/readonly | System Manager | immutable | mã policy |
| version_no | payload Int | 1 | unique code+version | >0 monotonic | system/readonly | all authorized | immutable | phiên bản |
| role | payload Link Role | NOT NULL | index | role đã cài | link/set-once | System Manager | immutable after publish | role nền |
| resource | payload Data | NOT NULL | action index | DocType/report/action registry | user/set-once | System Manager | immutable after publish | tài nguyên |
| actions_json | payload JSON | `[]` | none | action whitelist | user/editable | System Manager | locked after publish | quyền hành động |
| row_rule_json | payload JSON | `{}` | compiled cache | DSL whitelist, bind only | user/editable | System Manager/Auditor | locked after publish | điều kiện thu hẹp |
| field_rule_json | payload JSON | `{}` | none | permlevel/mask only | user/editable | System Manager/Auditor | locked after publish | quyền trường |
| status | payload Select | Draft | index | Draft/Review/Published/Retired | workflow/readonly | Owner publishes | Draft→Review→Published→Retired; Review→Draft có lý do | vòng đời policy |

## SoD Rule

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| rule_code | payload Data | series | unique | `SOD-.#####` | system/readonly | Auditor/System Manager | immutable | mã rule |
| left_action | payload Data | NOT NULL | conflict index | action registry | user/set-once | Auditor | locked after publish | hành động trái |
| right_action | payload Data | NOT NULL | conflict index | khác left, registry | user/set-once | Auditor | locked after publish | hành động phải |
| document_type | payload Link DocType | NULL | index | installed doctype | link/set-once | Auditor | locked after publish | phạm vi loại chứng từ |
| severity | payload Select | Block | index | Block/Warn | user/editable | Auditor | locked after publish | cưỡng chế |
| reason | payload Small Text | NOT NULL | none | 5–500 ký tự | user/editable | Auditor | immutable after publish | giải thích |
| status | payload Select | Draft | index | Draft/Published/Retired | workflow/readonly | Owner publishes | Draft→Published→Retired | hiệu lực |

## Approval Policy

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| policy_code | payload Data | series | unique | `APR-POL-.#####` | system/readonly | Owner/domain manager | immutable | mã |
| document_type | payload Link DocType | NOT NULL | index | installed | link/set-once | Owner/domain manager | locked after publish | loại chứng từ |
| condition_json | payload JSON | `{}` | compiled index | field/amount whitelist | user/editable | domain manager | locked after publish | điều kiện |
| steps_json | payload JSON | `[]` | none | >=1 step, role/actor resolvable | user/editable | domain manager | locked after publish | cấp duyệt |
| require_sod | payload Check | true | none | boolean | user/editable | Owner | locked after publish | tách người |
| effective_from | payload Date | NOT NULL | interval index | no overlap published | user/set-once | Owner | immutable after publish | hiệu lực |
| status | payload Select | Draft | index | Draft/Review/Published/Retired | workflow/readonly | Owner publishes | Draft→Review→Published→Retired | vòng đời |

## Delegation

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| delegation_code | payload Data | series | unique | `DLG-.#####` | system/readonly | grantor/manager | immutable | mã |
| grantor | payload Link User | NOT NULL | index | active | link/set-once | own/manager | immutable | người ủy quyền |
| grantee | payload Link User | NOT NULL | index | active, khác grantor | link/set-once | own/manager | immutable | người nhận |
| action_scope_json | payload JSON | `[]` | none | subset effective permissions | user/set-once | grantor/manager | locked after activate | phạm vi action |
| organization_scope_json | payload JSON | `{}` | scope index | subset org scope | user/set-once | grantor/manager | locked after activate | phạm vi tổ chức |
| effective_from | payload Datetime | NOT NULL | interval index | < to | user/set-once | grantor/manager | immutable | bắt đầu |
| effective_to | payload Datetime | NOT NULL | interval index | policy bounded | user/set-once | grantor/manager | immutable | kết thúc |
| status | payload Select | Draft | index | Draft/Active/Expired/Revoked | workflow/readonly | grantor/manager | Draft→Active→Expired; Active→Revoked có lý do | vòng đời |

## Audit Event (virtual/system view)

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| event_id | audit projection Data | NOT NULL | unique | ULID/UUID | system/readonly | Auditor | immutable | sự kiện |
| correlation_id | audit projection Data | NOT NULL | index | trace id | system/readonly | Auditor/Support | immutable | nối chuỗi |
| actor | audit projection Link User | NOT NULL | index | actor đã xác thực/system | system/readonly | Auditor; masked exports | immutable | người/máy |
| action | audit projection Data | NOT NULL | index | action registry | system/readonly | Auditor | immutable | hành động |
| entity_type | audit projection Data | NOT NULL | index | doctype/action target | system/readonly | Auditor | immutable | loại đối tượng |
| entity_name | audit projection Data | NOT NULL | index | target id | system/readonly | scope-filtered | immutable | bản ghi |
| before_json | audit projection JSON | NULL | none | redact secrets | system/readonly | Auditor mask | immutable/legal hold | trước |
| after_json | audit projection JSON | NULL | none | redact secrets | system/readonly | Auditor mask | immutable/legal hold | sau |
| occurred_at | audit projection Datetime | NOT NULL | time index | server time | system/readonly | Auditor | immutable | thời điểm |

## State machines G03

- Organization Assignment: `Draft → Published → Retired`; publish yêu cầu scope-subset, retire không xóa lịch sử.
- Role/Approval Policy: `Draft → Review → Published → Retired`; `Review → Draft` cần lý do; chỉ một version published/effective trên cùng scope.
- SoD Rule: `Draft → Published → Retired`.
- Delegation: `Draft → Active → Expired`; `Active → Revoked` cần lý do và có hiệu lực ngay; hết hạn theo server clock.
- Company/Branch/Department: `Active ↔ Disabled` có lý do; các blocker phụ thuộc phải bằng 0 trước disable.
