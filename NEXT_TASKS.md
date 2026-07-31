# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

Tracking issue: `#13`.
Draft PR: `#14`.
Working branch: `feat/purchase-receipt-complete-20260731`.
Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.

## Đã hoàn thành

### P0 — FIFO lifecycle và review blockers

- [x] Cross-voucher allocation/unapplied lifecycle và weight attribution.
- [x] PO submit tự áp Receipt chờ theo FIFO trong cùng mutation.
- [x] Settlement close/reverse và manual FIFO override backend với permission/reason/audit.
- [x] Next-window activity lifecycle guard cho reverse settlement.
- [x] Backfill planner/CLI, unresolved report, checksum và activation guards.
- [x] Sửa rollout schema mismatch và chạy SQL renderer trên schema migrations thật.
- [x] Review vòng 2 đóng Critical/High findings, review ID `4827031228`.

### P1 — Operator read UI

- [x] Server-authoritative FIFO preview trước submit Purchase Receipt.
- [x] PO/Receipt timeline và drill-down từ append-only ledger.
- [x] Summary quantity/weight/window/tolerance/variance.
- [x] Loading/error/empty states và responsive overflow.

### P0 — Settlement và override UI

- [x] Migration `0031_purchase_allocation_control_metadata.sql` provision `Purchase Settlement` và `Purchase Allocation Override` cho catalogue tenant hiện có và `__standard__`.
- [x] Server timeline trả `queue_key` authoritative cho từng settlement window.
- [x] Action visibility fail-closed theo server capabilities `create` + `submit`.
- [x] Close/reverse dialogs có confirmation, reason bắt buộc, queue/window/tolerance/bounds scope.
- [x] Manual FIFO override dialog có allocation source, PO đích, row đích, quantity và reason.
- [x] Mutation tạo + submit control document qua DocumentKernel/Durable Object; không có write bypass.
- [x] Refetch document/timeline và invalidate list/overview sau thành công.
- [x] Server errors được map và hiển thị, không optimistic-update ledger.
- [x] SQL metadata migration test dùng toàn bộ production-shaped migration chain.
- [x] Unit test operator timeline queue scope.
- [x] Base `acd0a8df95eb35342b15de282b65102ac4314801` đã merge vào feature tại `09688b8712a4add2e384095601729c8d72ab4513`.
- [x] Exact merge head PASS:
  - Purchase Feature CI `30620458525`, job `91123529123`;
  - PR Validation `30620458601`, job `91123529201`;
  - CI `30620458550`, job `91123529211`;
  - production release job `91123529832` skipped.

## P0 kế tiếp — UI verification

1. Thêm interaction/E2E coverage cho:
   - hidden actions khi capability thiếu;
   - close chỉ ở window `Open`;
   - reverse chỉ ở window `Settled`;
   - reason bắt buộc;
   - quantity override phải dương;
   - success/error/refetch states;
   - mobile layout và keyboard/focus behavior.
2. Browser Preview QA:
   - desktop `1440x1000`;
   - mobile `390x844`;
   - Purchase Receipt submit preview;
   - PO/Receipt timeline;
   - close/reverse/override dialogs.
3. Không dùng production observation thay Browser Preview QA.

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
7. Refetch report sau settlement/override mutation.

## P0 — Lifecycle verification còn thiếu

1. Worker/Durable Object concurrency tests:
   - concurrent Receipt submit cùng supplier queue;
   - concurrent PO auto-apply từ cùng unapplied source;
   - revision conflict retry và idempotent receipt.
2. Production-shaped Receipt cancel lifecycle:
   - allocated + unapplied source;
   - cross-voucher apply rồi cancel;
   - settled/reversed window rules;
   - weight conservation và compatibility projection.
3. D1 batch size/latency với hàng trăm allocations.
4. Supplier contention load test.

## P0 — Staging và release gate

1. Staging migrations.
2. Backfill dry-run.
3. `unresolved_count=0` và checksum match.
4. Smoke PO → Receipt → cancel → settlement → report.
5. Review theo rubric 100 điểm; sửa mọi Critical/High và đạt ít nhất 95/100.
6. Backup mới, rollback plan và explicit production approval riêng.

## Production boundary

Khi chỉ đưa code/schema sang môi trường chạy:

- giữ `purchase_allocation_rollout_state.enabled = 0`;
- không activation FIFO;
- không sửa secrets, DNS hoặc Cloudflare production resources ngoài release allowlist;
- không merge PR #14 khi staging/browser/review gates chưa đủ.

## Rubric

- Business correctness/data integrity: 30.
- Transaction/concurrency/idempotency: 20.
- Permission/audit: 10.
- Operator UI: 20.
- Tests/migration/rollback: 15.
- Performance/observability: 5.

Release gate: >= 95/100, không có Critical/High, CI/staging/browser QA PASS.

## RBAC

### Slice A — hoàn thành và đã merge

- Exact head đã kiểm chứng: `0db13898ed00cbfe3835ce511f90c84aef38c8e8`.
- PR `#37` đã squash-merge tại `93ac85a0f16c2668b706ffcf8e15d3da53c8c7a9`.
- G4 PASS trên exact head, run mới nhất `30619408760`, job `91120101038`.
- Base sync vào purchase branch mang theo access-control contract, router/API, adapter typing, Permission Center fix và RBAC tests.

### Slice B — branch/PR riêng

1. Mở branch mới từ default head.
2. Append-only RBAC audit.
3. Atomic create user + role grants và atomic replace roles.
4. Last-admin guard.
5. Self-disable/self-demote guard.
6. Audit role/scope/enable-disable/password reset/session revoke, không ghi password/hash/token/secret.
7. Targeted tests + root test/typecheck/build + exact-head PR Validation.

Không deploy Cloudflare, sửa production secrets hoặc bật FIFO trong luồng RBAC khi chưa có yêu cầu riêng.
