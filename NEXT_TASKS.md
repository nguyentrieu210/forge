# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR, branch và CI; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md` và kiểm tra PR đang mở.

## P1 — UI theme hotfix auto-deploy verification

- Guarded auto-deploy lane đã merge qua PR `#231` tại `cd1f76dbb47432e2312c6f5577eb955b48c3a856`.
- PR `#230` là stale iteration, không merge.
- Theme hotfix replay hiện ở PR `#232`, branch `hotfix/ui-document-theme-auto-20260802`.
- Việc còn lại của lane này: kiểm exact GitHub workflow/release evidence của PR `#232`; không suy ra production deploy chỉ từ branch/PR state.

## DONE — Alumdoor Warehouse Cash integration

- Canonical PR `#233` đã squash-merge vào `main` tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Final validated feature head `162bc010692d3a2997ddbc9bd5e9a59e11cb5d60`: **6/6 required workflows PASS**.
- Alumdoor dùng role-gated `Quỹ kho` và generic MetaForge routes tới 4 DocType Finance-owned, không copy controller/schema/ledger.
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
