# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` đã xác minh khi tiếp tục MetaForge Document Experience V2: `2d0d4ab871714d84ba015afcd8e4797623bad558`.
- Last executable merge trước các docs-only merge ở checkpoint runbook: PR `#175`, merge `509db8c32625168316696fb0deb3760a434aedf9`.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn được dùng làm current/default branch và không được coi là chỉ dẫn thực thi.

## IN REVIEW — MetaForge Document Experience V2 foundation

- Branch: `feat/metaforge-document-experience-v2-20260802`, tạo sạch từ exact `main@2d0d4ab871714d84ba015afcd8e4797623bad558`.
- PR `#184` đang mở, **ready for review**, mergeable và chưa merge.
- Bulk View PR `#182` vẫn là draft và tại lần xác minh gần nhất chưa mergeable; #184 không chạm `DoctypeWorkspace`/core meta types của #182.
- Exact executable head đã validation sau archetype hardening: `ec90b1b4e698c03be566c4c93b2942dd2aaafcbb`.
- Required workflows trên exact executable head: **6/6 PASS**.
  - CI `30720247529`: tests, typecheck, build SUCCESS.
  - UI Pull Request Validation `30720247521`: frontend lint/build, MetaForge workspace browser QA và Alumdoor browser QA SUCCESS; purchase-auth lifecycle không thuộc scope diff nên skipped.
  - PR Validation `30720247541`: SUCCESS.
  - Purchase Feature CI `30720247535`: SUCCESS.
  - Sales Feature CI `30720247517`: SUCCESS.
  - Inventory and Manufacturing CI `30720247522`: SUCCESS.
- Document Experience V2 có 7 archetype (`master`, `transaction`, `inventory`, `production`, `approval`, `ledger`, `analysis`) + generic fallback; document hero, semantic status, metric cards, responsive context strip/rail và skeleton loading.
- Archetype không còn chỉ khác icon/eyebrow: mỗi archetype có visual profile riêng cho accent, hero treatment, icon, metric surface và context-rail copy; root có `data-archetype` để QA/styling ổn định.
- Regression selfcheck khóa 6 reference screens: `Sales Order`, `Purchase Order`, `Stock Entry`, `Work Order`, `Customer`, `Payment Entry`; kiểm tra archetype, metric/context selection và visual-profile differentiation.
- Presentation resolver chỉ đọc field còn tồn tại trong Meta sau `resolveFormRenderPolicy()`, vì vậy cấu hình presentation không thể kéo field `surface=internal`/server-owned quay lại UI.
- Permission, workflow, submit/cancel/delete/rename và server-authoritative capability vẫn do `FormContainer`/adapter hiện hữu kiểm soát; slice này chỉ thay presentation layer.
- Lần validation đầu trên head `081033d8...` bắt lỗi fixture `Doc` thiếu `doctype` và TypeScript inference của metric fallback; đã sửa trên cùng branch rồi validation lại xanh hoàn toàn.
- Không deploy Cloudflare/production, không sửa secret/DNS và không mutate tenant/customer data.
- Commit status/handoff sau executable validation sẽ làm PR head đổi; final exact-head CI phải PASS lại trước mọi quyết định merge.

## DONE — Runbook / project-status cleanup

- PR `#180` merged tại `09bc64e1fe8d9ded171368cfc72bd2b4b18aed72`.
- Final validated PR head: `1a631bae15637c39d06244dc8a3d8bb05eb5ecb0`.
- Exact-head required workflows: **6/6 PASS**.
  - CI `30719225066`: SUCCESS.
  - UI Pull Request Validation `30719225037`: SUCCESS.
  - PR Validation `30719225059`: SUCCESS.
  - Purchase Feature CI `30719225048`: SUCCESS.
  - Sales Feature CI `30719225040`: SUCCESS.
  - Inventory and Manufacturing CI `30719225056`: SUCCESS.
- `RUNBOOK.md` là operating runbook canonical.
- `CURRENT_STATUS.md` là live snapshot canonical; `NEXT_TASKS.md` là active queue; `AI_HANDOFF.md` chỉ giữ handoff kỹ thuật.
- `README.md` không còn tự đóng vai live status.
- `docs/ROADMAP.md` đã gắn `NOT LIVE STATUS` và chỉ giữ hướng chiến lược.
- `DELIVERY_POLICY.md` đã tách merge khỏi production authorization.
- `EPIC_STATUS.md` stale đã bị xóa; code search không còn reference tới file này hoặc branch `hotfix/alumdoor-print-list-delete`.
- Diff PR #180 chỉ gồm 8 file docs; không chạm executable code, Cloudflare, production secrets/DNS hoặc tenant data.

## DONE — Authenticated reservation availability lifecycle

- PR `#175` merged tại `509db8c32625168316696fb0deb3760a434aedf9`.
- Final validated PR head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Exact-head required workflows: **6/6 PASS**.
  - CI `30718759652`: tests/typecheck/build PASS.
  - UI Pull Request Validation `30718759696`: frontend lint/build + browser QA + authenticated cookie/CSRF reservation lifecycle PASS.
  - PR Validation `30718759665`: PASS.
  - Purchase Feature CI `30718759676`: PASS.
  - Sales Feature CI `30718759661`: PASS.
  - Inventory and Manufacturing CI `30718759660`: PASS.
- Reservation giảm available stock nhưng không thay physical stock; over-reservation trả available đúng; release phục hồi available; double-release/terminal mutation fail theo Frappe 417 contract.
- Desktop/mobile, role nghiệp vụ, cookie + CSRF thật PASS trên local D1 ephemeral.
- Không deploy production trong slice này.

## Capability đã khóa bằng merged evidence

### MetaForge / Meta boundary

- PR `#164`: canonical first-party Meta boundary — merged.
- PR `#176`: canonical Form Renderer policy — merged, final exact-head required workflows 6/6 PASS.
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

1. MetaForge UX V2 còn List Workspace/saved views/smart filters, presentation authoring/sidecar, related-document/activity/exception và các lớp operational/personalization/mobile sâu hơn; List Workspace phải phối hợp với Bulk View PR `#182` thay vì ghi đè song song.
2. P0 stock acceptance còn QR/lineage end-to-end và cleanup QA không residue.
3. P1 daily detailed ledger: snapshot, freeze, append-only adjustment, reconciliation nhiều miền.
4. P2 warranty/defects/capacity/overtime.
5. P3 authenticated end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- GitHub là nguồn sự thật; không dựa vào lịch sử chat để chọn branch/SHA.
- Một epic/đợt sửa độc lập dùng một branch/PR canonical.
- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu chưa có lệnh rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
