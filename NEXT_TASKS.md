# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục. GitHub là nguồn sự thật cho exact branch head, PR, CI và release evidence.

## REVIEW NEXT — MetaForge Form Renderer

Audit tại `docs/METAFORGE_FORM_RENDER_AUDIT_20260802.md` chấm **82/100** trên branch `review/metaforge-form-render-audit-20260802`.

### P0 — Một canonical form-meta pipeline cho existing + new form

1. Tạo helper chung cho form rendering thay vì để `FormContainer` và `NewFormContainer` tự ghép policy khác nhau.
2. Cả existing Form và new Full/Quick Form phải áp canonical `surface=internal` hard boundary ở bước cuối.
3. Runtime phải thực thi `viewPolicy.form.enabled/fields` và `viewPolicy.quickEntry.enabled/fields`; `surface` giữ vai trò canonical field membership/fallback, FormProfile chỉ là legacy/app overlay.
4. `quickEntry.enabled=false` phải không mở full form trong dialog một cách ngầm định; route/shell phải fallback sang page hoặc hành vi được khai rõ.
5. Không thay backend permission để che lỗi UI; server vẫn fail-closed như hiện tại.

### P0 — Regression cho composition boundary

1. Existing `FormContainer` không render field canonical `surface=internal`, kể cả field đó required/title/dependency.
2. Explicit `viewPolicy.form.fields` thay đổi đúng Full Form.
3. Explicit `viewPolicy.quickEntry.fields` thay đổi đúng Quick Form.
4. `form.enabled=false` và `quickEntry.enabled=false` được tôn trọng.
5. Metadata legacy thiếu canonical policy vẫn render theo compatibility rule hiện hành.
6. Chạy client selfcheck + typecheck + build và browser QA trên desktop/mobile trước khi mở PR.

### P1 — Chốt layout contract

- Quyết định MetaForge sẽ fidelity với Frappe `Column Break` hay coi Column Break là hint và dùng `form_width/viewPolicy` làm authoritative layout.
- Nếu giữ layout opinionated, cập nhật mô tả/contract để không tiếp tục tuyên bố copy 1:1 ở phần bố cục.
- Rà `FormView` width ceiling: comment nói `96rem`, code hiện `max-w-[72rem]`; khóa bằng screenshot/E2E ở 1366/1440/1920 và form có child table rộng.

## DONE — PR #170 Stock Entry operational submit RBAC

- PR `#170` merged.
- Final validated head: `33622c680bce5978d97d26be8f1216436da13817`.
- Merge commit: `9b51da20902ac67dc3b4df7ce6ee77b11f886007`.
- Final exact-head required workflows: **6/6 PASS**.
  - CI `30715672279`: tests/typecheck/build PASS.
  - UI Pull Request Validation `30715672304`: authoritative Alumdoor `2.1.1` install + authenticated cookie/CSRF lifecycle PASS.
  - PR Validation `30715672283`: PASS.
  - Sales Feature CI `30715672294`: PASS.
  - Purchase Feature CI `30715672278`: PASS.
  - Inventory and Manufacturing CI `30715672276`: PASS.
- `Thủ kho` và `Chủ xưởng` có `rwcs`; `Sản xuất` giữ `rwc`; `Kế toán` giữ `r` trên Stock Entry.
- Auth QA chứng minh `Thủ kho` submit receipt/issue, `Chủ xưởng` submit transfer, `Sản xuất` tạo draft nhưng submit nhận `403`.
- Permission source tách thành `alumdoor-v2.permissions.json`, app source version `2.1.1`; production vẫn `2.1.0` vì chưa deploy.
- Không deploy Cloudflare, không đổi production secrets/DNS, không mutate tenant production.

## DONE — PR #167 Authenticated stock lifecycle + mobile contracts

- PR `#167` merged.
- Final validated head: `c03a97372359823e0f4609015e287b3d306a851e`.
- Merge commit: `ec80180632438680e872e5b4075f492cf1c0e8f7`.
- Final exact-head required workflows: **6/6 PASS**.
- Mobile QA khóa canonical payload cho Nhập/Xuất/Chuyển/Kiểm và sửa bottom navigation đè nút Lưu.
- Authenticated local D1 evidence khóa qty lifecycle: 10 nhập → 8 sau xuất → 5 nguồn / 3 đích sau chuyển → 2 đích sau kiểm kê.
- `Thủ kho` không tự duyệt kiểm kê; `Chủ xưởng` duyệt; kiểm kê đã ghi sổ không được huỷ.

## NEXT P0 — Hoàn tất stock acceptance còn thiếu

Mục tiêu: khóa nốt bằng chứng vật lý ngoài quantity để stock lifecycle có thể coi là acceptance hoàn chỉnh, không chỉ là số lượng tổng.

1. **Kg thực cân:** tạo/nhập dữ liệu có `weight_kg` hoặc trường cân canonical tương ứng, đối chiếu trước/sau receipt/issue/transfer/reconciliation với ledger/report liên quan; không suy kg từ qty khi source có cân thật.
2. **Reservation:** tạo giữ chỗ trên tồn thật, chứng minh available stock giảm nhưng physical stock không đổi; consume/release phải nhả đúng lượng và không double-release.
3. **QR/lineage:** khóa voucher/batch/bundle lineage từ chứng từ nguồn tới physical-stock report/QR surface; cùng một record phải truy ngược được về chứng từ tạo ra nó.
4. **Cleanup QA:** mọi user/kho/chứng từ/giữ chỗ/bundle QA có prefix + lineage; cleanup theo thứ tự dependency và xác minh không còn residue trong local D1.
5. Chạy desktop + mobile với cookie + CSRF thật; role nghiệp vụ của PR #170 phải tiếp tục được dùng, không quay lại admin để post stock.
6. Failure paths cần giữ: CSRF/session invalid, over-reservation/over-issue, double release/cancel hoặc immutable records theo contract hiện tại.
7. Không gộp deploy G03 hoặc production release vào smoke này. Production release chỉ làm khi user yêu cầu riêng.

### Done condition P0

- `Thủ kho`/`Chủ xưởng` submit đúng quyền; `Sản xuất` submit Stock Entry bị từ chối.
- Desktop và mobile cùng PASS trên authenticated lifecycle.
- Permission/CSRF/session failure paths PASS.
- Ledger quantity + kg + reservation + QR/lineage reconciliation không chênh lệch.
- QA cleanup PASS và truy vấn xác minh không còn residue.
- Không mutate dữ liệu khách hàng.
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
- Production Alumdoor giữ SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55` / metadata `2.1.0` cho tới release riêng có approval/evidence.
