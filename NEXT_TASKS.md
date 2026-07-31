# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

Tracking issue: `#13`.
Draft PR: `#14`.
Working branch: `feat/purchase-receipt-complete-20260731`.
Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.

## Đã hoàn thành

### P0 — FIFO lifecycle và review blockers

- [x] Cross-voucher source voucher/revision cho allocation và unapplied movements.
- [x] Append-only migration `0030_purchase_unapplied_weight_attribution.sql`.
- [x] D1/in-memory storage và reader cho remaining qty/barem/actual weight.
- [x] Receipt submit ghi unapplied weight.
- [x] PO submit tự áp Receipt chờ theo FIFO, hỗ trợ partial/multiple sources và compatibility projection.
- [x] Settlement close/reverse và manual FIFO override backend với permission/reason/audit.
- [x] Backdated warning nhưng commit-order allocation.
- [x] Backfill planner/CLI, unresolved report, checksum và activation guards.
- [x] Sửa rollout schema mismatch: dùng `enabled_by` / `enabled_at`.
- [x] Export SQL renderer và thêm SQLite integration test chạy trên migrations thật.
- [x] Thêm cross-window settlement lifecycle controller.
- [x] D1 read model kiểm tra activity của cửa sổ kế tiếp trực tiếp.
- [x] Unit test controller rejection và D1 query shape.
- [x] Đồng bộ `.github/workflows/pr-validation.yml` từ base.

### P1 — Operator UI phần đã xong

- [x] Server-authoritative FIFO preview trước submit Purchase Receipt.
- [x] PO/Receipt allocation timeline và drill-down từ append-only ledger.
- [x] Hiển thị nominal remaining, received/allocated/unapplied, barem/actual weight, window status, tolerance, bounds và variance.
- [x] Loading/error/empty states và responsive overflow cho timeline dialog.

## P0 ngay tiếp theo — base sync, CI và review lại

1. Hợp nhất base `hotfix/alumdoor-print-list-delete` vào feature branch mà không force-push lịch sử.
2. Xác nhận PR #14 trở lại `mergeable`.
3. Chạy exact-head:
   - server unit tests;
   - SQL suite, gồm `test-purchase-allocation-backfill-sql.py`;
   - client tests;
   - typecheck;
   - build.
4. Sửa mọi failure trên exact head.
5. Review lại hai finding vòng 1:
   - backfill SQL phải chạy đúng schema migration;
   - settlement cũ phải bị chặn khi cửa sổ kế tiếp có activity.
6. Ghi run/job ID và review result vào `CURRENT_STATUS.md`.

## P0 kế tiếp — Settlement và override UI

1. Thêm action visibility theo server capabilities/permissions cho:
   - close settlement window;
   - reverse settlement;
   - manual FIFO override.
2. Dialog bắt buộc confirmation và reason, không cho gửi reason rỗng.
3. Hiển thị window/queue/material/supplier scope trước khi xác nhận.
4. Refetch document, timeline và report sau mutation thành công.
5. Fail closed khi server từ chối permission, stale revision hoặc lifecycle rule.
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
   - settled/reversed window rules;
   - weight conservation và compatibility projection.
3. Cloudflare Browser Preview QA, không dùng production observation thay QA:
   - desktop `1440x1000`;
   - mobile `390x844`;
   - preview submit;
   - PO/Receipt timeline;
   - settlement/override dialogs;
   - supplier debt report.
4. Staging:
   - migrations;
   - backfill dry-run;
   - `unresolved_count=0` và checksum match;
   - smoke PO → Receipt → cancel → settlement → report.
5. Review theo rubric 100 điểm; sửa mọi Critical/High và đạt ít nhất 95/100.

## Production boundary

Chỉ phát hành sau explicit approval riêng, exact SHA CI xanh, staging evidence, backup và rollback plan.

Khi chỉ đưa code/schema sang môi trường chạy:

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

## P0 — RBAC Slice A

- Implementation: `ab974f92ffbcf015fb71d3051df33508c9f09942`.
- Exact head: `2f0de9db871f3dbe32facf26abb84f1558be0824`.
- Draft verification PR: `#34`.
- G3 PASS: workflow `30612014393`, job `91101823154`.
- G4 BLOCKED: workflow `PR Validation` chưa được GitHub Actions đăng ký/chạy; combined status rỗng.
- Kiểm tra trạng thái workflow trong GitHub Actions, chạy test/typecheck/build trên exact head, ghi run/job ID rồi mới review merge.
- Sau khi Slice A merge mới mở Slice B cho audit append-only, atomic user/roles và last-admin/self-lockout guards.
- Không merge, deploy, sửa production secrets hoặc bật FIFO khi G4 chưa có bằng chứng xanh.
