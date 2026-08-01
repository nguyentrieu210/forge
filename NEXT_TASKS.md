# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục. GitHub là nguồn sự thật cho exact branch head, PR, CI và release evidence.

## DONE — PR #176 MetaForge Form Renderer canonical policy — 10/10

- PR `#176` merged.
- Final validated head: `acf53e12b3e59f21dde35ad6f27cc014fb624c00`.
- Merge commit: `a7643cee0102aee1c37d4f00afac1594d0261e68`.
- Final exact-head required workflows: **6/6 PASS**.
  - CI `30717282793`: tests/typecheck/build PASS.
  - UI Pull Request Validation `30717282801`: frontend lint/build + MetaForge workspace browser QA + Alumdoor browser QA PASS.
  - PR Validation `30717282798`: PASS.
  - Sales Feature CI `30717282809`: PASS.
  - Purchase Feature CI `30717282807`: PASS.
  - Inventory and Manufacturing CI `30717282796`: PASS.
- Full/Quick/existing Form dùng chung canonical `resolveFormRenderPolicy()`.
- `viewPolicy.*.enabled/fields` được runtime thực thi; `surface=internal` là hard visibility boundary cuối cùng.
- FormProfile legacy compatibility vẫn giữ; selfcheck khóa policy/disabled/internal/legacy cases.
- Không deploy Cloudflare, không đổi production secrets/DNS, không mutate tenant production.

## DONE — PR #173 Physical stock catch-weight reconciliation

- PR `#173` merged.
- Final validated head: `99e198b39998a96d21e35c11ae0bdb5bfa4633fb`.
- Merge commit: `25df9d32217703b9c6c3f965f318b779fe028333`.
- Final exact-head required workflows: **6/6 PASS**.
  - CI `30716396423`: tests/typecheck/build PASS.
  - UI Pull Request Validation `30716396394`: authenticated cookie/CSRF catch-weight lifecycle PASS.
  - PR Validation `30716396428`: PASS.
  - Sales Feature CI `30716396392`: PASS.
  - Purchase Feature CI `30716396405`: PASS.
  - Inventory and Manufacturing CI `30716396389`: PASS.
- Physical-stock D1 reader/read model/report/CSV giờ chở `weight_micros`; thiếu phép cân trả `null`, không bịa `0`.
- Auth QA khóa qty + kg + lineage: `10/65.7kg` → `8/52.56kg` → nguồn `5/32.85kg`, đích `3/19.71kg` → kiểm kê đích `2/13.14kg`.
- Role nghiệp vụ của PR #170 tiếp tục được dùng; `Sản xuất` submit Stock Entry vẫn bị `403`.
- Không deploy Cloudflare, không đổi production secrets/DNS, không mutate tenant production.

## DONE — PR #170 Stock Entry operational submit RBAC

- PR `#170` merged.
- Final validated head: `33622c680bce5978d97d26be8f1216436da13817`.
- Merge commit: `9b51da20902ac67dc3b4df7ce6ee77b11f886007`.
- Final exact-head required workflows: **6/6 PASS**.
- `Thủ kho` và `Chủ xưởng` có `rwcs`; `Sản xuất` giữ `rwc`; `Kế toán` giữ `r` trên Stock Entry.
- Permission source tách thành `alumdoor-v2.permissions.json`, app source version `2.1.1`; production vẫn `2.1.0` vì chưa deploy.

## DONE — PR #167 Authenticated stock lifecycle + mobile contracts

- PR `#167` merged.
- Final validated head: `c03a97372359823e0f4609015e287b3d306a851e`.
- Merge commit: `ec80180632438680e872e5b4075f492cf1c0e8f7`.
- Final exact-head required workflows: **6/6 PASS**.
- Mobile QA khóa canonical payload cho Nhập/Xuất/Chuyển/Kiểm và sửa bottom navigation đè nút Lưu.
- Authenticated local D1 evidence khóa qty lifecycle và Stock Reconciliation SoD.

## NEXT P0 — Reservation + QR/lineage + cleanup QA

Mục tiêu: khóa nốt tồn khả dụng, truy vết vật lý và khả năng dọn sạch dữ liệu QA. Sau phần này stock acceptance mới đủ để chuyển P0 sang DONE.

1. **Reservation / available stock**
   - Dùng item theo lô + Batch thật trong local D1, không giả lập balance ở test.
   - Tạo giữ chỗ `Đang giữ`; physical-stock qty/kg phải **không đổi** vì reservation không sinh stock ledger.
   - Chứng minh available giảm qua enforcement thật: reservation thứ hai vượt phần còn lại phải bị từ chối với `available_qty_micros` đúng.
   - Nhả reservation có lý do; physical stock vẫn không đổi; lượng vừa bị từ chối phải giữ được sau khi nhả.
   - Double-release phải bị từ chối; terminal reservation không được sửa lại.
   - Kiểm expiry/consume path theo contract hiện có nếu có surface gọi thật trong cùng slice; không phát minh API mới nếu workflow chưa cần.

2. **QR / lineage end-to-end**
   - Physical-stock report `include_lineage=true` phải truy ngược voucher/batch/bundle đúng nguồn.
   - Với Stock Reconciliation print format, render print thật và khóa QR surface sinh từ chính document `name`, không chỉ kiểm template text.
   - Nếu batch/bundle được dùng trong reservation/cut flow, lineage phải giữ đúng voucher row/batch và không lẫn identity khác.

3. **Cleanup QA không residue**
   - Mọi user/item/kho/batch/bundle/reservation/chứng từ QA có prefix/lineage nhận diện.
   - Cleanup theo dependency, chỉ trên local D1 ephemeral.
   - Sau cleanup chạy truy vấn xác minh không còn QA residue ở documents, children, stock/reservation/bundle state liên quan.
   - Không được xóa hoặc mutate fixture catalogue dùng chung nếu fixture không được tạo riêng cho test.

4. **Authenticated acceptance**
   - Desktop + mobile, cookie + CSRF thật.
   - `Thủ kho`/`Chủ xưởng` tiếp tục làm stock operation theo RBAC đã chốt; không quay lại admin để post ledger.
   - Failure paths: invalid CSRF/session, over-reservation, double release, immutable records; giữ over-issue/permission denial hiện có.

### Done condition P0

- Quantity + kg + reservation + QR/lineage reconcile không chênh lệch.
- Reservation giảm available nhưng không thay physical stock; release phục hồi available; double-release fail.
- Document QR/lineage truy ngược được tới đúng voucher/batch/bundle.
- QA cleanup PASS và truy vấn xác minh không còn residue.
- Desktop/mobile + role/CSRF/session failure paths PASS.
- Không mutate dữ liệu khách hàng.
- Không deploy production nếu user chưa yêu cầu riêng.

## DONE — PR #164 Canonical first-party Meta boundary

- PR `#164` merged.
- Final validated head: `cbd77e2c0498691cc4b40cc824649d114f96c8c9`.
- Merge commit: `9a1e8e9f9fbbe88e49ac0775683411aea771b69b`.
- Final exact-head required workflows: **6/6 PASS**.

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
