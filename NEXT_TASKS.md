# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR và branch; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`.

## NOW — fast UI deploy acceptance

- Branch implementation: `fix/ui-deploy-fastpath-20260802`.
- Sau merge, lần sửa UI tiếp theo phải dùng UI branch và push thật để acceptance-test fast path.
- PASS chỉ khi run đi đủ: shallow checkout -> UI push guard -> cached install -> runtime + warehouse mobile build -> stage -> Wrangler deploy -> `/health` -> `/release.json` đúng SHA/hash.
- Ghi duration thực tế; mục tiêu gần local, không build toàn MetaForge monorepo.
- Không thêm PR-trigger deploy hoặc stale-main guard trở lại nếu không có bằng chứng cần thiết.

## ACTIVE — VN Accounting Period Integrity Hardening

- Canonical branch: `fix/vn-accounting-period-integrity-20260802-r6`, clean-transplant từ `main@4c816fd45a1944aa90abb448b436890bb45c114b`.
- Isolated SQLite regression PASS cho hard/soft close, cancel, submit, scope move, overlap update, tenant isolation và duplicate source.
- Còn thiếu trước merge: CRITICAL local gates trên canonical branch (`pnpm test` hoặc accounting SQL + backend relevant tests, typecheck, lint, build theo blast radius).
- PR `#259` và các accounting PR trước là stale/superseded do concurrent main updates; không force-push/rewrite history.
- Không production deploy hoặc production migration.

## DONE — exact production release evidence

- Canonical merge checkpoint: `a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.
- `/release.json` chứa `releaseSha` + `bundleHash`; smoke fail nếu production không khớp `TARGET_SHA`.

## DONE — Website/CMS multi-tenant v1

- Canonical PR `#254` đã squash-merge vào `main` tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.

## NEXT — Bulk Transaction remaining

Mỗi item phải là branch riêng từ exact current `main`:

1. **Stock Reconciliation Bulk Transaction** — controller-backed grid, preview/reconciliation, permission, tenant isolation, duplicate/state guards; submit chuẩn vẫn authoritative.
2. **BOM parent + child/version Bulk Transaction** — parent-aware/version-aware, không mass-update child rows độc lập và không phá version lineage.
3. **First-class AppAction input-table contract** — typed schema/compiler/parser/selfcheck chính thức thay compatibility transport.
4. **Batch Print / QR label queue** — selection, queue state, retry/idempotency và permission.

## Other active priorities

- Re-check exact GitHub state của P1 Daily Detailed Ledger trước khi tiếp tục.
- Plastic ERP wave sau P0-A phải reconcile với core Work Order + submitted Stock Entry Manufacture, không dựng stock/costing ledger cạnh tranh.

## Guardrails

- UI auto production deploy chỉ dành cho UI-only branch đúng naming + push scope guard.
- Không sửa production secrets/DNS, không mutate customer data ngoài release path đã được user chủ động thiết lập.
- Không commit `.env`, `server/work/`, `tmp/`, credential, backup hoặc generated evidence không được quản lý.
