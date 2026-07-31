# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

Tracking issue: `#13`.
Draft PR: `#14`.
Working branch: `feat/purchase-receipt-complete-20260731`.
Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.

## Đã hoàn thành

### FIFO lifecycle và review blockers

- [x] Cross-voucher allocation/unapplied lifecycle và weight attribution.
- [x] PO submit tự áp Receipt chờ theo FIFO trong cùng mutation.
- [x] Settlement close/reverse và manual FIFO override backend với permission/reason/audit.
- [x] Next-window activity lifecycle guard cho reverse settlement.
- [x] Backfill planner/CLI, unresolved report, checksum và activation guards.
- [x] Sửa rollout schema mismatch và chạy SQL renderer trên migrations thật.
- [x] Review vòng 2 đóng Critical/High findings, review ID `4827031228`.

### Operator UI

- [x] Server-authoritative FIFO preview trước submit Purchase Receipt.
- [x] PO/Receipt timeline và drill-down từ append-only ledger.
- [x] Close/reverse/manual-override dialogs với server capabilities, reason và confirmation.
- [x] Mutation qua DocumentKernel/Durable Object; không có write bypass.
- [x] Refetch document/timeline và invalidate list/overview sau mutation.
- [x] Responsive overflow, loading/error/empty states.

### Supplier debt report — scoped drill-down

- [x] Ledger read model, không dùng procurement compatibility/progress table.
- [x] Supplier/company/material/window/status/tolerance columns.
- [x] Ordered/received/allocated/nominal remaining/unapplied quantities.
- [x] Oldest open PO date/age và barem/actual weight.
- [x] Rollout-disabled trả `null`.
- [x] Report snapshot chỉ cho các settlement window đã được permission-check của PO/Receipt hiện tại.
- [x] Filter company/supplier/item/status/oldest-open-PO date.
- [x] Responsive table, empty state và CSV export có spreadsheet-injection guard.
- [x] Refetch report qua timeline sau settlement/override mutation.
- [x] Projection tests, D1 query-shape test và rollout-disabled test.
- [x] Exact report head `554500502aeff45f75381e195517539eed5b94c2` PASS:
  - Purchase Feature CI `30622609267`, job `91130424211`;
  - PR Validation `30622609247`, job `91130423800`;
  - CI `30622609312`, job `91130424161`;
  - production release job `91130425008` skipped.
- [x] Default ancestry sync merge `ee9ffe8092dedfa3bac496a0efb766a55469c238` PASS:
  - Purchase Feature CI `30623044989`, job `91131834137`;
  - PR Validation `30623044983`, job `91131803690`;
  - CI `30623044993`, job `91131855980`;
  - production release job `91131856480` skipped.

## P0 kế tiếp — Worker/Durable Object concurrency

1. Concurrent Receipt submit cùng supplier queue:
   - cùng queue/window;
   - revision claim conflict;
   - retry tối đa ba lần;
   - chỉ một ledger result hợp lệ cho mỗi command/idempotency key.
2. Concurrent PO auto-apply từ cùng unapplied Receipt source:
   - không over-consume source;
   - quantity/barem/actual weight conservation;
   - compatibility projection khớp ledger.
3. Concurrent settlement/override:
   - stale window/revision bị từ chối;
   - next-window lifecycle guard không bị race;
   - audit/event sequence deterministic.
4. D1 batch size/latency với hàng trăm allocation rows.
5. Supplier contention load test và timeout/error classification.

## P0 kế tiếp — Production-shaped Receipt cancel lifecycle

1. Cancel Receipt có cả allocated và unapplied quantity.
2. Cross-voucher `apply_unapplied` rồi cancel source Receipt.
3. Cancel trong open/settled/reversed window.
4. Weight conservation cho quantity, barem và actual weight.
5. Compatibility projection và mutation receipt/idempotency.
6. Retry/conflict behavior qua worker/facade path, không chỉ planner hoặc in-memory store.

## P0 — UI verification

1. Interaction/E2E coverage:
   - hidden actions khi capability thiếu;
   - close chỉ ở `Open`, reverse chỉ ở `Settled`;
   - reason bắt buộc;
   - override quantity dương;
   - success/error/refetch states;
   - report filters, CSV và empty state;
   - keyboard/focus và mobile layout.
2. Browser Preview QA:
   - desktop `1440x1000`;
   - mobile `390x844`;
   - Receipt submit preview;
   - PO/Receipt timeline;
   - settlement/override dialogs;
   - supplier debt scoped report.
3. Không dùng Cloudflare production bot comment thay Browser Preview QA.

## P1 — Business decision cho global supplier debt report

Hiện đã có scoped drill-down theo các window của chứng từ đang mở. Chỉ mở thêm standalone global screen/API nếu business xác nhận cần xem toàn tenant trong một bảng.

Nếu làm global report:

1. Permission/data-scope contract rõ cho supplier/company toàn tenant.
2. Standalone route/report registry, không lách DocumentKernel permission.
3. Server-side filters và pagination/export.
4. Tenant isolation integration test.
5. Không mở rộng dữ liệu dựa chỉ vào quyền đọc một PO/Receipt đơn lẻ.

## P0 — Staging và release gate

1. Staging migrations.
2. Backfill dry-run.
3. `unresolved_count=0` và checksum match.
4. Smoke PO → Receipt → cancel → settlement → report.
5. Review theo rubric 100 điểm; sửa mọi Critical/High và đạt ít nhất 95/100.
6. Backup mới, rollback plan và explicit production approval riêng.

## Production boundary

- Giữ `purchase_allocation_rollout_state.enabled = 0`.
- Không activation FIFO.
- Không sửa secrets hoặc DNS.
- Không merge PR #14 khi concurrency/cancel, staging/browser và review gates chưa đủ.
- Cloudflare Git integration đã tự báo Gateway deployment cho default commit `7da22ab3`; xem đó là sự kiện vận hành riêng, không phải bằng chứng release cho purchase feature.

## Rubric

- Business correctness/data integrity: 30.
- Transaction/concurrency/idempotency: 20.
- Permission/audit: 10.
- Operator UI: 20.
- Tests/migration/rollback: 15.
- Performance/observability: 5.

Release gate: >= 95/100, không có Critical/High, CI/staging/browser QA PASS.

## RBAC

- Slice A đã merge qua PR `#37`.
- Slice B tiếp tục trên branch/PR riêng.
- Workflow helper RBAC trên PR #14 đã no-op và PASS; không áp wiring payload vào purchase branch.
