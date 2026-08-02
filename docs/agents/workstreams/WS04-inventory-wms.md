# WS04 — Inventory + WMS

Status: **CLAIMED**  
Owner: **ChatGPT-WS04**  
Branch: `agent/ent-04-inventory-wms`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from branch head: `a936d8b1ca3846767be6e7cf0a0411cf9df7c257`  
Synced to main: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Đưa stock RC lên inventory/WMS production-grade: valuation, backdate/repost, reservation, reconciliation, batch/serial và warehouse execution.

## Capability families

`W01-W02`.

## Own

stock domain/controllers/ledger projections, FIFO/Moving Average, stock correction/repost, reservation/ATP, batch/serial/expiry, reconciliation, warehouse hierarchy/bin/zone/putaway/pick/pack/replenishment/cycle count/barcode/QR/mobile contracts.

## Critical invariants

No negative/invalid movement theo policy; valuation deterministic; backdated correction không âm thầm sửa history; stock-finance reconciliation; tenant/warehouse permission; UOM precision; serial/batch uniqueness.

## Phase A audit

Audit exact state của Stock Entry, reconciliation, FIFO/MA, COGS, landed cost, serial/batch, reservation, bulk transaction, backdate/repost và WMS gaps. Audit Stock Reconciliation/ledger PR lịch sử và phân loại `reuse / cherry-pick / superseded / reject`.

## Audit plan

1. Map `W01-W02` capability IDs to exact schema/controller/migration/test evidence on current main.
2. Audit canonical stock ledger, valuation, reconciliation, backdate/repost and finance touchpoints before changing behavior.
3. Audit legacy PRs with WS04 ownership/touchpoints, especially `#267`, plus `#295`, `#278`, `#208`, `#201` where stock contracts intersect.
4. Choose the smallest CRITICAL vertical slice that improves reconciliation/correction without creating a competing stock ledger.
5. Record dependency requests instead of editing WS00/WS01/WS09/WS14 hotspots.

## Phase B priority

1. Stock Reconciliation + correction/repost completeness.
2. Backdated valuation replay + financial reconciliation contract.
3. Reservation/ATP hardening.
4. Cycle count/bin/location.
5. Putaway/picking/packing/replenishment.
6. Scanner/mobile integration contract.

## Dependencies

WS00 kernel/ledger primitive, WS01 COGS/GL, WS03 receipt/landed cost, WS05 manufacturing material flow, WS14 mobile/shared UI.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability maturity, ledger/repost invariants, migration/tests, reconciliation evidence, legacy PR disposition, dependencies, PR.
