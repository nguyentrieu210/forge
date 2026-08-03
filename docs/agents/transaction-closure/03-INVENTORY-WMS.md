# AGENT 03 — INVENTORY / WMS CLOSURE

Status: SEEDED
Branch: `rc/transaction-closure-03-inventory-wms`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Risk: CRITICAL

## Mission

Close inventory operations on top of the existing authoritative stock ledger:

`reservation -> putaway/picking/packing/transfer -> batch/serial -> count freeze -> reconciliation -> valuation/backdate/repost -> correction`

Capability focus: `W01-001..W01-032`, `W02-001..W02-014`.

## Own

- inventory/WMS orchestration and stock-domain regressions;
- reservation, putaway, picking, packing, replenishment, cycle count and scanner seams;
- reconciliation/backdate/repost integration with current stock authority.

## Do not own

- GL/cross-ledger report authority: Agent 04;
- Sales/Manufacturing/Procurement lifecycle logic;
- duplicate stock balance or valuation ledgers;
- generic runtime/App Factory primitives.

## Required audit

- exact current stock ledger and valuation authority after RC-024/025;
- Stock Entry/Receipt/Issue/Transfer/Reconciliation;
- reservation/ATP;
- batch/serial/expiry;
- FIFO/moving-average/standard-cost support actually present;
- backdated stock ordering and repost/replay;
- zone/bin/putaway/pick/pack/replenishment/cycle count;
- count freeze/snapshot and correction/reversal;
- mobile/barcode/QR seams where backend contract exists;
- historical WMS/stock reconciliation PRs: classify before rewrite.

## Required evidence

- positive/negative/zero reconciliation variance;
- duplicate/retry idempotency;
- cancelled reconciliation and exact reversal;
- backdated transfer/receipt/issue with deterministic repost order;
- batch/serial integrity;
- reservation release/cancel behavior;
- cycle-count freeze consistency;
- stock valuation remains reconcilable to finance without changing GL authority;
- tenant/company/warehouse permissions.

## Dependency behavior

Finance/GL contract changes belong to Agent 04. Manufacturing/Sales/Procurement-specific lifecycle changes belong to their workers. Raise Dependency Request and continue generic stock/WMS work.

## Merge boundary

PR-ready autonomously. Non-UI merge/deploy requires explicit user approval.

## Startup prompt

Đọc handoff + program artifacts + Skill + exact branch/main + stock code/migrations/tests. Audit historical stock/WMS work trước khi viết mới. Một stock ledger duy nhất, không shadow stock/valuation. Tự xử lý kỹ thuật thông thường; dependency sang owner khác thì ghi request và tiếp tục. Verify CRITICAL gates, cập nhật Completion Record, dừng trước merge/deploy.

## Completion record

Pending worker execution.
