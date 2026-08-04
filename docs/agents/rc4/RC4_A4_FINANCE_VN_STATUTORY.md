# RC4-A4 — Finance / Vietnam Statutory Residual Closure

Date: 2026-08-04
Agent: RC4-A4
Branch: `agent/rc4-04-finance-vn-statutory`
Exact current-main baseline after startup audit: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Original seed: `main@d84fbe2cc78f73e1459f52e5c9042de788678a62`
Risk: **CRITICAL**
Status: **RUNNING**

## Mission

Close the post-RC3 Finance/Vietnam release-confidence gaps without reopening already-converged Transaction Closure authority or creating competing GL/payment/stock/payroll ledgers.

Primary scope:

1. year-end/fiscal close and retained-earnings readiness;
2. authoritative company/branch/account/date ledger aggregate consumption where already available, otherwise record a Dependency Request to WS00 rather than bypassing the kernel/ledger contract;
3. period-end FX revaluation and correction/reversal semantics;
4. budget-vs-actual and finance reconciliation depth;
5. Vietnam statutory accounting/tax residuals with effective-dated, versioned, source-bound legal evidence;
6. e-invoice provider closure only at the finance contract/evidence boundary; provider transport/secrets/retry ownership remains WS10/WS12;
7. landed-cost / Stock↔GL repost reconciliation only through existing canonical stock/finance authorities;
8. capability-level evidence for `F01-F07` and `V01-V04` changes.

## Mandatory startup audit — completed against exact current GitHub state

Read/reconciled:

- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `PROJECT_CONTEXT.md`
- `AI_HANDOFF.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/agents/rc/RC3_A5_INDEPENDENT_QA.md`
- `docs/agents/rc/RC3_A1_ERP_VN_EVIDENCE.md`
- `docs/agents/workstreams/WS01-finance-vn.md`
- canonical Finance/VN convergence PR `#367`
- current Transaction Closure finance query/ledger authorities.

Exact source + migrations + executable evidence win over stale workstream prose.

## Exact-current findings

- WS01 stale PR `#312` is superseded. Canonical Finance/VN convergence is merged PR `#367`; current migrations are `0089..0098`, not the stale `0048..0057` reservation.
- RC3 accepted scoped RC evidence for Finance core but deliberately held `F01-011..F01-013` year-end/retained earnings, Vietnam statutory promotion, landed-cost closure and historical Stock↔GL repost below RC.
- `server/packages/query/src/finance-closure.ts` contains company/branch/account/date-scoped read-only report SQL, but `server/packages/ledger/src/index.ts` exposes ledger invariant/reversal helpers only. There is still no reusable authoritative domain aggregate contract suitable for controller-owned close/revaluation/budget actuals without bypassing the intended kernel/ledger boundary.
- Provider transport/signing/retry/status synchronization for e-invoice remains outside WS01 authority.

## Preserve current authorities

- one canonical GL/payment/stock authority only;
- fixed-point money semantics;
- debit = credit;
- immutable/traceable postings;
- cancel/reversal/correction rather than silent history rewrite;
- tenant/company/branch scope enforced server-side;
- legal/statutory rules must be effective-dated, versioned, source-bound and regression-tested;
- no client-side finance authority.

## Do not redo

- Do not rebuild Transaction Closure.
- Do not create a second Payment Ledger, GL, Stock Ledger, e-invoice document or payroll evaluator.
- Do not wholesale-merge stale WS01 branches/PRs.
- Do not claim RC/Hardened from source presence or historical production evidence alone.

## Dependency Requests

### DR-RC4-A4-001 — authoritative ledger aggregate contract

Target: **WS00 / canonical ledger-query boundary**.

Need a reusable authoritative read contract for tenant + company + optional branch + account(s) + posting-date range returning deterministic fixed-point debit/credit/net aggregates with source evidence. Domain controllers must be able to consume it without direct ad-hoc SQL/document scans.

Blocks:

- `F01-011` Closing entries;
- `F01-012` Year-end closing;
- `F01-013` Retained earnings;
- `F05-010` exact Budget vs Actual;
- `F07-005..F07-006` authoritative period-end FX gain/loss/revaluation;
- consolidation slices that depend on company-scoped ledger truth.

Temporary workaround: **none**. Existing report SQL is evidence/read projection, not a license to create controller-local ledger authority.

### DR-RC4-A4-002 — e-invoice provider lifecycle evidence

Target: **WS10/WS12**.

Need provider adapter + signing + idempotent submit/retry + status synchronization to populate the existing canonical `E-Invoice Submission` evidence contract. WS01 owns finance/legal consistency only and must not own provider secrets/transport.

Blocks `V04-006..V04-010` promotion beyond source/evidence-boundary maturity.

### DR-RC4-A4-003 — landed-cost / historical stock repost authority

Target: **WS04 + WS03**, consumed by WS01.

Need canonical Stock Ledger valuation application/reversal and historical repost/replay evidence that propagates downstream COGS/Finance corrections without a shadow ledger. WS01 will only add reconciliation/acceptance evidence around that authority.

Blocks `P01-016`, `W01-021`, `W01-023..W01-024` RC closure from this lane alone.

### DR-RC4-A4-004 — statutory payroll numeric authority

Target: **WS06**.

Need clause-verified official effective-dated PIT/BHXH/BHYT/BHTN numeric fixtures and exact-head statutory regression. WS01 must not create a second payroll evaluator.

Blocks `V03-001..V03-010` promotion from WS01.

## Independent work allowed in this lane

Continue residual Finance/Vietnam work that does not violate the dependency boundaries, including statutory accounting/tax source/evidence validation, filing/read-model datasets, finance reconciliation diagnostics and capability-level evidence/tests around existing canonical authorities.

## Verification

For every CRITICAL slice require, as applicable:

- explicit invariants;
- focused executable regression;
- migration replay and applied-state safety;
- tenant/permission isolation;
- correction/cancel/reversal;
- reconciliation before/after;
- authoritative legal/source evidence for statutory rules;
- exact-head evidence.

## Merge / deploy boundary

This lane is non-UI CRITICAL.

- Implementation, commits and PR are allowed.
- Stop before merge/deploy.
- No production migration, provider mutation, DNS/secret change or customer-data mutation without explicit user approval.
