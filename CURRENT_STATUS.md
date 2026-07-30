# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Branch/default branch: `hotfix/alumdoor-print-list-delete`.
- HEAD sau thay đổi sidebar: `87cd45aa9272f5600ff3d5914f697ce9a26994b6` (`fix(ui): compact desktop sidebar`).
- Baseline code/schema đã qua CI trước đó: `591ca359937d6ae12803d36c74996db8482060af`.
- `server/work/`, `tmp/`, backup SQL, `.env` và generated artifacts không được commit.

## Sidebar/runtime UI

- Đã làm gọn sidebar desktop tại `client/apps/runtime/src/styles.css`.
- Sidebar rộng `15.75rem` thay vì `17rem` khi mở.
- Group header, ô tìm kiếm, dòng menu, icon và khoảng cách dọc được giảm kích thước.
- Không ẩn route, không đổi permission và không xoá mục Báo cáo/Danh mục.
- CI và Cloudflare build cho HEAD mới đang chờ xác minh; chưa ghi nhận smoke browser cho thay đổi này.

## CI

Baseline đã xác minh:

- Workflow run: `30570000862`.
- Job: `90964015638` (`Test, typecheck and build`).
- Exact head: `591ca359937d6ae12803d36c74996db8482060af`.
- Install/test/typecheck/build: **PASS**.

HEAD sidebar `87cd45aa...` vừa được push; cần chờ CI push hoàn tất trước khi coi là verified.

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

- Còn thiếu bằng chứng ghi vào repo: deployment/version ID mới nhất, kết quả `/health`, login/CRUD/print/PDF và ảnh sidebar production sau HEAD mới.

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
