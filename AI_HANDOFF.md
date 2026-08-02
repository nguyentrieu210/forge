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

## Release evidence convention — branch đang chờ merge

- Canonical implementation branch: `fix/release-evidence-health-sha-v2`.
- `stage-client-bundle.mjs` ghi public `/release.json` khi release SHA có trong env; payload chỉ có `ok`, `service`, `releaseSha`, `bundleHash` và không chứa secret.
- UI/full ALU smoke phải đọc production `/release.json` và fail nếu `releaseSha !== TARGET_SHA`; `/health` chỉ chứng minh service sống, không chứng minh đúng revision.
- Same-repo `pull_request` UI trigger là fallback bắt buộc cho GitHub-connector writes vì content API commits không đảm bảo emit push-triggered Actions. Job phải kiểm tra head repo cùng repository và head branch đúng `hotfix/ui-*`, `fix/ui-*`, `feat/ui-*`, `refactor/ui-*`.
- UI scope guard vẫn authoritative: current `main` phải là ancestor, diff phải có `client/**`, ngoài UI chỉ cho docs vận hành allowlist.
- Chưa coi convention này là production canonical cho tới khi branch được merge; không deploy production riêng task release-pipeline nếu chưa có yêu cầu rõ.

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

## UI auto deploy convention

UI-only task phải dùng branch:

- `hotfix/ui-*`
- `fix/ui-*`
- `feat/ui-*`
- `refactor/ui-*`

Push có `client/**` tự động build MetaForge, stage bundle và deploy Gateway production, sau đó health smoke. Khi commit được tạo qua GitHub connector/content API, same-repo PR event là fallback quan sát được để chạy cùng guarded deploy lane.

Fail-closed guard:

- branch phải chứa current `main`;
- diff phải có `client/**`;
- ngoài `client/**` chỉ cho phép `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`;
- backend/API/schema/permission/tenant/accounting/inventory/business logic không được đi UI lane.

Push/PR đúng UI lane là production authorization do user đã chủ động thiết lập automation này; fork PR không được deploy.

## Full ALU deploy

Manual `workflow_dispatch` + confirm `alu` chạy:

`build once -> backup/migrate alu tenant -> deploy Tenant Worker -> deploy Alumdoor App Worker -> deploy Gateway -> health + exact-release smoke`.

Không tự đổi DNS/secrets hoặc thực hiện destructive operation ngoài release path chuẩn.

## Business checkpoints

- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor chỉ consume qua integration metadata và generic MetaForge routes.
- `gl_entries` là money source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Party dimension không đồng nghĩa settle AR/AP; invoice settlement phải dùng canonical Payment Entry/payment allocation.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining priorities

- Merge exact production release evidence hardening sau review.
- Stock Reconciliation Bulk Transaction.
- BOM parent + child/version Bulk Transaction.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.
- P1 Daily Detailed Ledger exact-state review.
- Plastic ERP waves sau P0-A.
