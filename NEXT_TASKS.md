# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Hoàn thiện tài chính và công nợ AR/AP

Contract: `server/docs/FINANCE-AR-AP-BRD.md`  
Branch: `feat/finance-ar-ap-completion`  
Draft PR: `#15`

### Quyết định đã chốt

- Customer AR + Supplier AP.
- Aging bucket: chưa đến hạn, 1–30, 31–60, 61–90, trên 90 ngày.
- Allocation chỉ cùng company, party, party account và currency.
- Credit-limit/Sales Order blocking và cross-currency allocation để pha sau.
- Không deploy Cloudflare, migrate production hoặc sửa production secrets khi chưa có yêu cầu rõ.

### Hoàn thành — M1A due date và aging backend

- Migration append-only `0030_finance_invoice_aging.sql`.
- Xác thực explicit due date; chặn ngày sai và ngày trước posting date.
- Sales Invoice metadata yêu cầu Due Date.
- Legacy/API invoice thiếu due date dùng `posting_date_fallback`.
- `finance_invoice_terms.due_date_source` phân biệt `explicit` và `posting_date_fallback`.
- `FinanceQueryCompiler` cho AR Aging và AP Aging.
- `as_of_date` bắt buộc; tenant/cutoff/filter parameterized.
- Outstanding derive từ Payment Ledger theo đúng cutoff.
- Query Worker dùng finance compiler cho synchronous/prepared reports.
- Permission cho Accounts/Sales Manager/Purchase Manager theo domain.
- D1 guard errors map thành validation 422.
- Migration/query/policy/error tests và Worker route regression test đã thêm.
- Nhánh đã đồng bộ default, PR mergeable và zero commits behind.

### Verification hiện có

- Migration compatibility fixture: **PASS**.
- Finance compiler strict harness: **PASS**.
- SQL cutoff/due-date-source fixture: **PASS**.
- PR Validation PASS trước Worker route test:
  - head `2afc670f4ed755c897837fd0fddd3633f7d5628d`;
  - run `30620083625`;
  - job `91122345078`;
  - test/typecheck/build đều PASS.
- Worker route test mới nằm trong `server/tests/*.test.mjs`, nên sẽ chạy bằng root `pnpm test` khi Actions khởi động được.

### M1B — Đóng gate aging backend

#### Blocker hạ tầng hiện tại

GitHub Actions đang fail trước runner trên nhiều SHA/run:

- `30620542741` / `91123803489`;
- `30620645454` / `91124137658`, rerun `91124386934`;
- `30620830770` / `91124730973`.

Các job không có step, không checkout và không có test log. Đây chưa phải code failure.

#### Việc cần làm

1. Kiểm tra trong GitHub UI:
   - Actions billing/spending limit;
   - Actions permissions của repository private;
   - runner/GitHub-hosted runner availability;
   - thông báo yêu cầu approval hoặc account restriction trên run.
2. Rerun workflow `PR Validation` trên exact head hiện hành.
3. Yêu cầu job `Test, typecheck and build` chạy thật và PASS:
   - install;
   - `pnpm test`, gồm `finance-aging-worker-route.test.mjs`;
   - `pnpm typecheck`;
   - `pnpm build`.
4. Ghi exact PASS head/run/job vào `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` và PR body.
5. Giữ PR draft cho tới khi exact-head gate xanh; không merge tự động.

### M1C — Backfill và hard due-date enforcement

1. Viết dry-run inventory cho `posting_date_fallback` theo tenant/company/doctype.
2. Xuất unresolved list và deterministic checksum; không đoán payment terms.
3. Cho operator bổ sung due date từ dữ liệu đã review.
4. Chỉ tạo migration hard-presence mới khi:
   - unresolved = 0;
   - checksum được duyệt;
   - staging migration và smoke PASS.
5. Không sửa migration `0030` sau khi đã tồn tại trên branch.

### M2 — Advance và Payment Allocation

1. Nới Payment Entry để hỗ trợ zero/partial/full allocation.
2. Server tính `unallocated_amount_minor`; client không authoritative.
3. Biểu diễn advance bằng immutable Payment Ledger row có source Payment Entry.
4. Thêm submittable `Payment Allocation` để reclassify Payment Ledger, không tạo GL mới.
5. Migration append-only cho source advance cap, target outstanding cap và cancel guards.
6. Serialize theo company/party/account/currency; giữ idempotency, OCC và D1 atomic batch.
7. Unit, SQL, route/integration và worker concurrency tests.

### M3 — Báo cáo còn lại

- Party Statement.
- Debt Summary.
- Advance Balance.
- Reconciliation totals với Payment Ledger theo cùng cutoff/currency.

### M4 — Metadata/UI

- Đưa AR/AP Aging vào report navigation.
- Form Payment Allocation metadata-driven.
- Invoice/payment timeline và drill-down.
- Confirmation + reason cho reverse/override.

## P0 — Gateway/sidebar production verification

- Xác nhận Gateway version/deployment ID chứa compact-sidebar trigger.
- Browser smoke desktop/mobile tại `alu.kairo.vn`.
- Kiểm sidebar overflow, tooltip/ellipsis, search, pin, collapse và console errors.
- Không dùng workflow Cloudflare observation của PR finance làm code gate.

## P0 — FIFO Purchase Receipt

### Core đã hoàn thành

- Migration `0027`–`0029`.
- Atomic document/stock/procurement/allocation persistence.
- Canonical material key.
- Supplier coordinator và retry revision conflict.
- PO obligation, Receipt FIFO submit và cancel reversal.
- Integration 200 + 100, nhận 230 => 200 + 30, còn 70.
- Baseline CI xanh tại `591ca359937d6ae12803d36c74996db8482060af`.

### Còn lại trước activation

1. Apply unapplied Receipt quantity khi PO mới gia nhập window.
2. Production-shaped cancel/multi-line/concurrency tests.
3. Settlement close/reverse, manual override, permission và reason.
4. Backfill resolved/unresolved/checksum và atomic activation.
5. Allocation preview/timeline/report.
6. Batch latency và supplier contention load test.
7. Staging migration/backfill/smoke.
8. Production backup mới và explicit approval.

FIFO rollout tiếp tục **disabled**.

## P0 — RBAC Slice B riêng

1. Mở branch từ default head hiện hành, không gộp vào PR finance.
2. Migration append-only cho permission audit.
3. Atomic create user + roles và atomic replace roles.
4. Last-admin guard và self-disable/self-demote guard.
5. Audit role/scope/enable-disable/password reset/session revoke.
6. Không ghi password, hash, token hoặc secret.
7. Targeted tests, root test/typecheck/build và exact-head PR Validation.

## P1/P2 backlog

- Purchase Order browser/PDF verification.
- Partial submitted-document save tests.
- Runtime page/dashboard/process completeness.
- Assign picker, attachment UI và tag UI.
- Frontend chunk reduction có đo lường.
- Local onboarding chuẩn, không dùng production secrets.
