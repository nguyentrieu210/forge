# CloudForge O2C v0.5.0 — Commercial Limited GA Candidate

## Accounting correctness

- GL, Payment Ledger and fulfillment persist document business posting time rather than mutation time.
- Currency precision and Company currency are server-authoritative master data.
- Payment Entry rejects a client `received_amount` that differs from the server conversion of `paid_amount`.
- Payment Ledger stores company-currency `base_amount_minor` in addition to transaction currency.
- Final partial FX allocation consumes exact remaining base receivable, preventing a Paid invoice with residual Debtors.
- Transaction and base outstanding are independent commit-time database invariants.
- AR projection exposes transaction and base outstanding.
- Limited GA rejects unallocated customer receipts until advances/write-offs have an explicit ledger model.

## Commercial operations

- Added internal, bounded, tenant-scoped reconciliation:
  - GL imbalance;
  - transaction/base reference drift;
  - GL-vs-Payment-Ledger receivable mismatch;
  - posting-date mismatch;
  - orphan Payment Ledger references;
  - failed outbox events.
- Added migration 0003 and automated pre-v0.5 migration dry run.
- Added fail-closed code-readiness and production-promotion gates.
- Promotion evidence must identify the exact release SHA-256 and provide evidence per check.
- Added compatibility, migration, staging, reconciliation, rollback and backup/restore runbooks.

## Verification in this package

- 74 Node/domain tests.
- Complete migrations 0001–0003.
- Migration dry run and transaction/base outstanding trigger tests.
- 100-way and cross-aggregate race tests.
- Strict core/worker source TypeScript and repository/secret gates.

Current-release Workerd, Vite build and Cloudflare staging promotion are not claimed from this sandbox.

## Scope

This is a candidate for a narrow O2C Limited GA after `npm run verify:promotion` passes. It is not full ERPNext. See `COMMERCIAL_COMPATIBILITY.md` for contractual boundaries.
