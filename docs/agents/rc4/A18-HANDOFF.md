# RC4-A18 — Alumdoor Reference Vertical

Status: BOOTSTRAPPED
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-18-alumdoor-vertical
Risk: STANDARD/CRITICAL where finance/stock/business invariants apply

Mission: use Alumdoor as the reference vertical to close remaining production-quality gaps and extract genuinely reusable primitives only after platform/domain owners stabilize them. Preserve historical production evidence boundaries: old deployed proof does not prove current source is deployed.

Read: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS17-alumdoor-reference-vertical.md.

Do not patch generated artifacts alone; fix generator/source authority. Do not duplicate Finance, Procurement, Inventory, Manufacturing or App Factory primitives owned by A4/A11/A12/A13/A7. Send Dependency Requests instead.

Verify exact-source vertical flows, permissions, correction/reversal, browser/mobile evidence and release markers. Non-UI changes require PR + user approval; production deploy/mutation is gated explicitly.
