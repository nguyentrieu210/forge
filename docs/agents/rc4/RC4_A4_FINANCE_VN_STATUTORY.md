# RC4-A4 — Finance / Vietnam Statutory Residual Closure

Date: 2026-08-04
Agent: RC4-A4
Branch: `agent/rc4-04-finance-vn-statutory`
Exact seed: `main@d84fbe2cc78f73e1459f52e5c9042de788678a62`
Risk: **CRITICAL**
Status: **BOOTSTRAPPED**

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

## Mandatory startup audit

Read and reconcile against exact current GitHub state before any implementation:

- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `PROJECT_CONTEXT.md`
- `AI_HANDOFF.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/agents/rc/RC3_A5_INDEPENDENT_QA.md`
- `docs/agents/workstreams/WS01-finance-vn.md`
- relevant Transaction Closure / RC-020..025 evidence and exact current source/tests/migrations.

Exact source + migrations + executable evidence win over stale workstream prose.

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
- Do not wholesale-merge stale WS01 branches/PRs. Audit and selectively reuse only exact-current-compatible pieces.
- Do not claim RC/Hardened from source presence or historical production evidence alone.

## Dependencies / no-stop rule

Expected dependencies may include WS00 ledger aggregate contract, WS10 e-invoice transport/provider lifecycle, WS11 security/privacy, WS12 provider/recovery evidence, WS04 stock valuation/repost and WS06 payroll statutory output.

If one dependency blocks a slice, record a precise Dependency Request and continue all independent Finance/Vietnam work.

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
