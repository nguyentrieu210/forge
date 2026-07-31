# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git và nguồn sự thật

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-manufacturing-item-catalog-20260731`.
- PR: `#27` — `feat(inventory): audit Alumdoor Item catalog and manufacturing readiness`.
- Default đã đồng bộ tới `81697d454db5e22e758a8aeda8cc40f1f247b18a`; branch behind `0` và GitHub báo `mergeable=true` trước commit tài liệu cuối.
- Exact code head đã qua hai merge gate: `39201fbb4a3816530a311273b68867584a9c5026`.
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

## Exact code-head CI

### PR Validation

- Run: `30622748689`.
- Job: `91130862243` — `Test, typecheck and build`.
- Exact head: `39201fbb4a3816530a311273b68867584a9c5026`.
- Install: **PASS**.
- Repository tests: **PASS**.
- Typecheck: **PASS**.
- Build: **PASS**.

### Inventory and Manufacturing CI

- Run: `30622748750`.
- Job: `91130862871` — `Audit, test, typecheck and build`.
- Exact head: `39201fbb4a3816530a311273b68867584a9c5026`.
- Focused catalog/warehouse/Item tests: **PASS**.
- Redacted authoritative audit và artifact upload: **PASS**.
- Server SQL: **PASS**.
- Brief validation: **PASS**.
- Frontend lint: **PASS**.
- Repository tests: **PASS**.
- Typecheck: **PASS**.
- Build: **PASS**.

Workflow `Cloudflare Production Release Observation` bị cancelled và không phải merge gate. Không có deployment nào được thực hiện.

## Merge readiness

Đã đạt:

- G0 Scope: **PASS**.
- G1 Requirements/BRD: **PASS**.
- G2 Plan: **PASS**.
- G3 tests/typecheck/build: **PASS**.
- G4 exact code-head CI: **PASS**.
- Review score: **96/100**.
- Critical/High code finding: **0**.
- Default synchronized, behind `0`, conflict-free.
- Không migration, deploy, secret hoặc tenant mutation.

Còn lại:

1. Chạy lại hai workflow bắt buộc trên final handoff-doc HEAD được tạo sau cập nhật trạng thái này.
2. Khi final HEAD xanh, cập nhật PR body và chuyển PR khỏi draft.
3. Chỉ merge sau yêu cầu merge rõ ràng của người dùng.

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
