# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR, branch và CI; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md` và kiểm tra PR đang mở.

## P1 — Website/CMS v1 clean delivery

- Canonical working branch: `feat/tenant-website-builder-delivery-v4-20260802`.
- Canonical PR: `#249` (draft); PR `#238` và các Website delivery iteration cũ đã superseded/closed.
- Clean-transplant implementation commit: `dce0f99de732ca38bf53940387c2034607626d71`, based on exact `main@9f81b0ba060991133d7bd5510e2cbfa5b3277234`.
- Quality tier: **CRITICAL** due public unauthenticated routing + tenant isolation.
- Đã xác nhận: PR mergeable, branch ahead 4 / behind 0 tại lần kiểm tra gần nhất; automatic `CI / Fast PR gate` PASS trên head `e09c2f199a882919b01300f58f16e50adb7268ba`; UI hotfix workflow SKIPPED đúng scope.
- Việc còn lại:
  1. chạy targeted `website-public.spec.ts` desktop/tablet/mobile để xác nhận mobile navigation fix; không khôi phục workflow UI dài đã bị xóa;
  2. local runner hiện không resolve GitHub để clone và connector không expose workflow-dispatch, nên browser regression đang PENDING chứ không được coi là PASS;
  3. reuse server/security/typecheck/build evidence đã PASS nếu code/input liên quan không đổi; chỉ chạy thêm gate bị ảnh hưởng;
  4. chỉ mark PR ready khi public allowlist, tenant isolation, published-only behavior và browser regression đều có evidence;
  5. không merge `main`, deploy production, đổi DNS/custom domain/secrets nếu user chưa yêu cầu rõ.

## P1 — UI theme hotfix auto-deploy verification

- Guarded auto-deploy lane đã merge qua PR `#231` tại `cd1f76dbb47432e2312c6f5577eb955b48c3a856`.
- PR `#230` là stale iteration, không merge.
- Theme hotfix replay hiện ở PR `#232`, branch `hotfix/ui-document-theme-auto-20260802`.
- Việc còn lại: kiểm exact workflow/release evidence của #232; không suy ra production deploy chỉ từ branch/PR state.

## DONE — Risk-based quality gates

- Canonical PR `#234` đã merge tại `c453df3026095b314f82f79e338bd56af90632ca`.
- `RUNBOOK.md` và `DELIVERY_POLICY.md` là source of truth cho `FAST` / `STANDARD` / `CRITICAL`.
- Task phải nâng tier nếu blast radius thực tế tăng; không hạ accounting/inventory/auth/tenant/migration/data xuống FAST chỉ vì cần nhanh.

## DONE — Alumdoor Warehouse Cash integration

- Canonical PR `#233` đã squash-merge vào `main` tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Final validated feature head `162bc010692d3a2997ddbc9bd5e9a59e11cb5d60`: **6/6 required workflows PASS**.
- Alumdoor dùng role-gated `Quỹ kho` + generic MetaForge routes tới 4 DocType Finance-owned; không copy controller/schema/ledger.
- `alumdoor-v2.integrations.json` khai dependency `vn-accounting >= 1.1.0` và external ownership cho `Warehouse Cash Fund`, `Warehouse Cash Voucher`, `Warehouse Cash Transfer`, `Warehouse Cash Count`.
- Canonical brief reader fail closed trên sidecar key/dependency/externalDocType trùng hoặc không hợp lệ.
- Browser QA khóa role visibility + Voucher navigation.
- Không deploy production trong task Warehouse Cash này.

## DONE — Warehouse Petty Cash per warehouse

- Canonical PR `#214` đã squash-merge vào `main` tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: **6/6 required workflows PASS**.
- `gl_entries` là money source of truth; projections chỉ rebuildable.
- Follow-up kế toán chỉ khi nghiệp vụ yêu cầu: muốn quỹ kho settle trực tiếp Purchase/Sales Invoice thì phải thiết kế canonical Payment Entry/payment allocation; không coi GL party dimension là đã settle AR/AP.

## DONE — Purchase Receipt Bulk Transaction / nhập nhôm nhiều mã

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: **6/6 required workflows PASS**.

## NEXT — Bulk Transaction remaining

Mỗi item phải là branch/PR riêng từ exact current `main`:

1. **Stock Reconciliation Bulk Transaction** — controller-backed grid, preview/reconciliation, permission, tenant isolation, duplicate/state guards; submit chuẩn vẫn authoritative.
2. **BOM parent + child/version Bulk Transaction** — parent-aware/version-aware, không mass-update child rows độc lập và không phá version lineage.
3. **First-class AppAction input-table contract** — typed schema/compiler/parser/selfcheck chính thức thay compatibility transport.
4. **Batch Print / QR label queue** — selection, queue state, retry/idempotency và permission.

## Other active priorities

- Re-check exact GitHub state của P1 Daily Detailed Ledger trước khi tiếp tục.
- Plastic ERP wave sau P0-A phải reconcile với core Work Order + submitted Stock Entry Manufacture, không dựng stock/costing ledger cạnh tranh.
- Warranty / defects / capacity / overtime và authenticated E2E xuyên Sales -> Production -> Inventory -> Delivery -> Finance -> Daily Ledger -> Warranty vẫn chưa closure toàn hệ thống.

## Guardrails

- Auto production deploy chỉ dành cho `hotfix/ui-*` vượt scope guard.
- Không sửa production secrets/DNS, không mutate customer data nếu user chưa yêu cầu đúng đợt.
- Không commit `.env`, `server/work/`, `tmp/`, credential, backup hoặc generated evidence không được quản lý.
- PR stale/diverged phải clean-transplant đúng scope lên exact current `main`; không force-push/rewrite history.
