# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR và branch; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`.

## DONE — Website/CMS multi-tenant v1

- Canonical PR `#254` đã squash-merge vào `main` tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- Public Website/CMS v1 đã có first-party app metadata, Website Settings/Web Page/Web Page Block, versioned presets, tenant-scoped published-only public API và shared runtime renderer.
- Final responsive regression PASS trên mobile/tablet/desktop; public allowlist và tenant isolation evidence đã đủ cho scope v1.
- Không có production deploy/DNS/custom-domain/secrets trong task này.

## ACTIVE — VN Accounting Period Integrity Hardening

- Canonical branch: `fix/vn-accounting-period-integrity-20260802-r4`, clean-transplant từ exact `main` snapshot `47915764d705ba34299f2d7386b0b8d3fb83a9da`.
- Code scope chỉ gồm migration `0039_vn_accounting_period_hardening.sql`, regression script kế toán và 3 file handoff/status.
- SQLite migration/trigger regression: PASS, gồm hard/soft close, cancel, scope transition, overlap, tenant isolation và duplicate source.
- Còn thiếu trước khi merge: chạy CRITICAL local gates trên canonical branch (`pnpm test` hoặc tối thiểu accounting SQL regression + backend relevant tests, typecheck, lint, build theo blast radius), rồi cập nhật trạng thái PASS/FAIL.
- Old Draft PR `#224` và branch accounting stale trước đó phải được coi là superseded; không force-push/rewrite history.
- Không deploy production hoặc chạy production migration trong task này.

## DONE — UI auto deploy

- GitHub Actions chỉ dùng cho build/deploy.
- UI-only branch `hotfix/ui-*`, `fix/ui-*`, `feat/ui-*`, `refactor/ui-*` tự build/deploy Gateway khi push có `client/**`.
- Không cần PR hoặc bấm Actions cho UI-only lane.
- Scope guard chặn branch stale và file ngoài UI/docs vận hành.
- Full ALU deploy vẫn chạy thủ công qua `ALU Build and Deploy` với confirm `alu`.

## NEXT — Bulk Transaction remaining

Mỗi item phải là branch riêng từ exact current `main`:

1. **Stock Reconciliation Bulk Transaction** — controller-backed grid, preview/reconciliation, permission, tenant isolation, duplicate/state guards; submit chuẩn vẫn authoritative.
2. **BOM parent + child/version Bulk Transaction** — parent-aware/version-aware, không mass-update child rows độc lập và không phá version lineage.
3. **First-class AppAction input-table contract** — typed schema/compiler/parser/selfcheck chính thức thay compatibility transport.
4. **Batch Print / QR label queue** — selection, queue state, retry/idempotency và permission.

## Other active priorities

- Re-check exact GitHub state của P1 Daily Detailed Ledger trước khi tiếp tục.
- Plastic ERP wave sau P0-A phải reconcile với core Work Order + submitted Stock Entry Manufacture, không dựng stock/costing ledger cạnh tranh.
- Warranty / defects / capacity / overtime và authenticated E2E xuyên Sales -> Production -> Inventory -> Delivery -> Finance -> Daily Ledger -> Warranty vẫn chưa closure toàn hệ thống.

## Guardrails

- UI auto production deploy chỉ dành cho UI-only branch đúng naming + scope guard.
- Không sửa production secrets/DNS, không mutate customer data ngoài release path đã được user chủ động thiết lập.
- Không commit `.env`, `server/work/`, `tmp/`, credential, backup hoặc generated evidence không được quản lý.
- PR stale/diverged phải clean-transplant đúng scope lên exact current `main`; không force-push/rewrite history.
