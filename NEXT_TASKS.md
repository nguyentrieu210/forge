# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. Không dùng file này thay cho GitHub khi cần exact branch head, PR state hoặc CI. Trước khi làm đọc `RUNBOOK.md` và `CURRENT_STATUS.md`.

## ACTIVE UI — hoàn tất PR #192 Bulk View dirty guard

Branch canonical: `fix/metaforge-bulk-dirty-guard-20260802`.

Đã hoàn tất executable fix:

- `BulkGridContainer` phát dirty state lên workspace và đăng ký `beforeunload` guard khi có patch chưa lưu;
- `DoctypeWorkspace` chặn chuyển `Nhập hàng loạt -> Danh sách` khi dirty;
- destructive confirmation cho phép tiếp tục chỉnh hoặc chủ động bỏ patch;
- save/discard vẫn đưa dirty state về false, không đổi permission/optimistic concurrency/backend contract;
- exact executable head `6e963cda7945567fa330b44a8c5f139c032c3c19` đã **6/6 PASS**:
  - CI `30721693001`: tests/typecheck/build PASS;
  - UI Pull Request Validation `30721692982`: lint/build + MetaForge workspace browser QA + Alumdoor browser QA PASS;
  - PR Validation `30721692990`: PASS;
  - Purchase Feature CI `30721692997`: PASS;
  - Sales Feature CI `30721692984`: PASS;
  - Inventory and Manufacturing CI `30721693014`: PASS.

Việc còn lại của PR #192:

1. Chạy exact-head required CI lại sau commit status/tasks.
2. Nếu final head xanh, chuyển PR từ draft sang ready for review.
3. Không merge nếu chưa có quyết định merge riêng cho PR #192.

## DONE UI — MetaForge Bulk View + ALUM master grids

- PR `#190` merged tại `28eb4c4af6f88f0d1c3dc56c8f50e8d31fe2e968`.
- Final validated head: `bc75667d1a2078e6483c1a63a4afa1e94bde9de5`.
- Required workflows: **6/6 PASS**.
- PR `#182` đã đóng, không merge; không dùng branch đó làm nguồn live state.
- Generic Bulk v1 chỉ `document_update` trên master an toàn, fail closed cho transaction/submittable/child/single và field protected/conditional-readonly.
- ALUM `2.1.2` source có Bulk config cho 15 master DocType; production chưa được deploy trong slice này.

Không mở lại #182. Regression Bulk mới phải sửa từ current `main`.

## DONE UI — MetaForge Document Experience V2 foundation

- PR `#184` merged tại `df84eaec03526eaae2e2c3de3e9b8d388ae30f1a`.
- Final validated head: `1a79c28832aed7731601bb9ea378f9a4a3cc01db`.
- Required workflows: **6/6 PASS**.
- Đã có presentation resolver an toàn, 7 archetype + generic fallback, document hero, semantic status, metric cards, context strip/rail và skeleton loading.
- Không deploy production.

## ACTIVE P0 — PR #189 QR / lineage + cleanup QA

P0 stock acceptance hiện đã có clean PR `#189`. Không mở branch P0 cạnh tranh khi #189 còn active.

### Done condition P0

- Physical-stock `include_lineage=true` truy đúng voucher type/name, voucher row, batch, bundle, warehouse và item identity.
- Có identity thứ hai chứng minh lineage không lẫn giữa hai luồng.
- Stock Reconciliation print render thật, QR sinh từ exact document `name` và route mở đúng document.
- Desktop + mobile, cookie + CSRF thật, role nghiệp vụ thật.
- Invalid session/CSRF, sai QR identity, cross-tenant lineage và immutable records fail closed.
- Cleanup local D1 ephemeral xóa đúng QA lineage, không wildcard shared fixtures, query hậu kiểm zero residue.
- Exact-head required workflows PASS trước merge.
- Không deploy production trong slice P0 này nếu user chưa yêu cầu riêng.

## NEXT UI — MetaForge UX V2 sau Bulk

Sau khi PR #192 kết thúc, Bulk dependency đủ an toàn để List Workspace V2 tiếp tục trên branch riêng từ exact current `main`, miễn không tranh chấp với task P0 đang active.

### Ưu tiên UI

1. **List Workspace V2 + Bulk integration** — summary bar, saved views, smart filters, table/card responsive và contextual quick actions; Bulk là mode/action của cùng workspace.
2. **Matrix View canonical contract + renderer** — User×Role, User×Warehouse/Department/Company, Item×Color, Item×UOM, Item×Reorder warehouse, Supplier×Item và account mapping.
3. **Presentation authoring / canonical transport** — đưa presentation và `viewPolicy.bulk` thành authorable metadata/sidecar có compiler/parser/selfcheck first-class và backward compatibility.
4. **Bulk Transaction strategy** — controller/method-backed grid cho Stock Reconciliation và BOM; không mass-update ledger/submitted docs.
5. **Nhập nhôm nhiều mã / Purchase Receipt transaction grid**.
6. **Batch Print / QR label queue** dưới dạng action/workspace.
7. **Document context nâng cao** — related-document graph, timeline/activity, exception cards và business progress source thật.
8. **Operational workspace + Mobile V2** — role home/inbox/exception-first, rich list cards, context drawer/bottom sheet và action zone màn nhỏ.
9. **Resource Scheduler** khi capacity/overtime P2 đi vào runtime.
10. **Personalization / AI context** sau khi các surface vận hành ổn định.

## P1 — Daily detailed ledger

- Immutable snapshot theo ngày và dimension nghiệp vụ.
- Re-run cùng input idempotent.
- Freeze chặn direct edit sau khóa.
- Adjustment sau khóa append-only có reason/actor/timestamp/audit trail.
- Reconciliation ít nhất Sales, Purchase, Inventory, Manufacturing và Finance.
- Permission + tenant boundary có test/authenticated evidence.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo quy trình 25.7.
- Warranty lifecycle và trách nhiệm chi phí.
- Supplier provisional AP hold/offset có phê duyệt.
- Capacity theo department/workstation calendar, 8 giờ/ngày, overtime/overload.

## P3 — End-to-end acceptance

Khóa hành trình authenticated xuyên miền:

`Sales Order -> Production -> material/stock -> delivery -> invoice/debt -> daily ledger -> adjustment -> warranty`

## Guardrails

- Mỗi epic/đợt sửa độc lập dùng branch/PR riêng từ exact current `main`.
- Không thay exact PR head khi required CI đang chạy nếu không có lý do kỹ thuật.
- Không deploy Cloudflare/production hoặc sửa production secrets/DNS nếu user chưa yêu cầu rõ.
- Không mutate customer production data.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifacts/evidence.
