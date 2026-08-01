# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` khi mở Bulk dirty-guard: `e490e2ebd2e8c3cc98e004d4a7c2e394fd07812f` — merge PR `#191` docs hậu Bulk View.
- PR `#190` đã merge Bulk View; PR `#182` đã đóng, không merge và không còn là live source.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn được dùng làm current/default branch và không được coi là chỉ dẫn thực thi.

## IN REVIEW — MetaForge Bulk View dirty guard

- Branch: `fix/metaforge-bulk-dirty-guard-20260802`, tạo sạch từ exact `main@e490e2ebd2e8c3cc98e004d4a7c2e394fd07812f`.
- PR `#192` đang mở draft; scope đúng 2 file UI.
- Exact executable head đã validation: `6e963cda7945567fa330b44a8c5f139c032c3c19`.
- Required workflows trên exact executable head: **6/6 PASS**.
  - CI `30721693001`: tests + typecheck + build SUCCESS.
  - UI Pull Request Validation `30721692982`: frontend lint/build + MetaForge workspace browser QA + Alumdoor browser QA SUCCESS.
  - PR Validation `30721692990`: SUCCESS.
  - Purchase Feature CI `30721692997`: SUCCESS.
  - Sales Feature CI `30721692984`: SUCCESS.
  - Inventory and Manufacturing CI `30721693014`: SUCCESS.
- Root cause: `BulkGridContainer` giữ dirty patch nội bộ nhưng `DoctypeWorkspace` không biết, nên chuyển `Nhập hàng loạt -> Danh sách` có thể unmount grid và mất thay đổi chưa lưu.
- Fix: `BulkGridContainer` phát `onDirtyChange`, cài `beforeunload` guard khi dirty; `DoctypeWorkspace` chặn đổi mode và yêu cầu xác nhận destructive trước khi bỏ patch.
- Save/discard đưa dirty state về false; quyền ghi và optimistic concurrency vẫn giữ nguyên contract của PR #190.
- Không deploy Cloudflare/production, không sửa secret/DNS và không mutate tenant/customer data.
- Handoff docs được cập nhật sau executable validation; final PR head sau docs phải chạy exact-head CI lại trước quyết định merge.

## DONE — MetaForge Bulk View + ALUM master grids

- PR `#190` merged tại `28eb4c4af6f88f0d1c3dc56c8f50e8d31fe2e968`.
- Final validated PR head: `bc75667d1a2078e6483c1a63a4afa1e94bde9de5`.
- Required workflows trên final exact head: **6/6 PASS**.
  - CI `30721227654`: tests + typecheck + build SUCCESS.
  - UI Pull Request Validation `30721227663`: frontend lint/build + MetaForge workspace browser QA + Alumdoor browser QA SUCCESS.
  - PR Validation `30721227676`: SUCCESS.
  - Purchase Feature CI `30721227715`: SUCCESS.
  - Sales Feature CI `30721227669`: SUCCESS.
  - Inventory and Manufacturing CI `30721227651`: SUCCESS.
- PR `#182` được đóng vì diverged/stale status history; không force-push/rewrite history để cứu branch cũ.
- `BulkGridView`/`BulkGridContainer` là renderer metadata-driven dùng chung: row selection, Excel/Google Sheets paste, fill-down, search/paging, discard, optimistic concurrency theo `modified` và lỗi từng dòng.
- `DoctypeWorkspace` có mode `Danh sách | Nhập hàng loạt` khi Bulk policy cho phép; không tạo page riêng theo từng DocType.
- Generic Bulk v1 chỉ hỗ trợ `document_update` trên master an toàn và fail closed với transaction/submittable, child/single, field internal/read-only/server-owned và `read_only_depends_on`.
- Permission/write capability vẫn lấy từ server snapshot; update vẫn đi qua Document API.
- ALUM source metadata `2.1.2` có Bulk config cho UOM, Brand, Manufacturer, Item Color, Material Grade, Material Specification, Item Attribute, Supplier Item, Measurement Profile, Item, Customer, Supplier, Price List, Item Price và Pricing Rule.
- `Item Price` chỉ bulk-edit `rate`, `note`, `disabled`; `price_list`, `item_code`, `uom` giữ read-only để không đổi identity hàng loạt.
- Runtime canonical contract là `viewPolicy.bulk`; large brief ALUM hiện dùng sibling `.views.json` qua compatibility `viewPolicy.mobile.bulk`. First-class short-brief compiler/parser transport vẫn là follow-up hardening.
- Generic Bulk không mass-update stock ledger, công nợ, chứng từ đã submit, BOM child rows hoặc tree hierarchy.
- Không deploy Cloudflare/production, không sửa secret/DNS và không mutate tenant/customer data.

## DONE — MetaForge Document Experience V2 foundation

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Final validated PR head: `1a79c28832aed7731601bb9ea378f9a4a3cc01db`.
- Required workflows: **6/6 PASS**.
- Có 7 archetype (`master`, `transaction`, `inventory`, `production`, `approval`, `ledger`, `analysis`) + generic fallback, document hero, semantic status, metric cards, context strip/rail và skeleton loading.
- Presentation resolver chỉ dùng field còn tồn tại sau canonical form policy; permission/workflow/actions vẫn server-authoritative.
- Không deploy production trong slice này.

## DONE — Runbook / project-status cleanup

- PR `#180` merged tại `09bc64e1fe8d9ded171368cfc72bd2b4b18aed72`.
- Final validated PR head: `1a631bae15637c39d06244dc8a3d8bb05eb5ecb0`.
- Exact-head required workflows: **6/6 PASS**.
- `RUNBOOK.md` là operating runbook canonical; `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` giữ vai trò live status/queue/handoff riêng biệt.

## DONE — Authenticated reservation availability lifecycle

- PR `#175` merged tại `509db8c32625168316696fb0deb3760a434aedf9`.
- Final validated PR head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Exact-head required workflows: **6/6 PASS**.
- Reservation giảm available stock nhưng không thay physical stock; release phục hồi available; over-reservation và double-release fail đúng contract.
- Desktop/mobile, role nghiệp vụ, cookie + CSRF thật PASS trên local D1 ephemeral.

## Capability đã khóa bằng merged evidence

### MetaForge / Meta boundary

- PR `#164`: canonical first-party Meta boundary — merged.
- PR `#176`: canonical Form Renderer policy — merged, exact-head required workflows 6/6 PASS.
- PR `#184`: Document Experience V2 foundation — merged, exact-head required workflows 6/6 PASS.
- PR `#190`: safe Bulk View + ALUM master grids — merged, exact-head required workflows 6/6 PASS.
- `resolveFormRenderPolicy()` là canonical form composition point; `surface=internal` là hard visibility boundary.
- `resolveBulkRenderPolicy()` là canonical Bulk composition point cho master-safe document updates.

### Inventory / stock

- PR `#167`: authenticated stock lifecycle + mobile canonical contracts — merged.
- PR `#170`: Stock Entry operational submit RBAC — merged.
- PR `#173`: physical stock catch-weight reconciliation — merged.
- PR `#175`: authenticated reservation/available-stock lifecycle — merged.
- PR `#189` hiện là clean active PR cho QR/lineage + cleanup QA P0; chưa tính DONE cho tới khi merge/evidence hoàn tất.

### Sales / Purchase

- Sales-to-Production PR `#131` — merged.
- Tiến Đạt purchase FIFO PR `#134` — merged.
- Purchase authenticated QA PR `#137` — merged.

Không được suy từ các mục DONE này rằng toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

## Production boundary

Checkpoint production lịch sử gần nhất được handoff ghi nhận:

- Alumdoor production exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Meta installer run `30707517624`: PASS.
- Alumdoor Meta tại checkpoint đó: `2.1.0`.

Đây là checkpoint lịch sử, không phải bằng chứng provider hiện tại. Source ALUM đã tiến tới `2.1.2`, nhưng không được suy ra production đã được cài version này. Không deploy Cloudflare hoặc sửa production state nếu user chưa yêu cầu rõ.

## Chưa hoàn tất toàn hệ thống

1. P0 stock acceptance: PR `#189` QR/lineage end-to-end + cleanup QA đang active.
2. MetaForge UX V2: List Workspace V2 tích hợp Bulk, Matrix View, presentation authoring/canonical transport, document context/exception, operational workspace, mobile V2 và personalization/AI context.
3. Bulk Transaction strategy cho Stock Reconciliation/BOM và transaction-grid nhập nhôm nhiều mã chưa triển khai.
4. P1 daily detailed ledger: snapshot, freeze, append-only adjustment, reconciliation nhiều miền.
5. P2 warranty/defects/capacity/overtime.
6. P3 authenticated end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- GitHub là nguồn sự thật; không dựa vào lịch sử chat để chọn branch/SHA.
- Một epic/đợt sửa độc lập dùng một branch/PR canonical.
- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu chưa có lệnh rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
