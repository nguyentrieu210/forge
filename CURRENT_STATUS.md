# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` sau Tiến Đạt FIFO complete operations UI: `e44ade8ca1ab396a66b800844b755de203be9245` — merge PR `#179`.
- PR `#182` đã đóng, không merge; PR `#190` là branch/PR canonical thay thế cho Bulk View.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn được dùng làm current/default branch và không được coi là chỉ dẫn thực thi.

## DONE — Tiến Đạt FIFO complete operations UI

- PR `#179` merged tại `e44ade8ca1ab396a66b800844b755de203be9245`.
- Final validated PR head: `f8efd5bbf26a398b5a369a453cbbe02ad92ac53f`.
- Required workflows trên final exact head: **6/6 PASS**.
  - CI `30721663514`: tests + typecheck + build SUCCESS.
  - UI Pull Request Validation `30721663479`: frontend lint/build + MetaForge workspace browser QA + Alumdoor browser QA + purchase allocation browser QA + authenticated Purchase/FIFO desktop/mobile SUCCESS.
  - PR Validation `30721663531`: SUCCESS.
  - Purchase Feature CI `30721663482`: SUCCESS.
  - Sales Feature CI `30721663496`: SUCCESS.
  - Inventory and Manufacturing CI `30721663523`: SUCCESS.
- Màn `/x/action:nhap-nhom-fifo` là UI thao tác thật: form nhập nhà cung cấp, mã hàng, chiều dài, số cây, kg thực, đơn giá, màu, dập, kho và thông tin giao hàng.
- Kết quả preview không còn rơi xuống JSON/key-value: có KPI **Công nợ giao hàng sau lần nhận** và các bảng **Đơn còn nợ**, **Lịch sử trừ FIFO lần này**, **Lịch sử hàng về**, **Dòng phiếu nhập sẽ tạo**.
- Purchase Order/Purchase Receipt trong bảng bấm mở được; sau commit có thể mở thẳng phiếu nhập nháp vừa tạo.
- Authenticated QA khóa case `200 + 100`, nhận `230` → `200 + 30`, còn nợ `70` cây, biên giao thêm hợp lệ `55–85`; submit receipt rồi preview lại thấy receipt trong lịch sử UI.
- Link Supplier/Item/Color/Warehouse chạy bằng search thật; Warehouse QA `K36` được seed qua public resource API, không ghi tắt trực tiếp D1.
- Locale Việt `#.###,##` được khóa bằng input `7,2` / `7,25`; bảng kết quả responsive và không làm tràn viewport mobile.
- Một lần UI gate trên head rebase trước đó gặp Wrangler local flake làm tenant dev process chết sau khi FIFO desktop đã chạy trọn luồng; rerun cùng exact head PASS. Final head `f8efd5bb...` sau đó PASS ngay 6/6 và được merge.
- Không deploy Cloudflare/production, không sửa secret/DNS và không mutate tenant/customer data. Production chưa có UI này cho tới release riêng được yêu cầu.

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
- PR `#173`: physical-stock catch-weight reconciliation — merged.
- PR `#175`: authenticated reservation/available-stock lifecycle — merged.
- PR `#189` hiện là clean active PR cho QR/lineage + cleanup QA P0; chưa tính DONE cho tới khi merge/evidence hoàn tất.

### Sales / Purchase

- Sales-to-Production PR `#131` — merged.
- Tiến Đạt purchase FIFO PR `#134` — merged.
- Purchase authenticated QA PR `#137` — merged.
- Tiến Đạt FIFO complete operations UI PR `#179` — merged, final exact-head required workflows 6/6 PASS.

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
