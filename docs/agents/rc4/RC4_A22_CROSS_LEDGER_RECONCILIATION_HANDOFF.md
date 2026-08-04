# RC4-A22 — Cross-Ledger Reconciliation

Status: **BOOTSTRAPPED**  
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

## Output

PR with executable reconciliation evidence, mismatch taxonomy and Dependency Requests. Stop before merge/deploy unless approved.
