# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- `main` HEAD sau đợt runbook cleanup: `09bc64e1fe8d9ded171368cfc72bd2b4b18aed72` — merge PR `#180`.
- Last executable merge trước các docs-only merge: PR `#175`, merge `509db8c32625168316696fb0deb3760a434aedf9`.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn được dùng làm current/default branch và không được coi là chỉ dẫn thực thi.

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

1. P0 stock acceptance còn QR/lineage end-to-end và cleanup QA không residue.
2. P1 daily detailed ledger: snapshot, freeze, append-only adjustment, reconciliation nhiều miền.
3. P2 warranty/defects/capacity/overtime.
4. P3 authenticated end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- GitHub là nguồn sự thật; không dựa vào lịch sử chat để chọn branch/SHA.
- Một epic/đợt sửa độc lập dùng một branch/PR canonical.
- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu chưa có lệnh rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
