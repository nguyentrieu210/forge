# W11 — Tiền lương, chi phí & self-service

## Khối 1 — Định danh

- Route: `/hr/payroll`; route con `/setup`, `/runs/:id`, `/expenses`, `/me`.
- Tác nhân: Payroll User/Manager, Chief Accountant, HR Manager, Employee, Line Manager, Auditor masked-read.
- Dữ liệu: Salary Component/Structure/Assignment, Payroll Entry, Salary Slip, Payroll Accounting Batch, Expense Claim, Employee Advance.

## Khối 2 — Layout desktop/mobile

- Desktop: payroll wizard + partition progress + exception queue + reconcile panel; setup form/table; self-service và expense tabs.
- Mobile: employee `/hr/me` ưu tiên payslip/request/status; payroll operator nhận status/approval cards nhưng cấu hình bảng lớn dẫn sang desktop nếu policy yêu cầu, không co bảng.
- Lương che mặc định; reveal theo field permission + reason/audit; run lớn là job nền idempotent, rời trang vẫn theo dõi được.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Payroll exception/expense approval board; salary setup không Kanban. |
| #8 AI | Giải thích phiếu lương/công thức/chênh lệch theo rule trace; không đổi rule, duyệt hoặc post. |
| #18 Vòng đời | Run `draft→calculated→verified→approved→posted/cancelled`; slip đồng bộ; expense/advance workflow riêng. |
| #2 Xóa | Draft chưa dùng soft-delete; approved/posted chỉ cancel/reverse/amend; payslip history giữ. |
| #4 Báo cáo | Payroll register, gross-net, variance, PIT/insurance working, payroll→GL, expense/advance aging; drill-down. |
| #5+#12 Thông báo | In-app/email/Zalo cho input thiếu, duyệt, payslip phát hành, advance due; nội dung không lộ số lương; không Web Push. |
| #6 Barcode | Không áp dụng cho payroll; expense receipt QR chỉ hỗ trợ capture/reference. |
| #10 Media/QR/OCR | Receipt/claim evidence R2; OCR gợi ý merchant/date/amount; payslip PDF private. |
| #11 In | Payslip, payroll register, accounting batch, expense/advance forms PDF có version/watermark. |
| #13 Mã tự động | Run/slip/batch/claim/advance code cấp transaction; rerun giữ lineage. |
| #14 Lịch | Payroll period/deadline/pay date, expense/advance due. |
| #15 Tiện ích VN | VND, PIT/BHXH/BHYT/BHTN theo version, tooltip công thức, paste component, queue mode, mask salary. |
| #19 Master data | Salary Component/Structure, payroll/tax/insurance rule, expense type, account/dimension là master versioned. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `PayrollRunWizard` | scope/period/input lock/preview/calculate/progress | Payroll User |
| `PayrollExceptionQueue` | missing input/rule/bank/tax/reconcile issue | Payroll Manager |
| `PayrollReconciliation` | gross-net-components, headcount, payroll→GL | Payroll/Chief/Auditor masked |
| `SalaryRuleTrace` | component formula, source values, version, rounding | authorized; employee own slip |
| `EmployeeSelfService` | payslips, leave/time links, claim/advance/status | linked employee only |
| `ExpenseAdvanceWorkbench` | claim/evidence/approval/settlement | Employee/Manager/Accountant |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Preview/calculate | period open, input snapshot/hash, active rules | deterministic result; exceptions explicit |
| Verify/approve | zero blocker, gross-net reconcile, SoD | immutable approval event |
| Post GL/payment payable | unique accounting batch, accounts/dimensions, debit=credit | atomic JE link; mismatch blocks |
| Cancel/rerun | reason, downstream state, reversal policy | linked cancellation/new run, no overwrite |
| Submit/approve/settle claim/advance | limit/evidence/SoD/no double settlement | transaction + allocation + audit |

## Khối 5 — Autofill

- Run scope từ company/branch và payroll period; employees/rules/attendance/leave từ effective snapshots.
- Claim OCR điền field rỗng với confidence; account/tax/dimension theo expense type và employee org.
- Last-used filters per user; “Lưu & tạo tiếp” giữ period/branch/type, không giữ employee/amount/evidence.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton wizard/queue; progress từng partition. |
| Chưa có dữ liệu | Nêu thiếu setup/input và link đúng màn. |
| Lọc không ra | Xóa filter/exception type. |
| Error | Partition/case lỗi riêng, retry idempotent; draft giữ nguyên. |
| Thiếu quyền | Salary/PII mask ở API; own employee/team/org scope. |
| Saved/success | Run state/KPI cập nhật, toast có Xem/In/Duyệt tiếp. |
| Mạng gián đoạn | Không calculate/approve/post; giữ claim/draft local, không queue/PWA. |
