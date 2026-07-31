# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Alumdoor landing/login refresh — PR #17

- Branch: `feat/login-landing-ui-refresh`.
- Exact code head đã kiểm chứng trước cập nhật tài liệu: `b90fc6760439f6bb90a5bb42a417fe7c9c1c409d`.
- Base đã rebase sạch: `81697d454db5e22e758a8aeda8cc40f1f247b18a`.
- Phạm vi: landing guest và login riêng cho Alumdoor; không thay đổi Social Commerce, auth API, permission hoặc nghiệp vụ.
- Nhận diện dùng cam `#F15C2D`, than `#393938`, nền trắng/xám kỹ thuật theo mẫu logo Alumdoor.
- `PR Validation` run `30622672127`, job `91130621484`: install, tests, typecheck và build **PASS**.
- `UI Pull Request Validation` run `30622672113`, job `91130621422`: lint, tests, typecheck, build, Chromium browser QA, artifact ảnh và cookie auth smoke **PASS**.
- Auth smoke tạo user/password/session secret ngẫu nhiên chỉ trong runner; không commit secret và không sửa production secret.
- Không deploy Cloudflare trong đợt này.

## Git

- Repository: `nguyentrieu210/forge`.
- Branch/default branch: `hotfix/alumdoor-print-list-delete`.
- Code sidebar: `87cd45aa9272f5600ff3d5914f697ce9a26994b6` (`fix(ui): compact desktop sidebar`).
- Release target trước trigger: `da04f7fcfdc4c8e4ddf7ff70c79e3a10458ce412`.
- Gateway production trigger: `9a7bbc14b8e7f3e556404cce19914da1e21e5e10` (`release: trigger compact sidebar gateway production`).
- Baseline code/schema đã qua CI trước đó: `591ca359937d6ae12803d36c74996db8482060af`.
- `server/work/`, `tmp/`, backup SQL, `.env` và generated artifacts không được commit.

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

- Migration append-only: `0027_purchase_receipt_allocation.sql`, `0028_purchase_allocation_cancel_guard.sql`, `0029_purchase_allocation_rollout.sql`.
- Allocation schema: queue, settlement windows, obligations, allocations, unapplied quantities, settlement events và revision claims.
- D1 atomic batch cho document, stock, procurement compatibility rows, allocation rows và mutation receipt.
- Canonical material key do server tạo từ item, chiều dài, barem kg/m, màu, dập, measurement profile và stock UOM.
- Supplier coordinator theo `purchase:<tenant>:<company>:<supplier>` trong namespace `AGGREGATES`.
- Revision conflict retry tối đa ba lần.
- PO submit mở obligation theo row; Receipt submit tự FIFO qua nhiều PO; Receipt cancel sinh reversal theo nguồn.
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

Thứ tự an toàn: backup → migration dry-run → migration live với explicit confirmation → tenant deploy dry-run → tenant deploy live với explicit confirmation → smoke health/login/CRUD/print/PDF.

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
- PR `#37` đã squash-merge vào default; merge commit `93ac85a0f16c2668b706ffcf8e15d3da53c8c7a9`.
- G3 trước rebase PASS tại workflow `30612014393`, job `91101823154`.
- G4 exact-head PASS trên các run `30618821462`, `30619133964`, `30619408760`.
- G5 staging/browser QA: **CHƯA CHẠY**.
- Việc tiếp theo là Slice B riêng cho audit append-only, atomic user/roles và last-admin/self-lockout guards.
- Không deploy Cloudflare, không sửa production secrets và không bật FIFO.