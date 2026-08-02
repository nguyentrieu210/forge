# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR và branch; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`.

## NOW — VN Accounting Period Integrity Hardening r7

- Canonical branch: `fix/vn-accounting-period-integrity-20260803-r7`, clean-based on exact `main@6deccaeb72a4814b3e0d0264464fcaa87cfad747`.
- `main` đã có HRM migrations `0039-0041`; accounting hardening phải dùng `0042_vn_accounting_period_hardening.sql`, tuyệt đối không transplant lại migration `0039` từ r6.
- Regression script đã ghép accounting hardening vào acceptance hiện tại của `0035+0039+0040+0041` thay vì thay thế HRM coverage.
- Còn thiếu trước PR/merge: chạy CRITICAL local gates trên checkout thật, tối thiểu migration acceptance script, Python syntax, relevant backend/accounting tests, typecheck/lint/build theo blast radius.
- Nếu có failure phải fix trên r7, giữ tenant isolation, Hard/Soft close semantics, cancel + scope transition guard và migration backward compatibility.
- Không production deploy hoặc production migration.

## NOW — fast UI deploy acceptance

- Branch implementation: `fix/ui-deploy-fastpath-20260802`.
- Sau merge, lần sửa UI tiếp theo phải dùng UI branch và push thật để acceptance-test fast path.
- PASS chỉ khi run đi đủ: shallow checkout -> UI push guard -> cached install -> runtime + warehouse mobile build -> stage -> Wrangler deploy -> `/health` -> `/release.json` đúng SHA/hash.
- Ghi duration thực tế; mục tiêu gần local, không build toàn MetaForge monorepo.
- Không thêm PR-trigger deploy hoặc stale-main guard trở lại nếu không có bằng chứng cần thiết.

## P1 — HRM statutory payroll rule evaluator

- HRM operational 1.5 đã merge qua PR `#261` tại `b3dc2cf59ec5c85a977833da6edc986ac1bfe6fb`; payroll operational, source freeze và legal-rule trace đã có.
- `VN Payroll Rule.formula_json` hiện là versioned/audited evidence và tham gia `input_hash`; chưa execute PIT/BHXH hoặc công thức pháp lý Việt Nam.
- Nếu nghiệp vụ yêu cầu statutory automation: thiết kế formula schema explicit, fixed-point/rounding semantics, effective-date/version selection, official legal source, approval lifecycle và regression cho từng tình huống pháp lý.
- Không hardcode luật trong fixture/controller; rule đã dùng phải tiếp tục append-only.

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
