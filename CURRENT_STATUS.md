# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature branch: `feat/purchase-receipt-complete-20260731`.
- Tracking issue: `#13`.
- Draft PR: `#14`.
- Latest verified feature code SHA: `38b0c3374e9c6c00efae95b4699c1a0831252ad2` (`feat(purchase): add allocation timeline and drill-down`).
- Standard CI workflow restored at `9a5e11cc0770237eae299d69e8ffc1f18b8be976`.
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

Đã hoàn thành:

- Contract giữ source Purchase Receipt voucher/revision cho allocation và unapplied movements.
- Migration append-only `0030_purchase_unapplied_weight_attribution.sql` thêm barem/actual-weight attribution và guards.
- D1/in-memory stores ghi effective source voucher, revision và weight columns.
- Reader trả unapplied sources theo queue/window, commit order, remaining quantity/weight và next allocation sequence.
- Receipt submit ghi planner-returned unapplied weight.
- PO submit tự hút unapplied Receipt nguồn theo FIFO, tạo `apply_unapplied` allocation + negative movement + compatibility projection trong cùng mutation plan.
- Tests cover partial/multiple source, source history, weight conservation và regression controller/store.

### Slice B — settlement và override backend

Đã hoàn thành server-side:

- Close settlement window với permission và reason bắt buộc.
- Integer tolerance bounds, shortage/overage variance và append-only settlement event.
- Reverse settlement lifecycle guard.
- Manual FIFO override có permission/reason và audit data.
- Registry/action controllers và targeted tests.
- Backdated Receipt warning; allocation vẫn theo commit sequence.

### Slice C — backfill và cutover tooling

Đã hoàn thành:

- `server/scripts/purchase-allocation-backfill-planner.mjs`.
- `server/scripts/backfill-purchase-receipt-allocations.mjs`, dry-run mặc định.
- Resolve deterministic từ voucher revisions/snapshots/child row identity; ambiguous rows thành unresolved, không đoán.
- Resolved/unresolved report và PO-level checksum.
- Activation path chặn checksum mismatch hoặc `unresolved_count > 0`, ghi actor/timestamp.
- Planner/CLI regression tests.

### Slice D1 — server-authoritative submit preview

Commit `a54ae45c8aa49194fee8199a584ed47e0f775f31`:

- `server/packages/clouderp-core/src/purchase-allocation-preview.ts`.
- GET API `metaforge.api.get_submit_preview` có draft + submit permission checks.
- Preview dùng chính `AllocatingPurchaseReceiptController.buildPlan`, không duy trì thuật toán FIFO thứ hai.
- `FormContainer` gọi preview trước submit và fail closed khi preview lỗi.
- `SubmitPreviewDialog` responsive hiển thị PO đích, quantity, barem/actual weight, unapplied và cảnh báo lùi ngày.
- Real submit vẫn chạy lại dưới supplier Durable Object và kiểm tra revision trước write.

### Slice D2 — allocation timeline và drill-down

Code SHA `38b0c3374e9c6c00efae95b4699c1a0831252ad2`:

- `server/packages/document-kernel/src/purchase-allocation-timeline.ts` thêm read model từ append-only allocation ledger.
- Read model chỉ hoạt động khi rollout state enabled; không đọc bảng procurement compatibility làm nguồn sự thật.
- Hỗ trợ Purchase Order và Purchase Receipt.
- Projection gồm ordered/received/remaining, allocated/unapplied, barem/actual weight, active/settled/reversed window, tolerance, bounds, variance và reason.
- GET API `metaforge.api.get_purchase_allocation_timeline` kiểm tra document tồn tại và permission `read` trước khi trả dữ liệu.
- `AllocationTimelineDialog.tsx` có summary cards, settlement-window cards, ledger event table, loading/error/empty states và horizontal overflow cho màn hình hẹp.
- `FormContainer` hiện nút **Phân bổ** trên PO/Receipt đã submit hoặc cancel; draft Receipt tiếp tục dùng submit preview.
- Test projection cover PO 300 đặt / 230 nhận / 70 còn lại và Receipt 200 allocated / 30 unapplied, kèm weight/window/event labels.
- One-shot script đã tự xóa; workflow đã khôi phục `contents: read`, không còn đường commit/push trong CI chuẩn.

## Verification

### Exact-head trước timeline

SHA `9861a73fd9680aa3fa9fe84c4d42e7e186529c0a`:

- CI run `30613828515`: **PASS**.
- Purchase Feature CI run `30613828388`: **PASS**.

### Timeline implementation

Workflow run `30615852058`, attempt cuối job `91109594425`:

- Apply exact-branch one-shot: **PASS**.
- Server unit tests: **PASS**, 561/561.
- Server SQL tests: **PASS**, gồm 30 migrations và allocation rollout/weight suites.
- Client tests/selfcheck: **PASS**, 87 nhóm assert.
- Typecheck: **PASS**.
- Build: **PASS**.
- Commit/push verified implementation: **PASS**.
- Resulting code SHA: `38b0c3374e9c6c00efae95b4699c1a0831252ad2`.
- Chỉ còn warning bundle size/dynamic import đã tồn tại; không có build failure.

## Phần còn thiếu trước release gate

1. Settlement/reverse/manual-override dialogs trong operator UI, có permission, reason và confirmation.
2. Supplier debt report từ allocation ledger: ordered, received, nominal debt, active window, oldest PO age.
3. Worker/Durable Object concurrency và production-shaped Receipt cancel lifecycle tests.
4. Exact-head standard CI green cho HEAD tài liệu cuối cùng.
5. Cloudflare Browser Preview QA desktop `1440x1000` và mobile `390x844`.
6. Staging migrations, backfill dry-run và smoke PO → Receipt → cancel → settlement → report.
7. Review rubric >= 95/100, không có Critical/High.
8. Backup + explicit production approval riêng; FIFO vẫn disabled khi chỉ deploy code/schema.

## Gate hiện tại

- G0 Scope: **PASS**.
- G1 Requirements: **PASS**.
- G2 Technical plan: **PASS**.
- G3 Full tests/typecheck/build: **PASS**.
- G4 Exact-head standard CI: **PASS** tại `9861a73...`; cần xác minh lại trên HEAD tài liệu cuối cùng.
- G5 Staging + Browser QA: **NOT STARTED**.
- Review score: chưa chấm vòng cuối.
- Production: không được phép từ feature branch.
