# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release evidence.
- Đọc `RUNBOOK.md` -> `CURRENT_STATUS.md` -> `NEXT_TASKS.md` -> file này -> `DELIVERY_POLICY.md`.
- Mọi SHA/branch trong tài liệu là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.

## Canonical execution model

- Development validation chạy local theo blast radius.
- GitHub Actions chỉ dùng làm máy build/deploy.
- Workflow release duy nhất: `.github/workflows/manual-release-alu.yml`, name `ALU Build and Deploy`.

## Merged checkpoint — Website/CMS multi-tenant v1

- Canonical PR `#254` squash-merge tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- App-based ownership:
  - `server/apps-src/website/**`: Website Settings/Web Page/Web Page Block, roles, version-pinned template/theme presets;
  - `server/packages/frappe-api/src/website.ts`: tenant-scoped published-only resolver;
  - `server/packages/frappe-api/src/website-router.ts`: exact public methods `forge.website.manifest` + `forge.website.page`;
  - `client/apps/runtime/src/bootstrap.ts` + `client/apps/runtime/src/website/WebsiteSite.tsx`: shared public renderer;
  - `server/tests/website-cms.test.mjs` + `client/e2e-forge/ui-tests/website-public.spec.ts`: regression coverage.
- Security invariants: trusted tenant context precedes public routing; Guest không có generic DocType read; Website Settings/page phải enabled/published; block/URL/theme fields allowlisted; arbitrary public HTML/JS không hỗ trợ.
- Responsive invariant: navigation phải usable trên mobile. Final WebsiteSite blob `82e25b446885b8719340a38013c801135e2a52c2` targeted Chromium regression PASS mobile/tablet/desktop, có `aria-current` và horizontal overflow trên mobile.
- Không deploy production/DNS/custom domain/secrets trong merge Website/CMS v1.

## Active checkpoint — VN Accounting Period Integrity Hardening

- Canonical branch: `fix/vn-accounting-period-integrity-20260802-r4`, clean-transplant từ exact `main` snapshot `47915764d705ba34299f2d7386b0b8d3fb83a9da`.
- Migration sequence trên snapshot canonical dừng ở `0038_warehouse_cash.sql`; `0039_vn_accounting_period_hardening.sql` là next slot, không rewrite migration lịch sử.
- Database invariants của `0039`:
  - period range bắt buộc hợp lệ;
  - overlap bị chặn theo `tenant_id + company + branch scope`, company-wide conflict mọi branch; explicit branch khác nhau được overlap;
  - Hard Locked chặn new submit, draft->submit, cancel và payload move vào/ra locked scope;
  - Soft Closed chỉ cho approved adjustment khi period `allow_approved_adjustments=1` và chứng từ có `approved_adjustment`, `adjustment_reason`, `adjustment_approved_by`;
  - guard mở rộng tới các DocType có thể mutate GL/valuation: Journal/Invoices/Payment, Purchase Receipt, Delivery Note, Payroll, Stock, Warehouse Cash.
- Regression script cover duplicate employee/attendance/payroll source, hard/soft close, cancel, scope transitions, tenant isolation, invalid/overlap period và period update overlap.
- Isolated SQLite replay của exact trigger logic PASS; edge cases move-out, move-in và period scope update overlap PASS.
- CRITICAL local repo gates chưa chạy trong connector runtime vì không có repository checkout/dependencies; GitHub Actions hiện không phải development CI. Không gọi task DONE hoặc merge cho đến khi gate local theo `DELIVERY_POLICY.md` được chạy.
- Old Draft PR `#224` và các accounting branch transplant trước là stale/superseded. Không force-push/rewrite history.
- Không production deploy, không production migration, không mutate tenant data trong task này.

## UI auto deploy convention

UI-only task phải dùng branch:

- `hotfix/ui-*`
- `fix/ui-*`
- `feat/ui-*`
- `refactor/ui-*`

Push có `client/**` tự động build MetaForge, stage bundle và deploy Gateway production, sau đó health smoke. Không cần PR hoặc bấm Actions.

Fail-closed guard:

- branch phải chứa current `main`;
- diff phải có `client/**`;
- ngoài `client/**` chỉ cho phép `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`;
- backend/API/schema/permission/tenant/accounting/inventory/business logic không được đi UI lane.

Push đúng UI lane là production authorization do user đã chủ động thiết lập automation này.

## Full ALU deploy

Manual `workflow_dispatch` + confirm `alu` chạy:

`build once -> backup/migrate alu tenant -> deploy Tenant Worker -> deploy Alumdoor App Worker -> deploy Gateway -> health smoke`.

Không tự đổi DNS/secrets hoặc thực hiện destructive operation ngoài release path chuẩn.

## Business checkpoints

- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor chỉ consume qua integration metadata và generic MetaForge routes.
- `gl_entries` là money source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Party dimension không đồng nghĩa settle AR/AP; invoice settlement phải dùng canonical Payment Entry/payment allocation.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining priorities

- Hoàn tất CRITICAL local gates cho VN Accounting Period Integrity Hardening.
- Stock Reconciliation Bulk Transaction.
- BOM parent + child/version Bulk Transaction.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.
- P1 Daily Detailed Ledger exact-state review.
- Plastic ERP waves sau P0-A.
