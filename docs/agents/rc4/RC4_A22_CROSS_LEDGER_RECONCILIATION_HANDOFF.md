# RC4-A22 — Cross-Ledger Reconciliation

Status: **READY**  
Branch: `agent/rc4-22-cross-ledger-reconciliation`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **CRITICAL**

## Mission

Independently verify and harden reconciliation contracts across stock, GL, AR/AP, procurement and manufacturing without creating a second ledger authority.

## Own

- reconciliation specifications and executable checks;
- mismatch classification/evidence;
- read-only reconciliation tooling where safe;
- dependency requests to A4/A11/A12/A13 for authoritative fixes.

## Priority

1. Stock Ledger ↔ GL inventory accounts;
2. AR/AP subledger ↔ GL control accounts;
3. procurement receipt/invoice/payment chain;
4. manufacturing consumption/output/variance ↔ stock/GL;
5. correction/repost/reversal reconciliation after backdated changes.

## Forbidden

- no direct ledger mutation;
- no compensating entries invented by QA tooling;
- no production/customer-data mutation;
- authoritative domain fixes stay with owning lane.

## Completed output

- `server/scripts/rc4-cross-ledger-reconciliation.py`
  - read-only evidence-bundle auditor;
  - GL voucher balance;
  - company-scope AR/AP ↔ GL control;
  - Repost Item Valuation Stock ↔ stock-account GL;
  - Purchase Receipt progress ↔ Stock Ledger;
  - Purchase Invoice Billing progress ↔ AP/GL presence;
  - Manufacturing progress ↔ Stock Ledger;
  - cancelled-voucher residual checks across GL/Stock/Payment/Procurement/Manufacturing.
- `docs/agents/rc4/RC4_A22_CROSS_LEDGER_RECONCILIATION_EVIDENCE.md`
  - mismatch taxonomy `XLR-001..054`;
  - exact authority boundaries;
  - Dependency Requests for A4/A11/A12/A13;
  - isolated self-test/compile evidence and exact-head gate instructions.

## Validation truth

Isolated auditor logic:

- clean synthetic evidence: `RECONCILED`;
- injected mismatch evidence detected `XLR-001`, `XLR-020`, `XLR-030`, `XLR-040`;
- Python compile: PASS.

Full exact-branch checkout/gates were not executable because the shell environment could not resolve `github.com`. This is recorded as `NOT RUN`, not converted into PASS.

## Merge / deploy boundary

PR is required. Stop before merge/deploy unless explicitly approved because this is a non-UI CRITICAL lane.
