# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git và nguồn sự thật

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default HEAD đã đồng bộ: `ad9b91083fe686987aacae44e83a890e4ba592cc`.
- Branch nghiệp vụ: `feat/inventory-manufacturing-item-catalog-20260731`.
- Merge default vào feature: `5b48548acc6c0872409afddb5404632904b3b842`.
- Code HEAD đã qua CI trước commit tài liệu này: `2ada71006af123753ad9f81ec154d77e2726ca32`.
- Draft PR: `#27` — `feat(inventory): audit Alumdoor Item catalog and manufacturing readiness`.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env`, secret hoặc generated artifacts.

## Nguồn metadata Alumdoor

- Nguồn nghiệp vụ chính: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- `server/briefs/alumdoor.json` version `1.27.3` chỉ dùng tương thích/đối chiếu; không nhận thay đổi nghiệp vụ song song.
- Tài liệu authoritative:
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`.

## Gate

- G0 Scope: **PASS**.
- G1 BRD: **PASS**, được người dùng ủy quyền duyệt.
- G2 Technical plan: **PASS cho Slice A**.
- G3 Test/lint/typecheck/build: **PASS cho Slice A**.
- G4 Exact code-head CI: **PASS tại `2ada710...`**.
- G5 Staging: **chưa bắt đầu**.

## Slice A — Catalog audit và Item validator

### Audit tooling

- `server/scripts/alumdoor-catalog-audit-planner.mjs`
  - audit Item, Item Group, UOM, Measurement Profile, Warehouse, Bill of Materials và Production Standard;
  - finding có severity/code ổn định, count và SHA-256 checksum xác định;
  - phát hiện Item sai loại/cờ/UOM/profile/kho, BOM thiếu/trùng/vòng lặp;
  - phát hiện nguồn không có Item/BOM thay vì coi tập rỗng là sạch;
  - đọc `warehouse_role` và `stock_role`, chuẩn hóa vai trò tiếng Việt;
  - kiểm tra coverage `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `QUARANTINE`, `SCRAP_OFFCUT`, `GENERAL`.
- `server/scripts/audit-alumdoor-catalog.mjs`
  - CLI read-only;
  - hỗ trợ `--input`, `--brief`, `--tenant`;
  - remote mặc định redacted;
  - từ chối `--execute`, `--apply`, `--fix`, `--write-back`;
  - report có tên không được ghi trong repository.

### Runtime Item validation

- `server/apps-src/alumdoor-worker/src/item-catalog-invariants.ts`
  - dịch vụ không được tham gia sản xuất;
  - dịch vụ không được giữ ĐVT tồn, kho mặc định hoặc reorder level;
  - khóa enum giai đoạn vật tư và nguồn cung;
  - `Mua ngoài`/`Mua hoặc sản xuất` phải bật `is_purchase_item`;
  - bán thành phẩm, thành phẩm hoặc nguồn tự sản xuất phải bật `include_item_in_manufacturing`;
  - partial save đọc record hiện tại qua callback/binding rồi mới kiểm invariant.
- `server/apps-src/alumdoor-worker/src/entry.ts`
  - compose validator lịch sử và invariant mới trên `/hooks/validate` cho Item;
  - hai phép kiểm chạy song song;
  - route khác chuyển nguyên vẹn sang Worker hiện hữu.
- `server/apps-src/alumdoor-worker/wrangler.jsonc`
  - entrypoint đổi từ `src/index.ts` sang `src/entry.ts`;
  - không thay binding hoặc secret.
- `server/tests/alumdoor-item-validator.test.mjs`
  - chạy qua HTTP surface thật;
  - cover dịch vụ, purchase/manufacturing flags, enum, Item Group, profile, conversion và partial save của cả validator cũ lẫn invariant mới.

### CI và artifact

Workflow chuyên biệt: `Inventory and Manufacturing CI`.

- Run: `30618647612`.
- Job: `91117731059`.
- Exact code head: `2ada71006af123753ad9f81ec154d77e2726ca32`.
- Focused catalog/warehouse-role/Item tests: **PASS**.
- Redacted authoritative brief audit artifact: **PASS**.
- Server SQL: **PASS**.
- Brief validation: **PASS**.
- Frontend lint: **PASS**.
- Repository tests: **PASS**.
- Typecheck: **PASS**.
- Build: **PASS**.

Workflow chuẩn từ default: `PR Validation`.

- Run: `30618647081`.
- Job: `91117676626`.
- Tests, typecheck và build: **PASS** tại cùng code head.

Workflow `Cloudflare Production Release Observation` không phải bằng chứng CI của nhánh này và không được tính vào gate.

## Audit authoritative brief v2.0.34

Artifact gần nhất trước thay đổi validator:

- Run: `30613404344`.
- Artifact ID: `8786370029`.
- Checksum: `3eaf1f6780dcaaa5ebb58c275ab405f3df416a715743b54650271db5e2a3a2b4`.

Kết quả redacted:

- 39 fixture: 14 UOM, 13 Item Group, 6 Measurement Profile, 6 Warehouse.
- Item: `0`.
- Active BOM/Production Standard: `0`.
- Warehouse role: `GENERAL = 2`, `SCRAP_OFFCUT = 3`.
- Findings: `0 Critical`, `2 High`, `4 Medium`, `0 Low`.
- High: `SOURCE_ITEM_RECORDS_MISSING`, `SOURCE_BOM_RECORDS_MISSING`.
- Medium: thiếu `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `QUARANTINE`.

Kết luận: brief v2.0.34 chứng minh schema và master khung, không chứng minh catalog Item/BOM live đã sẵn sàng.

## Remote audit tenant `alu`

- CLI đã sẵn sàng cho audit read-only và redacted.
- Chưa có kết quả remote audit tenant `alu`.
- Đã thử dựng workflow một lần nhưng không giữ lại vì GitHub/connector chặn commit workflow chứa credential context và cấu hình thử nghiệm có nguy cơ làm mù CI.
- Workflow thử nghiệm và script patch tạm đã bị xóa khỏi branch.
- Không yêu cầu hoặc ghi token vào chat/repo.
- Remote audit phải chạy trong môi trường vận hành đã có Cloudflare credential hợp lệ; chỉ count, checksum và finding code redacted được đưa vào handoff.

## Điều phối nhánh khác

- PR mua hàng `#14`: open/draft, head kiểm tra gần nhất `7201226103d54f6b87a62ed6d020c58926ff9ef0`.
- PR #14 dùng migration `0030` và chạm procurement/stock contracts.
- Nhánh tồn kho/sản xuất chưa tạo migration; phải kiểm tra lại migration head sau khi PR #14 merge.
- PR RBAC `#34` vẫn open/draft; nhánh này không sửa phạm vi RBAC.
- Default đã bổ sung `.github/workflows/pr-validation.yml`; workflow này đã chạy thành công trên PR #27.

## Production safety

- Chưa deploy Gateway hoặc Tenant Worker từ nhánh này.
- Chưa migration hoặc mutate tenant `alu`.
- Chưa chạy remote catalog audit production.
- Chưa sửa Cloudflare secret.
- FIFO Purchase Receipt production vẫn phải giữ disabled.
