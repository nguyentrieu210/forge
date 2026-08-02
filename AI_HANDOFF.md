# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, delivery và release evidence.
- Đọc `RUNBOOK.md` -> `CURRENT_STATUS.md` -> `NEXT_TASKS.md` -> file này -> `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.
- Phân loại task `FAST`, `STANDARD` hoặc `CRITICAL`; blast radius tăng thì phải nâng tier.

## Quality tier canonical

- PR `#234` đã merge tại `c453df3026095b314f82f79e338bd56af90632ca`.
- `FAST`: presentation/UI nhỏ, không đổi business logic/API/data/permission/tenant/schema; kiểm tra tối thiểu theo blast radius.
- `STANDARD`: CRUD/API/product behavior thông thường; chạy test và quality gates phù hợp.
- `CRITICAL`: accounting/cash/AR-AP/inventory/costing/manufacturing/auth/permission/tenant/migration/data; giữ regression/integration/security/data-integrity gates đầy đủ.
- `RUNBOOK.md` và `DELIVERY_POLICY.md` là source of truth cho tier policy.
- GitHub validation workflows đã bị xóa/consolidate tại `main@061ad31b33243e6cace6bd9f13b3f6726c5443c4`; GitHub hiện là build/deploy only. Không suy ra PASS/FAIL validation từ việc không còn CI; dùng local/provider evidence phù hợp với task tier.

## Ready-to-merge checkpoint — Website/CMS v1

- Canonical branch: `feat/tenant-website-builder-delivery-v6-20260802`.
- Canonical PR: `#251`, non-draft/ready for review. PR `#249`, `#238` và các Website delivery iteration cũ đã superseded/closed, không merge.
- Clean-transplant implementation commit `fb18af84ea66fa7758eb2398a9395941e87be86b` was created directly from exact `main@061ad31b33243e6cace6bd9f13b3f6726c5443c4`.
- Canonical implementation is app-based:
  - `server/apps-src/website/**`: first-party app metadata, Website Settings/Web Page/Web Page Block, roles and versioned preset fixtures;
  - `server/packages/frappe-api/src/website.ts`: tenant-scoped published-only resolver with block/URL/theme allowlists;
  - `server/packages/frappe-api/src/website-router.ts`: exact public methods `forge.website.manifest` and `forge.website.page`;
  - `server/packages/frappe-api/src/web-form-routes.ts`: only those Website methods are added to the unauthenticated gate; generic CRUD remains private;
  - `client/apps/runtime/src/bootstrap.ts` + `client/apps/runtime/src/website/WebsiteSite.tsx`: shared public renderer while preserving reserved Forge runtime modes;
  - `server/tests/website-cms.test.mjs` + `client/e2e-forge/ui-tests/website-public.spec.ts`: regression coverage.
- Security invariants:
  1. trusted tenant context is resolved before the public router and every Website query binds `tenant_id`;
  2. Guest uses no generic DocType read permission;
  3. Website Settings requires enabled + published and page overrides require published;
  4. arbitrary HTML/JS is not a public block type; links/assets/theme tokens are sanitized/allowlisted;
  5. presets are immutable `preset_id@version` and tenant version pins do not silently upgrade.
- Validation evidence:
  1. unchanged application blobs previously PASS server/client tests, typecheck, build, frontend lint and MetaForge browser QA;
  2. public E2E previously PASS desktop/tablet and exposed mobile navigation hidden below `md`;
  3. final `WebsiteSite.tsx` blob `82e25b446885b8719340a38013c801135e2a52c2` adds a dedicated mobile navigation row with horizontal overflow and `aria-current`;
  4. final targeted Chromium/Playwright regression PASS at mobile `390x844`, tablet `834x1112`, desktop `1440x1000`; assertions cover one visible accessible nav per viewport, active-page semantics, login href, title/meta, mobile overflow behavior;
  5. main changes after previous full validation were workflow-only, with no app/package/dependency input changes.
- Quality tier: **CRITICAL** because public unauthenticated routing + tenant isolation are involved.
- Production deploy, custom domain/DNS and production secrets are outside this task.
- Do not merge PR `#251` without a new explicit user instruction naming merge.

## Active checkpoint — release lane

- GitHub release/validation topology changed materially at `061ad31b33243e6cace6bd9f13b3f6726c5443c4`: many historical workflows were removed and `manual-release-alu.yml` was consolidated.
- Any follow-up on old PR `#232` or previous UI auto-deploy assumptions must first inspect current exact GitHub workflows; old lane assumptions are stale.

## Merged checkpoint — Alumdoor Warehouse Cash integration

- Canonical PR `#233` squash-merge tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Final validated feature head `162bc010692d3a2997ddbc9bd5e9a59e11cb5d60`: **6/6 required workflows PASS**.
- Ownership invariant: Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor chỉ consume qua integration metadata và generic MetaForge routes.
- `server/briefs/alumdoor-v2.integrations.json` khai `vn-accounting >= 1.1.0` và external ownership cho `Warehouse Cash Fund`, `Warehouse Cash Voucher`, `Warehouse Cash Transfer`, `Warehouse Cash Count`.
- `server/scripts/lib/read-brief-source.mjs` merge integration sidecar và fail closed trên unsupported key, duplicate dependency ID hoặc duplicate external DocType.
- `server/scripts/verify-alumdoor-meta-completeness.mjs` phải đọc merged canonical brief source.
- `AlumdoorOperationsCenter` có role-gated tab `Quỹ kho`; browser regression khóa warehouse-role visibility, canonical Voucher navigation và sales-role denial.
- Four-eyes approval vẫn do Warehouse Cash backend authoritative; UI không tự cấp quyền.
- Party dimension không đồng nghĩa settle AR/AP. Purchase/Sales Invoice settlement phải dùng canonical Payment Entry/payment allocation.
- PR `#233` không đổi Warehouse Cash GL/controller/migration.

## Merged checkpoint — Warehouse Petty Cash backend

- PR `#214` squash-merge tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.
- `gl_entries` là source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Correction của Cash Count phải qua adjustment voucher, không mutate balance trực tiếp.

## Checkpoint — Bulk Transaction v1 Purchase Receipt

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining Bulk Transaction

- Stock Reconciliation controller-backed grid.
- BOM parent + child/version grid.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.

## Release boundary

- Merge code không đồng nghĩa trạng thái release môi trường chạy thật; luôn kiểm GitHub release evidence theo đúng lane hiện hành.
- Không tự merge PR hoặc deploy production nếu user chưa yêu cầu rõ.
- Không dùng UI fast lane cho backend/business logic/data chỉ để tiết kiệm thời gian.
- Không đổi DNS/secrets hoặc mutate customer data nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/` hoặc credential/generated evidence không thuộc source control.
