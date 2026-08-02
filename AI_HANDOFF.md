# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release evidence.
- Đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này → `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.
- Trước khi chọn validation phải phân loại task `FAST`, `STANDARD` hoặc `CRITICAL`; không mặc định chạy full pipeline cho mọi thay đổi.

## Quality tier canonical

- `FAST`: presentation/UI nhỏ, không đổi business logic/API/data/permission/tenant/schema. Review diff + kiểm tra tối thiểu theo blast radius; full test/lint/typecheck/build/CI không bắt buộc.
- `STANDARD`: CRUD/API/product behavior thông thường. Chạy test liên quan + typecheck/lint/build/CI phù hợp.
- `CRITICAL`: accounting/cash/AR-AP/inventory/costing/manufacturing/auth/permission/tenant/migration/production data. Chạy regression/integration/security/data-integrity gates đầy đủ.
- Nếu scope thực tế lớn hơn dự kiến phải nâng tier; không hạ `CRITICAL` xuống `FAST` vì cần nhanh.

## Active checkpoint — One-click UI hotfix lane

- Canonical branch: `hotfix/ui-one-click-deploy-v2-20260802`, base exact `main@f5d222e916795fd31cdc82f5746a1ba0af6318fb`.
- Canonical PR: `#223`. Iteration `#222` đã superseded do stale main.
- `.github/workflows/hotfix-ui-one-click.yml` là direct production workflow riêng cho `FAST` UI hotfix.
- Luồng thực tế: `checkout -> install -> build MetaForge -> stage client bundle -> wrangler deploy Gateway production`.
- Workflow không chạy scope guard, lint, unit/integration test, typecheck, Wrangler dry-run, smoke test hoặc PR reconcile tự động.
- `install/build/stage` là packaging bắt buộc để tạo artifact chạy được, không phải quality gate.
- Không dùng lane này cho business logic/backend/schema/data/accounting/inventory/auth/permission/tenant/secrets/DNS.
- Task tạo lane/policy chưa deploy production.

## Merged checkpoint — Warehouse Petty Cash per warehouse

- Canonical PR `#214` squash-merge tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.
- `gl_entries` là source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Purchase/Sales Invoice settlement cần canonical payment allocation, không được coi GL party dimension là đã settle AR/AP.

## Checkpoint — Bulk Transaction v1 Purchase Receipt

- Canonical PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.
- Bulk action tạo một Purchase Receipt nháp, reuse canonical FIFO, có idempotency/duplicate guard, same-company/currency guard và tenant guard.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining Bulk Transaction

- Stock Reconciliation controller-backed grid.
- BOM parent + child/version grid.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.

## Release boundary

- Merge code không đồng nghĩa deploy production.
- Direct UI hotfix chỉ chạy production khi user chủ động yêu cầu chạy workflow.
- Không deploy Cloudflare/production, đổi DNS/secrets hoặc mutate customer data nếu user chưa yêu cầu rõ cho đúng đợt.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence không được quản lý.
