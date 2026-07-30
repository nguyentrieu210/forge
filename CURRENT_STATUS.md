# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Branch/default branch: `hotfix/alumdoor-print-list-delete`.
- Code HEAD được xác minh trong đợt này: `591ca359937d6ae12803d36c74996db8482060af` (`fix(deploy): allow approved generated paths during tenant deploy`).
- Commit trên chỉ cho phép clean-worktree guard bỏ qua đúng `server/work/` và `tmp/`; mọi thay đổi khác vẫn chặn live migration/deploy.
- `server/work/`, `tmp/`, backup SQL, `.env` và generated artifacts không được commit.

## CI exact HEAD

Draft PR tạm `#6` chỉ được mở lại để kích hoạt workflow `pull_request` cho đúng SHA, sau đó đóng mà không merge.

- Workflow run: `30570000862`.
- Job: `90964015638` (`Test, typecheck and build`).
- Exact head: `591ca359937d6ae12803d36c74996db8482060af`.
- `pnpm install --frozen-lockfile`: **PASS**.
- Test: **PASS**.
- Typecheck: **PASS**.
- Build: **PASS**.
- Kết luận job: **success**.
- PR `#6` đã đóng, không merge và không deploy.

## Production deployment tenant `alu`

Người vận hành đã xác nhận ngày 2026-07-30 rằng phiên bản trước implementation FIFO đã được backup, preflight và live deploy bằng:

- `node scripts/backup-tenant.mjs --tenant alu --execute ...`
- `node scripts/deploy-tenant.mjs --tenant alu`
- `node scripts/deploy-tenant.mjs --tenant alu --execute --confirm alu`

Trạng thái trên là operator-confirmed. Chưa có bằng chứng độc lập cho deployment ID, Gateway production traffic hoặc browser smoke login/CRUD/print/PDF.

**Code/schema FIFO mới tại SHA `591ca359...` chưa được deploy lên Cloudflare trong đợt 2026-07-31. Không sửa production secrets.**

Lý do release bị chặn trong phiên ChatGPT hiện tại:

- Không có Cloudflare plugin/action.
- Không có `CLOUDFLARE_API_TOKEN` hoặc `CLOUDFLARE_ACCOUNT_ID` được mount.
- Repository chỉ có workflow CI; chưa có allowlisted GitHub Actions workflow để backup/migrate/deploy Cloudflare.
- `ForgeSkills.zip` chỉ cung cấp quy trình/gate; không chứa credential hoặc Cloudflare executor. `FORGE.md` và `.forge/manifest.json` cũng chưa được cài vào repository.

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

Vì vậy code/schema có thể được deploy trước với rollout tắt, nhưng FIFO chưa hoạt động cho tenant cho đến khi backfill/cutover hoàn tất.

## Tenant-safe migration/deploy

Các script hiện hành:

- Backup: `server/scripts/backup-tenant.mjs`.
- Tenant-safe migration: `server/scripts/migrate-tenant.mjs`.
- Low-level migration engine: `server/scripts/d1-migrate-remote.mjs`.
- Tenant deploy: `server/scripts/deploy-tenant.mjs`.

Thứ tự operator an toàn, rollout vẫn tắt:

1. Backup tenant ra ngoài repository và chuyển backup plaintext sang nơi lưu mã hóa.
2. `node scripts/migrate-tenant.mjs --tenant alu`.
3. `node scripts/migrate-tenant.mjs --tenant alu --execute --confirm alu`.
4. `node scripts/deploy-tenant.mjs --tenant alu`.
5. `node scripts/deploy-tenant.mjs --tenant alu --execute --confirm alu`.

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