# CloudERP Stock & Manufacturing Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## ST1 — Stock receipt/issue/transfer/reconciliation
- **Actor:** Stock User
- **Precondition:** item/warehouse/UOM valid
- **Happy path:**
  1. Draft stock entry/reconciliation
  2. Resolve batch/serial/valuation
  3. Submit
  4. Post SLE and optional GL
  5. Update bin/read models
- **Nhánh lỗi:**
  - negative stock
  - serial/batch invalid
  - valuation conflict
- **Transaction/Event:** Document+SLE+GL atomic
- **Oracle:** stock balance/value/GL parity

## ST2 — Landed cost and repost
- **Actor:** Stock Manager
- **Precondition:** receipts/invoices available
- **Happy path:**
  1. Allocate landed charges
  2. Post valuation adjustment
  3. Queue dependent repost
  4. Rebuild read models
  5. Reconcile
- **Nhánh lỗi:**
  - closed period
  - dependency cycle
  - timeout → durable resume
- **Transaction/Event:** Voucher atomic; repost Workflow
- **Oracle:** valuation layers and GL parity

## M1 — BOM-to-finished goods
- **Actor:** Manufacturing User
- **Precondition:** approved BOM/routing/material
- **Happy path:**
  1. Plan
  2. Work Order
  3. Transfer material
  4. Job cards/operations
  5. Manufacture and post consumption/output
- **Nhánh lỗi:**
  - material shortage
  - capacity
  - overproduction/process loss
- **Transaction/Event:** Each execution doc atomic
- **Oracle:** consumed/produced/WIP/GL parity
