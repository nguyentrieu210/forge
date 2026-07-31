# CURRENT STATUS

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
- Working branch: `feat/inventory-manufacturing-item-catalog-20260731`.
- PR: `#27` — `feat(inventory): audit Alumdoor Item catalog and manufacturing readiness`.
- Default đã đồng bộ tới `81697d454db5e22e758a8aeda8cc40f1f247b18a`; branch behind `0` và conflict-free tại lần kiểm gần nhất.
- PR body là nguồn authoritative cho final branch HEAD và exact-head workflow run/job IDs.
- Không commit `.env`, secret, `server/work/`, `tmp/`, backup hoặc generated report.

## Authoritative metadata và tài liệu

- Alumdoor metadata: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- Tài liệu:
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-A-REVIEW.md`.

## Slice A đã hoàn thiện

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

## Review score

- Review: `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-A-REVIEW.md`.
- Điểm: **96/100**.
- Critical: **0**.
- High: **0** sau remediation.
- Quality threshold `>=95`: **PASS**.

## CI evidence

Hai required workflows đã chạy xanh trên cả implementation head và handoff-doc head trong quá trình đóng gate:

- `PR Validation`: repository tests, typecheck và build **PASS**.
- `Inventory and Manufacturing CI`: focused tests, redacted audit artifact, server SQL, brief validation, frontend lint, repository tests, typecheck và build **PASS**.

Final merge chỉ dùng workflow result gắn với **current PR head**; exact SHA/run/job được cập nhật trong PR body sau vòng final CI. Workflow `Cloudflare Production Release Observation` không phải merge gate và không được tính vào bằng chứng test.

## Merge readiness

Đã đạt:

- G0 Scope: **PASS**.
- G1 Requirements/BRD: **PASS**.
- G2 Plan: **PASS**.
- G3 tests/typecheck/build: **PASS**.
- Review score: **96/100**.
- Critical/High code finding: **0**.
- Default synchronized, behind `0`, conflict-free tại lần kiểm gần nhất.
- Không migration, deploy, secret hoặc tenant mutation.

Quy tắc cuối:

1. Hai required workflows phải xanh trên current PR head.
2. Khi xanh, PR được chuyển khỏi draft sang ready for review.
3. Không merge trước yêu cầu merge rõ ràng của người dùng.

## Authoritative brief audit

Audit brief v2.0.34 xác nhận:

- 39 master fixtures;
- 14 UOM;
- 13 Item Group;
- 6 Measurement Profile;
- 6 Warehouse;
- 0 Item;
- 0 active BOM/Production Standard;
- 0 Critical, 2 High, 4 Medium.

Hai High là thiếu source Item/BOM trong brief, không phải code finding. Brief chứng minh schema/master scaffold, không chứng minh dữ liệu live.

## Live tenant audit và staging

- Chưa chạy remote audit tenant `alu`.
- Chưa staging/deploy.
- Live audit và staging là gate trước remediation dữ liệu, Slice B/C và production release; không phải điều kiện code-quality để merge Slice A.

## Điều phối và production safety

- PR mua hàng `#14` vẫn open/draft và có migration `0031`; phải xác minh migration head trước Slice B/C.
- FIFO rollout tenant `alu` vẫn disabled.
- Không deploy Gateway/Tenant Worker từ nhánh này.
- Không migrate/mutate tenant `alu`.
- Không sửa Cloudflare secret.

## RBAC Slice B ready for review

- Final branch: `feat/rbac-permission-slice-b-final-20260731`, được rebase sạch từ default `7af5f96a4a6bc756eb2c46511db17a609a49fdc5` sau khi default nhận thêm inventory/manufacturing work.
- PR authoritative: `#45`, ready for review, chưa merge.
- Code scope gồm migration `0030_rbac_audit.sql`, atomic administration service, router wiring, migration/service/allowed-forbidden contract tests.
- Audit ledger append-only, tenant scoped, JSON validated; database trigger chặn race xoá/khoá tenant admin cuối cùng.
- User create + roles, role replacement, enable/disable, password/session revoke và User Permission add/remove được ghi cùng audit trong một D1 batch.
- Self-disable, self-demote và last-admin guard đã có; audit không chứa password/hash/token/cookie/secret/trusted identity.
- Service tests: 8/8 PASS trên Node 22 + disposable SQLite.
- Core run `30622251469`, job `91129287256`: root test/typecheck/build PASS.
- Wiring run `30623092302`: jobs `91131952789` và `91131952849` PASS.
- Exact-head trước khi default dịch chuyển: runs `30623976677`, `30623976754`, `30624234745`, `30624234722`, `30624657390`, `30624657406` đều PASS các gate tương ứng, gồm browser QA và cookie auth smoke.
- Branch final giữ nguyên toàn bộ inventory/manufacturing handoff hiện hành; chỉ append phần RBAC.
- Còn lại: standard read-only exact-head CI sau rebase hiện tại, review diff/threads/mergeability và explicit approval trước merge.
- Không deploy Cloudflare, không sửa production secrets và không bật FIFO.