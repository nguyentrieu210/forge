# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- `main` HEAD đã xác minh khi đồng bộ branch cleanup lần cuối: `3222beb66bd3e6b2abbab1b17a6009044a2d5358` — merge PR `#181` docs evidence sau reservation acceptance.
- Last executable merge trước docs-only evidence: PR `#175`, merge `509db8c32625168316696fb0deb3760a434aedf9`.
- Branch cleanup hiện tại: `chore/runbook-status-cleanup`, PR `#180`, base đã đồng bộ từ `main@3222beb6...`.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn được dùng làm current/default branch và không được coi là chỉ dẫn thực thi.

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
- Tracked receipt 10 cây có Batch/Bundle thật; giữ 6 làm available còn 4 nhưng physical stock vẫn 10.
- Over-reservation bị từ chối với available đúng; release phục hồi available; giữ đủ 10 đưa available về 0.
- Double-release và terminal-state reversal bị từ chối theo Frappe 417 contract.
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

## ACTIVE — PR #180 docs/runbook cleanup

Mục tiêu: dọn lớp tài liệu điều phối để AI/agent không đọc snapshot cũ thành live state.

Đã áp dụng trên branch:

- thêm `RUNBOOK.md` làm quy tắc vận hành canonical;
- rút gọn `AI_HANDOFF.md` về handoff kỹ thuật;
- sửa `DELIVERY_POLICY.md`: merge và production deploy là hai authorization boundary riêng;
- đổi `docs/ROADMAP.md` thành strategic document có nhãn `NOT LIVE STATUS`;
- đổi `README.md` để chỉ dẫn tới runbook/status/tasks thay vì chứa live progress;
- xoá `EPIC_STATUS.md` vì chứa default branch và epic queue đã lỗi thời;
- đồng bộ branch lại trên current main sau khi PR #175 và PR #181 merge.

Đây là docs-only cleanup; không chạm executable code, Cloudflare, production secrets/DNS hoặc tenant data.

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
