# AI HANDOFF

## Dự án này là gì

Forge là monorepo ERP đa tenant trên Cloudflare. Backend CloudForge cung cấp API tương thích hình dạng Frappe; frontend MetaForge là React Desk metadata-driven dùng chung. Ứng dụng ngành dọc được đóng gói thành manifest/brief và app Worker thay vì fork runtime.

Repo local chuẩn: `C:\Forge`. Package manager pnpm 9, Node từ 22.

## Hiện trạng

- Default branch: `hotfix/alumdoor-print-list-delete`.
- Latest default-branch commit quan sát: `cd60f8c09c48105db84a82c12ad3b32d9f075064`.
- Working branch: `feat/finance-ar-ap-completion`.
- Draft PR: `#15`.
- Finance exact head trước commit handoff này: `be615aac9e2d9943dcda0615ce1e5302c7a5670a`.
- Baseline code/schema đã qua CI trước đó: `591ca359937d6ae12803d36c74996db8482060af`, run `30570000862`, job `90964015638`: test/typecheck/build PASS.
- Finance branch chưa có exact-head code CI evidence; workflow quan sát Cloudflare không được tính là code gate.
- `server/work/` và `tmp/` là generated/work directories, không xóa hoặc commit.

## Workstream hiện tại — Tài chính và công nợ AR/AP

Người dùng đã cho phép tiếp tục theo phương án mặc định an toàn:

- Customer AR + Supplier AP.
- Aging bucket: chưa đến hạn, 1–30, 31–60, 61–90, trên 90 ngày.
- Allocation chỉ cùng company, party, party account và currency.
- Credit-limit/Sales Order blocking và cross-currency allocation để pha sau.

Contract: `server/docs/FINANCE-AR-AP-BRD.md`, trạng thái G1 đã duyệt.

### Đã implement — due date và aging backend

- `server/migrations/tenant/0030_finance_invoice_aging.sql`
  - due-date guards cho submitted Sales/Purchase Invoice;
  - chặn ngày hạn trước ngày hạch toán;
  - `finance_invoice_terms` projection;
  - legacy invoice thiếu hạn fallback về posting date;
  - metadata Sales Invoice có Due Date required.
- `server/packages/query/src/finance-aging.ts`
  - `Accounts Receivable Aging`;
  - `Accounts Payable Aging`;
  - bắt buộc `as_of_date` ISO;
  - tenant/cutoff/filter parameterized;
  - outstanding tại cutoff derive từ Payment Ledger.
- `server/apps/query-worker/src/index.ts`
  - dùng `FinanceQueryCompiler` cho sync và prepared reports.
- `server/packages/policy/src/index.ts`
  - report permissions theo Accounts/Sales/Purchase domain.
- `server/packages/core/src/errors.ts`
  - map due-date D1 guards thành validation 422 an toàn.
- `server/package.json`
  - nối migration test mới vào SQL gate.

Targeted tests:

- `server/scripts/test-finance-aging-migration.py`
- `server/tests/finance-aging-query.test.mjs`
- `server/tests/finance-aging-policy.test.mjs`
- `server/tests/finance-aging-errors.test.mjs`

Evidence cục bộ độc lập:

- migration test: PASS, gồm metadata required;
- strict TypeScript harness cho finance compiler: PASS;
- SQL execution cutoff fixture: invoice 1.000, payment 300 trước cutoff, payment 700 sau cutoff => outstanding 700, overdue 21 ngày, bucket 1–30 ngày: PASS.

### Chưa xong

1. Root `pnpm test`, `pnpm typecheck`, `pnpm build` và GitHub exact-head CI.
2. Worker-level D1 report integration nếu full test suite chưa cover compiler injection.
3. UI/report navigation cho AR/AP Aging.
4. Payment Entry partial/unallocated.
5. Payment Allocation append-only + source/target guards.
6. Party Statement, Debt Summary và Advance Balance.
7. Backfill/cutover legacy finance data.

Không deploy Cloudflare, không migrate production và không sửa production secrets trong workstream này nếu chưa có yêu cầu rõ.

## Kiến trúc cốt lõi

Browser vào Gateway Worker. Gateway resolve tenant, phục vụ SPA, loại identity header không tin cậy, ký trusted identity và dispatch tenant Worker.

Tenant Worker mount native API và Frappe facade. Mọi write phải qua DocumentKernel và Durable Object, tạo mutation receipt, ledger/outbox; không bypass đường write này.

Frontend production là runtime metadata-driven. Server permission là authoritative; việc UI ẩn nút không phải security boundary.

D1 migrations là append-only. Migration finance mới hiện đi tới:

- `0030_finance_invoice_aging.sql`

Purchase allocation migrations trước đó:

- `0027_purchase_receipt_allocation.sql`
- `0028_purchase_allocation_cancel_guard.sql`
- `0029_purchase_allocation_rollout.sql`

## FIFO Purchase Receipt vào nhiều Purchase Order

Backend core M1–M4 đã được implement và baseline trước đó qua CI:

- Allocation schema, windows, obligations, allocations, unapplied, settlement rows và revision claims.
- D1 atomic batch cho document + stock + procurement compatibility + allocation + mutation receipt.
- Server canonical material key theo item/chiều dài/barem/màu/dập/profile/UOM.
- Supplier coordinator dùng key `purchase:<tenant>:<company>:<supplier>` trong namespace `AGGREGATES` hiện có.
- Revision conflict retry tối đa ba lần.
- PO submit mở obligation; Receipt submit tự FIFO qua nhiều PO; Receipt cancel tạo reversal.
- Nhôm cây/lá dùng `qty_bar` làm số cây/lá nghĩa vụ/tồn; kg barem và actual weight tách riêng.
- Integration test khóa 200 + 100, nhận 230 => 200 + 30, còn 70; stock 230 cây, actual weight 630 kg.
- Stress planner cover 250 obligation rows.

## Rollout safety

Feature FIFO disabled by default qua `purchase_allocation_rollout_state`:

- Không có row hoặc `enabled=0`: dùng Purchase Order/Purchase Receipt controller legacy.
- Chỉ bật khi có backfill checksum, `unresolved_count=0`, actor và timestamp.
- Database chặn tắt lại sau khi activation.

Không được bật FIFO cho `alu` trước backfill/cutover và staging smoke.

## Nên làm tiếp

### Finance P0

1. Đọc exact-head workflow `CI` và sửa mọi regression.
2. Sau CI xanh, thêm Payment Entry partial/unallocated và Payment Allocation trong lát cắt riêng.
3. Thêm Party Statement, Debt Summary, Advance Balance.
4. Thêm metadata UI/report navigation.
5. Backfill dry-run, staging migration và reconciliation trước production.

### FIFO P0 còn lại

1. Tự apply unapplied Receipt quantity khi PO mới gia nhập window; thêm worker-level concurrency/cancel tests.
2. Settlement close/reverse action, manual override, permission/reason và edge-case lifecycle.
3. Backfill/checksum/activation transaction.
4. Allocation preview/timeline/report.
5. Staging/load/smoke và explicit production approval.

Backlog chi tiết ở `NEXT_TASKS.md`.

## File nên đọc đầu tiên

1. `CURRENT_STATUS.md`
2. `NEXT_TASKS.md`
3. `server/docs/FINANCE-AR-AP-BRD.md`
4. `server/migrations/tenant/0030_finance_invoice_aging.sql`
5. `server/packages/query/src/finance-aging.ts`
6. `server/apps/query-worker/src/index.ts`
7. `server/packages/policy/src/index.ts`
8. `server/packages/core/src/errors.ts`
9. Các finance migration/query/policy/error tests mới.
10. `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`

## Giả định không được tự ý thay đổi

- Frappe-shaped API là compatibility contract.
- Frontend production là runtime metadata-driven dùng chung.
- Server permission là authoritative.
- Mọi mutation phải qua kernel/DO.
- D1 migration append-only; không sửa migration đã chạy.
- Brief sinh tự động phải sửa từ generator.
- Tenant deploy phải qua script tạo đúng tenant/database config.
- GL/Payment Ledger là nguồn sự thật; không lưu outstanding mutable client-authoritative.
- Finance allocation không cross-currency trong pha đầu.
- Allocation ledger sau FIFO activation là nguồn sự thật; progress table cũ chỉ là compatibility projection sinh từ cùng plan.
- Không bật rollout nếu unresolved > 0 hoặc checksum chưa được review.
- Không đưa `.env`, `.dev.vars`, token, private key, session secret hoặc Cloudflare secret vào Git/log/tài liệu.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Test và build

Từ `C:\Forge`:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd --filter metaforge run lint
pnpm.cmd run test
pnpm.cmd run typecheck
pnpm.cmd run build
```

Finance branch phải có exact-head CI xanh trước khi coi lát cắt aging hoàn tất.

## Deploy

- Backup: `server/scripts/backup-tenant.mjs`.
- Tenant-safe migration wrapper: `server/scripts/migrate-tenant.mjs`.
- Low-level remote migration engine: `server/scripts/d1-migrate-remote.mjs`.
- Tenant deploy: `server/scripts/deploy-tenant.mjs`.
- Stage client: `server/scripts/stage-client-bundle.mjs`.
- Gateway: `server/apps/gateway-worker/wrangler.jsonc`.

Safe operator order: backup → `migrate-tenant` dry-run → live migration với explicit confirmation → tenant deploy dry-run → live deploy với explicit confirmation.

Finance migration `0030` chưa deploy. Không sửa production secrets và không chạy production migration/deploy nếu chưa có yêu cầu rõ.
