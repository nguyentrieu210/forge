# TRANSACTION CLOSURE AGENT BOARD

Program: `rc/transaction-closure-00-control`
Baseline: `main@a99af64b6509477238bc9dc848e226828531b599`
Status: BOOTSTRAP

| Agent | Branch | Mission | Primary authority | Risk | Depends on | Status |
|---|---|---|---|---|---|---|
| 00 Control | `rc/transaction-closure-00-control` | Coordination, dependency routing, convergence | program docs only | CRITICAL governance | exact main | ACTIVE |
| 01 Sales/O2C | `rc/transaction-closure-01-sales-o2c` | Close Sales -> Delivery -> Invoice -> Payment -> Return/Reconcile | Sales/O2C | CRITICAL | canonical stock + finance contracts | SEEDED |
| 02 Manufacturing | `rc/transaction-closure-02-manufacturing` | Close BOM -> Work Order -> consumption -> FG -> actual cost/trace | Manufacturing | CRITICAL | canonical stock + finance contracts | SEEDED |
| 03 Inventory/WMS | `rc/transaction-closure-03-inventory-wms` | Close reservation/pick/count/reconcile/backdate/repost | Stock/WMS | CRITICAL | current stock authority | SEEDED |
| 04 Finance/Ledger | `rc/transaction-closure-04-finance-daily-ledger` | Cross-ledger reconciliation + Daily Detailed Ledger | Finance/GL/reporting | CRITICAL | 01/02/03/05 evidence | SEEDED |
| 05 Procurement/P2P | `rc/transaction-closure-05-procurement-p2p` | Close Request/PO/Receipt/Invoice/Payment/Return/AP | Procurement | CRITICAL | canonical stock + AP contracts | SEEDED |
| 06 Warranty/Service | `rc/transaction-closure-06-warranty-service` | Delivered serial/customer -> claim/service/replacement/billing | Service/Warranty | CRITICAL at stock/finance boundary | 01 + 03; consume 04 finance contract | SEEDED |

## Shared hotspot ownership

- Finance/GL/reconciliation/report authority: Agent 04.
- Stock ledger/valuation/WMS orchestration: Agent 03.
- Sales/O2C lifecycle: Agent 01.
- Manufacturing lifecycle/cost integration: Agent 02.
- Procurement/P2P lifecycle: Agent 05.
- Warranty/service lifecycle: Agent 06.
- App Factory/compiler/shared runtime: no worker owns; raise Dependency Request to canonical workstream owner if needed.
- Generic UI/views: out of program scope unless a tiny evidence-only change is inseparable; do not use UI to simulate missing backend state.

## Merge order

1. Independent authority hardening with no shared-contract change: 01 / 02 / 03 / 05 may become PR-ready in parallel.
2. Resolve shared contract Dependency Requests before any dependent worker claims completion.
3. 04 reconciles exact authoritative outputs after upstream evidence stabilizes.
4. 06 closes stock/finance effects against converged contracts.
5. Coordinator produces one convergence audit against exact current `main`.
6. Stop before non-UI merge/deploy until explicit user approval.

## Dependency Request format

```text
Dependency Request
Owner: <target worker/workstream>
Need: <specific contract/evidence/change>
Why: <why target owns it>
Blocked scope: <exact subsection>
Can continue independently: yes/no
Next independent work: <what proceeds now>
```

## Completion definition

A worker is not DONE because it has code. It must have exact-head scope audit, authoritative invariants, targeted regressions, dependency disposition, correction/reversal evidence and a completion record. RC/Hardened maturity remains evidence-based only.
