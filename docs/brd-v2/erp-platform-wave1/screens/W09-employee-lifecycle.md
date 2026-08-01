# W09 — Hồ sơ nhân sự & lifecycle

## Khối 1 — Định danh

- Route: `/hr/employees`; route con `/hr/employees/:id`, `/hr/lifecycle`, `/hr/contracts`.
- Tác nhân: HR User, HR Manager, Line Manager, Employee self-read, Payroll masked-read, Auditor.
- Dữ liệu: Employee, Employment Contract, Onboarding/Transfer/Promotion/Separation, Designation, organization masters.

## Khối 2 — Layout desktop/mobile

- Desktop: employee data table + quick filters; detail 360 gồm hồ sơ, hợp đồng, tổ chức, timeline, tài liệu, payroll summary masked; lifecycle queue 3 cột.
- Mobile: employee cards; detail stack từng section; form full-screen/sticky save; gọi/Zalo qua explicit action và ghi contact log khi dùng.
- Tìm không dấu/4 số cuối; cursor/virtualize; URL riêng; back giữ filter/scroll; field nhạy cảm không có trong payload role thấp.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Lifecycle board onboarding/active/transfer/separation; không kéo-thả để bypass workflow. |
| #8 AI | Tóm tắt hồ sơ/thiếu tài liệu theo quyền và nguồn; không quyết định tuyển/sa thải/lương. |
| #18 Vòng đời | Employee `draft→active→suspended→separated`; contract `draft→approved→effective→expired/terminated`. |
| #2 Xóa | Draft chưa dùng soft-delete; employee có lịch sử chỉ separate/anonymize theo retention hợp pháp. |
| #4 Báo cáo | Headcount, turnover, contract expiry, missing document, diversity fields được kiểm soát; drill-down. |
| #5+#12 Thông báo | In-app/email/Zalo cho onboarding task, contract expiry, transfer/separation; tôn trọng opt-out/kênh; không Web Push. |
| #6 Barcode | Thẻ nhân viên QR/barcode mở hồ sơ theo quyền; không chứa PII thô. |
| #10 Media/QR/OCR | Ảnh, hợp đồng, bằng cấp R2 private; OCR CCCD/hợp đồng chỉ prefill có xác nhận và retention. |
| #11 In | Hợp đồng/quyết định/thẻ nhân viên PDF, template versioned, access audit. |
| #13 Mã tự động | Employee/contract/lifecycle code qua counter; giữ số khi hủy. |
| #14 Lịch | Contract expiry, onboarding task, probation/transfer/separation milestone. |
| #15 Tiện ích VN | SĐT, MST cá nhân, BHXH, địa chỉ 2 cấp, tìm không dấu, recent records, duplicate/merge có audit. |
| #19 Master data | Company/Branch/Department/Designation/Employment Type/Grade/Reason là master riêng. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `EmployeeDataViewDesktop` / `EmployeeCardsMobile` | search/filter/sort/bulk/summary | org scope |
| `Employee360` | profile, org, contract, timeline, documents, linked user | field-scoped |
| `LifecycleBoard` | onboarding/transfer/promotion/separation tasks | HR + manager action policy |
| `SensitiveFieldReveal` | masked value, reason/recent-auth, reveal audit | HR/Payroll theo field |
| `EmployeeDocumentVault` | private preview/upload/version/retention | HR; employee own selected docs |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Tạo/merge employee | code, user uniqueness, duplicate phone/tax/insurance | record hoặc merge plan; không mất timeline |
| Approve contract | dates, overlap, approver khác người lập | effective version + print artifact |
| Transfer/promotion | target org/designation/effective date, payroll impact preview | future event + notifications |
| Separate | checklist, asset/advance/payroll blockers, approvals | status separated, access revoke job |
| Reveal/export sensitive | field permission, reason/recent-auth/rate limit | access audit + masked artifact đúng scope |

## Khối 5 — Autofill

- Company/branch/department từ context; manager/cost center từ org tree; dirty tracking.
- OCR chỉ điền field rỗng và hiển thị confidence/source; không tự submit.
- Clone dùng cho template onboarding/contract, không clone PII/mã/approval.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton list/360 từng tab. |
| Chưa có dữ liệu | CTA tạo/import employee theo quyền. |
| Lọc không ra | Xóa filter, gợi ý tìm 4 số cuối/không dấu. |
| Error | Khối lỗi từng tab, form giữ draft, mã tra cứu. |
| Thiếu quyền | 403/field mask; không render tab hoặc PII forbidden. |
| Saved/success | Employee/event mới highlight, toast có Xem/In. |
| Mạng gián đoạn | Giữ draft hồ sơ, khóa upload/mutation, không queue/PWA. |
