# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status nằm ở `CURRENT_STATUS.md`; công việc kế tiếp nằm ở `NEXT_TASKS.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho default branch, exact HEAD, PR, CI, merge và release evidence.
- Luôn đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này → `DELIVERY_POLICY.md`.
- Mọi branch/SHA dưới đây là checkpoint lịch sử, không phải lệnh checkout. Phải xác minh lại GitHub trước khi dùng.

## Checkpoint đã khóa

### Plastic ERP P0-A — READY FOR MERGE, user approval required

- Canonical PR: `#200`, branch `feat/plastic-erp-foundation-v3-20260802`, base exact `main` `866fcbd909914f01600def9ce86e3ce2347bb763`.
- PR #200 hiện open + ready-for-review; **chưa merge**.
- Exact head `edcab9cae6ea6187886fdaff45f6f549b971a2e7` đã **6/6 required workflows PASS** sau closing docs, gồm Main CI tests/typecheck/build.
- PR `#193` đã được comment superseded và đóng; không reopen/merge.
- Các commit sau `edcab9ca…` chỉ đồng bộ post-validation PR state trong canonical docs; exact current head phải re-check GitHub/CI trước khi dừng hoặc merge.
- P0-A là canonical first-party `apps-src/plastic-erp` foundation cho process/material/machine/tool/recipe/QC/capacity/costing metadata, roles và approval workflows.
- Không tạo BOM riêng: `Plastic Recipe Policy` liên kết canonical `Bill of Materials`.
- Không tạo stock ledger/costing ledger cạnh tranh. P0-B phải reconcile với canonical Work Order + submitted Stock Entry Manufacture và stock/lot lifecycle hiện có.
- Machine/Tool mở rộng core Asset/Workstation/Location; QC mở rộng Quality Inspection/Batch. Plastic technology variation đi qua process profile/process type + domain policy, không fork core theo Injection/Extrusion/Blow/Film/Compounding.
- Kernel `status` là reserved system field. Plastic Machine/Tool dùng `operational_state`; không nới kernel parser để cho business `status` đi qua.
- `apps-src` canonicalizer tự sinh Meta v1 `kind`, `viewPolicy`, `valueSource`, `editMode`, `surface`, `serverEnforced`; regression pack/source phải tiếp tục khóa contract này.
- Không merge #200 nếu user chưa yêu cầu rõ. Merge code cũng không cho phép deploy production.

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

1. PR `#200` đã ready; chỉ merge khi user yêu cầu rõ và sau khi exact current head vẫn 6/6 PASS.
2. Sau khi P0-A được merge, Plastic ERP tiếp tục **P0-B Production Run + shop-floor** trên branch mới từ exact current `main`.
3. P0-C QC lot gate, rồi capacity/OEE/operational costing và Plastic E2E.
4. P1 Daily detailed ledger vẫn là high-risk parallel task, nhưng không trộn vào Plastic branch/PR.

Hard rules cho Plastic P0-B:

- Work Order/Stock Entry Manufacture/stock lot lifecycle hiện có là canonical source;
- no second stock/costing ledger;
- start/pause/resume/complete/reverse server-authoritative và idempotent;
- machine/tool compatibility + exclusive-resource conflict server enforce;
- tenant/company/branch scope ở every read/write/link;
- posted/submitted history append-only hoặc reversal;
- authenticated desktop/mobile acceptance + negative permission/session/CSRF path.

Hard rules cho P1 ledger nếu chuyển ưu tiên:

- không tạo source-of-truth cạnh tranh với stock/accounting ledger hiện hữu;
- tenant-scope ở schema/query/API/export/cache;
- snapshot immutable sau freeze;
- adjustment sau freeze append-only, có reason/actor/timestamp/source/audit;
- rerun idempotent, duplicate prevention bằng key/transaction phù hợp;
- reconciliation phải truy ngược được source document/ledger;
- migration phải xử lý existing data/backward compatibility, không destructive.

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

1. Plastic ERP P0-B/P0-C, capacity/OEE/costing sâu và authenticated E2E.
2. P1 Daily detailed ledger: snapshot/freeze/append-only adjustment/reconciliation.
3. MetaForge UX V2: List Workspace V2 tích hợp Bulk, Matrix View, presentation authoring/canonical transport, document context/exception, operational workspace, Mobile V2, personalization/AI context.
4. Bulk Transaction cho Stock Reconciliation/BOM và transaction-grid nhập nhôm nhiều mã.
5. Warranty/defects/capacity/overtime.
6. Authenticated E2E xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

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
