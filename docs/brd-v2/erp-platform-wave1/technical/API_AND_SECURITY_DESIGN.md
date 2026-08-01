# API và bảo mật máy chủ — ERP Platform Wave 1

## 1. Hợp đồng giao tiếp

Wave 1 dùng bề mặt API Forge/Frappe hiện có thay vì tạo hai hệ CRUD:

| Nhu cầu | Route chuẩn |
|---|---|
| List/Get/Create/Update/Delete draft | `GET/POST /api/resource/{DocType}`, `GET/PUT/DELETE /api/resource/{DocType}/{name}` |
| List/report/count | `/api/method/frappe.desk.reportview.get`, `get_count`, `frappe.desk.query_report.run` |
| Submit/Cancel | `/api/method/frappe.client.submit`, `/api/method/frappe.client.cancel` |
| Workflow có lý do | `/api/method/frappe.model.workflow.apply_workflow`, `metaforge.api.workflow_action_with_comment` |
| Kanban có lý do | `/api/method/metaforge.api.kanban_move_with_comment` |
| File private | `/api/method/upload_file`, `forge.files.content` |
| In/xuất | `frappe.www.printview.get_html_and_style`, `frappe.desk.reportview.export_query` |
| Lịch/cây/import | generic Calendar; `frappe.desk.treeview.*`; `Data Import` methods |
| Nghiệp vụ đặc thù | `/api/method/erp_platform.api.<command>`; router chuyển đến Worker app sau khi không trùng method platform |

Mỗi lệnh commit nhận `command_id`, `expected_version` và `reason` khi workflow/break-glass yêu cầu. Header `Idempotency-Key` được adapter chuyển thành `command_id`. Stale version trả 409; payload sai 422; không đủ quyền 403; trùng idempotency khác payload 409.

Thành công theo envelope hiện hữu: resource trả `{data: ...}`, method trả `{message: ...}`. Lỗi dùng mapper CloudForge có `code`, thông điệp tiếng Việt, `trace_id/correlation_id`; UI không tự suy quyền từ mã lỗi.

## 2. Middleware bắt buộc

| Thứ tự | Guard | Bằng chứng/đầu ra |
|---|---|---|
| 1 | request/trace id, size/rate limit | correlation id, 413/429 có retry hint |
| 2 | session + CSRF với mutation browser | actor, role, locale, recent-auth time |
| 3 | tenant resolver | tenant D1/binding đúng; fail-closed |
| 4 | app entitlement + dependency/version | module đã cài, version tương thích |
| 5 | DocPerm/action permission | deny-by-default; role nền từ manifest |
| 6 | organization `scopeWhere` | bind-filter company/branch/department/owner |
| 7 | field permission/mask | permlevel và sự kiện unmask |
| 8 | Zod/command schema | dữ liệu chuẩn hóa, không field lạ |
| 9 | optimistic lock/idempotency | `expected_version`, receipt cũ nếu replay |
| 10 | domain invariant/SoD/period | quyết định kèm rule/approval trace |
| 11 | transaction audit/outbox | document + ledger + audit + outbox atomic |

## 3. Mapping route nghiệp vụ và quyền

Các route BRD dạng `/api/...` được hiện thực bằng resource/method sau; đây là hợp đồng build, không phải route thứ hai.

### 3.1 G03 — Organization & SoD

| Command/query | Method đích | Actor | Kiểm tra server/audit |
|---|---|---|---|
| CRUD Company/Branch/Department | resource tương ứng | Owner; HR Manager theo scope | unique/cycle/company; sensitive change recent-auth |
| Gán phạm vi | resource `Organization Assignment` | System Manager | grant là tập con quyền hiệu lực; `scope.assign` |
| Soạn policy | resource `Role Policy`, `SoD Rule`, `Approval Policy` | System Manager/Auditor | DSL/action whitelist; draft only |
| Mô phỏng quyền | `erp_platform.api.simulate_effective_permissions` | System Manager/Auditor | không mutate; kết quả có policy version |
| Publish policy | `erp_platform.api.publish_role_policy` | Owner khác người soạn | recent-auth, rescue-path, SoD; version bump/session invalidate |
| Duyệt/reject | generic workflow with comment | approver/delegate | task scope, delegation time, document version, SoD |
| Audit search/export | query report / `erp_platform.api.export_audit_evidence` | Auditor/Owner | mask; export reason, rate limit, private R2 |

### 3.2 G01 — Kế toán Việt Nam

| Command/query | Method đích | Actor | Kiểm tra server/audit |
|---|---|---|---|
| CRUD policy/legal/TT99/tax rules | resource DocType | Accountant read; Chief/Tax write | scope, effective interval, legal source |
| Validate/publish rule | `erp_platform.api.publish_legal_ruleset` | Chief Accountant + legal signer | fixtures green, no overlap, `need_legal_check=false` |
| Preview TT99 migration | `erp_platform.api.preview_tt99_transition` | Chief Accountant | fiscal-year start, source/target account, no mutation |
| Soft close/hard lock/reopen | `erp_platform.api.transition_accounting_period` | Chief; Owner/Auditor theo action | checklist, four-eyes, timebox/break-glass |
| Preview posting | `erp_platform.api.preview_posting` | Accountant | source exists, rule trace, account/dimension/date |
| Submit/cancel JE | generic submit/cancel | Accountant | DocPerm, version, period |
| Post/reverse JE | `erp_platform.api.post_journal_entry`, `reverse_journal_entry` | Chief khác người lập | balance, SoD, period, append-only GL |
| Issue e-invoice | `erp_platform.api.issue_einvoice` | Tax Specialist/connector | posted invoice, signature, provider config, idempotency |
| Provider webhook | signed app endpoint | provider adapter | raw signature; claim event trước side effect |
| Reconcile | `run_reconciliation`, `resolve_reconciliation_case` | Accountant/Chief | cùng `as_of`; resolution doc; không sửa ledger |

`publish_legal_ruleset` phải trả cấu trúc có `regime`, `effective_date`, `rule_trace`, `need_legal_check`, `blocking_errors`, `postable`. Không có chữ ký hoặc nguồn chính thức đúng phiên bản thì không publish/post.

### 3.3 G02 — HR/payroll

| Command/query | Method đích | Actor | Kiểm tra server/audit |
|---|---|---|---|
| Employee/Contract/Attendance/Leave/Shift | resource + generic workflow | Employee own; HR roles theo scope | unique/overlap/balance/manager tree; mask field nhạy cảm |
| Salary Structure Assignment | resource | Payroll roles | approved payroll rule đúng ngày hiệu lực |
| Preview payroll | `erp_platform.api.preview_payroll` | Payroll User | period/scope, frozen inputs, deterministic input hash |
| Verify/approve payroll | `verify_payroll`, `approve_payroll` | Payroll Manager; approver khác runner | zero blockers, gross-net, SoD, version |
| Post payroll to GL | `post_payroll_to_gl` | Chief Accountant | batch unique, JE balance, period, account/dimension mapping |
| Payslip own | scoped resource/query report | Employee | User ↔ Employee link, own only, mask/audit print |
| Employee advance | resource + workflow | Employee/HR/Manager | limit, settlement uniqueness, manager scope |

### 3.4 G11 — Reliability

| Command/query | Method đích | Actor | Kiểm tra server/audit |
|---|---|---|---|
| Create backup | `erp_platform.api.create_backup` | cron/Platform Operator | tenant binding, checksum, private R2, retention |
| Restore rehearsal | `rehearse_restore` | Platform Operator | clone target, never production by default |
| Certify restore | `certify_restore_rehearsal` | Auditor | count/hash/ledger/reports all green |
| Create/verify release | resource + `verify_release_candidate` | Release Manager/CI | immutable SHA, required suite registry |
| Canary/rollout/rollback | action methods | Release Manager/Operator | backup, migration dry-run, SLO/reconcile; incident on rollback |
| Incident lifecycle | resource + workflow | Operator/Commander | dedupe, severity, timeline, close only after reconcile |
| Export all | `erp_platform.api.export_all` | Owner | recent-auth, one/hour, encrypted private artifact |

## 4. Ma trận action → SoD tối thiểu

| Cặp xung đột | Mức | Ngoại lệ |
|---|---|---|
| Soạn policy ↔ publish cùng version | Block | Không có; cần người thứ hai. |
| Tạo JE ↔ post JE | Block | Break-glass không cho phép tự post; phải reassignment. |
| Chạy payroll ↔ approve payroll | Block | Chỉ payroll nhỏ theo policy vẫn cần approver khác. |
| Approve payroll ↔ post GL | Warn/Block theo tenant policy | Chief Accountant độc lập là mặc định. |
| Tạo legal/tax rule ↔ legal sign-off | Block | Không có. |
| Yêu cầu reopen ↔ approve reopen | Block | Owner và Auditor hai người. |
| Tạo release ↔ rollout production | Block | Release Manager và Platform Operator hai người. |
| Khởi tạo restore ↔ certify | Block | Operator và Auditor hai người. |

Delegation không loại bỏ SoD và không mở rộng scope. Nếu delegate trùng actor bị cấm, engine bỏ delegate đó và escalates.

## 5. Scope và field mask

- `Company`: role có company scope mới đọc; Owner/Auditor có tenant-wide theo policy.
- `Branch`: phải thuộc company scope; `Department`: phải thuộc branch/company scope và cây cho phép.
- `Employee`: HR theo org scope; Employee chỉ own-linked document; Manager chỉ subtree đã được policy cho phép.
- Kế toán: branch-dependent transaction theo company/branch; GL/report luôn giữ company dimension.
- Field permlevel 1: MST/CCCD, tài khoản ngân hàng, bảo hiểm, salary basis và salary amount; permlevel 2: credential/provider secret không trả ra resource API.
- Audit event không chứa secret/raw XML; chỉ hash, R2 key private và diff đã redact.

## 6. Các test bắt buộc từ hợp đồng API

Mỗi mutation có happy path, 401, 403 role thấp gọi API trực tiếp, cross-company/branch/department, field mask, payload 422, stale 409, idempotent replay và same-key/different-payload conflict. Lệnh tài chính/payroll/quyền/release có thêm SoD, effective-date, period/state và audit atomicity. Webhook có bad signature, duplicate event và out-of-order event. Export/backup/restore có wrong-tenant binding và artifact checksum mismatch.
