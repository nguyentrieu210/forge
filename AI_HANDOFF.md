# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status nằm ở `CURRENT_STATUS.md`; công việc kế tiếp nằm ở `NEXT_TASKS.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho default branch, exact HEAD, PR, CI, merge và release evidence.
- Luôn đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này.
- Mọi branch/SHA dưới đây là checkpoint lịch sử, không phải lệnh checkout. Phải xác minh lại GitHub trước khi dùng.

## Checkpoint đã khóa

### MetaForge Form Renderer

- PR `#176` merged.
- Merge commit: `a7643cee0102aee1c37d4f00afac1594d0261e68`.
- Final validated PR head: `acf53e12b3e59f21dde35ad6f27cc014fb624c00`.
- Exact-head required workflows: 6/6 PASS.
- `resolveFormRenderPolicy()` là composition point cho existing/full/quick Form.
- `viewPolicy.*.enabled/fields` là runtime policy; `surface=internal` là hard visibility boundary.

### MetaForge Document Experience V2

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Final validated PR head: `1a79c28832aed7731601bb9ea378f9a4a3cc01db`.
- Required workflows: 6/6 PASS.
- Presentation Contract V2 hiện là extension presentation an toàn trên `DocTypeMeta`; metadata không khai `presentation` vẫn có fallback heuristic.
- Có các archetype `master`, `transaction`, `inventory`, `production`, `approval`, `ledger`, `analysis` + `generic` fallback.
- Mỗi archetype có visual profile riêng cho accent/hero/icon/metric/context rail; không hard-code quyền hoặc business state transition vào presentation layer.
- Resolver chỉ dùng field còn tồn tại sau canonical form policy, nên `surface=internal`/server-owned field không thể bị presentation kéo ngược ra UI.
- `FormContainer` giữ server-authoritative permission/workflow/actions; Document Experience chỉ bọc presentation.
- Regression selfcheck tham chiếu `Sales Order`, `Purchase Order`, `Stock Entry`, `Work Order`, `Customer`, `Payment Entry`.
- List Workspace V2 chưa triển khai; phải kiểm tra Bulk View PR `#182` trước vì PR đó đang chạm `DoctypeWorkspace` và core meta types.

### Authenticated stock lifecycle

- PR `#167` merged: mobile canonical contracts + authenticated stock lifecycle.
- PR `#170` merged: Stock Entry operational submit RBAC.
- PR `#173` merged: physical stock catch-weight reconciliation.
- PR `#175` merged tại `509db8c32625168316696fb0deb3760a434aedf9`: authenticated reservation/available-stock lifecycle; final PR head `e839599ddf23e6cf89a325497b62f20085f62ffd`, required workflows 6/6 PASS.
- Quantity + weight + reservation + permission evidence đã được khóa trên local D1 authenticated QA. Reservation giảm available stock nhưng không thay physical stock; release phục hồi available và double-release fail theo Frappe 417 contract.

### Canonical first-party Meta boundary

- PR `#164` merged tại `9a1e8e9f9fbbe88e49ac0775683411aea771b69b`.
- `apps-src` là authoring source; first-party app metadata đi qua canonical compiler.
- Meta contract giữ `kind`, `viewPolicy`, `valueSource`, `editMode`, `surface`, `serverEnforced` và external DocType closure.

### Sales / Purchase

- Sales-to-Production PR `#131` merged.
- Tiến Đạt purchase FIFO PR `#134` merged.
- Purchase authenticated QA PR `#137` merged.
- FIFO nghiệp vụ Tiến Đạt đã có source/test; generic FIFO production không được tự bật.

## Production checkpoint lịch sử

Checkpoint production đã được ghi nhận trước đợt cleanup này:

- Alumdoor production exact SHA: `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Production Alumdoor Meta tại checkpoint đó: `2.1.0`.

Đây là snapshot lịch sử. Trước mọi quyết định production phải đọc GitHub/release evidence hiện tại. Không suy ra rằng production vẫn ở đúng SHA/version này.

## Phần chưa hoàn tất toàn hệ thống

Không được tuyên bố toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

Các miền còn cần acceptance/implementation đầy đủ gồm:

1. MetaForge UX V2: List Workspace, presentation authoring/canonical transport, related-document/activity/exception, operational workspace, mobile và personalization/AI context.
2. Stock acceptance còn lại: QR/lineage end-to-end và cleanup QA không residue.
3. Daily detailed ledger: snapshot/freeze/append-only adjustment/reconciliation.
4. Warranty/defects/capacity/overtime.
5. End-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

`NEXT_TASKS.md` mới là hàng đợi active; danh sách trên chỉ mô tả phần còn thiếu ở cấp hệ thống.

## Release boundary

- Không deploy Cloudflare/production nếu user chưa yêu cầu rõ cho đợt hiện tại.
- Không sửa production secret/DNS.
- Không mutate dữ liệu khách hàng.
- Không bật generic FIFO production.
- Merge code không đồng nghĩa được phép deploy production.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- cookie/token/credential;
- generated evidence/build artifact không được repo quản lý.
