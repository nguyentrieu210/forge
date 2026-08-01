# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status nằm ở `CURRENT_STATUS.md`; công việc kế tiếp nằm ở `NEXT_TASKS.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho default branch, exact HEAD, PR, CI, merge và release evidence.
- Luôn đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này.
- Mọi branch/SHA dưới đây là checkpoint lịch sử, không phải lệnh checkout. Phải xác minh lại GitHub trước khi dùng.

## Checkpoint đã khóa

### Stock P0 acceptance — COMPLETE

- PR `#189` merged tại `80496b056fa0f23f18311e5822c21dc826bacd9f`.
- Final validated head: `ee396fd26b2355a4f3e1d62c92f41468be489443`.
- Exact-head required workflows: **6/6 PASS**.
- P0 stock acceptance hiện có authenticated evidence cho:
  - physical quantity + kg/catch-weight;
  - reservation/available stock;
  - exact voucher type/name/row lineage;
  - item/warehouse/physical identity;
  - Batch + Serial and Batch Bundle identity;
  - hai identity song song không lẫn lineage;
  - Stock Reconciliation print thật + QR exact document `name`;
  - desktop/mobile role `Thủ kho`, cookie + CSRF thật;
  - invalid session/CSRF/identity fail closed;
  - cleanup local D1 exact-manifest và hậu kiểm zero residue.
- Cleanup không được xóa wildcard shared fixtures hoặc RBAC audit; audit giữ append-only.
- Desktop/mobile QA được cô lập rate window chỉ trên local tenant; không hạ production login guard.

### MetaForge Bulk View + unsaved-edit protection

- Bulk View PR `#190` merged tại `28eb4c4af6f88f0d1c3dc56c8f50e8d31fe2e968`; final head `bc75667d1a2078e6483c1a63a4afa1e94bde9de5`; 6/6 PASS.
- Dirty-guard PR `#195` merged tại `2e5860b90410845545df33115c6f053925b65c72`; final head `7e51b9955a0fca2f864df6ac0a278f61c510d5ec`; 6/6 PASS.
- PR `#182` và `#192` là stale/superseded, đã đóng. Không reopen hoặc dùng làm live source.
- `resolveBulkRenderPolicy()` là composition point cho generic Bulk v1.
- Generic Bulk chỉ hỗ trợ `document_update` trên master; transaction/submittable/child/single/protected/conditional-readonly fail closed.
- `BulkGridView`/`BulkGridContainer` có selection, Excel/Sheets paste, fill-down, search/paging, discard, optimistic concurrency theo `modified` và lỗi từng dòng.
- Dirty state được đẩy lên `DoctypeWorkspace`; Bulk → List khi dirty phải qua destructive confirmation; browser unload có guard.
- ALUM source `2.1.2` có Bulk config cho 15 master DocType. `Item Price` chỉ bulk-edit `rate/note/disabled`.
- Canonical contract là `viewPolicy.bulk`. Large brief sidecar hiện transport qua compatibility `viewPolicy.mobile.bulk`; short-brief compiler/parser first-class transport vẫn là follow-up.
- Matrix View là primitive tiếp theo cho quan hệ hai chiều; transaction/ledger phải dùng controller-backed Bulk Transaction strategy.

### MetaForge Form / Document Experience

- PR `#176` merged tại `a7643cee0102aee1c37d4f00afac1594d0261e68`; canonical `resolveFormRenderPolicy()`; `surface=internal` là hard boundary.
- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`; Document Experience V2 có archetype `master`, `transaction`, `inventory`, `production`, `approval`, `ledger`, `analysis` + generic fallback.
- Presentation chỉ dùng field còn tồn tại sau canonical form policy; permission/workflow/actions vẫn server-authoritative.

### Canonical first-party Meta boundary

- PR `#164` merged tại `9a1e8e9f9fbbe88e49ac0775683411aea771b69b`.
- `apps-src` là authoring source; first-party app metadata đi qua canonical compiler.
- Meta contract giữ `kind`, `viewPolicy`, `valueSource`, `editMode`, `surface`, `serverEnforced` và external DocType closure.

### Sales / Purchase

- Sales-to-Production PR `#131` merged.
- Tiến Đạt purchase FIFO PR `#134` merged.
- Purchase authenticated QA PR `#137` merged.
- Tiến Đạt FIFO complete operations UI PR `#179` merged tại `e44ade8ca1ab396a66b800844b755de203be9245`; final exact-head 6/6 PASS.
- Generic FIFO production không được tự bật.

## Task canonical kế tiếp

`NEXT_TASKS.md` hiện ưu tiên **P1 Daily detailed ledger** sau khi stock P0 đã khép.

Hard rules cho P1 ledger:

- không tạo source-of-truth cạnh tranh với stock/accounting ledger hiện hữu;
- tenant-scope ở schema/query/API/export/cache;
- snapshot immutable sau freeze;
- adjustment sau freeze append-only, có reason/actor/timestamp/source/audit;
- rerun idempotent, duplicate prevention bằng key/transaction phù hợp;
- reconciliation phải truy ngược được source document/ledger;
- migration phải xử lý existing data/backward compatibility, không destructive.

Trước khi mở branch P1 phải kiểm GitHub xem có PR canonical nào đã bắt đầu đúng scope này hay chưa. Các PR song song như manufacturing costing/petty cash/Plastic ERP không được trộn vào P1 ledger chỉ vì cùng chạm finance/manufacturing.

## Production checkpoint lịch sử

Checkpoint production gần nhất được handoff ghi nhận:

- Alumdoor production exact SHA: `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Production Alumdoor Meta tại checkpoint đó: `2.1.0`.

Đây là snapshot lịch sử. Source hiện đã tiến xa hơn; không suy ra production đã được cập nhật. Trước mọi quyết định production phải đọc GitHub/release/provider evidence hiện tại.

## Phần chưa hoàn tất toàn hệ thống

Không được tuyên bố toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

Các miền còn cần implementation/acceptance gồm:

1. P1 Daily detailed ledger: snapshot/freeze/append-only adjustment/reconciliation.
2. MetaForge UX V2: List Workspace V2 tích hợp Bulk, Matrix View, presentation authoring/canonical transport, document context/exception, operational workspace, Mobile V2, personalization/AI context.
3. Bulk Transaction cho Stock Reconciliation/BOM và transaction-grid nhập nhôm nhiều mã.
4. Warranty/defects/capacity/overtime.
5. Authenticated E2E xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

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
