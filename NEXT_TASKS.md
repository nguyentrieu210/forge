# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR, branch và CI; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md` và kiểm tra PR đang mở.

## P1 — Global numeric display max 2 decimals

- Canonical branch: `hotfix/ui-global-decimal-2dp-20260802`, từ exact `main@cd1f76dbb47432e2312c6f5577eb955b48c3a856`.
- Canonical formatter cap số/tiền hiển thị tối đa 2 chữ số lẻ; default Float/Currency/Percent/Rating controls cũng dùng presentation precision tối đa 2.
- Không đổi dữ liệu lưu, schema hay calculation precision.
- Guarded UI auto-deploy được kích bởi push branch này.
- Việc còn lại: lấy exact-head CI/build/deploy evidence, merge reconcile PR nếu pass, xác nhận production không còn `,000000` ở numeric controls canonical.

## DONE — Guarded auto deploy UI hotfix production lane

- PR `#231` merged vào `main` tại `cd1f76dbb47432e2312c6f5577eb955b48c3a856`.
- Workflow tự chạy khi push `hotfix/ui-*` có `client/**`; fail-closed guard giữ giới hạn client-only + 3 file docs, tối đa 10 file/300 dòng.

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
- Decimal display cap không được biến thành backend rounding hoặc destructive data rewrite.
- Không sửa production secrets/DNS, không mutate customer data.
- Không commit `.env`, `server/work/`, `tmp/`, credential, backup hoặc generated evidence không được quản lý.
- PR stale/diverged phải clean-transplant đúng scope lên exact current `main`; không force-push/rewrite history.
