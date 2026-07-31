# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace chuẩn: `C:\Forge`.

## Git và nguyên tắc vận hành

- Repository: `nguyentrieu210/forge`.
- Default/base branch: `hotfix/alumdoor-print-list-delete`.
- Branch RBAC: `feat/rbac-permission-completion-20260731`.
- Draft PR RBAC: `#22`.
- Không commit `.env`, `server/work/`, `tmp`, backup SQL hoặc generated artifacts.
- Không deploy Cloudflare, sửa production secrets hoặc bật FIFO nếu chưa có yêu cầu riêng.

## Production/Gateway hiện hành

- Sidebar desktop gọn tại commit `87cd45aa9272f5600ff3d5914f697ce9a26994b6`.
- Gateway release trigger: `9a7bbc14b8e7f3e556404cce19914da1e21e5e10`.
- Baseline code/schema FIFO đã qua CI: `591ca359937d6ae12803d36c74996db8482060af`, workflow `30570000862`, job `90964015638`.
- Còn thiếu provider evidence mới nhất cho Gateway deployment/version ID và browser smoke production.
- FIFO production vẫn phải giữ **disabled**.

## FIFO Purchase Receipt

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

Đã có schema/migrations `0027`–`0029`, canonical material key, supplier coordinator, atomic D1 persistence, PO obligation, Receipt FIFO allocation, reversal khi cancel và rollout gate mặc định tắt.

Blocker trước activation production:

1. Apply unapplied quantity khi PO mới gia nhập window.
2. Settlement close/reverse, manual override, permission và reason.
3. Backfill/checksum/unresolved report và activation transaction.
4. UI preview/timeline/report.
5. D1 latency/contention tests.
6. Staging migration/backfill/smoke và production backup mới.

## RBAC và data scope

Tài liệu authoritative:

- `server/docs/RBAC-PERMISSION-BRD.md` — **APPROVED G1**.
- `server/docs/RBAC-PERMISSION-IMPLEMENTATION-PLAN.md` — **APPROVED G2**.

Quyết định đã duyệt:

- **D1=A:** giữ `Administrator`/`System Manager` là tenant superadmin để tương thích; Slice B phải thêm last-admin, self-lockout, audit và test.
- **D2=A:** DocPerm do app/platform sở hữu; Permission Center chỉ đọc.
- **D3=A:** User Permission exact-value; từ chối `hide_descendants=true` tới khi có hierarchy contract.

### Slice A đã triển khai

Implementation commit:

`ab974f92ffbcf015fb71d3051df33508c9f09942` — `feat(rbac): complete permission inspection contract`

File runtime/test chính:

- `server/packages/frappe-api/src/access-control.ts`
- `server/packages/frappe-api/src/router.ts`
- `server/packages/frappe-api/src/index.ts`
- `server/tests/rbac-contract.test.mjs`
- `client/packages/adapter-frappe/src/adapter.ts`
- `client/packages/adapter-frappe/src/frappe-adapter.ts`
- `client/packages/views/src/access/PermissionCenter.tsx`

Hành vi đã sửa:

1. `explain_permission(user=B)` resolve B từ `D1UserStore`, dùng đúng roles/scope của B và không nhận role giả từ browser.
2. Non-admin không được inspect user khác; user không tồn tại hoặc disabled không rơi về actor admin.
3. Capability và `trace` được tính từ cùng permission evaluator.
4. Access profile trả stable User Permission id.
5. Add/profile/remove scope dùng cùng composite identity; adapter xoá bằng `{ id }`.
6. `hide_descendants=true` bị từ chối rõ ràng.
7. Client dùng fallback `trace ?? []` và không crash khi trace rỗng.
8. Frappe contract version tăng từ `16.0.0-forge.2` lên `16.0.0-forge.3`.

### Gate Slice A

Workflow run: `30612014393`  
Successful job: `91101823154`

- Patch/apply: **PASS**.
- Install: **PASS**.
- Server tests: **PASS** — 566 tests và SQL suite.
- Root typecheck: **PASS**.
- Root build: **PASS**.
- Commit/push implementation: **PASS**.

Temporary workflows, pretest hook và placeholder façade/tests đã được xoá sau khi implementation hạ cánh. Root `server:test` đã được khôi phục về lệnh chuẩn.

### Gate hiện tại

- G0 scope: **PASS**.
- G1 requirements: **PASS**.
- G2 implementation plan: **PASS**.
- Slice A implementation/tests/typecheck/build: **PASS**.
- Exact-head verification sau cleanup và status update: **chưa chạy**.
- Browser/staging QA: **chưa chạy**.
- PR vẫn draft; chưa merge và chưa deploy.

## Việc tiếp theo

1. Chạy exact-head test/typecheck/build sau cleanup tài liệu.
2. Review diff PR #22 để loại toàn bộ file điều phối tạm khỏi final diff.
3. Thực hiện Slice B: atomic user+roles, last-admin/self-lockout guard và append-only audit.
4. Sau Slice B/C mới làm staging/browser QA; production vẫn ngoài phạm vi.
