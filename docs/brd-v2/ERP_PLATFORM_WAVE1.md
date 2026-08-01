# BRD — Nền tảng ERP dùng chung, Wave 1

Ngày chốt phạm vi: 2026-08-01
Trạng thái: **Cổng 2 — sẵn sàng xin duyệt**
Nguồn phạm vi: gói G03, G01, G02, G11 trong `Forge_ERP_1000_Diem_Nang_Cap_2026-08-01.xlsx`
Baseline kế thừa: `server/docs/spec/BRD.md` và các registry ERP/HR hiện có
Nguyên tắc sản phẩm: nền tảng ERP đa ngành; không đóng khung cho xưởng nhôm

## 0. Giả định, câu hỏi mở và nhật ký hợp đồng

### 0.1 Giả định có kiểm soát

| Mã | Giả định/điều kiện | Cách chốt trước production |
|---|---|---|
| A01 | Mỗi khách hàng dùng D1 dữ liệu riêng theo ADR-001; các phân hệ dùng chung data-access layer. | Test fail-closed khi thiếu hoặc sai `customer_db_uuid`. |
| A02 | ERPNext/HRMS/Toka/MISA là nguồn tham chiếu hành vi và đối chiếu; không mặc định được phép sao chép mã nguồn. | Chốt hồ sơ giấy phép và source manifest trước khi port từng artifact. |
| A03 | Doanh nghiệp có năm tài chính bắt đầu từ 2026-01-01 dùng bộ phân tích TT99 mặc định; dữ liệu lịch sử giữ ruleset cũ theo ngày hiệu lực. | Kế toán trưởng/tư vấn pháp lý ký bảng cấu hình áp dụng. |
| A04 | VAT, CIT, PIT, bảo hiểm, hóa đơn điện tử và XML là các ruleset riêng; TT99 không thay thế các quy định này. | Legal sign-off theo mẫu, nhà cung cấp và thời điểm áp dụng. |
| A05 | Chi nhánh có thể là đơn vị phụ thuộc hoặc đơn vị hạch toán; mọi chứng từ phải giữ Company, Branch, Department/Cost Center khi áp dụng. | Owner chọn mô hình trong wizard và khóa sau khi phát sinh sổ. |
| A06 | Wave 1 nâng nền móng 4 gói đã duyệt; 996+ điểm còn lại vẫn nằm trong roadmap 1000 điểm, không bị loại. | Ma trận traceability giữ trạng thái từng audit ID. |
| A07 | Không xây PWA, service worker, cài app, offline queue, update banner hoặc Web Push. | Kiểm tra source và manifest không có các thành phần này. |
| A08 | Mạng gián đoạn vẫn phải giữ bản nháp form cục bộ; mutation tài chính/lương/khóa kỳ bị khóa cho tới khi có mạng. | Browser test refresh/rớt mạng; không tạo giao dịch ngầm. |

### 0.2 Câu hỏi bắt buộc trước go-live, không chặn Cổng 2

Loại hình doanh nghiệp, ngày đầu năm tài chính, chế độ kế toán lịch sử, phương pháp VAT, mô hình chi nhánh, chính sách lương/PIT/bảo hiểm, nhà cung cấp hóa đơn điện tử, chữ ký số, RPO/RTO và thời gian lưu backup phải được nhập theo từng khách. Không có giá trị mặc định pháp lý dùng chung cho mọi khách.

### 0.3 Nhật ký hợp đồng đã áp dụng

| Hợp đồng | Quy tắc áp dụng trong Wave 1 |
|---|---|
| `screen-catalog-contract` | Login, dashboard/workspace, settings, dữ liệu dài, báo cáo và màn 3 cột đều có thiết kế riêng. |
| `data-table-contract` | Cursor server-side, cột nghiệp vụ có thứ tự, lọc/sort server, bulk theo quyền, tổng trang và tổng tập lọc. |
| `form-workflow-contract` | Link field kiểu ERPNext, dirty tracking, autofill có nguồn, workflow/state action chốt ở server. |
| `frontend-360-contract` | Desktop/mobile là hai cây render; 7 trạng thái; lỗi tiếng Việt có việc tiếp theo; không dùng UI để thay quyền server. |
| `master-data-contract` | Company, Branch, Department, Cost Center, account/rule/component là master riêng, không hardcode enum theo khách. |
| `media-capture-contract` | Tệp bằng chứng lưu R2 riêng tư; chứng từ đã chốt không được xóa/ghi đè tệp. |
| `print-contract` | Phiếu lương, chứng từ kế toán, sổ và báo cáo có print/PDF A4, template versioned và audit. |
| `notify-contract` | In-app là kênh bắt buộc; email/Zalo qua adapter và fallback; không dùng Web Push. |
| `polish-contract` | Phản hồi cục bộ, virtualize, prefetch, autosave, chống sửa đè, KPI drill-down, quản lý phiên; mục offline/PWA được đánh dấu không áp dụng theo A07. |
| `operator-convenience` | Tìm gần đúng, recent records, giữ filter/scroll, queue mode duyệt, cảnh báo có hành động, settings tìm được. |
| `backend-contract` | Auth → permission/scope → Zod → transaction → audit; idempotency, soft-delete đúng loại, export owner, backup thật. |
| `doctype-platform-contract` | Mỗi artifact có kind, field source, lifecycle, view policy và surface; meta là nguồn sinh runtime. |
| `field-ledger` | Field Ledger 9 cột là đầu vào bắt buộc của Pha 3; BRD này khóa ý nghĩa nghiệp vụ, entity và quyền trước. |
| `mobile-pwa-contract` | Chỉ nhận phần mobile responsive; toàn bộ PWA/offline install/update/push không áp dụng theo quyết định người dùng. |
| `pos-fnb-contract` | Không áp dụng: Wave 1 không có POS/F&B. |

## 1. Vấn đề

Nền tảng đã có kernel metadata, nhiều DocType ERP/HR và phần triển khai tối thiểu cho công ty, chi nhánh, phòng ban, HRMS và kế toán Việt Nam. Khoảng trống lớn là tính nhất quán xuyên phân hệ: cấu trúc tổ chức chưa trở thành chiều dữ liệu bắt buộc ở mọi nghiệp vụ; SoD/quyền chưa có bằng chứng mô phỏng; kế toán Việt Nam chưa đủ ruleset TT99, thuế, e-invoice, khóa kỳ và trace nguồn→sổ→báo cáo; HR/payroll chưa có chuỗi đối soát hoàn chỉnh; độ tin cậy release/restore/oracle chưa đủ để tuyên bố production.

## 2. Mục tiêu

1. Biến Company → Branch → Department → Cost Center thành xương sống dữ liệu dùng chung cho ERP và HR.
2. Deny-by-default, phân quyền theo vai trò + phạm vi dòng + trường + hành động; có SoD, ủy quyền có hạn và audit bất biến.
3. Hoàn thiện accounting kernel cho GL, AR, AP, cash/bank, close và reconciliation; bổ sung localization Việt Nam versioned theo ngày hiệu lực.
4. Hoàn thiện hire-to-retire, leave/attendance/shift, payroll, expense/advance và employee self-service; payroll đối soát được sang GL.
5. Mọi chứng từ quan trọng theo lifecycle `draft → submitted → approved → posted → soft_closed → hard_locked`; hủy bằng reverse/amend, không xóa vật lý sau post.
6. Truy ngược được source document → ERP document → subledger/GL → report/tax/XML → approval/audit.
7. Có backup, restore rehearsal, release gate, golden oracle, SLO và rollback có bằng chứng trước deploy.
8. Giữ runtime metadata-driven và hành vi tương thích ERPNext/HRMS ở điểm đã khai; phần chưa có oracle không được gắn nhãn parity.

## 3. Tác nhân

| Tác nhân | Trách nhiệm | Phạm vi mặc định |
|---|---|---|
| Platform Operator | release, backup, restore, incident, SLO | control plane; không đọc lương/nội dung chứng từ nếu không có break-glass |
| Tenant Owner/System Manager | cấu hình tổ chức, user, module, session | toàn khách; thay đổi nhạy cảm cần recent-auth + audit |
| HR User / HR Manager | hồ sơ, hợp đồng, nghỉ, chấm công, lifecycle | chi nhánh/phòng ban được cấp |
| Payroll User / Payroll Manager | cấu trúc lương, chạy lương, duyệt lương | công ty/chi nhánh được cấp; số lương bị che ngoài nhóm |
| Employee / Line Manager | self-service, yêu cầu và duyệt đội ngũ | chính mình / cây báo cáo trực tiếp |
| General Accountant | draft chứng từ, đối soát, báo cáo | company/branch được cấp |
| Chief Accountant | duyệt/post, khóa kỳ, ruleset kế toán | company được cấp; không tự lập và tự duyệt cùng chứng từ |
| Tax Specialist | ruleset thuế, kê khai, e-invoice/XML | kỳ và pháp nhân được cấp |
| Internal Auditor | xem audit, trace, export bằng chứng | read-only; dữ liệu nhạy cảm theo mask policy |
| Approver/Delegate | duyệt đúng loại, ngưỡng, thời gian ủy quyền | không vượt quyền của người ủy quyền |

## 4. Thực thể

Wave 1 dùng registry nền hiện hữu và khóa thêm 33 thực thể/artifact trong [ENTITY_CATALOG.md](erp-platform-wave1/ENTITY_CATALOG.md). Pha 3 phải sinh Field Ledger 9 cột và DocType Meta cho toàn bộ registry này trước khi viết migration/code. Các thực thể cốt lõi:

- G03: Company, Branch, Department, Organization Assignment, Role Policy, SoD Rule, Approval Policy, Delegation, Audit Event.
- G01: VN Accounting Policy, Legal Rule, TT99 Account Map, Accounting Period, Journal Entry, GL Entry, Tax Ruleset, E-Invoice Document, Reconciliation Case.
- G02: Employee, Employment Contract, Attendance, Leave Application, Shift Assignment, Salary Structure Assignment, Payroll Entry, Salary Slip, Payroll Accounting Batch, Employee Advance.
- G11: Backup Snapshot, Restore Rehearsal, Verification Run, Release Candidate, Incident Record.

## 5. Luồng nghiệp vụ

Chi tiết actor-by-actor và nhánh lỗi nằm trong [FLOW_CATALOG.md](erp-platform-wave1/FLOW_CATALOG.md). Luồng chốt:

1. Thiết lập tổ chức và gán phạm vi.
2. Tạo/chỉnh/publish role policy và chạy mô phỏng quyền.
3. Duyệt theo SoD, ngưỡng và ủy quyền có hạn.
4. Chọn và publish ruleset kế toán/thuế theo ngày hiệu lực.
5. Lập → duyệt → post → reverse/amend chứng từ kế toán.
6. Đối soát AR/AP/bank/subledger với GL và xử lý sai lệch.
7. Tuyển dụng/lifecycle → chấm công/nghỉ/ca → payroll → GL → payslip.
8. Soft close → xử lý ngoại lệ → hard lock → reopen có phê duyệt đặc biệt.
9. Backup → restore clone → reconciliation → chứng nhận rehearsal.
10. Candidate → verify/oracle/security/performance → canary → rollout/rollback.

## 6. Quyền theo endpoint

Ma trận đầy đủ nằm trong [API_PERMISSION_MATRIX.md](erp-platform-wave1/API_PERMISSION_MATRIX.md). Mọi endpoint dùng middleware chain chuẩn; `scopeWhere(session)` giới hạn company/branch/department/owner; Zod chốt body/query/params; mutation nghiệp vụ và audit chạy cùng transaction. UI ẩn nút chỉ là hỗ trợ trải nghiệm, không phải biện pháp bảo mật.

## 7. Chỉ mục màn hình MVP Wave 1

| ID | Màn hình/workspace | Route | Thẻ đặc tả |
|---|---|---|---|
| W01 | Đăng nhập & phiên | `/login` | [W01](erp-platform-wave1/screens/W01-login-session.md) |
| W02 | Cơ cấu tổ chức | `/organization` | [W02](erp-platform-wave1/screens/W02-organization.md) |
| W03 | Vai trò, phạm vi & SoD | `/security/roles` | [W03](erp-platform-wave1/screens/W03-role-sod.md) |
| W04 | Hộp duyệt & kiểm toán | `/security/approvals-audit` | [W04](erp-platform-wave1/screens/W04-approvals-audit.md) |
| W05 | Thiết lập kế toán Việt Nam | `/accounting/setup-vn` | [W05](erp-platform-wave1/screens/W05-accounting-setup-vn.md) |
| W06 | Sổ cái & chứng từ | `/accounting/ledger` | [W06](erp-platform-wave1/screens/W06-ledger-documents.md) |
| W07 | Thuế, e-invoice & khóa kỳ | `/accounting/compliance-close` | [W07](erp-platform-wave1/screens/W07-compliance-close.md) |
| W08 | Đối soát & control tower | `/accounting/reconciliation` | [W08](erp-platform-wave1/screens/W08-reconciliation.md) |
| W09 | Hồ sơ nhân sự & lifecycle | `/hr/employees` | [W09](erp-platform-wave1/screens/W09-employee-lifecycle.md) |
| W10 | Chấm công, ca & nghỉ | `/hr/time` | [W10](erp-platform-wave1/screens/W10-time-leave.md) |
| W11 | Tiền lương, chi phí & self-service | `/hr/payroll` | [W11](erp-platform-wave1/screens/W11-payroll-self-service.md) |
| W12 | Sẵn sàng vận hành & release | `/operations/readiness` | [W12](erp-platform-wave1/screens/W12-operational-readiness.md) |

Mỗi workspace dùng generic list/form/report/print runtime cho route con của DocType, không tạo giao diện đặc thù lặp lại. Desktop và mobile là hai cây render; mobile dùng list card/sheet, không dùng bảng cuộn ngang. Không có PWA.

## 8. Ngoài phạm vi Wave 1

- PWA, service worker, install/update banner, Web Push, offline transaction queue.
- Viết lại toàn bộ ERPNext/MISA/Toka hoặc tuyên bố source parity khi chưa có manifest + oracle.
- Tự động nộp thuế/hóa đơn không cần người duyệt hoặc connector được chứng nhận.
- AI tự post bút toán, tự khóa/mở kỳ, tự duyệt lương hoặc tự thay đổi role.
- Control-plane billing/subscription/tenant sales lifecycle.
- Các package G04–G10 và G12–G20 vẫn ở roadmap 1000 điểm; không bị loại khỏi sản phẩm.

## 9. Quyết định đã chốt

- Sản phẩm là nền tảng ERP đa ngành, không phải bản riêng của Alumdoor.
- Behavioral clean-room + oracle là mặc định; direct port chỉ khi giấy phép được xác nhận.
- Mỗi khách một D1; không dùng `tenant_id` trong shared business database để thay cách ly vật lý.
- Tiền lưu INTEGER VND; ngày ISO; mọi update dùng optimistic lock.
- Audit append-only; chứng từ posted không hard delete; reverse/amend giữ liên kết.
- Quy tắc pháp lý versioned với `document_no`, `effective_from`, `effective_to`, `taxpayer_segment`, `form/xml_schema`, `supersedes` và approval trace.
- Notification bắt buộc là in-app; email/Zalo là adapter; không Web Push.
- AI chỉ đọc theo quyền, trả nguồn; không có quyền duyệt/post.
- Release không qua oracle/reconciliation/security/restore gate thì không deploy.

## 10. Nhận diện sản phẩm

| Thuộc tính | Quyết định |
|---|---|
| Tên làm việc | Forge ERP Platform |
| Định vị | ERP metadata-driven, đa ngành, vận hành trên Cloudflare |
| Phân hệ Wave 1 | Organization & SoD; VN Accounting; HR & Payroll; Operational Readiness |
| Ngôn ngữ | Tiếng Việt mặc định, nhãn có i18n key |
| Màu/UI | Palette dùng chung KeToan/Toka của AppWeb; không hardcode màu theo app |
| Trải nghiệm | Mật độ nghiệp vụ, keyboard-first desktop, mobile card/sheet, lỗi có hướng xử lý |
| Bằng chứng hoàn thành | Trace audit ID → BRD → design/ledger/meta → code/test/oracle → release/deploy |

## Cổng 2

Tự chấm và bằng chứng nằm tại [GATE2_SCORECARD.md](erp-platform-wave1/GATE2_SCORECARD.md). Cổng 2 chỉ duyệt yêu cầu; chưa cho phép viết migration, API hay UI. Sau khi người dùng duyệt Cổng 2, Pha 3 mới tạo kiến trúc chi tiết, Field Ledger, DocType Meta, API schema, state machine và kế hoạch migration để xin Cổng 3.
