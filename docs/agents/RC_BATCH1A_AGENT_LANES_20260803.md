# RC Batch 1A — Finance + Inventory Authority Agent Lanes

Date: 2026-08-03  
Program: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`  
Capability truth: `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`  
Risk class: **CRITICAL** for every lane in this batch.

## Purpose

Batch 1A hardens the authoritative Finance and Inventory write/reconciliation boundaries before Procurement, CRM/O2C, HCM/Payroll or Manufacturing are allowed to expand on top of them.

The batch is intentionally capped at five workers plus one coordinator. Workers may audit in parallel, but no lane may invent a second posting, allocation, valuation or reconciliation authority.

## Shared autonomy contract

Every worker MUST:

- branch from exact current `main` at task start;
- read `skills/forge-enterprise-completion/SKILL.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `docs/FORGE_RC_HARDENING_PLAN_20260803.md`, `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`, North Star, Capability Map and relevant exact source/tests/migrations;
- audit current main before writing code;
- treat historical PRs/branches only as evidence or selective reuse sources after exact diff;
- use existing authoritative controllers/ledger/kernel paths rather than creating shadow truth;
- add regression before or with fixes when a concrete invariant gap is found;
- update capability/evidence recommendations conservatively;
- record a Dependency Request when another shared contract blocks part of the lane, then continue all independent work;
- open a new PR and stop before merge/deploy.

Workers MUST NOT ask the user for normal engineering decisions such as helper placement, test runner, branch naming, refactor shape, migration script language, commit splitting, query style or whether to add regression tests.

Workers may stop and ask only when:

1. a business decision cannot be inferred from repo/docs;
2. a shared contract owned by another lane must change and the dependency cannot be isolated;
3. a destructive or production operation is required;
4. merge/deploy of non-UI changes is required.

No worker may run production migration, production reconciliation, secret/DNS mutation, customer-data repair or destructive operation.

## Coordinator rules

- Coordinator chat owns merge ordering and cross-lane dependency resolution.
- RC-020 is the Finance posting authority gate.
- RC-024/025 is the Inventory valuation authority gate.
- AR/AP/Cash workers may audit and prepare independently, but must not fork posting semantics if RC-020 identifies a shared authority change.
- Inventory must not create a competing financial ledger; valuation-driven accounting must reconcile through canonical finance authority.
- Recommended merge order: `RC-020 -> RC-024/025 -> RC-021 -> RC-022 -> RC-023`, re-checking exact main/mergeability after every merge.
- Do not open Batch 1B until the relevant Finance/Inventory authority contract is frozen or Dependency Requests are explicitly recorded.

---

# Agent B1A-01 — RC-020 Finance Period / Posting / Reversal

Branch: `rc/w1-finance-posting-authority`

Primary capability scope:
- RC-020;
- F01 period/posting/reversal capabilities relevant to current published Finance scope.

Mission:

Establish one authoritative finance posting/correction boundary for current Forge Finance.

Audit and harden at minimum:

- draft -> submit -> posting validation -> GL posting;
- hard locked period behavior;
- soft closed/approved-adjustment behavior where supported;
- posting-date and company/branch scope movement into/out of closed periods;
- backdated posting semantics;
- cancel/reversal/correction semantics;
- immutable/traceable ledger behavior;
- fixed-point/rounding behavior where touched;
- tenant/company/branch isolation;
- server permission on posting/cancel/adjustment paths;
- idempotency/OCC/retry where mutation infrastructure applies;
- report/query consistency with authoritative GL.

Required evidence:

- focused regression for period guards;
- submit/cancel/reversal regression;
- scope/date-move regression;
- tenant + permission regression;
- migration replay if a migration is changed/added;
- reconciliation proof that corrected documents leave GL internally consistent;
- exact-head validation under CRITICAL gates.

Do not:

- create a second GL or shadow accounting ledger;
- silently rewrite submitted accounting history;
- weaken period guard to make downstream flows pass;
- change procurement/AR/AP UI unless a minimal fixture/test adapter is required.

If another lane needs posting semantics before this lane merges, publish a concise authority note/Dependency Request instead of letting that lane duplicate behavior.

Output:

- code/tests/migration if needed;
- `docs/agents/rc/RC-20-finance-posting.md`;
- maturity recommendation for touched F01 IDs;
- PR, no merge/deploy.

---

# Agent B1A-02 — RC-021 AR Allocation / Customer Reconciliation

Branch: `rc/w1-finance-ar-reconciliation`

Primary scope:
- RC-021;
- F02 AR capabilities relevant to invoice/payment allocation and reconciliation.

Mission:

Prove the canonical receivables chain without inventing a second settlement source of truth.

Audit and harden:

`Sales Invoice -> Payment Entry/payment allocation -> partial allocation -> over/advance -> credit/return/write-off where supported -> customer reconciliation`

Must verify:

- invoice outstanding calculation comes from canonical authority;
- Payment Entry/payment allocation remains settlement authority;
- partial payment and multiple allocation behavior;
- over-allocation/negative/invalid currency guards;
- advance/unallocated amount behavior where current scope supports it;
- cancel/reversal/correction restores receivable state correctly;
- credit note/return interaction where supported;
- customer aging agrees with authoritative ledger/projection;
- GL/AR reconciliation;
- permission, tenant/company/party scoping;
- idempotent retry/failure behavior on allocation writes;
- no shadow receivable balance field becomes authoritative.

Dependency boundary:

- If a required fix changes shared GL posting/reversal semantics, record `DR-RC21-RC20-*` to RC-020 and continue independent allocation/reconciliation work.

Required evidence:

- partial allocation regression;
- invalid/over allocation regression;
- cancellation/reversal regression;
- customer reconciliation fixture;
- tenant/permission regression;
- exact-head CRITICAL validation.

Output:

- code/tests if required;
- `docs/agents/rc/RC-21-ar-reconciliation.md`;
- maturity recommendation for touched F02 IDs;
- PR, no merge/deploy.

---

# Agent B1A-03 — RC-022 AP Allocation / Supplier Reconciliation

Branch: `rc/w1-finance-ap-reconciliation`

Primary scope:
- RC-022;
- F03 AP capabilities relevant to supplier invoice/payment allocation and reconciliation.

Mission:

Prove supplier payable settlement and correction through canonical Finance authority.

Audit and harden:

`Purchase Invoice -> supplier advance/payment -> partial allocation -> return/adjustment -> AP reconciliation`

Must verify:

- supplier invoice outstanding authority;
- Payment Entry/payment allocation authority;
- partial supplier payment;
- advance/prepayment behavior where supported;
- over/invalid allocation protection;
- purchase return/credit interaction where supported;
- cancel/reversal/correction restores payable state;
- supplier aging and payable projection reconcile to GL;
- tenant/company/supplier permission scope;
- retry/idempotency where allocation mutation applies;
- no procurement-specific shadow payable authority.

Dependency boundary:

- Shared GL posting/reversal changes belong to RC-020.
- Procurement business sequencing belongs to later RC-031 unless required only as a minimal AP test fixture.

Required evidence:

- partial allocation regression;
- correction/cancel regression;
- supplier reconciliation fixture;
- permission/tenant regression;
- exact-head CRITICAL validation.

Output:

- code/tests if needed;
- `docs/agents/rc/RC-22-ap-reconciliation.md`;
- maturity recommendation for touched F03 IDs;
- PR, no merge/deploy.

---

# Agent B1A-04 — RC-023 Cash / Bank Reconciliation

Branch: `rc/w1-finance-cash-bank`

Primary scope:
- RC-023;
- F04 Cash/Bank capabilities relevant to current product scope.

Mission:

Lock cash/bank transaction and reconciliation semantics against the same financial authority used by GL/AR/AP.

Audit and harden:

- cash/bank account transaction authority;
- internal transfer and reversal;
- statement/import boundary where current scope supports it;
- matching and partial reconciliation;
- unreconcile/reverse-reconcile behavior;
- duplicate statement/payment protection;
- cash position/query consistency;
- GL consistency;
- tenant/company/account scope;
- permission/server authority;
- failure/retry/idempotency for import/match mutation paths.

Do not:

- build a provider-specific bank connector unless the current abstraction requires a generic seam to prove the capability;
- make bank statement/import rows a competing ledger;
- auto-delete unmatched financial evidence to make reconciliation green.

Dependency boundary:

- Shared posting/reversal contract -> RC-020.
- Provider/vendor selection is a business decision only if implementation truly cannot remain provider-neutral.

Required evidence:

- transfer/reversal regression;
- statement duplicate/idempotency regression where applicable;
- partial match/reconcile + unreconcile regression;
- GL reconciliation fixture;
- permission/tenant regression;
- exact-head CRITICAL validation.

Output:

- code/tests if needed;
- `docs/agents/rc/RC-23-cash-bank.md`;
- maturity recommendation for touched F04 IDs;
- PR, no merge/deploy.

---

# Agent B1A-05 — RC-024 + RC-025 Inventory Reconciliation / Backdate / Valuation

Branch: `rc/w1-inventory-authority`

Primary scope:
- RC-024;
- RC-025;
- W01 stock reconciliation/correction/backdate/repost/valuation capabilities.

Mission:

Establish one authoritative stock correction/valuation path that remains reconcilable to Finance.

Audit and harden:

### RC-024 — Reconciliation / Correction

`freeze/snapshot -> count -> variance -> approval -> stock posting -> reconciliation -> reversal/correction`

Verify:

- Stock Reconciliation authority;
- warehouse/company/tenant scoping;
- quantity correction;
- valuation correction where supported;
- batch/serial integrity where applicable;
- permission and approval boundaries;
- cancel/reversal/correction;
- duplicate/retry behavior;
- physical/projected quantities remain reconcilable to authoritative stock ledger.

### RC-025 — Backdate / Repost / Valuation

Verify:

- backdated receipt/issue/reconciliation ordering;
- repost/replay behavior;
- downstream valuation impact;
- serial/batch constraints where applicable;
- correction after later movements;
- no direct mutation that bypasses stock ledger authority;
- stock valuation ↔ Finance GL reconciliation when integrated;
- fixed-point/rounding behavior where cost is touched.

Dependency boundary:

- If inventory accounting requires a shared Finance posting/reversal change, record `DR-RC25-RC20-*` and keep stock-side work independent.
- Manufacturing costing/WIP belongs to RC-037 later; only generic stock/valuation authority belongs here.

Required evidence:

- count/variance/correction regression;
- backdate/repost regression;
- cancel/reversal regression;
- warehouse/company/tenant permission regression;
- stock ledger consistency fixture;
- stock↔GL reconciliation fixture where valuation posts accounting;
- migration replay if relevant;
- exact-head CRITICAL validation.

Output:

- code/tests/migration if needed;
- `docs/agents/rc/RC-24-25-inventory-authority.md`;
- maturity recommendation for touched W01 IDs;
- PR, no merge/deploy.

---

# Batch 1A completion gate

Batch 1A is complete only when:

- all five lanes have exact current-main audit evidence;
- RC-020 posting/reversal authority is unambiguous;
- RC-024/025 stock/valuation authority is unambiguous;
- AR/AP/Cash do not own competing ledger/settlement truth;
- correction/reversal is proven for touched transactional paths;
- reconciliation exists for touched Finance/Stock paths;
- tenant/server permission evidence exists;
- inherited failures are distinguished from new regressions;
- capability registry/evidence recommendations are updated after merge;
- no CRITICAL unknown remains inside the published scope being promoted.

Only then may the coordinator open Batch 1B (`RC-030..038`) for Procurement, CRM/O2C, HCM/Payroll, Manufacturing and QMS.