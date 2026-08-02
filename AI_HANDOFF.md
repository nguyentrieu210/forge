# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release evidence.
- Đọc `RUNBOOK.md` -> `CURRENT_STATUS.md` -> `NEXT_TASKS.md` -> file này -> `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.
- Trước khi chọn validation phải phân loại task `FAST`, `STANDARD` hoặc `CRITICAL`; không mặc định chạy full pipeline cho mọi thay đổi.

## Quality tier canonical

- `FAST`: presentation/UI nhỏ, không đổi business logic/API/data/permission/tenant/schema. Review diff + kiểm tra tối thiểu theo blast radius; full test/lint/typecheck/build/CI không bắt buộc.
- `STANDARD`: CRUD/API/product behavior thông thường. Chạy test liên quan + typecheck/lint/build/CI phù hợp.
- `CRITICAL`: accounting/cash/AR-AP/inventory/costing/manufacturing/auth/permission/tenant/migration/production data. Chạy regression/integration/security/data-integrity gates đầy đủ.
- Nếu scope thực tế lớn hơn dự kiến phải nâng tier; không hạ `CRITICAL` xuống `FAST` vì cần nhanh.
- Build/install/stage chỉ để tạo artifact deploy là packaging, không tự động trở thành quality gate.

## Active checkpoint — Website/CMS v1 clean delivery

- Canonical branch: `feat/tenant-website-builder-delivery-v2-20260802`.
- Canonical PR: `#238` (draft). PR `#219` và `#220` là stale iterations, không merge.
- Clean-transplant từ exact `main@18d2161de589fcd1677886f0e9136006fd60e9e5`; không broad-merge stale branch, không force-push/rewrite history.
- Implementation canonical là app-based architecture hiện tại, không dùng mô tả legacy `server/websitesRoutes.js` từ handoff cũ:
  - `server/apps-src/website/**`: first-party app metadata, DocTypes, roles, versioned template/theme fixtures.
  - `server/packages/frappe-api/src/website.ts`: tenant-scoped public resolver, published-only content, block/URL/theme allowlists.
  - `server/packages/frappe-api/src/website-router.ts`: exact public methods `forge.website.manifest` và `forge.website.page`.
  - `server/packages/frappe-api/src/web-form-routes.ts`: chỉ mở hai Website path trên unauthenticated gate; generic CRUD không public.
  - `client/apps/runtime/src/bootstrap.ts` + `website/WebsiteSite.tsx`: shared public renderer, bảo toàn reserved Forge routes/modes.
  - `server/tests/website-cms.test.mjs` + `client/e2e-forge/ui-tests/website-public.spec.ts`: regression cho app metadata/public resolver/runtime.
- Security invariants:
  1. trusted tenant context được resolve trước public router; query Website luôn bind `tenant_id`;
  2. Guest có `roles: []`, không được cấp generic DocType read;
  3. website settings phải `enabled=1` và `published=1`; Web Page override phải published;
  4. arbitrary HTML/JS không thuộc block allowlist; URL/asset/theme token được sanitize/allowlist;
  5. preset identity là immutable `preset_id@version`, tenant pin version và không silent-upgrade.
- Quality tier: **CRITICAL** vì đụng unauthenticated routing + tenant isolation. Chỉ ready khi exact final head có đủ website regression/runtime/public E2E + required CI theo ownership.
- Production deploy, DNS/custom domain và production secrets nằm ngoài task này.

## Active checkpoint — Risk-based quality gates

- Canonical branch: `chore/risk-based-quality-gates-20260802`, base exact `main@cd1f76dbb47432e2312c6f5577eb955b48c3a856`.
- `RUNBOOK.md` và `DELIVERY_POLICY.md` là source of truth cho 3 tier.
- Task này docs/policy-only, không đổi runtime code hay production behavior.

## Active checkpoint — Auto deploy UI hotfix lane

- Canonical branch: `fix/ui-hotfix-auto-deploy-v2-20260802`, clean-transplant từ exact `main@efa2aa6df385ca0775523f1756494d2ae54ec132`.
- PR `#230` là stale iteration; không merge.
- `.github/workflows/hotfix-ui-one-click.yml` chuyển sang auto production deploy khi push branch `hotfix/ui-*` có `client/**`; manual `workflow_dispatch` vẫn là fallback.
- Invariant bắt buộc trước deploy:
  1. current `main` phải là ancestor của target SHA;
  2. diff phải có ít nhất một `client/**` file;
  3. ngoài `client/**` chỉ cho `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`;
  4. tối đa 10 file / 300 changed lines;
  5. mọi server/workflow/package/migration/metadata/secret/DNS/data change đều fail closed vì nằm ngoài allowlist;
  6. production path chỉ build MetaForge client -> stage bundle -> deploy Gateway;
  7. lint/test/typecheck vẫn do PR/normal CI chịu trách nhiệm, không làm chậm fast production path.
- Sau khi lane này có trên `main`, AI sửa UI trên branch `hotfix/ui-*` và push là production deploy tự chạy, không bắt người dùng bấm GitHub Actions.
- Theme fix PR #227 phải được replay trên branch hotfix mới từ exact main sau merge lane này để push event dùng workflow mới.

## Merged checkpoint — Warehouse Petty Cash per warehouse

- Canonical PR `#214` squash-merge tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.
- `gl_entries` là source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Purchase/Sales Invoice settlement cần canonical payment allocation.

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

- Merge code không đồng nghĩa deploy production, ngoại trừ UI fast lane đã được user yêu cầu rõ: push hợp lệ vào `hotfix/ui-*` sẽ tự deploy production sau fail-closed scope guard.
- Không dùng UI fast lane cho backend/business logic/data chỉ để tiết kiệm thời gian.
- Không đổi DNS/secrets hoặc mutate customer data nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence không được quản lý.
