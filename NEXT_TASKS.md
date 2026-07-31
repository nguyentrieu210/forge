# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Hoàn thiện tồn kho, sản xuất và danh mục Item

Branch: `feat/inventory-manufacturing-item-catalog-20260731`.

Authoritative metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`.

Tài liệu:

- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`
- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`
- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`

Gate hiện tại:

- G0 Scope: complete.
- G1 BRD: approved.
- G2 Plan: approved for Slice A.
- G3 Verification: partial, focused audit tests PASS 6/6.
- G4 Exact-head CI: chưa có evidence.
- G5 Staging: chưa bắt đầu.

### Slice A — Catalog audit và validator

Đã xong:

1. Chốt `alumdoor-v2.json` v2.0.34 là nguồn nghiệp vụ chính.
2. Viết planner audit cho Item, Item Group, UOM, Measurement Profile, Warehouse, BOM và Production Standard.
3. Viết CLI read-only:
   - fixture `--input`;
   - tenant `--tenant`;
   - remote mặc định redacted;
   - không có chế độ sửa/execute.
4. Thêm finding code/severity, count và checksum xác định.
5. Cover Item sai loại, UOM/conversion, profile/kho, thiếu BOM, BOM trùng/vòng lặp, redaction và CLI read-only.
6. Thêm package command `audit:alumdoor-catalog`.
7. Focused syntax + fixture tests PASS 6/6.

Việc tiếp theo:

1. Bổ sung regression test trực tiếp cho Alumdoor worker Item validator theo BRD:
   - dịch vụ không được giữ stock/manufacturing config;
   - thành phẩm/bán thành phẩm phải có nguồn cung và cờ sản xuất phù hợp;
   - nguyên liệu mua ngoài phải có cờ mua;
   - UOM conversion/profile bắt buộc và record disabled bị từ chối.
2. Audit metadata v2.0.34 bằng fixture sinh từ brief, không chỉ fixture nhỏ thủ công.
3. Chạy full gate trên exact HEAD:

```bash
pnpm --dir server run build
pnpm --dir server run test:unit
pnpm --dir server run test:sql
pnpm --dir server run brief:check
pnpm --filter metaforge run lint
pnpm run test
pnpm run typecheck
pnpm run build
```

4. Sửa toàn bộ lỗi do nhánh gây ra; không skip/nới assertion để lấy màu xanh.
5. Chỉ sau full gate mới mở draft PR và lấy exact-head CI.
6. Remote audit tenant `alu` là read-only, nhưng chỉ chạy trong môi trường có Cloudflare credential hợp lệ; không đưa credential hoặc raw report vào Git.
7. Report trong repo chỉ chứa count/checksum/error category đã redacted; raw export và report có tên lưu ngoài repo.

### Slice B — Inventory completeness

Chưa bắt đầu code. Chờ PR #14 merge/rebase và xác nhận migration head.

1. Khai vai trò kho: `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `QUARANTINE`, `SCRAP_OFFCUT`.
2. Thiết kế canonical physical stock identity cho nhôm, kính/tấm, cuộn và batch/serial.
3. Bổ sung append-only physical movement projection, revision claim và atomic persistence cùng stock ledger.
4. Stock Entry bắt buộc giữ nguồn lot/dimension, colour/condition và warehouse role phù hợp.
5. Cover receipt, transfer, issue, manufacture, return, reconciliation, cancel và concurrent issue.
6. Rollout mới mặc định tắt; không backfill/activation trước staging.

### Slice C — Manufacturing completeness

Chưa bắt đầu code.

1. Version BOM/Production Standard bằng revision và effective dates.
2. Validate finished/raw Item flags, UOM conversion, qty basis, circular và duplicate active BOM.
3. Work Order lưu immutable BOM snapshot/checksum.
4. Manufacturing progress giữ BOM row, lot movement, issue/consume/produce/scrap/offcut và reversal reference.
5. Hoàn thiện partial issue/partial manufacture, over-consumption/over-production guard, close và cancel/reverse.
6. Báo cáo WIP, thiếu vật tư, tiến độ, định mức so với thực tế và phế/offcut.

### Slice D — UI, QA và release

1. Làm gọn Item theo loại nhưng giữ server permission authoritative.
2. Thêm completeness/error indicator cho Item và BOM.
3. Work Order hiển thị snapshot, required/issued/produced/scrap/variance.
4. Desktop/mobile Browser QA cho Item, Stock Entry, BOM và Work Order.
5. Staging smoke toàn luồng trước production.
6. Không deploy production hoặc sửa secret nếu chưa có explicit approval riêng.

## P0 — Điều phối với PR mua hàng #14

- PR #14 vẫn draft/open, head kiểm tra gần nhất `2768188b438d8ce0cd41d7b792aab1848f48210f`.
- PR này đang dùng migration `0030` và chạm procurement/stock contracts.
- Nhánh tồn kho/sản xuất không lấy số migration khi #14 chưa merge.
- Sau merge: rebase, xử lý conflict, xác minh lại contract, chạy lại full tests/typecheck/build và exact-head CI.
- FIFO rollout tenant `alu` vẫn disabled.

## P0 — Production safety

- Không migrate hoặc mutate tenant `alu` từ nhánh này.
- Không deploy Gateway/Tenant Worker từ nhánh này.
- Không sửa Cloudflare secret.
- Không commit report raw, backup, `server/work/`, `tmp/`, `.env` hoặc generated artifacts.
- Production chỉ được cân nhắc sau G4 CI, G5 staging, catalog audit sạch và một yêu cầu deploy riêng.

## P1 — Các việc hiện hành ngoài nhánh này

- Xác minh đầy đủ Gateway/sidebar production và browser smoke.
- Hoàn thiện PR #14 mua hàng/nhập hàng và controlled FIFO rollout.
- Purchase Order print/PDF visual verification.
- Runtime page/dashboard/process, attachment và assign completeness.
- Cài Forge project pack bằng PR riêng sau khi review, không trộn vào nhánh nghiệp vụ này.
