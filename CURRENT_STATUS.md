# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature branch: `feat/purchase-receipt-complete-20260731`.
- Tracking issue: `#13`.
- Draft PR: `#14`.
- Current verified code head trước commit tài liệu này: `0743a36c52c00fb52c9b80c16d4657945390d754`.
- Base merge commit: `7201226103d54f6b87a62ed6d020c58926ff9ef0`.
- Base head merged: `ad9b91083fe686987aacae44e83a890e4ba592cc`.
- PR #14 hiện mergeable và vẫn giữ draft.
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
- `PurchaseSettlementLifecycleController` chặn mở lại cửa sổ cũ khi cửa sổ kế tiếp trực tiếp đã có ledger activity.
- `D1RolloutPurchaseAllocationDomainStore` kiểm tra obligation/allocation/unapplied/settlement activity tại cửa sổ kế tiếp theo `MIN(window_sequence)`.
- Registry dùng lifecycle controller mới.
- Unit test khóa controller rejection và D1 query shape.

Commits chính:

- `a46a34a1707c20d26ab74c31c67471185ab87870` — lifecycle controller.
- `90e70980a1729de4cd823b618f6b1759d2d81f67` — D1 next-window activity read.
- `12e6dddb795cf6192aef3dd853e6b8ed5a650ced` — registry integration.
- `84a3902673c930c682a33d94f40bfbad22cb317e` — lifecycle tests.
- `0743a36c52c00fb52c9b80c16d4657945390d754` — declaration-safe return type.

### Slice C — backfill và cutover tooling

Đã sửa blocker schema:

- CLI dùng đúng `enabled_by` / `enabled_at` theo migration `0029`.
- `renderBackfillSql` và `renderActivationSql` được export để integration test gọi đúng SQL renderer thật.
- Script chỉ chạy `main()` khi gọi trực tiếp, không có side effect khi import test.
- Activation ghi `updated_at`, kiểm tra checksum, actor và timestamp sau update.
- `server/scripts/test-purchase-allocation-backfill-sql.py` áp migrations `0027`, `0029`, `0030` trên SQLite, chạy SQL backfill và activation rồi xác minh rollout row.
- Test mới nằm trong `server/package.json` `test:sql`.

Commits chính:

- `50b00ceafca78017c8a2a06b67405417fa0160e4` — schema/renderer fix.
- `b25a44c99c23c0f09cdb885ab0eba98b3d7ad856` — schema integration test.
- `0f089860212e17f5d710d12b00b4c957d441befa` — SQL gate wiring.

### Slice D — operator read UI

Đã hoàn thành:

- Server-authoritative FIFO preview trước submit Purchase Receipt.
- PO/Receipt allocation timeline và drill-down từ append-only ledger.
- Summary ordered/received/remaining, allocated/unapplied, barem/actual weight, window status, tolerance, bounds và variance.
- Loading/error/empty states và responsive overflow.

Code timeline chính: `38b0c3374e9c6c00efae95b4699c1a0831252ad2`.

## Review

### Vòng 1

Review ID `4826870947` phát hiện:

- Critical: backfill/activation dùng sai tên cột rollout.
- High: reverse settlement thiếu next-window activity lifecycle rule.

### Vòng 2

Review ID `4827031228` trên head `0743a36c52c00fb52c9b80c16d4657945390d754`:

- Critical: **RESOLVED** bằng schema-level SQL integration test.
- High: **RESOLVED** bằng D1 read model, lifecycle controller và targeted tests.
- PR tiếp tục draft vì epic còn UI mutation, report, concurrency, browser và staging work.

## Exact-head verification

Head `0743a36c52c00fb52c9b80c16d4657945390d754`:

- Purchase Feature CI run `30618438268`, job `91117002116`: **PASS**.
  - Server unit tests: PASS.
  - Server SQL tests: PASS, gồm backfill schema integration.
  - Client tests: PASS.
  - Typecheck: PASS.
  - Build: PASS.
- PR Validation run `30618438292`, job `91117002092`: **PASS**.
- CI run `30618438353`, job `91117003369`: **PASS**.
- CI job `91117004098` (`Release alu production`): **SKIPPED**.

## Phần còn thiếu trước release gate

1. Settlement/reverse/manual-override dialogs trong operator UI, có permission, reason và confirmation.
2. Supplier debt report từ allocation ledger.
3. Worker/Durable Object concurrency và production-shaped Receipt cancel lifecycle tests.
4. Cloudflare Browser Preview QA desktop `1440x1000` và mobile `390x844`.
5. Staging migrations, backfill dry-run và smoke PO → Receipt → cancel → settlement → report.
6. Review rubric >= 95/100, không có Critical/High trong phạm vi hoàn chỉnh.

## Gate hiện tại

- G0 Scope: **PASS**.
- G1 Requirements: **PASS**.
- G2 Technical plan: **PASS**.
- G3 Tests/typecheck/build: **PASS** trên `0743a36c...`.
- G4 Exact-head standard CI: **PASS** trên `0743a36c...`.
- G5 Staging + Browser QA: **NOT STARTED**.
- Review blockers vòng 1: **RESOLVED**.
- Epic review score: chưa chấm vòng cuối vì phạm vi còn thiếu.
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
