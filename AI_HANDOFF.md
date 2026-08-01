# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status nằm ở `CURRENT_STATUS.md`; công việc kế tiếp nằm ở `NEXT_TASKS.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho default branch, exact HEAD, PR, CI, merge và release evidence.
- Luôn đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này.
- Mọi branch/SHA dưới đây là checkpoint lịch sử, không phải lệnh checkout. Phải xác minh lại GitHub trước khi dùng.

## Plastic ERP architecture đang triển khai

- P0-A clean branch: `feat/plastic-erp-foundation-v2-20260802`, cắt từ exact `main` `e490e2ebd2e8c3cc98e004d4a7c2e394fd07812f`.
- Foundation source nằm ở `server/apps-src/plastic-erp/`; MetaForge sinh CRUD/list/form từ canonical app metadata, không dựng runtime metadata thứ hai.
- `Plastic Recipe Policy` là policy công nghệ bổ sung và bắt buộc tham chiếu `Bill of Materials`; BOM core vẫn là nguồn định mức chuẩn.
- `Plastic Machine`/`Plastic Tool` mở rộng primitive `Asset`, `Workstation`, `Operation`, `Location`; không tạo resource/asset model cạnh tranh.
- P0-A không tạo stock ledger mới. Mọi production completion ở P0-B phải reconcile với `Work Order` và submitted `Stock Entry` Manufacture; shop-floor record chỉ điều hành máy/ca/khuôn/lineage.
- QC foundation mở rộng `Quality Inspection`; batch/lot lineage phải dùng core `Batch`/stock documents thay vì bảng tồn kho song song.
- Mọi master/transaction doanh nghiệp phải giữ company/branch/tenant scope; controller slice sau phải fail closed với cross-company/cross-tenant link.
- PR `#187` là generation cũ stale/diverged, không dùng làm branch merge. Blob source đã được transplant sạch sang current-main generation; exact-head CI mới là evidence hợp lệ.

## Checkpoint đã khóa

### MetaForge Form Renderer

- PR `#176` merged tại `a7643cee0102aee1c37d4f00afac1594d0261e68`.
- Final validated PR head: `acf53e12b3e59f21dde35ad6f27cc014fb624c00`.
- Exact-head required workflows: 6/6 PASS.
- `resolveFormRenderPolicy()` là composition point cho existing/full/quick Form.
- `viewPolicy.*.enabled/fields` là runtime policy; `surface=internal` là hard visibility boundary.

### MetaForge Document Experience V2

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Final validated PR head: `1a79c28832aed7731601bb9ea378f9a4a3cc01db`.
- Required workflows: 6/6 PASS.
- Có archetype `master`, `transaction`, `inventory`, `production`, `approval`, `ledger`, `analysis` + generic fallback.
- Presentation resolver chỉ dùng field còn tồn tại sau canonical form policy; presentation không được kéo `surface=internal`/server-owned field trở lại UI.
- `FormContainer` giữ server-authoritative permission/workflow/actions; Document Experience chỉ bọc presentation.

### MetaForge Bulk View

- PR `#190` merged tại `28eb4c4af6f88f0d1c3dc56c8f50e8d31fe2e968`.
- Final validated PR head: `bc75667d1a2078e6483c1a63a4afa1e94bde9de5`.
- Required workflows: 6/6 PASS.
  - CI `30721227654`: tests/typecheck/build PASS.
  - UI `30721227663`: lint/build + MetaForge workspace browser QA + Alumdoor browser QA PASS.
  - PR Validation `30721227676`, Purchase `30721227715`, Sales `30721227669`, Inventory/Manufacturing `30721227651`: PASS.
- PR `#182` là branch Bulk cũ đã diverged và đã đóng, không merge. Không reopen hoặc dùng nó làm live source.
- `resolveBulkRenderPolicy()` là composition point cho generic Bulk v1.
- Generic Bulk chỉ hỗ trợ `document_update` trên master, fail closed với transaction/submittable/child/single và protected/conditional-readonly fields.
- `BulkGridView`/`BulkGridContainer` có selection, Excel/Sheets paste, fill-down, search/paging, discard, optimistic concurrency theo `modified` và lỗi từng dòng.
- `DoctypeWorkspace` dùng mode `Danh sách | Nhập hàng loạt` khi policy cho phép.
- ALUM source `2.1.2` có Bulk config cho 15 master DocType. `Item Price` chỉ bulk-edit `rate/note/disabled`; identity fields giữ read-only.
- Canonical contract là `viewPolicy.bulk`. Large brief sidecar hiện transport qua compatibility `viewPolicy.mobile.bulk`; short-brief compiler/parser first-class transport vẫn là follow-up.
- Matrix View là primitive tiếp theo cho quan hệ hai chiều; transaction/ledger phải dùng controller-backed Bulk Transaction strategy, không generic document update.

### Authenticated stock lifecycle

- PR `#167` merged: mobile canonical contracts + authenticated stock lifecycle.
- PR `#170` merged: Stock Entry operational submit RBAC.
- PR `#173` merged: physical stock catch-weight reconciliation.
- PR `#175` merged tại `509db8c32625168316696fb0deb3760a434aedf9`: authenticated reservation/available-stock lifecycle; final PR head `e839599ddf23e6cf89a325497b62f20085f62ffd`, required workflows 6/6 PASS.
- Quantity + weight + reservation + permission evidence đã được khóa trên local D1 authenticated QA.
- PR `#189` hiện là active clean P0 slice cho QR/lineage + cleanup QA; không tạo branch cạnh tranh nếu #189 vẫn active.

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

Checkpoint production đã được ghi nhận trước các UX/stock slices hiện tại:

- Alumdoor production exact SHA: `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Production Alumdoor Meta tại checkpoint đó: `2.1.0`.

Đây là snapshot lịch sử. Source ALUM hiện đã tới `2.1.2`, nhưng không được suy ra production đã được cài version đó. Trước mọi quyết định production phải đọc GitHub/release/provider evidence hiện tại.

## Phần chưa hoàn tất toàn hệ thống

Không được tuyên bố toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

Các miền còn cần acceptance/implementation đầy đủ gồm:

1. Plastic ERP P0-A exact-head acceptance, sau đó P0-B Production Run, QC lot gate, MRP/capacity/costing và các domain phụ thuộc.
2. P0 stock acceptance: QR/lineage end-to-end + cleanup QA, hiện active ở PR `#189`.
3. MetaForge UX V2: List Workspace V2 tích hợp Bulk, Matrix View, presentation authoring/canonical transport, document context/exception, operational workspace, mobile V2 và personalization/AI context.
4. Bulk Transaction cho Stock Reconciliation/BOM và transaction-grid nhập nhôm nhiều mã.
5. Daily detailed ledger: snapshot/freeze/append-only adjustment/reconciliation.
6. Warranty/defects/capacity/overtime.
7. End-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

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
