# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. Không dùng file này thay cho GitHub khi cần exact branch head, PR state hoặc CI. Trước khi làm đọc `RUNBOOK.md` và `CURRENT_STATUS.md`.

## ACTIVE — PR #182 MetaForge Bulk View

Mục tiêu: hoàn tất Bulk View an toàn cho master data và cấu hình ALUM hiện có, sau đó review/merge riêng; không deploy production trong slice này.

### Đã có

- Renderer chung `BulkGridView` + container metadata-driven.
- Tab `Danh sách | Nhập hàng loạt` trong `DoctypeWorkspace` khi policy bật.
- Paste Excel/Google Sheets, fill-down, search/paging, row error, discard và optimistic concurrency.
- Generic `document_update` fail closed cho transaction/submittable, child/single, internal/read-only/server-owned và conditional-readonly field.
- ALUM `2.1.2` bulk config cho UOM, Brand, Manufacturer, Item Color, Material Grade/Specification, Item Attribute, Supplier Item, Measurement Profile, Item, Customer, Supplier, Price List, Item Price và Pricing Rule.
- Baseline head `c36c8024d3aaa35574f5599a9c15ed6a86727933`: required workflows 6/6 PASS trước final hardening/status commit.

### Done condition PR #182

- Final exact PR head required workflows 6/6 PASS.
- Không có unresolved review finding Critical/High.
- PR vẫn không deploy Cloudflare, không sửa production secrets/DNS, không mutate tenant production.
- Chỉ merge sau review/approval riêng; merge không tự cấp quyền deploy.

### Follow-up MetaForge sau Bulk View

1. **Matrix View** — primitive chuẩn kế tiếp cho User×Role, User×Warehouse/Department/Company, Item×Color, Item×UOM, Item×Reorder warehouse, Supplier×Item và account mapping.
2. **Bulk Transaction strategy** — method/controller-backed grid cho Stock Reconciliation và BOM làm hai reference đầu tiên; tuyệt đối không mass-update ledger/document đã submit.
3. **Nhập nhôm nhiều mã / Purchase Receipt transaction grid**.
4. **Batch Print / QR label queue** dưới dạng action/workspace, không cần ViewKind riêng.
5. **Resource Scheduler** chỉ khi capacity/overtime P2 đi vào runtime; Calendar/Gantt hiện giữ nguyên.
6. First-class short-brief compiler/parser transport cho `viewPolicy.bulk`; large brief hiện dùng `.views.json` compatibility transport và runtime resolver canonical.

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
