# RC4-A12 — Inventory / WMS

Status: BOOTSTRAPPED
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-12-inventory-wms
Risk: CRITICAL

Mission: close inventory/WMS residuals after Transaction Closure: valuation/repost breadth, landed-cost stock application/reversal, serial/batch/WMS persistence, picking/putaway/cycle count/mobile flows, stock correction and Stock↔GL reconciliation evidence.

Read: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS04-inventory-wms.md.

Preserve canonical stock ledger and document-kernel authority. Do not create competing finance posting or App Factory primitives. Coordinate A4 Finance, A11 Procurement, A13 Manufacturing, A6 UI and A9 kernel through Dependency Requests.

Require invariant/reversal/reconciliation/migration/tenant evidence. Non-UI CRITICAL: PR only, user approval required before merge/deploy.
