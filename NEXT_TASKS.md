# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Đây là hàng đợi active. GitHub là nguồn sự thật cho exact branch head, PR và CI. Trước khi implementation phải đọc `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` trên exact current `main`.

## ACTIVE G1 — Plastic Factory ERP requirements

Canonical session branch: `feat/plastic-factory-erp-brd-20260802`.

Authoritative requirement docs trên branch:

- `docs/plastic-factory-erp/BRD.md` — manufacturing/plastic BRD foundation.
- `docs/plastic-factory-erp/ENTERPRISE_SCOPE.md` — D01-D50 plant-wide enterprise scope.
- `docs/plastic-factory-erp/ADVANCED_REQUIREMENTS.md` — D51-D75 specialized/advanced requirements.

Branch được tạo từ merge-base `3222beb66bd3e6b2abbab1b17a6009044a2d5358`; current `main` đã tiến lên trong lúc G1 diễn ra. Không merge nguyên branch trước khi G1 được duyệt, sync exact current `main` và review conflict.

### G1.1 — Classify D01-D75

Mỗi domain phải được đánh dấu theo nhà máy thực tế:

- MUST — rollout đầu hoặc schema foundation bắt buộc.
- SHOULD — cần sớm nhưng có thể rollout sau foundation.
- CONDITIONAL — chỉ bật khi process/customer/compliance yêu cầu.
- LATER — extension point, chưa implement trong release đầu.
- N/A — xác nhận không dùng.

Không được giữ một domain critical ở trạng thái mơ hồ nếu nó làm thay đổi schema/source-of-truth foundation.

### G1.2 — Khóa process profile

Chọn một hoặc nhiều:

- Injection.
- Extrusion.
- Blow molding.
- Film.
- Compounding/pelletizing.
- Other process profile cần mô tả riêng.

Process profile quyết định machine/tool attributes, production unit, process parameters, scrap model và QC characteristics; không được fork stock/document core.

### G1.3 — Khóa material-flow decisions

- Production UOM: kg / pcs / m / roll / mixed.
- Bulk/silo có hay không.
- Drying có hay không.
- Mixing/dosing/weighing có hay không.
- Regrind: internal / external recycler / both / none.
- Lot split/merge depth.
- Dual-UOM/catch-weight rules.
- Customer-owned/supplier-consignment/toll material có hay không.

### G1.4 — Khóa engineering/tooling decisions

- Mold/die/tool depth.
- Customer-owned tooling.
- Tool development/trials/NPI.
- Product/recipe/routing/process/QC/packaging revision graph.
- ECO/change approval depth.
- APQP/PFMEA/Control Plan requirement nếu khách hàng/ngành cần.

### G1.5 — Khóa quality/lab decisions

- Incoming/In-process/First-piece/Final stages.
- Simple Release/Hold/Reject hay numeric lab characteristics.
- Sampling/frequency.
- LIMS/color lab.
- SPC/Cp/Cpk data requirement.
- Metrology/calibration.
- NCR/CAPA/8D/customer complaint.
- CoA/CoC/customer compliance evidence.
- Reaction plan khi fail.

### G1.6 — Khóa warehouse/packing/logistics decisions

- Zone/bin level.
- Bag/carton/pallet/roll hierarchy.
- Barcode/QR scheme.
- FEFO/FIFO/allocation policy.
- Scanner/scale/printer rollout.
- TMS/carrier/load plan.
- Import/export/customs requirement.
- Backward/forward recall grain.

### G1.7 — Khóa maintenance/utility/EHS decisions

- PM by calendar/runtime/shots.
- Breakdown + spare part/MRO.
- OEE depth and time taxonomy.
- Energy/utility metering.
- EHS/SDS/waste tracking.
- Recycled content/material mass balance.
- Permit/training requirement.

### G1.8 — Khóa commercial/finance/people decisions

- Forecast/S&OP/MPS/MRP rollout depth.
- Cost estimation/quotation.
- Operational costing vs full AP/AR/GL in first rollout.
- Fixed asset/CAPEX/budget requirement.
- Labor time/skill matrix/training.
- Payroll integration boundary.
- Single plant vs multi-plant-ready foundation.

### G1.9 — Khóa integration/security decisions

- EDI/customer/supplier messages.
- Barcode scanner/printer/electronic scale.
- PLC/gateway/machine counter.
- Energy meter.
- OT read-only telemetry vs command boundary.
- SSO/MFA/device controls if required.
- Backup/RPO/RTO target before production rollout.

### G1.10 — Cross-domain models phải được chấp nhận

- One canonical stock ledger.
- One canonical lot/batch genealogy.
- One submitted-document source of truth.
- Effective revision graph for BOM/routing/process/QC/packaging/work instructions.
- Ownership separated from custody/location.
- Configurable genealogy grain.
- Quality reaction plan.
- Process-aware mass balance with tolerance.
- Canonical planned/setup/run/downtime time taxonomy.
- Separate accounting/standard/actual/should-cost/tooling cost concepts.
- Device/EDI retries idempotent.
- KPI definition includes source, grain, formula, timezone and drill-down.

### G1 Done condition

G1 chỉ DONE khi:

1. D01-D75 được classify.
2. Process/material/tooling/QC/logistics/maintenance/finance/integration decisions trên được khóa hoặc explicit defer.
3. Critical source-of-truth/invariants không còn câu hỏi mở.
4. Acceptance journeys AJ01-AJ18 được giữ, sửa hoặc đánh dấu N/A có lý do.
5. Scope đủ để G2 thiết kế dependency mà không phải đoán business model.

Không code product trên branch G1 này.

## NEXT G2 — Architecture / dependency decomposition

Sau G1 approval:

1. Kiểm tra exact current `main`, open PR/CI liên quan.
2. Sync/reconstruct requirement changes lên một clean branch từ current `main`; branch G1 diverged chỉ làm nguồn tham khảo, không merge nguyên branch.
3. Map D01-D75 vào Forge modules hiện có vs domain mới.
4. Chốt entity ownership, APIs/events, migrations và Meta manifest boundaries.
5. Chốt dependency graph và implementation waves.
6. Mỗi implementation epic một branch/PR riêng từ current `main`.

Dependency waves dự kiến:

- Wave A: organization/master governance + plastic material/product spec + engineering revision foundation.
- Wave B: demand/MRP + supplier/procurement/inbound + WMS/lot/ownership.
- Wave C: machine/tooling + routing/process params + scheduling + material prep/changeover.
- Wave D: production run/shop-floor + process profiles + quality reaction.
- Wave E: QMS/LIMS/metrology/CAPA + maintenance/MRO/OEE.
- Wave F: packing/shipping/TMS/recall + costing/finance bridge.
- Wave G: EHS/energy/sustainability/document/audit + enterprise BI/integrations.
- Wave H: authenticated end-to-end acceptance, migration/recovery and production release preparation.

## Existing Forge active queue ngoài Plastic ERP

### P0 — QR / lineage + cleanup QA

- Physical stock QR/lineage end-to-end.
- Correct voucher/batch/bundle/warehouse identity.
- Stock Reconciliation real print/QR route.
- QA cleanup no residue.
- Desktop/mobile, cookie+CSRF, role/failure-path evidence.
- No customer production mutation/deploy without explicit authorization.

### P1 — Daily detailed ledger

- Immutable daily snapshot.
- Idempotent rerun.
- Freeze.
- Append-only adjustment.
- Cross-domain reconciliation.
- Permission/tenant evidence.

### P2 — Warranty / defects / capacity

- Warranty/defect lifecycle.
- Responsibility/cost handling.
- Supplier provisional AP hold/offset approval.
- Capacity/overtime/overload.

### P3 — Authenticated end-to-end acceptance

`Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty`

## Guardrails

- GitHub is source of truth.
- Một epic/đợt sửa độc lập dùng một branch/PR canonical.
- Không merge branch diverged nguyên trạng để tiết kiệm thời gian.
- Không deploy Cloudflare/production, sửa production secret/DNS hoặc mutate customer data nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifacts không được quản lý.
