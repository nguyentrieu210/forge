# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

Đây là snapshot đã xác minh. Exact branch head, PR và CI phải được kiểm tra lại trên GitHub trước mỗi đợt làm việc theo `RUNBOOK.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` tại checkpoint này: `2e5860b90410845545df33115c6f053925b65c72` — merge PR `#195` Bulk View dirty guard sau khi PR `#189` P0 stock đã merge.
- PR `#192` và `#196` đã đóng, không merge; chỉ là historical evidence của cùng dirty-guard. PR `#195` là canonical merge.
- PR `#182` đã đóng, không merge; PR `#190` là canonical Bulk View implementation.
- Branch `hotfix/alumdoor-print-list-delete` cũ không còn là current/default branch.

## DONE — MetaForge Bulk View dirty guard

- PR `#195` merged tại `2e5860b90410845545df33115c6f053925b65c72`.
- Final validated PR head: `7e51b9955a0fca2f864df6ac0a278f61c510d5ec`.
- Required workflows trên exact head: **6/6 PASS**.
  - CI `30722136832`: SUCCESS.
  - UI Pull Request Validation `30722136841`: SUCCESS.
  - PR Validation `30722136845`: SUCCESS.
  - Purchase Feature CI `30722136825`: SUCCESS.
  - Sales Feature CI `30722136836`: SUCCESS.
  - Inventory and Manufacturing CI `30722136849`: SUCCESS.
- `BulkGridContainer` phát dirty state cho workspace và đăng ký `beforeunload` guard khi có patch chưa lưu.
- `DoctypeWorkspace` chặn chuyển `Nhập hàng loạt -> Danh sách` khi dirty và yêu cầu xác nhận destructive trước khi bỏ patch.
- Save/discard/unmount đồng bộ dirty state; không đổi Bulk permission, optimistic concurrency, backend hoặc metadata contract.
- Main blob SHA đã đối chiếu: `BulkGridContainer.tsx` = `67942279cb21e9ff05b844921a41b74d34fd5ab8`; `DoctypeWorkspace.tsx` = `28d3c610d3a7c27e8c4d5a95af0ee3cd99a8eaa1`.
- Không deploy Cloudflare/production, không sửa secret/DNS và không mutate tenant/customer data.

## DONE — P0 Stock QR / lineage + cleanup QA

- PR `#189` merged tại `80496b056fa0f23f18311e5822c21dc826bacd9f`.
- Final validated PR head: `ee396fd26b2355a4f3e1d62c92f41468be489443`.
- Required workflows trên exact head: **6/6 PASS**.
  - CI `30721778821`: SUCCESS.
  - UI Pull Request Validation `30721778804`: SUCCESS.
  - PR Validation `30721778799`: SUCCESS.
  - Purchase Feature CI `30721778775`: SUCCESS.
  - Sales Feature CI `30721778765`: SUCCESS.
  - Inventory and Manufacturing CI `30721778803`: SUCCESS.
- Physical-stock lineage giữ đúng item, warehouse, physical identity, batch/serial/bundle, voucher type/name và voucher row.
- Regression hai identity chứng minh lineage không lẫn batch/bundle.
- Stock Reconciliation print render thật, QR dùng exact document name.
- Authenticated desktop/mobile dùng role nghiệp vụ, cookie + CSRF thật; invalid session/CSRF và identity sai fail closed.
- QA cleanup dùng exact manifest trên local D1 ephemeral và hậu kiểm zero residue; không wildcard shared fixtures.
- Không deploy production trong P0 slice.

## DONE — Tiến Đạt FIFO complete operations UI

- PR `#179` merged tại `e44ade8ca1ab396a66b800844b755de203be9245`.
- Final validated PR head: `f8efd5bbf26a398b5a369a453cbbe02ad92ac53f`.
- Required workflows: **6/6 PASS**.
- `/x/action:nhap-nhom-fifo` có form nhập thật, preview công nợ/FIFO/history/receipt lines, Link search thật, locale Việt và authenticated desktop/mobile evidence.
- Không deploy production trong slice này.

## DONE — MetaForge Bulk View + ALUM master grids

- PR `#190` merged tại `28eb4c4af6f88f0d1c3dc56c8f50e8d31fe2e968`.
- Final validated PR head: `bc75667d1a2078e6483c1a63a4afa1e94bde9de5`.
- Required workflows: **6/6 PASS**.
- Generic Bulk v1 là metadata-driven `document_update` cho master an toàn; fail closed với transaction/submittable/child/single và field internal/read-only/server-owned/conditional-readonly.
- `DoctypeWorkspace` tích hợp `Danh sách | Nhập hàng loạt`; ALUM source `2.1.2` có Bulk config cho 15 master DocType.
- `Item Price` chỉ bulk-edit `rate`, `note`, `disabled`; identity fields read-only.
- Runtime canonical contract là `viewPolicy.bulk`; large-brief sidecar vẫn dùng compatibility transport `viewPolicy.mobile.bulk`.

## DONE — MetaForge Document Experience V2 foundation

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Final validated PR head: `1a79c28832aed7731601bb9ea378f9a4a3cc01db`.
- Required workflows: **6/6 PASS**.
- Có 7 archetype + generic fallback, document hero, semantic status, metric cards, context rail/strip và canonical field visibility boundary.

## DONE — Authenticated reservation / physical stock foundations

- PR `#167`: authenticated stock lifecycle + mobile canonical contracts — merged.
- PR `#170`: Stock Entry operational submit RBAC — merged.
- PR `#173`: physical-stock catch-weight reconciliation — merged.
- PR `#175`: authenticated reservation/available-stock lifecycle — merged, final required workflows 6/6 PASS.
- Reservation giảm available nhưng không thay physical stock; release phục hồi available; over-reservation/double-release fail đúng contract.

## ACTIVE — P1 Daily Detailed Ledger authenticated acceptance

- PR `#197`: `test(daily-ledger): authenticate freeze and adjustment lifecycle` đang mở.
- Base lúc mở PR: `80496b056fa0f23f18311e5822c21dc826bacd9f`; exact head phải kiểm tra lại trước mọi kết luận vì `main` đã tiến sau đó.
- Acceptance mục tiêu: authenticated cookie/CSRF, Purchase source thật, idempotent snapshot, reconciliation, freeze, append-only/idempotent adjustment và explicit tenant selector fail closed.
- Không coi P1 DONE cho tới khi PR canonical được đồng bộ với current main, exact-head required workflows PASS và merge evidence có thật.

## Production boundary

Checkpoint production lịch sử gần nhất trong handoff:

- Alumdoor production exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Meta installer run `30707517624`: PASS.
- Alumdoor Meta tại checkpoint đó: `2.1.0`.

Đây là historical checkpoint. Source ALUM đã tới `2.1.2`, nhưng không được suy ra production đã được cài version đó. Merge không đồng nghĩa được phép deploy.

## Chưa hoàn tất toàn hệ thống

1. P1 Daily Detailed Ledger authenticated acceptance — active ở PR `#197`, cần current-main/exact-head verification.
2. MetaForge UX V2: List Workspace V2 tích hợp Bulk, Matrix View, presentation authoring/canonical transport, document context/exception, operational workspace, mobile V2 và personalization/AI context.
3. Bulk Transaction strategy cho Stock Reconciliation/BOM và transaction-grid nhập nhôm nhiều mã.
4. P2 warranty/defects/capacity/overtime.
5. P3 authenticated end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- GitHub là nguồn sự thật; mọi SHA/PR trong file này chỉ là snapshot.
- Một epic/slice độc lập dùng một branch/PR canonical; branch diverged không được cứu bằng merge main/force-push theo mặc định.
- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
