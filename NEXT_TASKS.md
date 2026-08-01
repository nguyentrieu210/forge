# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục. GitHub là nguồn sự thật cho exact branch head, PR, CI và release evidence.

## DONE — PR #167 Authenticated stock lifecycle + mobile contracts

- PR `#167` merged.
- Final validated head: `c03a97372359823e0f4609015e287b3d306a851e`.
- Merge commit: `ec80180632438680e872e5b4075f492cf1c0e8f7`.
- Final exact-head required workflows: **6/6 PASS**.
  - CI `30714523969`: tests/typecheck/build PASS.
  - UI Pull Request Validation `30714523967`: MetaForge browser, Alumdoor browser và authenticated cookie+CSRF stock lifecycle PASS.
  - PR Validation `30714523968`: PASS.
  - Sales Feature CI `30714523958`: PASS.
  - Purchase Feature CI `30714523990`: PASS.
  - Inventory and Manufacturing CI `30714524000`: PASS.
- Mobile QA khóa canonical payload cho Nhập/Xuất/Chuyển/Kiểm và sửa bottom navigation đè nút Lưu.
- Authenticated local D1 evidence khóa qty lifecycle: 10 nhập → 8 sau xuất → 5 nguồn / 3 đích sau chuyển → 2 đích sau kiểm kê.
- `Thủ kho` không tự duyệt kiểm kê; `Chủ xưởng` duyệt; kiểm kê đã ghi sổ không được huỷ.
- Không deploy Cloudflare, không đổi production secrets/DNS, không mutate tenant production.

## NEXT P0 — Stock Entry operational submit RBAC

QA của PR #167 phát hiện gap thật trong Alumdoor brief: `Stock Entry` là `submittable` nhưng `Chủ xưởng`, `Thủ kho`, `Sản xuất` hiện chỉ có `rwc`, thiếu quyền submit `s`. Vì vậy receipt/issue/transfer của evidence #167 được post bằng authenticated tenant admin; không được coi đó là bằng chứng role nghiệp vụ đã submit được.

1. Chốt role nào được quyền submit từng purpose của Stock Entry; ưu tiên least privilege, không cấp submit rộng hơn quy trình thực tế.
2. Sửa Alumdoor brief/permission contract bằng PR riêng.
3. Authenticated QA phải login role thật và chứng minh create + submit receipt/issue/transfer; role không được phép phải nhận 403.
4. Giữ backend strict; không thêm role giả hoặc bypass permission trong test.
5. Exact-head CI 6/6 PASS trước merge.

## NEXT P0 — Hoàn tất stock acceptance còn thiếu

1. Đối chiếu kg thực cân ngoài quantity ledger.
2. Kiểm giữ chỗ / nhả giữ chỗ và ảnh hưởng available stock.
3. Kiểm QR/lineage cho chứng từ/lô liên quan.
4. Cleanup toàn bộ dữ liệu QA theo lineage và xác minh không còn residue.
5. Chạy desktop + mobile với cookie + CSRF thật; không dùng dữ liệu khách hàng làm smoke.
6. Không gộp deploy G03 vào smoke kho. G03 cần release riêng có backup/migration/rollback/evidence.

### Done condition P0

- Role nghiệp vụ đúng được submit Stock Entry; role sai bị từ chối.
- Desktop và mobile cùng PASS trên authenticated lifecycle.
- Permission/CSRF/session failure paths PASS.
- Ledger quantity + kg + reservation + QR/lineage reconciliation không chênh lệch.
- QA cleanup PASS và không mutate dữ liệu khách hàng.
- Evidence gắn exact release SHA nếu/when production release được user yêu cầu riêng.

## DONE — PR #164 Canonical first-party Meta boundary

- PR `#164` merged.
- Final validated head: `cbd77e2c0498691cc4b40cc824649d114f96c8c9`.
- Merge commit: `9a1e8e9f9fbbe88e49ac0775683411aea771b69b`.
- Final exact-head required workflows: **6/6 PASS**.
- Không deploy Cloudflare, không đổi production secrets/DNS, không mutate tenant production trong epic này.

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
- Production Alumdoor giữ SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55` cho tới release riêng có approval/evidence.
