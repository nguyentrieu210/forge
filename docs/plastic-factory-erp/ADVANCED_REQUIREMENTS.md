# Advanced Requirements — Forge Plastic Factory ERP

Ngày: 2026-08-02
Trạng thái: G1 Requirements expansion — specialized/enterprise controls
Canonical branch: `feat/plastic-factory-erp-brd-20260802`

Tài liệu này bổ sung các miền D51-D75 vào `ENTERPRISE_SCOPE.md`. Mục tiêu là tránh xây một ERP chỉ đủ cho giao dịch cơ bản nhưng thiếu engineering, lab, compliance, logistics và OT controls khi nhà máy lớn lên hoặc phục vụ khách hàng yêu cầu cao.

## D51 — NPI / New Product Introduction — SHOULD, MUST với OEM/khách hàng kỹ thuật cao

- New Product Request từ Sales/Customer.
- Feasibility review: material, machine, mold/tool, capacity, quality capability, packaging, cost.
- Prototype/sample/trial order.
- Trial run riêng, không lẫn mass-production KPI.
- Sample result, dimensional/visual/lab result.
- Customer sample approval.
- Golden sample/master sample identity và storage reference.
- Handover từ NPI sang mass production.
- Production readiness checklist.
- Revision freeze tại SOP/start-of-production.

## D52 — APQP / PPAP-style product readiness — CONDITIONAL

Không hard-code một automotive standard, nhưng data model phải hỗ trợ:

- Project milestone/gate.
- Design/process review.
- Process flow.
- PFMEA reference.
- Control Plan reference.
- Measurement-system/calibration evidence.
- Capability study evidence.
- Material/performance test result.
- Sample submission/approval package.
- Customer-specific requirement checklist.
- Change resubmission trigger.

## D53 — PFMEA / risk control — SHOULD

- Process step ↔ failure mode ↔ effect ↔ cause ↔ prevention/detection control.
- Severity/occurrence/detection or configurable risk scoring.
- Recommended action, owner, due date.
- Link to Control Plan, Work Instruction, QC characteristic và CAPA.
- Revision and approval.
- Trigger review after major defect/process/ECO change.

## D54 — Control Plan — SHOULD

- Product/process revision specific.
- Operation/step.
- Product/process characteristic.
- Specification/tolerance.
- Measurement method/instrument.
- Sample size/frequency.
- Reaction plan on failure.
- Responsible role.
- Link inspection template and shop-floor checks.

## D55 — LIMS / laboratory management — CONDITIONAL

- Lab sample identity và chain of custody.
- Test request, sample collection, preparation, execution, review, release.
- Test method revision.
- Instrument/reagent/reference-standard linkage.
- Raw result + calculated result.
- Repeat/retest reason and approval.
- Result attachments/import from instrument.
- CoA generation.
- Retention sample tracking.
- Lab turnaround time KPI.

## D56 — Color laboratory / masterbatch matching — CONDITIONAL

- Color standard/master sample.
- L*a*b* or configurable color coordinates.
- Delta-E formula/version reference.
- Colorimeter/spectrophotometer instrument.
- Recipe trial and correction history.
- Masterbatch lot effect tracking.
- Customer color approval.
- Lighting/visual assessment condition.

## D57 — Silo / bulk material management — CONDITIONAL

- Silo/bin/tank identity.
- Material compatibility and allowed families.
- Capacity/min/max.
- Bulk receipt/load/unload.
- Lot layering/blending policy.
- Estimated vs measured quantity.
- Silo-to-dryer/machine transfer lineage.
- Flush/cleaning and contamination state.
- Sensor level/weight integration hook.

## D58 — Weighing / dispensing / kitting — SHOULD

- Work Order material kit.
- Target weight by recipe row.
- Tolerance and scale validation.
- Scan material lot before dispense.
- Wrong material/lot fail closed.
- Actual weight captured from scale/manual.
- Partial bag/residual quantity.
- Label for weighed batch/kit.
- Second-person verification where policy requires.
- Full genealogy into mixing/production batch.

## D59 — Contamination and material segregation control — MUST với nhiều polymer/màu nhạy

- Material compatibility/contamination matrix.
- Dedicated/shared equipment policy.
- Cleaning verification between incompatible materials/colors.
- Quarantine after contamination incident.
- Foreign-material incident record.
- Purge/cleaning consumption.
- Allergen-like concept should remain generic `cross_contamination_class`, not food-specific hard-code.

## D60 — Customer-owned / supplier-owned / consignment stock — CONDITIONAL

- Ownership dimension independent from physical warehouse.
- Customer-owned resin/tool/packaging.
- Supplier consignment stock.
- Consumption and settlement policy.
- No accidental valuation/COGS ownership transfer.
- Stock report by legal owner + physical location.
- Return/reconciliation.

## D61 — Toll manufacturing / contract manufacturing — CONDITIONAL

- Receive customer material without purchase ownership.
- Customer-supplied recipe/spec/tool.
- Process fee/service pricing.
- Yield/scrap/regrind ownership rule.
- Customer material reconciliation.
- Finished-goods ownership and shipment.
- Separate genealogy and costing semantics.

## D62 — External recycler / scrap sale / waste contractor — SHOULD

- Scrap classification and recoverability.
- Internal regrind vs external recycler vs sale vs disposal.
- Scrap dispatch weight and document.
- Recycler receipt/processing certificate reference.
- Recovered material return lot if applicable.
- Financial credit/revenue/cost link.
- Waste mass-balance reconciliation.

## D63 — Transportation Management / TMS-lite — SHOULD

- Carrier master and rate contract.
- Shipment planning.
- Vehicle/container/load capacity.
- Route, pickup, delivery windows.
- Load consolidation.
- Freight charge estimate/actual.
- Shipment tracking status/events.
- Delivery exception/damage/shortage.
- POD reference.
- Carrier performance KPI.

## D64 — Import / export / customs documentation — CONDITIONAL

- Country of origin.
- HS code/customs classification as localization data.
- Import shipment/container reference.
- Customs declaration/document references.
- Landed cost components.
- Export commercial packing/invoice document hooks.
- Certificate/document checklist by destination/customer.
- No hard-code to one country's customs workflow inside manufacturing kernel.

## D65 — Cost estimation / quotation engineering — SHOULD

- Should-cost before Sales quotation.
- Material price scenario.
- Standard recipe/yield/scrap.
- Machine cycle/rate.
- Mold cavity/tooling assumptions.
- Labor, energy, packaging, freight, overhead.
- Tooling/NRE separate from part price.
- Margin simulation by quantity break.
- Quote revision and approval.
- Actual-vs-quoted feedback after production.

## D66 — Tooling project / mold development — CONDITIONAL

- Tooling project from RFQ/order.
- Design approval/milestones.
- Mold supplier/outsource purchase.
- Tool trial T0/T1/T2... reference.
- Modification/rework history.
- Sample approval.
- Tool asset capitalization/ownership.
- Customer-owned tool contract/reference.
- Transfer to production toolroom after acceptance.

## D67 — Fixed assets / CAPEX / depreciation — SHOULD

- Asset acquisition and commissioning.
- Machine, auxiliary equipment, lab instrument, forklift, tooling when capitalized.
- Asset location/custodian.
- Useful life/depreciation method via finance policy.
- CAPEX request/approval/budget.
- Asset transfer, impairment, disposal.
- Maintenance cost and production utilization linkage.
- Book value must not be inferred from maintenance master.

## D68 — Budgeting / management accounting — SHOULD

- Annual/monthly budget by plant/cost center/account.
- Production volume assumptions.
- Material/energy/labor rate assumptions.
- CAPEX budget.
- Actual vs budget.
- Rolling forecast.
- Flexible budget by production volume where useful.

## D69 — Internal / supplier / customer audit management — SHOULD

- Audit program/calendar.
- Audit checklist revision.
- Scope, auditor, department/supplier.
- Finding classification.
- Corrective action, owner, due date.
- Verification and closure.
- Repeat finding detection.
- Link to CAPA/document/training changes.

## D70 — Regulatory / customer compliance evidence — CONDITIONAL

Framework-neutral repository for requirements such as:

- Material declarations.
- Safety/chemical declarations.
- Food-contact/customer-specific certificates where applicable.
- Restricted substance declarations where applicable.
- Recycled-content evidence.
- Country/customer compliance documents.
- Certificate expiry/effective date.
- Lot/batch/customer shipment linkage when evidence must follow shipment.

Không hard-code REACH/RoHS/food/automotive rules into generic core; implement compliance packs/policies.

## D71 — Training, competency and operator authorization — SHOULD

- Job/operation skill requirement.
- Employee competency matrix.
- Training course/revision.
- Assessment/pass/expiry.
- Machine/process authorization.
- Block assignment to restricted operation if qualification expired and policy requires.
- Link document revision retraining requirement.

## D72 — Permit-to-work / contractor control — CONDITIONAL

- Contractor identity and company.
- Safety induction status.
- Work permit type.
- Area/asset/time window.
- Isolation/LOTO checklist reference where used.
- Approver and closure.
- Incident linkage.

## D73 — B2B / EDI integration — SHOULD

- Customer forecast/order import.
- Order acknowledgement.
- ASN/shipment notification.
- Invoice/export document integration hooks.
- Supplier PO/ASN/CoA exchange.
- Partner-specific mapping/version.
- Message idempotency, replay and error queue.
- Manual fallback and reconciliation.

## D74 — OT / IoT / industrial integration and cybersecurity — SHOULD foundation

- Device/asset registry.
- PLC/gateway/meter/scanner/printer/scale identity.
- Protocol adapter outside business core.
- Read-only telemetry vs command channel explicitly separated.
- Signal mapping/version.
- Timestamp/source-quality metadata.
- Buffer/retry/offline ingestion.
- OT credentials/secrets isolated from application documents.
- Network/plant segmentation assumptions documented.
- Device command authorization; ERP must not send unsafe machine controls by default.
- Telemetry cannot bypass validated inventory/quality commands.

## D75 — Data platform / historical analytics / AI readiness — LATER foundation

- Operational source remains canonical transactional system.
- CDC/event/export boundary for analytics.
- Historical fact grain defined for production, quality, maintenance, inventory and energy.
- KPI semantic definitions versioned.
- Forecast/anomaly/predictive models consume governed data, never mutate production state directly.
- Model output has timestamp/version/confidence and human decision boundary.
- AI suggestions cannot override QC Hold, stock permission, resource safety or financial close.

## Cross-domain controls bổ sung

### A. Effective revision graph

Khi một Work Order được release, hệ thống phải biết chính xác revision/effective identity của:

- product specification;
- recipe/BOM;
- routing;
- process parameter template;
- QC specification/control plan;
- packaging specification;
- applicable work instruction.

Không được chỉ snapshot BOM rồi để các tài liệu khác trôi theo latest version.

### B. Ownership vs custody

Physical location, accounting ownership và customer/supplier ownership là ba khái niệm khác nhau. Data model phải tách được để xử lý consignment, customer material, subcontract và customer-owned tooling.

### C. Genealogy granularity

Genealogy phải cấu hình tới mức phù hợp:

- raw material lot;
- mixing/drying batch;
- production run;
- finished lot;
- roll/spool;
- carton/pallet;
- optional cavity/shot/serial level khi business case cần.

Không ép mọi sản phẩm vào serial-level nếu vô ích, nhưng cũng không khóa schema ở batch-only nếu khách hàng tương lai cần sâu hơn.

### D. Quality reaction plan

QC failure không chỉ tạo trạng thái đỏ. Nó phải kích hoạt policy:

- stop/hold current run;
- block affected lot;
- quarantine previous/next interval if configured;
- NCR/CAPA;
- additional sampling/retest;
- customer/supplier escalation;
- rework/scrap/concession.

### E. Mass balance

Với mỗi run/batch/period có policy applicable:

`opening/staged inputs + receipts/returns-in = consumed + returned + good output material equivalent + scrap + regrind/recovered + closing ± approved adjustment`

Mass balance có tolerance theo process, không dùng equality giả tạo khi có moisture/evaporation/process loss hợp lệ.

### F. Time model

Phân biệt:

- planned setup time;
- actual setup time;
- run time;
- planned stop;
- unplanned downtime;
- micro-stop if telemetry supports;
- maintenance downtime;
- quality hold time;
- material-starvation time.

OEE và capacity phải dùng một time taxonomy canonical.

### G. Cost ownership

Phân biệt:

- accounting cost;
- operational standard cost;
- actual production cost;
- quotation should-cost;
- customer-owned material excluded value;
- scrap/regrind recoverable value;
- tooling/NRE/capital depreciation.

Không dùng một `cost` field để gánh tất cả.

## Advanced acceptance journeys

### AJ11 — New product to mass production

RFQ → should-cost → sample/trial → engineering/QC revisions → customer approval → production readiness → mass-production WO with approved revision graph.

### AJ12 — Customer-owned material

Receive customer resin → quarantine/QC → consume in toll WO → scrap/regrind reconciliation by ownership → finished goods → shipment → service fee invoice; inventory ownership never becomes company stock value incorrectly.

### AJ13 — Silo to machine genealogy

Bulk receipt → silo lot/blend → dryer/mixing → machine feed → run → finished lot; reverse trace identifies contributing supplier lots.

### AJ14 — Lab failure reaction

In-process lab/sample fails → reaction plan holds run/affected interval → NCR → parameter correction/retest → controlled release or scrap; shipment path remains blocked until release.

### AJ15 — Tooling project to production

Tool project → trials/modifications → sample approval → asset/tool acceptance → PM plan → production usage counter → maintenance history.

### AJ16 — EDI replay safety

Same customer order/ASN message delivered repeatedly/out-of-order → one business transaction, deterministic version/reconciliation, visible error state.

### AJ17 — OT telemetry disconnect

PLC/gateway offline during run → operator workflow remains safe; buffered telemetry syncs later without generating duplicate production/stock postings.

### AJ18 — Compliance certificate expiry

Required certificate expires before shipment/material use → policy blocks affected transaction or raises approved exception; old historical shipments remain linked to certificate valid at their transaction date.

## G1 completeness target sau tài liệu này

Enterprise scope = D01-D75.

Có thể coi G1 đủ rộng về functional coverage khi:

1. D01-D75 đã được classify MUST/SHOULD/CONDITIONAL/LATER theo nhà máy thực tế.
2. Process profile và process-specific fields được khóa.
3. Ownership/custody, revision graph, genealogy grain, quality reaction, mass balance, time taxonomy và cost taxonomy được chấp nhận.
4. Mỗi domain có owner/actor, authoritative data source và acceptance journey hoặc explicit defer.
5. Không còn domain critical nào bị ngầm nhét vào “sau này” mà ảnh hưởng schema foundation.

Sau đó G2 mới decomposition architecture; implementation không bắt đầu từ danh sách màn hình mà từ invariants, source of truth và journeys.
