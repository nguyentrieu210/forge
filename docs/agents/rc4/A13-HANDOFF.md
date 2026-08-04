# RC4-A13 — Manufacturing / QMS

Status: BOOTSTRAPPED
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-13-manufacturing-qms
Risk: CRITICAL

Mission: close manufacturing/QMS residuals beyond proven BOM and transaction-closure slices: rework/subcontract, broader actual costing/variance, MRP depth, work-order exceptions, quality inspection/nonconformance/CAPA and finance restatement evidence.

Read: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS05-manufacturing-qms.md.

Preserve canonical stock and GL authority. Coordinate stock with A12, finance with A4, kernel with A9, UI with A6. Do not invent parallel costing or inventory ledgers.

Verify backdated/cancel/rework/failure paths, fixed-point cost, stock/GL reconciliation and tenant/permission invariants. Non-UI CRITICAL: PR only; stop before merge/deploy.
