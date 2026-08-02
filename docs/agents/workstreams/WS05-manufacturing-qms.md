# WS05 — Manufacturing / MRP II / QMS

Status: **AUTONOMOUS IMPLEMENTATION COMPLETE — MERGE/DEPLOY APPROVAL REQUIRED**  
Owner: **ChatGPT-WS05**  
Branch: `agent/ent-05-manufacturing-qms`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`  
Checkpoint PR: **#327**

## Mission

Nâng Manufacturing từ BOM/WO/Plan/Job Card RC thành một lát MRP II có thể lập kế hoạch, nhìn công suất, truy vết, đọc bằng chứng giá thành và vận hành QMS mà không tạo source-of-truth thứ hai bên cạnh document kernel, Stock Ledger hay GL.

## Autonomous execution summary — 2026-08-03

WS05 không dừng tại checkpoint Bulk BOM. Sau audit repo/North Star/capability map, branch tiếp tục triển khai các phần độc lập còn suy ra chắc chắn từ source:

1. Bulk BOM Draft parent + child/version.
2. Multi-level gross MRP từ Production Plan.
3. Material Request Draft conversion có replay guard.
4. On-hand-only MRP netting preview, được dán nhãn rõ **NOT ATP**.
5. Routing + Workstation capacity calendar + downtime + finite day-bucket scheduling.
6. Work Order genealogy trên canonical Stock Entry/Stock Ledger.
7. Read-only manufacturing cost/variance evidence trên exact BOM checksum + canonical ledger.
8. First-party Manufacturing/QMS metadata app.
9. Quality Plan + sampling + NCR + RCA + CAPA + calibration + KPI/evaluation.
10. Permission/tenant/read-scope fail-closed trên các bounded APIs.

Không có schema SQL migration mới, không có GL/Stock Ledger cạnh tranh, không merge/deploy.

---

## 1. Canonical evidence retained

### BOM / Work Order / Stock execution already authoritative

- `manufacturing-lifecycle.ts`: versioned BOM revision/effective interval/checksum/UOM normalization, active overlap guard, direct/circular self-consumption guard, immutable Work Order BOM snapshot.
- `manufacturing-stock-guard.ts`: cumulative issue/consumption, reversal, stable progress keys, scrap/offcut value conservation.
- `manufacturing-work-order-guard.ts`: Work Order stock-UOM snapshot/progress invariants.
- `manufacturing-rollout.ts`: manufacturing Stock Entry reconciliation/issue/manufacture path.
- `JobCardController`: Work Order/Operation/Workstation references, cumulative completion and time logs.

WS05 additions compose with those authorities. Không file nào dưới WS05 tạo ledger sản xuất riêng.

---

## 2. WS05-A — Bulk BOM Draft

### Domain/API

Files:
- `server/packages/clouderp-erpnext/src/manufacturing-bom-bulk.ts`
- `server/apps/tenant-worker/src/manufacturing-bom-bulk-api.ts`

Contract:
- một request = một BOM parent/revision + child rows;
- backend cap **500 rows**;
- fixed-point quantity/conversion, valid dates, quantity basis validation, direct self-consumption guard;
- preview pure + stable SHA-256 fingerprint;
- create **Draft only**;
- actual write vẫn đi canonical `POST /api/resource/Bill of Materials`;
- sequential exact retry same company/item/revision + semantic payload trả Draft cũ;
- payload khác cùng revision fail closed;
- replay lookup tenant-scan nhưng từng matching BOM phải qua `canReadDocument`; hidden match => permission failure;
- không submit, không Work Order, không stock/GL effect.

### Known hardening debt

- two simultaneous first-create requests cùng business key chưa có business-key lock; blast radius hiện là duplicate Draft, activation overlap guard vẫn chặn silently active conflict;
- authoritative dry-run của full controller cần shared read-only kernel preview seam;
- shared BulkTransaction renderer hiện cap 200 rows, backend 500.

---

## 3. MRP / Material Requirement

### Multi-level gross explosion

File: `server/packages/clouderp-erpnext/src/manufacturing-mrp.ts`

Implemented:
- submitted Active/effective BOM only;
- Production Plan explicit BOM selection;
- implicit selection phải unique, nếu không fail closed;
- child BOM => Manufacture requirement;
- leaf item => Purchase requirement;
- multi-level explosion, depth cap, circular-path guard;
- aggregate by requirement type/item/warehouse/schedule date;
- source trace gồm root row/item, parent, BOM/revision/row/path;
- fixed-point arithmetic;
- top-level `Cố định / Theo chiều rộng / Theo chiều cao / Theo diện tích / Theo số lá`;
- non-fixed subassembly yêu cầu explicit dimension mapping thay vì kế thừa dimension thành phẩm bằng phỏng đoán;
- missing warehouse => warning, không tự chế kho mặc định;
- `netting_mode = gross_only`.

Self-audit đã sửa lỗi double-scale `*_micros`: field đã scale được dùng như safe integer, không gọi `toScaledInt()` lần hai.

### Material Request conversion

API:
- `preview_production_plan_mrp`
- `create_mrp_material_request`

Implemented:
- Production Plan + BOM document read scope;
- submitted Production Plan required for conversion;
- caller chọn `Purchase` hoặc `Manufacture` MR per call;
- canonical Material Request create/read permission;
- MR Draft mang source Production Plan/schema/netting metadata;
- fingerprint + sequential replay guard;
- hidden prior generated MR => fail closed;
- changed planning fingerprint => conflict;
- actual create đi canonical Material Request resource path.

### On-hand netting preview

File: `manufacturing-mrp-netting.ts`

Mode: **`ON_HAND_ONLY_NOT_ATP`**.

- on-hand canonical balance chỉ được cấp một lần theo need-date order;
- Purchase/Manufacture cùng item/warehouse cạnh tranh cùng physical balance;
- warehouse scope độc lập;
- negative stock balance được floor về 0 cho planning availability;
- missing warehouse không được net;
- không tự nhận reservation/open PO/open WO/lead time/safety stock;
- Material Request conversion vẫn **gross-only**, không dùng preview hạn chế này để tự giảm cam kết mua/sản xuất.

Bounded MRP API đã có optional netting seam; tenant-worker stock-balance binding còn là Dependency Request WS04 trước khi mode này được coi là production-wired end-to-end.

---

## 4. Routing / capacity / downtime

File: `server/packages/clouderp-erpnext/src/manufacturing-capacity.ts`

New authoritative document controllers:
- `Manufacturing Routing`;
- `Workstation Capacity Calendar`;
- `Manufacturing Downtime`.

Routing:
- company/item/effective range/active;
- sequenced operations;
- canonical `Operation` + `Workstation` masters;
- setup minutes + run minutes/unit;
- active effective overlap guard.

Capacity Calendar:
- effective range per workstation;
- weekday capacity hours;
- utilization %;
- overlap guard;
- không invent default 8h calendar.

Downtime:
- workstation + from/to + category/reason;
- optional Work Order/Job Card references;
- Job Card phải match company/workstation/optional Work Order;
- không mutate Job Card completion hay stock.

Finite capacity preview:
- UTC calendar-day buckets, max 366 days;
- Production Plan output + MRP subassembly manufacture demand;
- routing operations giữ sequence;
- required minutes = setup + run/unit × quantity;
- availability = weekday hours × utilization − submitted downtime;
- finite allocation across dates;
- late/capacity-shortage warnings;
- missing routing/calendar không được thay bằng invented capacity;
- summary available/downtime/allocated/remaining.

API `preview_capacity_plan` fail closed nếu relevant BOM/routing/calendar/downtime nằm ngoài actor read scope.

Granularity hiện là day-level planning; intra-day dispatching vẫn thuộc Job Card/shop-floor execution.

---

## 5. Genealogy / traceability

File: `server/packages/clouderp-erpnext/src/manufacturing-genealogy.ts`

API: `get_work_order_genealogy`.

Evidence source:
- canonical Work Order;
- submitted related Stock Entry documents;
- exact voucher-version Stock Ledger rows.

Projection phân biệt:
- Material Transfer Out;
- WIP Transfer In;
- Consumption;
- Finished Good;
- Scrap;
- Offcut;
- Recovery.

Tracked identity:
- batch/serial từ Stock Ledger;
- BOM row/manufacturing kind/physical identity/bundle khi match được document row duy nhất;
- input/output lot aggregation;
- cancelled Stock Entries được liệt kê nhưng không tính movement hiệu lực;
- hidden related Stock Entry => fail closed, không trả report thiếu mà giả như đầy đủ.

Trace scope cố ý là **`WORK_ORDER_GROUP`**. Repo không ghi one-input-lot → one-output-lot causal allocation, nên WS05 không bịa quan hệ 1:1.

---

## 6. Manufacturing cost evidence

File: `server/packages/clouderp-erpnext/src/manufacturing-costing-read.ts`

API: `get_work_order_cost_evidence`.

Scope: **read-only evidence**, không posted accounting.

Guards:
- submitted exact BOM;
- Work Order BOM identity + checksum phải match;
- canonical genealogy + Stock Ledger;
- hidden WO/BOM/Stock Entry => fail closed.

Evidence:
- standard material/operating/total cost prorated theo quantity produced;
- actual consumption/recovery/FG stock-value evidence;
- implied operation-cost signal từ canonical FG valuation;
- standard-vs-FG valuation variance;
- completion %;
- traceability warnings.

Response tự khai:
- `evidence_scope = READ_ONLY_CANONICAL_LEDGER`;
- `posting_status = NOT_POSTED`.

Không Cost Sheet table mới, không direct GL, không tự claim posted actual operation cost.

---

## 7. First-party Manufacturing/QMS app

Path: `server/apps-src/manufacturing-qms/`

Package contains:

### Manufacturing
- Manufacturing Routing + child operation;
- Workstation Capacity Calendar + child weekday capacity;
- Manufacturing Downtime;
- roles `Manufacturing Planner`, `Manufacturing Manager`.

### QMS
- Quality Plan + parameter child;
- Non Conformance Report;
- Root Cause Analysis;
- CAPA;
- Calibration Record;
- roles `Quality User`, `Quality Manager`;
- CAPA workflow: Nháp → Đang triển khai → Chờ xác minh → Đã đóng, manager có thể trả về triển khai; final close tách self-approval.

External canonical surfaces declared instead of copied:
- Operation;
- Workstation;
- Work Order;
- Job Card;
- Quality Inspection;
- Asset.

`manufacturing-qms` đã được thêm vào:
- `verify-first-party-meta.mjs`;
- `server/package.json -> app:check`.

No SQL migration required because these are first-party metadata DocTypes using the existing document kernel storage model.

---

## 8. QMS lifecycles

Files:
- `qms-controllers.ts`;
- `qms-calibration.ts`.

### Quality Plan
- Incoming / In Process / Final;
- item optional;
- effective range;
- sampling method `100% / Fixed / Percentage`;
- Numeric / Pass-Fail / Text parameters;
- fixed-point numeric limits;
- duplicate specification guard;
- active plan overlap guard per company/inspection/item scope.

### Sampling

File: `qms-sampling.ts`.

- 100% => full lot;
- Fixed => configured count capped to lot;
- Percentage => ceiling, không under-sample fractional count;
- sample count luôn integer <= lot.

### NCR
- optional rejected Quality Inspection source;
- source item must match;
- severity/category/description/affected qty/disposition/owner/due date;
- dynamic source document trace (`reference_type/reference_name`);
- cancel blocked while submitted RCA/CAPA dependents exist.

### RCA
- submitted NCR same company;
- method/root cause/evidence/analyst;
- cancel blocked while submitted CAPA exists.

### CAPA
- NCR required, RCA optional but must match NCR/company;
- corrective/preventive action;
- owner/due date/verification criteria;
- implementation + verification chronology;
- final submit/close only when verification = `Effective` and closure note exists;
- `Ineffective` cannot be closed and workflow can return it to implementation.

### Calibration

Registered authority: `ManufacturingCalibrationRecordController`.

- Company master;
- Asset is validated as a **submitted canonical Asset document**, same company, not mistaken for a master row;
- calibration date / next due date;
- Pass/Fail result;
- status Calibrated/Failed.

### Quality evaluation API

`metaforge.quality.evaluate_plan`:
- readable submitted active/effective Quality Plan;
- deterministic Numeric/Pass-Fail/Text evaluation;
- current execution seam while base `Quality Inspection` still has numeric-only reading contract.

### QMS KPI API

`metaforge.quality.get_qms_kpis`:
- report permission gates;
- per-document `canReadDocument` filtering;
- scope explicitly `ACTOR_VISIBLE`;
- NCR by severity;
- RCA count;
- CAPA opened/open/overdue/closed/ineffective;
- effectiveness %;
- average close days;
- calibration count/fail/due/due-within-30-days using latest record per instrument.

Không gắn nhãn “company-wide” cho dữ liệu mà actor không có quyền nhìn.

---

## 9. Capability maturity after autonomous work

| Capability | Maturity | Evidence / remaining gap |
|---|---|---|
| `M01-001/002/004/005` BOM parent/child/version/effective | **RC** | Existing canonical versioned BOM + WS05 bulk Draft input. |
| `M01-003` multi-level BOM | **Wired** | MRP explosion traverses child BOM graph with depth/cycle guards. |
| `M01-006` alternate BOM | **Foundation** | Explicit Production Plan `bom_no` is honored; lifecycle still forbids overlapping Active alternatives, so full alternate policy is not claimed. |
| `M01-007` phantom BOM | **Missing** | No repo-backed phantom contract. |
| `M01-008` substitute material | **Missing** | Requires material-selection/availability policy. |
| `M01-009..012` routing/operation/workstation/calendar | **Wired** | New routing/calendar compose with canonical Operation/Workstation masters. |
| `M02-001` Production Plan | **Wired** | Existing controller. |
| `M02-002` forecast integration | **Missing** | Demand source contract outside current WS. |
| `M02-003/004` MRP/material requirement | **Wired** | Multi-level gross explosion + MR Draft conversion + trace. |
| `M02-005` on-hand netting | **Foundation/Wired core** | ON_HAND_ONLY_NOT_ATP core/preview seam; full projected availability awaits WS04. |
| `M02-006` MTO/MTS | **Missing/Foundation** | No Sales Order/forecast demand link in Production Plan contract. |
| `M02-007..010` capacity/scheduling | **Wired** | Finite day-bucket routing/calendar/downtime preview. |
| `M03-001` Work Order | **RC** | Immutable BOM snapshot. |
| `M03-002/003` Job Card/time | **Wired** | Existing authoritative completion/time path. |
| `M03-004..008` WIP/issue/transfer/FG/scrap | **Wired/RC by path** | Existing Stock Entry + guards + reversal. |
| `M03-009` rework | **Missing — business decision required** | Repo does not define whether rework starts from rejected FG, source WO, dedicated rework BOM, or extra-material-only contract. |
| `M03-010` subcontract | **Missing — shared dependency** | Needs procurement + material-sending + valuation contracts, must not create competing stock/procurement ledgers. |
| `M03-011` downtime | **Wired** | New canonical downtime document + capacity impact. |
| `M03-012/013` labor/machine logs | **Foundation/Wired** | Job Card employee/time/workstation exists; no dedicated rate/advanced machine execution contract claimed. |
| `M04-001..003` manufacturing/standard cost | **Wired evidence** | BOM/WO standard snapshot + read model. |
| `M04-004..007` actual/variance/WIP analysis | **Foundation/Wired read-only** | Canonical material/FG valuation evidence exists; posted operation/variance/period accounting awaits WS01/WS04. |
| `M04-008/009` genealogy raw ↔ FG | **Wired** | Work Order group trace on canonical ledger. |
| `M04-010` FG → customer | **Foundation/Missing closure** | Requires selling/delivery trace query contract. |
| `Q01-001/002` plan/template | **Wired** | First-party metadata + authoritative controller. |
| `Q01-003..006` incoming/in-process/final/sampling | **Wired** | Plan/evaluation/sampling; persisted Quality Inspection qualitative widening remains dependency. |
| `Q01-007` readings | **Wired** | Numeric base QI + WS05 evaluation for all parameter types. |
| `Q01-008/009` NCR/RCA | **Wired** | Authoritative lifecycles. |
| `Q01-010/011` corrective/preventive action | **Wired** | CAPA lifecycle + effective verification close guard. |
| `Q01-012/013` supplier/customer NC | **Foundation** | NCR dynamic source document reference; specialized complaint workflow not claimed. |
| `Q01-014` calibration | **Wired** | Asset-aware calibration lifecycle. |
| `Q01-015/016` KPI/reporting | **Wired** | Actor-visible QMS KPI method. |

Không capability nào được nâng **Hardened** vì full suite/CI chưa chạy trong environment này.

---

## 10. Dependency Requests

### DR-WS04-01 — Projected inventory / ATP contract

Needed for:
- authoritative MRP netting;
- reservation-aware availability;
- open supply/WO/PO projected balance;
- safety stock/lead-time netting;
- WIP/repost/backdate cost evidence.

Current safe fallback: gross MRP + optional `ON_HAND_ONLY_NOT_ATP` preview. Automatic MR conversion remains gross.

### DR-WS01-01 — Manufacturing cost posting / period / GL contract

Needed for:
- immutable posted Cost Sheet;
- actual labor/machine rate posting;
- manufacturing variance GL;
- accounting period/lock semantics;
- valuation-delta posting and correction.

Current safe fallback: read-only canonical ledger evidence with `posting_status=NOT_POSTED`.

### DR-WS09-01 — Generic AppAction operational surfaces

Needed for:
- metadata-driven UI for MRP preview/create;
- capacity preview;
- genealogy/cost evidence;
- QMS evaluation/KPI;
- generic 500-row BulkTransaction UI.

Current shared ActionScreen compatibility transport caps BulkTransaction to 200 rows. WS05 does not patch shared renderer/compiler from a domain branch.

### DR-WS00-01 — Read-only controller preview + business-key serialized create

Needed for:
- full authoritative BOM bulk preview without write;
- business-key serialization of simultaneous first bulk creates without adding WS05-local locking primitive.

Current commit still authoritative/fail-closed; only Draft duplicate race remains.

### DR-QI-01 — Quality Inspection qualitative reading contract

Existing base `Quality Inspection` is numeric-reading oriented. Quality Plan supports Numeric + Pass/Fail + Text. Persisted plan-driven inspection should widen the shared QI reading contract/metadata instead of dropping qualitative evidence.

Current safe execution seam: `evaluate_plan` pure method.

### DR-DEMAND-01 — MTO/MTS / forecast demand linkage

Production Plan currently has no canonical Sales Order/forecast demand identity. MTO/MTS cannot be inferred safely from item/warehouse alone.

### DR-REWORK-01 — Rework operating model decision

Repo does not establish whether rework:
- consumes rejected finished goods;
- references original Work Order;
- uses a dedicated rework BOM/routing;
- or only records incremental materials/operations.

This is a genuine business decision, not a technical default.

### DR-SUBCONTRACT-01 — Subcontract manufacturing integration

Requires procurement/supplier + material transfer + stock valuation contract across WS03/WS04. WS05 will not introduce a second subcontract stock/procurement ledger.

### DR-TRACE-01 — Finished good → customer genealogy

Requires canonical selling/delivery trace query across Delivery Note/stock identity with selling permissions. Work Order raw ↔ FG genealogy is complete at WORK_ORDER_GROUP scope; customer closure belongs on the selling/stock boundary.

---

## 11. Legacy PR disposition

### PR #201 — manufacturing actual costing

Disposition: **selective concept reuse only**.

Reused direction:
- exact BOM snapshot identity;
- canonical ledger evidence;
- standard-vs-actual variance thinking;
- append-only/correction requirement.

Not transplanted:
- stale migration numbers;
- stale sidecar/UI wiring;
- unfinished WIP/valuation posting assumptions;
- direct branch merge.

### PR #208 — Plastic ERP production run

Disposition: **generic invariant extraction only**.

Preserved direction:
- server-authoritative run/execution;
- resource overlap/downtime concepts;
- genealogy and Work Order/Stock Entry reconciliation;
- no competing stock ledger.

Plastic-specific DocTypes/process naming stay vertical.

---

## 12. Verification inventory

Targeted regression files authored:

- `manufacturing-bom-bulk.test.mjs`
- `manufacturing-bom-bulk-api.test.mjs`
- `manufacturing-mrp.test.mjs`
- `manufacturing-mrp-api.test.mjs`
- `manufacturing-mrp-netting.test.mjs`
- `manufacturing-mrp-netting-api.test.mjs`
- `manufacturing-capacity.test.mjs`
- `manufacturing-capacity-api.test.mjs`
- `manufacturing-genealogy.test.mjs`
- `manufacturing-genealogy-api.test.mjs`
- `manufacturing-costing-read.test.mjs`
- `manufacturing-costing-api.test.mjs`
- `qms-lifecycle.test.mjs`
- `qms-api.test.mjs`
- `qms-sampling.test.mjs`

Approximately **95 targeted `node:test` cases** were authored/extended across these slices.

### Execution status

**NOT RUN in this environment.**

Reason:
- no usable local Forge checkout/dependency tree;
- prior local GitHub clone path could not resolve/reach GitHub;
- repo CI is not repurposed as an ad-hoc development shell.

Required before merge:
- `npm run build`;
- relevant targeted `node --test` after build;
- `npm run app:check`;
- full business-suite gate where available;
- inspect any current-main merge conflicts in shared files (`registry.ts`, tenant worker entrypoint, package/meta gates).

Missing execution evidence prevents Hardened promotion, but per autonomous protocol it did not stop independent implementation.

---

## 13. Definition of Done result

### Done in WS05 branch

- exact-state/repo audit;
- legacy PR disposition;
- bounded BOM bulk flow;
- multi-level MRP + MR conversion;
- explicit limited netting semantics;
- routing/capacity/downtime planning;
- Work Order genealogy;
- read-only cost evidence;
- installable first-party Manufacturing/QMS metadata package;
- QMS lifecycle/evaluation/sampling/KPI;
- permission/tenant/read-scope guards;
- correction/dependency semantics;
- targeted tests authored;
- workstream handoff/dependency requests;
- PR checkpoint.

### Intentionally not fabricated

- ATP/projected inventory;
- MTO/MTS without demand source;
- phantom/substitute policy;
- rework business model;
- subcontract procurement/valuation flow;
- posted manufacturing GL variance;
- qualitative persisted Quality Inspection widening;
- FG → customer genealogy;
- shared AppAction UI compiler behavior.

These are named dependencies/decisions rather than hidden TODOs.

## Handoff

Workstream: **WS05**  
Branch: `agent/ent-05-manufacturing-qms`  
PR: **#327**  
Status: **AUTONOMOUS IMPLEMENTATION COMPLETE — MERGE/DEPLOY APPROVAL REQUIRED**  
Owned capabilities: `M01-M04`, `Q01`  
SQL migration: **none**  
New competing ledger: **none**  
Posted GL change: **none**  
Tests: **AUTHORED, NOT RUN**  
Metadata package: `apps-src/manufacturing-qms`  
Merge/deploy: **not performed; explicit approval required because changes are backend/business behavior.**
