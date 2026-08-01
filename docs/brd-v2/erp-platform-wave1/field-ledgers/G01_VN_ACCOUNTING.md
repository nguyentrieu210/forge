# Field Ledger — G01 Kế toán Việt Nam/TT99

## VN Accounting Policy

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| company | payload Link Company | NOT NULL | unique company+fiscal start | active company | link/set-once | Chief Accountant | locked after publish | pháp nhân |
| fiscal_year_start | payload Date | NOT NULL | effective index | first day of FY | user/set-once | Chief Accountant | immutable after publish | chọn luật theo năm |
| regime | payload Select | NOT NULL | index | TT99/TT133/TT132/TT152/Legacy/OtherVersioned | user/set-once | Chief Accountant | legal sign-off required | chế độ kế toán |
| vat_method | payload Select | NOT NULL | index | Deduction/Direct/VersionedOther | user/editable | Tax Specialist | separate tax sign-off | phương pháp VAT |
| legal_rule | payload Link VN Legal Rule | NOT NULL | FK | approved/effective on FY start | link/set-once | Chief/Tax | locked after publish | nguồn pháp lý |
| need_legal_check | payload Check | true | blocker index | system derived | system/readonly | Accountant/Auditor | must be false to publish/post | cổng pháp lý |
| approval_trace | payload JSON | `{}` | evidence | signer + time + rule version | workflow/readonly | Auditor | immutable after publish | bằng chứng duyệt |
| status | payload Select | Draft | index | Draft/Review/Published/Superseded | workflow/readonly | Chief + signer | Draft→Review→Published→Superseded | vòng đời |

## VN Legal Rule

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| rule_code | payload Data | series | unique | `VN-LAW-.#####` | system/readonly | Tax Specialist | immutable | mã nội bộ |
| document_no | payload Data | NOT NULL | source index | 1–80 ký tự | user/set-once | Tax Specialist | locked after publish | số văn bản |
| source_url | payload Data | NOT NULL | evidence | HTTPS/official registry policy | user/set-once | Tax Specialist/Auditor | locked after publish | nguồn kiểm chứng |
| effective_from | payload Date | NOT NULL | interval index | <= effective_to | user/set-once | Tax Specialist | immutable after publish | bắt đầu |
| effective_to | payload Date | NULL | interval index | >= from | user/set-once | Tax Specialist | supersession-controlled | kết thúc |
| taxpayer_segment | payload Data | NOT NULL | scope index | registry value | user/set-once | Tax Specialist | immutable after publish | đối tượng áp dụng |
| rule_domain | payload Select | NOT NULL | index | Accounting/VAT/CIT/PIT/EInvoice/XML/Insurance | user/set-once | Tax Specialist | domains independent | miền pháp lý |
| form_version | payload Data | NULL | index | version registry | user/set-once | Tax Specialist | immutable after publish | phiên bản biểu mẫu |
| xml_schema_version | payload Data | NULL | index | connector/schema registry | user/set-once | Tax Specialist | immutable after publish | phiên bản XML |
| supersedes_rule | payload Link VN Legal Rule | NULL | lineage index | same domain/scope | link/set-once | Tax Specialist | set on publish | văn bản thay thế |
| status | payload Select | Draft | index | Draft/Review/Approved/Effective/Superseded | workflow/readonly | legal signer | Draft→Review→Approved→Effective→Superseded | vòng đời |

## TT99 Account Map

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| map_code | payload Data | series | unique | `TT99-ACC-.#####` | system/readonly | Accountant | immutable | mã mapping |
| company | payload Link Company | NOT NULL | scope index | active | link/set-once | Chief Accountant | immutable after publish | pháp nhân |
| source_regime | payload Data | NOT NULL | index | versioned regime | user/set-once | Chief Accountant | immutable after publish | chế độ nguồn |
| source_account | payload Link Account | NOT NULL | mapping unique | account exists | link/set-once | Chief Accountant | immutable after publish | tài khoản nguồn |
| target_account | payload Link Account | NOT NULL | mapping unique | TT99 valid/effective | link/set-once | Chief Accountant | immutable after publish | tài khoản đích |
| effective_from | payload Date | NOT NULL | interval index | fiscal boundary | user/set-once | Chief Accountant | immutable | hiệu lực |
| mapping_reason | payload Small Text | NOT NULL | evidence | 5–500 ký tự | user/editable | Chief/Auditor | locked after publish | giải thích |
| status | payload Select | Draft | index | Draft/Tested/Published/Retired | workflow/readonly | Chief + reviewer | Draft→Tested→Published→Retired | vòng đời |

## TT99 Voucher Form

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| form_code | payload Data | NOT NULL | unique version+code | Appendix I registry | user/set-once | Chief Accountant | immutable after publish | mã mẫu chứng từ |
| label | payload Data | NOT NULL | title/search | 1–160 | user/editable | Accountant | locked after publish | tên mẫu |
| legal_rule | payload Link VN Legal Rule | NOT NULL | FK | accounting domain approved | link/set-once | Chief Accountant | immutable | nguồn TT99 |
| document_type | payload Link DocType | NOT NULL | renderer index | installed DocType | link/set-once | Chief Accountant | immutable after publish | chứng từ áp dụng |
| template_version | payload Data | NOT NULL | unique form+version | semver/date version | user/set-once | Chief Accountant | immutable | phiên bản |
| template_json | payload JSON | NOT NULL | R2/template hash | print schema whitelist | user/editable | Chief Accountant | locked after publish | bố cục dữ liệu |
| effective_from | payload Date | NOT NULL | interval index | no overlap published | user/set-once | Chief Accountant | immutable | hiệu lực |
| status | payload Select | Draft | index | Draft/Tested/Published/Superseded | workflow/readonly | Chief + legal signer | Draft→Tested→Published→Superseded | vòng đời |

## TT99 Book Form

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| book_code | payload Data | NOT NULL | unique version+code | Appendix III registry | user/set-once | Chief Accountant | immutable | mã sổ |
| label | payload Data | NOT NULL | title | 1–160 | user/editable | Accountant | locked after publish | tên sổ |
| legal_rule | payload Link VN Legal Rule | NOT NULL | FK | approved/effective | link/set-once | Chief Accountant | immutable | nguồn |
| source_ledger | payload Select | NOT NULL | report registry | GL/AR/AP/Bank/Stock/Asset/Payroll | user/set-once | Chief Accountant | immutable | sổ nguồn |
| columns_json | payload JSON | NOT NULL | report hash | field/expression whitelist | user/editable | Chief Accountant | locked after publish | cột sổ |
| grouping_json | payload JSON | `{}` | none | dimension whitelist | user/editable | Chief Accountant | locked after publish | nhóm/tổng |
| effective_from | payload Date | NOT NULL | interval index | no overlap | user/set-once | Chief Accountant | immutable | hiệu lực |
| status | payload Select | Draft | index | Draft/Tested/Published/Superseded | workflow/readonly | Chief + signer | Draft→Tested→Published→Superseded | vòng đời |

## TT99 Financial Statement Template

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| statement_code | payload Data | NOT NULL | unique version+code | Appendix IV registry | user/set-once | Chief Accountant | immutable | mã BCTC |
| label | payload Data | NOT NULL | title | 1–160 | user/editable | Accountant | locked after publish | tên báo cáo |
| legal_rule | payload Link VN Legal Rule | NOT NULL | FK | approved/effective | link/set-once | Chief Accountant | immutable | nguồn |
| lines_json | payload JSON | NOT NULL | template hash | account/formula whitelist; no eval | user/editable | Chief Accountant | locked after publish | chỉ tiêu/công thức |
| comparative_policy | payload Select | PriorPeriod | none | PriorPeriod/PriorYear/None | user/editable | Chief Accountant | locked after publish | số so sánh |
| currency_policy | payload Select | Company | none | Company/Presentation | user/editable | Chief Accountant | locked after publish | đơn vị tiền |
| effective_from | payload Date | NOT NULL | interval index | no overlap | user/set-once | Chief Accountant | immutable | hiệu lực |
| status | payload Select | Draft | index | Draft/Tested/Published/Superseded | workflow/readonly | Chief + signer | Draft→Tested→Published→Superseded | vòng đời |

## TT99 Transition Map

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| transition_code | payload Data | series | unique | `TT99-TR-.#####` | system/readonly | Chief Accountant | immutable | mã chuyển đổi |
| company | payload Link Company | NOT NULL | scope index | active | link/set-once | Chief Accountant | immutable | pháp nhân |
| fiscal_year_start | payload Date | NOT NULL | unique company+FY | FY boundary | user/set-once | Chief Accountant | immutable | năm áp dụng |
| source_policy | payload Link VN Accounting Policy | NOT NULL | FK | previous effective | link/set-once | Chief Accountant | immutable | chính sách cũ |
| target_policy | payload Link VN Accounting Policy | NOT NULL | FK | TT99 published | link/set-once | Chief Accountant | immutable | chính sách mới |
| mapping_set_hash | payload Data | NOT NULL | evidence | hash account/form/report mappings | formula/readonly | Auditor | immutable after preview | bộ chuyển đổi |
| preview_result_json | payload JSON | `{}` | evidence | balance/check schema | system/readonly | Accountant/Auditor | replaced only by rerun in Draft | kết quả thử |
| status | payload Select | Draft | index | Draft/Previewed/Approved/Applied/Failed | workflow/readonly | Chief + Auditor | Draft→Previewed→Approved→Applied; preview/apply→Failed | vòng đời |

## VN Accounting Period

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| period_code | payload Data | series | unique | company/year/period | system/readonly | Accountant | immutable | mã kỳ |
| company | payload Link Company | NOT NULL | interval index | active | link/set-once | Chief Accountant | immutable | pháp nhân |
| branch | payload Link Branch | NULL | interval index | same company | link/set-once | Chief Accountant | immutable | scope chi nhánh |
| from_date | payload Date | NOT NULL | interval index | <= to, non-overlap | user/set-once | Chief Accountant | immutable | từ ngày |
| to_date | payload Date | NOT NULL | interval index | >= from | user/set-once | Chief Accountant | immutable | đến ngày |
| close_check_json | payload JSON | `{}` | evidence | checklist schema | system/readonly | Chief/Auditor | refresh before transition | kết quả khóa |
| reopen_until | payload Datetime | NULL | timebox index | only Reopened, future | workflow/readonly | Owner/Auditor | auto relock | hạn mở lại |
| status | payload Select | Open | index | Open/Soft Closed/Hard Locked/Reopened | workflow/readonly | action-specific | Open→Soft Closed→Hard Locked; Hard Locked→Reopened→Hard Locked | trạng thái kỳ |

## Journal Entry (external Accounts — fields Wave 1 dùng)

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| company | payload Link Company | NOT NULL | scope index | active | link/set-once | Accountant | immutable after submit | pháp nhân |
| branch | payload Link Branch | NULL | scope index | same company | link/set-once | Accountant | immutable after submit | chi nhánh |
| posting_date | payload Date | NOT NULL | period index | period permits action | user/set-once | Accountant | immutable after submit | ngày sổ |
| source_document_type | payload Link DocType | NULL | lineage | installed | link/set-once | Accountant/system | immutable after submit | loại nguồn |
| source_document_name | payload Dynamic Link | NULL | lineage | source exists/authorized | link/set-once | Accountant/system | immutable after submit | chứng từ nguồn |
| total_debit_minor | payload Currency | 0 | balance | system sum >=0 | formula/readonly | Accounts | immutable | tổng Nợ |
| total_credit_minor | payload Currency | 0 | balance | equal debit | formula/readonly | Accounts | immutable | tổng Có |
| rule_trace | payload JSON | `{}` | evidence | rule versions valid | formula/readonly | Accountant/Auditor | immutable after submit | dấu vết rule |
| approval_trace | payload JSON | `{}` | evidence | workflow/SoD valid | workflow/readonly | Auditor | immutable after submit | dấu vết duyệt |
| status | payload Select | Draft | index | Draft/Pending/Approved/Posted/Cancelled/Reversed | workflow/readonly | action-specific | Draft→Pending→Approved→Posted; Posted→Reversed; Draft/Pending→Cancelled | vòng đời |

## Tax Ruleset

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| ruleset_code | payload Data | series | unique | `TAX-RULE-.#####` | system/readonly | Tax Specialist | immutable | mã |
| rule_type | payload Select | NOT NULL | scope index | VAT/CIT/PIT/Insurance/EInvoice/XML | user/set-once | Tax Specialist | immutable after publish | miền rule |
| legal_rule | payload Link VN Legal Rule | NOT NULL | FK | same domain, approved | link/set-once | Tax Specialist | immutable | nguồn pháp lý |
| scope_json | payload JSON | `{}` | effective index | taxpayer/industry/company schema | user/editable | Tax Specialist | locked after publish | phạm vi |
| expression_json | payload JSON | NOT NULL | hash | DSL whitelist; no arbitrary eval | user/editable | Tax Specialist | locked after publish | công thức |
| fixtures_json | payload JSON | `[]` | evidence | expected inputs/outputs | user/editable | Tax/Reviewer | locked after publish | test vàng |
| effective_from | payload Date | NOT NULL | interval index | no overlap published | user/set-once | Tax Specialist | immutable | hiệu lực |
| status | payload Select | Draft | index | Draft/Tested/Approved/Effective/Superseded | workflow/readonly | Chief/legal signer | Draft→Tested→Approved→Effective→Superseded | vòng đời |

## E-Invoice Document

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| einvoice_code | payload Data | series | unique | `EINV-.YYYY.-.#####` | system/readonly | Tax Specialist | immutable | mã lifecycle |
| invoice_ref | payload Link Sales Invoice | NOT NULL | unique effective | posted invoice | link/set-once | Tax Specialist | immutable | hóa đơn nguồn |
| provider | payload Data | NOT NULL | provider index | connector registry | user/set-once | Tax Specialist | immutable after issue | nhà cung cấp |
| provider_event_id | payload Data | NULL | unique provider+event | signed event | connector/readonly | internal/Auditor | set-once | idempotency webhook |
| external_id | payload Data | NULL | unique provider+id | connector response | connector/readonly | Tax Specialist | immutable | mã ngoài |
| xml_schema_version | payload Data | NOT NULL | index | ruleset-effective | formula/readonly | Tax Specialist | immutable after issue | schema XML |
| xml_r2_key | payload Data | NULL | unique/private | checksum verified | connector/readonly | permission download only | immutable versioned | file XML |
| error_json | payload JSON | `{}` | exception index | redact secret | connector/readonly | Tax/Support | replace per attempt with history in timeline | lỗi provider |
| status | payload Select | Draft | index | Draft/Queued/Issued/Failed/Adjusted/Cancelled | workflow/readonly | action-specific | Draft→Queued→Issued/Failed; Issued→Adjusted/Cancelled per legal rule | vòng đời |

## Reconciliation Case

| Field | D1 storage/type | Null/default | Key/index/link | Validation | Source/edit mode | Permission/mask | Lifecycle/state rule | Audit/meaning |
|---|---|---|---|---|---|---|---|---|
| case_code | payload Data | series | unique | `RECON-.YYYY.-.#####` | system/readonly | Accountant | immutable | mã case |
| kind | payload Select | NOT NULL | queue index | AR/AP/Bank/Subledger/Payroll/Tax | user/set-once | Accountant | immutable | loại |
| company | payload Link Company | NOT NULL | scope index | active | link/set-once | Accountant | immutable | pháp nhân |
| as_of | payload Datetime | NOT NULL | snapshot index | same timestamp all sources | system/readonly | Accountant | immutable | mốc đối soát |
| expected_minor | payload Currency | 0 | none | integer | formula/readonly | Accounts | immutable per run | kỳ vọng |
| actual_minor | payload Currency | 0 | none | integer | formula/readonly | Accounts | immutable per run | thực tế |
| difference_minor | payload Currency | 0 | exception index | expected-actual | formula/readonly | Accounts | immutable per run | chênh lệch |
| resolution_type | payload Select | NULL | filter | Match/Adjustment/Reversal/WriteOffPolicy | user/editable | Accountant | locked after resolve | cách xử lý |
| resolution_ref | payload Dynamic Link | NULL | lineage | required to resolve | link/set-once | Accountant/Chief | immutable after resolve | chứng từ xử lý |
| status | payload Select | Open | index | Open/Investigating/Pending Approval/Resolved/Reopened | workflow/readonly | action-specific | Open→Investigating→Pending Approval→Resolved; Resolved→Reopened có lý do | vòng đời |

## State machines G01

- Rule/template/map: `Draft → Tested/Review → Approved/Published → Effective → Superseded/Retired`; không chỉnh published, tạo version mới.
- Accounting Period: `Open → Soft Closed → Hard Locked`; break-glass `Hard Locked → Reopened(timebox) → Hard Locked`.
- Journal Entry: `Draft → Pending → Approved → Posted`; sai sau post dùng `Posted → Reversed`, không sửa/xóa dòng GL.
- TT99 Transition: `Draft → Previewed → Approved → Applied`; lỗi preview/apply vào `Failed`, sửa mapping tạo lại preview/hash.
- E-Invoice: `Draft → Queued → Issued` hoặc `Failed`; điều chỉnh/hủy chỉ theo ruleset pháp lý hiệu lực.
- Reconciliation: `Open → Investigating → Pending Approval → Resolved`; reopen cần lý do và evidence.
