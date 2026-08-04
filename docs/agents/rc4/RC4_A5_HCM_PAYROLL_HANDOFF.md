# RC4-A5 — HCM / Vietnam Statutory Payroll Residual

Status: **READY — PR #604 DRAFT / DO NOT MERGE**
Branch: `agent/rc4-05-hcm-payroll-statutory`
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **CRITICAL**
Owner stream: **WS06**
PR: `#604`
Canonical evidence: `docs/agents/rc4/RC4_A5_HCM_PAYROLL_EVIDENCE.md`

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

## Exact-state correction

Canonical WS06 implementation is already merged through PR `#414`. RC4-A5 is a residual evidence/closure pass only; it must not replay historical WS06 branches or old migration numbering.

## Completed in A5

1. Added source-locked resident-wage PIT 2026 regression fixture and vectors using official primary sources.
2. Added missing `110/2025/UBTVQH15` to the source-lock chain.
3. Kept PIT production activation separate from regression evidence; no production rule seed added.
4. Kept BHXH/BHYT/BHTN fail-closed pending clause-level rate/base/cap/category/transition evidence.
5. Added Salary Slip submit/cancel GL + Payment Ledger reversal regression.
6. Added Payroll Entry submitted-slip net-pay reconciliation, cancelled-slip rejection and tenant-scope regression.
7. Repaired stale pre-schema-v1 operational test fixture without weakening the evaluator.
8. Audited VN Payroll Rule permissions and preserved WS11 privacy boundary.
9. Recorded residual legal/WS11/WS01 Dependency Requests in the A5 evidence file.

## Primary scope

1. Effective-dated/versioned VN payroll statutory evaluator for PIT/BHXH/BHYT/BHTN using official-source-bound rule evidence.
2. Explicit formula schema, fixed-point/rounding semantics, effective-date selection and deterministic test vectors.
3. Payroll correction/reversal/rerun behavior and source freeze after authoritative use.
4. Permission/tenant isolation for salary, statutory inputs and sensitive payroll fields.
5. Reconciliation/output contract to canonical Finance/GL authority; do not create a shadow payroll ledger or GL.
6. Exact focused regression and migration replay for every changed statutory/migration path.

## Forbidden / avoid

- Do not rewrite HRM operational flows already merged unless a concrete RC3/RC4 gap requires it.
- Do not invent legal rates or source claims; use source-locked evidence already in repo or record a Dependency Request.
- Do not write directly to Finance ledgers outside canonical controller/kernel paths.
- Do not edit WS11 auth/privacy or WS01 ledger hotspots to bypass dependencies.

## Residual dependencies

### DR-RC4-A5-LEGAL-01
Need clause-level 2026 BHXH/BHYT/BHTN rate + contribution base + ceiling/floor + worker/category + transition matrix from official primary text.

Blocking: `H05-015` and `V03-001..005` promotion only.

### DR-RC4-A5-WS11-01
Need owner/share/sensitive-field privacy contract before employee self-service exposure of payroll/statutory/personnel data.

Blocking: ESS/private employee surface only.

### DR-RC4-A5-WS01-01
Need Finance owner contract for Payment Entry cancellation ordering when a payment is Employee Loan disbursement/repayment evidence.

Blocking: employee-loan correction edge case only.

A blocker in one dependency does not invalidate the independent A5 PIT/reversal/reconciliation evidence.

## Verification state

- Exact source/static audit: **DONE**.
- New executable regression source: **AUTHORED**.
- Full Node/TypeScript/SQLite execution in this session: **NOT RUN** because the available execution environment cannot check out GitHub; do not report authored tests as PASS.
- Production migration/deploy/rule activation: **NOT RUN / NOT AUTHORIZED**.

## Acceptance

Promote capability maturity only with direct source + executable test + migration/permission/correction/reconciliation evidence appropriate to the claimed level. No Hardened claim without exact production evidence.

## Merge/deploy boundary

Non-UI CRITICAL. PR `#604` is intentionally **Draft**. **Stop before merge/deploy** until explicit user approval.
