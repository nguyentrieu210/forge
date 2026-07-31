# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

Tracking issue: `#13`.
Draft PR: `#14`.
Working branch: `feat/purchase-receipt-complete-20260731`.
Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.

## Đã hoàn thành

### P0 — FIFO lifecycle

- [x] Cross-voucher source voucher/revision cho allocation và unapplied movements.
- [x] Append-only migration `0030_purchase_unapplied_weight_attribution.sql`.
- [x] D1/in-memory storage và reader cho remaining qty/barem/actual weight.
- [x] Receipt submit ghi unapplied weight.
- [x] PO submit tự áp Receipt chờ theo FIFO, hỗ trợ partial/multiple sources và compatibility projection.
- [x] Settlement close/reverse và manual FIFO override backend với permission/reason/audit.
- [x] Backdated warning nhưng commit-order allocation.
- [x] Backfill planner/CLI, unresolved report, checksum và activation guards.

### P1 — Operator UI phần đã xong

- [x] Server-authoritative FIFO preview trước submit Purchase Receipt.
- [x] PO/Receipt allocation timeline và drill-down từ append-only ledger.
- [x] Hiển thị nominal remaining, received/allocated/unapplied, barem/actual weight, window status, tolerance, bounds và variance.
- [x] Loading/error/empty states và responsive overflow cho timeline dialog.

## P0 kế tiếp — Settlement và override UI

1. Thêm action visibility theo server capabilities/permissions cho:
   - close settlement window;
   - reverse settlement;
   - manual FIFO override.
2. Dialog bắt buộc confirmation và reason, không cho gửi reason rỗng.
3. Hiển thị window/queue/material/supplier scope trước khi xác nhận.
4. Refetch document, timeline và report sau mutation thành công.
5. Fail closed khi server từ chối permission, stale revision hoặc lifecycle guard.
6. Tests cho hidden/disabled actions, required reason, success/error/refetch states và mobile layout.

## P1 kế tiếp — Supplier debt report

1. Tạo read model từ allocation ledger, không dùng procurement compatibility table làm nguồn sự thật.
2. Cột tối thiểu:
   - supplier/company/material;
   - ordered quantity;
   - received/allocated quantity;
   - nominal remaining debt;
   - unapplied receipt quantity;
   - active window và tolerance;
   - oldest open PO age;
   - barem/actual weight khi có.
3. Server permission checks và tenant isolation.
4. Filters supplier/company/item/window/status/date.
5. Loading/error/empty states, desktop/mobile và export-compatible result shape.
6. Unit projection + D1 query/integration tests.

## P0 — Verification còn thiếu

1. Worker/Durable Object concurrency tests:
   - concurrent Receipt submit cùng supplier queue;
   - concurrent PO auto-apply từ cùng unapplied source;
   - revision conflict retry và idempotent receipt.
2. Production-shaped Receipt cancel lifecycle:
   - allocated + unapplied source;
   - cross-voucher apply rồi cancel;
   - settled/reversed window guards;
   - weight conservation và compatibility projection.
3. Exact-head standard CI green trên HEAD cuối của PR #14.
4. Cloudflare Browser Preview QA, không dùng production observation thay QA:
   - desktop `1440x1000`;
   - mobile `390x844`;
   - preview submit;
   - PO/Receipt timeline;
   - settlement/override dialogs;
   - supplier debt report.
5. Staging:
   - migrations;
   - backfill dry-run;
   - `unresolved_count=0` và checksum match;
   - smoke PO → Receipt → cancel → settlement → report.
6. Review theo rubric 100 điểm; sửa mọi Critical/High và đạt ít nhất 95/100.

## Production boundary

Chỉ deploy production sau explicit approval riêng, exact SHA CI xanh, staging evidence, backup và rollback plan.

Khi chỉ deploy code/schema:

- giữ `purchase_allocation_rollout_state.enabled = 0`;
- không activation FIFO;
- không sửa secrets, DNS hoặc Cloudflare production resources ngoài release allowlist.

## Rubric

- Business correctness/data integrity: 30.
- Transaction/concurrency/idempotency: 20.
- Permission/audit: 10.
- Operator UI: 20.
- Tests/migration/rollback: 15.
- Performance/observability: 5.

Release gate: >= 95/100, không có Critical/High, CI/staging/browser QA PASS.
