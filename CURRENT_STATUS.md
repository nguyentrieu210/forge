# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` hiện tại khi đồng bộ Bulk View: `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a` — merge PR `#184` MetaForge Document Experience V2.
- Branch Bulk View: `feat/metaforge-bulk-view-v2-20260802`, PR `#182`.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn được dùng làm current/default branch và không được coi là chỉ dẫn thực thi.

## DONE — MetaForge Document Experience V2 foundation

- PR `#184` đã merge vào `main` tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Document Experience V2 có 7 archetype (`master`, `transaction`, `inventory`, `production`, `approval`, `ledger`, `analysis`) + generic fallback; document hero, semantic status, metric cards, responsive context strip/rail và skeleton loading.
- Presentation resolver chỉ đọc field còn tồn tại sau canonical form policy, vì vậy `surface=internal`/server-owned field không bị kéo trở lại UI.
- Permission, workflow, submit/cancel/delete/rename và server-authoritative capability vẫn do `FormContainer`/adapter hiện hữu kiểm soát.
- Không deploy Cloudflare/production trong slice này.

## READY / REVALIDATING — MetaForge Bulk View + ALUM master grids

- PR `#182`: `feat(meta): add safe Bulk View and Alumdoor master grids`.
- Trước khi `main` nhận PR #184, exact head `4b195d3500aa66b3b9da1e412e094c30027cc568` đã required workflows **6/6 PASS**:
  - CI `30720437670`: tests + typecheck + build PASS.
  - UI Pull Request Validation `30720437647`: frontend lint/build + MetaForge workspace browser QA + Alumdoor browser QA PASS.
  - PR Validation `30720437654`: PASS.
  - Purchase Feature CI `30720437641`: PASS.
  - Sales Feature CI `30720437627`: PASS.
  - Inventory and Manufacturing CI `30720437653`: PASS.
- PR #184 chỉ tạo conflict tài liệu ở `CURRENT_STATUS.md` và `NEXT_TASKS.md`; executable Bulk code không bị chồng bởi Document Experience V2.
- Hai file canonical status đang được đồng bộ lại với current `main`; exact PR head mới phải chạy lại required workflows trước merge.
- Bulk View là renderer metadata-driven dùng chung: row selection, paste vùng từ Excel/Google Sheets, fill-down, paging/search, discard, lỗi theo dòng và optimistic concurrency qua `modified`.
- Generic `document_update` fail closed với transaction/submittable, child/single và field internal/read-only/server-owned; field có `read_only_depends_on` cũng không được sửa trong Bulk v1.
- `DoctypeWorkspace` có `Danh sách | Nhập hàng loạt` khi metadata bật Bulk View.
- ALUM source metadata `2.1.2` cấu hình Bulk cho UOM, Brand, Manufacturer, Item Color, Material Grade/Specification, Item Attribute, Supplier Item, Measurement Profile, Item, Customer, Supplier, Price List, Item Price và Pricing Rule.
- `Item Price` chỉ cho bulk sửa `rate`, `note`, `disabled`; `price_list/item_code/uom` là khóa nhận diện chỉ đọc.
- Generic Bulk không sửa stock ledger, công nợ, chứng từ submit, BOM child rows hoặc cây kho/nhóm hàng.
- Large brief hiện dùng sibling `.views.json` compatibility transport; runtime ưu tiên canonical `viewPolicy.bulk`. First-class short-brief compiler/parser transport vẫn là follow-up hardening.
- Không deploy Cloudflare/production, không sửa production secrets/DNS và không mutate tenant production.

## DONE — Runbook / project-status cleanup

- PR `#180` merged tại `09bc64e1fe8d9ded171368cfc72bd2b4b18aed72`.
- Final validated PR head: `1a631bae15637c39d06244dc8a3d8bb05eb5ecb0`.
- Exact-head required workflows: **6/6 PASS**.
- `RUNBOOK.md` là operating runbook canonical.
- `CURRENT_STATUS.md` là live snapshot canonical; `NEXT_TASKS.md` là active queue; `AI_HANDOFF.md` chỉ giữ handoff kỹ thuật.
- `README.md` và `docs/ROADMAP.md` không phải live status; `DELIVERY_POLICY.md` tách merge khỏi production authorization.

## DONE — Authenticated reservation availability lifecycle

- PR `#175` merged tại `509db8c32625168316696fb0deb3760a434aedf9`.
- Final validated PR head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Exact-head required workflows: **6/6 PASS**.
- Reservation giảm available stock nhưng không thay physical stock; over-reservation trả available đúng; release phục hồi available; double-release/terminal mutation fail theo Frappe 417 contract.
- Desktop/mobile, role nghiệp vụ, cookie + CSRF thật PASS trên local D1 ephemeral.

## Capability đã khóa bằng merged evidence

### MetaForge / Meta boundary

- PR `#164`: canonical first-party Meta boundary — merged.
- PR `#176`: canonical Form Renderer policy — merged, final exact-head required workflows 6/6 PASS.
- PR `#184`: Document Experience V2 foundation — merged.
- `resolveFormRenderPolicy()` dùng chung cho existing/full/quick Form; `viewPolicy` được runtime thực thi; `surface=internal` là hard visibility boundary.
- Bulk View PR `#182` chưa được tính là merged capability cho tới khi merge thật.

### Inventory / stock

- PR `#167`: authenticated stock lifecycle + mobile canonical contracts — merged.
- PR `#170`: Stock Entry operational submit RBAC — merged.
- PR `#173`: physical-stock catch-weight reconciliation — merged.
- PR `#175`: authenticated reservation/available-stock lifecycle — merged.

### Sales / Purchase

- Sales-to-Production PR `#131` — merged.
- Tiến Đạt purchase FIFO PR `#134` — merged.
- Purchase authenticated QA PR `#137` — merged.

Không được suy từ các mục DONE này rằng toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

## Production boundary

Checkpoint production lịch sử gần nhất được handoff ghi nhận:

- Alumdoor production exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Alumdoor Meta tại checkpoint đó: `2.1.0`.

Đây là checkpoint lịch sử, không phải bằng chứng provider hiện tại. Phải xác minh lại GitHub/provider trước mọi quyết định production. Không deploy Cloudflare hoặc sửa production state nếu user chưa yêu cầu rõ.

## Chưa hoàn tất toàn hệ thống

1. Bulk View PR `#182` cần exact-head CI sau sync với current `main`, sau đó merge khi gate xanh.
2. MetaForge UX V2 wave kế tiếp: List Workspace V2 tích hợp Bulk View; Matrix View là primitive tiếp theo cho dữ liệu quan hệ nhiều chiều.
3. P0 stock acceptance còn QR/lineage end-to-end và cleanup QA không residue.
4. P1 daily detailed ledger: snapshot, freeze, append-only adjustment, reconciliation nhiều miền.
5. P2 warranty/defects/capacity/overtime.
6. P3 authenticated end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- GitHub là nguồn sự thật; không dựa vào lịch sử chat để chọn branch/SHA.
- Một epic/đợt sửa độc lập dùng một branch/PR canonical.
- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu chưa có lệnh rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
