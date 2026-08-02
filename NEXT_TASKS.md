# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact `main`, PR, branch và CI; trước khi làm phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md` và kiểm tra PR đang mở.

## P1 — Auto deploy UI hotfix production lane

- Working branch: `fix/ui-hotfix-auto-deploy-20260802`, base `main@7084dbb8c246a652cee58f0c7da88c3fa3eb53e9`.
- Workflow `.github/workflows/hotfix-ui-one-click.yml` sẽ tự chạy khi push branch `hotfix/ui-*` có `client/**` thay đổi; `workflow_dispatch` vẫn giữ làm fallback.
- Fail-closed guard trước deploy: current `main` phải là ancestor; chỉ `client/**` + `CURRENT_STATUS.md` + `NEXT_TASKS.md` + `AI_HANDOFF.md`; tối đa 10 file/300 dòng; bắt buộc có client change.
- Fast production path: validate scope -> install -> build -> stage -> deploy Gateway.
- Việc tiếp theo ngay sau merge: tạo hotfix UI mới từ exact `main`, replay theme fix của PR #227, push để xác nhận auto-deploy production thực sự chạy.

## DONE — Warehouse Petty Cash per warehouse

- Canonical PR `#214` đã squash-merge vào `main` tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: **6/6 required workflows PASS**.

## DONE — Purchase Receipt Bulk Transaction / nhập nhôm nhiều mã

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: **6/6 required workflows PASS**.

## NEXT — Bulk Transaction remaining

Mỗi item là branch/PR riêng từ exact current `main`, không gom thành mega-PR:

1. **Stock Reconciliation Bulk Transaction** — controller-backed grid, preview/reconciliation, permission, tenant isolation, duplicate/state guards; submit chuẩn vẫn authoritative.
2. **BOM parent + child/version Bulk Transaction** — parent-aware/version-aware, không mass-update child rows độc lập và không phá version lineage.
3. **First-class AppAction input-table contract** — thay compatibility transport `BulkTransaction:<json>` bằng typed schema/compiler/parser/selfcheck chính thức.
4. **Batch Print / QR label queue** — action/workspace dùng chung, có selection, queue state, retry/idempotency và permission.

## Other active priorities

- Re-check exact GitHub state của P1 Daily Detailed Ledger trước khi mở/tiếp tục.
- Plastic ERP wave sau P0-A phải reconcile với core Work Order + submitted Stock Entry Manufacture.
- Warranty / defects / capacity / overtime và authenticated E2E xuyên Sales -> Production -> Inventory -> Delivery -> Finance -> Daily Ledger -> Warranty vẫn chưa closure toàn hệ thống.

## Guardrails

- Auto production deploy chỉ dành cho branch `hotfix/ui-*` vượt scope guard.
- Không sửa production secrets/DNS, không mutate customer data.
- Không commit `.env`, `server/work/`, `tmp/`, credential, backup hoặc generated evidence không được quản lý.
