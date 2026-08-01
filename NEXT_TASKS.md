# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. Không dùng file này thay cho GitHub khi cần exact branch head, PR state hoặc CI. Trước khi làm đọc `RUNBOOK.md` và `CURRENT_STATUS.md`.

## ACTIVE UI — hoàn tất PR #184 Document Experience V2 foundation

Branch canonical của slice này: `feat/metaforge-document-experience-v2-20260802`.

Đã hoàn tất executable slice:

- presentation resolver an toàn với 7 archetype + generic fallback;
- document hero, semantic status, metric cards, responsive context strip/rail và skeleton loading;
- existing `FormContainer` dùng Document Experience nhưng giữ nguyên canonical form policy, server-authoritative permission/workflow/action;
- selfcheck khóa archetype, explicit presentation, internal-field boundary, progress, status tone và formatting;
- exact executable head `48c23dd36ac8c9d2f24307a00556e46738db2f12` đã **6/6 PASS**, gồm tests/typecheck/build và MetaForge + Alumdoor browser QA.

Việc còn lại của chính PR `#184`:

1. Chạy lại exact-head required CI sau commit handoff docs.
2. Giữ PR draft/không merge cho tới khi có quyết định merge riêng sau khi final exact-head xanh.
3. Không thêm List Workspace vào PR này vì Bulk View PR `#182` đang chạm `DoctypeWorkspace` và core meta types.

## NEXT UI — MetaForge UX V2 wave kế tiếp

Chỉ bắt đầu trên branch mới từ exact `main` sau khi PR `#184` kết thúc và trạng thái PR `#182` được xác minh lại trên GitHub.

Ưu tiên:

1. **List Workspace V2**: summary bar, saved views, smart filters, table/card responsive, contextual quick actions; tích hợp Bulk View thay vì tạo navigation cạnh tranh.
2. **Presentation authoring/canonical transport**: đưa presentation contract từ runtime extension thành authorable metadata/sidecar có compiler/parser/selfcheck rõ ràng.
3. **Reference screens**: Sales Order, Purchase Order, Stock Entry, Work Order, Customer, Payment Entry phải thể hiện khác archetype nhưng cùng dùng engine.
4. **Document context nâng cao**: related-document graph, activity/timeline, exception cards và nghiệp vụ progress source thật thay vì chỉ explicit status steps.
5. **Mobile V2**: rich list cards, context drawer/bottom sheet và action zone phù hợp màn nhỏ.

Không mở wave List V2 bằng cách sửa thẳng branch PR `#182`; mỗi epic/slice dùng branch/PR riêng.

## DONE — Runbook / project-status cleanup

- PR `#180` merged tại `09bc64e1fe8d9ded171368cfc72bd2b4b18aed72`.
- Final validated head: `1a631bae15637c39d06244dc8a3d8bb05eb5ecb0`.
- Exact-head required workflows: **6/6 PASS**.
- `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` đã có vai trò rõ ràng.
- `README.md` và `docs/ROADMAP.md` không còn là live-state source.
- `DELIVERY_POLICY.md` không tự cấp quyền deploy production.
- `EPIC_STATUS.md` stale đã bị xóa.

Không tạo thêm status/handoff file song song nếu nội dung thuộc các file canonical này.

## DONE — PR #175 Reservation acceptance

- Merged: `509db8c32625168316696fb0deb3760a434aedf9`.
- Final validated head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Exact-head required workflows: **6/6 PASS**.
- Reservation giảm available nhưng không thay physical stock; release phục hồi available; over-reservation và double-release fail đúng contract.
- Không deploy production.

Không mở lại reservation slice nếu không có regression cụ thể.

## NEXT P0 — QR / lineage + cleanup QA

Engineering task kế tiếp của stock acceptance là QR/lineage + cleanup QA. Khi bắt đầu, tạo branch mới từ exact current `main` sau khi kiểm tra GitHub/CI.

### QR / lineage

- Dùng item theo lô, Batch và Serial and Batch Bundle thật từ authenticated lifecycle.
- Physical-stock report `include_lineage=true` truy đúng voucher type/name, voucher row, batch, bundle, warehouse và item identity.
- Tạo identity thứ hai để chứng minh lineage không lẫn giữa hai luồng.
- Stock Reconciliation print render thật; QR sinh từ đúng document `name` và route mở đúng document.
- Sai QR/document identity hoặc lineage tenant khác phải fail closed.

### Cleanup QA

- QA user/item/warehouse/batch/bundle/reservation/document có prefix hoặc lineage nhận diện duy nhất.
- Cleanup theo dependency chỉ trên local D1 ephemeral.
- Không xóa fixture catalogue dùng chung.
- Sau cleanup xác minh không còn residue ở document, child, stock ledger/read model, reservation, batch/bundle và user/role fixture QA riêng.
- Cleanup phải idempotent hoặc fail rõ khi chạy lần hai; không xóa wildcard quá rộng.

### Acceptance

- Desktop + mobile.
- Cookie + CSRF thật.
- Role nghiệp vụ thật; không dùng admin để thay cho stock-operation evidence.
- Failure paths giữ invalid session/CSRF, permission denial, immutable records và over-issue/over-reservation.

### Done condition P0

- Quantity + kg + reservation + QR/lineage reconcile không chênh lệch.
- Document QR/lineage truy ngược tới đúng voucher/batch/bundle và không lẫn identity.
- QA cleanup PASS và query hậu kiểm không còn residue.
- Desktop/mobile + role/session/CSRF failure paths PASS.
- Không mutate customer production data và không deploy production nếu user chưa yêu cầu riêng.

## P1 — Daily detailed ledger

- Immutable snapshot theo ngày và dimension nghiệp vụ.
- Re-run cùng input idempotent.
- Freeze chặn direct edit sau khóa.
- Adjustment sau khóa append-only có reason/actor/timestamp/audit trail.
- Reconciliation ít nhất Sales, Purchase, Inventory, Manufacturing và Finance.
- Permission + tenant boundary có test/authenticated evidence.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo quy trình 25.7.
- Warranty lifecycle và trách nhiệm chi phí.
- Supplier provisional AP hold/offset có phê duyệt.
- Capacity theo department/workstation calendar, 8 giờ/ngày, overtime/overload.

## P3 — End-to-end acceptance

Khóa hành trình authenticated xuyên miền:

`Sales Order -> Production -> material/stock -> delivery -> invoice/debt -> daily ledger -> adjustment -> warranty`

## Guardrails

- Mỗi epic/đợt sửa độc lập dùng branch/PR riêng từ exact current `main`.
- Không thay exact PR head khi required CI đang chạy nếu không có lý do kỹ thuật.
- Không deploy Cloudflare/production hoặc sửa production secrets/DNS nếu user chưa yêu cầu rõ.
- Không mutate customer production data.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifacts/evidence.
