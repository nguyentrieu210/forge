# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. Không dùng file này thay cho GitHub khi cần exact branch head, PR state hoặc CI. Trước khi làm đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md` và kiểm tra GitHub hiện tại.

## CURRENT — Plastic ERP P0-A ready, merge requires explicit user instruction

- Canonical PR: `#200`, branch `feat/plastic-erp-foundation-v3-20260802`.
- Base exact `main`: `866fcbd909914f01600def9ce86e3ce2347bb763`.
- PR #200 hiện open + ready-for-review, chưa merge.
- Exact head `edcab9cae6ea6187886fdaff45f6f549b971a2e7` đã **6/6 required workflows PASS** sau closing docs, gồm Main CI tests/typecheck/build.
- Root-cause CI fix: đổi `Plastic Machine.status` và `Plastic Tool.status` sang `operational_state`; kernel reserved-field validation giữ nguyên fail-closed.
- PR `#193` đã được comment superseded và đóng; không reopen/merge.
- Các commit sau `edcab9ca…` chỉ đồng bộ trạng thái tài liệu; exact current GitHub head vẫn phải PASS required CI trước khi dừng.
- **Không merge #200 nếu user chưa yêu cầu rõ.**

## NEXT P0-B — Plastic Production Run + shop-floor

**Blocker:** chỉ mở branch implementation mới từ exact current `main` sau khi P0-A đã được merge; không build P0-B trên branch P0-A và không trộn vào PR `#200`.

### Main flow

1. Gán Work Order vào machine + tool/mold + shift/operator theo company/branch.
2. Run lifecycle: start → pause/resume → complete/cancel/reverse với transition server-authoritative.
3. Ghi actual material lot consumption, good output, scrap, regrind/by-product và downtime reason.
4. Reconcile actual production với canonical Work Order và **submitted Stock Entry Manufacture**; không tạo stock ledger thứ hai.
5. Idempotency/concurrency: duplicate start/complete/stock posting phải fail hoặc trả cùng kết quả an toàn; không double consume/output.
6. Tenant/company/branch scope bắt buộc ở query/write/links; chặn IDOR cross-tenant/cross-company.
7. Machine/tool compatibility và exclusive-resource conflict phải được server enforce, không chỉ UI.
8. Submitted/posted operation phải append-only/reversal; không rewrite stock/manufacturing history.

### Shop-floor surfaces

- Desktop planner/manager: run queue, assignment, status, exceptions, material availability, output/scrap/downtime.
- Mobile operator: authenticated start/pause/resume/complete, scan Work Order/lot nếu primitive hiện có hỗ trợ, validation/error/loading/success rõ.
- Không hard-code UI riêng cho từng plastic technology; dùng `process_type`/process profile + metadata/domain policy.

### Regression / acceptance

- Unit/integration cho transition, compatibility, resource overlap, tenant/company scope, idempotency và reversal.
- Regression chứng minh complete run không double-post Stock Entry Manufacture.
- Authenticated desktop/mobile acceptance với role thật, session/CSRF thật và negative permission path.
- Tests/typecheck/lint/build + required workflows PASS trên exact final head.
- Không deploy production nếu user chưa yêu cầu riêng.

## NEXT P0-C — Plastic QC lot gate

Sau P0-B:

1. Incoming / in-process / final inspection theo lot/batch.
2. Release / Hold / Reject server-authoritative.
3. Hold/Reject chặn consume/reservation/delivery theo policy; không chỉ ẩn UI.
4. NCR + defect/disposition + rework/scrap/release lineage.
5. Numeric/text/pass-fail characteristics, tolerance/spec revision và COA-ready data model.
6. Trace finished lot → run → raw lots và raw lot → affected runs/finished lots/customer delivery.

## NEXT P1 — Plastic capacity + operational costing

- Shift/calendar, machine/tool overlap, capacity/load, setup/changeover và downtime/OEE inputs.
- Material actual value + recovered scrap/regrind + machine/labor/energy/overhead + setup/tool cost policy.
- Cost per run/batch/item và standard-vs-actual variance.
- Không tạo costing source cạnh tranh với canonical accounting/stock valuation; operational costing phải reconcile/bridge được.

## NEXT P2 — Plastic E2E acceptance

`Purchase raw material → Incoming QC → lot release → recipe/BOM → schedule → Work Order → issue → Production Run → in-process QC → finished batch → final QC → packing/warehouse → sales delivery → costing/traceability`

Parallel supporting epics sau core production: maintenance/OEE, preprocessing/drying/mixing, packaging/labels/pallet, supplier quality/returns, recall, sales forecast/MRP/ATP/MTO/MTS, deeper lab QC/COA và device integration.

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

## PARALLEL P1 — Daily detailed ledger

Đây vẫn là high-risk canonical task quan trọng, nhưng **không trộn vào Plastic ERP PR/branch**. Mở branch riêng từ exact current `main` khi không tranh dependency với Plastic P0-B hoặc khi user chuyển ưu tiên.

### Mục tiêu nghiệp vụ

- Snapshot chi tiết theo ngày + tenant + dimension nghiệp vụ để đối soát xuyên Sales, Purchase, Inventory, Manufacturing và Finance.
- Snapshot immutable sau freeze; sửa sau khóa bằng adjustment append-only, không rewrite lịch sử.
- Re-run cùng input idempotent, không duplicate ledger/double adjustment.
- Có reconciliation tổng/chi tiết và truy nguồn chênh lệch.

### Data integrity / high-risk gates

1. Canonical source từng miền, không tạo sổ cạnh tranh với stock/accounting ledger.
2. Snapshot key/unique/index chặn duplicate tenant/date/dimension/version.
3. Freeze chặn direct update/delete snapshot đã khóa.
4. Adjustment sau freeze bắt buộc reason, actor, timestamp, source reference, audit trail; append-only.
5. Finalization atomic cho snapshot + reconciliation metadata.
6. Tenant isolation ở query/API/export/cache.
7. Migration xử lý existing data/null/default/index/backward compatibility, không destructive.
8. Reconciliation tối thiểu Sales, Purchase, Inventory, Manufacturing, Finance và truy được document/ledger source.

## NEXT UI — MetaForge UX V2

Sau high-priority domain work hoặc trên branch riêng không tranh dependency:

1. List Workspace V2 + Bulk integration.
2. Matrix View.
3. Presentation authoring / canonical transport.
4. Document context nâng cao.
5. Operational workspace + Mobile V2.
6. Personalization / AI context.

## NEXT — Bulk Transaction

Generic Bulk tuyệt đối không mass-update ledger/submitted transaction. Cần controller/method-backed workspace riêng:

1. Stock Reconciliation reference.
2. BOM parent + child/version reference.
3. Nhập nhôm nhiều mã / Purchase Receipt transaction grid.
4. Batch Print / QR label queue là action/workspace dùng chung.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo quy trình 25.7.
- Warranty lifecycle + trách nhiệm chi phí.
- Supplier provisional AP hold/offset có approval.
- Capacity theo department/workstation calendar, 8 giờ/ngày, overtime/overload.

## P3 — End-to-end acceptance

Khóa hành trình authenticated xuyên miền:

`Sales Order -> Production -> material/stock -> delivery -> invoice/debt -> daily ledger -> adjustment -> warranty`

## Plastic ERP invariants

- Không tạo second stock ledger/costing source.
- Không fork core theo Injection/Extrusion/Blow/Film/Compounding; dùng process type + domain policy.
- Lot/batch lineage là canonical identity cho traceability.
- Submitted/posted records append-only hoặc reversal.
- Resource conflict + QC gate phải server enforce.
- Không deploy/secrets/production mutation nếu chưa có lệnh rõ.

## Parallel PR guard

Repository có thể có PR khác đang mở cho manufacturing costing, petty cash, Plastic ERP hoặc UI. Trước khi chạm phải đọc exact PR/base/head/CI và current docs. Không nhập scope song song vào branch khác chỉ vì cùng chạm finance/manufacturing.

## Guardrails

- Mỗi epic/đợt sửa độc lập dùng branch/PR riêng từ exact current `main`.
- Không thay exact PR head khi required CI đang chạy nếu không có lý do kỹ thuật.
- Không force-push/rewrite branch stale để cứu lịch sử; clean transplant khi cần.
- Không deploy Cloudflare/production hoặc sửa production secrets/DNS nếu user chưa yêu cầu rõ.
- Không mutate customer production data.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifacts/evidence.
