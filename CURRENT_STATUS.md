# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git và nguồn sự thật

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default HEAD kiểm tra gần nhất: `cd60f8c09c48105db84a82c12ad3b32d9f075064`.
- Branch nghiệp vụ: `feat/inventory-manufacturing-item-catalog-20260731`.
- Base branch SHA: `cd60f8c09c48105db84a82c12ad3b32d9f075064`.
- Code HEAD trước commit trạng thái này: `3dec64432e46cbd1c67fd23aad1f705254115f97`.
- Draft PR: `#27` — `feat(inventory): audit Alumdoor Item catalog and manufacturing readiness`.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env`, secret hoặc generated artifacts.

## Nguồn metadata Alumdoor

- Nguồn nghiệp vụ chính: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- `server/briefs/alumdoor.json` version `1.27.3` chỉ dùng tương thích/đối chiếu; không nhận thay đổi nghiệp vụ song song.
- Tài liệu authoritative của nhánh:
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`.

## Gate

- G0 Scope: **PASS**.
- G1 BRD: **PASS**, được người dùng ủy quyền duyệt.
- G2 Technical plan: **PASS cho Slice A**.
- G3 Test/lint/typecheck/build: **PASS cho Slice A**.
- G4 Exact-head CI: **PASS cho code HEAD `3dec644...`**.
- G5 Staging: **chưa bắt đầu**.

## Slice A — Catalog audit và Item validator

Đã triển khai:

- `server/scripts/alumdoor-catalog-audit-planner.mjs`
  - audit Item, Item Group, UOM, Measurement Profile, Warehouse, Bill of Materials và Production Standard;
  - finding có severity/code ổn định, count và SHA-256 checksum xác định;
  - phát hiện Item sai loại/cờ/UOM/profile/kho, BOM thiếu/trùng/vòng lặp;
  - phát hiện nguồn audit không có Item/BOM thay vì coi tập rỗng là sạch;
  - đọc cả `warehouse_role` và `stock_role`, chuẩn hóa vai trò tiếng Việt sang `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `QUARANTINE`, `SCRAP_OFFCUT`, `GENERAL`;
  - kiểm tra coverage vai trò kho sản xuất.
- `server/scripts/audit-alumdoor-catalog.mjs`
  - CLI read-only;
  - hỗ trợ `--input`, `--brief` và `--tenant`;
  - remote mặc định redacted;
  - từ chối `--execute`, `--apply`, `--fix`, `--write-back`;
  - report có tên không được ghi trong repository.
- `server/tests/alumdoor-catalog-audit.test.mjs`
  - catalog hợp lệ, lỗi Item/UOM/BOM, BOM trùng/vòng lặp, checksum, redaction, CLI read-only và audit trực tiếp brief v2.0.34.
- `server/tests/alumdoor-catalog-warehouse-role.test.mjs`
  - khóa alias tiếng Việt, bao gồm `Kho đầu thừa`, `Kho phế`, `Kho chính`, kho NVL/WIP/thành phẩm/chờ kiểm.
- `server/tests/alumdoor-item-validator.test.mjs`
  - gọi đúng HTTP surface `/hooks/validate` của Alumdoor Worker;
  - cover Item nguyên liệu hợp lệ, dịch vụ giữ stock, profile thiếu/disabled, conversion thiếu và partial-save merge.
- `.github/workflows/inventory-feature-ci.yml`
  - workflow chỉ kiểm thử, không deploy;
  - build server, focused tests, audit redacted, artifact, SQL, brief check, frontend lint, full tests, typecheck và build.
- `server/package.json`
  - command `audit:alumdoor-catalog`.

Commit đáng chú ý:

- `daca0e0b9df3679102ebc84721a139a6561b1e86` — CLI đọc authoritative brief.
- `fb6e53f20412d4b7708966258cbcdb99da86c1b9` — test brief v2.0.34.
- `b584a605629bbcffefbe8d8be3a9e67dddb6e870` — Item validator HTTP tests.
- `17468c08197040b760f0f2bc5995d127ccf658ba` — dedicated inventory CI.
- `e7b6b383784a267eca43c67cd8b8cd17faed93cd` — sửa cách chạy audit artifact.
- `55b7ed8dfd9208303ba38d6f268cf508e321753b` — source completeness và warehouse role coverage.
- `0c2205845abc8bd61bbbd5c16fc94c171e4a3ee0` — chuẩn hóa chữ `đ` trong role tiếng Việt.
- `c196ef9ae12f03093b1511b4ff5e992e24da87b3` — regression warehouse role aliases.
- `3dec64432e46cbd1c67fd23aad1f705254115f97` — đưa regression mới vào focused CI.

## CI exact-head

Workflow: `Inventory and Manufacturing CI`.

- Run: `30613060416`.
- Job: `91100056915` — `Audit, test, typecheck and build`.
- Exact head: `3dec64432e46cbd1c67fd23aad1f705254115f97`.
- Install: **PASS**.
- Focused catalog + Item validator tests: **PASS, 14/14**.
- Redacted authoritative brief audit: **PASS tạo artifact**.
- Server SQL tests: **PASS**.
- Brief validation: **PASS**.
- Frontend lint: **PASS**.
- Repository tests: **PASS**.
- Typecheck: **PASS**.
- Build: **PASS**.

Workflow `Cloudflare Production Release Observation` vẫn xuất hiện trên push nhưng không phải bằng chứng CI của nhánh này và không được tính vào gate.

## Audit authoritative brief v2.0.34

Artifact:

- Run: `30613060416`.
- Artifact ID: `8786245329`.
- Artifact name: `alumdoor-v2-catalog-audit-30613060416`.
- Report checksum: `3eaf1f6780dcaaa5ebb58c275ab405f3df416a715743b54650271db5e2a3a2b4`.

Kết quả redacted:

- Tổng fixture được audit: `39`.
- UOM: `14`.
- Item Group: `13`.
- Measurement Profile: `6`.
- Warehouse: `6`.
- Item: `0`.
- Active BOM/Production Standard: `0`.
- Warehouse role hiện có: `GENERAL = 2`, `SCRAP_OFFCUT = 3`.
- Findings: `0 Critical`, `2 High`, `4 Medium`, `0 Low`.
- Hai High:
  - `SOURCE_ITEM_RECORDS_MISSING`;
  - `SOURCE_BOM_RECORDS_MISSING`.
- Bốn Medium: thiếu coverage `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `QUARANTINE`.

Kết luận: brief v2.0.34 định nghĩa schema và master khung tốt nhưng **không phải catalog Item/BOM đầy đủ**. Không thể dùng report này để tuyên bố gần 300 Item live hoặc BOM đã sẵn sàng. Cần remote audit read-only tenant `alu` hoặc một export redacted authoritative ngoài Git.

## Điều phối với PR mua hàng #14

- PR `#14` vẫn open/draft, chưa merge.
- Head kiểm tra gần nhất: `c18bc8d4f3be1f84c1a5d3a3d1647f419712d003`.
- PR #14 đang dùng migration `0030` và chạm procurement/stock contracts.
- Nhánh tồn kho/sản xuất không tạo migration mới trước khi PR #14 merge hoặc migration head được xác nhận lại.
- Sau merge phải rebase và chạy lại toàn bộ tests/typecheck/build/exact-head CI.

## Production safety

- Chưa deploy Gateway hoặc Tenant Worker từ nhánh này.
- Chưa migration hoặc mutate tenant `alu`.
- Chưa chạy remote catalog audit production.
- Chưa sửa Cloudflare secret.
- FIFO Purchase Receipt production vẫn phải giữ disabled.
