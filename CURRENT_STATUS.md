# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/purchase-fifo-activation-readiness-20260731`.
- Draft PR: `#75` — `feat(purchase): add FIFO activation readiness safeguards`.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated evidence.

## Purchase/FIFO

### Đã hoàn tất trước nhánh này

- Purchase/FIFO lifecycle correction đã merge qua PR `#63`.
- Merge SHA: `ac0c2241b2dc16abfd16b4b3e70943d8bbff8476`.
- Tenant production release đã thành công với Worker version `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- FIFO rollout vẫn **disabled**. Release code/migration không phải approval activation.

### PR #75 — activation readiness safeguards

Exact head đã xác nhận trước commit tài liệu này: `d586456e6e8b13f6097e19e7832c0032dd942745`.

Thay đổi:

- `server/scripts/prepare-purchase-fifo-activation.mjs`
  - chỉ chạy dry-run;
  - chặn cờ write/activate;
  - bắt buộc evidence nằm ngoài repository;
  - kiểm checksum SHA-256 và unresolved rows;
  - sinh readiness summary.
- `server/tests/purchase-fifo-activation-readiness.test.mjs`
  - regression cho write guards và evidence path guards.
- `server/docs/ALUMDOOR-PURCHASE-FIFO-ACTIVATION-RUNBOOK.md`
  - quy trình dry-run, review, staging backfill, authenticated smoke, production preparation và activation approval.

CI trên exact head `d586456e6e8b13f6097e19e7832c0032dd942745`:

- CI `30644592982`: **PASS**.
- PR Validation `30644592947`: **PASS**.
- Sales Feature CI `30644590752`: **PASS**.
- Inventory and Manufacturing CI `30644590579`: **PASS**.
- Purchase Feature CI `30644590592`: **PASS**.
- UI Pull Request Validation `30644593053`: browser QA/auth smoke vẫn đang chạy tại thời điểm cập nhật này.

Không deploy Cloudflare, không backfill tenant thật, không sửa production secrets/DNS và không bật FIFO.

## Gate còn lại trước activation

1. UI Pull Request Validation của PR `#75` phải PASS trên exact final head.
2. Chạy readiness dry-run trên staging hoặc production-shaped copy.
3. Bắt buộc `unresolved_count=0` và checksum được review.
4. Execute backfill chỉ trên staging trước; rollout phải vẫn `enabled=0`.
5. Chạy authenticated smoke: PO → Receipt → cancel → settlement/reverse → manual override → supplier debt report.
6. Thu contention/latency evidence.
7. Tạo fresh production backup và ghi explicit activation approval riêng.

## Production hiện hành

- Tenant Worker `cloudforge-tenant-alu`: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- Gateway `cloudforge-gateway`: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- FIFO rollout: **disabled**.
