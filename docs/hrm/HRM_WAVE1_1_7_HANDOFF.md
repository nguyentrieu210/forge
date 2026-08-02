# HRM Wave 1.7 handoff

Ngày cập nhật: 2026-08-03.

## Canonical work

- Repository: `nguyentrieu210/Forge`.
- Branch: `feat/hrm-statutory-payroll-evaluator-20260803-v2`.
- Draft PR: `#269`.
- Target app version: `hrm 1.7.0`.
- Đây là backend/schema/migration work. Chưa merge hoặc deploy production.

## Wave 1 coverage closed on this branch

### Statutory payroll engine

- Deterministic schema-v1 evaluator with typed currency/integer/boolean inputs.
- Supports add/sub/min/max/floor-zero, basis points, integer multipliers, conditions/comparisons and progressive marginal tiers.
- Salary Structure maps explicit payroll-rule outputs into earning/deduction components.
- Salary Slip recomputes authoritative payroll inputs and snapshots rule schema/hash, statutory inputs and outputs in `rule_trace_json`.
- Rule/source effective periods are enforced on Salary Structure and Salary Structure Assignment.
- `0043_hrm_statutory_payroll_integrity.sql` hardens rule storage, typed statutory inputs, exact source freeze and output uniqueness.

### Vietnam 2026 statutory reference

- Fixture `VN-2026-REFERENCE-TEMPLATE` is bundled disabled and requires tenant payroll/legal approval before use.
- Fixture contains 2026 five-tier PIT structure, personal/dependent deductions and employee BHXH/BHYT/BHTN formulas.
- Insurance ceilings stay effective-dated statutory inputs instead of TypeScript constants.
- `hrm-vn-2026-rule.test.mjs` locks known deterministic examples and keeps the fixture disabled by default.

### Attendance from raw time logs

- Attendance can derive first submitted IN and last submitted OUT from Employee Checkin when shift auto-attendance is enabled or source is Checkin.
- Attendance stores exact `checkin_refs_json` source lineage.
- Consumed raw check-ins are immutable through `0044_hrm_wave1_closure.sql`.
- Manual and correction paths remain available.

### Recruitment-to-hire closure

- Added `Hiring Completion` transaction.
- Validates Job Offer -> Employee -> Employment Contract -> Employee Onboarding scope, joining date and offered salary/currency lineage.
- One Employee record represents one employment cycle; a rehire uses a new Employee record.
- `0046_hrm_hiring_cycle_integrity.sql` is the final DB invariant: one submitted closure per Job Offer and per Employee record.

### Separation-to-final-settlement closure

- Added `Employee Final Settlement` transaction.
- Requires submitted separation, completed clearance, final submitted Salary Slip covering last working day and zero paid-but-unsettled advances.
- Unsettled advances are preserved as per-document/per-currency evidence instead of an invalid cross-currency sum.
- Final settlement is unique per Employee Separation.

### Employee self-service and privacy

- Added generic `hr-self-service` screen for own leave, attendance adjustments, overtime, advances, goals, appraisals and check-ins.
- Employee-created request doctypes use owner-scoped read/write; create remains available.
- Employee Advance separates requested amount from payment/settlement accounting fields by permlevel.
- Appraisal separates employee self-score editing from manager/final results.
- Employee, Employment Contract, Attendance and Appraisal no longer grant broad Employee reads.
- `0045_hrm_employee_self_service_shares.sql` creates exact read-only shares for Employee profile and submitted employee-facing documents and backfills existing history.
- Salary Slip submitted documents are exact-shared read-only to linked `Employee.user_id`.
- `0047_hrm_payslip_self_service_permission.sql` adds only owner-scoped Employee read to Salary Slip so an employee with no slip sees an empty list instead of a permission error; exact shares expose only their own slips.

### Reporting

HRM app metadata now includes reports for:

- recruitment pipeline;
- leave usage;
- attendance status;
- overtime by employee;
- advances by employee.

Existing canonical payroll register remains the payroll aggregate source instead of adding a competing report/ledger.

## New/updated verification

New tests include:

- `tests/hrm-payroll-rule.test.mjs`
- `tests/hrm-statutory-payroll-integration.test.mjs`
- `tests/hrm-vn-2026-rule.test.mjs`
- `tests/hrm-wave1-closure.test.mjs`
- `tests/hrm-wave1-metadata.test.mjs`
- `scripts/test-hrm-statutory-payroll-migration.py`
- `scripts/test-hrm-wave1-closure-migration.py`
- `scripts/test-hrm-hiring-cycle-migration.py`
- `scripts/test-hrm-payslip-self-service-migration.py`

The SQL regressions above are wired into `npm test -> test:sql`; Node tests are picked up by `tests/*.test.mjs`.

Targeted SQLite checks completed in the connector session:

- 0044 consumed check-in guards and exact Salary Slip share behavior: PASS.
- 0045 historical self-service share backfill: PASS.
- 0047 owner-scoped Salary Slip metadata patch and rerun idempotency: PASS.

## Release boundary

Functional Wave 1 scope is closed on the branch, but release evidence is not yet complete because this session cannot obtain a full repository checkout/dependency tree from GitHub DNS. Before merge/deploy, run normal repository gates on an exact checkout:

1. `npm test`
2. `npm run app:check`
3. relevant TypeScript/build checks
4. exact migration replay through 0047
5. review/approve the disabled Vietnam 2026 statutory fixture for the target tenant before activating a production payroll rule

Keep PR `#269` Draft until these gates have concrete evidence. No production migration, merge or deploy has been performed in this work.
