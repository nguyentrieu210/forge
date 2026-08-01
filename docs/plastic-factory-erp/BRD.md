# BRD — Plastic Factory ERP

Ngày: 2026-08-02  
Trạng thái: G1 Requirements — Draft để khóa nghiệp vụ trước implementation  
Branch: `feat/plastic-factory-erp-brd-20260802`  
Base: `main` tại `3222beb66bd3e6b2abbab1b17a6009044a2d5358`

## 0. Assumptions và câu hỏi mở

| Assumption / question | Evidence / default | Risk nếu sai | Decision mặc định |
|---|---|---|---|
| Loại nhà máy nhựa chưa được chỉ rõ | Yêu cầu hiện tại chỉ nói “nhà máy nhựa” | Ép phun, đùn, thổi, film và compound có chi tiết khác nhau | Xây core dùng chung, có `process_type` để cấu hình theo công nghệ |
| Forge hiện có Sales, Purchase, Inventory, Manufacturing nền | Main đã có versioned BOM, immutable Work Order snapshot, stock lifecycle/reservation | Viết lại sẽ tạo hai nguồn sự thật | Tái sử dụng kernel hiện có, chỉ bổ sung domain nhựa |
| Quản lý nguyên liệu theo lot là bắt buộc | Hạt nhựa/màu/phụ gia cần truy xuất nguồn gốc và QC | Không truy được lỗi, nhà cung cấp, giá thành | Lot/batch là identity chuẩn của nguyên liệu và thành phẩm |
| Thành phẩm có thể tính theo kg, chiếc hoặc mét | Tùy sản phẩm nhựa | Sai BOM, tồn kho, định mức | Cho phép stock UOM + production UOM + conversion |
| Phế liệu có thể tái nghiền/tái sinh | Thông lệ sản xuất nhựa | Sai giá thành và tồn kho nếu coi toàn bộ là mất | Tách scrap mất giá trị và regrind/recycle có thu hồi giá trị |
| Máy và khuôn ảnh hưởng kế hoạch | Sản xuất nhựa thường bị ràng buộc bởi machine + mold/tool | Kế hoạch khả thi trên giấy nhưng không chạy được | Work Order/Production Run phải khóa machine, mold và capacity |
| QC cần theo lô | Raw material, in-process, finished goods đều có thể cần kiểm | Không chặn hàng lỗi hoặc truy xuất nguyên nhân | QC inspection gắn lot/batch và trạng thái release/hold/reject |
| Accounting đầy đủ chưa phải lát đầu | Forge còn Finance full scope chưa hoàn tất | Nếu kéo GL vào ngay sẽ làm chậm manufacturing core | Slice đầu khóa operational costing, GL integration là epic riêng |

### Các quyết định cần chủ nhà máy xác nhận trước khi implementation sâu

1. Công nghệ chính: ép phun / đùn / thổi / film / phối hạt / nhiều loại.
2. Đơn vị sản xuất chính: kg, chiếc, mét hay hỗn hợp.
3. Có quản lý khuôn riêng hay không; một khuôn có bao nhiêu cavity.
4. Có tái nghiền phế liệu và pha lại vào công thức hay không.
5. QC cần chỉ pass/fail hay cần chỉ tiêu đo chi tiết theo sản phẩm.
6. Giá thành cần tới mức machine-hour, labor-hour, electricity, mold depreciation hay chỉ material + overhead.

Không có câu trả lời, hệ thống vẫn có thể bắt đầu bằng defaults ở BRD này nhưng không được hard-code giả định vào core.

## 1. Problem

### P0 — Truy xuất và tồn kho nguyên liệu/thành phẩm

- Không để tồn kho chỉ biết tổng kg mà không biết lot nhà cung cấp, màu, grade, MFI/spec hoặc lô sản xuất.
- Mọi xuất dùng cho sản xuất phải truy ngược được receipt/lot/warehouse/work order.
- Thành phẩm phải truy ngược được material lots, máy, khuôn, ca và production run.

### P0 — Kiểm soát định mức và thực tế

- Recipe/BOM có version, hiệu lực theo ngày và snapshot bất biến khi Work Order release.
- So sánh planned vs issued vs consumed vs produced vs scrap/regrind.
- Không cho over-consumption hoặc over-production âm thầm.

### P0 — Điều hành máy/khuôn/ca

- Kế hoạch phải biết machine capability, mold compatibility, cycle time, cavity, planned quantity và downtime.
- Không cho cùng machine/mold chạy hai production run chồng thời gian nếu resource được cấu hình exclusive.

### P1 — QC và hàng lỗi

- Incoming QC, in-process QC và final QC.
- Hold lot không được issue/deliver nếu policy yêu cầu release.
- NCR/defect phải gắn nguyên nhân, disposition và chi phí.

### P1 — Giá thành thực tế

- Material actual consumption theo lot/value.
- Scrap/regrind/by-product giữ hoặc loại giá trị theo policy.
- Machine time, labor, power/overhead có thể được cộng vào production run.
- Giá thành theo batch/run và unit cost của finished lot.

## 2. Goals và acceptance evidence

| Goal | Acceptance evidence |
|---|---|
| Truy xuất nguyên liệu → thành phẩm | Từ finished batch mở lineage thấy đúng raw material lots, receipts, machine, mold, shift, work order |
| Truy xuất thành phẩm → nguyên liệu | Từ raw material lot thấy tất cả production runs/finished batches đã tiêu thụ |
| BOM/Recipe bất biến tại release | Sửa BOM sau release không làm thay đổi Work Order snapshot/checksum |
| Tồn kho đúng theo lot và UOM | Receipt/issue/consume/produce/transfer/reconcile cho quantity + weight khớp ledger |
| Phế liệu không làm sai giá trị | Scrap mất giá trị và regrind thu hồi giá trị theo cấu hình, tổng valuation reconcile |
| Capacity khả thi | Scheduler phát hiện machine/mold conflict và overload theo shift/calendar |
| QC chặn đúng | Lot Hold/Reject không được issue hoặc deliver qua authenticated API/UI |
| Costing audit được | Production batch có material cost + conversion cost + scrap/recovery + unit cost, reconcile về stock value |
| Permission đúng vai trò | Operator không sửa recipe/cost; QC không được post tài chính; manager có approval theo scope |
| Mobile shop-floor dùng được | Operator có luồng start/pause/complete, consume/scrap/QC tối thiểu trên mobile |

### Invariants

1. Submitted stock/manufacturing records append-only; sửa sai bằng reversal/adjustment.
2. Work Order release tạo snapshot recipe/BOM bất biến.
3. Lot/batch identity không được tái sử dụng giữa tenant/company.
4. Quantity, weight và value không được diverge giữa document và ledger sau submit.
5. Hold/Reject lot fail closed ở mọi đường xuất/tiêu thụ/giao hàng được policy bảo vệ.
6. Resource conflict phải được kiểm server-side, không chỉ ở UI.
7. Mọi mutation phải tôn trọng tenant/company/warehouse scope và authenticated RBAC.

## 3. Actors

| Actor | Job | Data scope | Allowed | Forbidden |
|---|---|---|---|---|
| Chủ nhà máy | Quản trị vận hành | Toàn company/plant | Xem KPI, duyệt exception, cost/capacity | Không sửa submitted ledger trực tiếp |
| Kế hoạch sản xuất | Lập plan/work order | Plant được phân quyền | Plan, schedule, release WO | Không sửa QC result hoặc stock đã submit |
| Quản đốc | Điều hành ca/máy | Work center/shift | Assign run, pause/resume, approve scrap exception | Không sửa recipe master ngoài quyền |
| Operator | Chạy máy | Machine/run được giao | Start/pause/complete, report output/scrap/downtime | Không đổi cost, BOM, permission |
| Thủ kho | Nhập/xuất/chuyển | Warehouse được phân quyền | Receipt, issue, transfer, reconcile | Không release recipe hoặc QC |
| QC | Kiểm chất lượng | Lots/inspection scope | Sample, record test, Release/Hold/Reject | Không post stock/value ngoài disposition workflow |
| Mua hàng | Supplier/material | Purchase scope | PO/receipt context, supplier lot/spec | Không đổi manufacturing result |
| Bán hàng | Customer/FG | Sales scope | SO, availability, delivery demand | Không release held lot |
| Kế toán giá thành | Cost review | Company/period | Rate/overhead, close/reconcile cost | Không sửa production quantity lịch sử |
| Admin | Cấu hình | Tenant/company | Role, master policy, numbering | Không bypass audit invariants |

## 4. Entities và field contracts

### 4.1 Material / Item extensions

- `item_code`: string, unique trong tenant/company policy.
- `item_kind`: Raw Material / Masterbatch / Additive / Packaging / Regrind / Semi Finished / Finished Good.
- `polymer_family`: PP / PE / HDPE / LDPE / PVC / ABS / PET / PA / PC / Other.
- `grade`: supplier/internal grade.
- `color_code`, `color_name`.
- `stock_uom`: kg / Nos / m / etc.
- `production_uom` và conversion nếu khác stock UOM.
- `qc_required`: bool.
- `shelf_life_days` optional.
- `regrind_allowed_pct` optional.

### 4.2 Recipe / BOM revision

Tái sử dụng versioned BOM hiện có, bổ sung domain fields:

- `process_type`: Injection / Extrusion / Blow / Film / Compounding / Other.
- `revision`, `effective_from`, `effective_to`, `status`.
- Recipe rows: material, planned qty/ratio, stock UOM, tolerance, `material_role`.
- `regrind_max_pct` và rule blend nếu áp dụng.
- `default_machine_group` optional.
- `default_mold` optional.
- `target_cycle_seconds`, `target_scrap_pct` optional.
- Snapshot/checksum tại Work Order release.

### 4.3 Machine

- `machine_code`, `machine_name`.
- `machine_group` / process type.
- `capacity_min`, `capacity_max` theo field phù hợp công nghệ.
- `hourly_machine_rate` optional.
- `power_kw` optional.
- `status`: Active / Maintenance / Down / Retired.
- `calendar` / supported shifts.

### 4.4 Mold / Tool

- `mold_code`, `mold_name`.
- `product/item compatibility`.
- `cavity_count` >= 1.
- `compatible_machine_group` hoặc machine list.
- `standard_cycle_seconds` optional.
- `shot_weight` optional.
- `maintenance_cycle_count` optional.
- `status`: Available / In Use / Maintenance / Retired.

### 4.5 Production Plan

- Demand sources: Sales Order / forecast / manual plan.
- Planned item, qty, due date, priority.
- Proposed machine/mold/shift.
- Capacity status: feasible / overload / conflict.
- Generated Work Orders.

### 4.6 Work Order

Tái sử dụng canonical Work Order:

- Recipe/BOM snapshot + checksum.
- Planned qty and production UOM.
- Planned machine/mold/work center.
- Planned start/end.
- Required material snapshot.
- Status: Draft / Released / In Progress / Completed / Cancelled.

### 4.7 Production Run / Batch

Một Work Order có thể có nhiều run theo ca/máy:

- `run_no`, `work_order`.
- `machine`, `mold`, `shift`, `operator`.
- `started_at`, `ended_at`, pause/downtime intervals.
- `input_material_lots[]`.
- `good_qty`, `scrap_qty`, `regrind_qty`, `byproduct_qty`.
- `finished_batch`.
- actual cycle time / shots optional.
- machine/labor/energy/overhead cost buckets.

### 4.8 Quality Inspection

- Stage: Incoming / In Process / Final.
- Reference: receipt lot / production run / finished batch.
- Inspection template version.
- Measurements: key, value, unit, min/max/target, result.
- Overall: Pending / Released / Hold / Rejected.
- Actor/timestamp/sample size/notes.

### 4.9 Defect / NCR

- Reference lot/run/order/customer return.
- Defect code, root cause category, qty/weight.
- Responsibility: supplier / production / setup / material / machine / customer / unknown.
- Disposition: rework / regrind / scrap / use-as-is / return supplier.
- Cost impact and approval audit.

### 4.10 Costing snapshot

- Material actual value consumed.
- Recovered regrind/by-product value.
- Machine time cost.
- Labor cost.
- Energy/overhead allocation.
- Scrap loss.
- Total run cost and finished unit cost.
- Close status and adjustment lineage.

## 5. Core workflows

### WF1 — Mua và nhập nguyên liệu theo lot

1. Purchase Order theo material/grade/spec.
2. Receipt tạo supplier lot + internal lot.
3. Nếu `qc_required`, lot ở `Hold` cho tới Incoming QC.
4. QC Release mới trở thành available cho production.
5. Physical stock report phải thấy lot, weight, warehouse và receipt lineage.

Failure branches:

- Lot duplicate → reject.
- QC Hold/Reject → issue fail closed.
- Quantity/weight mismatch ngoài tolerance → require explicit reconciliation/approval.

### WF2 — Recipe/BOM và release Work Order

1. Planner chọn active recipe revision đúng effective date.
2. System kiểm item, UOM, ratio/tolerance, circular BOM và resource compatibility.
3. Release WO tạo immutable snapshot/checksum.
4. Material availability tính theo lot và QC status.
5. Sau release, sửa recipe không ảnh hưởng WO cũ.

### WF3 — Schedule machine/mold/shift

1. Planner assign machine + mold + shift.
2. Server kiểm machine status, mold status, compatibility và overlap.
3. Tính estimated duration từ qty/cavity/cycle time hoặc configured capacity.
4. Nếu overload/conflict, status không thể chuyển Scheduled nếu chưa resolve hoặc approve exception theo policy.

### WF4 — Issue/consume/produce

1. Warehouse issue nguyên liệu theo FIFO/FEFO/configured allocation và lot.
2. Operator start production run.
3. Actual consumption ghi theo lot.
4. Good output tạo finished batch.
5. Scrap/regrind/by-product ghi riêng, có disposition và valuation rule.
6. Complete run cập nhật Work Order progress.

Failure branches:

- Consume lot Hold/Reject → reject.
- Consume vượt issued/allowed tolerance → reject hoặc approval flow.
- Produce vượt WO remaining → reject.
- Machine/mold không đúng run → reject.
- Duplicate submit/concurrent complete → idempotent hoặc fail rõ, không double stock.

### WF5 — QC trong quá trình và cuối

1. In-process inspection theo run hoặc interval.
2. Final QC trên finished batch.
3. Release → batch available cho delivery.
4. Hold/Reject → delivery/reservation fail closed.
5. NCR/disposition có thể sinh rework/regrind/scrap movement.

### WF6 — Giá thành

1. Gather actual material consumption value.
2. Trừ recovered value theo policy.
3. Cộng machine/labor/energy/overhead.
4. Reconcile total run value với finished stock + recovered stock + scrap loss.
5. Close costing snapshot theo period/run.
6. Adjustment sau close là append-only, có reason/actor/timestamp.

## 6. Permission/action matrix

| Action | Operator | Thủ kho | QC | Planner | Quản đốc | Costing | Owner/Admin |
|---|---:|---:|---:|---:|---:|---:|---:|
| Create/activate Recipe | No | No | No | Limited | Limited | No | Yes |
| Release Work Order | No | No | No | Yes | Yes | No | Yes |
| Schedule machine/mold | No | No | No | Yes | Yes | No | Yes |
| Post material issue | No | Yes | No | No | Limited | No | Yes |
| Start/pause/complete run | Yes | No | No | No | Yes | No | Yes |
| Record scrap/regrind | Yes | Limited | No | No | Yes | No | Yes |
| QC Release/Hold/Reject | No | No | Yes | No | No | No | Yes |
| Transfer/Reconcile stock | No | Yes | No | No | Limited | No | Yes |
| Close production costing | No | No | No | No | No | Yes | Yes |
| Override tolerance/resource conflict | No | No | No | Limited | Yes | Limited | Yes |
| Edit submitted ledger | No | No | No | No | No | No | No |

Server-side authorization là authoritative; UI chỉ phản ánh quyền.

## 7. Interaction surfaces

### Office / desktop

- Master Data: Material, Machine, Mold, Recipe, QC Template.
- Planning board: demand, Work Order, capacity, machine/mold conflicts.
- Warehouse: receipt, issue, transfer, physical stock/lot lineage.
- QC: inspection queue, held/rejected lots, NCR.
- Costing: run cost, variance, scrap/recovery, close/reconcile.
- Reports: material usage, OEE-lite, scrap, output, downtime, lot traceability, cost variance.

### Shop-floor / mobile

- “Việc của ca này”.
- Scan/select Work Order, machine, mold, material lot.
- Start / Pause / Resume / Complete.
- Report good quantity, scrap/regrind, downtime reason.
- Quick QC measurements.
- QR lot/run/document route.

## 8. Reports/KPI bắt buộc

1. Production plan vs actual.
2. Material planned vs issued vs consumed variance.
3. Good output / scrap / regrind by item, machine, mold, shift, operator.
4. Machine utilization and downtime.
5. Mold usage/maintenance counter.
6. Raw material lot traceability.
7. Finished batch genealogy.
8. QC release/hold/reject and defect Pareto.
9. WIP and shortages.
10. Production cost per run/batch/item.
11. Cost variance vs standard.
12. Inventory aging by lot, optional FEFO/shelf-life.

## 9. Out of scope cho first implementation epic

- Payroll/HRM đầy đủ.
- Full statutory accounting/GL/tax localization.
- Advanced APS optimization solver.
- PLC/IoT automatic machine telemetry.
- Predictive maintenance AI.
- Customer portal/supplier portal.
- Production deployment trước khi có explicit release instruction và CI/evidence phù hợp.

Các mục này phải có epic riêng, không nhét vào foundation.

## 10. Architecture decisions

1. Không tạo ERP mới tách khỏi Forge kernel; dùng multi-app/domain metadata trên cùng nền Forge.
2. Không tạo nguồn tồn kho hoặc costing thứ hai; stock ledger và manufacturing projection hiện có là canonical.
3. Versioned BOM + immutable Work Order snapshot hiện có được tái sử dụng.
4. Plastic-specific state bổ sung bằng domain fields/documents/projections, không fork core cho từng process type.
5. Machine, Mold, Production Run, QC Inspection, NCR là domain entities chính mới.
6. Lot/batch lineage dùng identity chuẩn của Inventory, không tạo lot model riêng.
7. Mọi document submitted giữ append-only/reversal semantics.
8. Mỗi implementation slice một branch/PR; exact-head CI phải PASS trước merge.
9. Không Cloudflare deploy, production secret/DNS hoặc customer-data mutation nếu chưa có lệnh explicit phù hợp project guardrail.

## 11. Product identity

- Product name tạm: `Forge Plastic ERP`.
- Slug đề xuất: `plastic`.
- Deliverable: internal operational ERP web/mobile.
- Target: nhà máy nhựa vừa và nhỏ đến nhiều xưởng/warehouse.
- Distribution: một Forge app/domain package, tenant-scoped metadata + policies.

## 12. Implementation roadmap sau khi G1 được duyệt

### Slice P0-A — Plastic master + recipe

- Material domain fields.
- Machine + Mold masters.
- Recipe/BOM plastic extension.
- Compatibility/tolerance validation.
- Tests/typecheck/build.

### Slice P0-B — Production Run + shop-floor

- Work Order assignment machine/mold/shift.
- Run lifecycle start/pause/resume/complete.
- Actual lot consumption, good output, scrap, regrind.
- Concurrency and reversal tests.

### Slice P0-C — QC lot gate

- Inspection template/results.
- Release/Hold/Reject.
- Server-side block on consume/delivery/reservation.
- Traceability acceptance desktop/mobile.

### Slice P1 — Capacity + maintenance counters

- Shift/calendar.
- Machine/mold overlap checks.
- Capacity/load report.
- Mold shot/cycle maintenance counters.

### Slice P1 — Operational costing

- Material actual cost.
- Scrap/regrind recovery.
- Machine/labor/energy/overhead.
- Batch/run costing and variance.

### Slice P2 — End-to-end acceptance

Purchase raw material → Incoming QC → lot release → recipe → schedule → WO → issue → production run → in-process QC → finished batch → final QC → stock → sales delivery → costing/traceability.

## G1 done condition

G1 được coi là approved khi chủ dự án xác nhận BRD này đúng hướng và chốt tối thiểu process profile chính. Sau đó mới mở implementation slice P0-A từ current `main`; không tiếp tục implementation trên branch BRD này.
