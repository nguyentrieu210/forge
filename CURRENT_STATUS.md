# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature branch: `feat/purchase-receipt-complete-20260731`.
- Tracking issue: `#13`.
- Draft PR: `#14`, open và mergeable.
- Supplier debt implementation head đã qua CI: `554500502aeff45f75381e195517539eed5b94c2`.
- Current verified base-sync merge head trước commit tài liệu này: `ee9ffe8092dedfa3bac496a0efb766a55469c238`.
- Default head đã nhập vào feature: `7da22ab3b01012a369c9d697b2a7e9c3fd64a989`.
- Helper sync PR `#41` đã merge đúng hướng default → feature.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env` hoặc generated artifacts.

## Production boundary

- Không sửa Cloudflare production secrets hoặc DNS.
- Không chạy tenant migration hoặc bật FIFO production.
- `purchase_allocation_rollout_state.enabled` vẫn phải giữ `0` cho tới khi backfill/checksum, staging smoke và explicit approval riêng đều hoàn tất.
- Khi mở helper PR `#41`, Cloudflare Git integration tự đăng bằng chứng Gateway production deployment thành công cho default commit `7da22ab3`; assistant không gọi deploy API hoặc sửa cấu hình Cloudflare. Sự kiện tự động này cần được operator xem lại riêng, không được coi là staging/Browser QA của purchase epic.

## Purchase Order / Purchase Receipt FIFO

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

### Backend lifecycle, settlement và cutover

Đã hoàn thành:

- Cross-voucher allocation/unapplied attribution và migration `0030_purchase_unapplied_weight_attribution.sql`.
- PO submit tự hút Receipt chờ theo FIFO trong cùng mutation plan.
- Settlement close/reverse và manual FIFO override với permission, reason và append-only audit.
- Reverse settlement bị chặn khi cửa sổ kế tiếp trực tiếp đã có activity.
- Backfill planner/CLI, unresolved report, checksum và activation guards.
- Rollout schema dùng đúng `enabled_by` / `enabled_at` và SQL renderer chạy qua migrations thật.

### Operator UI

Đã hoàn thành:

- Server-authoritative FIFO preview trước submit Purchase Receipt.
- PO/Receipt allocation timeline và drill-down từ append-only ledger.
- Close/reverse/manual-override dialogs theo server capabilities, reason bắt buộc và scope confirmation.
- Mutation tạo + submit control document qua DocumentKernel/Durable Object; không có write bypass.
- Sau mutation, document/list/overview bị invalidate và timeline được đọc lại từ server; không optimistic-update ledger.

### Supplier debt report — scoped drill-down

Đã triển khai và qua CI:

- `D1PurchaseSupplierDebtReportService` đọc trực tiếp từ allocation ledger:
  - `purchase_obligation_queues`;
  - `purchase_settlement_windows`;
  - `purchase_window_obligation_entries`;
  - `purchase_receipt_allocation_entries`;
  - `purchase_unapplied_receipt_entries`.
- Không dùng procurement compatibility/progress table làm nguồn sự thật.
- Cột gồm supplier/company/material, ordered, received, allocated, nominal remaining, unapplied Receipt, window/status/tolerance, oldest open PO age và barem/actual weight.
- Report trả `null` khi FIFO rollout disabled.
- Operator timeline gắn `supplier_debt_reports` cho đúng các settlement window đã được permission-checked của chứng từ hiện tại; không mở rộng sang supplier/material không liên quan.
- Dialog `Công nợ NCC` có summary, filter company/supplier/item/status/oldest-open-PO date, responsive overflow và CSV export có phòng chống spreadsheet formula injection.
- Settlement/override refetch timeline nên report snapshot cũng được làm mới.
- Phạm vi hiện tại là drill-down theo các window của PO/Receipt đang mở, chưa phải màn hình global tổng hợp toàn bộ nhà cung cấp.

Files chính:

- `server/packages/document-kernel/src/purchase-supplier-debt-report.ts`.
- `server/packages/document-kernel/src/purchase-allocation-operator-timeline.ts`.
- `server/packages/document-kernel/src/index.ts`.
- `server/tests/purchase-supplier-debt-report.test.mjs`.
- `server/tests/purchase-allocation-operator-timeline.test.mjs`.
- `client/packages/views/src/container/PurchaseSupplierDebtReportDialog.tsx`.
- `client/packages/views/src/container/AllocationTimelineDialog.tsx`.

## Verification

### Report code head `554500502aeff45f75381e195517539eed5b94c2`

- Purchase Feature CI `30622609267`, job `91130424211`: **PASS**.
- PR Validation `30622609247`, job `91130423800`: **PASS**.
- CI `30622609312`, job `91130424161`: **PASS**.
- Production release job `91130425008`: **SKIPPED**.
- Unit, SQL, client tests, typecheck và build: **PASS**.
- Lần chạy trước tại `0ad4ea44...` bắt được lỗi TypeScript `FilterState` thiếu index signature; đã sửa tại `55450050...`.

### Base-sync merge head `ee9ffe8092dedfa3bac496a0efb766a55469c238`

- Purchase Feature CI `30623044989`, job `91131834137`: **PASS**.
- PR Validation `30623044983`, job `91131803690`: **PASS**.
- RBAC helper no-op job `91131804061`: **PASS**, không áp wiring vào purchase branch.
- CI `30623044993`, job `91131855980`: **PASS**.
- Production release job `91131856480`: **SKIPPED**.

## Review

- Review vòng 1 Critical rollout schema mismatch: **RESOLVED**.
- Review vòng 1 High next-window reverse lifecycle: **RESOLVED**.
- Review vòng 2 ID `4827031228` xác nhận hai finding đã đóng.
- PR tiếp tục draft vì còn concurrency/cancel, browser, staging và final rubric.

## Phần còn thiếu trước release gate

1. Interaction/E2E tests cho capability, required reason, success/error/refetch, CSV và mobile/focus behavior.
2. Worker/Durable Object concurrency tests.
3. Production-shaped Receipt cancel lifecycle tests.
4. Quyết định business có cần standalone global supplier-debt screen hay scoped drill-down hiện tại đã đủ.
5. Cloudflare Browser Preview QA desktop `1440x1000` và mobile `390x844`.
6. Staging migrations, backfill dry-run và smoke PO → Receipt → cancel → settlement → report.
7. Review rubric >= 95/100, không còn Critical/High.
8. Backup, rollback plan và explicit production approval riêng trước activation.

## Gate hiện tại

- G0 Scope: **PASS**.
- G1 Requirements: **PASS**.
- G2 Technical plan: **PASS**.
- G3 Tests/typecheck/build: **PASS** trên `ee9ffe80...`.
- G4 Exact-head code/base-sync CI: **PASS** trên `ee9ffe80...`.
- G5 Staging + Browser QA: **NOT STARTED**.
- Production FIFO activation: **NOT ALLOWED**.

## RBAC và Sidebar

- RBAC Slice A đã merge vào default qua PR `#37`.
- RBAC Slice B tiếp tục trên branch/PR riêng; purchase branch chỉ đồng bộ workflow default, không mang wiring payload.
- Sidebar/Gateway production vẫn cần provider evidence và browser smoke riêng; không dùng bot comment thay purchase staging/Browser QA.
