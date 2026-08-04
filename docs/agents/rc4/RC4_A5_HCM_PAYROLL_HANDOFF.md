# RC4-A5 — HCM / Vietnam Statutory Payroll Residual

Status: **BOOTSTRAPPED**
Branch: `agent/rc4-05-hcm-payroll-statutory`
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **CRITICAL**
Owner stream: **WS06**

## Mission

Close the remaining HCM/Vietnam payroll release-confidence gaps without creating a competing payroll or accounting authority.

## Read first

- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/agents/workstreams/WS06-hcm-payroll.md`
- `docs/hrm/WS06_AUTONOMOUS_HANDOFF.md`
- `docs/hrm/VN_STATUTORY_PAYROLL_SOURCE_LOCK_2026.md`
- `docs/agents/rc/RC3_A1_ERP_VN_EVIDENCE.md`
- `docs/agents/rc/RC3_A5_INDEPENDENT_QA.md`

Exact current source/migrations/tests win over stale workstream prose.

## Primary scope

1. Effective-dated/versioned VN payroll statutory evaluator for PIT/BHXH/BHYT/BHTN using official-source-bound rule evidence.
2. Explicit formula schema, fixed-point/rounding semantics, effective-date selection and deterministic test vectors.
3. Payroll correction/reversal/rerun behavior and source freeze after authoritative use.
4. Permission/tenant isolation for salary, statutory inputs and sensitive payroll fields.
5. Reconciliation/output contract to canonical Finance/GL authority; do not create a shadow payroll ledger or GL.
6. Exact focused regression and migration replay for every changed statutory/migration path.

## Forbidden / avoid

- Do not rewrite HRM operational flows already merged unless a concrete RC3 gap requires it.
- Do not invent legal rates or source claims; use source-locked evidence already in repo or record a Dependency Request.
- Do not write directly to Finance ledgers outside canonical controller/kernel paths.
- Do not edit WS11 auth/privacy or WS01 ledger hotspots to bypass dependencies.

## Dependencies

- WS11/A1: privacy, sensitive-field policy and authentication/security contracts.
- WS01/A4: canonical accounting output/reconciliation boundary.
- WS00 only if a genuinely shared kernel contract is missing.

A blocker in one dependency does not stop independent statutory evaluator/tests/migration work. Record Dependency Requests and continue.

## Acceptance

Promote capability maturity only with direct source + executable test + migration/permission/correction/reconciliation evidence appropriate to the claimed level. No Hardened claim without exact production evidence.

## Merge/deploy boundary

Non-UI CRITICAL. Commit, test and open PR. **Stop before merge/deploy** until explicit user approval.
