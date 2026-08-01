# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục. GitHub là nguồn sự thật cho exact branch head, PR, CI và release evidence.

## NEW EPIC — Plastic Factory ERP

### Gate hiện tại: G1 Requirements — enterprise scope

- Branch BRD: `feat/plastic-factory-erp-brd-20260802`.
- BRD: `docs/plastic-factory-erp/BRD.md`.
- Enterprise scope: `docs/plastic-factory-erp/ENTERPRISE_SCOPE.md`.
- Scope hiện bao phủ 50 domain plant-wide: organization, CRM/sales, forecast, S&OP/MPS/MRP, PLM-lite, material spec, supplier/SRM, procurement, inbound, WMS, drying/mixing, recipe/routing, machine/tooling, finite scheduling, MES-lite, process profiles, changeover, production movement, QMS/metrology/NCR, EAM/MRO, energy/EHS/sustainability, packing/shipping/recall, complaints/subcontract, costing/finance/treasury, HR operational, document control, audit/approval, BI/alerts, portals, integrations, security/DR và multi-plant foundation.
- Không implementation sâu trên branch BRD này.
- G1 chưa complete cho tới khi khóa các decision ảnh hưởng process/data model.

### G1 decisions cần chốt

1. Process profile: Injection / Extrusion / Blow / Film / Compounding / mixed.
2. Production UOM: kg / pcs / m / roll / mixed.
3. Có drying/mixing/dosing hay không.
4. Regrind: internal / external recycler / both.
5. Mold/die/tool depth và customer-owned tooling nếu có.
6. QC: release gate đơn giản hay lab/SPC đầy đủ.
7. Packing hierarchy: bag/carton/pallet/roll.
8. Finance: operational costing trước hay full accounting cùng rollout.
9. Single plant hay multi-plant-ready ngay từ schema.
10. Thiết bị rollout đầu: scale, printer, scanner, PLC, energy meter.

Nếu chưa có câu trả lời, schema foundation vẫn giữ extension points; không hard-code default thành invariant.

### Sau G1 — G2 architecture/dependency decomposition

Không nhảy thẳng từ BRD sang một mega-branch. Tách theo dependency, mỗi epic một branch/PR:

**E01 Foundation + master governance**
- Plant/workshop/work center/warehouse/bin/shift/calendar.
- Plastic material/product specification, revision/effective-date governance.
- Shared taxonomy: defect, downtime, scrap, root cause, disposition.

**E02 Demand + S&OP/MPS/MRP**
- Forecast/Sales Order demand.
- MPS/MRP, BOM explosion, shortage, pegging, planned purchase/production.

**E03 Supplier + procurement + inbound/QC**
- Supplier approval, PO/receipt, supplier lot/internal lot.
- Quarantine → incoming inspection → release/hold/reject.

**E04 WMS + barcode/dual-UOM**
- Zone/bin/pallet/package identities.
- FIFO/FEFO/allocation/reservation/pick/putaway/reconcile.
- Barcode/QR and scale/printer adapter seams.

**E05 Engineering + recipe + routing**
- Recipe/BOM revision.
- Routing, process parameters, packaging/QC spec revision.
- ECO/impact analysis and immutable Work Order snapshot.

**E06 Machine + mold/tooling + capacity**
- Resource master/compatibility.
- Mold/die/tool lifecycle, shots/cycles, availability.
- Finite scheduling conflict guards.

**E07 Material preparation + changeover**
- Drying/mixing/dosing/staging.
- Purge/startup scrap, setup/changeover, first-piece approval.

**E08 Production Run + shop-floor MES**
- Dispatch/start/pause/resume/complete.
- Actual lot consumption, good output, scrap/regrind/by-product.
- Mobile authenticated acceptance, idempotency/concurrency/reversal.

**E09 Process profiles**
- Injection / Extrusion / Blow / Film / Compounding policy plugins as actually required.
- Không fork stock/WO/costing core.

**E10 QMS + NCR + CAPA + metrology**
- Incoming/in-process/final/first-piece.
- Hold/Reject fail-closed gates.
- NCR, rework, CAPA/8D, calibration.

**E11 Maintenance/EAM + MRO + OEE**
- PM by calendar/runtime/shot.
- Breakdown, spare part, downtime.
- MTBF/MTTR/PM compliance and OEE source events.

**E12 Packing + shipment + genealogy/recall**
- Pack/carton/pallet/roll identities.
- Label templates, pick/load verification.
- Backward/forward trace and recall drill.

**E13 Costing + finance bridge**
- Actual material/recovery/scrap/setup/machine/labor/energy/overhead.
- WIP/FG/COGS bridge and period close semantics.
- Full AP/AR/GL can follow as separate finance scope if not first rollout.

**E14 Document control + EHS + sustainability + energy**
- SOP/WI/spec revisions.
- SDS/waste/environment data.
- Virgin/recycled/regrind mass balance.
- Utility metering/cost hooks.

**E15 Enterprise cockpit + alerts + integrations**
- KPI definitions with source/grain/formula/drill-down.
- Exception inbox and escalation.
- Scanner/printer/scale/PLC/IoT adapters with idempotent integration contracts.

**E16 End-to-end acceptance**
- Order → MRP → Purchase → raw QC → prep → schedule → production → QC → packing → shipment → costing.
- Breakdown/maintenance/OEE journey.
- Complaint/recall journey.
- Concurrent-device and authenticated failure-path journey.

### Plastic ERP hard invariants

- Một stock ledger canonical.
- Một lot/batch genealogy canonical.
- Một submitted-document source of truth.
- Không fork core riêng theo công nghệ nhựa; dùng process policy.
- Recipe/routing/spec used by released WO phải snapshot/version đúng.
- QC gate/resource conflict/permission enforced server-side.
- Submitted stock/cost/quality dùng reversal/adjustment, không sửa lịch sử trực tiếp.
- Regrind phải có source lineage và valuation.
- Lot split/merge không mất genealogy.
- Device/PLC retry idempotent, không double stock/output.
- KPI phải drill-down về source transaction.
- Không deploy Cloudflare, sửa production secrets/DNS hoặc mutate customer data nếu chưa có lệnh explicit phù hợp project guardrail.

### Definition of Done cho ERP nhựa toàn nhà máy

- Demand/MRP/procurement/production planning chạy xuyên suốt.
- Raw lot + QC + WMS + production genealogy đúng.
- Shop-floor/machine/mold/changeover/regrind chạy thật.
- QMS/NCR/CAPA và maintenance/OEE có source event thật.
- Packing/shipment/recall forward-backward trace pass.
- Costing reconcile inventory; finance bridge/full finance theo rollout đã chốt.
- RBAC, tenant/company/plant, desktop/mobile, concurrency/idempotency và backup/recovery evidence pass.

## DONE — PR #175 Authenticated reservation availability lifecycle

- PR `#175` merged.
- Final validated head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Merge commit: `509db8c32625168316696fb0deb3760a434aedf9`.
- Final exact-head required workflows: **6/6 PASS**.
  - CI `30718759652`: tests/typecheck/build PASS.
  - UI Pull Request Validation `30718759696`: frontend lint/build + browser QA + authenticated cookie/CSRF reservation lifecycle PASS.
  - PR Validation `30718759665`: PASS.
  - Purchase Feature CI `30718759676`: PASS.
  - Sales Feature CI `30718759661`: PASS.
  - Inventory and Manufacturing CI `30718759660`: PASS.
- Tracked receipt 10 cây có Batch/Bundle thật; giữ 6 làm available còn 4 nhưng physical stock vẫn 10.
- Over-reservation 5 bị từ chối với số khả dụng đúng; release phục hồi available; giữ đủ 10 làm available về 0.
- Double-release và terminal-state reversal bị từ chối.
- Desktop/mobile, role nghiệp vụ, cookie + CSRF thật đều PASS trên local D1 ephemeral.
- Không deploy Cloudflare, không đổi production secrets/DNS, không mutate tenant production.

## NEXT P0 — QR/lineage end-to-end + cleanup QA

Mục tiêu: khóa nốt truy vết vật lý và chứng minh toàn bộ dữ liệu QA có thể dọn sạch không residue. Sau slice này stock acceptance mới chuyển P0 sang DONE.

### 1. QR / lineage end-to-end

- Dùng item theo lô, Batch và Serial and Batch Bundle thật từ authenticated lifecycle.
- Physical-stock report `include_lineage=true` phải truy ngược đúng:
  - voucher type/name;
  - voucher row;
  - batch;
  - bundle;
  - warehouse và item identity.
- Tạo một identity thứ hai để chứng minh lineage không lẫn batch/bundle/voucher giữa hai luồng.
- Với Stock Reconciliation, render print format thật và khóa QR output sinh từ chính document `name`; không chỉ kiểm chuỗi template.
- QR hoặc URL phải mở đúng document route và không lộ dữ liệu tenant khác.
- Giữ quantity, kg và reservation assertions hiện có trong cùng authenticated acceptance hoặc regression suite liên quan.

### 2. Cleanup QA không residue

- Mọi user/item/kho/batch/bundle/reservation/chứng từ QA phải có prefix hoặc lineage nhận diện duy nhất.
- Cleanup theo dependency chỉ trên local D1 ephemeral:
  1. release/terminalize reservation còn hoạt động;
  2. xóa child/index/read-model state phù hợp;
  3. xóa documents QA theo thứ tự phụ thuộc;
  4. xóa user/role fixture QA riêng nếu contract cho phép.
- Không xóa fixture catalogue dùng chung như UOM, Item Group, Account hoặc metadata Alumdoor.
- Sau cleanup chạy truy vấn xác minh không còn QA residue trong:
  - documents và document_children;
  - stock ledger/read model;
  - reservation state;
  - batch/bundle rows;
  - user/role rows được tạo riêng cho test.
- Cleanup phải idempotent hoặc fail rõ khi chạy lần hai; không được xóa theo wildcard quá rộng.

### 3. Authenticated failure paths

- Desktop + mobile, cookie + CSRF thật.
- `Thủ kho`/`Chủ xưởng` tiếp tục làm stock operation theo RBAC đã chốt.
- Invalid CSRF/session phải bị từ chối.
- Sai QR/document identity hoặc lineage tenant khác phải fail closed.
- Immutable submitted records và reservation terminal state tiếp tục bị khóa.

### Done condition P0

- Quantity + kg + reservation + QR/lineage reconcile không chênh lệch.
- Lineage truy ngược đúng voucher/batch/bundle và không lẫn identity.
- Stock Reconciliation print render sinh QR từ đúng document name và route.
- Cleanup PASS; truy vấn hậu kiểm không còn QA residue.
- Desktop/mobile + role/CSRF/session failure paths PASS.
- Không mutate dữ liệu khách hàng.
- Không deploy production nếu user chưa yêu cầu riêng.

## P1 — Daily detailed ledger

- Immutable snapshot theo ngày/company/warehouse/customer/order.
- Re-run cùng input idempotent, không sinh snapshot trùng.
- Freeze chặn direct edit sau khi khóa.
- Adjustment sau khóa append-only, có reason/actor/timestamp/audit trail.
- Reconciliation ít nhất Sales, Purchase, Inventory, Manufacturing và Finance.
- Permission và tenant boundary phải được kiểm bằng test + authenticated evidence.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo quy trình 25.7.
- Bảo hành motor/bình lưu điện 12 tháng từ ngày giao.
- Supplier provisional AP hold + offset có phê duyệt.
- Customer defect cost theo công đoạn/người chịu trách nhiệm.
- Capacity theo department/workstation calendar, 8 giờ/ngày, overtime và overload.

## P3 — End-to-end acceptance

Sales Order → Production Request → Work Order → material issue/consume → paint → delivery → invoice/debt → daily ledger → adjustment → warranty.

## Guardrails

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không deploy production chỉ để lấy UI evidence.
- Không sửa production secrets/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated artifacts/evidence.
- Production Alumdoor giữ SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55` / metadata `2.1.0` cho tới release riêng có approval/evidence.
