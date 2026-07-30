# CURRENT STATUS

Ngày audit/cập nhật: **2026-07-30**, workspace chuẩn `C:\Forge`.

## Git

- Branch/default branch: `hotfix/alumdoor-print-list-delete`.
- HEAD code/tài liệu đã được CI xác minh trước commit trạng thái này: `53a4ced5d43f79b297d088c3e6a3e85ddf47e9b2` (`docs: add tenant-safe migration handoff`).
- Contract thiết kế v1: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`, commit `ed840e14d4e290d637454342accbdc42a553a7de`.
- Baseline chức năng Alumdoor: `7bbf20f45ecebf329af7b349e02e61827dfe32fe`.
- Purchase Order print fixture: `f5186c4ef6fb54d819bad95ee4eb17f2fd1a18e1`.
- `server/work/` và `tmp/` là generated/work directories đã tồn tại; không xóa và không commit.

## CI theo HEAD implementation

Draft PR tạm `#6` được dùng chỉ để kích hoạt workflow `pull_request`, vì branch làm việc cũng là default branch. PR đã đóng, không merge và không deploy.

- Run `30566567625`: **FAIL** ở compile trong bước test; phát hiện field `env` che `DurableObject.env` và strict optional plan fields.
- Run `30566858785`: **PASS** toàn bộ test, typecheck và build sau khi sửa compile.
- Run `30567772883`: **PASS** toàn bộ test, typecheck và build cho bản có rollout gate mặc định tắt.
- Run cuối `30568727428`, job `90959777600`: **PASS** test, typecheck và build, gồm cả syntax gate cho `scripts/migrate-tenant.mjs`.
- PR `#6` đã đóng tại HEAD `53a4ced5d43f79b297d088c3e6a3e85ddf47e9b2`, không merge.
- Temporary base branch `ci/allocation-base` còn tồn tại vì connector hiện không cung cấp thao tác xóa ref; branch này không chứa code production mới và không được merge.

## Production deployment tenant `alu`

Ngày **2026-07-30**, người vận hành xác nhận đã hoàn tất backup, preflight và live deploy tenant trước đợt code FIFO:

- Backup remote D1 ra `C:\ForgeBackups\alu`.
- `node scripts/deploy-tenant.mjs --tenant alu`.
- `node scripts/deploy-tenant.mjs --tenant alu --execute --confirm alu`.

Trạng thái trên là operator-confirmed cho phiên bản trước implementation FIFO. Chưa xác minh độc lập deployment ID, Gateway production traffic hoặc browser smoke login/CRUD/print/PDF.

**Implementation FIFO mới trong đợt này chưa được deploy lên Cloudflare. Không sửa production secret.**

## Contract đã duyệt

Người dùng dự án đã duyệt contract v1 và cho phép implementation M1–M8. Contract authoritative nằm tại `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

Các bất biến giữ nguyên:

- Số cây/lá quyết định nghĩa vụ nhà máy; kg barem và kg cân thực tế là dữ liệu riêng.
- FIFO theo đúng PO item row, không dùng riêng `item_code`.
- Obligation queue chạy liên tục; settlement window hữu hạn dùng để tính dung sai.
- Allocation/reversal append-only, không sửa hoặc xóa lịch sử.
- Backdated Receipt không viết lại allocation cũ.
- Concurrency có supplier coordinator và D1 revision claim.
- Legacy mơ hồ phải `legacy_unresolved`, không đoán row id.

## Implementation đã hoàn thành trong đợt này

### M1 — Schema, contracts và atomic store

Đã thêm migration append-only:

- `server/migrations/tenant/0027_purchase_receipt_allocation.sql`
- `server/migrations/tenant/0028_purchase_allocation_cancel_guard.sql`
- `server/migrations/tenant/0029_purchase_allocation_rollout.sql`

Schema gồm queue, settlement window, obligations, allocations, unapplied quantity, settlement events, revision claims, views và database triggers.

Đã thêm:

- `server/packages/contracts/src/purchase-allocation.ts`
- `server/packages/document-kernel/src/purchase-allocation-d1-store.ts`
- `server/packages/document-kernel/src/purchase-allocation-domain-store.ts`
- `server/packages/document-kernel/src/purchase-allocation-reader.ts`
- `server/packages/document-kernel/src/purchase-allocation-rollout-store.ts`
- allocation-aware in-memory store cho integration tests.

Document, stock, procurement compatibility rows, allocation rows, revision claims và mutation receipt được ghi trong cùng D1 batch. Revision mismatch abort toàn batch và được phân loại thành retryable `PURCHASE_ALLOCATION_REVISION_CONFLICT`.

### M2 — Canonical material key

`server/packages/clouderp-core/src/purchase-allocation.ts` đã có canonicalizer/hash v1 từ:

- item code;
- chiều dài;
- barem kg/m;
- màu;
- trạng thái dập;
- measurement profile;
- stock UOM.

Decimal được đổi sang fixed-point micros; null/empty được chuẩn hóa; key do server tạo.

### M3 — Supplier coordinator và retry

`server/apps/tenant-worker/src/aggregate-do.ts` dùng cùng namespace `AGGREGATES` nhưng route PO/Receipt submit/cancel qua key:

`purchase:<tenant>:<company>:<supplier>`

Nhờ đó các Receipt khác tên nhưng cùng nhà cung cấp không cùng phân bổ một nghĩa vụ. Revision conflict được retry tối đa ba lần với cùng command id; lỗi nghiệp vụ/version khác không bị nuốt.

### M4 — FIFO planner và controller integration

Đã thêm:

- `server/packages/clouderp-core/src/purchase-allocation-controllers.ts`
- `server/packages/clouderp-core/src/purchase-allocation-rollout-controllers.ts`

Đã có:

- PO submit mở obligation theo từng row.
- PO cancel chỉ ghi obligation reversal khi chưa nhận và window còn mở.
- Receipt submit tự nhóm theo material key và phân bổ FIFO qua nhiều PO.
- Receipt cancel sinh allocation/procurement reversal theo nguồn.
- Phần vượt nominal nhưng trong tolerance được ghi `unapplied`.
- Nhôm `inventory_mode = Nhôm cây/lá` dùng `qty_bar` làm số lượng nghĩa vụ/tồn, không lấy kg barem làm số cây.
- Kg thực tế vẫn authoritative tại Receipt line; kg theo PO là projection theo barem.

Kịch bản integration đã khóa:

- PO-01: 200 cây.
- PO-02: 100 cây.
- Receipt: 230 cây, barem 644,184 kg, cân thực 630 kg.
- Allocation: 200 + 30.
- PO-02 còn 70 cây.
- Stock ledger nhận 230 cây và actual weight 630 kg.

Stress planner đã cover 250 obligation rows.

## Rollout gate

Migration `0029_purchase_allocation_rollout.sql` làm feature **disabled by default**:

- Không có rollout row hoặc `enabled=0`: production dùng controller legacy.
- Chỉ `enabled=1` khi có backfill checksum, `unresolved_count=0`, actor và timestamp.
- Database chặn tắt lại sau khi đã kích hoạt để tránh hai nguồn sự thật chạy luân phiên.

Nhờ gate này, code và schema có thể được deploy trước mà chưa thay đổi hành vi PO/Receipt hiện hành. Feature FIFO chưa hoạt động cho tenant cho đến khi backfill/cutover hoàn tất.

## Tenant-safe migration wrapper

Đã thêm `server/scripts/migrate-tenant.mjs` và script `tenant:migrate` trong `server/package.json`:

- Resolve D1 theo tenant convention, không yêu cầu người vận hành đoán generated config.
- Dry-run mặc định.
- Live migration yêu cầu `--execute --confirm <tenant>`.
- Live mode từ chối dirty worktree, trừ khi có quyết định rủi ro rõ ràng với `--allow-dirty`.
- Tạo và xóa generated Wrangler config trong cùng lần chạy.
- Gọi `d1-migrate-remote.mjs`, là đường migration hiện hành xử lý đúng trigger có nested `CASE`.
- Syntax của wrapper được kiểm trong SQL test gate và đã PASS ở CI run `30568727428`.

## Test đã thêm

- `server/scripts/test-purchase-receipt-allocation-migration.py`
- `server/scripts/test-purchase-allocation-rollout-migration.py`
- `server/tests/purchase-receipt-allocation-planner.test.mjs`
- `server/tests/purchase-receipt-allocation-controller.test.mjs`
- `server/tests/purchase-allocation-rollout-store.test.mjs`

Các test cover schema/triggers, rollback atomic, revision conflict, PO cancel reversal, settlement boundary 285–315, canonical key, 200+30 FIFO, tolerance 85 pass/86 fail, 250 rows, rollout off/on và end-to-end PO→Receipt.

## Chưa hoàn thành / blocker trước khi bật feature production

1. **M5:** tự `apply_unapplied` khi PO mới gia nhập window; settlement close/reverse API/action; manual override; đầy đủ cancel/reallocation/backdated tests.
2. **M6:** `server/scripts/backfill-purchase-receipt-allocations.mjs`, dry-run trên backup production, resolved/unresolved report, PO-level checksum và activation transaction.
3. **M7:** preview allocation trước submit, timeline PO/Receipt, settlement/override UI và báo cáo nợ nhà máy.
4. Đo D1 batch size/latency với hàng trăm allocation rows và supplier contention thật.
5. Staging migration + smoke; production backup mới; chỉ sau đó mới kích hoạt rollout.
6. Gateway production version/traffic và browser smoke của phiên bản print hiện tại vẫn chưa được xác minh độc lập.

## Deploy và rollback

Safe operator order cho code/schema với rollout vẫn tắt:

1. Backup tenant ra ngoài repository.
2. `node scripts/migrate-tenant.mjs --tenant alu`.
3. `node scripts/migrate-tenant.mjs --tenant alu --execute --confirm alu`.
4. `node scripts/deploy-tenant.mjs --tenant alu`.
5. `node scripts/deploy-tenant.mjs --tenant alu --execute --confirm alu`.

Các tool liên quan:

- Build/stage client: `server/scripts/stage-client-bundle.mjs`.
- Gateway: `server/apps/gateway-worker/wrangler.jsonc`.
- Tenant migration wrapper: `server/scripts/migrate-tenant.mjs`.
- Tenant deploy: `server/scripts/deploy-tenant.mjs`.
- Backup: `server/scripts/backup-tenant.mjs`; SQL backup là plaintext và phải chuyển sang nơi lưu mã hóa.

Không bật rollout FIFO cho `alu` trước khi M5–M7, backfill checksum và staging smoke hoàn tất. Code/schema hiện tại chỉ an toàn để deploy ở trạng thái rollout tắt.
