# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` sau MetaForge Document Experience V2: `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a` — merge PR `#184`.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn được dùng làm current/default branch và không được coi là chỉ dẫn thực thi.

## DONE — MetaForge Document Experience V2 foundation

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Final validated PR head: `1a79c28832aed7731601bb9ea378f9a4a3cc01db`.
- Required workflows trên final exact head: **6/6 PASS**.
  - CI `30720428475`: tests, typecheck, build SUCCESS.
  - UI Pull Request Validation `30720428440`: frontend lint/build, MetaForge workspace browser QA và Alumdoor browser QA SUCCESS; purchase-auth path skipped đúng scope diff.
  - PR Validation `30720428457`: SUCCESS.
  - Purchase Feature CI `30720428468`: SUCCESS.
  - Sales Feature CI `30720428471`: SUCCESS.
  - Inventory and Manufacturing CI `30720428447`: SUCCESS.
- Document Experience V2 có 7 archetype (`master`, `transaction`, `inventory`, `production`, `approval`, `ledger`, `analysis`) + generic fallback.
- Mỗi archetype có visual profile riêng cho accent, hero treatment, icon, metric surface và context-rail copy; root có `data-archetype` để QA/styling ổn định.
- Presentation resolver chỉ đọc field còn tồn tại trong Meta sau `resolveFormRenderPolicy()`, vì vậy presentation không thể kéo field `surface=internal`/server-owned quay lại UI.
- Regression selfcheck khóa 6 reference screens: `Sales Order`, `Purchase Order`, `Stock Entry`, `Work Order`, `Customer`, `Payment Entry`.
- Permission, workflow, submit/cancel/delete/rename và server-authoritative capability vẫn do Form/adapter hiện hữu kiểm soát; PR #184 chỉ thay presentation layer.
- Không deploy Cloudflare/production, không sửa secret/DNS và không mutate tenant/customer data.

## DONE — Runbook / project-status cleanup

- PR `#180` merged tại `09bc64e1fe8d9ded171368cfc72bd2b4b18aed72`.
- Final validated PR head: `1a631bae15637c39d06244dc8a3d8bb05eb5ecb0`.
- Exact-head required workflows: **6/6 PASS**.
- `RUNBOOK.md` là operating runbook canonical.
- `CURRENT_STATUS.md` là live snapshot canonical; `NEXT_TASKS.md` là active queue; `AI_HANDOFF.md` chỉ giữ handoff kỹ thuật.

## DONE — Authenticated reservation availability lifecycle

- PR `#175` merged tại `509db8c32625168316696fb0deb3760a434aedf9`.
- Final validated PR head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Exact-head required workflows: **6/6 PASS**.
- Reservation giảm available stock nhưng không thay physical stock; over-reservation trả available đúng; release phục hồi available; double-release/terminal mutation fail theo Frappe 417 contract.
- Desktop/mobile, role nghiệp vụ, cookie + CSRF thật PASS trên local D1 ephemeral.
- Không deploy production trong slice này.

## Capability đã khóa bằng merged evidence

### MetaForge / Meta boundary

- PR `#164`: canonical first-party Meta boundary — merged.
- PR `#176`: canonical Form Renderer policy — merged, final exact-head required workflows 6/6 PASS.
- PR `#184`: Document Experience V2 foundation — merged, final exact-head required workflows 6/6 PASS.
- `resolveFormRenderPolicy()` dùng chung cho existing/full/quick Form; `viewPolicy` được runtime thực thi; `surface=internal` là hard visibility boundary.

### Inventory / stock

- PR `#167`: authenticated stock lifecycle + mobile canonical contracts — merged.
- PR `#170`: Stock Entry operational submit RBAC — merged.
- PR `#173`: physical-stock catch-weight reconciliation — merged.
- PR `#175`: authenticated reservation/available-stock lifecycle — merged.
- Receipt/issue/transfer/reconciliation/reservation đã có authenticated local D1 evidence cho quantity, weight, available stock, permission và lineage foundation.

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

Đây là checkpoint lịch sử, không phải bằng chứng provider hiện tại. Phải xác minh lại GitHub/provider trước mọi quyết định production. Không deploy Cloudflare hoặc sửa production state nếu user chưa yêu cầu rõ.

## Chưa hoàn tất toàn hệ thống

1. MetaForge UX V2 còn List Workspace/saved views/smart filters, presentation authoring/canonical transport, related-document/activity/exception, operational workspace, personalization và mobile V2.
2. Bulk View PR `#182` vẫn phải được xác minh lại sau merge #184 trước khi dùng làm dependency cho List Workspace V2.
3. P0 stock acceptance còn QR/lineage end-to-end và cleanup QA không residue.
4. P1 daily detailed ledger: snapshot, freeze, append-only adjustment, reconciliation nhiều miền.
5. P2 warranty/defects/capacity/overtime.
6. P3 authenticated end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- GitHub là nguồn sự thật; không dựa vào lịch sử chat để chọn branch/SHA.
- Một epic/đợt sửa độc lập dùng một branch/PR canonical.
- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu chưa có lệnh rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
