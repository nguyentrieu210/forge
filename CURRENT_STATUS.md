# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` quan sát tại đợt sync này: `97045f8aacd8f516dc2257df9f5219cba0558d34`.
- Hai commit sau `866fcbd909914f01600def9ce86e3ce2347bb763` chỉ là `noop` + dọn accidental empty probe; compare không có file source thay đổi.
- Stock P0 QR/lineage + cleanup QA đã merge tại `80496b056fa0f23f18311e5822c21dc826bacd9f` — PR `#189`.
- Bulk dirty-guard đã merge tại `2e5860b90410845545df33115c6f053925b65c72` — PR `#195`.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn là current/default branch.

## ACTIVE / VALIDATED — Manufacturing Costing

- Canonical PR: `#201` — `feat/manufacturing): complete actual production costing on current main`.
- Canonical branch: `feat/manufacturing-costing-complete-clean-20260802`.
- PR `#185` đã đóng `SUPERSEDED`; không reopen/merge. #201 là clean transplant từ exact main, không force-push/rewrite stale history.
- Validated executable checkpoint: `c2e98fab3e39eaa9f38781e3c7139fb3e8ae5ce3`.
- Required workflows trên executable checkpoint: **6/6 PASS**.
  - CI `30740346353`: tests + typecheck + build SUCCESS.
  - UI Pull Request Validation `30740346367`: lint/build + MetaForge/Alumdoor/browser QA + authenticated lifecycle SUCCESS.
  - PR Validation `30740346360`: SUCCESS.
  - Purchase Feature CI `30740346359`: SUCCESS.
  - Sales Feature CI `30740346379`: SUCCESS.
  - Inventory and Manufacturing CI `30740346371`: server build + focused regressions + authoritative brief validation SUCCESS.
- Work Order release snapshot khóa standard material/operation/total cost; legacy WO fallback luôn gắn cờ, không giả standard lịch sử.
- Manufacturing Cost Rate có effective interval, scope Operation/Workstation và chặn submitted overlap.
- Actual material dùng Stock Ledger thật, trừ scrap/offcut recovery; actual operation dùng Job Card hours × effective rate.
- Job Card completion được khóa theo từng operation, không cộng chéo công đoạn.
- Material WIP là **exact net stock value** trên Work Order WIP warehouse hoặc Material Transfer target warehouse suy ra từ Stock Ledger.
- Operation WIP vẫn là **estimate** vì chưa có unit-level lineage từ từng Job Card tới từng finished unit; Cost Sheet không gọi phần này là exact.
- Freeze chỉ mở khi production complete, không thiếu rate, material WIP = 0 và operation WIP = 0; first freeze recheck source fingerprint để chặn snapshot stale.
- Snapshot/freeze immutable; adjustment append-only. Storage trigger chặn concurrent adjustments làm adjusted actual cost âm; retry cùng adjustment ID kiểm cả actor/details.
- Inventory capitalization policy hiện hành được ghi rõ: `ACTUAL_MATERIAL_STANDARD_OPERATION`. Actual operation cost được đo thành manufacturing variance.
- **Không** retroactive revalue finished stock bằng Cost Sheet delta khi chưa có downstream valuation/COGS replay. `inventory_revaluation_required=false`; nonzero variance là `UNPOSTED_FINANCE_VARIANCE` để Finance/P1 ledger xử lý theo account policy rõ ràng.
- Costing UI tách exact material WIP, estimated operation WIP, recorded finished stock value và manufacturing variance; adjustment retry giữ stable idempotency ID.
- Migration `0037_manufacturing_costing.sql` là non-destructive branch migration, có unique/freeze/immutability/nonnegative-total guards.
- Không deploy Cloudflare/production, không sửa secret/DNS và không mutate customer production data trong PR này.
- Canonical docs được sync sau executable checkpoint; exact docs head phải có required CI riêng trước khi gọi PR merge-ready.

## DONE — Stock P0 QR / lineage + cleanup QA

- PR `#189` merged tại `80496b056fa0f23f18311e5822c21dc826bacd9f`.
- Final validated head: `ee396fd26b2355a4f3e1d62c92f41468be489443`.
- Required workflows trên exact head: **6/6 PASS**.
  - CI `30721778821`: tests + typecheck + build SUCCESS.
  - UI Pull Request Validation `30721778804`: SUCCESS.
  - PR Validation `30721778799`: SUCCESS.
  - Purchase Feature CI `30721778775`: SUCCESS.
  - Sales Feature CI `30721778765`: SUCCESS.
  - Inventory and Manufacturing CI `30721778803`: SUCCESS.
- Physical-stock lineage mang exact item/warehouse/physical identity, voucher type/name/row, batch, serial và Serial and Batch Bundle.
- Regression dùng hai identity riêng để chứng minh lineage không lẫn batch/bundle giữa hai luồng.
- D1 reader giữ bundle identity từ immutable child snapshot.
- Stock Reconciliation print render thật; QR sinh từ exact document `name` và route truy đúng document.
- Authenticated desktop/mobile dùng role `Thủ kho`, cookie + CSRF thật; invalid session/CSRF và identity sai vẫn fail closed.
- QA fixtures có exact manifest; cleanup local D1 theo dependency và hậu kiểm zero residue ở document/child/ledger/read-model/reservation/batch/bundle/file/search/timeline liên quan.
- Cleanup giữ RBAC audit append-only; chỉ reset local tenant login-rate window giữa desktop/mobile cohort để test không tự rate-limit, không hạ production guard.
- Không deploy Cloudflare/production, không sửa secret/DNS và không mutate customer production data.

## DONE — Bulk View unsaved-edit guard

- PR `#195` merged tại `2e5860b90410845545df33115c6f053925b65c72`.
- Final validated head: `7e51b9955a0fca2f864df6ac0a278f61c510d5ec`.
- Required workflows trên exact head: **6/6 PASS**.
  - CI `30722136832`: tests + typecheck + build SUCCESS.
  - UI Pull Request Validation `30722136841`: lint/build + MetaForge workspace QA + Alumdoor browser QA SUCCESS.
  - PR Validation `30722136845`: SUCCESS.
  - Purchase Feature CI `30722136825`: SUCCESS.
  - Sales Feature CI `30722136836`: SUCCESS.
  - Inventory and Manufacturing CI `30722136849`: SUCCESS.
- Root cause: Bulk dirty state chỉ tồn tại trong `BulkGridContainer`, nên đổi mode về `Danh sách` có thể unmount grid và mất patch chưa lưu.
- `BulkGridContainer` giờ phát `onDirtyChange` và đăng `beforeunload` guard khi có patch dirty.
- `DoctypeWorkspace` chặn Bulk → List khi dirty và yêu cầu xác nhận destructive trước khi bỏ thay đổi.
- Save/discard/unmount đồng bộ dirty state về false.
- PR `#192` đã đóng vì base/status stale; #195 transplant đúng hai executable blob lên current main, không force-push/rewrite history.
- Không đổi Bulk permission/policy/backend/metadata và không deploy production.

## DONE — Tiến Đạt FIFO complete operations UI

- PR `#179` merged tại `e44ade8ca1ab396a66b800844b755de203be9245`.
- Final validated head: `f8efd5bbf26a398b5a369a453cbbe02ad92ac53f`.
- Required workflows: **6/6 PASS**.
- `/x/action:nhap-nhom-fifo` có form thao tác thật, KPI công nợ giao hàng, đơn còn nợ, lịch sử trừ FIFO, lịch sử hàng về và dòng phiếu nhập sẽ tạo; authenticated desktop/mobile PASS.
- Không deploy production trong slice này.

## DONE — MetaForge Bulk View + ALUM master grids

- PR `#190` merged tại `28eb4c4af6f88f0d1c3dc56c8f50e8d31fe2e968`.
- Final validated head: `bc75667d1a2078e6483c1a63a4afa1e94bde9de5`.
- Required workflows: **6/6 PASS**.
- Generic Bulk v1 là metadata-driven `document_update` cho master an toàn; transaction/submittable/child/single/protected fields fail closed.
- ALUM source `2.1.2` có Bulk config cho 15 master DocType; `Item Price` chỉ bulk-edit `rate`, `note`, `disabled`.
- Runtime canonical contract là `viewPolicy.bulk`; large brief hiện có compatibility transport qua sibling `.views.json`/`mobile.bulk`. Short-brief compiler/parser first-class transport còn là follow-up.

## DONE — MetaForge Document Experience V2 foundation

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Final validated head: `1a79c28832aed7731601bb9ea378f9a4a3cc01db`.
- Required workflows: **6/6 PASS**.
- Có 7 archetype + generic fallback; presentation không được kéo field `surface=internal`/server-owned quay lại UI.

## Capability đã khóa bằng merged evidence

### MetaForge / Meta

- PR `#164`: canonical first-party Meta boundary — merged.
- PR `#176`: canonical Form Renderer policy — merged.
- PR `#184`: Document Experience V2 — merged.
- PR `#190`: safe Bulk View — merged.
- PR `#195`: Bulk unsaved-edit guard — merged.
- `resolveFormRenderPolicy()` là canonical form composition point; `resolveBulkRenderPolicy()` là canonical generic Bulk composition point.

### Inventory / stock

- PR `#167`: authenticated stock lifecycle + mobile contracts — merged.
- PR `#170`: Stock Entry operational submit RBAC — merged.
- PR `#173`: catch-weight physical-stock reconciliation — merged.
- PR `#175`: reservation/available-stock lifecycle — merged.
- PR `#189`: QR/lineage end-to-end + cleanup QA — merged.
- P0 stock acceptance scope đã có authenticated evidence cho physical quantity/kg, available reservation, batch/bundle lineage, QR/document identity, permission/session/CSRF và cleanup no-residue.

### Sales / Purchase

- Sales-to-Production PR `#131` — merged.
- Tiến Đạt purchase FIFO PR `#134` — merged.
- Purchase authenticated QA PR `#137` — merged.
- Tiến Đạt FIFO operations UI PR `#179` — merged.

Không được suy từ các mục DONE này rằng toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

## Production boundary

Checkpoint production lịch sử gần nhất được handoff ghi nhận:

- Alumdoor production exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Meta installer run `30707517624`: PASS.
- Alumdoor Meta tại checkpoint đó: `2.1.0`.

Đây là checkpoint lịch sử, không phải bằng chứng provider hiện tại. Source đã tiến xa hơn nhưng không được suy ra production đã được deploy. Không deploy Cloudflare hoặc sửa production state nếu user chưa yêu cầu rõ.

## Chưa hoàn tất toàn hệ thống

1. **P1 Daily detailed ledger / finance variance posting**: PR canonical `#199` đang active; immutable snapshot theo ngày, stale-freeze guard, append-only adjustment, reconciliation và authenticated acceptance. Manufacturing variance chỉ được post khi account/source policy được định nghĩa ở finance boundary; costing PR không tự tạo GL song song.
2. **MetaForge UX V2**: List Workspace V2 tích hợp Bulk, Matrix View, presentation authoring/canonical transport, document context/exception, operational workspace, Mobile V2, personalization/AI context.
3. **Bulk Transaction** cho Stock Reconciliation/BOM và transaction-grid nhập nhôm nhiều mã.
4. **P2 Warranty / defects / capacity / overtime**.
5. **P3 authenticated end-to-end acceptance** xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.
6. **Costing acceptance debt**: chưa có browser/authenticated fixture dành riêng cho màn Costing; API tenant-injection/Frappe contract, permission/service guards, server regressions và shared authenticated runtime boundary đã được test nhưng không được gọi là dedicated Costing E2E.

## Guardrails

- GitHub là nguồn sự thật; không dựa vào lịch sử chat để chọn branch/SHA.
- Một epic/đợt sửa độc lập dùng một branch/PR canonical từ exact current `main`.
- PR mở song song phải re-check base/head/CI/scope trước khi đụng; không force-push/rewrite lịch sử để cứu branch stale.
- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu chưa có lệnh rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
