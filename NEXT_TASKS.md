# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Slice B: warehouse roles và canonical physical stock identity

Branch: `feat/inventory-physical-stock-slice-b-20260731`.

Base lúc mở nhánh: `4d566a44fd1f04979e4e6de952fd81da9b28e93e`.

Kickoff: `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-BC-KICKOFF.md`.

### Gate hiện tại

- G0 Scope: **PASS**.
- G1 BRD: **PASS**.
- G2 plan refresh: **PASS cho kickoff**, nhưng table/contract names phải được khóa sau inspection.
- G3 implementation: **chưa bắt đầu**.

### Việc làm đầu tiên

1. Đọc và map chính xác:
   - `server/packages/clouderp-stock/src/types.ts`;
   - `server/packages/clouderp-stock/src/tracking.ts`;
   - `server/packages/clouderp-erpnext/src/alumdoor-inventory.ts`;
   - `server/packages/clouderp-erpnext/src/controllers.ts`;
   - `server/packages/document-kernel/src/store.ts`;
   - `server/packages/document-kernel/src/d1-store.ts`;
   - Aluminium Lot và manufacturing progress schema hiện tại.
2. Viết focused failing tests cho:
   - canonical dimension/colour/condition/lot identity;
   - warehouse role theo purpose;
   - exact transfer/cancel lineage;
   - stale revision và concurrent issue;
   - không drift giữa generic stock và physical projection.
3. Khóa contract và transaction boundary trước khi sửa schema.
4. Không tạo migration cho tới khi coordination gate bên dưới được giải quyết.
5. Sau mỗi patch: focused test → SQL → full test/typecheck/build → exact-head CI.

### Acceptance chính

- Physical identity được dựng server-side, không tin hash/balance từ browser.
- Generic stock, physical movement, document và manufacturing projection commit atomically.
- Transfer bảo toàn quantity/value và source lineage.
- Cancellation append exact reversal từ original movement.
- Rollout mặc định disabled.

## P0 — Migration coordination

- RBAC PR #45 đã merge migration `0030_rbac_audit.sql`.
- Purchase PR #14 vẫn open/draft và đang giữ `0031_purchase_allocation_control_metadata.sql`.
- Không reserve `0031`, `0032` hoặc số nào khác trong Slice B/C trước khi #14 merge/close và default migration head được kiểm lại.
- Nếu #14 đổi migration hoặc default tiến thêm, refresh plan trước schema commit.

## P1 — Slice C: versioned BOM và immutable Work Order snapshot

Branch: `feat/manufacturing-bom-workorder-slice-c-20260731`.

Topology: branch này phải được tạo từ Slice B kickoff head và PR phải target Slice B cho tới khi Slice B merge.

### Việc làm đầu tiên

1. Chỉ dùng physical identity/movement contract do Slice B sở hữu; không định nghĩa lại.
2. Viết tests cho:
   - active BOM revision selection theo effective time;
   - duplicate/overlap/circular BOM rejection;
   - immutable Work Order snapshot/checksum;
   - partial issue/manufacture;
   - over-consumption/over-production;
   - concurrent manufacture;
   - exact reversal và offcut/scrap lineage.
3. Thêm BOM fields: revision, effective interval, status, output UOM/conversion, row UOM/conversion/qty basis.
4. Snapshot BOM rows, checksum, output, operations và warehouse expectations khi release Work Order.
5. Mở rộng append-only manufacturing progress với BOM row và physical movement references.
6. Legacy Work Orders vẫn đọc được; rollout mới mặc định disabled.

## P1 — Live tenant catalog audit

Trước data remediation, staging hoặc rollout Slice B/C, chạy audit tenant `alu` ở chế độ read-only/redacted từ môi trường vận hành có Cloudflare credential:

```powershell
New-Item -ItemType Directory -Force C:\Forge-Audit | Out-Null
node server/scripts/audit-alumdoor-catalog.mjs `
  --tenant alu `
  --redacted `
  --output C:\Forge-Audit\alu-catalog-redacted.json
```

Không commit report thô. Chỉ ghi checksum, counts và finding codes đã redacted.

## P2 — Các PR đang hoạt động cần tránh xung đột

- PR #14 Purchase FIFO: open/draft, chạm procurement/stock và migration `0031`.
- PR #25 Sales multi-UOM: còn browser/staging smoke trước merge/deploy.
- Khi default thay đổi, cả Slice B và C phải sync/rebase rồi chạy lại full gates.

## P3 — Slice D sau B/C

1. Item/BOM completeness UI.
2. Physical lot selector cho Stock Entry.
3. Work Order snapshot/progress/variance UI.
4. Reports tồn theo physical identity, WIP, shortage, variance, scrap/offcut.
5. Desktop/mobile Browser QA và staging smoke toàn luồng.
6. Production chỉ sau yêu cầu deploy riêng.

## Safety

- Không deploy Cloudflare từ Slice B/C kickoff.
- Không migrate hoặc mutate tenant `alu`.
- Không sửa production secrets.
- Không bật FIFO.
- Không commit raw report, `.env`, `server/work/`, `tmp/`, backup hoặc generated artifacts.
- Không bypass failed/missing/cancelled CI.
