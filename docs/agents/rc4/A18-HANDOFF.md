# RC4-A18 — Alumdoor Reference Vertical

Status: **READY FOR PR / NON-UI MERGE GATE**
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-18-alumdoor-vertical
Risk: STANDARD/CRITICAL where finance/stock/business invariants apply

Mission: use Alumdoor as the reference vertical to close remaining production-quality gaps and extract genuinely reusable primitives only after platform/domain owners stabilize them. Preserve historical production evidence boundaries: old deployed proof does not prove current source is deployed.

Read: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS17-alumdoor-reference-vertical.md.

Do not patch generated artifacts alone; fix generator/source authority. Do not duplicate Finance, Procurement, Inventory, Manufacturing or App Factory primitives owned by A4/A11/A12/A13/A7. Send Dependency Requests instead.

A18 residual completed on this branch:

- exact release/package evidence gate for live Golden Order verification;
- fail-closed source/live Alumdoor version matching;
- exact expected release SHA and optional bundle-hash pinning;
- delivery-only Warranty Claim lookup fixed through exact Delivery Note lineage;
- unrelated customer deliveries excluded from warranty/Stock Ledger evidence collection;
- focused syntax + regression validation: 12/12 PASS.

Progress/evidence: `docs/agents/rc4/RC4_A18_ALUMDOOR_PROGRESS.md`.

Remaining shared-owner work is recorded there as Dependency Requests. Authenticated live Golden Order and production release evidence remain gated; no production mutation was performed.

This branch is non-UI. Open PR, then stop before merge/deploy for explicit user approval.
