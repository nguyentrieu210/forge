# W06 — Sổ cái & chứng từ

## Khối 1 — Định danh

- Route: `/accounting/ledger`; route con cho Journal Entry, Sales/Purchase Invoice, Payment Entry, GL Entry.
- Tác nhân: General Accountant, Chief Accountant, AR/AP Accountant, Cashier, Auditor.
- Dữ liệu: Journal Entry/lines, GL Entry, Payment Ledger Entry, source documents, Account, dimensions.

## Khối 2 — Layout desktop/mobile

- Desktop: workspace KPI → tabs chứng từ/GL/subledger; data table có dòng tổng trang/toàn filter; form drawer + child grid; panel lineage source→postings→report.
- Mobile: KPI card + record cards; form full-screen, child lines dạng expandable cards; GL read-only card, filter bottom sheet; không bảng ngang.
- Cursor server, virtualization >200, query budget; số tiền đầy đủ ở bảng, canh phải/tabular; dữ liệu nhạy cảm mask theo role.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Exception/approval board; GL không Kanban. |
| #8 AI | Hỏi số dư/lineage theo tool read-only và dẫn kỳ/filter; không tạo/post entry. |
| #18 Vòng đời | Chứng từ `draft→submitted→approved→posted→reversed/amended`; GL append-only. |
| #2 Xóa | Draft được soft-delete; submitted trở lên chỉ cancel/reverse/amend, giữ số. |
| #4 Báo cáo | Trial balance, GL, AR/AP aging, cash flow, journal register; KPI/chart drill-down 100%. |
| #5+#12 Thông báo | In-app/email/Zalo cho phiếu chờ duyệt, nợ đến hạn, post fail; không Web Push. |
| #6 Barcode | Quét barcode/QR chứng từ mở record; không dùng mã để bỏ qua permission. |
| #10 Media/QR/OCR | Ảnh/PDF bằng chứng R2; OCR gợi ý supplier/date/amount, người dùng xác nhận; bất biến sau post. |
| #11 In | Phiếu thu/chi, journal voucher, invoice, sổ A4/PDF theo template versioned. |
| #13 Mã tự động | Counter theo loại/năm/branch; số chính thức lúc save, void giữ số. |
| #14 Lịch | Calendar posting/due dates; click mở record đã lọc. |
| #15 Tiện ích VN | VND format, 4 số cuối đối tác, paste dòng từ Excel, chip ngày, clone, lưu & tạo tiếp, keyboard-first. |
| #19 Master data | Account, tax, cost center, branch, project, party, payment method đều là link-field/master. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `AccountingDataViewDesktop` / `AccountingRecordListMobile` | filter/sort/cursor/bulk/export/totals | row/field scoped |
| `DocumentFormDrawer` | header + child grid + evidence + rule trace | role/action policy |
| `PostingPreview` | debit/credit, dimensions, rule version, period | Accountant preview; Chief post |
| `LineagePanel` | source doc→JE→GL/subledger→report/tax | Accountant/Auditor |
| `LedgerReportViewer` | saved filters, compare period, drill-down, print | report permission |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Tạo/clone/lưu draft | Zod, FK, amount, dimensions, optimistic lock | mã chính thức, highlight; lỗi field inline |
| Submit/approve | completeness, source state, SoD, period | state event + approval task |
| Post | period, account effectivity, debit=credit, idempotency | atomic document+GL+subledger+audit |
| Reverse/amend | posted original, reason, open adjustment period | linked reversal/new version |
| Export/print | report permission, filter, rate limit | async artifact private + audit |

## Khối 5 — Autofill

- Company/branch/currency/date từ context; account/tax/dimension từ party/item/ruleset theo posting date.
- Chọn source invoice/payment tự điền số còn nợ và phân bổ cũ→mới; hiển thị provenance, không ghi đè dirty.
- Paste Excel tạo child rows và validate từng dòng trước lưu; last-used payment method theo user.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton KPI/table/form cục bộ. |
| Chưa có dữ liệu | CTA tạo chứng từ hoặc import theo quyền. |
| Lọc không ra | Hiện filter chips và nút xóa tất cả. |
| Error | Block theo vùng; form giữ nguyên; correlation ID copy được. |
| Thiếu quyền | Field mask/403; số nhạy cảm không có trong payload. |
| Saved/success | Nút “Đã lưu ✓”, dòng highlight, toast Xem/In. |
| Mạng gián đoạn | Read cache nếu có; mọi mutation/post bị khóa; draft localStorage, không queue/PWA. |
