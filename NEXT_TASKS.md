# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Hoàn thiện Slice A bằng audit dữ liệu live

Branch: `feat/inventory-manufacturing-item-catalog-20260731`.

Draft PR: `#27`.

Authoritative metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`.

Gate hiện tại:

- G0 Scope: **PASS**.
- G1 BRD: **PASS**.
- G2 Slice A plan: **PASS**.
- G3 Test/lint/typecheck/build: **PASS**.
- G4 Exact code-head CI: **PASS tại `2ada710...`**.
- G5 Staging: **chưa bắt đầu**.

### Đã xong

1. Planner và CLI audit read-only cho Item/UOM/profile/warehouse/BOM.
2. Audit trực tiếp brief v2.0.34, redacted artifact và checksum.
3. Warehouse role normalization và coverage checks.
4. Runtime Item invariants:
   - dịch vụ không giữ manufacturing/stock configuration;
   - nguồn mua phải có cờ mua;
   - hàng sản xuất phải có cờ manufacturing;
   - enum stage/supply được khóa;
   - partial save ghép record hiện tại trước khi kiểm.
5. Entrypoint `src/entry.ts` compose validator cũ và invariant mới.
6. Focused HTTP tests, SQL, brief check, lint, repository tests, typecheck và build đều PASS.
7. Đồng bộ default head `ad9b910...` và nhận workflow `PR Validation`.
8. Xóa toàn bộ workflow/script thử nghiệm sau khi connector không cho chạy remote audit an toàn.

### Việc tiếp theo

1. Chạy remote audit **read-only, redacted** từ môi trường vận hành đã có Cloudflare credential:

```powershell
New-Item -ItemType Directory -Force C:\Forge-Audit | Out-Null
node server/scripts/audit-alumdoor-catalog.mjs `
  --tenant alu `
  --redacted `
  --output C:\Forge-Audit\alu-catalog-redacted.json
```

2. Không commit report; chỉ ghi các trường sau vào handoff/PR:
   - checksum;
   - records/active/disabled Item;
   - active BOM/Production Standard;
   - Critical/High/Medium/Low;
   - danh sách finding code redacted.
3. Review từng nhóm High của dữ liệu live:
   - category và cờ mua/bán/sản xuất;
   - UOM và conversion;
   - Measurement Profile;
   - default warehouse/account;
   - active BOM/Production Standard;
   - BOM duplicate/circular/UOM/qty basis.
4. Lập remediation plan riêng. Không tự sửa dữ liệu live từ audit CLI.
5. Chạy lại exact-head CI nếu remediation làm thay đổi validator/planner.

## P0 — Điều phối với PR mua hàng #14

- PR #14 vẫn open/draft, head gần nhất `7201226103d54f6b87a62ed6d020c58926ff9ef0`.
- PR này sở hữu migration `0030` và chạm procurement/stock contracts.
- Nhánh tồn kho/sản xuất **không tạo migration mới** trước khi PR #14 merge hoặc migration head được xác minh lại.
- Sau merge:
  1. đồng bộ/rebase branch;
  2. xử lý conflict;
  3. xác minh migration head;
  4. chạy full tests/typecheck/build và exact-head CI.
- FIFO rollout tenant `alu` vẫn disabled.

## Slice B — Inventory completeness

Chỉ bắt đầu runtime/migration sau remote audit và coordination gate với PR #14.

1. Chốt warehouse role model:
   - `RAW_MATERIAL`;
   - `WIP`;
   - `FINISHED_GOODS`;
   - `QUARANTINE`;
   - `SCRAP_OFFCUT`;
   - `GENERAL` chỉ cho stock ngoài sản xuất.
2. Map hoặc bổ sung kho vật lý cho RAW, WIP, thành phẩm và chờ kiểm.
3. Thiết kế canonical physical stock identity cho nhôm, kính/tấm, cuộn và batch/serial.
4. Thêm append-only physical movement projection, revision claim và persistence atomic với stock ledger.
5. Stock Entry phải giữ source lot/dimension, colour/condition, source/target role và reversal identity.
6. Cover receipt, transfer, issue, manufacture, return, reconciliation, cancel và concurrent issue.
7. Rollout mặc định tắt; không backfill/activation trước staging.

## Slice C — Manufacturing completeness

1. Version BOM/Production Standard bằng revision và effective dates.
2. Validate finished/raw Item flags, UOM conversion, qty basis, circular và duplicate active BOM.
3. Work Order lưu immutable BOM snapshot/checksum.
4. Manufacturing progress giữ BOM row, physical lot, issue/consume/produce/scrap/offcut và reversal reference.
5. Hoàn thiện partial issue, partial manufacture, over-consumption/over-production guard, close và cancel/reverse.
6. Báo cáo WIP, thiếu vật tư, tiến độ, định mức so với thực tế và phế/offcut.

## Slice D — UI, QA và release

1. Làm gọn form Item theo loại, giữ server permission authoritative.
2. Thêm completeness/error indicator cho Item và BOM.
3. Work Order hiển thị snapshot, required/issued/produced/scrap/variance.
4. Desktop/mobile Browser QA cho Item, Stock Entry, BOM và Work Order.
5. Staging smoke toàn luồng trước production.
6. Không deploy production hoặc sửa secret nếu chưa có yêu cầu riêng.

## Production safety

- Không migrate hoặc mutate tenant `alu` từ nhánh này.
- Không deploy Gateway/Tenant Worker từ nhánh này.
- Không sửa Cloudflare secret.
- Không commit report raw, backup, `server/work/`, `tmp/`, `.env` hoặc generated artifacts.
- Production chỉ được cân nhắc sau G5 staging, live catalog audit được review và yêu cầu deploy riêng.
