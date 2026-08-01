# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; active queue ở `NEXT_TASKS.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho default branch, exact HEAD, PR, CI, merge và release evidence.
- Luôn đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này.
- Mọi SHA/branch dưới đây là historical checkpoint, không phải lệnh checkout.

## MetaForge checkpoints

### Canonical Meta / Form

- PR `#164` merged: canonical first-party Meta boundary; `apps-src` là authoring source, compiler là boundary first-party.
- PR `#176` merged tại `a7643cee0102aee1c37d4f00afac1594d0261e68`, final head `acf53e12b3e59f21dde35ad6f27cc014fb624c00`, required workflows 6/6 PASS.
- `resolveFormRenderPolicy()` là composition point cho existing/full/quick Form.
- `viewPolicy.*.enabled/fields` là runtime policy; `surface=internal` là hard visibility boundary.

### Document Experience V2

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`, final head `1a79c28832aed7731601bb9ea378f9a4a3cc01db`, required workflows 6/6 PASS.
- Archetype: `master`, `transaction`, `inventory`, `production`, `approval`, `ledger`, `analysis` + generic fallback.
- Presentation resolver chỉ dùng field còn tồn tại sau canonical form policy; permission/workflow/actions vẫn server-authoritative.

### Bulk View

- PR `#190` merged tại `28eb4c4af6f88f0d1c3dc56c8f50e8d31fe2e968`, final head `bc75667d1a2078e6483c1a63a4afa1e94bde9de5`, required workflows 6/6 PASS.
- `resolveBulkRenderPolicy()` là composition point cho generic Bulk v1.
- Generic Bulk chỉ `document_update` trên master; fail closed với transaction/submittable/child/single và protected/conditional-readonly fields.
- `BulkGridView`/`BulkGridContainer`: selection, paste Excel/Sheets, fill-down, search/paging, discard, optimistic concurrency theo `modified`, lỗi từng dòng.
- ALUM source `2.1.2` có Bulk config cho 15 master DocType; `Item Price` chỉ bulk-edit `rate/note/disabled`.
- Canonical runtime contract là `viewPolicy.bulk`. Large brief sidecar hiện transport qua compatibility `viewPolicy.mobile.bulk`; first-class short-brief compiler/parser transport vẫn là follow-up.
- Matrix View là primitive tiếp theo cho quan hệ hai chiều. Transaction/ledger phải dùng controller-backed Bulk Transaction strategy, không generic document update.

### Bulk dirty-guard

- PR `#195` merged tại `2e5860b90410845545df33115c6f053925b65c72`.
- Final validated head: `7e51b9955a0fca2f864df6ac0a278f61c510d5ec`, required workflows 6/6 PASS.
- Root cause đã khóa: dirty patch nằm trong `BulkGridContainer`, nhưng workspace trước đây không biết nên mode switch có thể unmount và mất patch.
- Fix canonical: `BulkGridContainer` phát `onDirtyChange` + `beforeunload`; `DoctypeWorkspace` yêu cầu destructive confirmation khi chuyển Bulk → List còn dirty.
- PR `#192` và `#196` đã đóng, không merge. Không dùng chúng làm live source; #195 là canonical merge.

## Stock checkpoints

### Authenticated stock / reservation foundations

- PR `#167`: authenticated stock lifecycle + mobile canonical contracts — merged.
- PR `#170`: Stock Entry operational submit RBAC — merged.
- PR `#173`: physical-stock catch-weight reconciliation — merged.
- PR `#175` merged tại `509db8c32625168316696fb0deb3760a434aedf9`, final head `e839599ddf23e6cf89a325497b62f20085f62ffd`, required workflows 6/6 PASS.
- Reservation giảm available nhưng không thay physical stock; release phục hồi available; over-reservation/double-release fail đúng contract.

### P0 QR / lineage + cleanup QA

- PR `#189` merged tại `80496b056fa0f23f18311e5822c21dc826bacd9f`.
- Final validated head `ee396fd26b2355a4f3e1d62c92f41468be489443`, required workflows 6/6 PASS.
- Physical-stock lineage giữ exact item/warehouse/physical identity/batch/serial/bundle + voucher type/name/row.
- Two-identity regression khóa không lẫn lineage.
- Stock Reconciliation print render thật và QR dùng exact document `name`.
- Authenticated desktop/mobile dùng role nghiệp vụ, cookie + CSRF thật; invalid session/CSRF/identity fail closed.
- Cleanup dùng exact QA manifest trên local D1 ephemeral, schema-preflight trước mutation và hậu kiểm zero residue; không wildcard shared fixtures.
- P0 stock acceptance không còn active sau merge #189; chỉ mở lại khi có regression cụ thể.

## Sales / Purchase checkpoint

- Sales-to-Production PR `#131` merged.
- Tiến Đạt purchase FIFO PR `#134` merged.
- Purchase authenticated QA PR `#137` merged.
- Tiến Đạt complete operations UI PR `#179` merged tại `e44ade8ca1ab396a66b800844b755de203be9245`, final required workflows 6/6 PASS.
- Generic FIFO production không được tự bật chỉ vì Tiến Đạt flow đã có source/test.

## Active system work

- P1 Daily Detailed Ledger authenticated acceptance hiện có PR `#197` mở.
- PR #197 được mở từ base `80496b056fa0f23f18311e5822c21dc826bacd9f`; vì `main` đã tiến sau đó, phải kiểm tra divergence trước khi dùng làm merge source.
- Acceptance P1 cần authenticated cookie/CSRF, Purchase source thật, idempotent snapshot, reconcile, freeze, append-only/idempotent adjustment và tenant fail-closed.

## Production checkpoint lịch sử

- Alumdoor production exact SHA: `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Alumdoor Meta installer `30707517624`: PASS.
- Production Alumdoor Meta tại checkpoint đó: `2.1.0`.

Đây là snapshot lịch sử. Source ALUM hiện `2.1.2`; không suy ra production đã cài version đó.

## Phần còn thiếu cấp hệ thống

1. P1 Daily Detailed Ledger authenticated acceptance.
2. MetaForge UX V2: List Workspace V2, Matrix View, presentation authoring/canonical transport, document context/exception, operational workspace, mobile V2, personalization/AI context.
3. Bulk Transaction cho Stock Reconciliation/BOM và transaction-grid nhập nhôm nhiều mã.
4. P2 warranty/defects/capacity/overtime.
5. P3 end-to-end authenticated acceptance Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Release / file boundary

- Không deploy Cloudflare/production nếu user chưa yêu cầu rõ.
- Không sửa production secret/DNS hoặc mutate customer data.
- Merge code không đồng nghĩa được phép deploy production.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie/token/credential hoặc generated evidence/build artifact không được repo quản lý.
