# RC Batch 1A — Finance + Inventory Authority Convergence

Date: **2026-08-04**  
Repository: `nguyentrieu210/forge`  
Risk: **CRITICAL**

## Result

Batch 1A implementation has converged into `main`.

Authority merge order:

1. RC-020 Finance posting/period/reversal — PR `#443` -> `fce4758addcc4296512e423fea4753c96f7cca0e`
2. RC-024/025 Inventory reconciliation/backdate/repost/valuation — PR `#441` -> `7626576feb67a4428e3c9bbfd41ad40e1f0c4641`
3. RC-021 AR/customer reconciliation — PR `#440` -> `81a4deb26a66588f4e2fc0ef0f509e54808f4446`
4. RC-022 AP/supplier reconciliation — PR `#439` -> `bc0083cb6db177273f31cd475f2fa9d2d1443d99`
5. RC-023 Cash/Bank reconciliation — converged replacement PR `#461` -> `de94b10821c917a104c7e291d588665bd2c94355`

Independent UI V3 foundation PR `#453` then advanced current main to `64060ae1f08e8b6922828d4d27d8185073cf6697`; it is UI-only and does not change the Finance/Inventory authority contract.

## Frozen authority contracts

### Finance

- `gl_entries` remains canonical accounting balance/posting authority.
- Canonical document controllers + DocumentKernel/D1 mutation path remain write authority.
- Accounting-period guards apply at posting/document boundaries; hard/soft close behavior is server-enforced.
- Raw GL UPDATE/DELETE is rejected; correction stays append/reversal based.
- Payment Entry / Payment Allocation + Payment Ledger remain AR/AP settlement authority.
- AR/AP reconciliation compares canonical subledger balances against GL control; reconciliation does not create a competing ledger.
- Bank Transaction is statement/feed evidence only.
- Bank Reconciliation is append-only reversible control state over authoritative GL movement.
- Journal Entry remains generic internal cash/bank transfer authority.
- Warehouse Cash remains subordinate to GL and is not a separate financial authority.

### Inventory

- `stock_ledger_entries` remains canonical stock authority.
- Stock Reconciliation correction uses append-only exact-revision reversal.
- Serial/Batch Bundle usage is reversed with the reconciliation where applicable.
- Repost Item Valuation cancellation reverses exact historical Stock Ledger + GL revisions rather than recalculating historical vouchers with newer valuation code.
- Backdate/repost/valuation remains one stock-ledger path; Procurement/Manufacturing/WMS must consume it rather than writing shadow stock.

## Evidence truth

Merge does not equal RC/Hardened promotion.

- RC-021 has exact post-sync focused CRITICAL workflow evidence: run `30837831262` = **success** on head that consumed RC-020 + Inventory authority.
- RC-020 has isolated SQLite smoke evidence but no exact PR-head workflow/status context; promotion remains evidence-gated.
- RC-022 has targeted source/local SQLite-equivalent evidence but no dedicated exact-head AP CI; promotion remains evidence-gated.
- RC-023 has focused source/in-memory SQLite evidence; inherited RC-021 workflow on the converged head was skipped and is not RC-023 validation.
- RC-024/025 has source-level CRITICAL evidence but no exact-head workflow/status run; promotion remains evidence-gated.
- No Batch 1A lane is promoted to Hardened from merge state alone.
- No production deploy or production migration was performed by this convergence.

## Convergence mechanics

- RC-021 consumed frozen RC-020 + Inventory authority through internal sync PR `#444`, then reran its focused CRITICAL workflow successfully before merge.
- RC-022 consumed current Finance authority through internal sync PR `#447` before merge.
- RC-023 had a real `server/package.json` conflict because RC-020 and RC-023 both extended `test:sql`.
- The conflict was resolved by preserving both `test-rc020-finance-period-posting.py` and `test-rc023-cash-bank.py`, then transplanting the four RC-023-owned paths onto exact current main via convergence branch `rc/w2-finance-cash-bank-converged` and internal PR `#457`.
- Original RC-023 PR `#442` and stale sync PRs `#450/#454` were closed/superseded; no branch deletion is claimed.

## Open dependencies / non-blocking gaps

- AR fully-paid return/refund/excess-credit policy remains a Finance business-policy gap; current code does not invent negative invoice balance or shadow customer-credit authority.
- AP due-date hard cutover/backfill belongs to Procurement RC-031 integration.
- Cash/Bank provider-specific file/API adapters remain Integration work; generic provenance/idempotency boundary is frozen.
- Historical COGS/expense/accounting-dimension restatement depth after backdated stock valuation remains a Finance/Inventory reconciliation depth item for later evidence/hardening.
- Exact production proof, backup/restore and deployment evidence remain separate release gates.

## Gate unlocked

Finance + Inventory shared authority is now sufficiently frozen for **Batch 1B ERP Core** to start from exact current main:

- RC-030 / RC-031 Procurement
- RC-032 / RC-033 CRM + O2C
- RC-034 / RC-035 HCM + Payroll
- RC-036 / RC-037 Manufacturing
- RC-038 QMS

Each lane must consume the frozen Finance/Inventory/Permission contracts and must not create duplicate money, payable, receivable, stock or valuation authority.
