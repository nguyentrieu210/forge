# RC4-A17 — Logistics / POS / Commerce

Status: READY
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-17-logistics-pos-commerce
PR: #601
Risk: STANDARD/CRITICAL where stock/payment authority applies

Mission: close logistics, POS, retail and omnichannel/social-commerce residuals while reusing canonical stock, pricing, payment and integration primitives.

Read: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS16-logistics-pos-commerce.md.

Completed independent residual: Social Commerce route-level least privilege now gates tenant reads, manager-only rules, fulfillment/stock shipment projection and finance-scoped COD reconciliation. POS exact cancellation was already canonical on main and was not duplicated.

Evidence: `docs/agents/rc4/A17-EVIDENCE.md`. Inventory authority belongs A12, Finance/payment A4, integration/social connectors A8, UI runtime A6, IAM A1. Dependency Requests are recorded in evidence; do not fork those authorities.

Non-UI/backend authorization change: stop at PR before merge/deploy until explicit approval.
