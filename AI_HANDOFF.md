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

## Active checkpoint — VN Accounting Period Integrity Hardening

- Canonical branch: `fix/vn-accounting-period-integrity-20260802-r6`, clean-transplant từ exact `main@4c816fd45a1944aa90abb448b436890bb45c114b`.
- `0039_vn_accounting_period_hardening.sql` là migration kế tiếp sau `0038_warehouse_cash.sql`, không rewrite migration đã áp dụng.
- Invariants: valid/non-overlap period theo tenant/company/branch; Hard Locked chặn submit/cancel/scope move; Soft Closed chỉ cho approved adjustment khi period cho phép và có reason + approver; guard bao phủ Journal/Invoice/Payment, Purchase Receipt, Delivery Note, Payroll, Stock, Warehouse Cash.
- Regression cover duplicate employee/attendance/payroll source, hard/soft close, cancel, draft->submit, scope transitions, tenant isolation, invalid/overlap period và period update overlap.
- Isolated SQLite replay PASS, gồm edge cases move-out, move-in và period scope update-overlap.
- CRITICAL full repo gates chưa chạy vì connector runtime không có checkout/dependencies và GitHub Actions không phải development CI. Không gọi DONE/ready/merge cho tới khi local gates theo `DELIVERY_POLICY.md` chạy.
- PR `#259` và các accounting PR trước stale/superseded do concurrent main changes trên status/handoff files; không force-push/rewrite history.
- Không production deploy, production migration hoặc mutate tenant data.

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
- Hoàn tất CRITICAL local gates cho VN Accounting Period Integrity Hardening.
- Stock Reconciliation Bulk Transaction.
- BOM parent + child/version Bulk Transaction.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.
- P1 Daily Detailed Ledger exact-state review.
- Plastic ERP waves sau P0-A.
