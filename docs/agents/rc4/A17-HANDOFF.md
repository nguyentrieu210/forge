# RC4-A17 — Logistics / POS / Commerce

Status: BOOTSTRAPPED
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-17-logistics-pos-commerce
Risk: STANDARD/CRITICAL where stock/payment authority applies

Mission: close logistics, POS, retail and omnichannel/social-commerce residuals while reusing canonical stock, pricing, payment and integration primitives.

Read: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS16-logistics-pos-commerce.md.

Inventory authority belongs A12, Finance/payment A4, integration/social connectors A8, UI runtime A6, IAM A1. Do not fork those authorities.

Verify offline/online order identity, stock reservation/movement, payment/cancel/return, serial/IMEI if present, tenant permissions, retry/idempotency and reconciliation. Non-UI changes stop at PR before merge/deploy.
