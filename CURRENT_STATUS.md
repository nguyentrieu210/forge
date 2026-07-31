# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git và nguồn sự thật

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-manufacturing-item-catalog-20260731`.
- Draft PR: `#27` — `feat(inventory): audit Alumdoor Item catalog and manufacturing readiness`.
- Default đã đồng bộ tới commit `81697d454db5e22e758a8aeda8cc40f1f247b18a` qua merge `05477f70f74374516961127cc700f8341ce01196`.
- Implementation/test head trước review/handoff docs: `367743016a7e61a27afe04b8eb9f39e489a5c4b7`.
- Review scorecard commit: `d885b25a14fa84f3c282847c3dac7e444f6d2384`.
- Không commit `.env`, secret, `server/work/`, `tmp/`, backup hoặc generated report.

## Authoritative metadata và tài liệu

- Alumdoor metadata: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- Tài liệu:
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`;
  - `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-SLICE-A-REVIEW.md`.

## Slice A đã hoàn thiện về code

### Catalog audit

- `server/scripts/alumdoor-catalog-audit-planner.mjs`
  - audit Item, Item Group, UOM, Measurement Profile, Warehouse, BOM và Production Standard;
  - deterministic finding code/severity/count/checksum;
  - redaction;
  - missing source, duplicate/circular BOM, UOM/profile/warehouse và warehouse-role coverage.
- `server/scripts/audit-alumdoor-catalog.mjs`
  - read-only;
  - hỗ trợ fixture, authoritative brief và tenant source;
  - remote mặc định redacted;
  - từ chối write/fix/apply flags;
  - đọc cả active và disabled master rows;
  - output mặc định ở OS temp;
  - từ chối output nằm trong repository.

### Runtime Item validation

- `server/apps-src/alumdoor-worker/src/entry.ts` compose validator cũ và invariant mới.
- `server/apps-src/alumdoor-worker/src/item-catalog-invariants.ts`:
  - service không được stock/manufacturing/batch/serial/reorder;
  - non-service bắt buộc stage/supply hợp lệ;
  - purchase/manufacturing eligibility server-side;
  - partial-save merge current Item;
  - thiếu `PLATFORM` binding thì fail closed.
- `server/apps-src/alumdoor-worker/wrangler.jsonc` dùng `src/entry.ts`; không đổi secret/binding.

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

## GitHub Actions blocker

Các run gần nhất thất bại trước checkout/`Set up job`:

- `Inventory and Manufacturing CI` run `30621757557`.
- `PR Validation` run `30621757553`.
- Workflow quan sát production run `30621757590` cũng bị cùng hiện tượng.
- Job records có `steps=null`; downloadable logs không tồn tại.
- Retry các run trước đó cho kết quả pre-run failure tương tự.
- PR #14 trong cùng repository cũng ghi nhận độc lập cùng hiện tượng.

Không test assertion, typecheck hoặc build command nào chạy trong các run thất bại này. Phân loại: **GitHub Actions pre-run infrastructure/configuration blocker; nguyên nhân cụ thể chưa đủ bằng chứng**.

G4 exact final-head CI: **BLOCKED**.

## Merge readiness

Đã đạt:

- G0 Scope: **PASS**.
- G1 Requirements/BRD: **PASS**.
- G2 Plan: **PASS**.
- Review score >=95: **PASS, 96/100**.
- Critical/High code finding: **0**.
- Không migration, deploy, secret hoặc tenant mutation.

Chưa đạt:

- `Inventory and Manufacturing CI` PASS trên exact final HEAD.
- `PR Validation` PASS trên exact final HEAD.
- Chuyển PR khỏi draft.
- Yêu cầu merge rõ ràng sau khi xem bằng chứng cuối.

PR không được merge khi G4 còn blocked.

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

## Điều phối

- PR mua hàng `#14` vẫn open/draft và sở hữu migration `0031` theo nội dung PR hiện tại; phải xác minh lại migration head trước Slice B/C.
- FIFO rollout tenant `alu` vẫn disabled.

## Production safety

- Không deploy Gateway/Tenant Worker từ nhánh này.
- Không migrate/mutate tenant `alu`.
- Không sửa Cloudflare secret.
- Không bật FIFO.
