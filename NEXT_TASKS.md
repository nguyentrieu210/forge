# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR và branch; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`.

## NOW — exact production release evidence

- Branch: `fix/release-evidence-health-sha-v2`.
- Cần review/merge thay đổi release pipeline trước khi dùng làm production proof canonical.
- Sau merge, mọi UI/full ALU deploy phải stage `/release.json` chứa exact `releaseSha` + `bundleHash`; smoke phải fail nếu production marker không khớp `TARGET_SHA`.
- Same-repo UI PR trigger phải được giữ vì GitHub-connector content writes không đảm bảo phát push-triggered Actions; vẫn fail-closed theo branch naming, current-main ancestry và UI-only scope.
- Không production deploy task release-pipeline này nếu chưa có yêu cầu release rõ.

## ACTIVE — VN Accounting Period Integrity Hardening

- Canonical branch: `fix/vn-accounting-period-integrity-20260802-r5`, clean-transplant từ `main@a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.
- Scope: migration `0039_vn_accounting_period_hardening.sql`, accounting SQL regression và 3 file status/handoff; giữ nguyên release-evidence checkpoint mới trên main.
- Isolated SQLite migration/trigger regression PASS cho hard/soft close, cancel, submit, scope move, overlap update, tenant isolation và duplicate source.
- Còn thiếu trước merge: CRITICAL local gates trên canonical branch (`pnpm test` hoặc accounting SQL + backend relevant tests, typecheck, lint, build theo blast radius).
- PR `#257` là stale/superseded do main thay đổi cùng các file status/handoff; không force-push/rewrite history.
- Không deploy production hoặc chạy production migration.

## DONE — Website/CMS multi-tenant v1

- Canonical PR `#254` đã squash-merge vào `main` tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- Public Website/CMS v1 đã có first-party app metadata, Website Settings/Web Page/Web Page Block, versioned presets, tenant-scoped published-only public API và shared runtime renderer.
- Final responsive regression PASS trên mobile/tablet/desktop; public allowlist và tenant isolation evidence đã đủ cho scope v1.
- Không có production deploy/DNS/custom-domain/secrets trong task này.

## DONE — UI auto deploy

- GitHub Actions chỉ dùng cho build/deploy.
- UI-only branch `hotfix/ui-*`, `fix/ui-*`, `feat/ui-*`, `refactor/ui-*` tự build/deploy Gateway khi push có `client/**`.
- Không cần PR hoặc bấm Actions cho UI-only lane khi push event thực sự được GitHub phát; same-repo PR fallback là đường quan sát được cho connector writes.
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
