# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR, branch và CI; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md` và kiểm tra PR đang mở.

## P1 — Risk-based quality gates

- Canonical branch: `chore/risk-based-quality-gates-20260802`, base exact `main@cd1f76dbb47432e2312c6f5577eb955b48c3a856`.
- Policy canonical: `FAST` / `STANDARD` / `CRITICAL`.
- `FAST`: UI/presentation nhỏ; review diff + kiểm tra tối thiểu theo blast radius; không bắt buộc full test/lint/typecheck/build/CI.
- `STANDARD`: test liên quan + typecheck/lint/build/CI phù hợp.
- `CRITICAL`: accounting/inventory/costing/auth/tenant/migration/data phải chạy regression/integration/security/data-integrity gates đầy đủ.
- Việc còn lại: review diff docs-only, mở PR và merge policy vào `main`.

## P1 — Auto deploy UI hotfix production lane

- Canonical branch: `fix/ui-hotfix-auto-deploy-v2-20260802`, clean-transplant từ exact `main@efa2aa6df385ca0775523f1756494d2ae54ec132`.
- PR `#230` là stale iteration; không merge.
- Workflow `.github/workflows/hotfix-ui-one-click.yml` sẽ tự chạy khi push branch `hotfix/ui-*` có `client/**`; `workflow_dispatch` vẫn là fallback.
- Fail-closed guard: current `main` phải là ancestor; bắt buộc có client change; ngoài client chỉ cho `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`; tối đa 10 file/300 dòng.
- Fast production path: validate scope -> install -> build -> stage -> deploy Gateway.
- Việc tiếp theo: merge lane mới, tạo hotfix UI mới từ exact main, replay theme fix của PR #227, push và xác nhận auto-deploy production.

## DONE — Warehouse Petty Cash per warehouse

- Canonical PR `#214` đã squash-merge vào `main` tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: **6/6 required workflows PASS**.

## DONE — Purchase Receipt Bulk Transaction / nhập nhôm nhiều mã

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: **6/6 required workflows PASS**.

## NEXT — Bulk Transaction remaining

1. **Stock Reconciliation Bulk Transaction** — controller-backed grid, preview/reconciliation, permission, tenant isolation, duplicate/state guards.
2. **BOM parent + child/version Bulk Transaction** — parent-aware/version-aware, không phá version lineage.
3. **First-class AppAction input-table contract** — typed schema/compiler/parser/selfcheck chính thức.
4. **Batch Print / QR label queue** — selection, queue state, retry/idempotency và permission.

## Other active priorities

- Re-check exact GitHub state của P1 Daily Detailed Ledger trước khi tiếp tục.
- Plastic ERP wave sau P0-A phải reconcile với core Work Order + submitted Stock Entry Manufacture.
- Warranty / defects / capacity / overtime và authenticated E2E xuyên Sales -> Production -> Inventory -> Delivery -> Finance -> Daily Ledger -> Warranty vẫn chưa closure toàn hệ thống.

## Guardrails

- Auto production deploy chỉ dành cho `hotfix/ui-*` vượt scope guard.
- Không sửa production secrets/DNS, không mutate customer data.
- Không commit `.env`, `server/work/`, `tmp/`, credential, backup hoặc generated evidence không được quản lý.
- PR stale/diverged phải clean-transplant đúng scope lên exact current `main`; không force-push/rewrite history.
