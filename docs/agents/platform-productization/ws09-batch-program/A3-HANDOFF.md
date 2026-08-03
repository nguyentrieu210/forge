# A3 Handoff — Inventory / Stock Reconciliation Consumer

Branch: `agent/ws09-batch-03-inventory`
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
Main at bootstrap: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: **CRITICAL**
Owner: WS04 Inventory/WMS consumer

## Mission

Adopt the shared BatchAction/BatchTransaction primitive in the Stock Reconciliation path without changing stock authority, valuation semantics or correction/reversal rules.

## Required reading

1. `skills/forge-enterprise-completion/SKILL.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. program `PROGRAM_SPEC.md`, `AGENT_BOARD.md`, `NO_STOP_RULE.md`
5. `docs/agents/workstreams/WS04-inventory-wms.md`
6. `docs/agents/transaction-closure/03-INVENTORY-WMS.md`
7. current Stock Reconciliation, stock integrity/valuation, permission/warehouse and related tests
8. A1/A2 contract/executor candidate once available.

## Own

- Stock Reconciliation-specific batch declaration/adapter;
- domain mapping between generic rows and canonical stock reconciliation operation;
- preview response using domain calculations without side effects;
- commit through existing authoritative inventory/document path;
- inventory-specific permission/tenant/warehouse/reconciliation tests.

## Forbidden

- editing shared App Factory contract/executor semantics except through Dependency Request;
- direct stock ledger writes that bypass canonical authority;
- client native input-table implementation from #542;
- changing valuation/correction rules merely to fit the batch primitive;
- claiming RC/Hardened without stock reconciliation evidence.

## Work before A1/A2 lands

Audit the exact Stock Reconciliation authority path, locate existing bulk/compatibility consumer seams, define fixtures and acceptance cases. Use an internal test seam only if it does not create a competing shared primitive.

## Critical invariants

- preview writes nothing;
- commit preserves existing stock/valuation invariants;
- warehouse/company/tenant scope is enforced server-side;
- invalid row causes behavior consistent with declared batch atomicity;
- duplicate/retried request cannot duplicate stock effect;
- correction/reversal path remains explicit;
- stock reconciliation evidence can reconcile before/after quantities/value where applicable.

## Acceptance

- happy + failure + permission + tenant + idempotency tests;
- preview side-effect test;
- stock authority/reconciliation regression;
- migration replay if any schema changes;
- exact candidate head evidence;
- no production deploy.

## Completion Record

Baseline:
A1/A2 heads consumed:
Head:
PR:
Changed authority:
Tests executed:
Tests not executed:
Migrations:
Permission/tenant evidence:
Stock reconciliation/correction evidence:
Dependencies remaining:
Recommended maturity:
Merge/deploy performed: NO

## Startup prompt

You are **Agent A3 — WS09 Inventory Batch Consumer** in `nguyentrieu210/forge`.

Work only on `agent/ws09-batch-03-inventory`, baseline `8259d9bac1d2098d9e66195cb22e14072cd75139`. Audit WS04 and exact Stock Reconciliation authority first. Your job is to consume A1/A2's shared batch primitive; never create another one. Preview must be side-effect free. Commit must use the existing authoritative inventory/document path and preserve stock/valuation/correction invariants, warehouse/company/tenant permissions and idempotency. Add CRITICAL evidence. Open a draft PR against the program control branch and stop before merge/deploy. If shared primitive changes are needed, send a Dependency Request to A1/A2 and continue independent fixtures/tests/audit.
