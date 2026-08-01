# Field Ledger — lưu trữ vật lý dùng chung

Các bảng dưới đây đã tồn tại trong Forge và là lớp lưu chung cho logical DocType. Wave 1 không đổi tên hay nhân bản; ledger ghi rõ những cột mà mọi DocType thừa hưởng. Field payload của từng DocType nằm trong các ledger module tiếp theo.

## `documents`

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| tenant_id | TEXT | NOT NULL | PK component/index | tenant đã resolve, fail-closed | system/readonly | internal | immutable | lớp bảo vệ tenant kép |
| doc_key | TEXT | NOT NULL | UNIQUE tenant+doc_key | canonical doctype+name | system/readonly | internal | immutable | định danh vật lý aggregate |
| doctype | TEXT | NOT NULL | index | metadata đã cài | system/readonly | readable theo DocPerm | immutable | logical type |
| name | TEXT | NOT NULL | unique trong doctype | naming/counter policy | system/set-once | theo DocPerm | không đổi sau submit trừ rename được phép | mã chứng từ/bản ghi |
| owner | TEXT | NOT NULL | index/filter | user active | system/readonly | owner scope | immutable sau create | người tạo |
| docstatus | INTEGER | 0 | index | 0/1/2 | workflow/readonly | action permission | 0→1→2; không đi ngược | Frappe submit lifecycle |
| status | TEXT | NOT NULL | index | workflow state hợp lệ | workflow/readonly | theo DocPerm | chỉ action server đổi | trạng thái nghiệp vụ |
| version | INTEGER | 1 | optimistic key | tăng đúng một mỗi mutation | system/readonly | internal + response | monotonic | chống sửa đè |
| created_at | TEXT ISO | NOT NULL | index | server clock | system/readonly | readable theo record | immutable | thời điểm tạo |
| modified_at | TEXT ISO | NOT NULL | index | server clock | system/readonly | readable theo record | monotonic | thời điểm sửa |
| modified_by | TEXT | NOT NULL | link User | actor session | system/readonly | audit role | theo mutation | người sửa cuối |
| amended_from | TEXT | NULL | link same DocType | source cancelled/submitted | workflow/readonly | theo record | set once | truy amendment |
| payload_json | TEXT JSON | `{}` | JSON indexes/projections chọn lọc | Zod + Meta + domain invariant | mixed theo ledger DocType | field permission/mask | theo field/state | nội dung nghiệp vụ |

State machine chung: `Draft(docstatus=0) → Submitted(docstatus=1) → Cancelled(docstatus=2)`. DocType master không submittable giữ `docstatus=0` và dùng status riêng. Hard delete chỉ cho draft được policy cho phép; submitted/cancelled không hard delete.

## `document_children`

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| tenant_id | TEXT | NOT NULL | parent FK component | bằng parent tenant | system/readonly | kế thừa parent | immutable | tenant guard |
| parent_key | TEXT | NOT NULL | FK documents | parent tồn tại | system/readonly | kế thừa parent | cascade chỉ khi draft hard-delete hợp lệ | aggregate cha |
| fieldname | TEXT | NOT NULL | index | field Table trong parent Meta | system/readonly | field permission cha | immutable mỗi row | vị trí child table |
| child_doctype | TEXT | NOT NULL | metadata link | child kind=child_table | system/readonly | kế thừa parent | immutable | schema dòng con |
| row_id | TEXT | NOT NULL | UNIQUE parent+field+row | UUID/series | system/readonly | kế thừa parent | immutable | định danh row |
| idx | INTEGER | NOT NULL | ordered index | >=1, liền mạch khi save | user/server | kế thừa parent | reorder audit theo parent | thứ tự dòng |
| payload_json | TEXT JSON | `{}` | JSON projection khi cần | child Meta + domain invariant | mixed | field permission/mask | khóa theo parent state | nội dung dòng con |

## `gl_entries`

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| tenant_id | TEXT | NOT NULL | composite indexes | tenant đúng | system/readonly | Accounts/Auditor | append-only | tenant guard |
| voucher_type | TEXT | NOT NULL | index | DocType source hợp lệ | system/readonly | theo company scope | append-only | loại chứng từ |
| voucher_no | TEXT | NOT NULL | index | source submitted/posted | system/readonly | theo source | append-only | số chứng từ |
| voucher_revision | INTEGER | NOT NULL | unique slice | đúng aggregate version | system/readonly | internal | append-only | lần ghi sổ |
| posting_date | TEXT Date | NOT NULL | period index | period cho phép | system/readonly | Accounts | append-only | ngày sổ |
| company | TEXT | NOT NULL | Link Company/index | company active | system/readonly | company scope | append-only | pháp nhân |
| account | TEXT | NOT NULL | Link Account/index | active/effective/regime | formula/readonly | Accounts | append-only | tài khoản |
| debit_minor | INTEGER | 0 | balance query | >=0; không cùng credit | formula/readonly | amount mask policy | append-only | Nợ đơn vị nhỏ |
| credit_minor | INTEGER | 0 | balance query | >=0; không cùng debit | formula/readonly | amount mask policy | append-only | Có đơn vị nhỏ |
| dimensions_json | TEXT JSON | `{}` | projection | company/branch/cost center/project hợp lệ | formula/readonly | scope | append-only | chiều quản trị |
| source_document_id | TEXT | NOT NULL | link source | source tồn tại | system/readonly | trace permission | append-only | lineage nguồn |
| rule_trace | TEXT JSON | NOT NULL | evidence index | rule versions đã publish | formula/readonly | Accountant/Auditor | append-only | vì sao định khoản |
| approval_trace | TEXT JSON | NOT NULL | evidence index | approvals/SoD hợp lệ | workflow/readonly | Auditor | append-only | bằng chứng duyệt |

State machine: GL không có update/delete. Post tạo slice dương; reverse tạo slice đối dấu liên kết original; amendment tạo voucher revision mới. Invariant toàn slice: tổng `debit_minor = credit_minor`.

## `mutation_receipts`, audit và outbox

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| command_id | TEXT | NOT NULL | UNIQUE tenant+command | UUID/idempotency key | system/readonly | internal | immutable | chống chạy lặp |
| payload_hash | TEXT | NOT NULL | comparison | canonical SHA-256 | system/readonly | internal | immutable | phát hiện cùng key khác payload |
| aggregate_version | INTEGER | NOT NULL | link document version | phiên bản committed | system/readonly | internal | immutable | kết quả optimistic lock |
| result_json | TEXT JSON | NOT NULL | none | response schema | system/readonly | actor/admin support | immutable | replay response |
| actor_user_id | TEXT | NOT NULL | Link User/index | session actor | system/readonly | Auditor | immutable | ai thực hiện |
| correlation_id | TEXT | NOT NULL | trace index | request trace | system/readonly | support/auditor | immutable | nối log-audit-outbox |
| audit_before_after | TEXT JSON | redact nullable | audit index | no secret/raw XML | system/readonly | Auditor; masked | immutable/legal hold | bằng chứng thay đổi |
| outbox_status | TEXT | `pending` | retry index | pending/sent/failed/dead | system/readonly | Operator | action-only retry | giao thông báo/hook |

Outbox state: `pending → processing → sent`; lỗi tạm `processing → failed → pending`; quá retry `failed → dead`, chỉ Operator requeue có lý do. Audit/receipt bất biến.
