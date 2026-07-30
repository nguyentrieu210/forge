# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

Tracking issue: `#13`.
Draft PR: `#14`.
Working branch: `feat/purchase-receipt-complete-20260731`.
Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.

## P0 — Slice A: hoàn tất FIFO lifecycle

Đã xong phần nền:

- [x] Contract có source voucher override cho cross-voucher allocation/unapplied rows.
- [x] Contract giữ barem và projected actual-weight attribution trên unapplied balance.
- [x] Append-only migration `0030_purchase_unapplied_weight_attribution.sql`.
- [x] SQL regression test cho sign, projection pair/version và net weight balance.
- [x] Đưa test mới vào root `test:sql` chain.

Việc kế tiếp theo thứ tự:

1. Mở rộng `ProcurementEntry` với optional source voucher identity và cập nhật D1 progress writer.
2. Cập nhật D1 allocation/unapplied writer:
   - dùng source voucher override khi có;
   - ghi weight columns của migration `0030`;
   - giữ default current aggregate cho luồng cũ.
3. Cập nhật in-memory store:
   - materialize effective voucher identity;
   - bỏ cách suy voucher từ `entry_id`;
   - tính remaining qty/barem/actual weight đúng theo source + movements.
4. Thêm reader projection `listPurchaseUnappliedQueueSources` theo queue/window, commit order, voucher revision và next allocation sequence.
5. Receipt submit phải ghi planner-returned unapplied weight vào ledger.
6. PO submit phải:
   - áp source cũ theo commit order;
   - hỗ trợ partial/multiple sources và nhiều PO rows;
   - tạo `apply_unapplied` allocation;
   - tạo negative `apply` movement trỏ đúng source/allocation;
   - tạo compatibility procurement row với Purchase Receipt nguồn;
   - ghi obligation, allocation, movement và revision claims cùng D1 batch.
7. Tests:
   - partial apply;
   - nhiều source;
   - nhiều PO rows;
   - source voucher/revision history;
   - barem/actual-weight conservation;
   - idempotency và revision conflict;
   - Receipt cancel và nhiều Receipt lines cùng queue;
   - worker/DO concurrency.

Hoàn thành Slice A khi targeted tests và root test/typecheck/build PASS.

## P0 — Slice B: settlement và override

- Close window có server permission và reason bắt buộc.
- Integer tolerance bounds, shortage/overage variance và append-only close event.
- Reverse settlement chỉ khi window kế tiếp chưa có activity.
- Manual FIFO override trong cùng tenant/company/supplier/material/window, có permission + reason.
- Lifecycle guards cho PO amend/cancel và Receipt cancel.
- Backdated Receipt warning nhưng allocation theo commit sequence.

## P0 — Slice C: backfill và cutover

- Viết `server/scripts/backfill-purchase-receipt-allocations.mjs`, dry-run mặc định.
- Resolve từ versions snapshot và child row IDs; không đoán ambiguous rows.
- Xuất resolved/unresolved count và PO-level checksum.
- Activation transaction chặn checksum mismatch hoặc unresolved > 0.
- Ghi actor và timestamp khi activation.

## P1 — Slice D: UI và báo cáo

- FIFO preview trước submit Purchase Receipt.
- PO/Receipt allocation timeline và drill-down.
- Hiển thị nominal remaining, actual received, unapplied, settlement bounds và variance.
- Settlement/manual override dialogs có confirmation, permission và reason.
- Backdated warning.
- Supplier debt report: ordered, received, nominal debt, active window, oldest PO age.
- Loading/error/empty states và responsive desktop/mobile.

## P0 — Slice E: review, CI và staging

1. Targeted unit/integration/SQL/worker concurrency tests.
2. `pnpm install --frozen-lockfile`.
3. Lint, test, typecheck, build.
4. Exact-head CI green trên PR #14.
5. Khôi phục đúng Cloudflare Browser Preview QA; production observation không được dùng thay CI/QA.
6. Browser QA desktop 1440x1000 và mobile 390x844.
7. Staging migration + backfill dry-run.
8. Smoke PO -> Receipt -> cancel -> settlement -> report.
9. Review một vòng theo rubric 100 điểm.
10. Sửa toàn bộ Critical/High và nâng tổng điểm lên ít nhất 95/100.

## Production boundary

Chỉ deploy production sau một explicit approval riêng, exact SHA CI xanh, staging evidence, backup và rollback plan.

Khi deploy code/schema:

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
