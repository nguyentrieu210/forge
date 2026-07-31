# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature branch: `feat/purchase-receipt-complete-20260731`.
- Tracking issue: `#13`.
- Draft PR: `#14`.
- Feature implementation HEAD trước commit trạng thái này: `a54ae45c8aa49194fee8199a584ed47e0f775f31` (`feat(purchase): add server-authoritative submit preview`).
- Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env` hoặc generated artifacts.

## Production boundary

- Không deploy production từ feature branch.
- Không sửa Cloudflare production secrets hoặc DNS.
- Không bật FIFO production.
- `purchase_allocation_rollout_state.enabled` phải giữ `0` cho tới khi backfill/checksum, staging smoke và explicit approval riêng đều hoàn tất.

## Purchase Order / Purchase Receipt FIFO

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

### Baseline trước epic

- Migrations `0027`, `0028`, `0029`.
- Queue, settlement window, obligation, allocation, unapplied, settlement event và revision claim.
- Canonical material key do server tạo.
- Supplier-level Durable Object coordination và revision-conflict retry.
- PO submit mở obligation; Receipt submit FIFO qua nhiều PO; Receipt cancel tạo reversal.
- Nhôm cây/lá dùng `qty_bar`; barem và actual weight giữ riêng.

### Slice A — cross-voucher unapplied lifecycle

Đã triển khai:

- Contract giữ source Purchase Receipt voucher/revision cho allocation và unapplied movements.
- Migration append-only `0030_purchase_unapplied_weight_attribution.sql` thêm barem/actual-weight attribution và guards.
- D1/in-memory stores ghi effective source voucher, revision và weight columns.
- Reader trả unapplied sources theo queue/window, commit order, remaining quantity/weight và next allocation sequence.
- Receipt submit ghi planner-returned unapplied weight.
- PO submit tự hút unapplied Receipt nguồn theo FIFO, tạo `apply_unapplied` allocation + negative movement + compatibility projection trong cùng mutation plan.
- Tests cover partial/multiple source, source history, weight conservation và regression controller/store.

### Slice B — settlement và override

Đã triển khai server-side:

- Close settlement window với permission và reason bắt buộc.
- Integer tolerance bounds, shortage/overage variance và append-only settlement event.
- Reverse settlement lifecycle guard.
- Manual FIFO override có permission/reason và audit data.
- Registry/action controllers và targeted tests.
- Backdated Receipt warning được đưa vào submit preview; allocation vẫn theo commit sequence.

### Slice C — backfill và cutover tooling

Đã triển khai:

- `server/scripts/purchase-allocation-backfill-planner.mjs`.
- `server/scripts/backfill-purchase-receipt-allocations.mjs`, dry-run mặc định.
- Resolve deterministic từ voucher revisions/snapshots/child row identity; ambiguous rows thành unresolved, không đoán.
- Resolved/unresolved report và PO-level checksum.
- Activation path chặn checksum mismatch hoặc `unresolved_count > 0`, ghi actor/timestamp.
- Planner/CLI regression tests.

### Slice D1 — server-authoritative submit preview

Commit `a54ae45c8aa49194fee8199a584ed47e0f775f31` thêm:

- `server/packages/clouderp-core/src/purchase-allocation-preview.ts`.
- GET API `metaforge.api.get_submit_preview` tại tenant worker, có draft + submit permission checks.
- Preview dùng chính `AllocatingPurchaseReceiptController.buildPlan`, không duy trì thuật toán FIFO thứ hai.
- UI generic trong `FormContainer` gọi preview trước submit và fail closed khi preview lỗi.
- `SubmitPreviewDialog` responsive, hiển thị PO đích, quantity, barem/actual weight, unapplied và cảnh báo chứng từ lùi ngày.
- Real submit vẫn chạy lại dưới supplier Durable Object và kiểm tra revision trước write.
- Test khóa PO 200 + 100, Receipt 230 => preview 200 + 30; preview không mutate store; rollout disabled trả null.

## Verification

One-shot verified implementation run:

- Workflow run: `30613480237`.
- Apply reviewed patches: **PASS**.
- Full tests: **PASS**.
- Typecheck: **PASS**.
- Build: **PASS**.
- Commit verified implementation: **PASS**.
- Resulting SHA: `a54ae45c8aa49194fee8199a584ed47e0f775f31`.

Exact-head standard workflows created for the bot-pushed SHA:

- CI run `30613658678`: `action_required`, không có job.
- Purchase Feature CI run `30613658682`: `action_required`, không có job.
- Đây không phải test failure; cần một user-authored follow-up commit để kích hoạt lại exact-head CI bình thường.

## Phần còn thiếu trước release gate

1. Allocation timeline/read model cho Purchase Order và Purchase Receipt.
2. Settlement/reverse/manual-override dialogs trong operator UI.
3. Supplier debt report từ allocation ledger: ordered, received, nominal debt, active window, oldest PO age.
4. Loading/error/empty states và responsive browser verification.
5. Worker/Durable Object concurrency và production-shaped cancel lifecycle tests còn thiếu.
6. Exact-head standard CI green sau commit tài liệu hiện tại.
7. Cloudflare Browser Preview QA desktop/mobile.
8. Staging migrations, backfill dry-run và smoke PO → Receipt → cancel → settlement → report.
9. Review rubric >= 95/100, không có Critical/High.
10. Backup + explicit production approval riêng; FIFO vẫn disabled khi chỉ deploy code/schema.

## Gate hiện tại

- G0 Scope: **PASS**.
- G1 Requirements: **PASS**.
- G2 Technical plan: **PASS**.
- G3 Full tests/typecheck/build: **PASS** trên verified implementation run `30613480237`.
- G4 Exact-head standard CI: **PENDING RETRIGGER** sau bot-authored commit.
- G5 Staging + Browser QA: **NOT STARTED**.
- Review score: chưa chấm vòng cuối.
- Production: không được phép từ feature branch.
