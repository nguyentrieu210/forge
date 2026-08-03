# WS06 AUTONOMOUS HANDOFF — HCM + STATUTORY PAYROLL VN

Date: 2026-08-03  
Branch: `agent/ent-06-hcm-payroll`  
PR: `#322`  
Risk: mixed STANDARD + CRITICAL, with statutory payroll/money/migrations classified CRITICAL.

## Executive result

WS06 has moved beyond HRM operational 1.5 into an enterprise HCM domain baseline while preserving the canonical accounting path:

`Salary Structure / Assignment -> Salary Slip -> Payroll Entry -> GL`

No competing payroll, cash, loan, bank or finance ledger was introduced.

## Capability coverage delivered on branch

### Organization / workforce

- Workforce Plan with fixed-point manpower budget.
- Organization Position hierarchy with cycle checks.
- Effective-dated Employee Position Assignment.
- Planned-seat capacity and overlap controls.
- Headcount/workforce reporting metadata.

Primary IDs: `H01-006..008`.

### Recruitment / ATS

- structured Job Opening requirements;
- Candidate Profile pool separated from Job Applicant;
- deterministic skill/experience matching and evidence trace;
- Interview Scorecard;
- explicit Job Offer Response;
- Hiring Completion requires accepted offer and verifies Offer -> Employee -> Contract -> Onboarding lineage;
- Career Posting domain object;
- recruitment funnel/match reporting.

Primary IDs: `H02-001..011`.

Shared dependencies remain for attachment-to-text extraction and anonymous/public career serving.

### Employee lifecycle / personnel compliance

- hire closure and separation/final-settlement closure;
- Employee Discipline;
- Personnel Document with attachment, expiry warning and renewal lineage;
- final settlement requires completed clearance, final Salary Slip covering last working day and no paid/unsettled Employee Advance.

Primary IDs: `H03-001..009`.

ESS is held behind shared privacy/frontend dependencies rather than widening generic Employee reads.

### Time / attendance

- existing leave/shift/check-in/attendance/OT preserved;
- configurable Attendance Geofence;
- shift-level geofence requirement;
- mobile GPS accuracy + haversine radius validation;
- geofence evidence stored with Employee Checkin.

Primary IDs: `H04-001..015`.

### Payroll / benefits / employee finance

- deterministic schema-v1 statutory payroll evaluator;
- typed statutory inputs;
- Salary Structure rule-output mapping;
- fixed/scaled integer calculations and overflow guards;
- rule/effective-date/source/hash/input/output trace;
- Employee Benefit Enrollment feeds canonical Salary Slip;
- Employee Loan schedule + canonical payroll deduction;
- as-of payroll loan-balance replay so future repayments do not mutate historical calculations;
- Employee Loan Repayment references Payment Entry;
- Employee Loan Disbursement proves a loan was actually funded through submitted Payment Entry before loan activation;
- Salary Bank Batch reconciles exactly to canonical Payroll Entry/Salary Slips without creating another ledger.

Primary IDs: `H05-001..017`, `V03-001..010`.

Payslip/ESS portal is a shared frontend/privacy dependency.

### Performance / talent / learning

- Goal/KPI/OKR Objective/Key Result hierarchy;
- Appraisal baseline preserved;
- 360 Review;
- Competency framework and assessment;
- Talent Pool;
- Succession Plan;
- Training Course/curriculum;
- Training Assessment;
- Employee Certificate with validity derived from course policy.

Primary IDs: `H06-001..012` domain layer. LMS portal remains a shared frontend dependency.

## Statutory legal boundary

Canonical source inventory: `docs/hrm/VN_STATUTORY_PAYROLL_SOURCE_LOCK_2026.md`.

The evaluator is deterministic and version/effective-date aware, but WS06 intentionally did **not** promote a stale numeric Vietnam-2026 fixture from legacy PR #269. Official 2026 PIT/BHXH/BHYT/BHTN sources were inventoried, while numeric rates/caps that were not clause-verified remain effective-dated inputs.

This is fail-closed statutory behavior.

## Migration chain introduced on WS06

- `0043_hrm_statutory_payroll_integrity.sql`
- `0044_hrm_workforce_finance_integrity.sql`
- `0045_hrm_lifecycle_closure_integrity.sql`
- `0046_hrm_recruitment_depth_integrity.sql`
- `0047_hrm_organization_position_integrity.sql`
- `0048_hrm_loan_disbursement_integrity.sql`

No earlier migration was rewritten.

## Regression source

Node regression source covers statutory formulas, Salary Slip integration, workforce finance, historical loan replay, loan disbursement, hire/separation closure, recruitment matching/scorecard/offer response, geofence, personnel/talent and organization position capacity.

SQLite regression source covers migrations `0043..0048`.

A Node test also invokes the `0048` SQLite regression so it enters the existing `tests/*.test.mjs` unit-test glob without relying on another `package.json` edit.

## Verification status

- exact connector-level source review: DONE through implementation;
- JSON/migration targeted verification: attempted through downloaded branch snapshot when available;
- full `npm build`, TypeScript compile and full repository regression: **NOT RUN** as authoritative evidence because normal GitHub checkout/CI was unavailable in this connector session;
- production migration/deploy: **NOT RUN**;
- no PASS claim is inferred merely from committed tests.

PR remains Draft until exact checkout validation exists.

## Dependency requests

### DR-WS06-01 -> WS01 Finance
Review final Payroll Entry -> GL reconciliation and accounting-period behavior. WS06 owns Salary Slip input/trace; WS01 owns canonical financial ledger and period guard.

### DR-WS06-02 -> WS11 Security/IAM
Define exact employee owner/share privacy contract before ESS, payslip, 360/competency and personnel-document self-service exposure. Sensitive HCM data must fail closed rather than receive broad Employee read.

### DR-WS06-03 -> WS14 Frontend/Mobile
Provide shared ESS/mobile/org-tree rendering. WS06 owns metadata/domain/API; WS14 owns shared React/mobile runtime.

### DR-WS06-04 -> WS10 Integrations
Provide generic attachment extractor (`PDF/DOCX/image -> text`) for CV ingestion. WS06 already owns deterministic text/profile normalization and matching.

### DR-WS06-05 -> WS11 + WS14
Provide secure anonymous/public Career Posting and application surface with tenant scope, abuse controls and shared public rendering.

### DR-WS06-06 -> WS01 Finance
Define Payment Entry cancellation/reversal ordering when a submitted Payment Entry is referenced by Employee Loan Disbursement. WS06 deliberately does not add finance-owned Payment Entry triggers.

### DR-WS06-07 -> WS08 BI/AI
Optional semantic CV/JD enrichment/ranking. Not blocking: deterministic candidate matching is already the baseline authority.

## Business-policy boundary

Outstanding Employee Loan at separation cannot be assigned one universal behavior from repository evidence alone. A company may require acceleration into final settlement, continued receivable collection, or approved write-off/restructuring.

WS06 therefore does not silently clear or accelerate the balance. This is the remaining genuine business-policy decision for the loan-termination edge case.

## Merge/deploy gate

This branch contains backend, metadata, statutory payroll and migrations. It is **not UI-only**.

Do not merge or deploy until:

1. exact checkout build/regression evidence is available;
2. WS01 reconciliation/correction boundaries are reviewed;
3. WS11 privacy contract is resolved for employee-facing sensitive data;
4. migration numbers are rechecked against exact current main;
5. the employee-loan termination business policy is decided if that edge case is required for the release scope;
6. explicit user approval to merge/deploy is given.
