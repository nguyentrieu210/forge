# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR, branch và CI; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md` và kiểm tra PR đang mở.

## DONE — Purchase Receipt Bulk Transaction / nhập nhôm nhiều mã

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: **6/6 required workflows PASS**.
- Có metadata-driven transaction grid + Excel/Sheets paste, canonical FIFO reuse, one-draft aggregate create, idempotency/duplicate guard, same-company/currency guard, tenant guard và authenticated desktop/mobile acceptance.
- Generic Bulk View vẫn master-only; không dùng generic mass-update cho transaction/ledger.

## NEXT — Bulk Transaction remaining

Mỗi item là branch/PR riêng từ exact current `main`, không gom thành một mega-PR:

1. **Stock Reconciliation Bulk Transaction** — controller-backed grid, preview/reconciliation, permission, tenant isolation, duplicate/state guards; submit chuẩn vẫn authoritative.
2. **BOM parent + child/version Bulk Transaction** — parent-aware/version-aware, không mass-update child rows độc lập và không phá version lineage.
3. **First-class AppAction input-table contract** — thay compatibility transport `BulkTransaction:<json>` trong Text options bằng typed schema/compiler/parser/selfcheck chính thức.
4. **Batch Print / QR label queue** — action/workspace dùng chung, có selection, queue state, retry/idempotency và permission.

## Other active priorities

- Re-check exact GitHub state của P1 Daily Detailed Ledger trước khi mở/tiếp tục; không dùng status cũ nếu PR đã thay đổi.
- Plastic ERP wave sau P0-A phải reconcile với core Work Order + submitted Stock Entry Manufacture, không dựng stock/costing ledger cạnh tranh.
- Warranty / defects / capacity / overtime và authenticated E2E xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty vẫn chưa closure toàn hệ thống.

## Guardrails

- Không deploy Cloudflare/production nếu user chưa yêu cầu riêng.
- Không sửa production secrets/DNS, không mutate customer data.
- Không commit `.env`, `server/work/`, `tmp/`, credential, backup hoặc generated evidence không được quản lý.
- PR stale/diverged phải clean-transplant đúng scope lên exact current `main`; không force-push/rewrite history để tái sử dụng CI stale.
