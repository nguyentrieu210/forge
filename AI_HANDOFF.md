# AI HANDOFF

## Dự án này là gì

Forge là monorepo ERP đa tenant trên Cloudflare. Backend CloudForge cung cấp API tương thích hình dạng Frappe; frontend MetaForge là React Desk metadata-driven dùng chung. Ứng dụng ngành dọc được đóng gói thành manifest/brief và app Worker thay vì fork runtime.

Repo local chuẩn: `C:\Forge`. Package manager pnpm 9, Node từ 22.

## Hiện trạng

- Branch/default branch: `hotfix/alumdoor-print-list-delete`.
- HEAD code/tài liệu được CI xác minh trước các commit trạng thái cuối: `53a4ced5d43f79b297d088c3e6a3e85ddf47e9b2`.
- CI run cuối `30568727428`, job `90959777600`: test, typecheck và build **PASS**, gồm syntax gate cho tenant migration wrapper.
- Draft PR CI tạm `#6` đã đóng, không merge và không deploy.
- Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.
- Purchase Order print fixture: `f5186c4 test(alumdoor): add purchase order print fixture`.
- `server/work/` và `tmp/` là generated/work directories, không xóa hoặc commit.

## Kiến trúc cốt lõi

Browser vào Gateway Worker. Gateway resolve tenant, phục vụ SPA, loại identity header không tin cậy, ký trusted identity và dispatch tenant Worker.

Tenant Worker mount native API và Frappe facade. Mọi write phải qua DocumentKernel và Durable Object, tạo mutation receipt, ledger/outbox; không bypass đường write này.

Frontend production là runtime metadata-driven. Server permission là authoritative; việc UI ẩn nút không phải security boundary.

D1 migrations là append-only. Migration hiện đã đi tới:

- `0027_purchase_receipt_allocation.sql`
- `0028_purchase_allocation_cancel_guard.sql`
- `0029_purchase_allocation_rollout.sql`

## Việc gần nhất — FIFO Purchase Receipt vào nhiều Purchase Order

Người dùng đã duyệt contract v1. Backend core M1–M4 đã được implement và qua CI:

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

Feature FIFO **disabled by default** qua `purchase_allocation_rollout_state`:

- Không có row hoặc `enabled=0`: dùng Purchase Order/Purchase Receipt controller legacy.
- Chỉ bật khi có backfill checksum, `unresolved_count=0`, actor và timestamp.
- Database chặn tắt lại sau khi activation.

Vì vậy code và schema có thể deploy ở trạng thái rollout tắt mà không thay đổi hành vi dữ liệu cũ. Không được bật FIFO cho `alu` trước backfill/cutover và staging smoke.

## Nên làm tiếp

1. **M4 còn lại:** tự apply unapplied Receipt quantity khi PO mới gia nhập window; thêm worker-level concurrency/cancel tests.
2. **M5:** settlement close/reverse action, manual override, permission/reason và edge-case lifecycle.
3. **M6:** viết `backfill-purchase-receipt-allocations.mjs`, dry-run production backup, resolved/unresolved report, checksum và activation transaction.
4. **M7:** allocation preview, PO/Receipt timeline, settlement/override UI và supplier debt report.
5. **M8:** đo D1 batch/latency, staging migration/backfill/smoke, backup mới rồi mới xin explicit production activation approval.
6. Hoàn tất production smoke/Gateway verification cho phiên bản Alumdoor đang live.

Backlog chi tiết ở `NEXT_TASKS.md`.

## File nên đọc đầu tiên

1. `CURRENT_STATUS.md`
2. `NEXT_TASKS.md`
3. `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`
4. `server/migrations/tenant/0027_purchase_receipt_allocation.sql`
5. `server/migrations/tenant/0028_purchase_allocation_cancel_guard.sql`
6. `server/migrations/tenant/0029_purchase_allocation_rollout.sql`
7. `server/packages/contracts/src/purchase-allocation.ts`
8. `server/packages/clouderp-core/src/purchase-allocation.ts`
9. `server/packages/clouderp-core/src/purchase-allocation-controllers.ts`
10. `server/packages/clouderp-core/src/purchase-allocation-rollout-controllers.ts`
11. `server/packages/document-kernel/src/purchase-allocation-d1-store.ts`
12. `server/packages/document-kernel/src/purchase-allocation-domain-store.ts`
13. `server/apps/tenant-worker/src/aggregate-do.ts`
14. `server/scripts/migrate-tenant.mjs`
15. Các migration/planner/controller/rollout tests mới trong `server/scripts/` và `server/tests/`.

## Giả định không được tự ý thay đổi

- Frappe-shaped API là compatibility contract.
- Frontend production là runtime metadata-driven dùng chung.
- Server permission là authoritative.
- Mọi mutation phải qua kernel/DO.
- D1 migration append-only; không sửa migration đã chạy.
- Brief sinh tự động phải sửa từ generator.
- Tenant deploy phải qua script tạo đúng tenant/database config.
- Allocation ledger sau activation là nguồn sự thật; progress table cũ chỉ là compatibility projection sinh từ cùng plan.
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

CI run `30568727428` đã pass đủ test/typecheck/build cho code, rollout gate và tenant migration wrapper.

## Deploy

- Backup: `server/scripts/backup-tenant.mjs`.
- Tenant-safe migration wrapper: `server/scripts/migrate-tenant.mjs`.
- Low-level remote migration engine: `server/scripts/d1-migrate-remote.mjs`.
- Tenant deploy: `server/scripts/deploy-tenant.mjs`.
- Stage client: `server/scripts/stage-client-bundle.mjs`.
- Gateway: `server/apps/gateway-worker/wrangler.jsonc`.

Safe operator order: backup → `migrate-tenant` dry-run → live migration với explicit confirmation → tenant deploy dry-run → live deploy với explicit confirmation. Rollout vẫn tắt sau khi deploy code/schema.

Implementation FIFO mới chưa deploy. Không sửa production secrets. Code chỉ an toàn để deploy khi rollout vẫn tắt; activation production phải chờ M5–M7, backfill checksum, staging smoke và explicit approval.
