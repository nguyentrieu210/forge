# CURRENT STATUS

## Tồn kho/Sản xuất — Slice B và Slice C đã mở

- Default tại thời điểm mở nhánh: `4d566a44fd1f04979e4e6de952fd81da9b28e93e`.
- Slice B branch: `feat/inventory-physical-stock-slice-b-20260731`.
- Slice C branch dự kiến: `feat/manufacturing-bom-workorder-slice-c-20260731`, xếp chồng lên Slice B.
- Kickoff authoritative: `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-BC-KICKOFF.md`.
- Metadata authoritative: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- G0/G1: PASS; G2 đã refresh theo default hiện tại; G3 cho Slice B/C chưa bắt đầu.
- RBAC PR #45 đã merge và đưa migration `0030_rbac_audit.sql` vào default.
- Purchase PR #14 vẫn open/draft và đang giữ migration `0031_purchase_allocation_control_metadata.sql`.
- Slice B/C chưa được phép nhận số migration cho tới khi #14 merge/close và migration head được kiểm lại.
- Chưa sửa runtime/schema, chưa migration tenant, chưa deploy, chưa đổi secret và FIFO vẫn disabled.

## Nhánh Bán hàng — multi-UOM price và tồn trên form

- Branch: `feat/sales-complete-20260731`, base `cd60f8c09c48105db84a82c12ad3b32d9f075064`.
- Draft PR: `#25` — `feat(sales): multi-UOM pricing and stock availability`.
- Snapshot code/test trước commit trạng thái: `9bcb36f4f068e662cfad2e1f64591390808cbe8f`; HEAD đã gồm tài liệu trước lượt rerun: `442a0b59c683ffd26cf012db8131a84f684b512b`.
- Đã triển khai khoá giá chính xác theo `Bảng giá + Mặt hàng + ĐVT`; dữ liệu Item Price cũ không có UOM vẫn tương thích, còn dữ liệu cũ đã khai UOM chỉ được dùng khi dòng bán khớp tuyệt đối.
- Báo giá/Đơn hàng lấy danh sách ĐVT hợp lệ từ Item, nạp giá đúng ĐVT và hiện tồn theo kho/ĐVT bán qua method chỉ đọc `alumdoor.sales.item_context`.
- Preview giá từ chối Item Price thiếu tiền tệ, sai tiền tệ chứng từ, đơn giá âm/sai định dạng hoặc đã ngừng áp dụng; không đẩy rate không dùng được vào dòng bán.
- `server/tests/alumdoor-sales-item-context.test.mjs` có 5 test tích hợp trực tiếp cho exact UOM price, quy đổi tồn, currency mismatch, disabled/malformed price, legacy UOM và undeclared UOM.
- `server/tests/alumdoor-sales-permissions.test.mjs` nạp metadata thật từ `server/briefs/alumdoor.json` vào `MetadataPermissionService`: vai trò `Kinh doanh` đọc được nhưng bị từ chối create/save trên `Price List` và `Item Price`; vai trò `Kế toán` vẫn create/save được cả hai.
- Dòng bán hiển thị `Còn N <ĐVT>`, `Hết hàng`, `Chưa chọn kho`, `Không quản lý tồn` hoặc lỗi đọc tồn/giá.
- Preview tồn không giữ chỗ; chốt thiếu tồn ở Delivery Note submit vẫn authoritative.
- GitHub Actions từng thất bại trước `Set up job` với `steps=null`; rerun không đổi code đã xác nhận đó là lỗi hạ tầng tạm thời.
- Sales Feature CI rerun run `30620774111`, job `91136237101`: install, server unit tests, SQL tests, Alumdoor brief check, client tests, typecheck và build đều **PASS** trên HEAD `442a0b59c683ffd26cf012db8131a84f684b512b`.
- PR Validation rerun run `30620774088`, job `91136251549`: test, typecheck và build đều **PASS** trên cùng HEAD.
- G4 đã mở lại; blocker còn lại trước khi đề nghị merge là browser/staging smoke với dữ liệu và tài khoản thật.
- Chưa thiết kế reservation/ATP theo Sales Order.
- Chưa merge PR, chưa deploy Cloudflare hoặc production, không sửa secrets.

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git và nguồn sự thật

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch cũ của Slice A: `feat/inventory-manufacturing-item-catalog-20260731`.
- PR #27 đã merge với merge commit `7af5f96a4a6bc756eb2c46511db17a609a49fdc5`.
- Không commit `.env`, secret, `server/work/`, `tmp/`, backup hoặc generated report.

## Authoritative metadata và tài liệu

- Alumdoor metadata: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- Tài liệu:
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-A-REVIEW.md`.

## Slice A đã hoàn thiện và merge

### Catalog audit

- `server/scripts/alumdoor-catalog-audit-planner.mjs`
  - audit Item, Item Group, UOM, Measurement Profile, Warehouse, BOM và Production Standard;
  - finding code/severity/count/checksum xác định;
  - redaction;
  - missing source, duplicate/circular BOM, UOM/profile/warehouse và warehouse-role coverage.
- `server/scripts/audit-alumdoor-catalog.mjs`
  - chỉ đọc;
  - hỗ trợ fixture, authoritative brief và tenant source;
  - remote mặc định redacted;
  - từ chối write/fix/apply flags;
  - đọc cả active và disabled master rows;
  - output mặc định ở OS temp và từ chối output nằm trong repository.

### Runtime Item validation

- `server/apps-src/alumdoor-worker/src/entry.ts` compose validator lịch sử và invariant catalog.
- Lỗi hệ thống/auth của validator lịch sử được giữ nguyên; khi cả hai là lỗi nghiệp vụ 422, invariant catalog nghiêm hơn được trả về để không che lý do field-level.
- `server/apps-src/alumdoor-worker/src/item-catalog-invariants.ts` khóa:
  - dịch vụ không stock/manufacturing/batch/serial/reorder;
  - non-service bắt buộc stage/supply hợp lệ;
  - purchase/manufacturing eligibility server-side;
  - partial-save merge current Item;
  - thiếu `PLATFORM` binding thì fail closed.
- `server/apps-src/alumdoor-worker/wrangler.jsonc` dùng `src/entry.ts`; không đổi secret hoặc binding.

### Regression

- `server/tests/alumdoor-catalog-audit.test.mjs`.
- `server/tests/alumdoor-catalog-warehouse-role.test.mjs`.
- `server/tests/alumdoor-item-validator.test.mjs`.
- Cover disabled rows, redaction, deterministic checksum, output safety, service tracking, required stage/supply, UOM/profile/group và partial save.

## Review score Slice A

- Review: `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-A-REVIEW.md`.
- Điểm: **96/100**.
- Critical: **0**.
- High: **0** sau remediation.
- Quality threshold `>=95`: **PASS**.

## Live tenant audit và staging

- Chưa chạy remote audit tenant `alu`.
- Chưa staging/deploy cho tồn kho/sản xuất.
- Live audit và staging là gate trước remediation dữ liệu, rollout hoặc production release của Slice B/C.

## Điều phối và production safety

- PR mua hàng `#14` vẫn open/draft và có migration `0031`; phải xác minh migration head trước schema Slice B/C.
- FIFO rollout tenant `alu` vẫn disabled.
- Không deploy Gateway/Tenant Worker từ nhánh này.
- Không migrate/mutate tenant `alu`.
- Không sửa Cloudflare secret.

## RBAC Slice B đã merge

- PR #45 đã merge với merge commit `4341091b8a8dc0cea3de96510c34dc68a8b00ecb`.
- Migration `0030_rbac_audit.sql` là migration head đã biết trên default trước khi PR #14 merge.
- Atomic administration, audit ledger và last-admin guard đã vào default.
