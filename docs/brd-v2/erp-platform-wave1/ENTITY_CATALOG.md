# Entity Catalog — ERP Platform Wave 1

Tài liệu này khóa entity/artifact, loại dữ liệu, vòng đời, quyền và bề mặt hiển thị ở mức BRD. Field Ledger 9 cột và `doctype-meta.json` sẽ được tạo ở Pha 3; không được thêm field ngoài catalog mà không sửa BRD/design trước.

## Quy ước chung

- Mọi bảng có `id TEXT PK`, `created_at`, `updated_at`, `created_by`; master soft-delete có `deleted_at`.
- Chứng từ có `code TEXT UNIQUE`, `status`, `company_id`, `branch_id`; tiền là INTEGER; ngày là ISO TEXT.
- `scopeWhere` chốt company/branch/department/owner; các bảng audit/ledger/rule version không hard delete.
- Trường `version` hoặc `updated_at` là khóa chống sửa đè.

## G03 — Tổ chức, quyền và kiểm soát

| Entity.field | D1 / constraint | Validate | Quyền sửa | Ý nghĩa |
|---|---|---|---|---|
| Company.code | TEXT UNIQUE NOT NULL | mã 2–20 ký tự | Owner | Mã pháp nhân, không đổi sau phát sinh sổ. |
| Company.name | TEXT NOT NULL | 1–160 ký tự | Owner | Tên pháp nhân trên chứng từ/in. |
| Company.tax_code | TEXT UNIQUE | mã số thuế VN | Owner + recent-auth | Khóa tra cứu pháp lý. |
| Company.base_currency | TEXT NOT NULL DEFAULT VND | ISO-4217 | Chief Accountant | Đồng tiền sổ cái. |
| Branch.company_id | TEXT FK Company NOT NULL | FK + scope | Owner/HR Manager | Chi nhánh thuộc đúng một pháp nhân. |
| Branch.code | TEXT NOT NULL UNIQUE(company_id,code) | mã 2–20 | Owner/HR Manager | Mã chiều nghiệp vụ. |
| Branch.accounting_model | TEXT NOT NULL | dependent/accounting_unit | Owner + Chief Accountant | Mô hình đơn vị phụ thuộc/hạch toán. |
| Branch.cost_center_id | TEXT FK CostCenter | cùng company | Accountant | Trung tâm chi phí mặc định. |
| Department.branch_id | TEXT FK Branch NOT NULL | branch cùng company | HR Manager | Phòng ban thuộc chi nhánh. |
| Department.parent_id | TEXT FK Department | không chu trình | HR Manager | Cây phòng ban. |
| Department.manager_employee_id | TEXT FK Employee | employee active, cùng scope | HR Manager | Trưởng phòng duyệt cấp một. |
| OrganizationAssignment.user_id | TEXT FK User NOT NULL | user active | System Manager | Người được gán phạm vi. |
| OrganizationAssignment.scope_json | TEXT NOT NULL | schema company/branch/department | System Manager | Phạm vi row-level có hiệu lực. |
| OrganizationAssignment.effective_from/to | TEXT | from ≤ to | System Manager | Hiệu lực gán phạm vi. |
| RolePolicy.role_id | TEXT FK Role NOT NULL | role tồn tại | System Manager | Vai trò được cấu hình. |
| RolePolicy.resource/action | TEXT NOT NULL | registry action | System Manager | Quyền resource/field/action. |
| RolePolicy.row_rule_json | TEXT NOT NULL | expression whitelist | System Manager | Predicate biên dịch ở server. |
| SoDRule.left_action/right_action | TEXT NOT NULL | action registry | Auditor + System Manager | Hai hành động không cùng người thực hiện. |
| SoDRule.severity | TEXT NOT NULL | block/warn | Auditor | Mức cưỡng chế. |
| ApprovalPolicy.document_type | TEXT NOT NULL | DocType registry | Owner | Loại chứng từ được duyệt. |
| ApprovalPolicy.threshold_json | TEXT NOT NULL | schema số tiền/điều kiện | Owner + domain manager | Cấp duyệt theo điều kiện. |
| Delegation.grantor/grantee | TEXT FK User NOT NULL | active, khác nhau | Grantor + Manager | Ủy quyền không mở rộng quyền. |
| Delegation.effective_from/to | TEXT NOT NULL | from < to, giới hạn policy | Grantor + Manager | Thời gian ủy quyền. |
| AuditEvent.actor/action/entity/entity_id | TEXT NOT NULL | immutable | hệ thống | Ai làm gì trên bản ghi nào. |
| AuditEvent.before_json/after_json | TEXT | JSON schema | hệ thống | Dấu vết thay đổi. |
| AuditEvent.correlation_id | TEXT NOT NULL | unique trong mutation | hệ thống | Tra ngược log/support. |

## G01 — Kế toán Việt Nam và kiểm soát

| Entity.field | D1 / constraint | Validate | Quyền sửa | Ý nghĩa |
|---|---|---|---|---|
| VNAccountingPolicy.company_id | TEXT FK Company UNIQUE NOT NULL | company scope | Chief Accountant | Chính sách kế toán hiện hành của pháp nhân. |
| VNAccountingPolicy.regime | TEXT NOT NULL | TT99/TT133/TT132-legacy/other-versioned | Chief Accountant | Chế độ theo năm tài chính; cần legal sign-off. |
| VNAccountingPolicy.fiscal_year_start | TEXT NOT NULL | ISO date | Chief Accountant | Chọn ruleset theo hiệu lực. |
| VNAccountingPolicy.vat_method | TEXT NOT NULL | deduction/direct/versioned | Tax Specialist | Phương pháp VAT. |
| VNLegalRule.document_no | TEXT NOT NULL | 1–80 ký tự | Tax Specialist | Số văn bản pháp lý. |
| VNLegalRule.effective_from/to | TEXT NOT NULL/TEXT | khoảng hợp lệ, không overlap cùng scope | Tax Specialist + approver | Hiệu lực quy tắc. |
| VNLegalRule.taxpayer_segment | TEXT NOT NULL | master segment | Tax Specialist | Đối tượng áp dụng. |
| VNLegalRule.form_xml_schema | TEXT | registry version | Tax Specialist | Phiên bản biểu mẫu/XML. |
| TT99AccountMap.source_account | TEXT NOT NULL | chart account tồn tại | Chief Accountant | Tài khoản nguồn/lịch sử. |
| TT99AccountMap.target_account | TEXT NOT NULL | account active, valid dates | Chief Accountant | Tài khoản TT99 đích. |
| TT99AccountMap.effective_from | TEXT NOT NULL | fiscal boundary | Chief Accountant | Không hồi tố âm thầm. |
| AccountingPeriod.company_id/branch_id | TEXT FK | scope hợp lệ | Chief Accountant | Phạm vi kỳ. |
| AccountingPeriod.from_date/to_date | TEXT NOT NULL | không overlap | Chief Accountant | Khoảng kỳ kế toán. |
| AccountingPeriod.status | TEXT NOT NULL | open/soft_closed/hard_locked | action-only | Vòng đời khóa kỳ. |
| JournalEntry.posting_date | TEXT NOT NULL | thuộc kỳ open hoặc adjustment đủ duyệt | General Accountant | Ngày ghi sổ. |
| JournalEntry.source_ref | TEXT | DocType/id hợp lệ | hệ thống/kế toán | Trace chứng từ nguồn. |
| JournalEntry.total_debit/total_credit | INTEGER NOT NULL | bằng nhau, không âm | hệ thống | Invariant cân bằng. |
| GLEntry.account_id | TEXT FK Account NOT NULL | account active/effective | hệ thống | Tài khoản sổ cái. |
| GLEntry.debit/credit | INTEGER NOT NULL | một phía >0, không cả hai | hệ thống | Dòng Nợ/Có append-only. |
| GLEntry.dimension_json | TEXT NOT NULL | company/branch/cost center/project | hệ thống | Chiều báo cáo. |
| TaxRuleset.rule_type | TEXT NOT NULL | VAT/CIT/PIT/insurance/einvoice | Tax Specialist | Tách độc lập từng miền pháp lý. |
| TaxRuleset.expression_json | TEXT NOT NULL | DSL whitelist + tests | Tax Specialist + approver | Công thức versioned, không eval tùy ý. |
| EInvoiceDocument.provider | TEXT NOT NULL | connector registry | Tax Specialist | Nhà cung cấp được cấu hình. |
| EInvoiceDocument.invoice_ref | TEXT FK SalesInvoice UNIQUE | invoice posted | hệ thống | Một hóa đơn nguồn cho một lifecycle e-invoice. |
| EInvoiceDocument.external_id/xml_key | TEXT | immutable after issued | connector | Mã ngoài và XML riêng tư trên R2. |
| ReconciliationCase.kind | TEXT NOT NULL | AR/AP/bank/subledger/payroll/tax | Accountant | Loại đối soát. |
| ReconciliationCase.expected/actual/difference | INTEGER NOT NULL | expected-actual=difference | hệ thống | Số chênh lệch. |
| ReconciliationCase.resolution_ref | TEXT | adjustment/reverse doc | Chief Accountant | Chứng từ xử lý, không sửa lén. |

## G02 — HR, lương và self-service

| Entity.field | D1 / constraint | Validate | Quyền sửa | Ý nghĩa |
|---|---|---|---|---|
| Employee.employee_code | TEXT UNIQUE(company_id,code) NOT NULL | counter + scope | HR User | Mã nhân viên. |
| Employee.company/branch/department | TEXT FK NOT NULL | cùng cây tổ chức | HR Manager | Chiều tổ chức bắt buộc. |
| Employee.user_id | TEXT FK User UNIQUE | user active | HR Manager | Liên kết self-service. |
| Employee.bank/tax/insurance fields | TEXT | validator VN; encrypted/masked | HR Manager/Payroll | Dữ liệu nhạy cảm theo field permission. |
| EmploymentContract.employee_id | TEXT FK Employee NOT NULL | employee active | HR User | Hợp đồng nguồn. |
| EmploymentContract.from/to | TEXT NOT NULL/TEXT | không overlap trái policy | HR Manager | Hiệu lực lao động. |
| EmploymentContract.salary_basis | INTEGER | không âm; che mặc định | Payroll Manager | Cơ sở lương, không phải kết quả payroll. |
| Attendance.employee/date | TEXT FK/TEXT UNIQUE(employee,date) | không trùng | HR User/Manager | Một trạng thái chấm công/ngày. |
| Attendance.status/hours | TEXT/INTEGER | enum + giới hạn policy | HR Manager | Đầu vào payroll có nguồn. |
| LeaveApplication.employee/from/to | TEXT NOT NULL | balance/holiday/overlap | Employee/HR | Yêu cầu nghỉ. |
| LeaveApplication.status | TEXT NOT NULL | draft/pending/approved/rejected/cancelled | action-only | Duyệt theo manager tree và policy. |
| ShiftAssignment.employee/shift/from/to | TEXT FK/TEXT | không overlap | HR User | Ca hiệu lực theo ngày. |
| SalaryStructureAssignment.employee_id | TEXT FK UNIQUE(employee,effective_from) | active employee | Payroll Manager | Cấu trúc lương theo hiệu lực. |
| SalaryStructureAssignment.rule_version | TEXT FK VNPayrollRule | rule approved | Payroll Manager | Phiên bản công thức. |
| PayrollEntry.period/company/branch | TEXT NOT NULL | kỳ chưa khóa | Payroll User | Batch chạy lương. |
| PayrollEntry.input_hash | TEXT NOT NULL | deterministic | hệ thống | Chống rerun tạo kết quả khác không giải thích. |
| SalarySlip.employee/payroll_entry | TEXT FK UNIQUE | cùng scope | hệ thống | Kết quả từng nhân viên. |
| SalarySlip.gross/deduction/net | INTEGER NOT NULL | gross-deduction=net | hệ thống | Invariant lương. |
| SalarySlip.status | TEXT NOT NULL | draft/verified/approved/posted/cancelled | action-only | Phân tách tính/duyệt/post. |
| PayrollAccountingBatch.payroll_entry_id | TEXT FK UNIQUE NOT NULL | payroll approved | Accountant | Cầu nối payroll → GL. |
| PayrollAccountingBatch.journal_entry_id | TEXT FK UNIQUE | JE cân bằng | Chief Accountant | Một batch một JE còn hiệu lực. |
| PayrollAccountingBatch.rule_trace | TEXT NOT NULL | JSON schema | hệ thống | Dấu vết rule, account, dimension. |
| EmployeeAdvance.employee/amount | TEXT FK/INTEGER NOT NULL | amount >0, limit policy | Employee/HR | Tạm ứng có duyệt. |
| EmployeeAdvance.settlement_ref | TEXT | expense/payroll allocation | Accountant | Không tất toán hai lần. |

## G11 — Độ tin cậy, backup và release

| Entity.field | D1 / constraint | Validate | Quyền sửa | Ý nghĩa |
|---|---|---|---|---|
| BackupSnapshot.customer_db_uuid | TEXT NOT NULL | data-access resolve fail-closed | hệ thống | DB khách được sao lưu. |
| BackupSnapshot.r2_key/checksum | TEXT UNIQUE NOT NULL | private R2 + checksum | hệ thống | Artifact backup bất biến. |
| BackupSnapshot.status | TEXT NOT NULL | running/succeeded/failed/expired | hệ thống | Theo dõi cron/job. |
| RestoreRehearsal.snapshot_id | TEXT FK BackupSnapshot | snapshot succeeded | Platform Operator | Nguồn diễn tập. |
| RestoreRehearsal.target_clone | TEXT UNIQUE NOT NULL | không trùng production | hệ thống | Restore vào clone mặc định. |
| RestoreRehearsal.reconciliation_json | TEXT NOT NULL | checklist schema | Operator + Auditor | Kết quả đếm, hash, ledger balance. |
| VerificationRun.commit_sha | TEXT NOT NULL | git SHA | hệ thống | Bản source đã verify. |
| VerificationRun.suite/result/evidence_key | TEXT NOT NULL | suite registry | hệ thống | Unit/integration/e2e/oracle/security/perf evidence. |
| ReleaseCandidate.version/commit_sha | TEXT UNIQUE NOT NULL | semver + git SHA | Release Manager | Candidate bất biến. |
| ReleaseCandidate.gate_summary | TEXT NOT NULL | mọi gate required pass | hệ thống | Chặn deploy khi đỏ. |
| ReleaseCandidate.status | TEXT NOT NULL | draft/verified/canary/released/rolled_back | action-only | Vòng đời release. |
| IncidentRecord.severity | TEXT NOT NULL | SEV1–SEV4 | Operator | Mức sự cố. |
| IncidentRecord.started/resolved | TEXT NOT NULL/TEXT | resolved ≥ started | Operator | Thời gian sự cố. |
| IncidentRecord.release_id/rollback_ref | TEXT FK | trace release/action | Operator | Truy bản phát hành và phục hồi. |

## DocType Registry & View Policy

| Nhóm | Kind | Lifecycle | List/Form | Kanban | Calendar | Report/Chart | Print | Notify |
|---|---|---|---|---|---|---|---|---|
| Company/Branch/Department | master/tree | draft→active→disabled | có/có | không | không | cây + headcount | company profile | thay đổi cấu hình |
| Assignment/Role/SoD/Approval/Delegation | setup/security | draft→published→retired | có/có | policy review | delegation | permission evidence | export PDF | in-app/email/Zalo |
| Audit Event | log | append-only | có/readonly | không | timeline | diff/export | evidence PDF | anomaly alert |
| Accounting policy/legal/account/tax rules | setup/versioned | draft→approved→effective→superseded | có/có | review | effective dates | coverage/gap | rule book | expiry/change |
| Period/Journal/GL/EInvoice/Reconciliation | transaction/ledger | workflow theo entity; GL append-only | có/có | exception queue | period | statutory/control | A4/PDF/XML | deadline/exception |
| Employee/Contract/Attendance/Leave/Shift | master/transaction | active + approval lifecycle | có/có | lifecycle/approval | ca/nghỉ | HR analytics | contract/forms | employee/manager |
| Salary/Payroll/Advance | transaction | draft→verified→approved→posted→cancelled | có/có | exception queue | payroll period | payroll/GL reconcile | payslip/batch | employee/approver |
| Backup/Restore/Verify/Release/Incident | operational | state machines riêng | có/có | release/incident | schedule | SLO/gate | evidence pack | owner/operator |
