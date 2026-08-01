# API & Permission Matrix — ERP Platform Wave 1

## Hợp đồng chung

- Chuỗi middleware: session/auth → tenant/customer DB resolve → permission + `scopeWhere` → Zod → transaction/domain invariant → audit/outbox → error mapper.
- Mọi mutation nhận `Idempotency-Key` và `If-Unmodified-Since`/version khi cập nhật.
- Response lỗi: `{ "error": { "code": "...", "message": "...", "correlation_id": "..." } }`.
- Dữ liệu lương, tài khoản ngân hàng, MST/CCCD và tổng tài chính được field-mask theo role; hành vi xem rõ được audit.

| Method/route | Actor được phép | Scope/server check | Audit/action |
|---|---|---|---|
| POST `/api/auth/login` | Guest | rate limit, lockout, tenant discovery | login success/fail metadata |
| GET `/api/sessions` | Authenticated | own sessions; Owner xem tenant sessions metadata | session.read |
| DELETE `/api/sessions/:id` | session owner/Owner | own hoặc recent-auth Owner | session.revoke |
| GET `/api/organization/tree` | authenticated domain roles | assigned company/branch | organization.read |
| POST `/api/companies` | Owner | customer DB, unique code/MST | company.create |
| PATCH `/api/companies/:id` | Owner + domain co-approver khi nhạy cảm | optimistic lock; no illegal model change | company.update |
| POST/PATCH `/api/branches/:id?` | Owner/HR Manager | company scope; tree invariant | branch.write |
| POST/PATCH `/api/departments/:id?` | HR Manager | branch scope; no cycle | department.write |
| POST `/api/organization-assignments` | System Manager | cannot grant beyond own effective permission | scope.assign |
| GET `/api/security/effective-permissions` | System Manager/Auditor | simulate target inside tenant | policy.simulate |
| POST `/api/security/policies` | System Manager | action/field/row DSL whitelist | policy.draft |
| POST `/api/security/policies/:id/publish` | Owner khác người soạn | SoD + recent-auth + rescue path | policy.publish |
| POST `/api/security/sod/check` | System Manager/Auditor | tenant policy graph | sod.check |
| POST `/api/delegations` | Grantor/Manager | subset permission + bounded dates | delegation.create |
| GET `/api/approvals/inbox` | Approver | effective task scope | approval.read |
| POST `/api/approvals/:id/:action` | effective Approver | SoD, document version, delegation | approval.approve/reject |
| GET `/api/audit` | Auditor/System Manager | masks + legal hold policy | audit.search |
| POST `/api/audit/export` | Auditor/Owner | rate limit + reason | audit.export |
| GET/POST `/api/vn-accounting/policy` | Accountant read; Chief Accountant write | company scope + legal fields | vn_policy.read/write |
| POST `/api/vn-legal-rules` | Tax Specialist | version/effective date/source | legal_rule.draft |
| POST `/api/vn-legal-rules/:id/publish` | Chief Accountant + legal approver | no overlap + tests green | legal_rule.publish |
| GET/POST `/api/tt99/account-map` | Accountant read; Chief Accountant write | account/effective date | tt99_map.write |
| GET/POST `/api/accounting/periods` | Accountant read; Chief Accountant write | non-overlap + scope | period.write |
| POST `/api/accounting/periods/:id/soft-close` | Chief Accountant | close checklist green | period.soft_close |
| POST `/api/accounting/periods/:id/hard-lock` | Chief Accountant + Owner | four-eyes + evidence | period.hard_lock |
| POST `/api/accounting/periods/:id/reopen` | Owner + Auditor approval | break-glass, timebox | period.reopen |
| GET/POST `/api/journal-entries` | Accountant | company/branch; Zod; source trace | journal.read/create |
| POST `/api/journal-entries/:id/submit` | Accountant | document version + period | journal.submit |
| POST `/api/journal-entries/:id/post` | Chief Accountant khác người lập | debit=credit + SoD + idempotent | journal.post |
| POST `/api/journal-entries/:id/reverse` | Chief Accountant | posted original + reason | journal.reverse |
| GET `/api/gl` | Accountant/Auditor | row/field scope, cursor | gl.read |
| GET/POST `/api/tax-rulesets` | Tax Specialist | type/scope/version | tax_rule.read/write |
| POST `/api/e-invoices/:invoice_id/issue` | Tax Specialist/authorized connector | posted invoice + signature + idempotency | einvoice.issue |
| POST `/api/e-invoices/webhook/:provider` | provider adapter | raw signature + claim event first | einvoice.webhook |
| POST `/api/reconciliation/runs` | Accountant | same `as_of`, selected scope | reconciliation.run |
| POST `/api/reconciliation/cases/:id/resolve` | Accountant draft; Chief Accountant post | resolution document required | reconciliation.resolve |
| GET/POST `/api/employees` | HR roles | org scope; field masks | employee.read/create |
| PATCH `/api/employees/:id` | HR Manager | optimistic lock; sensitive field policy | employee.update |
| GET/POST `/api/employment-contracts` | HR roles | employee scope; approval | contract.read/create |
| GET/POST `/api/attendance` | Employee own check; HR manage | unique employee/date | attendance.write |
| GET/POST `/api/leave-applications` | Employee own; HR manage | balance/overlap/manager | leave.write |
| POST `/api/leave-applications/:id/:action` | Line Manager/HR Manager | manager tree + version | leave.approve/reject |
| GET/POST `/api/shift-assignments` | HR User/Manager | employee/date overlap | shift.write |
| GET/POST `/api/salary-structure-assignments` | Payroll roles | employee scope; rule approved | salary_structure.write |
| POST `/api/payroll-runs/preview` | Payroll User | period + input hash | payroll.preview |
| POST `/api/payroll-runs/:id/verify` | Payroll Manager | zero blockers + reconcile | payroll.verify |
| POST `/api/payroll-runs/:id/approve` | Payroll Manager khác người chạy | SoD + version | payroll.approve |
| POST `/api/payroll-runs/:id/post-gl` | Chief Accountant | batch unique, JE balance, period | payroll.post_gl |
| GET `/api/me/payslips` | Employee | linked employee only | payslip.read |
| POST `/api/employee-advances` | Employee/HR | limit + approval | advance.create |
| POST `/api/backups` | Platform Operator | customer DB resolve + plan | backup.create |
| POST `/api/restores/rehearse` | Platform Operator | clone target only by default | restore.rehearse |
| POST `/api/restores/:id/certify` | Auditor | checksum/reconcile all green | restore.certify |
| POST `/api/releases/candidates` | Release Manager | immutable SHA/manifest | release.create |
| POST `/api/releases/:id/verify` | CI/Verifier | required suite registry | release.verify |
| POST `/api/releases/:id/canary` | Release Manager | backup + all gates green | release.canary |
| POST `/api/releases/:id/rollout` | Platform Operator | canary SLO/reconcile green | release.rollout |
| POST `/api/releases/:id/rollback` | Platform Operator | rollback policy + incident | release.rollback |
| GET `/api/health` | monitor/operator | DB SELECT 1 through data-access | health.read |
| POST `/api/export-all` | Owner | recent-auth, 1/hour, private artifact | data.export_all |

## Permission acceptance

Mỗi route có test happy path, 401, 403 role thấp gọi thẳng API, cross-branch/cross-department, field mask, stale update 409, invalid payload 422 và idempotency replay. Route tài chính/payroll/role/release có thêm SoD và period/state test.
