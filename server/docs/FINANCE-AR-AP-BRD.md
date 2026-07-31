# BRD — Tài chính và công nợ phải thu/phải trả

Trạng thái: **Draft chờ duyệt G1**  
Ngày lập: **2026-07-31**  
Branch: `feat/finance-ar-ap-completion`

## 1. Bối cảnh và bằng chứng hiện có

Forge đã có nền tảng kế toán giao dịch, không xây lại từ đầu:

- Sales Invoice và Purchase Invoice ghi GL cùng Payment Ledger qua DocumentKernel/Durable Object.
- Payment Entry hỗ trợ thu khách hàng và trả nhà cung cấp, kiểm tra outstanding và tỷ giá lịch sử.
- Credit Note, Debit Note, Journal Entry, Expense Claim và Bank Reconciliation đã có phạm vi RC.
- Hai báo cáo `Accounts Receivable` và `Accounts Payable` hiện chỉ thể hiện số dư theo chứng từ.
- Payment Entry hiện bắt buộc phân bổ toàn bộ số tiền vào hóa đơn, nên chưa quản lý được tiền ứng trước hoặc khoản chưa xác định chứng từ.
- Projection hiện chưa cung cấp aging theo ngày đến hạn, số ngày quá hạn, sao kê đối tác hoặc tổng hợp nợ đến hạn.

Nguồn sự thật tiếp tục là immutable GL/Payment Ledger và canonical document. Không được cập nhật trực tiếp outstanding trên hóa đơn như một số hệ thống vẫn làm rồi cầu nguyện dữ liệu tự khớp.

## 2. Giả định và câu hỏi cần quyết định

### Giả định mặc định

1. Phạm vi áp dụng cho cả Customer AR và Supplier AP.
2. Mỗi hóa đơn có `due_date`; nếu bỏ trống, server dùng ngày chứng từ hoặc điều khoản thanh toán mặc định của đối tác.
3. Không bù trừ giữa các loại tiền. Mọi allocation phải cùng company, party, party account và transaction currency.
4. Aging dùng `as_of_date` do người dùng chọn và chỉ cộng ledger rows có `posting_at <= as_of_date`.
5. Payment Entry được phép có phần chưa phân bổ; phần này trở thành advance của đối tác trong Payment Ledger.
6. Việc phân bổ advance vào hóa đơn thực hiện bằng chứng từ append-only `Payment Allocation`, không sửa lịch sử Payment Entry.
7. Xóa nợ hoặc điều chỉnh thủ công phải đi qua Journal Entry hoặc action chuyên biệt có account, permission và reason; không sửa số dư trực tiếp.
8. Không tự động gửi nhắc nợ trong giai đoạn này.

### Quyết định người dùng cần duyệt

- Có áp dụng hạn mức tín dụng và chặn Sales Order khi quá hạn/hạn mức ngay trong đợt này hay để pha sau.
- Bucket aging mặc định: `Chưa đến hạn`, `1–30`, `31–60`, `61–90`, `Trên 90 ngày`.
- Có cho Accounts Manager phân bổ advance khác currency bằng tỷ giá tại ngày allocation hay giữ nguyên quy tắc cùng currency. Khuyến nghị giữ cùng currency.

## 3. Vấn đề cần giải quyết

1. Nhân viên không biết khoản nào sắp đến hạn, đã quá hạn bao lâu và khách/NCC nào cần xử lý trước.
2. Tiền ứng trước hoặc thanh toán chưa xác định hóa đơn không thể ghi nhận đúng luồng hiện tại.
3. Không có thao tác phân bổ lại/reverse allocation có audit đầy đủ.
4. Không có sao kê công nợ theo đối tác và số dư đầu kỳ, phát sinh, thanh toán, số dư cuối kỳ.
5. Báo cáo AR/AP hiện tại không đủ để đối chiếu giữa hóa đơn, thanh toán và GL tại một ngày chốt.
6. Trạng thái nợ và quyền điều chỉnh chưa được đóng thành contract xuyên backend, query và metadata UI.

## 4. Mục tiêu và tiêu chí đo được

### G1 — Hạn thanh toán và aging

- Sales Invoice và Purchase Invoice lưu `due_date` canonical do server xác thực.
- Báo cáo AR/AP Aging nhận `as_of_date`, party, company, currency và account làm filter.
- Mỗi dòng trả về invoice total, paid/allocated, outstanding, due date, days overdue và aging bucket.
- Tổng các bucket bằng tổng outstanding trong cùng filter/currency.

### G2 — Advance và phân bổ

- Payment Entry cho phép references rỗng hoặc tổng allocated nhỏ hơn paid amount.
- `unallocated_amount_minor = paid_amount_minor - allocated_amount_minor` do server tính.
- Payment Allocation phân bổ advance vào một hoặc nhiều invoice, không vượt source advance hoặc target outstanding tại commit time.
- Submit/cancel/retry không tạo double allocation nhờ command id, OCC và D1 guards.

### G3 — Sao kê và đối chiếu

- Báo cáo Party Statement thể hiện opening, invoice/debit, credit/payment, running balance và closing theo khoảng ngày.
- Báo cáo Debt Summary tổng hợp theo party: total outstanding, due, overdue, oldest due date, advances và net exposure.
- Có kiểm thử chứng minh tổng Payment Ledger theo party/account/currency khớp báo cáo chi tiết.

### G4 — Kiểm soát và audit

- Server permission là authoritative.
- Allocation/reversal/manual adjustment bắt buộc actor, timestamp và reason khi là override.
- Invoice không được cancel nếu còn allocation hoạt động.
- Payment Entry không được cancel nếu advance đã được phân bổ bởi chứng từ khác.
- Không sửa migration đã chạy; mọi schema thay đổi dùng migration append-only mới.

## 5. Tác nhân và phạm vi dữ liệu

| Tác nhân | Phạm vi |
|---|---|
| Accounts User | Tạo draft Payment Entry/Payment Allocation, xem báo cáo được cấp quyền |
| Accounts Manager | Submit/cancel payment và allocation, reverse, thực hiện adjustment có reason |
| Sales User/Manager | Xem công nợ khách hàng thuộc quyền dữ liệu bán hàng; không sửa ledger |
| Purchase User/Manager | Xem công nợ nhà cung cấp thuộc quyền mua hàng; không sửa ledger |
| System Manager | Quản trị metadata/quyền; không bypass invariant kế toán |
| Auditor/Read-only role | Xem ledger, aging, statement và audit trail; không mutation |

Tenant, company, user permission và party scope phải được áp dụng ở server/query layer, không dựa vào việc UI có giấu nút hay không.

## 6. Thực thể và contract dữ liệu

### 6.1 Invoice payment terms

Bổ sung canonical fields cho Sales Invoice và Purchase Invoice:

- `due_date: string` — ISO date, bắt buộc khi submit.
- `payment_terms_days?: number` — snapshot số ngày tại thời điểm submit.
- `payment_terms_template?: string` — optional link, chỉ dùng để derive snapshot.

Invariant:

- `due_date >= posting_date` trừ khi Accounts Manager có override reason rõ ràng.
- Sau submit, thay đổi due date phải qua amend/versioned action, không PUT ngầm.

### 6.2 Payment Entry advance

Giữ các field hiện có và chuẩn hóa:

- `references: PaymentReference[]` có thể rỗng.
- `allocated_amount_minor` là tổng references.
- `unallocated_amount_minor` có thể lớn hơn 0 nhưng không âm.
- Advance được biểu diễn bằng Payment Ledger row gắn với source Payment Entry để có thể theo dõi và reverse.

### 6.3 Payment Allocation

Submittable document mới:

- `company`
- `party_type`: Customer hoặc Supplier
- `party`
- `party_account`
- `currency`, `currency_scale`
- `posting_at`
- `source_payment_entry`
- `reason?`
- `references[]`: target invoice, allocated amount
- `total_allocated_amount`, server-derived

Ledger effect khi submit:

1. Giảm advance còn lại của source Payment Entry.
2. Giảm outstanding của từng target invoice.
3. Không tạo GL mới vì tiền đã được ghi GL ở Payment Entry; đây là reclassification trong Payment Ledger.

Cancel tạo reversal rows, không delete ledger.

### 6.4 Read models

- `receivable_aging`
- `payable_aging`
- `party_statement`
- `party_debt_summary`
- `payment_advance_balance`

Các projection phải derive từ immutable ledger + canonical invoice payload, không lưu số dư mutable riêng.

## 7. Luồng nghiệp vụ

### 7.1 Hóa đơn bán/mua

1. Người dùng tạo invoice.
2. Server derive/validate due date và snapshot payment terms.
3. Submit ghi document + GL + Payment Ledger trong cùng atomic batch.
4. Aging và statement đọc được invoice ngay tại cùng commit sequence.

Failure branches:

- Thiếu party/account/currency/due date hợp lệ: validation fail trước write.
- Posting period khóa: từ chối submit.
- Duplicate command/retry: trả mutation receipt cũ, không post thêm ledger.

### 7.2 Thanh toán phân bổ ngay

1. Payment Entry tham chiếu một hoặc nhiều invoice.
2. Server kiểm tra same company/party/account/currency.
3. Commit-time guard chặn allocated vượt outstanding.
4. GL và Payment Ledger ghi atomic.

### 7.3 Thanh toán ứng trước/chưa phân bổ

1. Payment Entry có references rỗng hoặc chưa dùng hết số tiền.
2. Server ghi GL tiền/bank và party account như hiện tại.
3. Payment Ledger ghi phần allocated vào invoice và phần unallocated vào advance source.
4. Báo cáo Debt Summary hiển thị riêng outstanding, advance và net exposure.

### 7.4 Phân bổ advance sau

1. Accounts User tạo Payment Allocation từ một source Payment Entry.
2. Server đọc advance còn lại và target outstanding tại revision hiện hành.
3. Submit trong DO của party/account để serialize các allocation cạnh tranh.
4. D1 guard chặn over-allocation ở source hoặc target.
5. Cancel chỉ được phép khi downstream allocation không tồn tại; reversal rows được append.

### 7.5 Sao kê và chốt công nợ

1. Người dùng chọn party, company, currency, from/to hoặc as-of date.
2. Query trả opening balance từ trước kỳ, movement trong kỳ và closing balance.
3. Mọi tổng phải khớp tổng Payment Ledger theo cùng cutoff.

## 8. Ma trận quyền hành động

| Hành động | Accounts User | Accounts Manager | Sales/Purchase User | Auditor | System Manager |
|---|---:|---:|---:|---:|---:|
| Xem AR/AP aging | Có | Có | Theo domain | Có | Có |
| Xem party statement | Có | Có | Theo domain | Có | Có |
| Tạo draft Payment Entry | Có | Có | Không | Không | Có |
| Submit/cancel Payment Entry | Không | Có | Không | Không | Có |
| Tạo draft Payment Allocation | Có | Có | Không | Không | Có |
| Submit/cancel allocation | Không | Có | Không | Không | Có |
| Override due date | Không | Có, cần reason | Không | Không | Có, cần reason |
| Write-off/manual adjustment | Không | Có, cần account + reason | Không | Không | Có, cần account + reason |

## 9. Bề mặt tương tác

- Metadata-driven Desk form cho Payment Entry và Payment Allocation.
- Report list cho AR Aging, AP Aging, Party Statement và Debt Summary.
- Invoice form hiển thị due date, outstanding, paid, advance applied và timeline allocation.
- Party form có shortcut tới statement và debt summary.
- Không tạo dashboard/framework riêng; dùng runtime metadata/report hiện có.

## 10. Ngoài phạm vi

- Kế toán hợp nhất nhiều công ty.
- Bù trừ tự động chéo currency.
- Dự báo dòng tiền bằng ML.
- Thu hồi nợ tự động, SMS/email/Zalo reminder.
- Factoring, thư tín dụng, bảo lãnh ngân hàng.
- Chuẩn mực/statutory closing đầy đủ hoặc chứng nhận pháp lý Việt Nam.
- Sửa production secret hoặc bật rollout production trong đợt phát triển.

## 11. Quyết định và invariant không được phá

1. Mọi write qua DocumentKernel và Durable Object.
2. GL và Payment Ledger là append-only; cancel/reverse bằng dòng đảo.
3. D1 migration append-only.
4. Outstanding và advance là read model từ ledger, không client-authoritative.
5. Server permission và data scope là authoritative.
6. Không commit `.env`, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
7. Không deploy Cloudflare hoặc production nếu chưa có yêu cầu rõ ràng mới.

## 12. Kế hoạch kỹ thuật sau khi BRD được duyệt

### M1 — Contract và migration

- Migration tenant tiếp theo cho allocation guards/views/metadata.
- Mở rộng contracts cho due date, advance và Payment Allocation.
- SQL tests cho source advance cap, target outstanding cap, cancel guard và cutoff aging.

### M2 — Controller và atomic persistence

- Nới Payment Entry để hỗ trợ partial/unallocated.
- Thêm Payment Allocation controller và ledger lines.
- Bổ sung persistence mapping vào D1 batch và reader APIs.

### M3 — Query/report

- Thêm AR/AP Aging, Party Statement, Debt Summary, Advance Balance.
- Filter whitelist, ordering, row limits và prepared report threshold.

### M4 — Metadata/UI

- Metadata append-only migration cho field/form/report/action.
- Timeline allocation trên invoice/payment.
- Confirmation + reason cho reverse/override.

### M5 — Backfill và rollout

- Dry-run report xác định invoice thiếu due date và legacy payments.
- Không activation nếu có unresolved records.
- Staging migration, fixtures, browser smoke và reconciliation evidence.

### M6 — Verification

- Targeted unit/integration/SQL/worker concurrency tests.
- `pnpm run test`
- `pnpm run typecheck`
- `pnpm run build`
- GitHub CI xanh cho exact head SHA trước mọi staging action.

## 13. Acceptance criteria tổng

Module đạt G3 local verification khi:

1. Invoice submit luôn có due date canonical.
2. Payment Entry hỗ trợ zero/partial/full allocation mà GL vẫn cân.
3. Payment Allocation submit/cancel giữ tổng party balance, không tạo GL và không over-allocate.
4. AR/AP Aging đúng cutoff và bucket; tổng bucket bằng outstanding.
5. Party Statement opening + movement = closing.
6. Debt Summary tách outstanding, advance và net exposure theo currency.
7. Permission, reason, idempotency, OCC và concurrency tests pass.
8. Root test/typecheck/build pass.
9. `CURRENT_STATUS.md` và `NEXT_TASKS.md` ghi đúng SHA/checks; không tuyên bố production-ready nếu chưa staging và CI.
