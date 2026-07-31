# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-physical-stock-slice-b-20260731`.
- Draft PR: `#49` — `feat(inventory): canonical physical stock identity and warehouse roles`.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated evidence.

## Inventory Slice B

### Phạm vi đã hoàn thành

- Server-built physical identity cho inventory mode/profile, màu, tình trạng, đời, kích thước và physical count.
- Batch/serial/Aluminium Lot lineage và kiểm quantity/direction của bundle.
- Warehouse-role rules cho receipt, transfer, issue/manufacture, quarantine và scrap/offcut recovery.
- Exact cancellation dựa trên ledger gốc; không tạo stock book thứ hai.
- Company-wide Durable Object coordination cho Stock Entry và Work Order submit/cancel.
- Regression cho identity mismatch, stale lot warehouse, second transfer, quarantine/recovery và concurrent issue.

### Review

- Review file: `server/docs/ALUMDOOR-INVENTORY-SLICE-B-REVIEW.md`.
- Score: **97/100**.
- Critical: **0**.
- High: **0** sau remediation.

### Đồng bộ default

- Default mới nhất: `f0768d59ff66d04c333fd290c120f7672a80ea96`.
- Default chứa Purchase/FIFO activation readiness safeguards từ PR `#75`.
- Nhánh kho đã đồng bộ bằng merge commit `47acf088135cb770dc30d021b5a45a9fcdca3c21`.
- Code/test riêng Slice B được giữ nguyên; Purchase tooling mới từ default được giữ lại.
- Handoff/status/tasks được chỉnh lại để phản ánh đúng nhánh kho.

### Exact final head

- Commit handoff sau sync: `20360dfd79bdd97f8fd46362250ce7fc43b956c8`.
- Các commit tài liệu tiếp theo sẽ tạo final head mới và kích hoạt lại CI.
- Chỉ CI trên exact final head mới được dùng làm merge evidence.

## Purchase/FIFO trên default

- PR `#63` lifecycle correction đã merge và release tenant production.
- PR `#75` bổ sung read-only activation readiness safeguards và runbook.
- FIFO rollout vẫn **disabled**.
- Không có activation, backfill production hoặc secret/DNS change trong đợt kho này.

## Gate còn lại cho Inventory

1. Toàn bộ required workflows PASS trên exact final head.
2. PR #49 conflict-free, review threads sạch và chuyển khỏi draft.
3. Read-only live tenant catalog audit và remediation plan.
4. Staging receive/transfer/issue/quarantine/scrap/cancel journeys.
5. Production load/latency observation cho company-wide inventory lock.
6. Physical-stock UI/report/read model trong Slice D.
7. Explicit merge/deployment approval riêng.

## Production hiện hành

- Tenant Worker `cloudforge-tenant-alu`: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- Gateway `cloudforge-gateway`: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- FIFO rollout: **disabled**.
