# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục. GitHub là nguồn sự thật cho exact branch head, PR, CI và release evidence.

## DONE — PR #164 Canonical first-party Meta boundary

- PR `#164` merged.
- Final validated head: `cbd77e2c0498691cc4b40cc824649d114f96c8c9`.
- Merge commit: `9a1e8e9f9fbbe88e49ac0775683411aea771b69b`.
- Final exact-head required workflows: **6/6 PASS**.
- Không deploy Cloudflare, không đổi production secrets/DNS, không mutate tenant production trong epic này.

## NEXT P0 — authenticated stock lifecycle

Mục tiêu: chứng minh vòng đời kho thật trên desktop + mobile bằng dữ liệu QA có thể cleanup, không dùng dữ liệu khách hàng làm smoke.

1. Dùng tài khoản QA riêng với cookie + CSRF thật.
2. Tạo dữ liệu thử có tiền tố nhận diện và lineage rõ.
3. Chạy nhập kho → xuất kho → chuyển kho → kiểm kho.
4. Kiểm Stock User và Stock Manager, gồm failure path/permission denial.
5. Đối chiếu trước/sau từng bước: ledger, số lượng, kg thực cân, giữ chỗ và QR.
6. Cleanup toàn bộ chứng từ QA theo lineage; xác minh không còn residue.
7. Không gộp deploy G03 vào smoke kho. G03 cần release riêng có backup/migration/rollback/evidence.

### Done condition P0

- Desktop và mobile cùng PASS trên authenticated lifecycle.
- Permission/CSRF/session failure paths PASS.
- Ledger/qty/kg/QR reconciliation không chênh lệch.
- QA cleanup PASS và không mutate dữ liệu khách hàng.
- Evidence gắn exact release SHA.

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
