# RC4-A11 — Procurement / P2P

Status: BOOTSTRAPPED
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-11-procurement-p2p
Risk: STANDARD/CRITICAL

Mission: close source-to-pay residuals around supplier lifecycle, RFQ/quote comparison, PO/Purchase Invoice commercial contract, 3-way match, landed-cost handoff, returns/corrections and procurement reporting while preserving the existing Transaction Closure P2P authority.

Read: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS03-procurement.md.

Do not create a competing AP/payment ledger or stock valuation path. Finance belongs A4, inventory valuation A12, kernel A9, IAM A1. Use Dependency Requests for shared gaps.

Verify partial fulfillment/invoicing, cancellation/reversal, permission, fixed-point money and exact-head regression. Non-UI changes stop at PR before merge/deploy.
