# BRD — Tài chính và công nợ phải thu/phải trả

Trạng thái: **G1 đã duyệt, đang triển khai G2**  
Ngày lập: **2026-07-31**  
Ngày duyệt phạm vi: **2026-07-31**  
Branch: `feat/finance-ar-ap-completion`

## 1. Quyết định đã duyệt

Người dùng cho phép tiếp tục theo phương án mặc định an toàn:

1. Phạm vi áp dụng cho cả Customer AR và Supplier AP.
2. Aging bucket mặc định:
   - `Chưa đến hạn`;
   - `1–30 ngày`;
   - `31–60 ngày`;
   - `61–90 ngày`;
   - `Trên 90 ngày`.
3. Allocation chỉ cùng company, party, party account và transaction currency.
4. Không hỗ trợ cross-currency allocation trong pha đầu.
5. Credit limit và chặn Sales Order để pha sau.
6. Không tự động gửi reminder trong pha này.
7. GL và Payment Ledger tiếp tục là nguồn sự thật; không cập nhật outstanding trực tiếp trên hóa đơn.

## 2. Bối cảnh

Forge đã có nền tảng kế toán giao dịch:

- Sales Invoice và Purchase Invoice ghi GL cùng Payment Ledger qua DocumentKernel/Durable Object.
- Payment Entry hỗ trợ thu khách hàng và trả nhà cung cấp, kiểm tra outstanding và tỷ giá lịch sử.
- Credit Note, Debit Note, Journal Entry, Expense Claim và Bank Reconciliation đã có phạm vi RC.
- Báo cáo `Accounts Receivable` và `Accounts Payable` hiện chỉ thể hiện số dư theo chứng từ.
- Payment Entry hiện bắt buộc phân bổ toàn bộ số tiền vào hóa đơn.
- Chưa có aging theo ngày đến hạn, advance balance, party statement hoặc debt summary.

## 3. Vấn đề cần giải quyết

1. Không biết khoản nào sắp đến hạn hoặc quá hạn bao lâu.
2. Không ghi nhận đúng tiền ứng trước/chưa xác định hóa đơn.
3. Không có phân bổ lại/reverse allocation append-only.
4. Không có sao kê đối tác với opening, movement và closing balance.
5. Không có tổng hợp due, overdue, advance và net exposure.
6. Quyền điều chỉnh và audit chưa đóng thành contract xuyên backend, query và UI.

## 4. Mục tiêu và acceptance criteria

### G1 — Hạn thanh toán và aging

- Sales Invoice và Purchase Invoice có `due_date` canonical.
- Khi submit, due date bắt buộc, là ISO `YYYY-MM-DD` hợp lệ và không trước posting date.
- Legacy invoice thiếu due date không bị rewrite tự động; report tạm fallback về posting date cho tới backfill.
- AR/AP Aging bắt buộc `as_of_date`.
- Chỉ cộng Payment Ledger rows có posting date không sau cutoff.
- Mỗi dòng có party, company, account, currency, voucher, posting date, due date, invoice total, allocated, outstanding, days overdue và bucket.
- Tổng bucket phải bằng tổng outstanding theo cùng filter/currency.
- User filters phải parameterized và whitelist.

### G2 — Advance và phân bổ

- Payment Entry cho phép references rỗng hoặc allocated nhỏ hơn paid amount.
- `unallocated_amount_minor = paid_amount_minor - allocated_amount_minor` do server tính.
- Advance phải truy được về source Payment Entry.
- Payment Allocation phân bổ advance vào một hoặc nhiều invoice.
- Commit-time guards chặn vượt source advance và target outstanding.
- Submit/cancel/retry không double allocate nhờ command id, OCC và D1 invariant.
- Allocation không tạo GL mới; chỉ reclassify Payment Ledger.

### G3 — Sao kê và đối chiếu

- Party Statement có opening, invoice/debit, credit/payment, running balance và closing.
- Debt Summary có total outstanding, due, overdue, oldest due date, advances và net exposure.
- Advance Balance hiển thị source payment, remaining advance và lịch sử allocation.
- Tổng report phải khớp Payment Ledger theo cùng cutoff, account và currency.

### G4 — Kiểm soát và audit

- Server permission là authoritative.
- Allocation/reversal/manual adjustment ghi actor, timestamp và reason khi override.
- Invoice không cancel nếu còn allocation hoạt động.
- Payment Entry không cancel nếu advance đã được downstream allocation sử dụng.
- Mọi schema thay đổi dùng migration append-only.

## 5. Tác nhân và quyền

| Tác nhân | Phạm vi |
|---|---|
| Accounts User | Tạo draft payment/allocation, xem AR/AP reports |
| Accounts Manager | Submit/cancel/reverse payment và allocation |
| Sales Manager | Xem AR Aging thuộc domain bán hàng |
| Purchase Manager | Xem AP Aging thuộc domain mua hàng |
| System Manager | Quản trị metadata/quyền, không bypass ledger invariant |
| Auditor/read-only | Xem ledger, aging, statement và audit trail |

Tenant, company và data scope phải được áp dụng ở server/query layer. UI ẩn nút không phải security boundary.

## 6. Contract dữ liệu

### 6.1 Invoice terms

- `due_date: string` — ISO date, bắt buộc khi submit.
- `payment_terms_days?: number` — snapshot cho pha payment terms sau.
- `payment_terms_template?: string` — optional link cho pha derive sau.

Pha hiện tại yêu cầu người dùng nhập due date rõ ràng. Tự derive từ template/payment days thuộc lát cắt tiếp theo để tránh đưa logic không được kiểm chứng vào migration đầu.

### 6.2 Payment Entry advance

- `references: PaymentReference[]` có thể rỗng.
- `allocated_amount_minor` là tổng references.
- `unallocated_amount_minor` không âm.
- GL ghi tiền/bank và party account như hiện tại.
- Payment Ledger tách phần allocated và advance source.

### 6.3 Payment Allocation

Submittable document:

- `company`
- `party_type`
- `party`
- `party_account`
- `currency`, `currency_scale`
- `posting_at`
- `source_payment_entry`
- `reason?`
- `references[]`
- `total_allocated_amount`, server-derived

Submit giảm advance source và target outstanding bằng append-only Payment Ledger rows. Cancel tạo reversal rows, không delete.

### 6.4 Read models

- `finance_invoice_terms`
- AR Aging
- AP Aging
- Party Statement
- Debt Summary
- Advance Balance

Read models derive từ immutable ledger + canonical invoice payload.

## 7. Luồng nghiệp vụ

### 7.1 Invoice

1. Người dùng nhập invoice và due date.
2. Server/database validate due date.
3. Submit ghi document + GL + Payment Ledger atomic.
4. Aging đọc được invoice theo cutoff.

### 7.2 Payment phân bổ ngay

1. Payment Entry tham chiếu invoice.
2. Server kiểm tra company/party/account/currency.
3. Guard chặn vượt outstanding.
4. GL và Payment Ledger ghi atomic.

### 7.3 Payment ứng trước

1. Payment Entry có references rỗng hoặc chưa dùng hết tiền.
2. Server ghi GL như payment bình thường.
3. Payment Ledger ghi phần invoice allocation và phần advance source.
4. Debt Summary hiển thị outstanding, advance và net exposure.

### 7.4 Phân bổ advance

1. Accounts User tạo Payment Allocation.
2. Server đọc source remaining và target outstanding.
3. Serialize theo company/party/account/currency.
4. D1 guard chặn source/target over-allocation.
5. Cancel append reversal.

### 7.5 Statement

1. Người dùng chọn party, company, currency và period/cutoff.
2. Query trả opening, movement và closing.
3. Tổng đối chiếu với Payment Ledger.

## 8. Bề mặt tương tác

- Metadata-driven form cho Payment Entry và Payment Allocation.
- Report navigation cho AR Aging, AP Aging, Party Statement và Debt Summary.
- Invoice form hiển thị due date, outstanding và timeline payment/allocation.
- Party form có shortcut tới statement/debt summary.
- Không tạo dashboard framework riêng.

## 9. Ngoài phạm vi

- Kế toán hợp nhất nhiều công ty.
- Cross-currency allocation.
- Credit-limit/Sales Order blocking trong pha đầu.
- Dự báo dòng tiền bằng ML.
- Reminder tự động SMS/email/Zalo.
- Factoring, LC, bảo lãnh ngân hàng.
- Statutory closing/chứng nhận pháp lý Việt Nam đầy đủ.
- Production deploy, secret hoặc activation nếu chưa có yêu cầu rõ.

## 10. Invariant không được phá

1. Mọi write qua DocumentKernel và Durable Object.
2. GL/Payment Ledger append-only; cancel bằng reversal.
3. D1 migration append-only.
4. Outstanding/advance là read model từ ledger.
5. Server permission và data scope authoritative.
6. Không commit `.env`, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
7. Không deploy Cloudflare/production nếu chưa có explicit request.

## 11. Kế hoạch và trạng thái

### M1A — Due date và aging backend: implemented, chờ exact-head CI

- Migration `0030_finance_invoice_aging.sql`.
- `finance_invoice_terms`.
- AR/AP Aging compiler.
- Query Worker wiring.
- Permission mapping.
- Safe D1 error mapping.
- Migration/query/permission/error tests.

Evidence độc lập:

- migration test PASS;
- strict TypeScript harness PASS;
- SQL cutoff execution PASS.

Chưa hoàn thành cho tới khi root test/typecheck/build và GitHub exact-head CI xanh.

### M1B — Gate và worker integration

- Root tests/typecheck/build.
- D1ReportService/Query Worker integration fixture nếu cần.
- CI exact-head.

### M2 — Advance và Payment Allocation

- Payment Entry partial/unallocated.
- Advance source ledger.
- Payment Allocation controller/document.
- D1 guards, persistence, coordinator và concurrency tests.

### M3 — Statement và summary

- Party Statement.
- Debt Summary.
- Advance Balance.
- Reconciliation tests.

### M4 — Metadata/UI

- Report navigation.
- Payment Allocation form.
- Invoice/payment timeline.
- Reverse/override confirmation + reason.

### M5 — Backfill và rollout

- Legacy dry-run.
- Unresolved/checksum report.
- Staging migration and smoke.
- Explicit production approval.

## 12. Definition of done

- Acceptance criteria đạt bằng automated tests.
- Root test/typecheck/build PASS.
- GitHub exact-head CI PASS.
- Không có unresolved migration/backfill trước activation.
- CURRENT_STATUS, NEXT_TASKS và AI_HANDOFF ghi đúng SHA/evidence.
- Không deploy production trong PR phát triển này.
