# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Finalize PR #27 for merge review

Branch: `feat/inventory-manufacturing-item-catalog-20260731`.

PR: `#27`.

Authoritative metadata: `server/briefs/alumdoor-v2.json`, version `2.0.34`.

### Đã đạt

- G0 Scope: **PASS**.
- G1 Requirements/BRD: **PASS**.
- G2 Technical plan: **PASS**.
- Slice A implementation: **hoàn thành**.
- Review score: **96/100**.
- Critical: **0**.
- High: **0** sau remediation.
- Required workflows đã chứng minh focused tests/audit/SQL/brief/lint/full tests/typecheck/build đều PASS trong quá trình đóng gate.
- Không migration, deploy, production mutation hoặc secret change.

Review authoritative:

- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-A-REVIEW.md`.

### Việc còn lại trước merge

1. Xác minh hai required workflows xanh trên **current PR head**:
   - `Inventory and Manufacturing CI`;
   - `PR Validation`.
2. Cập nhật PR body với exact current HEAD, run ID và job ID.
3. Xác minh branch behind `0`, `mergeable=true` và không có unresolved review thread.
4. Chuyển PR khỏi draft sang ready for review.
5. Không merge trước yêu cầu merge rõ ràng của người dùng.

PR body là nguồn authoritative cho exact-head evidence, tránh sửa handoff chỉ để thay một SHA rồi tự tạo thêm một SHA khác.

## P1 — Sau khi Slice A merge

### Audit dữ liệu live tenant `alu`

Chạy read-only, redacted từ môi trường vận hành có Cloudflare credential:

```powershell
New-Item -ItemType Directory -Force C:\Forge-Audit | Out-Null
node server/scripts/audit-alumdoor-catalog.mjs `
  --tenant alu `
  --redacted `
  --output C:\Forge-Audit\alu-catalog-redacted.json
```

Không commit report. Chỉ ghi vào handoff/issue:

- checksum;
- records;
- active/disabled Item;
- active BOM/Production Standard;
- Critical/High/Medium/Low;
- finding code redacted.

Lập remediation plan riêng. Audit CLI không tự sửa dữ liệu.

### Staging

Staging chỉ bắt đầu sau live audit review và khi có branch cho Slice B/C. Slice A không deploy production.

## P2 — Điều phối với PR mua hàng #14

- PR #14 vẫn open/draft.
- Nội dung PR hiện có migration `0031_purchase_allocation_control_metadata.sql`; phải xác minh migration head lại sau khi #14 merge.
- Không tạo migration inventory/manufacturing mới trước coordination gate.
- FIFO rollout tenant `alu` vẫn disabled.

## Slice B — Inventory completeness

Chỉ mở runtime/migration sau Slice A merge, live audit review và migration coordination.

1. Warehouse roles: RAW, WIP, FINISHED, QUARANTINE, SCRAP/OFFCUT, GENERAL.
2. Canonical physical stock identity cho nhôm, kính/tấm, cuộn và batch/serial.
3. Append-only physical movement projection và atomic stock ledger persistence.
4. Stock Entry giữ source lot/dimension, colour/condition, source/target role và reversal identity.
5. Cover receipt, transfer, issue, manufacture, return, reconciliation, cancel và concurrency.
6. Rollout mặc định tắt.

## Slice C — Manufacturing completeness

1. BOM/Production Standard revision và effective dates.
2. Immutable Work Order BOM snapshot/checksum.
3. Issue/consume/produce/scrap/offcut progress với reversal reference.
4. Partial issue/manufacture, over-consumption/production guard, close/cancel.
5. WIP, thiếu vật tư, định mức/thực tế và phế/offcut reports.

## Slice D — UI, QA và release

1. Item/BOM completeness indicators.
2. Work Order snapshot và variance UI.
3. Desktop/mobile Browser QA.
4. Staging smoke toàn luồng.
5. Production chỉ sau yêu cầu deploy riêng.

## Safety

- Không mutate/migrate tenant `alu` từ PR #27.
- Không deploy Gateway/Tenant Worker.
- Không sửa Cloudflare secret.
- Không commit raw report, `.env`, `server/work/`, `tmp/`, backup hoặc generated artifact.
