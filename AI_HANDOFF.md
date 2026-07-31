# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-manufacturing-item-catalog-20260731`.
- Draft PR: `#27` — `feat(inventory): audit Alumdoor Item catalog and manufacturing readiness`.
- Authoritative Alumdoor metadata: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- Không commit `.env`, secret, `server/work/`, `tmp/`, backup hoặc generated report.

## Mục tiêu nhánh

Slice A xây nền an toàn để hoàn thiện danh mục Item, tồn kho và sản xuất:

1. BRD và technical plan.
2. Audit planner/CLI read-only cho Item, UOM, Measurement Profile, Warehouse và BOM/Production Standard.
3. Runtime Item validator server-side.
4. Regression tests và dedicated CI.
5. Review score `>=95` trước khi mở merge gate.

Slice B/C/D về physical stock ledger, manufacturing lifecycle và UI chưa nằm trong PR merge này.

## Implementation hiện tại

### Audit

- `server/scripts/alumdoor-catalog-audit-planner.mjs`
  - deterministic finding code/severity/count/checksum;
  - redaction;
  - Item/UOM/profile/warehouse/BOM validation;
  - duplicate/circular BOM;
  - source completeness và warehouse-role coverage.
- `server/scripts/audit-alumdoor-catalog.mjs`
  - `--input`, `--brief`, `--tenant`;
  - read-only, từ chối write/fix/apply flags;
  - remote mặc định redacted;
  - đọc cả active và disabled master records;
  - output mặc định vào OS temp và từ chối output trong repository.

### Runtime validation

- `server/apps-src/alumdoor-worker/src/entry.ts` compose validator lịch sử và invariant mới.
- `server/apps-src/alumdoor-worker/src/item-catalog-invariants.ts`:
  - service không được stock/manufacturing/batch/serial/reorder;
  - non-service bắt buộc stage/supply hợp lệ;
  - nguồn mua phải có purchase eligibility;
  - hàng sản xuất phải có manufacturing eligibility;
  - partial save đọc và ghép current Item;
  - thiếu `PLATFORM` binding thì fail closed, không fallback ra mạng.
- `server/apps-src/alumdoor-worker/wrangler.jsonc` dùng `src/entry.ts` làm entrypoint; không đổi binding/secret.

### Test

- `server/tests/alumdoor-catalog-audit.test.mjs`.
- `server/tests/alumdoor-catalog-warehouse-role.test.mjs`.
- `server/tests/alumdoor-item-validator.test.mjs`.
- `.github/workflows/inventory-feature-ci.yml` chạy build server, focused tests, redacted audit artifact, SQL, brief check, frontend lint, repository tests, typecheck và build.

## Review

Review authoritative:

- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-A-REVIEW.md`.
- Điểm: **96/100**.
- Critical: **0**.
- High: **0** sau remediation.

Các lỗi đã sửa trong review:

1. Remote audit bỏ mất disabled Item.
2. Service Item chưa chặn batch/serial.
3. Partial-save có fallback global network khi thiếu binding.
4. Stage/supply rỗng được runtime chấp nhận.
5. Generated audit report có thể rơi vào repository.

## Git và đồng bộ

- Default đã được đồng bộ qua merge commit `05477f70f74374516961127cc700f8341ce01196`, nhận workflow `PR Validation` được khôi phục từ default `81697d454db5e22e758a8aeda8cc40f1f247b18a`.
- Implementation/test head trước scorecard/handoff docs: `367743016a7e61a27afe04b8eb9f39e489a5c4b7`.
- Scorecard commit: `d885b25a14fa84f3c282847c3dac7e444f6d2384`.
- PR mergeable sau lần kiểm gần nhất nhưng vẫn draft.

## CI blocker hiện tại

Các workflow trên implementation head và merge-sync head thất bại trước checkout/`Set up job`:

- job record có `steps=null`;
- downloadable log không tồn tại;
- cả `Inventory and Manufacturing CI`, `PR Validation` và workflow quan sát production cùng bị ảnh hưởng;
- hiện tượng tương tự được ghi nhận trên PR khác trong cùng repository.

Không có test assertion, typecheck hoặc build command nào chạy trong các failed run này. Phân loại hiện tại: **GitHub Actions pre-run infrastructure/configuration blocker; chưa đủ bằng chứng để kết luận runner, billing, policy hay provider**.

Không được coi G4 PASS, không chuyển PR ready và không merge cho tới khi hai workflow bắt buộc xanh trên exact final HEAD.

## Merge policy cho Slice A

Merge được phép khi:

1. Review score `>=95` — hiện **PASS 96/100**.
2. Critical/High code finding = 0 — hiện **PASS**.
3. Branch đồng bộ default và conflict-free — kiểm lại trước merge.
4. `Inventory and Manufacturing CI` PASS trên exact final HEAD.
5. `PR Validation` PASS trên exact final HEAD.
6. Người dùng đưa yêu cầu merge rõ ràng sau khi xem trạng thái cuối.

Live tenant audit `alu` và staging không phải điều kiện để merge công cụ audit/validator Slice A. Chúng là gate trước remediation dữ liệu, Slice B/C và mọi deployment.

## Việc tiếp theo

1. Đọc `CURRENT_STATUS.md`, `NEXT_TASKS.md` và review scorecard.
2. Kiểm tra default HEAD và PR #27 head.
3. Retry/retrigger required workflows khi GitHub Actions có thể cấp runner.
4. Nếu CI chạy, đọc đúng failed step; chỉ sửa code khi có code failure.
5. Khi cả hai workflow PASS trên exact final HEAD, cập nhật PR body, chuyển khỏi draft và báo sẵn sàng merge.
6. Không merge hoặc deploy nếu người dùng chưa yêu cầu rõ hành động đó.

## Safety

- Không migration trong PR #27.
- Không mutate tenant `alu`.
- Không deploy Gateway/Tenant Worker.
- Không sửa Cloudflare secret.
- FIFO Purchase Receipt vẫn giữ disabled.
