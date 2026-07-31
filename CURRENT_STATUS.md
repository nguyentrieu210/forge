# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature branch: `feat/purchase-receipt-complete-20260731`.
- Tracking issue: `#13`.
- Draft PR: `#14`.
- Review baseline: `8ceee27a7b7faa9e3c79ccaa8b5266f27498e9d5`.
- Blocker-fix implementation head trước commit tài liệu: `99a896bd6b16b2f4e004205070f908d15ec3ef70`.
- Base head đã kiểm tra: `ad9b91083fe686987aacae44e83a890e4ba592cc`.
- Đã đồng bộ workflow read-only `.github/workflows/pr-validation.yml` từ base vào feature.
- Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env` hoặc generated artifacts.

## Production boundary

- Không deploy production từ feature branch.
- Không sửa Cloudflare production secrets hoặc DNS.
- Không bật FIFO production.
- `purchase_allocation_rollout_state.enabled` phải giữ `0` cho tới khi backfill/checksum, staging smoke và explicit approval riêng đều hoàn tất.

## Purchase Order / Purchase Receipt FIFO

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

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

Đã triển khai:

- Close settlement window với permission và reason bắt buộc.
- Integer tolerance bounds, shortage/overage variance và append-only settlement event.
- Manual FIFO override có permission/reason và audit data.
- Backdated Receipt warning; allocation vẫn theo commit sequence.
- `PurchaseSettlementLifecycleController` chặn mở lại cửa sổ cũ khi cửa sổ kế tiếp đã có ledger activity.
- `D1RolloutPurchaseAllocationDomainStore` chỉ xét cửa sổ kế tiếp trực tiếp theo `MIN(window_sequence)` và kiểm tra obligation/allocation/unapplied/settlement activity.
- Registry dùng lifecycle controller mới.
- Unit test khóa controller rejection và D1 read-model query.

Các commit chính:

- `a46a34a1707c20d26ab74c31c67471185ab87870` — thêm lifecycle controller.
- `90e70980a1729de4cd823b618f6b1759d2d81f67` — D1 next-window activity read.
- `12e6dddb795cf6192aef3dd853e6b8ed5a650ced` — đăng ký lifecycle controller.
- `84a3902673c930c682a33d94f40bfbad22cb317e` — lifecycle tests.
- `c147bb2120708bb05a241730ad2e520a7fce55fb` — sửa type context.

### Slice C — backfill và cutover tooling

Đã sửa blocker schema:

- CLI dùng đúng `enabled_by` / `enabled_at` theo migration `0029`.
- `renderBackfillSql` và `renderActivationSql` được export để chạy integration test trên chính SQL renderer.
- Script chỉ chạy `main()` khi được gọi trực tiếp, không chạy side effect khi import test.
- Activation ghi `updated_at`, kiểm tra checksum, actor và timestamp sau update.
- `server/scripts/test-purchase-allocation-backfill-sql.py` áp migrations `0027`, `0029`, `0030` trên SQLite, chạy SQL backfill và activation thật rồi xác minh rollout row.
- Test mới đã được nối vào `server/package.json` `test:sql`.

Các commit chính:

- `50b00ceafca78017c8a2a06b67405417fa0160e4` — sửa schema/renderer.
- `b25a44c99c23c0f09cdb885ab0eba98b3d7ad856` — schema integration test.
- `0f089860212e17f5d710d12b00b4c957d441befa` — đưa test vào SQL gate.

### Slice D — operator read UI

Đã hoàn thành:

- Server-authoritative FIFO preview trước submit Purchase Receipt.
- PO/Receipt allocation timeline và drill-down từ append-only ledger.
- Summary ordered/received/remaining, allocated/unapplied, barem/actual weight, window status, tolerance, bounds và variance.
- Loading/error/empty states và responsive overflow.

Code timeline chính: `38b0c3374e9c6c00efae95b4699c1a0831252ad2`.

## Verification

### Baseline trước blocker fixes

SHA `8ceee27a7b7faa9e3c79ccaa8b5266f27498e9d5`:

- CI run `30616566387`: **PASS**.
- Purchase Feature CI run `30616566366`: **PASS**.
- Review vòng 1 phát hiện 1 Critical và 1 High.

### Blocker fixes

- Code và tests đã commit tới `0f089860212e17f5d710d12b00b4c957d441befa`.
- Workflow PR Validation từ base được đồng bộ tại `99a896bd6b16b2f4e004205070f908d15ec3ef70`.
- Trước đồng bộ, feature ahead 95 commits và behind base 5 commits; base chỉ thêm workflow PR validation và cập nhật hai tài liệu trạng thái, không có thay đổi nghiệp vụ.
- Exact-head CI cho blocker fixes chưa được tính PASS cho tới khi PR hết conflict và workflow tạo run trên mergeable head.

## Phần còn thiếu trước release gate

1. Đồng bộ base vào feature và xác nhận PR #14 trở lại mergeable.
2. Exact-head CI green cho toàn bộ blocker fixes.
3. Review lại hai finding và ghi kết quả.
4. Settlement/reverse/manual-override dialogs trong operator UI, có permission, reason và confirmation.
5. Supplier debt report từ allocation ledger.
6. Worker/Durable Object concurrency và production-shaped Receipt cancel lifecycle tests.
7. Cloudflare Browser Preview QA desktop `1440x1000` và mobile `390x844`.
8. Staging migrations, backfill dry-run và smoke PO → Receipt → cancel → settlement → report.
9. Review rubric >= 95/100, không có Critical/High.

## Gate hiện tại

- G0 Scope: **PASS**.
- G1 Requirements: **PASS**.
- G2 Technical plan: **PASS**.
- G3 Tests/typecheck/build: baseline **PASS**; blocker-fix exact head **PENDING**.
- G4 Exact-head standard CI: **PENDING BASE SYNC**.
- G5 Staging + Browser QA: **NOT STARTED**.
- Review vòng 1: findings đã sửa trong code, đang chờ CI và review lại.
- Production: không được phép từ feature branch.

## RBAC Slice A và G4 CI

- Implementation commit: `ab974f92ffbcf015fb71d3051df33508c9f09942`.
- Exact code/docs head cần kiểm chứng: `2f0de9db871f3dbe32facf26abb84f1558be0824`.
- PR kiểm chứng hiện hành: `#34`, branch `feat/rbac-permission-slice-a-final-20260731`, trạng thái draft.
- PR `#22` đã đóng khi phát lại event; không merge.
- G3 PASS tại workflow `30612014393`, job `91101823154`: 566 server tests + SQL suite, root typecheck và root build.
- Default branch đã thêm workflow read-only `.github/workflows/pr-validation.yml` qua các commit:
  - `3495292f1f94b2f1a29a0dfb7dbc4f89fc95cd0d`;
  - `3634e2735a691f84deb1d49c34a981f800117e8a`;
  - `0a1044c258aa57b68ab37eb29d573ccd1bb66b02`.
- Đã thử event `reopened` và `ready_for_review`; GitHub chỉ lập run `Cloudflare Production Release Observation`, không lập run `PR Validation`; combined status của head vẫn rỗng.
- Connector không cung cấp API enable/dispatch workflow. Không chèn job vào workflow production đang giữ secret.
- G4 exact-head CI: **BLOCKED bởi workflow registration/state ở cấp GitHub Actions**.
- Không merge PR RBAC, không deploy Cloudflare, không sửa production secrets và không bật FIFO.
