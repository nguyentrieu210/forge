# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release evidence.
- Đọc `RUNBOOK.md` -> `CURRENT_STATUS.md` -> `NEXT_TASKS.md` -> file này -> `DELIVERY_POLICY.md`.

## Canonical execution model

- Validation phát triển chạy local theo blast radius.
- GitHub Actions chỉ dùng làm máy build/deploy.
- Workflow release duy nhất: `.github/workflows/manual-release-alu.yml`, name `ALU Build and Deploy`.

## Merged checkpoint — HRM operational 1.5

- Canonical PR `#261` squash-merge tại `b3dc2cf59ec5c85a977833da6edc986ac1bfe6fb`; stale iteration `#253` đã đóng superseded.
- HRM operational scope: recruitment, hire-to-retire, leave allocation/application, holiday/shift/check-in/attendance/correction/overtime, salary structure/assignment/period/additional salary, employee advance/travel, goals/appraisal/training.
- Accounting ownership invariant: HRM chỉ tạo authoritative payroll inputs; Salary Slip/Payroll Entry/GL canonical vẫn là source of truth. Không tạo HR payroll ledger riêng.
- Effective employee state cho branch/department/cost center/reporting phải resolve theo business date từ submitted transfer/promotion/separation, không rewrite lịch sử Employee.
- Generated Salary Slip có `salary_structure_assignment` luôn recompute source trên save/submit; stale draft earnings không được authoritative. `input_hash` + `rule_trace_json` là evidence của input/source versions.
- Submitted Salary Slip khóa các source Attendance/Leave/OT/Salary Structure Assignment/Additional Salary liên quan. Correction phải cancel/amend/rerun; không mutate nguồn đã dùng phía sau payroll.
- `VN Payroll Rule` phải đúng effective period, có matching `rule_code`, legal document, source URL, approval metadata và JSON-object formula. Salary trace lưu SHA-256 công thức. Rule đã được submitted structure/assignment hoặc submitted/cancelled salary slip sử dụng là append-only; DB guard chặn update/delete/disable/đổi record type.
- Migrations `0039-0041` là tenant-scoped/race-safe authority cho overlap, duplicates, source freeze và payroll-rule integrity; UI/controller validation không thay DB guard.
- Validation checkpoint: isolated TypeScript strict PASS; HRM operational 4/4 PASS; migrations `0035+0039+0040+0041` acceptance PASS; Python syntax PASS; metadata JSON 44/44 PASS. GitHub development CI không áp dụng theo policy hiện tại.
- `VN Payroll Rule.formula_json` hiện chỉ là versioned/audited legal evidence, chưa là statutory PIT/BHXH evaluator. Không tự hardcode/diễn giải luật trong controller; statutory automation phải là CRITICAL follow-up có schema, fixed-point semantics, official legal source và regression theo effective version.
- HRM merge không đồng nghĩa production deploy; task này chưa migrate/deploy production.

## Production release evidence

- Canonical checkpoint: `a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.
- `stage-client-bundle.mjs` ghi public `/release.json` với `releaseSha` + `bundleHash` khi có release SHA.
- `/health` chỉ chứng minh service sống; deploy chỉ DONE khi `/release.json.releaseSha === TARGET_SHA` và có `bundleHash`.

## UI auto deploy fast-path invariant

UI-only task dùng branch:

- `hotfix/ui-*`
- `fix/ui-*`
- `feat/ui-*`
- `refactor/ui-*`

Canonical behavior sau fast-path merge:

- Trigger duy nhất là `push` có `client/**`; không deploy trên `pull_request`.
- Checkout shallow (`fetch-depth: 2`); không fetch toàn repo history/current main.
- Scope guard đọc file của chính push event. Ngoài `client/**`, chỉ allowlist docs vận hành.
- Không còn current-main ancestor/stale-branch guard trong deploy workflow vì guard đó làm UI push fail khi main tiến lên sau khi branch được mở.
- Build chỉ `runtime` dependency graph + warehouse mobile bundle cần cho Gateway; không chạy `pnpm --filter metaforge run build` toàn monorepo.
- Push mới cùng branch cancel run cũ để tránh queue và deploy artifact cũ.
- Pipeline: `checkout -> push guard -> cached install -> runtime/mobile build -> stage -> wrangler deploy -> health + exact release smoke`.
- Push đúng UI lane là production authorization do user đã chủ động thiết lập.

Nếu push có backend/API/schema/migration/permission/tenant/accounting/inventory/business logic thì fail closed và chuyển khỏi UI lane.

## Full ALU deploy

Manual `workflow_dispatch` + confirm `alu`:

`build -> backup/migrate alu -> deploy Tenant Worker -> deploy Alumdoor App Worker -> deploy Gateway -> exact-release smoke`.

Không tự đổi DNS/secrets hoặc destructive operation ngoài release path chuẩn.

## Merged checkpoint — Website/CMS v1

- Canonical PR `#254` squash-merge tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- Public API exact allowlist `forge.website.manifest` + `forge.website.page`; trusted tenant context; published-only; Guest không có generic DocType read.

## Business checkpoints

- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor consume qua integration metadata và generic routes.
- `gl_entries` là money source of truth; projections chỉ rebuildable.
- Party dimension không đồng nghĩa settle AR/AP; invoice settlement dùng canonical Payment Entry/payment allocation.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining priorities

- Acceptance run thật của UI fast path sau merge, ghi duration và Cloudflare release evidence.
- HRM statutory payroll-rule evaluator nếu nghiệp vụ cần tự động PIT/BHXH theo luật.
- Stock Reconciliation Bulk Transaction.
- BOM parent + child/version Bulk Transaction.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.
- P1 Daily Detailed Ledger exact-state review.
- Plastic ERP waves sau P0-A.
