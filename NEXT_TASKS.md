# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. Không dùng file này thay cho GitHub khi cần exact branch head, PR state hoặc CI. Trước khi làm đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md` và kiểm tra GitHub hiện tại.

## DONE P0 — QR / lineage + cleanup QA

- PR `#189` merged tại `80496b056fa0f23f18311e5822c21dc826bacd9f`.
- Final validated head: `ee396fd26b2355a4f3e1d62c92f41468be489443`.
- Required workflows: **6/6 PASS**.
- Đã khóa physical quantity/kg + reservation availability + batch/bundle lineage + QR/document identity + role/session/CSRF + cleanup zero residue trên authenticated local D1 evidence.
- Không deploy production trong slice này.

Không mở lại stock P0 nếu không có regression cụ thể.

## DONE P1 BUG — Bulk unsaved-edit guard

- PR `#195` merged tại `2e5860b90410845545df33115c6f053925b65c72`.
- Final validated head: `7e51b9955a0fca2f864df6ac0a278f61c510d5ec`.
- Required workflows: **6/6 PASS**.
- Bulk View chặn mode switch khi có patch chưa lưu, có destructive confirmation và `beforeunload` guard.
- PR `#192` đã đóng/superseded; không reopen.

## NEXT P1 — Daily detailed ledger

Đây là task canonical ưu tiên cao nhất sau khi stock P0 đã khép. Bắt đầu trên branch mới từ exact current `main`, trừ khi GitHub cho thấy đã có một PR canonical khác đang làm đúng cùng scope.

### Mục tiêu nghiệp vụ

- Có snapshot chi tiết theo **ngày + tenant + dimension nghiệp vụ** để đối soát xuyên Sales, Purchase, Inventory, Manufacturing và Finance.
- Snapshot là immutable sau khi freeze; sửa sau khóa phải đi bằng adjustment append-only, không rewrite lịch sử.
- Re-run cùng input phải idempotent, không tạo duplicate ledger hoặc double adjustment.
- Có reconciliation tổng/chi tiết và chỉ ra chênh lệch theo nguồn.

### Data integrity / high-risk gates

1. Xác định canonical source cho từng miền, không tạo sổ cạnh tranh với stock ledger/accounting ledger hiện có.
2. Snapshot key/unique/index phải chặn duplicate cùng tenant/date/dimension/version.
3. Freeze phải chặn direct update/delete của snapshot đã khóa.
4. Adjustment sau freeze bắt buộc reason, actor, timestamp, source reference và audit trail; append-only.
5. Transaction/finalization phải atomic khi cùng lúc ghi snapshot + reconciliation metadata.
6. Tenant isolation bắt buộc ở query, API, export và cache.
7. Existing data/migration phải xử lý null/default/index/backward compatibility, không destructive migration.
8. Reconciliation tối thiểu Sales, Purchase, Inventory, Manufacturing, Finance; chênh lệch phải truy ngược được document/ledger source.

### Acceptance

- Regression tests cho idempotency, duplicate prevention, freeze, append-only adjustment, tenant isolation và reconciliation mismatch.
- Authenticated API/browser evidence nếu có UI/operator flow.
- Unit/integration/typecheck/lint/build + required CI PASS trên exact final head.
- Không deploy production nếu user chưa yêu cầu riêng.

## NEXT UI — MetaForge UX V2

Sau P1 ledger hoặc khi có branch riêng không tranh chấp high-risk work:

1. **List Workspace V2 + Bulk integration** — summary bar, saved views, smart filters, table/card responsive, contextual actions; Bulk là mode của cùng workspace.
2. **Matrix View** — User×Role, User×Warehouse/Department/Company, Item×Color, Item×UOM, Item×Reorder warehouse, Supplier×Item, account mapping.
3. **Presentation authoring / canonical transport** — first-class compiler/parser/selfcheck cho presentation và `viewPolicy.bulk`.
4. **Document context nâng cao** — related-document graph, timeline/activity, exception cards, business progress source thật.
5. **Operational workspace + Mobile V2** — role home/inbox/exception-first, rich list cards, context drawer/bottom sheet.
6. **Personalization / AI context** sau khi operational surfaces ổn định.

## NEXT — Bulk Transaction

Generic Bulk tuyệt đối không mass-update ledger/submitted transaction. Cần controller/method-backed workspace riêng:

1. Stock Reconciliation reference.
2. BOM parent + child/version reference.
3. Nhập nhôm nhiều mã / Purchase Receipt transaction grid.
4. Batch Print / QR label queue là action/workspace dùng chung, không cần ViewKind mới.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo quy trình 25.7.
- Warranty lifecycle + trách nhiệm chi phí.
- Supplier provisional AP hold/offset có approval.
- Capacity theo department/workstation calendar, 8 giờ/ngày, overtime/overload.

## P3 — End-to-end acceptance

Khóa hành trình authenticated xuyên miền:

`Sales Order -> Production -> material/stock -> delivery -> invoice/debt -> daily ledger -> adjustment -> warranty`

## Parallel PR guard

Repository có thể có PR khác đang mở cho manufacturing costing, petty cash, Plastic ERP hoặc UI. Trước khi chạm phải đọc exact PR/base/head/CI và current docs. Không nhập scope song song vào branch P1 ledger nếu không thật sự cùng dependency.

## Guardrails

- Mỗi epic/đợt sửa độc lập dùng branch/PR riêng từ exact current `main`.
- Không thay exact PR head khi required CI đang chạy nếu không có lý do kỹ thuật.
- Không force-push/rewrite branch stale để cứu lịch sử; clean transplant khi cần.
- Không deploy Cloudflare/production hoặc sửa production secrets/DNS nếu user chưa yêu cầu rõ.
- Không mutate customer production data.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifacts/evidence.
