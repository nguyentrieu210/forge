# Enterprise Scope — Forge Plastic Factory ERP

Ngày: 2026-08-02
Trạng thái: G1 Requirements expansion
Branch: `feat/plastic-factory-erp-brd-20260802`

## 1. Mục tiêu hệ thống

Forge Plastic Factory ERP không chỉ là phần mềm tạo Work Order. Mục tiêu là một hệ điều hành số cho nhà máy nhựa, nối liền từ nhu cầu thị trường, kỹ thuật sản phẩm, mua nguyên liệu, kho, sản xuất, chất lượng, bảo trì, đóng gói, giao hàng, tài chính, nhân sự vận hành, an toàn môi trường và quản trị dữ liệu.

Hệ thống phải có một nguồn sự thật cho stock, lot/batch, document lifecycle, costing và audit. Các công nghệ ép phun, đùn, thổi, film và compounding dùng chung kernel, khác nhau bằng process profile và policy, không fork thành các ERP riêng.

## 2. Bản đồ scope cấp enterprise

### D01 — Organization, plant và master governance — MUST

- Company, Plant, Workshop, Department, Work Center, Production Line, Warehouse, Bin/Location.
- Fiscal period, production calendar, shift calendar, holiday calendar.
- Numbering series theo plant/document.
- Data owner và approval owner cho từng master.
- Effective date, versioning, active/retired và audit trail cho master quan trọng.
- Multi-company, multi-plant, inter-plant transfer và company boundary.

### D02 — Customer, CRM và commercial master — MUST

- Customer, contact, ship-to, bill-to, customer-specific item code.
- Sales territory, sales owner, payment term, credit limit.
- Customer drawing/specification/packaging requirement.
- Price list, contract price, rebate/discount policy.
- Customer approval status cho sản phẩm/khuôn/mẫu màu.

### D03 — Sales order, forecast và demand management — MUST

- Quotation, Sales Order, blanket order/call-off.
- Forecast theo customer/item/week/month.
- Make-to-Order, Make-to-Stock và hybrid.
- Requested delivery date, confirmed date, priority, partial shipment.
- ATP/CTP dựa trên tồn available, QC state, WIP và capacity.
- Demand consumption giữa forecast và Sales Order.
- Backorder, allocation và order hold.

### D04 — S&OP, MPS và MRP — MUST

- Aggregate demand plan theo product family.
- Master Production Schedule theo item/plant/period.
- BOM explosion nhiều cấp.
- Net requirement sau on-hand, reservation, open PO, WIP và safety stock.
- Purchase requisition và planned production order.
- Lot sizing, MOQ, reorder rule, lead time, safety stock.
- Exception messages: expedite, postpone, cancel, shortage, excess.
- Pegging từ raw material shortage về Sales Order/forecast nguồn.

### D05 — Product engineering / PLM-lite — MUST

- Product master, drawing, specification, revision.
- Engineering BOM và Manufacturing BOM nếu cần tách.
- Recipe/BOM revision với effective interval.
- Routing/process route revision.
- Packaging specification revision.
- QC specification revision.
- Engineering Change Request / Engineering Change Order.
- Approval workflow và impact analysis lên open WO, inventory và customer orders.
- Customer-specific variant và alternate material rule.

### D06 — Plastic material specification — MUST

- Polymer family, grade, resin type, virgin/recycled/regrind classification.
- Masterbatch, additive, filler, pigment, packaging material.
- Supplier grade ↔ internal grade mapping.
- Color code, color standard, density, MFI/MFR hoặc thuộc tính kỹ thuật cấu hình.
- Shelf life, storage condition, drying requirement, moisture limit.
- Regrind allowed %, recycle content target, mixing constraints.
- Restricted/approved substitutions.

### D07 — Supplier và SRM — MUST

- Supplier qualification và approved vendor list.
- Supplier-item approval.
- Lead time, MOQ, price break, currency, Incoterm nếu dùng.
- Supplier lot/CoA/document requirement.
- Supplier quality score, defect PPM, on-time delivery, claim/return.
- Supplier corrective action và blocked supplier/item status.

### D08 — Procurement — MUST

- Purchase Requisition, RFQ, quotation comparison, Purchase Order.
- Contract/call-off purchasing.
- Raw material, packaging, spare part, service và subcontract purchase.
- Approval theo giá trị và loại mua.
- Advance/payment milestone nếu cần.
- Purchase Receipt theo supplier lot.
- Purchase Return, debit note/claim linkage.
- Three-way match PO ↔ Receipt ↔ Invoice khi Finance được bật đầy đủ.

### D09 — Inbound logistics và receiving — MUST

- ASN tùy chọn.
- Gate receipt, vehicle/container reference.
- Gross/tare/net weight nếu nguyên liệu theo cân.
- Supplier lot + internal lot generation.
- Sampling status và quarantine location.
- Discrepancy: thiếu/thừa/hỏng/sai grade.
- Putaway sau QC release.

### D10 — Warehouse Management System — MUST

- Warehouse zone: Receiving, Quarantine, Released RM, Rejected, WIP, Regrind, FG, Packaging, Spare Part.
- Bin/location management.
- Lot/batch, pallet, bag, roll, carton identity.
- Barcode/QR scan.
- FIFO/FEFO/configured allocation.
- Reservation, pick, issue, transfer, return, cycle count, reconciliation.
- Catch-weight/dual-UOM khi cần: kg + Nos/m/roll.
- Inventory status: Available, Hold, Quarantine, Rejected, Blocked.
- Aging, expiry, slow-moving và dead stock.
- Warehouse task queue cho handheld/mobile.

### D11 — Material preparation: drying, mixing, dosing — MUST khi công nghệ dùng

- Drying batch: dryer, lot, target temperature/time, actual temperature/time, moisture before/after.
- Mixing batch: raw lots, ratios, operator, mixer, start/end.
- Gravimetric/volumetric dosing setup nếu có.
- Material staging theo Work Order/run.
- Lot split/merge lineage.
- Purge material và startup material accounting.
- Reject mixing batch hoặc release sau QC.

### D12 — Recipe/BOM management — MUST

- Process type: Injection, Extrusion, Blow, Film, Compounding, Other.
- Version, effective date, approval và immutable WO snapshot.
- Material role, planned ratio/quantity, tolerance.
- Regrind/recycled content min/max.
- Alternate/substitute rules.
- Yield, expected scrap, startup scrap.
- Standard cycle/rate và standard resource group.
- Standard packaging output nếu liên quan.
- Circular dependency và overlap guard.

### D13 — Routing và process parameter standard — MUST

- Route steps: drying, mixing, molding/extrusion, trimming, printing, assembly, packing...
- Standard work center/machine group.
- Setup time, run time, queue/move time.
- Process parameter template theo product + machine + mold/die.
- Parameter min/target/max và revision.
- Special instruction, image/document attachment.
- First-piece approval requirement.

### D14 — Machine / production asset master — MUST

- Machine code, line, process type, capacity range.
- Clamp tonnage/screw size hoặc domain attributes cho injection.
- Extruder diameter/L:D hoặc attributes tương ứng khi dùng.
- Rated kg/h, cycle target, speed target, power kW.
- Supported material/product families.
- Status: Available, Running, Setup, Maintenance, Down, Retired.
- Hourly machine cost và utility model.
- Telemetry source mapping nếu tích hợp PLC/IoT.

### D15 — Mold, die, tooling và toolroom — MUST

- Mold/die/tool code, owner: company/customer/supplier.
- Product compatibility và machine compatibility.
- Cavity count, active cavity count, disabled cavity reason.
- Standard cycle, shot weight, runner type, hot-runner info nếu cần.
- Location và current custody.
- Shot counter/cycle counter.
- Preventive maintenance threshold.
- Repair history, insert/spare component history.
- Tool trial, sample approval, modification revision.
- Tool availability và reservation cho schedule.

### D16 — Production planning và finite scheduling — MUST

- Convert MPS/planned orders thành Work Orders.
- Machine, mold/die, work center và shift assignment.
- Capacity by calendar.
- Resource overlap prevention.
- Sequence optimization hooks: same color/material/mold family để giảm changeover.
- Due-date, priority và setup matrix.
- Freeze horizon và reschedule approval.
- Planner board theo machine/day/shift.
- Shortage và resource conflict visibility.

### D17 — Shop-floor execution / MES-lite — MUST

- Dispatch list “việc của ca này”.
- Login/scan operator, WO, machine, mold.
- Start setup → setup complete → first-piece approval → run.
- Start/Pause/Resume/Stop/Complete.
- Reason-coded pause/downtime.
- Material lot loading/change.
- Actual process parameter entry/telemetry.
- Good quantity, reject quantity, regrind quantity.
- Run split/merge theo ca hoặc machine change.
- E-sign/audit cho critical completion.
- Offline-tolerant mobile strategy nếu shop-floor mạng chập chờn, nhưng server vẫn authoritative khi sync.

### D18 — Injection molding process profile — CONDITIONAL

- Mold/cavity, shot weight, cycle time.
- Resin drying requirement.
- Barrel/mold temperature parameter set.
- Injection/holding/cooling parameter fields cấu hình.
- Shots, cavity output, cavity disable.
- Runner/sprue scrap và regrind.
- Color/material change purge.
- First-off sample và dimensional QC.

### D19 — Extrusion process profile — CONDITIONAL

- Die/tool, line speed, kg/h.
- Extruder zone temperatures, screw speed và pressure fields cấu hình.
- Product dimension/gauge/diameter target.
- Startup/head-tail scrap.
- Continuous run, reel/spool/length identity.
- Length/weight conversion và inline QC interval.

### D20 — Blow molding process profile — CONDITIONAL

- Mold/cavity, parison/preform source.
- Cycle time, product weight.
- Leak test requirement.
- Flash/trimming scrap và regrind.
- Container dimensional/visual QC.

### D21 — Film process profile — CONDITIONAL

- Resin blend/mixing batch.
- Film width, thickness/gauge, roll length/weight.
- Line speed, bubble/profile parameters nếu applicable.
- Corona/printing/lamination step hooks nếu nhà máy có.
- Roll identity và slit-child-roll genealogy.
- Trim scrap/recycle tracking.

### D22 — Compounding / pelletizing profile — CONDITIONAL

- Formula by percentage.
- Feeder calibration và feed rate.
- Mixer/extruder/pelletizer resource.
- Lot blending, sieve/filter reference.
- Pellet batch identity.
- MFI/color/moisture QC.
- Rework/reblend disposition.

### D23 — Changeover / setup management — MUST

- From-product/to-product, from-color/to-color, mold/die change.
- Planned setup duration vs actual.
- Cleaning/purge checklist.
- Setup material consumption.
- Startup scrap separate from steady-state scrap.
- Technician/operator assignment.
- SMED KPI và repeat setup history.

### D24 — Production material movement — MUST

- Material staging.
- Issue by lot.
- Return unused material.
- Consume actual lot quantity.
- Backflush only where policy allows.
- Semi-finished/WIP movement.
- Good output to finished batch.
- Scrap, regrind, by-product and exact reversal.
- No hidden stock mutation from shop-floor counters.

### D25 — Quality Management System — MUST

- Incoming, in-process, first-piece, patrol, final inspection.
- Inspection template revision.
- Numeric, categorical, visual và pass/fail characteristic.
- Sample plan và frequency.
- Release/Hold/Reject server-side gate.
- Deviation/concession/use-as-is approval.
- NCR, defect code, root cause, disposition.
- CAPA/8D workflow.
- Supplier corrective action.
- Customer complaint linkage.
- Calibration status của measuring equipment.
- SPC data foundation; control chart/Cp/Cpk là phase nâng cao nhưng data model phải hỗ trợ.
- CoA/CoC generation theo customer/spec khi cần.

### D26 — Metrology và calibration — MUST khi QC dùng thiết bị đo

- Gauge/instrument master.
- Calibration interval, due date, status.
- Internal/external calibration record.
- Out-of-calibration impact analysis lên inspections đã dùng thiết bị.
- Block instrument expired khỏi QC entry nếu policy bật.

### D27 — Nonconformance, rework và quarantine — MUST

- Segregated inventory status/location.
- NCR reference tới lot/run/customer/supplier.
- Rework Work Order.
- Reinspect after rework.
- Scrap approval threshold.
- Regrind/reblend route.
- Supplier return hoặc customer concession.
- Full quantity/value lineage.

### D28 — Maintenance / EAM — MUST

- Asset hierarchy: line → machine → subsystem/component.
- Preventive maintenance theo calendar, runtime, shots/cycles.
- Corrective/breakdown maintenance.
- Work request → Maintenance Work Order → execution → close.
- Spare part reservation/issue/return.
- Technician/skill assignment.
- Failure code, cause code, action code.
- Downtime start/end linked production run.
- MTBF, MTTR, PM compliance.
- Maintenance cost by asset.
- Warranty/service contract for machine/tool.

### D29 — Spare parts / MRO inventory — MUST

- Spare part catalogue, criticality, compatible asset.
- Min/max/reorder point.
- Serial/batch where needed.
- Tool crib/warehouse.
- Reservation to maintenance WO.
- Repairable spare loop.
- Vendor/service history.

### D30 — Utilities, energy và resource consumption — SHOULD

- Electricity, compressed air, water, chilled water, gas/steam where relevant.
- Meter readings/manual or IoT.
- kWh/kg, kWh/1000 pcs, energy/run/machine.
- Peak/load observation.
- Utility cost allocation to production.
- Abnormal consumption alert hooks.

### D31 — EHS / safety / environment — SHOULD, MUST nếu compliance yêu cầu

- SDS/document link cho chemicals/additives.
- Hazardous material classification và storage rule.
- PPE/checklist by operation.
- Incident/near-miss record.
- Corrective action.
- Waste stream: scrap, hazardous waste, recyclable waste.
- Waste quantity/disposal vendor/document.
- Environmental KPI and audit evidence.
- Permit/training expiry reminders.

### D32 — Sustainability / recycled content / mass balance — SHOULD

- Virgin vs recycled vs regrind content.
- Recycled-content declaration by finished batch.
- Material mass balance: purchased + opening + recovered = consumed + output + scrap + closing ± adjustment.
- Scrap recovery rate.
- Waste disposition.
- Carbon/energy data hooks without hard-coding a single reporting standard.

### D33 — Packing, labeling và palletization — MUST

- Packaging specification by customer/item.
- Bag/carton/tray/pallet hierarchy.
- Quantity/weight per pack.
- Pack, carton, pallet IDs.
- Label template version.
- Barcode/QR with item, lot, date, quantity and customer fields as policy allows.
- Repack/relabel audit.
- Pallet genealogy to finished lots.
- Packing confirmation before shipment.

### D34 — Finished-goods warehouse và shipping — MUST

- Putaway, allocation, wave/pick task if needed.
- FEFO/FIFO/customer-lot restriction.
- Load plan, Delivery Note, vehicle/container.
- Pick/pack/load scan verification.
- Shipment lot genealogy.
- Proof of delivery hook.
- Partial shipment/backorder.
- Returnable packaging tracking if applicable.

### D35 — Traceability, genealogy và recall — MUST

- Supplier lot → internal raw lot → drying/mixing batch → WO → production run → machine/mold/shift/operator → finished batch → pack/pallet → shipment → customer.
- Reverse trace from customer shipment back to every consumed lot.
- Forward trace from one raw lot to every affected finished batch/customer shipment.
- Lot split/merge lineage.
- Recall case: affected scope, blocked stock, customer list, shipped quantity, on-hand quantity.
- Recall drill evidence và completion time KPI.

### D36 — Customer return, complaint và warranty — MUST nếu bán thành phẩm trực tiếp

- RMA/customer return.
- Complaint category, defect, photos/documents.
- Trace returned lot to production genealogy.
- Disposition: replace, credit, rework, scrap, no-fault-found.
- 8D/CAPA link.
- Cost of poor quality và customer PPM.

### D37 — Subcontracting / outside processing — CONDITIONAL

- Send material/WIP to subcontractor.
- Supplier-owned/our-owned stock separation.
- Outside process PO/service cost.
- Receive processed goods with lot continuity.
- Yield/scrap reconciliation.
- QC release.

### D38 — Cost accounting / manufacturing costing — MUST

- Standard cost và actual cost.
- Raw material actual lot valuation.
- Regrind/by-product recovery.
- Scrap loss.
- Setup/changeover cost.
- Machine-hour, labor-hour, energy và overhead.
- Mold/tool amortization hook where required.
- WIP valuation.
- Production variance: material, usage, yield, rate, efficiency, overhead.
- Cost per run, batch, kg, piece, meter or roll.
- Period close, freeze và append-only adjustment.

### D39 — Finance / accounting — MUST cho ERP hoàn chỉnh

- Chart of Accounts và fiscal period.
- AP, AR, GL, cash/bank.
- Purchase Invoice, Sales Invoice, Payment, Journal Entry.
- Tax/localization layer tách khỏi manufacturing core.
- Inventory valuation ↔ GL reconciliation.
- WIP/finished goods/cost of goods sold postings.
- Accrual/prepayment where needed.
- Credit control.
- Budget/cost center/profit center.
- Period close và audit trail.

### D40 — Treasury và cash planning — SHOULD

- Customer receivable aging.
- Supplier payable aging.
- Expected cash inflow/outflow.
- Payment proposal/approval.
- Bank reconciliation.
- Short-term cash forecast.

### D41 — HR operational integration — SHOULD

- Employee, department, shift, attendance interface.
- Operator qualification/skill matrix.
- Machine authorization/certification.
- Training record và expiry.
- Overtime reference.
- Labor time captured by run/work order.
- Payroll có thể là module riêng hoặc integration; production vẫn phải có labor identity/cost basis.

### D42 — Document control — MUST

- Controlled documents: SOP, WI, drawing, spec, checklist, QC method.
- Revision/effective date/approval.
- Obsolete document prevention.
- Link revision used by WO/run/inspection.
- Read/acknowledgement evidence for critical SOP.

### D43 — Audit, approval và exception management — MUST

- Configurable approval matrix theo value/risk/company/plant.
- Segregation of duties.
- Reason code bắt buộc cho override.
- Immutable audit events.
- Exception inbox: shortage, overdue QC, overdue PM, overload, held lot, cost variance, expired calibration, late delivery.
- Delegation/time-bound approval.

### D44 — KPI / BI / management cockpit — MUST

- Sales: order intake, backlog, OTIF, forecast accuracy.
- Procurement: supplier OTD, price variance, shortage risk.
- Inventory: DOH, aging, stock accuracy, blocked stock.
- Production: schedule attainment, output, yield, scrap/regrind, changeover.
- OEE: Availability, Performance, Quality.
- Quality: PPM, FPY, reject, defect Pareto, CAPA aging.
- Maintenance: MTBF, MTTR, downtime, PM compliance.
- Cost: actual vs standard, material variance, conversion variance, COPQ.
- Finance: revenue, margin, AR/AP aging, cash.
- Energy: kWh/kg or kWh/1000 pcs.
- Plant executive dashboard và drill-down về source document/lot/run.

### D45 — Notifications, tasks và escalation — MUST

- Due date/task owner.
- Escalation cho shortage, late WO, QC Hold, breakdown, PM overdue, calibration overdue, customer complaint, approval overdue.
- In-app first; email/chat connectors optional.
- Alert deduplication và acknowledgement.

### D46 — Supplier/customer portals — LATER

- Supplier PO acknowledgement, ASN, CoA upload, corrective action.
- Customer order/shipment visibility, CoA download, complaint submission.
- Tenant/security boundary riêng.

### D47 — Integration platform — MUST foundation

- API/event contract for ERP modules.
- Barcode scanner/printer.
- Electronic scale.
- PLC/machine counter/OPC-UA/MQTT gateway as adapters, not core dependency.
- Energy meters.
- E-invoice/accounting/local logistics connectors as country-specific adapters.
- Webhook/outbox/idempotency/retry/dead-letter strategy.
- Import templates and migration audit.

### D48 — Security, identity và plant-device control — MUST

- Tenant/company/plant/warehouse scoped RBAC.
- Role + data scope.
- Session/CSRF protections hiện có tiếp tục áp dụng.
- Device/session audit for shop-floor terminals.
- Least privilege.
- Sensitive cost/finance fields separated from operator/QC access.
- Break-glass/admin override audited.

### D49 — Reliability, backup, DR và observability — MUST

- Backup/recovery policy.
- Migration rollback/forward-fix plan.
- Audit logs and operational telemetry.
- Queue/event failure visibility.
- Idempotent commands.
- Concurrency control for stock, resources and completion.
- Health checks và production smoke by critical journey.
- RPO/RTO targets phải được chốt trước production enterprise rollout.

### D50 — Multi-plant và enterprise scaling — SHOULD foundation

- Shared item/customer/supplier catalogue với plant-specific policies.
- Plant-specific warehouse, machine, mold, calendar, cost rate.
- Inter-plant request/transfer.
- Central planning + local execution.
- Consolidated KPI and finance boundaries.
- No cross-tenant leakage.

## 3. Process chain chuẩn toàn nhà máy

`CRM/Forecast → Sales Order → S&OP/MPS → MRP → Purchase/Planned WO → Receiving → Incoming QC → Quarantine/Release → Drying/Mixing/Staging → Production Schedule → Setup/Changeover → First Piece QC → Production Run → In-process QC → Scrap/Regrind/Rework → Final QC → Packing/Pallet → FG Warehouse → Allocation/Pick/Load → Delivery → Invoice/AR → Costing/GL → KPI`

Song song:

`Machine/Mold/Tool → PM/Breakdown → Spare Parts → Downtime → OEE → Maintenance Cost`

`NCR/Complaint → Containment → Traceability → Root Cause → CAPA/8D → Rework/Scrap/Return → Cost of Poor Quality`

`Raw lot → Mixing batch → Production run → Finished lot → Pack/Pallet → Shipment → Customer` là genealogy bắt buộc, không phải báo cáo trang trí.

## 4. Các điểm nhựa mà ERP chung thường thiếu

1. Recipe theo tỷ lệ với tolerance và regrind policy.
2. Raw lot + supplier lot + mixing/drying lineage.
3. Machine/mold/die compatibility.
4. Cavity và active cavity.
5. Cycle/shot/line-rate based production.
6. Changeover màu/vật liệu/khuôn và purge accounting.
7. Startup scrap tách steady-state scrap.
8. Regrind/recycle loop có valuation và giới hạn công thức.
9. Dual UOM/catch weight.
10. Continuous process roll/spool genealogy.
11. Mold shot-based maintenance.
12. Process parameter revision và actual capture.
13. First-piece approval.
14. QC hold gate xuyên kho/sản xuất/giao hàng.
15. Mass balance và yield reconciliation.

## 5. Master data tối thiểu

### Organization

Company, Plant, Workshop, Department, Work Center, Production Line, Shift, Calendar, Warehouse, Zone, Bin.

### Commercial

Customer, Customer Item Mapping, Supplier, Supplier Item Approval, Price List, Payment Term, Shipping Rule.

### Product / engineering

Item, Material Specification, Product Specification, Drawing Revision, Recipe/BOM Revision, Routing Revision, Process Parameter Template, Packaging Specification, QC Specification, ECO.

### Resources

Machine, Mold/Die/Tool, Asset Component, Measuring Instrument, Dryer, Mixer, Utility Meter.

### Classification

Polymer Family, Material Grade, Color, Defect Code, Downtime Reason, Scrap Reason, Root Cause, Disposition, Maintenance Failure Code.

## 6. Transaction/document families tối thiểu

### Demand & commercial

Quotation, Sales Order, Forecast, Delivery Schedule, Customer Return, Complaint.

### Planning

S&OP Plan, MPS, MRP Run, Planned Order, Production Plan, Capacity Plan.

### Procurement

Purchase Requisition, RFQ, Supplier Quotation, Purchase Order, Purchase Receipt, Purchase Return, Supplier Claim.

### Inventory

Stock Entry, Transfer, Reservation, Pick Task, Putaway Task, Stock Reconciliation, Lot/Batch, Package/Pallet.

### Production

Work Order, Material Staging, Drying Batch, Mixing Batch, Setup/Changeover, Production Run, Production Event, Rework Order.

### Quality

Quality Inspection, First Piece Approval, NCR, CAPA/8D, Deviation, Calibration Record, CoA.

### Maintenance

Maintenance Request, PM Plan, Maintenance Work Order, Breakdown Event, Spare Part Issue.

### Logistics

Packing Order, Delivery Note, Load Plan, Shipment, Proof of Delivery reference.

### Finance

Purchase Invoice, Sales Invoice, Payment, Journal Entry, Costing Close, Cost Adjustment, Bank Reconciliation.

## 7. Hard invariants

1. Một stock ledger canonical.
2. Một lot/batch genealogy canonical.
3. Một source of truth cho submitted document state.
4. Recipe/BOM/routing/spec revision used by released WO phải snapshot bất biến.
5. QC Hold/Reject phải fail closed trên mọi protected movement.
6. Submitted stock/cost/quality records không sửa trực tiếp; dùng reversal/adjustment/controlled amendment.
7. Machine/mold exclusive conflict server-side.
8. Quantity + weight + value + genealogy reconcile sau mỗi lifecycle.
9. Regrind không thể tự xuất hiện; phải sinh từ source production/scrap lineage hoặc approved receipt.
10. Finished output không vượt WO/run remaining ngoài approved exception.
11. Lot split/merge không được mất lineage.
12. Production counters/PLC signals không tự post inventory nếu chưa qua validated command.
13. Calibration expired có thể block inspection theo policy.
14. Obsolete specification/SOP không được dùng cho WO mới sau effective cutoff.
15. Tenant/company/plant scope enforced ở server.
16. Override nào ảnh hưởng quality, stock, cost hoặc resource conflict phải có actor/reason/timestamp.
17. Duplicate API/device retries phải idempotent.
18. Recall query phải forward và backward trace được mà không dựa vào ghi chú tay.

## 8. Acceptance journeys bắt buộc

### AJ01 — Order to plan to material

Sales Order → MRP → shortage → Purchase Requisition/PO → receipt raw lot → QC release → material available.

### AJ02 — Recipe to finished lot

Approved recipe revision → WO release snapshot → schedule machine/mold → issue raw lots → production run → good/scrap/regrind → final QC → FG lot.

### AJ03 — Changeover

Previous product/color → setup checklist → purge consumption → startup scrap → first-piece approval → steady production.

### AJ04 — Regrind closed loop

Production scrap → approved regrind → regrind lot → recipe ratio guard → later production consumption → full genealogy and valuation.

### AJ05 — Breakdown during run

Running machine → breakdown → production pause/downtime → maintenance WO → spare issue → repair complete → resume → OEE/maintenance cost updated.

### AJ06 — Quality hold

QC Hold finished lot → reservation/delivery blocked → NCR → rework or release/reject → correct final state and audit.

### AJ07 — Customer complaint / recall

Customer shipment lot → backward trace raw lots/process/machine/tool → forward trace affected stock and customers → containment/block → CAPA.

### AJ08 — Financial reconciliation

Purchase value + stock movements + production actual cost + FG + delivery/COGS reconcile to accounting period without direct historical edit.

### AJ09 — Multi-shift production

One WO spans shifts/operators/runs, no double consume/output; output and downtime aggregate correctly.

### AJ10 — Concurrent devices

Two shop-floor/mobile clients retry same complete/post command; only one stock/cost mutation is committed.

## 9. KPI definitions phải có source rõ

Không render KPI từ dữ liệu suy đoán. Mỗi KPI phải có source document/projection, formula, grain, timezone và drill-down.

- OTIF.
- Forecast accuracy.
- Schedule attainment.
- OEE.
- Availability, Performance, Quality.
- FPY.
- Scrap %.
- Regrind recovery %.
- Yield %.
- Material usage variance.
- Cycle time variance.
- Changeover time.
- Downtime by reason.
- MTBF/MTTR.
- PM compliance.
- Supplier OTD/PPM.
- Customer PPM/complaints.
- Inventory accuracy.
- Days on hand/aging.
- WIP aging.
- Cost/kg, cost/pcs, cost/m, cost/roll.
- Actual vs standard margin.
- COPQ.
- kWh/kg or kWh/1000 pcs.
- Recall drill completion time.

## 10. Scope priority

### Foundation P0 — không có thì chưa phải ERP nhà máy nhựa vận hành được

D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D12, D13, D14, D15, D16, D17, D23, D24, D25, D27, D28, D33, D34, D35, D38, D43, D44, D47, D48, D49.

D11 và D18-D22 bật theo process profile thực tế.

### Enterprise P1

D26 Metrology, D29 MRO, D30 Energy, D31 EHS, D32 Sustainability, D36 Complaint/Warranty, D37 Subcontract, D39 Finance full scope, D41 HR operational, D42 Document Control, D45 Notification.

### Expansion P2

D40 Treasury, D46 Portals, D50 multi-plant scaling và advanced analytics/optimization.

## 11. Ranh giới với Forge core hiện có

Tái sử dụng:

- canonical documents;
- versioned BOM + immutable Work Order snapshot;
- stock lifecycle, physical stock, lot/batch lineage;
- reservation/available stock;
- RBAC/tenant boundary;
- append-only/reversal semantics;
- MetaForge form/runtime policy.

Bổ sung plastic domain, không tạo source of truth cạnh tranh:

- material/process profiles;
- machine/mold/tool;
- routing/process parameters;
- production run/event;
- drying/mixing/changeover;
- QMS/NCR/CAPA;
- maintenance/EAM;
- packaging/pallet genealogy;
- planning/MRP/capacity;
- plant costing/energy/EHS hooks.

## 12. Definition of Done cho “ERP nhà máy nhựa đủ”

Không được gọi sản phẩm là complete chỉ vì có menu các module. Tối thiểu phải chứng minh:

1. Order → MRP → Purchase/Production Plan chạy được.
2. Raw lot receiving + QC + warehouse lineage chạy được.
3. Recipe/revision/snapshot và actual material consumption chạy được.
4. Machine/mold schedule và shop-floor run chạy được.
5. Scrap/regrind/rework có quantity + value + genealogy đúng.
6. QC Hold/Reject chặn thật ở API/UI.
7. Maintenance/breakdown tác động downtime/OEE thật.
8. Packing/pallet/shipment giữ genealogy tới customer.
9. Backward/forward recall drill pass.
10. Actual production costing reconcile với inventory.
11. Finance integration reconcile ít nhất Inventory/WIP/FG/COGS/AP/AR khi bật full ERP scope.
12. RBAC, tenant/company/plant scope và failure paths pass authenticated QA.
13. Desktop + mobile shop-floor journeys pass.
14. Concurrent retry/idempotency pass.
15. Backup/recovery/migration evidence tồn tại trước production rollout.
16. KPI drill-down tới source transaction, không dashboard số ma.

## 13. Những thứ không hard-code vào core

- Một loại công nghệ nhựa duy nhất.
- Một đơn vị sản xuất duy nhất.
- Một bộ thông số QC duy nhất.
- Một luật FIFO/FEFO duy nhất.
- Một cách định giá regrind duy nhất.
- Một công thức OEE tùy biến không có definition.
- Một chuẩn nhãn khách hàng duy nhất.
- Một country tax/e-invoice implementation trong manufacturing kernel.
- PLC protocol/vendor cụ thể.
- Payroll provider cụ thể.

## 14. Quyết định G1 còn cần khóa

Để chuyển từ enterprise scope sang implementation, chỉ cần khóa các decision ảnh hưởng data model/process profile:

1. Process profile đang dùng: Injection / Extrusion / Blow / Film / Compounding / mixed.
2. Product units chính: kg / pcs / m / roll / mixed.
3. Material preparation có drying/mixing/dosing hay không.
4. Regrind flow: internal only / external recycler / both.
5. Mold/die/tool management depth.
6. QC depth: simple release gate hay lab/SPC đầy đủ.
7. Packing hierarchy: bag/carton/pallet/roll.
8. Finance phase: operational costing trước hay full accounting cùng rollout.
9. Single plant hay chuẩn bị multi-plant ngay từ schema.
10. Thiết bị cần tích hợp ở rollout đầu: scale, printer, scanner, PLC, energy meter.

Nếu chưa có câu trả lời, schema foundation vẫn phải giữ extension points; không được biến default thành assumption bất biến.
