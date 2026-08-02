# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status nằm ở `CURRENT_STATUS.md`; công việc kế tiếp nằm ở `NEXT_TASKS.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho default branch, exact HEAD, PR, CI, merge và release evidence.
- Luôn đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này.
- Mọi branch/SHA dưới đây là checkpoint lịch sử, không phải lệnh checkout. Phải xác minh lại GitHub trước khi dùng.

## ACTIVE checkpoint — Manufacturing Costing

- Canonical PR: `#201`, branch `feat/manufacturing-costing-complete-clean-20260802`.
- PR `#185` đã stale/diverged và được đóng `SUPERSEDED`; không reopen/merge.
- #201 được clean-transplant từ exact main, không force-push/rewrite stale history.
- Validated executable checkpoint: `c2e98fab3e39eaa9f38781e3c7139fb3e8ae5ce3` — required workflows **6/6 PASS**.
- Final docs/sync head phải được CI lại riêng; không suy PASS từ executable checkpoint.

### Cost source / standard snapshot

- Work Order release snapshot khóa standard material rate/cost, standard operation cost và total standard cost.
- Legacy Work Order không có snapshot dùng BOM fallback nhưng phải giữ `legacy_standard_warning`; không được gọi đó là historical standard.
- Manufacturing Cost Rate theo effective date; priority: exact operation+workstation → operation → workstation → company default; submitted overlapping active range cùng scope bị chặn.
- Job Card completion tính theo từng operation. Không quay lại generic logic cộng mọi operation vào một quota.

### WIP semantics

- **Material WIP exact** = net `stock_value_difference_minor` của Work-Order-linked submitted Stock Entry trên WIP warehouse.
- Warehouse selection: ưu tiên `Work Order.wip_warehouse`; nếu thiếu thì suy từ positive Material Transfer `TGT-*`; target khác explicit WIP warehouse fail closed.
- Direct material consumption không qua WIP transfer có exact material WIP = 0.
- Material WIP âm là lineage/misconfiguration và phải fail closed.
- **Operation WIP chỉ là estimate**: group Job Card actual cost theo operation và so completed quantity với produced quantity. Chưa có unit-level operation→finished-unit lineage nên không được gọi exact trước final.
- Freeze bắt buộc material WIP = 0 và operation WIP = 0. Tại final completion, actual operation total/unit cost là exact theo Job Card đã ghi.

### Inventory capitalization / variance decision

- Forge hiện vốn hóa Manufacture theo **actual material + standard Work Order operating cost**.
- Canonical field: `inventory_costing_policy = ACTUAL_MATERIAL_STANDARD_OPERATION`.
- Cost Sheet vẫn đo actual operation cost và `manufacturing_cost_variance_minor`.
- `inventory_revaluation_required=false` trong policy hiện tại.
- Nonzero variance có `variance_posting_status = UNPOSTED_FINANCE_VARIANCE`.
- Không retroactive revalue finished stock chỉ bằng Cost Sheet delta: thành phẩm có thể đã chuyển/bán; nếu không replay downstream valuation/COGS thì stock/COGS sẽ sai.
- Không direct-write Stock Ledger/GL từ costing service. Manufacturing variance chỉ được post ở finance boundary khi account/source/reversal policy rõ.
- P1 Daily Ledger PR #199 là scope finance riêng; không copy code #199 vào #201 chỉ để “khép variance”.

### Snapshot / freeze / adjustment invariants

- Snapshot immutable, unique `(tenant_id, work_order, source_fingerprint)`; deterministic snapshot ID + `INSERT OR IGNORE` cho concurrent generate replay.
- Freeze immutable và một Work Order chỉ có một frozen snapshot.
- First freeze re-read live Cost Sheet và so source fingerprint; stale snapshot fail closed.
- Already-frozen same snapshot replay idempotent và không re-read live source; correction sau freeze phải append-only adjustment.
- Adjustment replay cùng ID phải khớp snapshot/category/delta/reason/actor/details, khác payload trả idempotency conflict.
- DB trigger `manufacturing_cost_adjustment_nonnegative_total_guard` chặn race hai negative adjustment cùng làm adjusted actual cost < 0; application precheck chỉ là message sớm, trigger là invariant cuối.
- UI giữ cùng `adjustment_id` khi network retry; ID chỉ reset nếu user sửa payload hoặc request thành công.

### Known trap / acceptance debt

- First-freeze fingerprint recheck chưa nằm cùng serialization coordinator với mọi Stock Entry + Job Card source mutation. Cửa sổ race giữa final read và freeze insert là nhỏ nhưng có thật về lý thuyết; không gọi freeze serializable cho tới khi có shared source-version/coordination contract.
- Chưa có dedicated authenticated Costing browser journey. API tenant-injection/Frappe contract, service permission/invariants, focused manufacturing tests và shared authenticated runtime boundary có coverage, nhưng không thay thế Costing-specific E2E.
- Không invent GL account mapping để che hai debt trên.

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

## Task canonical kế tiếp / song song

P1 Daily Detailed Ledger đã có canonical PR `#199` (`feat/daily-ledger-hardening-20260802`), open/draft/mergeable tại snapshot này.

Hard rules cho P1 ledger:

- không tạo source-of-truth cạnh tranh với stock/accounting ledger hiện hữu;
- tenant-scope ở schema/query/API/export/cache;
- snapshot immutable sau freeze;
- adjustment sau freeze append-only, có reason/actor/timestamp/source/audit;
- rerun idempotent, duplicate prevention bằng key/transaction phù hợp;
- reconciliation phải truy ngược được source document/ledger;
- migration phải xử lý existing data/backward compatibility, không destructive;
- manufacturing variance chỉ post khi account policy rõ; không dùng retroactive stock revalue thay finance posting.

Không mở branch P1 ledger cạnh tranh nếu #199 còn active. Các PR song song như manufacturing costing/petty cash/Plastic ERP không được trộn scope chỉ vì cùng chạm finance/manufacturing.

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

1. P1 Daily detailed ledger / finance variance posting: canonical PR #199 active.
2. Dedicated authenticated Costing journey + stronger freeze/source serialization nếu muốn gọi costing close fully serializable.
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
