# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Mở exact-head merge gate cho PR #27

Branch: `feat/inventory-manufacturing-item-catalog-20260731`.

PR: `#27`.

Authoritative metadata: `server/briefs/alumdoor-v2.json`, version `2.0.34`.

### Đã đạt

- G0 Scope: **PASS**.
- G1 Requirements/BRD: **PASS**.
- G2 Technical plan: **PASS**.
- Slice A implementation: **hoàn thành về code**.
- Review score: **96/100**.
- Critical: **0**.
- High: **0** sau remediation.
- Default đã đồng bộ tới `81697d454db5e22e758a8aeda8cc40f1f247b18a` qua merge `05477f70f74374516961127cc700f8341ce01196`.
- Không migration, deploy, production mutation hoặc secret change.

Review authoritative:

- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-A-REVIEW.md`.

### Blocker duy nhất trước khi chuyển PR ready

Required GitHub Actions chưa chạy được trên exact final HEAD.

Các run gần nhất thất bại trước checkout/`Set up job`; job records có `steps=null` và không có downloadable log. Không test, typecheck hoặc build command nào thực sự chạy.

Phân loại: **GitHub Actions pre-run infrastructure/configuration blocker; nguyên nhân cụ thể chưa đủ bằng chứng**.

### Việc thực hiện ngay

1. Kiểm tra default HEAD mới nhất.
2. Nếu default tiến thêm, sync đúng file thay đổi vào branch và kiểm conflict.
3. Trigger/retry:
   - `Inventory and Manufacturing CI`;
   - `PR Validation`.
4. Chỉ khi job có steps thực sự:
   - đọc failed step/log nếu đỏ;
   - phân loại code/config/infrastructure;
   - sửa code chỉ khi có code failure.
5. Yêu cầu exact final-head evidence:
   - install PASS;
   - focused catalog/warehouse/Item tests PASS;
   - redacted audit artifact PASS;
   - server SQL PASS;
   - brief check PASS;
   - frontend lint PASS;
   - repository tests PASS;
   - typecheck PASS;
   - build PASS.
6. Khi cả hai required workflows xanh:
   - cập nhật PR body với exact HEAD/run/job/artifact;
   - xác minh `mergeable=true`, behind=0, không unresolved review thread;
   - chuyển PR khỏi draft;
   - báo người dùng PR sẵn sàng merge.
7. Không merge trước yêu cầu merge rõ ràng của người dùng.

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
- Sau #14 merge:
  1. sync/rebase branch kế tiếp;
  2. xử lý conflict;
  3. kiểm migration head;
  4. chạy full tests/typecheck/build và exact-head CI.
- FIFO rollout tenant `alu` vẫn disabled.

## Slice B — Inventory completeness

Chỉ mở branch/runtime migration sau Slice A merge, live audit review và migration coordination.

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
- Không bypass failed/missing/cancelled/infrastructure-blocked CI.
