# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

Tracking issue: `#13`.
Working branch: `feat/purchase-receipt-complete-20260731`.
Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.

## P0 — Slice A: hoàn tất FIFO lifecycle

1. Mở rộng allocation/unapplied plan row để cross-voucher event giữ đúng Purchase Receipt nguồn.
2. Thêm reader projection cho unapplied source theo queue/window, commit order, voucher revision và Receipt row data.
3. Khi PO mới gia nhập open window:
   - áp unapplied cũ trước;
   - tạo `apply_unapplied` allocation;
   - tạo negative `apply` movement trỏ đúng source;
   - ghi obligation, allocation, movement và revision claims cùng D1 batch.
4. Bảo toàn barem và projected actual-weight attribution của Receipt nguồn.
5. Test partial apply, nhiều source, nhiều PO rows, idempotency, revision conflict và voucher history.
6. Production-shaped tests cho Receipt cancel, nhiều Receipt lines cùng queue và worker/DO concurrency.

Hoàn thành khi targeted tests và root test/typecheck/build PASS.

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
4. Draft PR và exact-head CI green.
5. Cloudflare Browser Preview QA desktop 1440x1000 và mobile 390x844.
6. Staging migration + backfill dry-run.
7. Smoke PO -> Receipt -> cancel -> settlement -> report.
8. Review một vòng theo rubric 100 điểm.
9. Sửa toàn bộ Critical/High và nâng tổng điểm lên ít nhất 95/100.

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
