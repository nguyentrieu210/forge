# RC4-A4 — Finance / Vietnam Statutory Residual Closure

Date: 2026-08-04
Agent: RC4-A4
Branch: `agent/rc4-04-finance-vn-statutory`
Exact current-main baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Original seed: `main@d84fbe2cc78f73e1459f52e5c9042de788678a62`
Risk: **CRITICAL**
Status: **BLOCKED — dependency-bound residuals remain; independent VAT/statutory-evidence slice complete**

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
- `docs/agents/rc/RC-020-finance-period-posting.md`
- `docs/agents/rc/RC-021-finance-ar-reconciliation.md`
- `docs/agents/rc/RC-023-finance-cash-bank.md`
- `docs/agents/transaction-closure/07-CONVERGENCE.md`
- `docs/agents/workstreams/WS01-finance-vn.md`
- `docs/agents/workstreams/WS01_VALIDATION_EVIDENCE.md`
- canonical Finance/VN convergence PR `#367`
- current Transaction Closure finance query/ledger authorities.

Exact source + migrations + executable evidence win over stale workstream prose.

## Exact-current findings

- WS01 stale PR `#312` is superseded. Canonical Finance/VN convergence is merged PR `#367`; current migrations are `0089..0098`, not the stale `0048..0057` reservation.
- RC3 accepted scoped RC evidence for Finance core but deliberately held `F01-011..F01-013` year-end/retained earnings, Vietnam statutory promotion, landed-cost closure and historical Stock↔GL repost below RC.
- `server/packages/query/src/finance-closure.ts` contains company/branch/account/date-scoped read-only report SQL, but `server/packages/ledger/src/index.ts` exposes invariant/reversal helpers only. There is still no reusable authoritative domain aggregate contract suitable for controller-owned close/revaluation/budget actuals without bypassing the intended kernel/ledger boundary.
- Provider transport/signing/retry/status synchronization for e-invoice remains outside WS01 authority.
- Historical WS01 validation exposed two independent Finance/VN defects that can be fixed without those dependencies:
  1. migration `0096` could return the wrong fail-closed marker for a missing VAT mapping array because SQLite NULL comparison fell through to the empty-mapping branch;
  2. `tax-evaluate.input_json` used App Action fieldtype `Code`, which is outside the canonical action-screen render allowlist.
- VAT filing-preview responses also returned only the linked legal-rule name and ruleset hash; they did not carry the immutable source/version/effective-date evidence snapshot needed for an auditable statutory read result.

## Preserve current authorities

- one canonical GL/payment/stock authority only;
- fixed-point money semantics;
- debit = credit;
- immutable/traceable postings;
- cancel/reversal/correction rather than silent history rewrite;
- tenant/company/branch scope enforced server-side;
- legal/statutory rules must be effective-dated, versioned, source-bound and regression-tested;
- no client-side finance authority.

## Implemented independent slice

### A4-S1 — VAT mapping validation / App Action exact-source repair

Files:

- `server/migrations/tenant/0113_vn_vat_account_mapping_guard_hardening.sql`
- `server/scripts/test-vn-vat-dataset-migration.py`
- `server/apps-src/vn-accounting/app.json`
- `server/tests/vn-accounting-statutory-pack.test.mjs`
- `server/tests/vn-accounting-policy.test.mjs`

Changes:

- kept potentially-applied `0096_vn_vat_dataset_mapping.sql` unchanged;
- added append-only migration `0113` that replaces only the VAT mapping guards;
- missing/wrong-shape `input_vat` / `output_vat` now deterministically fail `VN_VAT_ACCOUNT_MAPPING_INVALID` instead of falling through SQLite NULL semantics;
- both-present-but-empty arrays remain the distinct `VN_VAT_ACCOUNT_MAPPING_EMPTY` case;
- cross-listed input/output accounts remain `VN_VAT_ACCOUNT_MAPPING_AMBIGUOUS`;
- draft -> submit UPDATE uses the same fail-closed contract;
- non-VAT rulesets remain outside the VAT mapping requirement;
- `vn-accounting` version bumped `1.6.0 -> 1.6.1`;
- `tax-evaluate.input_json` changed from unsupported App Action `Code` to canonical `Small Text`; worker still parses JSON text through the existing evaluator, so calculation semantics are unchanged;
- version/action metadata regressions were aligned to `1.6.1`.

Authority impact: **none**. VAT dataset remains a read-only projection; no tax/GL/payment/stock ledger is added.

### A4-S2 — VAT statutory legal-evidence binding

Files:

- `server/apps-src/vn-accounting-worker/src/legal-evidence.ts`
- `server/apps-src/vn-accounting-worker/src/vat-service.ts`
- `server/tests/vn-legal-evidence.test.mjs`
- `server/tests/vn-vat-service.test.mjs`

Changes:

- VAT ruleset consumption now reads the linked canonical submitted `VN Legal Rule` through the signed platform callback;
- fails closed if the legal rule is not submitted, has a different rule type, lacks required source/version fields or does not cover the ruleset effective period;
- invoice reconciliation and VAT filing-preview responses expose a read-only `legal_evidence` snapshot containing rule identity/type/version, legal document number, regime, taxpayer segment, effective range, official source URL and source-file hash;
- existing `VN Tax Ruleset.source_hash` remains separate evidence for the deterministic ruleset itself;
- VAT source invoices and amounts remain canonical submitted Sales/Purchase Invoice data; no statutory filing write or second tax ledger is introduced.

Capability effect: direct evidence is stronger for `V01-009`, `V02-004` and `V02-005`, but **no global maturity promotion is committed from source presence alone**. Exact focused Node build/test execution remains required before recommending a registry change.

## Validation evidence

### Executed in this RC4-A4 session

Isolated SQLite replay of ordered `0096 + 0113`, repeated twice, passed:

- malformed JSON -> `VN_VAT_ACCOUNT_MAPPING_INVALID`;
- missing array -> `VN_VAT_ACCOUNT_MAPPING_INVALID`;
- wrong-shaped array member -> `VN_VAT_ACCOUNT_MAPPING_INVALID`;
- both arrays empty -> `VN_VAT_ACCOUNT_MAPPING_EMPTY`;
- same account in input/output -> `VN_VAT_ACCOUNT_MAPPING_AMBIGUOUS`;
- valid VAT mapping -> accepted;
- CIT ruleset without VAT mapping -> accepted;
- draft -> submit missing array -> invalid;
- draft -> submit empty arrays -> empty;
- draft -> submit valid mapping -> accepted;
- `PRAGMA integrity_check` -> `ok`.

The migration regression is already part of the existing `test:sql` chain through `test-vn-vat-dataset-migration.py`; no parallel validation authority was introduced.

### Source/static evidence

- canonical `AppAction` allowlist includes `Small Text` and excludes `Code`; branch manifest now uses `Small Text` for `tax-evaluate.input_json`;
- worker evaluator already accepts JSON text via `args.input_json` and parses it as an object;
- `0089/0090/0092` keep submitted legal-rule/ruleset effective-date, source, immutability and DSL-v1 authority; A4-S2 consumes those records rather than duplicating them.

### Not claimed

- no whole-repository TypeScript PASS;
- no exact-head full Node unit-suite PASS;
- no production/provider/live statutory PASS;
- no capability `RC`/`Hardened` promotion from this branch yet.

## Dependency Requests

### DR-RC4-A4-001 — authoritative ledger aggregate contract

Target: **WS00 / canonical ledger-query boundary**.

Need a reusable authoritative read contract for tenant + company + optional branch + account(s) + posting-date range returning deterministic fixed-point debit/credit/net aggregates with source evidence. Domain controllers must consume it without direct ad-hoc SQL/document scans.

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

## Remaining independent Finance/VN observations

- `F05-011..F05-016`, `F06-004..F06-012`, `F07-007..F07-009`, `V01-008`, `V02-006..V02-010` remain broader product/business slices; this branch does not fabricate implementations merely to reduce Missing/Foundation counts.
- PIT/BHXH numeric automation is intentionally not created in WS01; WS06 owns statutory payroll evaluation.
- E-invoice transport/signing is intentionally not implemented here; WS10/WS12 own provider lifecycle.
- Landed-cost and historical Stock repost Finance effects are intentionally not implemented around the Stock Ledger; WS04/WS03 must supply canonical valuation/repost authority first.

## Merge / deploy boundary

This lane is non-UI CRITICAL.

- Implementation, commits and PR are allowed.
- Stop before merge/deploy.
- No production migration, provider mutation, DNS/secret change or customer-data mutation without explicit user approval.
