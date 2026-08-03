# AGENT 02 — MANUFACTURING CLOSURE

Status: SEEDED
Branch: `rc/transaction-closure-02-manufacturing`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Risk: CRITICAL

## Mission

Close manufacturing as one auditable chain:

`BOM/version -> planning/MRP -> Work Order -> material issue/transfer -> Finished Goods -> scrap/rework -> actual cost/variance -> genealogy/correction`

Capability focus: `M01-001..M04-010`.

## Own

- manufacturing/BOM/MRP/shop-floor domain code and metadata;
- manufacturing cost integration seams owned by the manufacturing domain;
- manufacturing-specific regressions and traceability evidence.

## Do not own

- canonical stock ledger/valuation/repost authority: Agent 03;
- canonical GL/cross-ledger reporting: Agent 04;
- generic App Factory/compiler/shared runtime;
- Sales or Procurement lifecycle.

## Required audit

- BOM parent/children/version/effective-date behavior;
- routing/operation/workstation;
- Production Plan/MRP/material requirement;
- Work Order/Job Card and completion guards;
- issue/transfer for manufacture and FG receipt;
- scrap/rework/subcontracting if current code supports it;
- actual material/labor/machine/overhead cost path;
- valuation impact and manufacturing variance;
- lot genealogy raw -> FG -> customer seams;
- historical manufacturing/costing/Plastic ERP PRs: classify before reuse.

## Required evidence

- multi-level BOM + version selection;
- partial production and excess/short material scenarios;
- retry/idempotency and duplicate completion protection;
- cancellation/reversal/correction;
- backdated consumption/FG with canonical stock repost semantics;
- scrap/rework effects;
- stock balance/valuation reconciliation;
- finance impact consumes canonical GL contract;
- tenant/company/warehouse permission isolation.

## Dependency behavior

Any stock-ledger/valuation contract change belongs to Agent 03. Any GL/report/reconciliation contract change belongs to Agent 04. Raise Dependency Request; do not create a competing manufacturing ledger.

## Merge boundary

PR-ready autonomously. Non-UI merge/deploy requires explicit user approval.

## Startup prompt

Đọc file này, program artifacts, Forge Enterprise Completion Skill và exact repo state. Audit substantive manufacturing/costing PR lịch sử trước khi code. Giữ canonical stock/GL làm authority; manufacturing chỉ consume/integrate. Nếu dependency thuộc Agent 03/04 thì ghi Dependency Request và tiếp tục mọi phần độc lập. Chạy CRITICAL validation, cập nhật Completion Record, dừng trước merge/deploy.

## Completion record

Pending worker execution.
