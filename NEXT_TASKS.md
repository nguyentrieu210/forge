# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. Không dùng file này thay cho GitHub khi cần exact branch head, PR state hoặc CI. Trước khi làm đọc `RUNBOOK.md` và `CURRENT_STATUS.md`.

## DONE — PR #184 MetaForge Document Experience V2 foundation

- PR `#184` đã merge vào `main` tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- 7 archetype + generic fallback, document hero, semantic status, metric cards, responsive context strip/rail và skeleton loading đã vào default branch.
- Canonical form policy, permission/workflow/action server-authoritative vẫn giữ nguyên.
- Không deploy production trong slice này.

## ACTIVE — PR #182 MetaForge Bulk View

Mục tiêu: hoàn tất Bulk View an toàn cho master data, đồng bộ với `main` sau PR #184, chạy lại exact-head gates rồi merge; không deploy production trong slice này.

### Đã có

- Renderer chung `BulkGridView` + container metadata-driven.
- Tab `Danh sách | Nhập hàng loạt` trong `DoctypeWorkspace` khi policy bật.
- Paste Excel/Google Sheets, fill-down, search/paging, row error, discard và optimistic concurrency.
- Generic `document_update` fail closed cho transaction/submittable, child/single, internal/read-only/server-owned và conditional-readonly field.
- ALUM `2.1.2` bulk config cho UOM, Brand, Manufacturer, Item Color, Material Grade/Specification, Item Attribute, Supplier Item, Measurement Profile, Item, Customer, Supplier, Price List, Item Price và Pricing Rule.
- Exact head `4b195d3500aa66b3b9da1e412e094c30027cc568` đã required workflows 6/6 PASS trước khi `main` nhận PR #184.
- PR #184 không chạm executable Bulk files; conflict sau merge chỉ ở hai file status canonical và đã được đồng bộ trên branch #182.

### Done condition PR #182

- Exact PR head sau sync với current `main` required workflows 6/6 PASS.
- PR mergeable và không có unresolved review finding Critical/High.
- Merge #182 vào `main` sau gate xanh; merge không tự cấp quyền deploy.
- Không deploy Cloudflare, không sửa production secrets/DNS, không mutate tenant production.

## NEXT UI — MetaForge UX V2 sau Bulk

Sau khi #182 merge, tạo branch mới từ exact `main`. Không sửa tiếp trên branch Bulk.

Ưu tiên theo current default branch:

1. **List Workspace V2 + Bulk integration** — summary bar, saved views, smart filters, table/card responsive, contextual quick actions; Bulk là một mode/action của cùng workspace, không tạo navigation cạnh tranh.
2. **Matrix View** — primitive chuẩn cho User×Role, User×Warehouse/Department/Company, Item×Color, Item×UOM, Item×Reorder warehouse, Supplier×Item và account mapping.
3. **Presentation authoring/canonical transport** — đưa presentation và `viewPolicy.bulk` thành authorable metadata/sidecar có compiler/parser/selfcheck first-class.
4. **Bulk Transaction strategy** — method/controller-backed grid cho Stock Reconciliation và BOM làm reference đầu tiên; tuyệt đối không mass-update ledger/document đã submit.
5. **Nhập nhôm nhiều mã / Purchase Receipt transaction grid**.
6. **Batch Print / QR label queue** dưới dạng action/workspace, không cần ViewKind riêng.
7. **Document context nâng cao** — related-document graph, activity/timeline, exception cards và progress source nghiệp vụ thật.
8. **Operational workspace + Mobile V2** — role home/inbox/exception-first, rich list cards, context drawer và action zone màn nhỏ.
9. **Resource Scheduler** chỉ khi capacity/overtime P2 đi vào runtime; Calendar/Gantt hiện giữ nguyên.

## DONE — Runbook / project-status cleanup

- PR `#180` merged tại `09bc64e1fe8d9ded171368cfc72bd2b4b18aed72`.
- Final validated head: `1a631bae15637c39d06244dc8a3d8bb05eb5ecb0`.
- Exact-head required workflows: **6/6 PASS**.
- `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` có vai trò canonical rõ ràng.

## DONE — PR #175 Reservation acceptance

- Merged: `509db8c32625168316696fb0deb3760a434aedf9`.
- Final validated head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Exact-head required workflows: **6/6 PASS**.
- Reservation giảm available nhưng không thay physical stock; release phục hồi available; over-reservation và double-release fail đúng contract.
- Không deploy production.

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
