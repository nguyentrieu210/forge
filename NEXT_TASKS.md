# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. Không dùng file này thay cho GitHub khi cần exact branch head, PR state hoặc CI. Trước khi làm đọc `RUNBOOK.md` và `CURRENT_STATUS.md`.

## NOW — hoàn tất PR #180 docs/runbook cleanup

Branch: `chore/runbook-status-cleanup`.

Mục tiêu:

- một runbook canonical;
- một current status canonical;
- một active task queue canonical;
- xóa/đánh dấu tài liệu cũ để AI không hiểu snapshot lịch sử là trạng thái hiện tại;
- không chạm executable code hoặc production.

Branch đã được đồng bộ lại trên `main@3222beb66bd3e6b2abbab1b17a6009044a2d5358`, sau khi PR #175 và docs evidence PR #181 merge.

Done condition:

1. `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` nhất quán.
2. `README.md` và `docs/ROADMAP.md` không chứa live-state claim có thể điều phối agent sai.
3. `DELIVERY_POLICY.md` không tự cấp quyền deploy production.
4. `EPIC_STATUS.md` stale đã bị xóa.
5. Diff chỉ là docs; không có `.env`, `server/work/`, `tmp/` hoặc generated artifacts.
6. PR `#180` exact-head CI terminal theo policy repository trước merge.
7. Sau merge, xác minh lại `main` HEAD; không tạo thêm snapshot status riêng nếu ba file canonical đã đủ.

## DONE — PR #175 Reservation acceptance

- Merged: `509db8c32625168316696fb0deb3760a434aedf9`.
- Final validated head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Exact-head required workflows: **6/6 PASS**.
- Reservation giảm available nhưng không thay physical stock; release phục hồi available; over-reservation và double-release fail đúng contract.
- Không deploy production.

Không mở lại reservation slice nếu không có regression cụ thể.

## NEXT P0 — QR / lineage + cleanup QA

Sau khi PR #180 hoàn tất, engineering task kế tiếp của stock acceptance là QR/lineage + cleanup QA. Mở branch mới từ exact `main` lúc bắt đầu task.

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
