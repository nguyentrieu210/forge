# RC-023 — Finance Cash / Bank / Reconciliation

Agent: `RC-023`  
Risk: **CRITICAL**  
Branch: `rc/w2-finance-cash-bank`  
Start baseline: exact `main@e18ffb1eb1d9a2d6146252a54094a87e6bf92e8b`  
PR: `#442` — `feat(finance): harden RC-023 cash bank reconciliation`  
Merge/deploy: **not performed**

## 1. Outcome

RC-023 hardens the current F04 authority path without creating a second financial ledger:

`authoritative posting -> statement/feed evidence -> deterministic candidate matching -> partial/full reconciliation -> explicit reverse/unreconcile -> GL-derived position/report`

Delivered on this branch:

- `server/migrations/tenant/0110_rc023_cash_bank_reconciliation.sql`;
- `server/scripts/test-rc023-cash-bank.py`;
- RC-023 regression wired into `server/package.json` `test:sql`;
- this handoff.

The implementation deliberately does **not** select a concrete bank provider. It introduces a generic statement/feed provenance boundary that a later provider adapter can map into without changing financial authority.

## 2. Canonical authority

### 2.1 Money / balance authority

`gl_entries` is the authoritative cash/bank balance source.

No RC-023 table/view stores a competing mutable cash or bank balance.

`cash_bank_position` added by RC-023 is a rebuildable SQL projection over GL plus statement/reconciliation evidence.

### 2.2 Customer / supplier settlement

`Payment Entry` remains the canonical customer/supplier cash/bank settlement path.

Current controller evidence already provides:

- Receive / Pay semantics;
- server-side bank/cash account validation;
- fixed-point monetary amounts;
- authoritative GL posting;
- payment-ledger allocation;
- partial allocation / unapplied amount;
- explicit cancel reversal;
- accounting-period checks.

RC-023 does not invent another settlement object.

### 2.3 Internal transfer

For generic account-to-account transfers, current repository authority is `Journal Entry`:

- balanced debit/credit lines;
- server-side account/company validation;
- accounting-period check;
- append-only GL posting;
- cancel by exact reverse GL.

Warehouse-specific cash transfer remains `Warehouse Cash Transfer`, but its accounting effect is still GL, not a warehouse-owned balance ledger.

### 2.4 Warehouse Cash

Warehouse Cash remains an operational primitive owned by the VN-accounting/ERP controller path:

- `Warehouse Cash Fund` maps warehouse/custodian to a canonical cash account;
- `Warehouse Cash Voucher` posts GL;
- `Warehouse Cash Transfer` posts balanced GL between fund accounts;
- cancel reverses GL;
- balance/daily projections are derived from GL;
- accounting mapping becomes immutable once financial activity exists.

RC-023 explicitly keeps this subordinate to GL. The new position projection ignores any payload-level fake/stale `balance_minor` value and derives cash position from `gl_entries`.

### 2.5 Bank Transaction

`Bank Transaction` is **statement/feed evidence**, not financial posting authority.

It derives its company/currency/GL account from canonical `Bank Account`, but does not emit GL.

This is intentional: importing a bank statement must not silently create accounting entries.

### 2.6 Bank Reconciliation

`Bank Reconciliation` is reversible control state over:

1. a submitted `Bank Transaction`; and
2. an already-submitted authoritative posting whose GL actually moved the matching bank account.

The append-only `bank_reconciliation_entries` table remains control/reconciliation evidence only. It never becomes cash/bank balance authority.

## 3. Existing behavior audited

### Payment Entry

Audited `server/packages/clouderp-selling/src/finance-controllers.ts`.

Observed:

- bank/cash movement posts through GL;
- customer/supplier allocation posts through payment ledger;
- cancellation uses reverse GL/payment entries;
- exact fixed-point scaling is server-side;
- accounting period is checked before posting.

### Journal Entry

Audited `server/packages/clouderp-core/src/controllers.ts`.

Observed:

- requires balanced lines;
- emits authoritative GL;
- cancellation emits reversed GL;
- suitable existing generic authority for internal cash/bank transfer.

### Bank Transaction / Bank Reconciliation

Audited `server/packages/clouderp-erpnext/src/enterprise-controllers.ts`, `server/packages/document-kernel/src/d1-store.ts`, and migration `0009_business_suite.sql`.

Existing strengths before RC-023:

- Bank Transaction derives bank/company/currency from Bank Account;
- Bank Reconciliation supports partial reconciliation;
- cancellation writes negative reconciliation rows instead of deleting history;
- D1 hydration derives Unreconciled / Partly Reconciled / Reconciled from append-only reconciliation rows;
- reconciliation amount was bounded by statement amount.

Critical gaps found:

- a reconciliation could point at a submitted voucher without proving that voucher had a bank-side GL movement;
- the same authoritative voucher bank movement could be consumed by multiple statement rows;
- a reconciled bank transaction or matched voucher could be cancelled first, leaving dangling control state;
- reconciliation cancellation/reversal had no DB accounting-period guard;
- statement imports had no stable generic external row identity/idempotency boundary;
- `bank_reconciliation_summary` divided by hard-coded `100.0`, incorrect for currencies with scale != 2;
- no canonical GL-derived unified cash/bank position projection.

### Bank matching worker

Audited `server/apps-src/vn-accounting-worker/src/bank-match.ts` and worker route.

Current matcher is safe as a **proposal** path:

- reads submitted Bank Transaction;
- scans submitted Payment Entries;
- matches company, direction, bank-side account, currency, amount and date window;
- scores deterministic reference/party/date evidence;
- never writes reconciliation.

RC-023 keeps that boundary. Auto-match is recommendation, not mutation authority.

### Warehouse Cash

Audited `server/packages/clouderp-erpnext/src/warehouse-cash.ts` and historical WS01/Alumdoor convergence evidence.

No competing warehouse cash authority was introduced.

## 4. RC-023 schema / invariant hardening

### 4.1 Generic statement / bank-feed provenance boundary

Bank Transaction receives generic provenance fields:

- `source_kind`: `Manual | Statement Import | Bank Feed`;
- `source_provider`;
- `source_row_id`;
- `source_batch_id`.

Imported/feed rows require provider + stable source row id.

Database uniqueness is enforced for:

`tenant + bank_account + normalized provider + source_row_id`

This provides retry/idempotency protection without assuming CSV, OFX, ISO 20022, Vietcombank, BIDV, Techcombank, or any other provider-specific format.

### 4.2 Reconciliation must bind to real authoritative GL

A positive reconciliation now requires:

- submitted Bank Transaction;
- exact bank account/currency/scale;
- submitted against-voucher;
- same company;
- actual GL rows for that voucher on the Bank Transaction `gl_account`;
- correct movement direction:
  - Deposit => net debit on bank account;
  - Withdrawal => net credit on bank account.

Therefore reconciliation cannot manufacture a financial truth that does not exist in GL.

### 4.3 Partial / full reconcile

The existing append-only model is retained.

Cumulative reconciliation for a statement row must stay within:

`0 <= net_reconciled <= abs(statement_amount)`

Multiple partial reconciliation documents can reach the exact full amount.

### 4.4 Same voucher matched twice

Across statement rows, cumulative active reconciliation against the same voucher + bank GL account + currency/scale cannot exceed the voucher's actual bank-side GL movement.

This closes the previous shadow-ledger/double-consumption hole.

### 4.5 Reverse / unreconcile

Correction remains append-only:

- positive row applies reconciliation;
- negative row reverses it;
- history remains present;
- net state drives status/report.

A reversal cannot make either the statement-level or statement/voucher-pair reconciliation negative.

### 4.6 Cancellation ordering

A submitted Bank Transaction with non-zero active reconciliation cannot be cancelled first.

A submitted authoritative matched voucher, including `Payment Entry` or `Journal Entry`, cannot be cancelled first.

Required lifecycle is:

`unreconcile/reverse -> net reconciliation = 0 -> cancel statement or posting if otherwise allowed`

This preserves auditability and stops dangling matches.

## 5. Accounting period interaction

Existing migration `0042_vn_accounting_period_hardening.sql` protects authoritative posting documents including:

- Journal Entry;
- Payment Entry;
- invoices;
- Warehouse Cash Voucher / Transfer;
- other GL/stock posting documents.

RC-023 adds equivalent hard/soft-close database guards to **Bank Reconciliation**.

### Hard Locked

Apply/update/cancel of Bank Reconciliation in the locked period is rejected.

This includes reverse/unreconcile because it changes financial control state for that period.

### Soft Closed

Reconciliation follows the canonical approved-adjustment contract:

- period must allow approved adjustments;
- `approved_adjustment` true;
- non-empty adjustment reason;
- non-empty approver.

### Statement import after close

`Bank Transaction` itself is intentionally **not** blocked by accounting period close.

Reason: a late bank statement is external evidence. Recording the evidence does not mutate GL. Applying reconciliation to that evidence is separately period-controlled.

This boundary allows operational statement ingestion without silently reopening accounting authority.

## 6. Cash / bank position

RC-023 adds `cash_bank_position` as a read-only projection.

For Bank Account it exposes:

- GL balance in minor units;
- statement activity;
- reconciled statement amount;
- unreconciled statement amount.

For Warehouse Cash Fund it exposes:

- canonical GL balance of the mapped cash account.

Important invariant:

`cash_bank_position.gl_balance_minor == SUM(gl_entries.debit_minor - gl_entries.credit_minor)`

No Bank Transaction or reconciliation row is allowed to become the balance authority.

## 7. Reconciliation report fixed-point correction

The pre-RC view `bank_reconciliation_summary` used `/100.0`.

That silently assumes currency scale 2.

RC-023 keeps compatibility field `reconciled_amount` but calculates display values by `currency_scale` 0..6 and also exposes `reconciled_amount_minor`.

Targeted regression includes a scale-3 KWD case:

- minor amount `1250`;
- display amount `1.25`.

## 8. Permission / tenant / account boundary

### Bank Account configuration

RC-023 tightens metadata so `Accounts User` is read/report/export only for Bank Account configuration.

Mutation/import of bank-account configuration remains with Accounts Manager / System Manager.

This prevents ordinary transaction users from changing the account mapping that reconciliation trusts.

### Bank Transaction

Accounts User can create/import statement evidence but cannot submit it under the existing manager-submit model.

### Tenant

External source identity uniqueness is tenant-scoped.

The same provider row id may exist in another tenant without collision.

Every reconciliation DB check includes tenant id.

### Company/account

Matched voucher company must equal Bank Transaction company.

Positive match must have GL movement on the exact Bank Transaction bank GL account, currency and scale.

## 9. Failure / retry semantics

Covered failure behavior:

- missing provider/source row for imported/feed evidence => reject;
- duplicate external statement row => reject;
- failed transactional import batch => rollback earlier rows in that batch;
- same statement row over-reconciled => reject;
- same voucher bank movement consumed twice => reject;
- voucher with no bank-side GL => reject;
- company mismatch => reject;
- cancelled voucher => cannot be newly reconciled;
- active reconciliation => blocks statement/voucher cancellation;
- hard-lock reconciliation/reverse => reject;
- soft-close unapproved reconciliation => reject.

The repository mutation guard / command receipt machinery remains the document mutation retry/idempotency authority. RC-023 adds external statement-row identity at the D1 constraint layer so provider retries cannot create duplicate evidence rows under new document names.

## 10. Tests

Focused regression: `server/scripts/test-rc023-cash-bank.py`.

Coverage matrix:

| Required RC-023 case | Evidence |
|---|---|
| internal transfer | balanced Journal Entry bank-to-bank GL |
| duplicate statement row | unique provider/source identity constraint |
| same statement transaction matched beyond amount | DB over-allocation rejection |
| same authoritative voucher consumed by multiple statement rows | voucher GL capacity rejection |
| partial reconcile | 60% + 40% append-only reconciliation |
| full reconcile | net reaches exact statement amount |
| reverse/unreconcile | negative correction row returns net state to zero |
| cancelled payment | active match blocks cancel; after reverse cancel succeeds; cancelled PE cannot be matched |
| backdate / period | hard-lock submit and reverse blocked; soft-close approved adjustment contract exercised |
| tenant isolation | same provider/source row allowed in a different tenant |
| company/account boundary | mismatched company and missing bank GL rejected |
| failed import | transactional batch rollback |
| retry/idempotency | provider/source unique identity + existing mutation guard architecture |
| GL balance | Journal Entry transfer debit = credit |
| cash position | position balance equals GL sum |
| Warehouse Cash non-authority | fake payload balance ignored; GL wins |
| reconciliation shadow-ledger defense | every positive match requires actual bank-side GL |
| fixed-point report | currency scale 3 regression |

The focused script is wired into `server/package.json` `test:sql`.

### Validation evidence status

During implementation the RC-023 migration and regression logic were exercised against in-memory SQLite, including SQL parsing, duplicate/idempotency, partial/full/reverse, cancellation ordering, period controls, KWD scale, and GL-derived position behavior.

A full repository dependency checkout/build/typecheck/full suite was **not** executed from this connector environment and is **not** reported as PASS.

Per `docs/VALIDATION_GATES.md`, Finance remains CRITICAL and merge evidence must include:

- typecheck;
- build;
- unit/self-check;
- targeted integration;
- permission;
- tenant isolation;
- failure path;
- idempotency/retry;
- migration replay;
- correction/reversal;
- reconciliation.

Unrelated broad-suite or CI failure is diagnostic debt, not a reason to erase the targeted RC-023 evidence and not permission to fake a green gate.

## 11. Historical evidence audited

Relevant merged/historical finance work was treated as evidence, not reopened:

- Finance/VN convergence PR `#367`;
- Warehouse petty-cash core/convergence history, including PR `#178` / merged current-state evidence;
- O2C / payment-ledger settlement history including PR `#139`;
- Warehouse Cash Alumdoor integration/convergence PRs including `#221`, `#226`, `#229`;
- current repo `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` and WS01 handoff.

The historical evidence consistently supports the same authority decision: GL/Payment Entry/Journal Entry are finance authority; Warehouse Cash and Bank Reconciliation must not compete with them.

## 12. Dependency Requests

### DR-RC023-001 — Canonical RC hardening plan is absent

Requested path:

`docs/FORGE_RC_HARDENING_PLAN_20260803.md`

It was absent from the exact starting baseline. RC-03's validation-gate handoff records the same missing-plan dependency.

Impact: cannot cite that file as repository evidence.

Disposition: **non-blocking**. Enterprise Completion Skill, North Star, Capability Map/Status, executable Validation Gates and exact code/migrations provided sufficient authority.

### DR-RC023-002 — Concrete bank provider / import mapping

Business has not selected a concrete bank/provider/feed format.

RC-023 therefore implements a provider-neutral boundary only:

- source kind;
- provider key;
- external row id;
- optional batch id;
- duplicate/idempotency constraint.

Future adapter may map CSV/Excel/OFX/ISO 20022/API/feed rows into this contract.

Impact: provider-specific parser/credential/feed monitoring remains future integration work.

Disposition: **non-blocking for generic F04 reconciliation**.

### DR-RC023-003 — Cash/bank position query/UI registration

RC-023 adds the authoritative backend projection `cash_bank_position`.

The shared `server/packages/query/src/index.ts` is concurrently changed by RC-020. To avoid cross-lane shared-contract churn, RC-023 does not also modify that shared registry in this branch.

Requested convergence action after finance lanes stabilize:

- register a tenant-scoped `Cash / Bank Position` report against `cash_bank_position`;
- expose GL balance + statement/reconciliation metrics without introducing stored balance state.

Disposition: **isolated dependency; does not block backend authority hardening**.

### DR-RC023-004 — Concurrent finance migration prefix convergence

Exact-base concurrent branches currently reuse numeric prefixes:

- RC-020: `0110`, `0111`;
- RC-021: `0111`;
- RC-023: `0110_rc023_cash_bank_reconciliation.sql`.

The current D1 migration runner records full migration filename as identity and sorts the full filename, so there is no same-path overwrite. RC-023's migration depends on merged baseline schema and 0042 rather than RC-020/021 changes.

Nevertheless the finance convergence lane should normalize final ordering/numbers before the wave is merged if the repository wants one-number-per-migration convention.

Disposition: **small convergence dependency, not a functional blocker**.

### DR-RC023-005 — Foreign-currency settlement policy

RC-023 reconciliation intentionally fails closed to exact bank GL currency + scale.

More complex foreign-currency bank settlement/exchange-difference behavior belongs with F07 multi-currency authority. It should not be guessed inside F04 reconciliation.

Disposition: **non-blocking for same-currency cash/bank RC scope**.

## 13. Maturity assessment

No `Hardened` claim is made. There is no exact production release marker for this branch, and provider/query-surface dependencies remain.

| Capability | RC-023 assessment | Reason |
|---|---|---|
| F04-001 Cash account | RC | cash position tied to GL; Warehouse Cash mapping remains subordinate |
| F04-002 Bank account | RC | canonical mapping audited + configuration permission tightened |
| F04-003 Payment Entry | RC | existing authoritative posting/allocation/reversal preserved and reconciled against GL |
| F04-004 Cash receipt/payment | RC | authoritative Payment Entry / GL path preserved |
| F04-005 Warehouse/petty cash | RC | GL authority and reverse behavior preserved; no shadow balance |
| F04-006 Cash transfer | RC | generic JE transfer + Warehouse Cash Transfer GL path tested/audited |
| F04-007 Cash count/handover | Wired | existing Warehouse Cash Count exists; not the main hardening target here |
| F04-008 Statement import | RC boundary / provider adapter pending | generic provenance/idempotency/failure contract hardened |
| F04-009 Bank transaction | RC | statement-evidence authority and cancellation lifecycle hardened |
| F04-010 Manual reconciliation | RC | GL-bound, bounded, tenant/company safe |
| F04-011 Auto matching | RC proposal path | deterministic read-only candidate matcher; no unsafe auto-write |
| F04-012 Partial reconciliation | RC | cumulative bounded partial/full behavior covered |
| F04-013 Reversible reconciliation | RC | append-only reverse + cancellation ordering + period checks |
| F04-014 Bank feed connector | Foundation | provider not selected; generic boundary ready |
| F04-015 Payment batch | Foundation | outside this RC-023 core scope |
| F04-016 Payment approval | Foundation/Wired | existing role/submit boundaries exist; no dedicated approval workflow completion claimed |
| F04-017 Cheque/reference | Wired | reference evidence exists; no extra maturity claim |
| F04-018 Treasury dashboard | Foundation | query/UI dependency remains |
| F04-019 Cash position | Wired/RC backend | GL-derived projection delivered; shared query/UI registration pending DR-RC023-003 |
| F04-020 Cash-flow forecast | Foundation | outside this hardening slice |

Overall F04 is materially stronger on the critical cash/bank/reconciliation authority path, but **not Hardened** until convergence, full CRITICAL validation evidence, provider/remaining surfaces where required, and exact production proof exist.

## 14. Concurrent-main / connector incident

The requested branch was created from exact `main@e18ffb1eb1d9a2d6146252a54094a87e6bf92e8b`.

During the first write, two GitHub contents calls used the wrong branch parameter name. The connector therefore wrote two newly-created RC-023 files to `main` instead of the feature branch.

Detected immediately.

Corrective actions:

- migration file removed from main by compensating commit `27e00aa4687e683297f8d0bd28a15493e9b0bf1c`;
- test file removed from main by compensating commit `7819ade8cdb1213d9f99ae92f144ae8aee82b054`;
- no history rewrite / force-push;
- no pre-existing file was deleted;
- the audited file blobs were then committed to `rc/w2-finance-cash-bank` using Git tree/commit objects;
- PR #442 is based on current main after those compensating commits, so its diff contains only intended RC-023 changes.

This incident did **not** deploy code or mutate production/customer data.

## 15. Merge / deploy boundary

- PR: **opened — #442**.
- Merge: **not performed**.
- Production deploy: **not performed**.
- Production migration: **not performed**.
- Bank credentials/provider secret changes: **none**.
- Customer/tenant production data mutation: **none**.

Non-UI merge/deploy remains an explicit approval boundary.
