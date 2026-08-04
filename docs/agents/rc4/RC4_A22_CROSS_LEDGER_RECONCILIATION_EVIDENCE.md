# RC4-A22 — Cross-Ledger Reconciliation Evidence

Status: **READY — EXACT-HEAD VALIDATION GREEN**  
Risk: **CRITICAL**  
Branch: `agent/rc4-22-cross-ledger-reconciliation`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Merge/deploy: **NOT PERFORMED — explicit approval required**

## Mission result

A22 adds an independent, read-only reconciliation layer over exported authoritative evidence. It does **not** create a new ledger, balance table, posting controller, mutation route, compensating-entry mechanism, migration, or production data write.

The auditor is:

- `server/scripts/rc4-cross-ledger-reconciliation.py`

Usage:

```bash
python3 server/scripts/rc4-cross-ledger-reconciliation.py --self-test
python3 server/scripts/rc4-cross-ledger-reconciliation.py --input evidence.json --output report.json
```

Exit contract:

- `0`: input reconciles / self-test passes;
- `2`: one or more mismatches detected;
- invalid evidence fails closed with an exception/non-zero exit.

## Canonical authority retained

A22 preserves the current authority graph already established on `main`:

1. `gl_entries` — financial book/posting authority.
2. `payment_ledger_entries` — AR/AP settlement/allocation authority.
3. `stock_ledger_entries` — stock quantity/value authority.
4. `procurement_entries` — immutable PO Receipt/Billing progress projection, not a stock/AP ledger.
5. `manufacturing_entries` — immutable Work Order progress projection, not stock/cost/GL authority.
6. `documents` — voucher identity, company scope, lifecycle and explicit account/reference metadata.

The A22 tool consumes snapshots of those sources and produces disposable mismatch evidence only.

## Existing evidence reused rather than duplicated

A22 audited and consumes the current merged Transaction Closure contracts:

- Finance Daily Detailed Ledger / Finance Reconciliation Diagnostics / Stock Valuation Reconciliation;
- AP Supplier Reconciliation and canonical Payment Ledger vs GL control contract;
- Inventory Stock Reconciliation, valuation replay and Repost Item Valuation authority;
- Procurement three-way match, Purchase Receipt stock authority, Purchase Invoice AP authority and landed-cost dependency boundary;
- Manufacturing Work Order progress, canonical Stock Entry/Stock Ledger execution, backdate audit and read-only actual-cost/variance evidence.

A22 therefore does not add another Query Worker report with overlapping identity. Its purpose is independent adversarial evidence across the seams between those domains.

## Evidence bundle contract

The JSON root requires:

```text
tenant_id
company
as_of_date (YYYY-MM-DD)
documents[]
gl_entries[]
stock_ledger_entries[]
payment_ledger_entries[]
procurement_entries[]
manufacturing_entries[]
```

Ledger/progress rows carry persisted voucher identity:

```text
voucher_type
voucher_no
voucher_revision
posting_at
```

`documents[].data.company` is the company scope authority for the audit. The tool filters out rows whose voucher document is not in the requested company or whose posting date is after `as_of_date`.

No branch-level AR/AP claim is made because canonical Payment Ledger does not carry branch/accounting dimensions.

## Mismatch taxonomy

| Code | Reconciliation invariant | Owner if authoritative fix is required |
|---|---|---|
| `XLR-001` | Each immutable GL voucher revision must balance debit = credit | A4 Finance |
| `XLR-010` | Supplier/Payable Payment Ledger base balance = Supplier GL control balance at company scope | A4 Finance |
| `XLR-011` | Customer/Receivable Payment Ledger base balance = Customer GL control balance at company scope | A4 Finance |
| `XLR-020` | Repost Item Valuation Stock Ledger value delta = declared stock-account GL delta | A12 Inventory + A4 Finance |
| `XLR-021` | Repost requires canonical `stock_account` evidence before exact Stock↔GL comparison | A12 Inventory + A4 Finance |
| `XLR-030` | Purchase Receipt immutable `Receipt` progress = inward Stock Ledger quantity by item | A11 Procurement + A12 Inventory |
| `XLR-031` | Purchase Invoice `Billing` progress requires canonical Supplier AP Payment Ledger + Supplier GL evidence | A11 Procurement + A4 Finance |
| `XLR-040` | Manufacturing `Consumption` / `Manufacture` / `Material Transfer` progress = canonical Stock Ledger movement by item | A13 Manufacturing + A12 Inventory |
| `XLR-050` | Cancelled voucher leaves no residual GL delta | owning domain + A4 |
| `XLR-051` | Cancelled voucher leaves no residual Stock Ledger quantity/value | owning domain + A12 |
| `XLR-052` | Cancelled voucher leaves no residual Payment Ledger amount/base amount | owning domain + A4 |
| `XLR-053` | Cancelled voucher leaves no residual Procurement progress | A11 |
| `XLR-054` | Cancelled voucher leaves no residual Manufacturing progress | A13 |

A22 never auto-fixes a mismatch. Every mismatch is evidence for the authoritative owner.

## Priority coverage against handoff

### 1. Stock Ledger ↔ GL inventory accounts

Implemented for the exact currently-proven canonical seam: `Repost Item Valuation` compares `SUM(stock_value_difference_minor)` with `SUM(gl debit_minor - credit_minor)` on `document.data.stock_account`.

A22 intentionally does not guess a universal inventory-account mapping for every stock voucher.

### 2. AR/AP subledger ↔ GL control

Implemented company-scoped AR/AP aggregate comparison using `base_amount_minor` and party/account/currency-scale keys. This independently checks the same accounting invariant as Finance diagnostics without creating another persisted balance.

### 3. Procurement receipt/invoice/payment chain

Implemented cross-domain controls:

- Purchase Receipt `procurement_entries(kind=Receipt)` vs canonical inward Stock Ledger quantity per item;
- Purchase Invoice `procurement_entries(kind=Billing)` requires canonical Supplier Payment Ledger and Supplier GL evidence;
- aggregate AP control then catches settlement/control drift across Purchase Invoice and Payment Entry.

### 4. Manufacturing consumption/output/variance ↔ stock/GL

Implemented Manufacturing progress ↔ Stock Ledger for:

- `Consumption` -> outward quantity;
- `Manufacture` -> inward quantity;
- `Material Transfer` -> equal inward and outward quantity.

Posted labor/machine/overhead/variance GL remains an explicit dependency because current Manufacturing evidence is intentionally `NOT_POSTED`; A22 does not invent Finance policy.

### 5. Correction/repost/reversal after backdated changes

A22 checks cancelled vouchers for zero residual across GL, Stock Ledger, Payment Ledger, Procurement progress and Manufacturing progress. Repost Item Valuation revisions are independently traceable by voucher revision.

Historical downstream COGS/expense restatement after backdated stock valuation remains dependency-bound; the auditor cannot infer a missing canonical posting contract.

## Exact-head validation evidence

Final validated executable head: `e7ed63c5f2f90c443b7b552d99bfa79cb5b2a742`  
Workflow: **RC4 A22 Cross Ledger Reconciliation Validation**  
Run: `30874132447`  
Conclusion: **SUCCESS**

The exact-head gate proves:

- exact PR-head checkout;
- `python3 -m py_compile` PASS;
- auditor self-test PASS;
- good fixture => `RECONCILED`;
- intentional mismatch fixture detects `XLR-001`, `XLR-020`, `XLR-030`, `XLR-040`;
- changed paths remain inside A22 read-only QA/evidence authority;
- executable-source whitespace checks PASS;
- no mutating SQL/DDL introduced by the auditor.

The first workflow attempt failed only because branch documentation inherited trailing Markdown whitespace. The fix did not weaken reconciliation assertions: `git diff --check` remains strict for executable authority and the changed-path allowlist still covers the whole branch.

## Dependency Requests

### DR-A22-001 — A4 Finance: historical COGS/expense restatement contract

Need a canonical mapping/posting/reversal contract when a backdated stock mutation changes the valuation of already-posted outgoing stock and therefore historical COGS/expense.

### DR-A22-002 — A11 Procurement + A12 Inventory: authoritative landed-cost application

Procurement already computes deterministic allocation evidence but authoritative Stock Ledger valuation application/reversal remains Inventory-owned.

### DR-A22-003 — A13 Manufacturing + A4 Finance: posted operation cost/variance

Current Manufacturing actual material/FG value evidence is Stock-Ledger derived; labor/machine/overhead and variance remain intentionally unposted absent a canonical Finance contract.

### DR-A22-004 — A4 Finance: branch-level AR/AP dimension contract

Payment Ledger currently has no branch/accounting-dimension field. Company-wide subledger totals must not be compared to one GL branch.

## Blast radius

- new runtime API: **none**;
- new write path: **none**;
- new table/ledger: **none**;
- migration: **none**;
- permission widening: **none**;
- production/customer mutation: **none**;
- deployment: **none**.

## Maturity statement

This work strengthens reconciliation evidence; it does not self-promote any capability to `Hardened`.

Candidate evidence after exact-head gates:

- company-level AR/AP control: additional RC evidence;
- Repost Item Valuation Stock↔GL seam: additional RC evidence;
- Procurement Receipt progress↔Stock: additional RC evidence;
- Manufacturing progress↔Stock: additional RC evidence;
- cancellation residual controls: cross-domain correction/reversal evidence.

Dependencies above prevent a global cross-ledger Hardened claim. **Do not merge/deploy without explicit user approval.**
