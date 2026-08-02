# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR, branch và CI; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md` và kiểm tra PR đang mở.

## P1 — One-click UI hotfix production lane

- Branch active: `hotfix/ui-one-click-deploy-20260802`, base exact `main@4960de3443300245fcce3f69914826306a297266`.
- Đã thêm `.github/workflows/hotfix-ui-one-click.yml` và mở `.github/workflows/release-gateway.yml` cho `workflow_call` để không duplicate deploy implementation.
- Fast lane chỉ cho branch `hotfix/ui-*`, current main phải là ancestor, chỉ `client/**` + 3 file canonical status/handoff, tối đa 20 file/600 dòng, cấm package/dependency/backend/migration/metadata/workflow.
- Release giữ nguyên Gateway production gate: lint/test/typecheck/build/stage/dry-run/deploy/exact-SHA smoke.
- Sau production release workflow best-effort tạo/annotate PR reconcile về `main`.
- Việc còn lại: mở PR cho thay đổi workflow, lấy exact-head CI/actionlint evidence, review diff sạch, merge khi đủ gate. Không deploy production trong task tạo lane này.

## DONE — Warehouse Petty Cash per warehouse

- Canonical PR `#214` đã squash-merge vào `main` tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: **6/6 required workflows PASS**.
- Root cause CI đỏ đã sửa: `vn-accounting` thiếu `externalDocTypes` cho `Purchase Receipt` và `Stock Entry`.
- Controller Warehouse Cash: 7/7 PASS; SQL migration acceptance PASS cho balance/daily limit/max balance/tenant isolation/reversal/immutability.
- PR `#210` đã đóng superseded; không reopen/merge.
- Không deploy production trong đợt merge này.
- Follow-up kế toán ngoài scope hiện tại: nếu cần dùng quỹ kho để tất toán trực tiếp công nợ Purchase/Sales Invoice, phải thiết kế payment allocation canonical; không giả định party dimension trên GL đã settle AR/AP.

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
