# W07 — Thuế, e-invoice & khóa kỳ

## Khối 1 — Định danh

- Route: `/accounting/compliance-close`; route con `/tax`, `/e-invoices`, `/period-close`.
- Tác nhân: Tax Specialist, General/Chief Accountant, Owner co-approver, Auditor.
- Dữ liệu: Tax Ruleset/Return, E-Invoice Document/Event, Accounting Period, Close Checklist, Legal Rule.

## Khối 2 — Layout desktop/mobile

- Desktop: compliance calendar + deadline queue; e-invoice 3 cột source/status/provider events; close checklist có blockers/evidence và action bar.
- Mobile: deadline cards; e-invoice detail stack; close stepper full-screen, hard-lock CTA tách xa action thường.
- XML/print tải qua signed URL ngắn; secrets/provider raw payload không trả về UI.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | E-invoice exception pipeline; close blockers board; tax return trạng thái theo workflow. |
| #8 AI | Giải thích validation/lineage theo rule source; không ký, phát hành, nộp, khóa/mở kỳ. |
| #18 Vòng đời | E-invoice `draft→signed→issued→adjusted/replaced/cancelled`; period `open→soft_closed→hard_locked→timeboxed_reopen`. |
| #2 Xóa | Không xóa XML/event/period đã dùng; draft lỗi được archive với audit. |
| #4 Báo cáo | Tax reconciliation, invoice status, deadline, close readiness; drill-down tới source/GL/XML. |
| #5+#12 Thông báo | In-app/email/Zalo T-7/T-3/T-1, provider fail, close blocker/reopen; không Web Push. |
| #6 Barcode | QR tra cứu hóa đơn/invoice link, không chứa secret; scan kiểm status theo permission. |
| #10 Media/QR/OCR | XML/PDF/signature evidence R2 private; QR sinh từ public verification URL có TTL/policy. |
| #11 In | Invoice/PDF, tax working paper, close evidence pack A4/PDF; template/version hash. |
| #13 Mã tự động | Tax return/e-invoice internal/close run code cấp transaction; provider number theo connector. |
| #14 Lịch | Compliance calendar deadline/effective date/close window. |
| #15 Tiện ích VN | MST, VND, mẫu/XML theo version, deadline tương đối, hàng đợi ngoại lệ có hành động. |
| #19 Master data | Provider, certificate, tax type, form/XML schema, close checklist template versioned. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `ComplianceCalendar` | deadline/status/risk, click drill-down | accounting/tax scope |
| `EInvoiceExceptionQueue` | source, provider status, retry/adjust/replace | Tax Specialist |
| `TaxReconciliationPanel` | source→GL→return/XML variance | Accountant/Auditor |
| `PeriodCloseStepper` | checklist, blockers, evidence, approvals | Chief Accountant |
| `LegalEvidenceViewer` | rule/form/XML/version/signoff | authorized read |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Validate/issue e-invoice | posted source, connector/signature, idempotency claim | event timeline; provider lỗi retry có giới hạn |
| Adjust/replace/cancel | legal reason + original relation + role | lifecycle event, không ghi đè XML cũ |
| Tạo/validate return | ruleset đúng kỳ + reconcile | working copy/evidence |
| Soft close | no blocker P0, reconciliations run | adjustment-only policy active |
| Hard lock/reopen | four-eyes, evidence, recent-auth; reopen timebox | lock trigger + notifications/audit |

## Khối 5 — Autofill

- Deadline/form/XML schema từ effective ruleset và fiscal calendar.
- E-invoice prefill từ posted sales invoice; field provider chỉ từ configured connector.
- Close checklist prefill gate results theo cùng `as_of`; người dùng không sửa số liệu evidence.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton calendar/queue/checklist. |
| Chưa có dữ liệu | Hướng dẫn kết nối provider hoặc tạo kỳ theo quyền. |
| Lọc không ra | Nêu deadline/status filter, xóa lọc. |
| Error | Provider/validation/close blocker tách rõ; có retry hoặc đường xử lý. |
| Thiếu quyền | XML/signature/amount mask; hard-lock API 403. |
| Saved/success | Status timeline cập nhật, toast có Xem/In evidence. |
| Mạng gián đoạn | Không ký/phát hành/close; giữ draft, không queue/PWA. |
