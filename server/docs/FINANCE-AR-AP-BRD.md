# BRD — Tài chính và công nợ phải thu/phải trả

Trạng thái: **G1 đã duyệt, đang triển khai G2**  
Ngày lập: **2026-07-31**  
Ngày duyệt phạm vi: **2026-07-31**  
Branch: `feat/finance-ar-ap-completion`

## 1. Quyết định đã duyệt

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

## 3. Mục tiêu

### G1 — Hạn thanh toán và aging

- Sales Invoice metadata yêu cầu người dùng nhập Due Date cho chứng từ mới.
- Database xác thực due date khi được cung cấp:
  - đúng ISO `YYYY-MM-DD`;
  - là ngày tồn tại;
  - không trước posting date.
- Để không phá API và fixture cũ, invoice thiếu due date vẫn được chấp nhận trong giai đoạn compatibility rollout.
- Invoice thiếu due date dùng posting date làm fallback và được đánh dấu `due_date_source = posting_date_fallback`.
- Invoice có due date rõ ràng được đánh dấu `due_date_source = explicit`.
- Hard database enforcement cho sự hiện diện của due date chỉ được bật bằng migration append-only sau khi backfill/checksum xác nhận `unresolved = 0` và staging smoke pass.
- AR/AP Aging bắt buộc `as_of_date`.
- Chỉ cộng Payment Ledger rows có posting date không sau cutoff.
- Mỗi dòng có party, company, account, currency, voucher, posting date, due date, due-date source, invoice total, allocated, outstanding, days overdue và bucket.
- Tổng bucket phải bằng tổng outstanding theo cùng filter/currency.
- User filters phải whitelist và parameterized.

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

## 4. Tác nhân và quyền

| Tác nhân | Phạm vi |
|---|---|
| Accounts User | Tạo draft payment/allocation, xem AR/AP reports |
| Accounts Manager | Submit/cancel/reverse payment và allocation |
| Sales Manager | Xem AR Aging thuộc domain bán hàng |
| Purchase Manager | Xem AP Aging thuộc domain mua hàng |
| System Manager | Quản trị metadata/quyền, không bypass ledger invariant |
| Auditor/read-only | Xem ledger, aging, statement và audit trail |

Tenant, company và data scope phải được áp dụng ở server/query layer. UI ẩn nút không phải security boundary.

## 5. Contract dữ liệu

### 5.1 Invoice terms

- `due_date?: string` trong compatibility phase.
- `due_date_source: explicit | posting_date_fallback` trong read model.
- `payment_terms_days?: number` dành cho pha payment terms sau.
- `payment_terms_template?: string` dành cho pha derive sau.

Sau cutover, `due_date` trở thành bắt buộc ở database bằng migration mới. Không sửa migration `0030` sau khi chạy.

### 5.2 Payment Entry advance

- `references: PaymentReference[]` có thể rỗng.
- `allocated_amount_minor` là tổng references.
- `unallocated_amount_minor` không âm.
- GL ghi tiền/bank và party account như hiện tại.
- Payment Ledger tách phần allocated và advance source.

### 5.3 Payment Allocation

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

### 5.4 Read models

- `finance_invoice_terms`
- AR Aging
- AP Aging
- Party Statement
- Debt Summary
- Advance Balance

Read models derive từ immutable ledger + canonical invoice payload.

## 6. Luồng nghiệp vụ

### 6.1 Invoice compatibility phase

1. UI yêu cầu due date cho invoice mới.
2. Server/database xác thực due date nếu có.
3. Legacy/API payload thiếu due date vẫn submit được trong giai đoạn chuyển tiếp.
4. Aging đánh dấu rõ fallback để backfill, không giả vờ đó là hạn thanh toán đã được xác nhận.
5. Sau backfill và staging smoke, migration mới bật hard-presence guard.

### 6.2 Payment phân bổ ngay

1. Payment Entry tham chiếu invoice.
2. Server kiểm tra company/party/account/currency.
3. Guard chặn vượt outstanding.
4. GL và Payment Ledger ghi atomic.

### 6.3 Payment ứng trước

1. Payment Entry có references rỗng hoặc chưa dùng hết tiền.
2. Server ghi GL như payment bình thường.
3. Payment Ledger ghi phần invoice allocation và phần advance source.
4. Debt Summary hiển thị outstanding, advance và net exposure.

### 6.4 Phân bổ advance

1. Accounts User tạo Payment Allocation.
2. Server đọc source remaining và target outstanding.
3. Serialize theo company/party/account/currency.
4. D1 guard chặn source/target over-allocation.
5. Cancel append reversal.

## 7. Ngoài phạm vi

- Kế toán hợp nhất nhiều công ty.
- Cross-currency allocation.
- Credit-limit/Sales Order blocking trong pha đầu.
- Dự báo dòng tiền bằng ML.
- Reminder tự động SMS/email/Zalo.
- Statutory closing/chứng nhận pháp lý Việt Nam đầy đủ.
- Production deploy, secret hoặc activation nếu chưa có yêu cầu rõ.

## 8. Invariant không được phá

1. Mọi write qua DocumentKernel và Durable Object.
2. GL/Payment Ledger append-only; cancel bằng reversal.
3. D1 migration append-only.
4. Outstanding/advance là read model từ ledger.
5. Server permission và data scope authoritative.
6. Không commit `.env`, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
7. Không deploy Cloudflare/production nếu chưa có explicit request.

## 9. Trạng thái triển khai

### M1A — Due date và aging backend: implemented, chờ exact-head CI

- Migration `0030_finance_invoice_aging.sql`.
- `finance_invoice_terms` với `due_date_source`.
- AR/AP Aging compiler.
- Query Worker wiring.
- Permission mapping.
- Safe D1 error mapping.
- Migration/query/permission/error tests.

Evidence độc lập:

- compatibility migration fixture PASS;
- strict TypeScript harness PASS;
- SQL cutoff execution PASS.

Chưa hoàn thành cho tới khi root test/typecheck/build và GitHub exact-head CI xanh.

### M1B — Gate và worker integration

- Root tests/typecheck/build.
- D1ReportService/Query Worker integration fixture nếu cần.
- CI exact-head.

### M1C — Backfill và hard enforcement

- Dry-run report cho `posting_date_fallback`.
- Unresolved list/checksum.
- Operator-approved due-date correction.
- Staging migration/smoke.
- Append-only hard-presence migration khi unresolved = 0.

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

## 10. Definition of done

- Acceptance criteria đạt bằng automated tests.
- Root test/typecheck/build PASS.
- GitHub exact-head CI PASS.
- Không có unresolved migration/backfill trước hard enforcement hoặc activation.
- CURRENT_STATUS, NEXT_TASKS và AI_HANDOFF ghi đúng SHA/evidence.
- Không deploy production trong PR phát triển này.
