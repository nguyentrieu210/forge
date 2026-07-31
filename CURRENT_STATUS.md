# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature branch: `feat/purchase-receipt-complete-20260731`.
- Tracking issue: `#13`.
- Draft PR: `#14`.
- Purchase implementation head đã qua CI trước base sync: `c99da53d38e74b541d9a9abe8806c7e7854502ea`.
- Base head đã kiểm tra và đưa vào merge tree: `acd0a8df95eb35342b15de282b65102ac4314801`.
- Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env` hoặc generated artifacts.

## Production boundary

- Không deploy production từ feature branch.
- Không sửa Cloudflare production secrets hoặc DNS.
- Không bật FIFO production.
- `purchase_allocation_rollout_state.enabled` phải giữ `0` cho tới khi backfill/checksum, staging smoke và explicit approval riêng đều hoàn tất.

## Purchase Order / Purchase Receipt FIFO

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

### Backend lifecycle, settlement và cutover

Đã hoàn thành:

- Cross-voucher allocation/unapplied attribution và migration `0030_purchase_unapplied_weight_attribution.sql`.
- PO submit tự hút Receipt chờ theo FIFO trong cùng mutation plan.
- Settlement close/reverse, manual FIFO override, permission, reason và append-only audit.
- Reverse settlement bị chặn khi cửa sổ kế tiếp trực tiếp đã có activity.
- Backfill planner/CLI, unresolved report, checksum và activation guards.
- Rollout schema dùng đúng `enabled_by` / `enabled_at`.
- SQL renderer backfill/activation chạy qua schema-level SQLite integration test.

### Operator read UI

Đã hoàn thành:

- Server-authoritative FIFO preview trước submit Purchase Receipt.
- PO/Receipt allocation timeline và drill-down từ append-only ledger.
- Summary ordered/received/remaining, allocated/unapplied, barem/actual weight, window status, tolerance, bounds và variance.
- Loading/error/empty states và responsive horizontal overflow.

### Operator settlement và override UI

Đã triển khai tại head `c99da53d38e74b541d9a9abe8806c7e7854502ea`:

- Migration append-only `0031_purchase_allocation_control_metadata.sql` provision hai control DocType:
  - `Purchase Settlement`;
  - `Purchase Allocation Override`.
- Metadata được seed cho mọi catalogue tenant hiện có, gồm `__standard__`, và roles cần thiết.
- `D1PurchaseAllocationOperatorTimelineService` bổ sung `queue_key` authoritative cho từng settlement window mà không đổi nguồn dữ liệu ledger.
- Timeline chỉ hiện close/reverse/override action khi server capabilities cho phép `create` + `submit`.
- Dialog bắt buộc reason, hiển thị scope, tolerance/bounds và confirmation.
- Manual override bắt nhập PO đích, row đích và quantity dương.
- Mutation tạo rồi submit control document qua adapter hiện có, nên vẫn đi qua DocumentKernel/Durable Object, permission, revision và audit; không có write API bypass.
- Sau thành công, UI invalidate document/list/overview và đọc lại timeline từ server; không optimistic-update ledger.
- Error từ server được map và hiển thị fail-closed.

Files chính:

- `client/packages/views/src/container/PurchaseAllocationActionDialog.tsx`.
- `client/packages/views/src/container/AllocationTimelineDialog.tsx`.
- `server/packages/document-kernel/src/purchase-allocation-operator-timeline.ts`.
- `server/migrations/tenant/0031_purchase_allocation_control_metadata.sql`.
- `server/scripts/test-purchase-allocation-control-metadata.py`.
- `server/tests/purchase-allocation-operator-timeline.test.mjs`.

## Verification

### Finding fixes trước đó

Review vòng 2 ID `4827031228`:

- Critical rollout schema mismatch: **RESOLVED**.
- High next-window reverse lifecycle: **RESOLVED**.

### Settlement/override UI exact implementation head

SHA `c99da53d38e74b541d9a9abe8806c7e7854502ea`:

- Purchase Feature CI run `30619923285`, job `91121820282`: **PASS**.
  - Server unit tests: PASS.
  - Server SQL tests: PASS, gồm 31 migrations và control metadata production-shaped fixture.
  - Client selfcheck/type compilation: PASS.
  - Typecheck: PASS.
  - Build: PASS.
- PR Validation run `30619923258`, job `91121820000`: **PASS**.
- CI run `30619923233`, job `91121819867`: **PASS**.
- CI job `91121820309` (`Release alu production`): **SKIPPED**.

Lần chạy đầu ở head `20fce38d3d20c544e950476abcf369b7162685bc` thất bại vì fixture test mới chưa dựng toàn bộ migration chain và thiếu bảng `roles`; production migrations không lỗi. Fixture đã sửa để áp toàn bộ migrations trước `0031`, sau đó rerun xanh.

## Phần còn thiếu trước release gate

1. Client interaction/E2E tests cho hidden actions, required reason, success/error/refetch và mobile layout.
2. Supplier debt report từ allocation ledger.
3. Worker/Durable Object concurrency và production-shaped Receipt cancel lifecycle tests.
4. Cloudflare Browser Preview QA desktop `1440x1000` và mobile `390x844`.
5. Staging migrations, backfill dry-run và smoke PO → Receipt → cancel → settlement → report.
6. Review rubric >= 95/100, không có Critical/High trong phạm vi hoàn chỉnh.
7. Backup và explicit production approval riêng trước bất kỳ activation nào.

## Gate hiện tại

- G0 Scope: **PASS**.
- G1 Requirements: **PASS**.
- G2 Technical plan: **PASS**.
- G3 Tests/typecheck/build: **PASS** trên `c99da53d...` trước base sync.
- G4 Exact-head standard CI: **PASS** trên `c99da53d...` trước base sync; cần xác nhận lại trên merge head cuối.
- G5 Staging + Browser QA: **NOT STARTED**.
- Production: không được phép từ feature branch.

## RBAC

### Slice A đã merge vào default

- Implementation gốc: `ab974f92ffbcf015fb71d3051df33508c9f09942`.
- Exact head đã kiểm chứng: `0db13898ed00cbfe3835ce511f90c84aef38c8e8`.
- PR `#37` đã squash-merge.
- Merge commit: `93ac85a0f16c2668b706ffcf8e15d3da53c8c7a9`.
- G4 exact-head PASS tại run mới nhất `30619408760`, job `91120101038`.
- Base sync này mang theo access-control contract, router/API, adapter typing, Permission Center fix và targeted RBAC tests.

### Slice B

- Phải mở branch/PR riêng từ default sau merge.
- Phạm vi: append-only audit, atomic user/roles, last-admin và self-lockout guards.
- Không trộn deploy Cloudflare, production secrets hoặc FIFO activation vào luồng RBAC.

## Sidebar/Gateway production

- Code sidebar gọn đã có trên default, nhưng repository vẫn thiếu provider evidence mới nhất cho Gateway deployment/version ID và browser smoke production.
- Không dùng production observation thay cho Browser Preview QA của purchase epic.
