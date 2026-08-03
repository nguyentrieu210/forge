# RC-024 + RC-025 — Inventory Authority

**Agent:** Inventory Authority  
**Risk:** CRITICAL  
**Branch:** `rc/w2-inventory-reconciliation-valuation`  
**Exact base:** `main@e18ffb1eb1d9a2d6146252a54094a87e6bf92e8b`  
**Scope:** RC-024 Stock Reconciliation / Correction + RC-025 Backdate / Repost / Valuation  
**Merge/deploy:** forbidden by task; this lane stops at PR.

## 1. Canonical evidence read

Read/audited on the exact base:

- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `AI_HANDOFF.md`
- `PROJECT_CONTEXT.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `validation/rc-gates.json`
- stock/reconciliation/repost/valuation controllers, ledger store, tracking, tests and historical stock PRs.

`docs/FORGE_RC_HARDENING_PLAN_20260803.md` is referenced by the work order but is **absent on the exact base**. See DR-01. No substitute policy was invented.

## 2. W01 capability IDs in this lane

Primary:

- `W01-007` Stock Entry
- `W01-008` Material Receipt
- `W01-009` Material Issue
- `W01-010` Stock Transfer
- `W01-011` Stock Reconciliation
- `W01-012` Stock Ledger
- `W01-013` FIFO valuation
- `W01-014` Moving Average valuation
- `W01-016` Batch
- `W01-017` Serial
- `W01-018` Expiry
- `W01-022` Valuation adjustment
- `W01-023` Backdated stock semantics
- `W01-024` Repost/replay
- `W01-025` Returns

Related WMS counting capabilities remain consumers of the same stock authority. This lane does **not** create a WMS/cycle-count stock ledger.

## 3. Authoritative ledger decision

### Stock source of truth

`stock_ledger_entries` written through the canonical `DocumentKernel -> MutationStore.execute()` path remains the only stock authority.

All relevant projections read from that append-only ledger:

- physical balance: sum of `actual_qty_micros` by tenant/item/warehouse;
- catch weight: sum of `actual_weight_micros` without collapsing `NULL` into zero;
- batch/serial position: stock-ledger identity fields and Serial/Batch Bundle usage;
- valuation history: `getStockLedgerHistory()`;
- exact reversal: `getVoucherStockEntries(tenant, voucher_type, voucher_no, voucher_revision)`.

No shadow stock, count balance, WMS balance or manufacturing-specific stock authority was added.

### Financial source of truth

`gl_entries` remains the money authority. `Repost Item Valuation` is allowed to post a zero-quantity Stock Ledger value adjustment plus balanced GL lines. It does not create a second finance ledger.

## 4. RC-024 — reconciliation authority

### Required flow A

`freeze/snapshot -> physical count -> variance -> approve/submit -> stock posting -> valuation effect -> reconciliation -> correction/reversal`

#### Freeze / snapshot

Existing WS04 integrity remains canonical:

- warehouse, scope, item group/item, snapshot time and counter are frozen after snapshot;
- frozen lines are matched by `(item_code, batch_no)`, not row index;
- snapshot rows cannot disappear;
- duplicate physical identity fails closed;
- aggregate item and batch rows for the same item cannot be mixed;
- surplus physical rows may be appended only if still inside the frozen scope;
- warehouse must be a leaf warehouse and company scoped.

This preserves the useful contract audited from historical PR #267 without importing its shared-kernel preview changes.

#### Variance and posting

The canonical `StockReconciliationController` remains the single posting implementation:

- positive variance produces an inward Stock Ledger delta;
- negative variance produces an outward Stock Ledger delta;
- zero variance produces no Stock Ledger row;
- valuation comes from the frozen book state / explicit positive-variance rate under current controller rules;
- catch-weight variance is posted in the same Stock Ledger line set;
- tracked item variance uses the canonical Serial and Batch Bundle contract.

Added regression evidence explicitly asserts positive, negative and zero variance side effects.

#### Approval / permission

Submit already uses four-eyes approval: counter and approver cannot be the same actor. Reversal now applies the same separation and is restricted to `Chủ xưởng`, `System Manager` or `Administrator` at controller level. The historical authenticated lifecycle test already demonstrates the standard `frappe.client.cancel` route reaches the controller for `Chủ xưởng`; no policy widening was required.

#### Correction / reversal implemented in this lane

Before RC-024, submitted Stock Reconciliation explicitly rejected cancellation forever.

This lane changes cancellation to append-only correction:

1. require an actually submitted reconciliation;
2. enforce reversal authority and counter/approver separation;
3. respect the current accounting-period lock boundary;
4. load the **exact Stock Ledger rows of the submitted document revision**;
5. append sign-reversed Stock Ledger rows through `reverseStock()`;
6. release any Serial/Batch Bundle usage with `usage_delta = -1`;
7. mark the document cancelled with status `Đã đảo kiểm kê`;
8. never delete or rewrite the original ledger history.

A cancellation reason remains optional because the standard Frappe cancel endpoint does not require one. If a caller supplies `cancel_reason`, the existing Alumdoor controller carries it into the audit document. Actor, command, revision, Version and reversing ledger rows remain mandatory audit evidence.

A corrected count after reversal is a new canonical Stock Reconciliation/snapshot, not a mutation of the cancelled authoritative posting.

## 5. RC-025 — backdate / repost / valuation authority

### Required flow B

`historical stock mutation -> ordering impact -> repost/revaluation -> downstream stock balance -> GL reconciliation`

### Ordering

D1 history retrieval is deterministic:

`ORDER BY posting_at, rowid`

Valuation replay sorts by `posting_at`; JavaScript stable sort preserves the database tie order for equal timestamps. Therefore a same-time history replay is deterministic against the persisted append order rather than an unordered SQL result.

### Current valuation policy

The repo already owns the policy, so this lane does not ask for FIFO-vs-moving-average business input:

- supported methods: `FIFO`, `Moving Average`;
- explicit aliases are normalized;
- unknown configured methods fail closed rather than silently falling back;
- unset method defaults to FIFO under current policy;
- fixed-point/safe-integer arithmetic is preserved;
- outgoing valuation is replayed from authoritative history;
- batch-scoped valuation replays only that batch when a batch is selected.

### Negative stock semantics

Physical Stock Ledger has an `allow_negative_stock` flag for applicable untracked operations, but **valuation replay fails closed when historical valued quantity would go negative**. RC-025 keeps that existing policy. No new negative-stock business policy was invented.

### Repost / replay

`auditOutgoingValuation()` is the stock-owned replay diagnostic. This lane restores its public package export so the existing and expanded valuation-audit tests can actually import the contract from `clouderp-stock`.

Expanded source tests cover:

- stale FIFO issue after a backdated receipt;
- FIFO layer change after a backdated issue;
- backdated Stock Reconciliation/return inward movement affecting later issue valuation;
- Moving Average replay;
- deterministic same-timestamp input order;
- negative-valued-stock failure;
- batch stream isolation;
- mixed warehouse stream rejection.

### Repost financial impact

Canonical `Repost Item Valuation` already calculates:

- recorded current stock value from Stock Ledger;
- expected stock value from replay;
- `adjustment_minor = expected - recorded`;
- zero-quantity Stock Ledger value adjustment;
- equal and opposite balanced GL entries to stock and difference accounts.

This lane adds source regression asserting the Stock Ledger value delta equals the stock-account GL delta and total GL remains balanced.

### Repost correction / reversal hardened

Before this lane, cancellation reconstructed reversal rows from the current controller/data. That is weaker than ledger authority because code or policy may change after the original posting.

Now cancellation:

- enforces the historical period lock;
- loads exact submitted-revision Stock Ledger rows;
- loads exact submitted-revision GL rows;
- reverses those exact rows with `reverseStock()` / `reverseGl()`;
- does not recompute historical accounting from today's code.

This is the same append-only correction principle used by other authoritative finance/stock vouchers.

## 6. Receipt / issue / transfer / return / batch / serial audit

These flows continue to consume the same stock authority:

- Stock Entry receipt, issue and transfer use canonical Stock Ledger posting;
- Stock Return integrity validates warehouse scope and consumes the same ledger;
- tracked stock uses Serial and Batch Bundle, per-batch valuation on outbound rows and expiry checks;
- Stock Reconciliation bundle usage is now released on reversal;
- authenticated stock lifecycle E2E covers receipt -> issue -> transfer -> reconciliation -> reconciliation reversal and quantity/catch-weight restoration.

No manufacturing-specific rule was placed in stock core.

## 7. Retry, idempotency and halfway failure contract

The lane does not add a second retry mechanism.

Canonical `DocumentKernel.execute()`:

- checks `mutation_receipts` by `(tenant_id, command_id)` before planning;
- returns the prior receipt only when payload hash and actor match;
- rejects command-id reuse with a different payload/actor.

Canonical D1 `MutationStore.execute()` builds document/version, Stock Ledger, GL, bundle usage, outbox and mutation receipt statements into **one D1 `database.batch(statements)`**. On an ambiguous execution error it checks the persisted mutation receipt before deciding whether to return committed success or propagate failure.

That is the authoritative failure-halfway / retry boundary for both RC-024 and RC-025. This lane does not perform out-of-band writes around it.

## 8. Tenant / company / warehouse boundary

- all authoritative reader calls include `tenant_id`;
- exact reversal retrieval includes tenant + voucher identity + revision;
- D1 ledger queries include tenant conditions;
- leaf warehouse validation rejects group warehouses;
- warehouse company mismatch fails closed;
- Stock Reconciliation reversal checks the document company and current period-lock seam;
- Repost valuation requires company + warehouse and the WS04 leaf/company guard.

## 9. Stock <-> GL reconciliation and Finance boundary

Stock-owned guarantee in this lane:

`valuation replay delta == Stock Ledger value adjustment == stock-account GL delta`, with balanced GL on Repost Item Valuation.

Not silently claimed here:

- restating every historical COGS/expense voucher whose valuation becomes stale after a backdated mutation;
- finance-owned account-company / accounting-dimension policy beyond the existing Repost controller seam;
- historical period reopening/close policy beyond the current period-lock reader.

Those require the RC-020 Finance posting/reversal contract. See DR-02.

## 10. Historical PR #267 disposition

Audited exact changed-file list and relevant patches.

Useful contract retained/reused conceptually:

- one canonical Stock Reconciliation draft;
- snapshot frozen before bulk count;
- row identity `(item_code,batch_no)`;
- full frozen-row coverage;
- duplicate/aggregate-vs-batch rejection;
- OCC / exact retry behavior;
- bulk path does not submit or directly post stock.

Not cherry-picked/reopened:

- PR #267 introduces `DocumentKernel.preview()` shared-kernel surface;
- it adds app-worker callback/preview routes that are not required for RC-024 authority;
- WS04/PR #307 already fixed the historical row-index debt directly on current main.

Disposition: **selective contract reuse only; no wholesale cherry-pick.**

## 11. Code changed by RC-024/025

- `server/packages/clouderp-erpnext/src/stock-reconciliation-integrity.ts`
  - append-only submitted reconciliation reversal;
  - exact revision Stock Ledger reversal;
  - bundle usage release;
  - reversal permission/SoD/period guard.
- `server/packages/clouderp-stock/src/repost-integrity.ts`
  - exact submitted-revision Stock + GL reversal;
  - historical lock retained.
- `server/packages/clouderp-stock/src/index.ts`
  - export valuation replay audit contract.
- `server/tests/stock-reconciliation-integrity.test.mjs`
  - positive/negative/zero variance;
  - exact reversal;
  - bundle usage reversal;
  - permission, SoD, tenant-scoped reader and lock evidence.
- `server/tests/repost-item-valuation-integrity.test.mjs`
  - backdate-derived adjustment;
  - Stock Ledger <-> GL equality/balance;
  - exact submitted revision reversal;
  - lock evidence.
- `server/tests/valuation-audit.test.mjs`
  - expanded backdate/reordering/negative-stock/batch coverage.
- `client/e2e-forge/auth-tests/stock-lifecycle.spec.ts`
  - authenticated reconciliation cancellation now must restore quantity and catch weight.

## 12. Migrations

**None.**

No schema or D1 contract was changed. Therefore migration replay is not conditionally required by `validation/rc-gates.json` for this PR. Existing SQL migration suite remains part of the full server test command if CI executes it.

## 13. Validation evidence status

Risk lane: **CRITICAL**.

The repo's CRITICAL gate requires typecheck, build, unit, targeted integration, permission, tenant isolation, failure path, idempotency/retry, plus correction/reversal and reconciliation for stock.

### Source evidence added/present

| Evidence | Source | Status before CI |
|---|---|---|
| typecheck/build | root/server TypeScript build scripts | NOT RUN locally |
| unit | three targeted server test files updated | NOT RUN locally |
| integration | authenticated stock lifecycle E2E updated | NOT RUN locally |
| permission | controller reversal authority + E2E role path | source-covered, NOT RUN |
| tenant | explicit tenant-scoped reversal reader assertions + D1 tenant predicates | source-covered, NOT RUN |
| correction/reversal | exact Stock Reconciliation and Repost revision reversal tests | source-covered, NOT RUN |
| backdate/repost | valuation audit + repost tests | source-covered, NOT RUN |
| valuation | FIFO / Moving Average replay and mismatch tests | source-covered, NOT RUN |
| Stock <-> GL | Repost Stock Ledger/GL equality test | source-covered, NOT RUN |
| failure halfway | one D1 atomic batch + receipt recovery contract | source-audited, NOT RUN |
| retry/idempotency | DocumentKernel mutation receipt contract | source-audited, NOT RUN |
| migration replay | no migration in diff | N/A for conditional gate |
| production | no deploy requested/permitted | NOT APPLICABLE |

Local full-repo execution was unavailable in this agent environment because the GitHub clone attempt could not resolve `github.com`; per work-order instruction this is recorded, not used as a stop condition. CI status must be taken from the PR exact head, not inferred from source files.

## 14. Dependency Requests

### DR-01 — canonical RC hardening plan missing

**Owner:** release/control-plane documentation lane  
**Need:** restore or supersede `docs/FORGE_RC_HARDENING_PLAN_20260803.md`, which the work order references but exact `main@e18ffb1e...` does not contain.  
**Block level:** non-blocking for stock-only implementation. Skill, North Star, Capability Map/Status and `validation/rc-gates.json` were used instead.

### DR-02 — Finance historical COGS/GL repost contract

**Owner:** RC-020 Finance Posting / Period / Reversal  
**Need:** define/consume the canonical finance contract for restating downstream historical COGS/expense/accounting dimensions when a backdated stock mutation changes the valuation of already-posted outgoing stock. Also own account-company validation and period reopen semantics if stronger than the current shared period-lock reader.  
**Stock lane behavior meanwhile:** detect stale outgoing valuation; calculate authoritative stock replay; allow balanced Stock Ledger + GL valuation adjustment; never create a shadow finance ledger; never hardcode manufacturing-specific finance behavior.  
**Block level:** blocks a Hardened claim for full historical Stock <-> GL restatement, but does not block RC-024 correction or stock-owned RC-025 replay hardening.

## 15. Maturity recommendation

Do **not** self-promote the entire Inventory domain to Hardened.

Recommended after exact-head CI:

- `W01-011 Stock Reconciliation`: **RC candidate** once CRITICAL exact-head tests pass; this lane closes the prior no-reversal gap.
- `W01-012 Stock Ledger`: keep **Wired/RC candidate** based on existing ledger authority, pending broader cross-flow execution evidence.
- `W01-013 FIFO`, `W01-014 Moving Average`: **RC candidate** for stock-owned replay after exact-head tests pass.
- `W01-022 Valuation adjustment`: **RC candidate** after Stock <-> GL exact-head evidence passes.
- `W01-023 Backdated stock semantics`, `W01-024 Repost/replay`: keep at most **Wired / RC candidate**, not Hardened, until DR-02 historical finance propagation is closed and executed.
- `W01-025 Returns`: unchanged by this PR; consume existing authority and retain current capability status unless its own RC lane supplies stronger evidence.

No production marker exists or is claimed.
