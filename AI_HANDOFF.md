# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release evidence.
- Đọc `RUNBOOK.md` -> `CURRENT_STATUS.md` -> `NEXT_TASKS.md` -> file này -> `DELIVERY_POLICY.md`.
- Mọi SHA/branch trong tài liệu là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.

## Canonical execution model

- Development validation chạy local theo blast radius.
- GitHub Actions chỉ dùng làm máy build/deploy.
- Workflow release duy nhất: `.github/workflows/manual-release-alu.yml`, name `ALU Build and Deploy`.

## UI auto deploy convention

UI-only task phải dùng branch:

- `hotfix/ui-*`
- `fix/ui-*`
- `feat/ui-*`
- `refactor/ui-*`

Push có `client/**` tự động build MetaForge, stage bundle và deploy Gateway production, sau đó health smoke. Không cần PR hoặc bấm Actions.

Fail-closed guard:

- branch phải chứa current `main`;
- diff phải có `client/**`;
- ngoài `client/**` chỉ cho phép `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`;
- backend/API/schema/permission/tenant/accounting/inventory/business logic không được đi UI lane.

Push đúng UI lane là production authorization do user đã chủ động thiết lập automation này.

## Full ALU deploy

Manual `workflow_dispatch` + confirm `alu` chạy:

`build once -> backup/migrate alu tenant -> deploy Tenant Worker -> deploy Alumdoor App Worker -> deploy Gateway -> health smoke`.

Không tự đổi DNS/secrets hoặc thực hiện destructive operation ngoài release path chuẩn.

## Business checkpoints

- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor chỉ consume qua integration metadata và generic MetaForge routes.
- `gl_entries` là money source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Party dimension không đồng nghĩa settle AR/AP; invoice settlement phải dùng canonical Payment Entry/payment allocation.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining priorities

- Stock Reconciliation Bulk Transaction.
- BOM parent + child/version Bulk Transaction.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.
- P1 Daily Detailed Ledger exact-state review.
- Plastic ERP waves sau P0-A.
