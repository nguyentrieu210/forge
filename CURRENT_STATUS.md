# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head đã đồng bộ vào nhánh tài chính: `1207333163fdf31c576caa6ec8c11e88b078ca6e`.
- Working branch: `feat/finance-ar-ap-completion`.
- Draft PR: `#15` — `feat(finance): add invoice due dates and AR/AP aging`.
- Finance code/test head: `93c3f2ab5c7dd286c9f03cd13ad769ba14a65d8e`.
- Latest default merge commit trước commit trạng thái này: `43ef6cb6942b42a7f600086fefdad7c621e3f6ca`.
- PR mergeable; branch chứa workflow `pr-validation.yml` mới nhất từ default.
- Backup trước đồng bộ base: `backup/finance-ar-ap-pre-rebase-20260731` tại `a0f787e2a8abde287b184d5709985aec8cfd4eb8`.
- Workflow tạm dùng để đồng bộ branch và workflow tạm thử Worker đều đã bị xóa khỏi final diff.
- Final diff có 16 file finance/docs/test; không có workflow tạm, `.env`, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Tài chính và công nợ AR/AP

### Phạm vi đã chốt

- Customer AR + Supplier AP.
- Aging bucket: `Chưa đến hạn`, `1–30 ngày`, `31–60 ngày`, `61–90 ngày`, `Trên 90 ngày`.
- Allocation chỉ cùng company, party, party account và currency.
- Credit-limit/Sales Order blocking và cross-currency allocation để pha sau.
- BRD authoritative: `server/docs/FINANCE-AR-AP-BRD.md`.

### M1A đã implement — due date và aging backend

- Migration append-only `server/migrations/tenant/0030_finance_invoice_aging.sql`:
  - xác thực due date được cung cấp;
  - chặn ngày không tồn tại hoặc trước posting date;
  - thêm Due Date required vào metadata Sales Invoice;
  - giữ tương thích invoice/API cũ thiếu due date bằng fallback posting date;
  - projection `finance_invoice_terms` ghi `due_date_source` là `explicit` hoặc `posting_date_fallback`;
  - chưa hard-reject due date bị bỏ trống trước backfill/checksum/staging.
- `server/packages/query/src/finance-aging.ts`:
  - `Accounts Receivable Aging`;
  - `Accounts Payable Aging`;
  - bắt buộc `as_of_date` ISO;
  - tenant/cutoff/filter dùng bind parameter;
  - outstanding tại cutoff derive từ immutable Payment Ledger;
  - trả và lọc `due_date_source`.
- Query Worker dùng `FinanceQueryCompiler` cho synchronous và prepared reports.
- Permission server-side cho Accounts, Sales Manager và Purchase Manager theo domain.
- D1 due-date errors map thành `VALIDATION_ERROR` 422 an toàn.
- Migration test được nối vào `server/package.json` SQL gate.

### Test đã thêm

- `server/scripts/test-finance-aging-migration.py`
- `server/tests/finance-aging-query.test.mjs`
- `server/tests/finance-aging-policy.test.mjs`
- `server/tests/finance-aging-errors.test.mjs`
- `server/tests/finance-aging-worker-route.test.mjs`

Worker route test nằm trong `server/tests/*.test.mjs`, nên `pnpm test` bắt buộc chạy đường:

`HTTP request -> report permission -> FinanceQueryCompiler -> D1ReportService`.

SQL cutoff thực tế tiếp tục được kiểm bằng migration fixture SQLite.

## Verification và CI

### Targeted evidence

- Compatibility migration fixture: **PASS**.
- Finance compiler strict harness: **PASS**.
- SQL cutoff fixture: invoice 1.000, payment 300 trước cutoff, payment 700 sau cutoff => outstanding 700, overdue 21 ngày, bucket `1–30 ngày`: **PASS**.
- `due_date_source` projection/filter: **PASS**.

### Exact-head CI đã từng PASS

Trước khi thêm Worker route regression test:

- Head: `2afc670f4ed755c897837fd0fddd3633f7d5628d`.
- Workflow: `PR Validation` run `30620083625`.
- Job: `91122345078` — `Test, typecheck and build`.
- Install, `pnpm test`, `pnpm typecheck`, `pnpm build`: **PASS**.

### Các failure trước runner đã quan sát

- `30620542741`, job `91123803489`;
- `30620645454`, job `91124137658`, rerun job `91124386934`;
- `30620830770`, job `91124730973`.

Các job trên có `steps` rỗng, chưa checkout và log download trả `BlobNotFound`. Chưa có bằng chứng code regression từ các run đó.

Default sau đó cập nhật `pr-validation.yml` tại `1207333163fdf31c576caa6ec8c11e88b078ca6e`; finance branch đã merge đúng workflow mới. Cần đọc PR Validation trên commit người dùng kế tiếp để xác định blocker đã hết hay chưa.

PR vẫn draft và chưa được coi là exact-head verified sau Worker route test cho tới khi install/test/typecheck/build chạy thật.

## Safety

- Không deploy Cloudflare.
- Không migrate production.
- Không sửa production secrets.
- Không bật FIFO rollout.
- Không merge PR #15 khi exact-head gate chưa chạy thật.

## Sidebar/Gateway production

- Sidebar desktop đã gọn tại `client/apps/runtime/src/styles.css`; không đổi route hoặc permission.
- Gateway trigger hiện có nhưng vẫn thiếu deployment/version ID và browser smoke production được ghi thành bằng chứng.
- Workflow Cloudflare Production Release Observation trên PR finance không phải code gate.

## FIFO Purchase Receipt

- Core FIFO migrations `0027`–`0029`, atomic persistence, canonical material key, supplier coordinator và submit/cancel lifecycle đã có trên baseline CI xanh `591ca359937d6ae12803d36c74996db8482060af`.
- Rollout vẫn phải **disabled**.
- Còn blocker: apply unapplied khi PO mới vào window, settlement/override lifecycle, backfill/checksum/activation, worker concurrency/load, UI/report và staging smoke.

## RBAC

- Slice A đã squash-merge vào default qua commit `93ac85a0f16c2668b706ffcf8e15d3da53c8c7a9`.
- Slice B đang dùng workflow gate riêng trên PR #38; điều kiện không áp dụng cho PR finance #15.
- Finance PR chỉ cần job `Test, typecheck and build`.
