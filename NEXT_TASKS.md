# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Hoàn thiện tồn kho, sản xuất và danh mục Item

Branch: `feat/inventory-manufacturing-item-catalog-20260731`.

Draft PR: `#27`.

Authoritative metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`.

Tài liệu:

- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`
- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`
- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`

Gate hiện tại:

- G0 Scope: **PASS**.
- G1 BRD: **PASS**.
- G2 Slice A plan: **PASS**.
- G3 Test/lint/typecheck/build: **PASS trên code HEAD `3dec644...`**.
- G4 Exact-head CI: **PASS, run `30613060416`, job `91100056915`**.
- G5 Staging: **chưa bắt đầu**.

## Slice A — Catalog audit và validator

### Đã xong

1. Chốt `alumdoor-v2.json` v2.0.34 là nguồn metadata nghiệp vụ chính.
2. Planner audit Item, Item Group, UOM, Measurement Profile, Warehouse, BOM và Production Standard.
3. CLI read-only hỗ trợ:
   - `--input` cho fixture;
   - `--brief` cho authoritative brief;
   - `--tenant` cho D1 remote;
   - redaction mặc định với remote;
   - từ chối mọi cờ write/fix/execute.
4. Finding code/severity, deterministic count và SHA-256 checksum.
5. Audit phát hiện nguồn thiếu Item/BOM, không coi tập rỗng là sạch.
6. Warehouse role đọc cả `warehouse_role` và `stock_role`, khóa alias tiếng Việt.
7. Item validator regression chạy qua HTTP `/hooks/validate` thật.
8. Dedicated CI không deploy, chạy:
   - focused tests `14/14`;
   - server SQL;
   - brief check;
   - frontend lint;
   - repository tests;
   - typecheck;
   - build.
9. Artifact audit brief v2.0.34:
   - ID `8786245329`;
   - checksum `3eaf1f6780dcaaa5ebb58c275ab405f3df416a715743b54650271db5e2a3a2b4`;
   - `2 High`, `4 Medium`.

### Việc còn lại để đóng hoàn toàn Slice A

1. Chạy **remote audit read-only** tenant `alu` trong môi trường có Cloudflare credential hợp lệ:
   - report mặc định redacted;
   - raw export và report có tên lưu ngoài Git;
   - không dùng `--include-names` trong artifact CI;
   - không mutation hoặc migration.
2. Ghi vào repo chỉ các count, checksum và finding code không chứa tên/dữ liệu kinh doanh.
3. Review các High của dữ liệu live:
   - Item category/cờ mua-bán-sản xuất;
   - UOM và conversion;
   - measurement profile;
   - default warehouse/account;
   - active BOM/Production Standard;
   - BOM duplicate/circular/UOM/qty basis.
4. Bổ sung runtime rules còn thiếu vào Alumdoor Item validator:
   - dịch vụ không được giữ manufacturing, warehouse, reorder hoặc tracking config;
   - `Mua ngoài`/`Mua hoặc sản xuất` phải có `is_purchase_item`;
   - bán thành phẩm/thành phẩm tự sản xuất phải có `include_item_in_manufacturing`;
   - record disabled hoặc group node không được dùng làm leaf master.
5. Chạy lại focused tests và full exact-head CI sau khi runtime validator thay đổi.

## Slice B — Inventory completeness

**Chưa bắt đầu migration/runtime ledger. Chờ PR #14 merge/rebase và xác nhận migration head.**

1. Chốt warehouse role model:
   - `RAW_MATERIAL`;
   - `WIP`;
   - `FINISHED_GOODS`;
   - `QUARANTINE`;
   - `SCRAP_OFFCUT`;
   - `GENERAL` chỉ cho stock không thuộc sản xuất.
2. Map hoặc bổ sung kho vật lý cho bốn role còn thiếu trong brief hiện tại: RAW, WIP, finished và quarantine.
3. Thiết kế canonical physical stock identity cho nhôm, kính/tấm, cuộn và batch/serial.
4. Thêm append-only physical movement projection, revision claim và persistence atomic với stock ledger.
5. Stock Entry phải giữ source lot/dimension, colour/condition, source/target role và reversal identity.
6. Cover receipt, transfer, issue, manufacture, return, reconciliation, cancel và concurrent issue.
7. Rollout mới mặc định tắt; không backfill/activation trước staging.

## Slice C — Manufacturing completeness

1. Version BOM/Production Standard bằng revision và effective dates.
2. Validate finished/raw Item flags, UOM conversion, qty basis, circular và duplicate active BOM.
3. Work Order lưu immutable BOM snapshot/checksum.
4. Manufacturing progress giữ BOM row, physical lot, issue/consume/produce/scrap/offcut và reversal reference.
5. Hoàn thiện partial issue, partial manufacture, over-consumption/over-production guard, close và cancel/reverse.
6. Báo cáo WIP, thiếu vật tư, tiến độ, định mức so với thực tế và phế/offcut.

## Slice D — UI, QA và release

1. Làm gọn form Item theo loại nhưng giữ server permission authoritative.
2. Thêm completeness/error indicator cho Item và BOM.
3. Work Order hiển thị snapshot, required/issued/produced/scrap/variance.
4. Desktop/mobile Browser QA cho Item, Stock Entry, BOM và Work Order.
5. Staging smoke toàn luồng trước production.
6. Không deploy production hoặc sửa secret nếu chưa có yêu cầu riêng.

## P0 — Điều phối với PR mua hàng #14

- PR #14 vẫn draft/open, head kiểm tra gần nhất `c18bc8d4f3be1f84c1a5d3a3d1647f419712d003`.
- PR này dùng migration `0030` và cùng chạm procurement/stock contracts.
- Nhánh tồn kho/sản xuất không lấy số migration khi #14 chưa merge.
- Sau merge: rebase, xử lý conflict, kiểm tra migration head và chạy lại toàn bộ CI.
- FIFO rollout tenant `alu` vẫn disabled.

## P0 — Production safety

- Không migrate hoặc mutate tenant `alu` từ nhánh này.
- Không deploy Gateway/Tenant Worker từ nhánh này.
- Không sửa Cloudflare secret.
- Không commit report raw, backup, `server/work/`, `tmp/`, `.env` hoặc generated artifacts.
- Production chỉ được cân nhắc sau G5 staging, live catalog audit sạch và một yêu cầu deploy riêng.
