# Cross-Suite & Parity Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## X1 — CRM won deal to ERP order
- **Actor:** Sales User
- **Precondition:** deal won + ERP mapping
- **Happy path:**
  1. Resolve/create party/item mapping
  2. Create ERP quotation/order
  3. Store reciprocal IDs
  4. Emit status events
  5. Reconcile
- **Nhánh lỗi:**
  - duplicate/mapping/pricing/tax
  - ERP unavailable
- **Transaction/Event:** Idempotency key deal+action
- **Oracle:** one ERP chain per deal

## X2 — HR payroll to ERP accounting
- **Actor:** Payroll Manager
- **Precondition:** payroll reconciled
- **Happy path:**
  1. Map accounts/dimensions
  2. Create payroll voucher/GL/payment
  3. Store references
  4. Reconcile totals
  5. Close period evidence
- **Nhánh lỗi:**
  - mapping/closed period/unbalanced
- **Transaction/Event:** Atomic ERP posting after HR reconciliation
- **Oracle:** HR totals=ERP GL/payment

## X3 — Suite data to Insights
- **Actor:** Analyst/System
- **Precondition:** events/read permissions
- **Happy path:**
  1. Build source/read models
  2. Incremental sync cursor
  3. Refresh affected queries
  4. Update charts/dashboards
  5. Surface as-of/lineage
- **Nhánh lỗi:**
  - schema drift/ACL/cache failure
- **Transaction/Event:** Projection idempotent; canonical suite untouched
- **Oracle:** dashboard result fixtures

## X4 — Source parity release
- **Actor:** App Maintainer
- **Precondition:** upstream pins available
- **Happy path:**
  1. Scan all artifacts
  2. Generate diff/dependency graph
  3. Spec/port/test
  4. Zero-unmapped check
  5. Publish/rollout
- **Nhánh lỗi:**
  - parser gaps → blocker
  - critical waiver denied
  - oracle mismatch
- **Transaction/Event:** Release immutable
- **Oracle:** manifest + evidence complete
