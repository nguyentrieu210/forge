# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục. GitHub là nguồn sự thật cho exact branch head, PR, CI và release evidence.

## DONE — PR #175 Authenticated reservation availability lifecycle

- PR `#175` merged.
- Final validated head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Merge commit: `509db8c32625168316696fb0deb3760a434aedf9`.
- Final exact-head required workflows: **6/6 PASS**.
  - CI `30718759652`: tests/typecheck/build PASS.
  - UI Pull Request Validation `30718759696`: frontend lint/build + browser QA + authenticated cookie/CSRF reservation lifecycle PASS.
  - PR Validation `30718759665`: PASS.
  - Purchase Feature CI `30718759676`: PASS.
  - Sales Feature CI `30718759661`: PASS.
  - Inventory and Manufacturing CI `30718759660`: PASS.
- Tracked receipt 10 cây có Batch/Bundle thật; giữ 6 làm available còn 4 nhưng physical stock vẫn 10.
- Over-reservation 5 bị từ chối với số khả dụng đúng; release phục hồi available; giữ đủ 10 làm available về 0.
- Double-release và terminal-state reversal bị từ chối.
- Desktop/mobile, role nghiệp vụ, cookie + CSRF thật đều PASS trên local D1 ephemeral.
- Không deploy Cloudflare, không đổi production secrets/DNS, không mutate tenant production.

## NEXT P0 — QR/lineage end-to-end + cleanup QA

Mục tiêu: khóa nốt truy vết vật lý và chứng minh toàn bộ dữ liệu QA có thể dọn sạch không residue. Sau slice này stock acceptance mới chuyển P0 sang DONE.

### 1. QR / lineage end-to-end

- Dùng item theo lô, Batch và Serial and Batch Bundle thật từ authenticated lifecycle.
- Physical-stock report `include_lineage=true` phải truy ngược đúng:
  - voucher type/name;
  - voucher row;
  - batch;
  - bundle;
  - warehouse và item identity.
- Tạo một identity thứ hai để chứng minh lineage không lẫn batch/bundle/voucher giữa hai luồng.
- Với Stock Reconciliation, render print format thật và khóa QR output sinh từ chính document `name`; không chỉ kiểm chuỗi template.
- QR hoặc URL phải mở đúng document route và không lộ dữ liệu tenant khác.
- Giữ quantity, kg và reservation assertions hiện có trong cùng authenticated acceptance hoặc regression suite liên quan.

### 2. Cleanup QA không residue

- Mọi user/item/kho/batch/bundle/reservation/chứng từ QA phải có prefix hoặc lineage nhận diện duy nhất.
- Cleanup theo dependency chỉ trên local D1 ephemeral:
  1. release/terminalize reservation còn hoạt động;
  2. xóa child/index/read-model state phù hợp;
  3. xóa documents QA theo thứ tự phụ thuộc;
  4. xóa user/role fixture QA riêng nếu contract cho phép.
- Không xóa fixture catalogue dùng chung như UOM, Item Group, Account hoặc metadata Alumdoor.
- Sau cleanup chạy truy vấn xác minh không còn QA residue trong:
  - documents và document_children;
  - stock ledger/read model;
  - reservation state;
  - batch/bundle rows;
  - user/role rows được tạo riêng cho test.
- Cleanup phải idempotent hoặc fail rõ khi chạy lần hai; không được xóa theo wildcard quá rộng.

### 3. Authenticated failure paths

- Desktop + mobile, cookie + CSRF thật.
- `Thủ kho`/`Chủ xưởng` tiếp tục làm stock operation theo RBAC đã chốt.
- Invalid CSRF/session phải bị từ chối.
- Sai QR/document identity hoặc lineage tenant khác phải fail closed.
- Immutable submitted records và reservation terminal state tiếp tục bị khóa.

### Done condition P0

- Quantity + kg + reservation + QR/lineage reconcile không chênh lệch.
- Lineage truy ngược đúng voucher/batch/bundle và không lẫn identity.
- Stock Reconciliation print render sinh QR từ đúng document name và route.
- Cleanup PASS; truy vấn hậu kiểm không còn QA residue.
- Desktop/mobile + role/CSRF/session failure paths PASS.
- Không mutate dữ liệu khách hàng.
- Không deploy production nếu user chưa yêu cầu riêng.

## P1 — Daily detailed ledger

- Immutable snapshot theo ngày/company/warehouse/customer/order.
- Re-run cùng input idempotent, không sinh snapshot trùng.
- Freeze chặn direct edit sau khi khóa.
- Adjustment sau khóa append-only, có reason/actor/timestamp/audit trail.
- Reconciliation ít nhất Sales, Purchase, Inventory, Manufacturing và Finance.
- Permission và tenant boundary phải được kiểm bằng test + authenticated evidence.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo quy trình 25.7.
- Bảo hành motor/bình lưu điện 12 tháng từ ngày giao.
- Supplier provisional AP hold + offset có phê duyệt.
- Customer defect cost theo công đoạn/người chịu trách nhiệm.
- Capacity theo department/workstation calendar, 8 giờ/ngày, overtime và overload.

## P3 — End-to-end acceptance

Sales Order → Production Request → Work Order → material issue/consume → paint → delivery → invoice/debt → daily ledger → adjustment → warranty.

## Guardrails

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không deploy production chỉ để lấy UI evidence.
- Không sửa production secrets/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated artifacts/evidence.
- Production Alumdoor giữ SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55` / metadata `2.1.0` cho tới release riêng có approval/evidence.
