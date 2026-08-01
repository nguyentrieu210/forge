# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục. GitHub là nguồn sự thật cho exact branch head, PR, CI và release evidence.

## NOW — đóng PR #164 Canonical first-party Meta boundary

1. Giữ nguyên final branch head trong lúc required workflows queued/in-progress.
2. Chỉ merge PR `#164` khi toàn bộ 6 workflow trên **cùng exact head** terminal và PASS:
   - CI
   - UI Pull Request Validation
   - Purchase Feature CI
   - Sales Feature CI
   - Inventory and Manufacturing CI
   - PR Validation
3. Sau merge, xác minh PR state `merged`, merge commit/main SHA và workflow của merge SHA nếu được tạo.
4. Không deploy Cloudflare, không sửa production secret/DNS và không mutate tenant production trong epic kiến trúc này.

Code head `73305ec68318dcc194fda271a191997f7aed76e7` đã 6/6 PASS trước doc refresh. Final docs-only head phải được validate lại trước merge.

## NEXT P0 — authenticated stock lifecycle

Mục tiêu: chứng minh vòng đời kho thật trên desktop + mobile với dữ liệu QA có thể cleanup, không dùng dữ liệu khách hàng làm smoke.

1. Dùng tài khoản QA riêng với cookie + CSRF thật.
2. Tạo dữ liệu thử có tiền tố nhận diện và lineage rõ.
3. Chạy: nhập kho → xuất kho → chuyển kho → kiểm kho.
4. Kiểm cả Stock User và Stock Manager, gồm failure path/permission denial.
5. Đối chiếu trước/sau từng bước: ledger, số lượng, kg thực cân, giữ chỗ và QR.
6. Cleanup toàn bộ chứng từ QA theo lineage; xác minh không còn residue.
7. Không gộp deploy G03 `19f949c6...` vào smoke kho. G03 cần release riêng có backup/migration/rollback/evidence.

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

### Done condition P1

- Snapshot/freeze/adjustment/reconciliation chạy đúng trên exact head.
- Full test/typecheck/build và required CI PASS trước merge.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo quy trình 25.7.
- Bảo hành motor/bình lưu điện 12 tháng từ ngày giao.
- Supplier provisional AP hold + offset có phê duyệt.
- Customer defect cost theo công đoạn/người chịu trách nhiệm.
- Capacity theo department/workstation calendar, 8 giờ/ngày, overtime và overload.

## P3 — End-to-end acceptance

Sales Order → Production Request → Work Order → material issue/consume → paint → delivery → invoice/debt → daily ledger → adjustment → warranty.

Done condition:
- Authenticated lifecycle xuyên module.
- Desktop/mobile evidence tại các điểm người dùng thao tác.
- Permission, audit, reconciliation và failure paths có evidence.
- Exact-head CI PASS trước merge/release.

## Guardrails

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không deploy production chỉ để lấy UI evidence.
- Không sửa production secrets/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated artifacts/evidence.
- Production Alumdoor giữ SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55` cho tới release riêng có approval/evidence.

## Historical anchors

- Canonical Meta PR `#154`: merge `6c89e1a9227e989fd8b08d6e55b35ce2e74d87c7`.
- MetaForge MISA workspace PR `#140`: merge `f6420c70823b969a28b43e3f93004ebd52546adc`.
- Alumdoor PWA/brand PR `#150`: production release `b46d3228...`.
- G03 Organization Security PR `#161`: main executable `19f949c6...`, CI PASS, chưa deploy production.
- Lịch sử chi tiết trước đợt rút gọn tài liệu này vẫn truy được trong Git tại parent `73305ec68318dcc194fda271a191997f7aed76e7`.
