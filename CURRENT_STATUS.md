# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Latest default-branch commit quan sát qua GitHub: `cd60f8c09c48105db84a82c12ad3b32d9f075064` (`ci: split production observation workflow`).
- Working branch tài chính/công nợ: `feat/finance-ar-ap-completion`.
- Draft PR: `#15`.
- Finance implementation exact head trước commit trạng thái này: `90ef9ac2b4a3681cda86cd8ae0ad304f3ebd0c34`.
- Code sidebar: `87cd45aa9272f5600ff3d5914f697ce9a26994b6` (`fix(ui): compact desktop sidebar`).
- Release target trước trigger: `da04f7fcfdc4c8e4ddf7ff70c79e3a10458ce412`.
- Gateway production trigger: `9a7bbc14b8e7f3e556404cce19914da1e21e5e10` (`release: trigger compact sidebar gateway production`).
- Baseline code/schema đã qua CI trước đó: `591ca359937d6ae12803d36c74996db8482060af`.
- `server/work/`, `tmp/`, backup SQL, `.env` và generated artifacts không được commit.

## Tài chính và công nợ AR/AP

### Phạm vi đã chốt

- Người dùng đã cho phép tiếp tục theo phương án an toàn mặc định.
- Scope: Customer AR + Supplier AP.
- Aging bucket: `Chưa đến hạn`, `1–30 ngày`, `31–60 ngày`, `61–90 ngày`, `Trên 90 ngày`.
- Allocation chỉ cùng company, party, party account và currency.
- Credit-limit/Sales Order blocking và cross-currency allocation để pha sau.
- BRD authoritative: `server/docs/FINANCE-AR-AP-BRD.md`, trạng thái G1 đã duyệt.

### Lát cắt đã implement — due date và aging backend

- Migration append-only `server/migrations/tenant/0030_finance_invoice_aging.sql`:
  - xác thực due date nếu được cung cấp và chặn ngày sai/ngày trước posting date;
  - thêm field Due Date bắt buộc vào metadata Sales Invoice;
  - giữ API/fixture cũ thiếu due date hoạt động bằng compatibility fallback về posting date;
  - đánh dấu nguồn ngày hạn `explicit` hoặc `posting_date_fallback` trong `finance_invoice_terms`;
  - chưa bật hard database presence enforcement trước khi backfill xác nhận không còn unresolved.
- Query compiler mới `server/packages/query/src/finance-aging.ts`:
  - `Accounts Receivable Aging`;
  - `Accounts Payable Aging`;
  - bắt buộc filter `as_of_date` chuẩn ISO;
  - tenant/cutoff và user filters đều bind parameter;
  - outstanding tính từ immutable Payment Ledger tới đúng cutoff;
  - trả và cho phép lọc `due_date_source` để nhận diện dữ liệu cần backfill.
- Query Worker dùng `FinanceQueryCompiler` cho synchronous và prepared reports.
- Permission server-side đã thêm cho Accounts, Sales Manager và Purchase Manager theo đúng domain.
- D1 due-date guards được map thành `VALIDATION_ERROR` 422, không lộ raw database error.
- `server/package.json` đã đưa migration test mới vào `test:sql`.

### Verification hiện có

- Compatibility migration fixture: **PASS**.
  - thiếu due date => fallback về posting date;
  - due date hợp lệ => source `explicit`;
  - ngày không tồn tại hoặc trước posting date => bị chặn;
  - Sales Invoice metadata Due Date là required.
- TypeScript slice `finance-aging.ts` với `strict`: **PASS** trong harness độc lập.
- SQL aging thực thi thật với invoice 1.000, payment 300 trước cutoff và 700 sau cutoff:
  - outstanding tại `2026-07-31`: `700`;
  - fallback due date source được trả đúng;
  - days overdue và aging bucket được tính đúng từ cutoff.
- Test source đã thêm:
  - `server/tests/finance-aging-query.test.mjs`;
  - `server/tests/finance-aging-policy.test.mjs`;
  - `server/tests/finance-aging-errors.test.mjs`;
  - `server/scripts/test-finance-aging-migration.py`.

### Gate và giới hạn

- Chưa có root `pnpm test/typecheck/build` cho exact head qua GitHub Actions.
- Workflow quan sát Cloudflare không được tính là code CI gate.
- Branch chưa CI-verified cho tới khi workflow `CI` job `Test, typecheck and build` xanh trên exact head.
- Hard database enforcement cho due-date presence phải chờ backfill/checksum và migration append-only tiếp theo.
- UI/menu cho aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement và Debt Summary chưa implement.
- Không deploy Cloudflare, không chạy tenant migration production và không sửa production secrets.

## Sidebar/runtime UI

- Đã làm gọn sidebar desktop tại `client/apps/runtime/src/styles.css`.
- Sidebar rộng `15.75rem` thay vì `17rem` khi mở.
- Group header, ô tìm kiếm, dòng menu, icon và khoảng cách dọc được giảm kích thước.
- Không ẩn route, không đổi permission và không xoá mục Báo cáo/Danh mục.

## Gateway production release

- Đã push `.github/release/gateway-production.trigger` lên default branch để kích hoạt Cloudflare Git build cho `cloudforge-gateway`.
- Trigger trỏ tới code target `da04f7fcfdc4c8e4ddf7ff70c79e3a10458ce412`, môi trường `production`, lý do `compact-sidebar-release`.
- Việc này chỉ phát hành Gateway/frontend; không chạy tenant migration, không deploy lại tenant Worker và không bật FIFO.
- Chưa có provider evidence từ Cloudflare cho build/deployment/version ID hoặc smoke production sau trigger.

## CI

Baseline đã xác minh:

- Workflow run: `30570000862`.
- Job: `90964015638` (`Test, typecheck and build`).
- Exact head: `591ca359937d6ae12803d36c74996db8482060af`.
- Install/test/typecheck/build: **PASS**.

Finance branch hiện chưa có exact-head code CI evidence. Workflow `.github/workflows/ci.yml` có trigger `push` và `pull_request`; cần đọc run mới nhất sau commit cuối.

## Cloudflare production tenant `alu`

- Người vận hành xác nhận workflow release đã chạy được sau khi sửa credential.
- Code/schema FIFO target `591ca359...` đã được đưa qua quy trình backup, migration và tenant deploy theo xác nhận vận hành.
- FIFO rollout vẫn phải giữ **disabled**.
- Gateway `cloudforge-gateway` dùng Cloudflare Git build; build command đúng cho monorepo là:

```bash
pnpm --filter metaforge run build && node server/scripts/stage-client-bundle.mjs
```

- Deploy command Gateway:

```bash
pnpm --dir server exec wrangler deploy --config apps/gateway-worker/wrangler.jsonc
```

- Còn thiếu bằng chứng ghi vào repo: deployment/version ID mới nhất, kết quả `/health`, login/CRUD/print/PDF và ảnh sidebar production sau trigger.

## FIFO Purchase Receipt vào nhiều Purchase Order

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

### Đã hoàn thành và qua CI

- Migration append-only:
  - `server/migrations/tenant/0027_purchase_receipt_allocation.sql`
  - `server/migrations/tenant/0028_purchase_allocation_cancel_guard.sql`
  - `server/migrations/tenant/0029_purchase_allocation_rollout.sql`
- Allocation schema: queue, settlement windows, obligations, allocations, unapplied quantities, settlement events và revision claims.
- D1 atomic batch cho document, stock, procurement compatibility rows, allocation rows và mutation receipt.
- Canonical material key do server tạo từ item, chiều dài, barem kg/m, màu, dập, measurement profile và stock UOM.
- Supplier coordinator theo `purchase:<tenant>:<company>:<supplier>` trong namespace `AGGREGATES`.
- Revision conflict retry tối đa ba lần.
- PO submit mở obligation theo row.
- Receipt submit tự FIFO qua nhiều PO.
- Receipt cancel sinh reversal theo nguồn.
- Nhôm `inventory_mode = Nhôm cây/lá` dùng `qty_bar` làm số cây/lá nghĩa vụ/tồn; kg barem và kg cân thực tế giữ riêng.
- Integration scenario: PO 200 + 100 cây, Receipt 230 cây => allocation 200 + 30, còn 70; stock 230 cây, actual weight 630 kg.
- Stress planner cover 250 obligation rows.

### Rollout safety

`purchase_allocation_rollout_state` mặc định tắt:

- Không có row hoặc `enabled=0`: PO/Receipt dùng controller legacy.
- Chỉ bật khi có backfill checksum, `unresolved_count=0`, actor và timestamp.
- Database chặn tắt lại sau activation.

Code/schema có thể live khi rollout tắt, nhưng FIFO chưa hoạt động cho tenant cho tới khi backfill/cutover hoàn tất.

## Tenant-safe migration/deploy

Các script hiện hành:

- Backup: `server/scripts/backup-tenant.mjs`.
- Tenant-safe migration: `server/scripts/migrate-tenant.mjs`.
- Low-level migration engine: `server/scripts/d1-migrate-remote.mjs`.
- Tenant deploy: `server/scripts/deploy-tenant.mjs`.
- Stage client: `server/scripts/stage-client-bundle.mjs`.

Thứ tự an toàn:

1. Backup tenant ra ngoài repository và chuyển backup plaintext sang nơi lưu mã hóa.
2. Migration dry-run.
3. Migration live với explicit confirmation.
4. Tenant deploy dry-run.
5. Tenant deploy live với explicit confirmation.
6. Smoke health/login/CRUD/print/PDF.

## Blocker trước khi bật FIFO production

1. Tự `apply_unapplied` khi PO mới gia nhập window.
2. Settlement close/reverse API/action, manual override, permission và reason.
3. Backfill script, resolved/unresolved report, PO-level checksum và activation transaction.
4. UI preview/timeline/report vận hành.
5. D1 batch/latency và supplier contention test.
6. Staging migration, backfill dry-run và smoke toàn luồng.
7. Production backup mới và explicit approval trước activation.
8. Xác minh Gateway production version/traffic và browser smoke hiện hành.

Không bật rollout FIFO cho `alu` trước khi các blocker trên được xử lý.

## RBAC Slice A đã merge

- Implementation gốc: `ab974f92ffbcf015fb71d3051df33508c9f09942`.
- Branch kiểm chứng sạch: `feat/rbac-slice-a-rebased-20260731`.
- Exact head đã kiểm chứng: `0db13898ed00cbfe3835ce511f90c84aef38c8e8`.
- PR `#37` đã squash-merge vào default.
- Merge commit: `93ac85a0f16c2668b706ffcf8e15d3da53c8c7a9`.
- PR `#34` đã đóng, không merge, do merge conflict với default.
- Final diff có 9 file code/test/tài liệu RBAC; không có workflow tạm, pretest hook, placeholder, `CURRENT_STATUS.md` hoặc `NEXT_TASKS.md`.
- G3 trước rebase PASS tại workflow `30612014393`, job `91101823154`.
- G4 exact-head PASS bằng workflow `PR Validation`:
  - run `30618821462`, job `91118225164`;
  - run `30619133964`, job `91119230663`;
  - run mới nhất `30619408760`, job `91120101038`.
- Các run trên PASS `pnpm test`, `pnpm typecheck` và `pnpm build`.
- Không có review thread hoặc change request chưa xử lý khi merge.
- G4: **PASS**.
- G5 staging/browser QA: **CHƯA CHẠY**.
- Việc tiếp theo là mở branch/PR Slice B riêng cho audit append-only, atomic user/roles và last-admin/self-lockout guards.
- Không deploy Cloudflare, không sửa production secrets và không bật FIFO.