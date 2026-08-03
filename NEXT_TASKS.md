# NEXT TASKS

Ngày cập nhật: **2026-08-04**.

## Trạng thái hiện tại

**RC Hardening Wave 0 + Batch 1A Finance/Inventory implementation đã hội tụ vào `main`.**

Canonical evidence:

- Capability truth: `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.
- RC blueprint: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`.
- Validation: `docs/VALIDATION_GATES.md` + `validation/rc-gates.json`.
- Batch 1A convergence: `docs/agents/rc/RC_BATCH1A_CONVERGENCE_20260804.md`.

Batch 1A authority checkpoints đã merge:

- RC-020 Finance posting/period/reversal.
- RC-021 AR/customer settlement + reconciliation.
- RC-022 AP/supplier settlement + reconciliation.
- RC-023 Cash/Bank reconciliation.
- RC-024/025 Stock reconciliation/correction + backdate/repost/valuation.

Merge không tự động đồng nghĩa RC/Hardened. Evidence owner phải promotion Capability Status riêng sau exact gates.

## Batch tiếp theo — Batch 1B ERP Core

Finance + Inventory shared authority đã freeze đủ để domain phía trên implementation song song mà không tự tạo source of truth mới.

Mở tối đa **5 worker**. Không mở thêm chỉ để GitHub trông đông vui.

### Lane 1 — Procurement RC-030 + RC-031

`RC-030` — RFQ to PO, STANDARD:

`Purchase Request -> RFQ -> Supplier Quote -> Compare -> Approve -> Purchase Order`

`RC-031` — PO to Payment, CRITICAL:

`PO -> partial Receipt -> QC -> Purchase Invoice -> partial Payment -> return/correction -> supplier reconciliation`

Phải consume:
- RC-022 AP authority;
- RC-024/025 stock authority;
- RC-020 period/GL authority.

Không tạo payable ledger hoặc stock state cạnh tranh.

### Lane 2 — CRM / O2C RC-032 + RC-033

`RC-032` — CRM core, STANDARD:

`Lead -> Customer/Contact -> Opportunity -> Activity -> Quotation`

`RC-033` — Order-to-Cash, CRITICAL:

`Quotation -> Sales Order -> partial Delivery -> partial Invoice -> partial Payment -> return/credit -> reconciliation`

Phải consume RC-021 AR + RC-020 Finance + RC-024/025 inventory contracts.

Không tạo customer balance/paid amount authority riêng.

### Lane 3 — HCM / Payroll RC-034 + RC-035

`RC-034` — employee lifecycle/time, STANDARD:

`Applicant -> Offer -> Employee -> Contract -> Transfer/Promotion -> Separation`

`Shift/Checkin -> Attendance -> Leave -> OT -> Adjustment`

`RC-035` — Payroll to GL, CRITICAL:

`source freeze -> salary calculation -> slip -> payroll entry -> GL -> payment/export -> correction/rerun`

Phải giữ used-source immutability, effective legal-rule versioning và payroll↔GL reconciliation.

### Lane 4 — Manufacturing RC-036 + RC-037

`RC-036` — BOM/MRP, STANDARD/CRITICAL by stock impact:

`BOM/version/routing -> demand -> plan/MRP -> Work Order`

`RC-037` — Shopfloor/Cost, CRITICAL:

`material issue/transfer -> Job Card -> FG/scrap/WIP -> actual cost -> variance -> stock/GL reconciliation`

Phải consume frozen stock/valuation/Finance authority; không tạo manufacturing stock/cost ledger cạnh tranh.

### Lane 5 — QMS RC-038 + cross-domain evidence coordination

`RC-038` — QMS, STANDARD:

`Incoming/In-process/Final Inspection -> NCR -> RCA -> CAPA -> close/reopen evidence`

QMS stock/cost side effects phải đi qua canonical controller authority.

Lane 5 có thể đồng thời audit shared evidence gaps của Batch 1A nhưng không được sửa authority contract lane khác nếu tách được; ghi Dependency Request và tiếp tục.

## Batch 1B exit gate

Selected ERP Core flow chỉ được gọi RC khi có:

- happy path;
- partial path;
- cancel/correction/reversal;
- backdate khi applicable;
- server permission + tenant/company scope;
- retry/idempotency khi mutation;
- import/migration path nếu cần;
- report/query/control evidence;
- money/stock/payroll reconciliation;
- browser/mobile evidence nếu published actor flow có UI;
- không duplicate source of truth;
- không Critical unknown trong published scope.

## CẤM DỪNG contract cho worker

Worker không được dừng vì quyết định kỹ thuật thông thường, test unrelated, stale PR, main tiến lên, thiếu local dependency, CI không chạy, blocker cục bộ hoặc maturity chưa đạt RC.

Nếu một phần bị block:

1. ghi Dependency Request;
2. xác định owner/contract;
3. tiếp tục mọi phần độc lập.

Chỉ dừng hỏi user khi:

1. business decision không thể suy ra từ repo/docs;
2. shared contract workstream khác bắt buộc đổi và không thể isolate;
3. destructive/production operation;
4. merge/deploy non-UI.

## Sau Batch 1B

- `RC-040` WMS.
- `RC-041` Project/PSA.
- `RC-042` Service/Field Service.
- `RC-043` Semantic BI.
- `RC-044` Integration Foundation.
- `RC-045` Workplace/DMS/Notifications.
- `RC-046` App Factory builders/runtime.
- `RC-047` AI typed tool/preview/approval.
- `RC-050..054` Alumdoor current-main end-to-end + production hardening proof.

Không resurrect historical PR làm canonical task. Task mới bắt đầu từ exact current `main` và audit history chỉ như evidence/reuse source.
