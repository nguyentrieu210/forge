# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. Không dùng file này thay cho GitHub khi cần exact branch head, PR state hoặc CI. Trước khi làm đọc `RUNBOOK.md` và `CURRENT_STATUS.md`.

## DONE UI — MetaForge Document Experience V2 foundation

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Final validated head: `1a79c28832aed7731601bb9ea378f9a4a3cc01db`.
- Required workflows: **6/6 PASS**.
- Đã có presentation resolver an toàn, 7 archetype + generic fallback, document hero, semantic status, metric cards, context strip/rail, skeleton và visual profile riêng theo archetype.
- Selfcheck khóa `Sales Order`, `Purchase Order`, `Stock Entry`, `Work Order`, `Customer`, `Payment Entry`.
- Không deploy production.

Không mở lại PR #184 trừ khi có regression cụ thể.

## NEXT UI — MetaForge UX V2 wave kế tiếp

Trước khi mở code mới:

1. Xác minh exact current `main` sau merge #184.
2. Xác minh PR `#182` Bulk View: head, mergeability, CI và file đang chạm.
3. Nếu #182 chưa ổn định/mergeable, không tạo List Workspace V2 đè `DoctypeWorkspace`; ưu tiên hoàn tất dependency hoặc làm presentation authoring/context slice độc lập.
4. Mỗi wave dùng branch/PR riêng từ exact `main`.

### Ưu tiên UI

1. **List Workspace V2**: summary bar, saved views, smart filters, table/card responsive, contextual quick actions; Bulk View phải là một mode tích hợp, không tạo navigation cạnh tranh.
2. **Presentation authoring / canonical transport**: đưa `presentation` từ runtime extension thành metadata/sidecar authorable có compiler/parser/selfcheck và backward compatibility.
3. **Document context nâng cao**: related-document graph, activity/timeline, exception cards, business progress source thật.
4. **Operational workspace**: role home, module summary, inbox/cần xử lý, exception-first UX.
5. **Mobile V2**: rich list cards, context drawer/bottom sheet, action zone màn nhỏ.
6. **Personalization / AI context**: saved dashboard layout và document-aware assistant sau khi các surface vận hành phía trên ổn định.

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
