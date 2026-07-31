# AI HANDOFF

## Dự án

Forge là monorepo ERP đa tenant trên Cloudflare. Backend CloudForge cung cấp API hình dạng Frappe; frontend MetaForge là React Desk metadata-driven dùng chung. Repo vận hành chuẩn: `C:\Forge`, pnpm 9, Node 22+.

## Git hiện tại

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head đã merge vào finance branch: `984c8655db5fea4de10baa41be59c79df99b2aa9`.
- Working branch: `feat/finance-ar-ap-completion`.
- Draft PR: `#15` — `feat(finance): add invoice due dates and AR/AP aging`.
- Finance code/test head: `93c3f2ab5c7dd286c9f03cd13ad769ba14a65d8e`.
- Latest default merge commit trước handoff cuối: `e03dbca7fa4c22594131a9bfd32653c1da77102f`.
- Backup trước đồng bộ base: `backup/finance-ar-ap-pre-rebase-20260731` tại `a0f787e2a8abde287b184d5709985aec8cfd4eb8`.
- PR mergeable, zero commits behind default tại thời điểm handoff.
- Final PR diff không chứa workflow tạm.

Đọc đầu tiên khi tiếp tục:

1. `CURRENT_STATUS.md`
2. `NEXT_TASKS.md`
3. `server/docs/FINANCE-AR-AP-BRD.md`
4. `server/docs/FINANCE-AR-AP-IMPLEMENTATION.md`
5. PR #15 và exact-head Actions state

## Finance AR/AP scope đã chốt

- Customer AR + Supplier AP.
- Bucket aging: chưa đến hạn, 1–30, 31–60, 61–90, trên 90 ngày.
- Allocation chỉ cùng company, party, party account và currency.
- Credit-limit/Sales Order blocking và cross-currency để pha sau.
- GL/Payment Ledger là nguồn sự thật; không lưu outstanding mutable client-authoritative.

## Đã implement — M1A due date và aging

### Migration

`server/migrations/tenant/0030_finance_invoice_aging.sql`

- Xác thực explicit due date.
- Chặn ngày không tồn tại hoặc trước posting date.
- Sales Invoice metadata có Due Date required.
- Legacy/API invoice thiếu due date vẫn hoạt động bằng posting-date fallback.
- `finance_invoice_terms.due_date_source` là `explicit` hoặc `posting_date_fallback`.
- Chưa hard-reject omitted due date trước backfill/checksum/staging.

Không sửa migration `0030`; hard presence enforcement phải là migration append-only mới.

### Query/report

`server/packages/query/src/finance-aging.ts`

- `Accounts Receivable Aging`.
- `Accounts Payable Aging`.
- Bắt buộc `as_of_date` ISO.
- Tenant/cutoff/filter parameterized.
- Outstanding tại cutoff derive từ immutable Payment Ledger.
- Trả và lọc `due_date_source`.

`server/apps/query-worker/src/index.ts` dùng `FinanceQueryCompiler` cho synchronous và prepared reports.

### Permission/error

- `server/packages/policy/src/index.ts`: Accounts/Sales Manager/Purchase Manager theo domain.
- `server/packages/core/src/errors.ts`: D1 due-date guards thành validation 422 an toàn.
- `server/package.json`: migration test nối vào SQL gate.

### Tests

- `server/scripts/test-finance-aging-migration.py`
- `server/tests/finance-aging-query.test.mjs`
- `server/tests/finance-aging-policy.test.mjs`
- `server/tests/finance-aging-errors.test.mjs`
- `server/tests/finance-aging-worker-route.test.mjs`

Worker route regression nằm trong root `server/tests/*.test.mjs`, kiểm:

`HTTP -> permission -> FinanceQueryCompiler -> D1ReportService`.

SQL cutoff thực thi thật được kiểm bằng migration fixture SQLite.

## Verification

### PASS trước Worker route test

- Head: `2afc670f4ed755c897837fd0fddd3633f7d5628d`.
- PR Validation run: `30620083625`.
- Job: `91122345078` — `Test, typecheck and build`.
- Install/test/typecheck/build: PASS.

### Targeted evidence

- Compatibility migration fixture: PASS.
- Strict compiler harness: PASS.
- SQL cutoff fixture: PASS.
- `due_date_source` projection/filter: PASS.

### Workflow diagnosis

Nhiều run sau đó fail trước runner với `steps=[]`, chưa checkout và log `BlobNotFound`. PR #38 dùng cùng workflow cũng gặp đúng triệu chứng, nên không phải finance test failure.

Default đã sửa workflow RBAC qua chuỗi commit đến `984c8655db5fea4de10baa41be59c79df99b2aa9`; finance branch đã merge bản simplified gate cuối. Đọc PR Validation trên commit người dùng mới nhất. Với PR #15:

- job `Test, typecheck and build` phải chạy đầy đủ;
- RBAC Slice B job phải thoát sớm vì `PR_NUMBER != 38`;
- không công nhận PASS nếu checkout/test/typecheck/build chưa thực thi.

PR giữ draft. Không merge nếu exact-head gate chưa PASS.

## Remaining finance roadmap

1. Close exact-head CI gate.
2. M1C dry-run inventory/checksum for `posting_date_fallback`.
3. Hard due-date presence migration only after unresolved = 0 and staging smoke.
4. M2 Payment Entry zero/partial/full allocation and unallocated advance.
5. Append-only Payment Allocation with source/target caps and cancel guards.
6. Party Statement, Debt Summary, Advance Balance.
7. Aging/report navigation and allocation UI/timeline.

## Architecture invariants

- Browser enters Gateway Worker; Gateway resolves tenant and signs trusted identity.
- Tenant Worker/Frappe facade enforces server-side permission.
- All business mutations go through DocumentKernel/Durable Object.
- D1 migrations are append-only.
- UI hidden buttons are not a security boundary.
- No cross-tenant reads/writes.
- Finance allocation remains same-currency in phase one.

## Other project status

### FIFO Purchase Receipt

- Core migrations `0027`–`0029`, allocation persistence, material key, supplier coordinator and FIFO submit/cancel exist.
- Baseline CI green: `591ca359937d6ae12803d36c74996db8482060af`, run `30570000862`.
- Rollout remains disabled.
- Remaining: apply unapplied, settlement/override, backfill/checksum/activation, concurrency/load, UI/report, staging smoke.

### RBAC

- Slice A merged into default at `93ac85a0f16c2668b706ffcf8e15d3da53c8c7a9` with exact-head PR Validation PASS.
- Slice B is isolated to PR #38 and its workflow must not mutate finance PR #15.

### Gateway/sidebar

- Compact sidebar code exists.
- Production deployment/version ID and browser smoke evidence remain incomplete.

## Safety

- Do not deploy Cloudflare without explicit request.
- Do not migrate production without explicit request.
- Do not edit production secrets.
- Do not enable FIFO rollout.
- Do not commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backups or generated artifacts.
