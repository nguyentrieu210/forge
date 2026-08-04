# RC4-A5 — HCM / Vietnam Statutory Payroll Evidence

Status: **READY WITH EXPLICIT RESIDUAL BLOCKERS — DO NOT MERGE**  
Risk: **CRITICAL**  
Owner: **WS06**  
Execution topology: **SINGLE**  
Branch: `agent/rc4-05-hcm-payroll-statutory`  
Seed / merge-base: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`

## 1. Scope decision after exact-state reread

RC4-A5 is a residual release-confidence pass, not a WS06 rewrite.

Canonical WS06 implementation already converged through merged PR `#414` (`6d288971d1e9454df2eb9098929ce2c82b0d7828`) with current tenant migrations `0099..0104`. Historical PRs `#322` and `#372` are superseded evidence only and their old migration numbering must not be revived.

A5 therefore limits changes to statutory source-lock evidence, deterministic regressions, stale-test repair, correction/reversal evidence and Finance reconciliation evidence. No payroll ledger, GL authority, auth/privacy authority or production configuration is forked.

## 2. Canonical implementation audited

### Deterministic statutory evaluator

Canonical source: `server/packages/clouderp-erpnext/src/hrm-payroll-rule.ts`.

Observed invariants:

- explicit formula `schema_version: 1`;
- exact currency match against runtime context;
- typed `currency/integer/boolean` statutory inputs;
- fixed/scaled integer arithmetic with safe-integer/BigInt guards;
- deterministic half-up ratio rounding;
- progressive marginal tiers with monotonic boundaries;
- dependency-cycle, depth and node-count bounds;
- formula output type validation before Salary Structure mapping.

### Salary Slip statutory trace

Canonical source: `server/packages/clouderp-erpnext/src/hrm-payroll.ts`.

Observed trace/source evidence includes:

- effective Salary Structure Assignment, Salary Structure and Payroll Period versions;
- payroll-rule name/code/effective dates;
- official legal-document number and source URL;
- approval actor/time;
- formula schema version and SHA-256;
- exact typed statutory inputs and evaluated outputs;
- Attendance, Additional Salary, benefit and Employee Loan source evidence;
- authoritative source snapshot SHA-256 (`input_hash`).

Runtime currency precision is resolved from the canonical Currency master and passed explicitly to the evaluator; Salary Slip normalization persists canonical `currency` and `currency_scale`.

### Source freeze

Canonical migrations: `0041_hrm_payroll_rule_integrity.sql` + `0099_hrm_statutory_payroll_integrity.sql`.

Observed correction contract:

- a legal payroll rule referenced by an approved structure/assignment or a submitted/cancelled Salary Slip is immutable; legal correction requires a new effective-dated rule version;
- statutory assignment input rows are frozen while a submitted Salary Slip consumes that exact assignment;
- after Salary Slip cancellation the input-row freeze can be released for correction/rerun, while the historical rule itself remains immutable;
- rule-output mapping cannot duplicate one statutory output into multiple Salary Structure component rows.

This is consistent with `cancel -> correct authoritative source -> recompute/rerun`, not historical mutation of an already-used legal rule.

## 3. PIT 2026 official source lock added

A5 re-read primary government sources and found one material omission in the previous source inventory: `110/2025/UBTVQH15`, effective 2026-01-01, which sets the 2026 family deductions.

The branch now adds an executable **regression-only, not production-seed** fixture:

- `server/tests/fixtures/vn-pit-resident-wages-2026.json`
- `server/tests/hrm-vn-pit-2026-source-lock.test.mjs`

Official source chain encoded in the fixture:

1. `109/2025/QH15` — resident employment-income taxable base and five progressive monthly bands;
2. `110/2025/UBTVQH15` — taxpayer/dependent family deductions for tax year 2026;
3. `09/2026/QH16` — reviewed amendment; Article 1 changes Article 7 business-income threshold and does not replace Articles 8-10 resident wage PIT parameters.

Regression parameters locked from those primary sources:

- taxpayer family deduction: `15,500,000 VND/month`;
- dependent deduction: `6,200,000 VND/month/dependent`;
- progressive taxable-income bands: `5% / 10% / 20% / 30% / 35%` at `10m / 30m / 60m / 100m / above 100m` boundaries.

The fixture uses `VND` with `currency_scale = 0` and includes boundary/cumulative vectors. Mandatory insurance and other lawful deductions remain typed runtime inputs rather than invented rates.

### Promotion boundary

This fixture is evidence for `H05-014 PIT engine integration`; it is **not** an enabled production `VN Payroll Rule` seed. Production activation still requires approved effective configuration.

## 4. BHXH/BHYT/BHTN remains fail-closed

`H05-015` and `V03-001..005` are not promoted by A5.

The repo has official source identities for Social Insurance Law `41/2024/QH15`, Health Insurance amendment `51/2024/QH15`, Employment Law `74/2025/QH15` and implementing decrees, but A5 did not find a complete clause-locked matrix that simultaneously proves:

- employee/employer rate;
- contribution base;
- ceiling/floor;
- worker/category applicability;
- effective/transition dates.

A5 therefore does **not** hard-code or seed BHXH/BHYT/BHTN numeric production values. This is a deliberate legal-safety boundary.

### Dependency Request — DR-RC4-A5-LEGAL-01

Need: clause-level 2026 social/health/unemployment-insurance parameter matrix from official primary text, including category and transition semantics.

Blocking: promotion of `H05-015` / `V03-001..005`; not blocking PIT evaluator regression or existing generic typed statutory-input engine.

## 5. Correction / reversal / reconciliation evidence

Canonical Finance boundary remains unchanged:

`Salary Slip -> canonical GL + Employee Payment Ledger`  
`Payroll Entry -> reconciled control aggregate over submitted Salary Slips`

`SalarySlipController` already:

- posts earnings as GL debits;
- posts deductions as GL credits;
- posts net pay to payroll payable with Employee party;
- creates Employee payable Payment Ledger evidence;
- on cancel uses canonical `reverseGl` and `reversePayment` rather than mutating historical entries.

`PayrollEntryController` already:

- accepts submitted Salary Slips only;
- validates company/payroll-period containment;
- totals exact `net_pay_minor` using canonical currency precision;
- does not create a second payroll GL.

A5 adds `server/tests/hrm-payroll-correction-reconciliation.test.mjs` covering:

- exact submit/cancel GL reversal line-for-line;
- exact Payment Ledger sign reversal and Salary Slip voucher lineage;
- Payroll Entry total equals sum of submitted Salary Slip `net_pay_minor`;
- cancelled Salary Slip rejection;
- tenant-scoped source lookup.

This closes source-level evidence without editing WS01 ledger authority.

## 6. Stale regression repaired

`server/tests/hrm-operational.test.mjs` still contained a pre-schema-v1 mock `formula_json: {"version":1}` in two Salary Slip tests. The canonical evaluator now correctly requires `schema_version`, currency and outputs, so the stale fixture would fail before exercising the intended recompute assertions.

A5 updates only the test fixture to a valid schema-v1 USD no-op formula. Production validation was not weakened.

The existing operational regression continues to assert that `HrmSalarySlipController` recomputes authoritative generated inputs instead of trusting stale draft earnings/input hashes.

## 7. Permission / privacy boundary

`VN Payroll Rule` metadata currently grants:

- `Payroll User`: read/report only;
- `Payroll Manager`: read/write/create/report/export;
- `Accounts Manager`: read/report only;
- `System Manager`: read/write/create/report/export.

A5 does not broaden employee access to payroll/statutory/personnel data.

### Dependency Request — DR-RC4-A5-WS11-01

Need: WS11 owner/share/sensitive-field privacy contract before any employee self-service exposure of Salary Slip, statutory input, personnel or related payroll-sensitive fields.

Blocking: ESS/private employee surface and privacy maturity; not blocking payroll-manager internal statutory evaluation.

## 8. Finance dependency boundary

A5 did not modify WS01 posting-period, Payment Entry or GL authority. The new reconciliation regression exercises the existing canonical contract only.

### Dependency Request — DR-RC4-A5-WS01-01

Need: WS01 owner review for any future Payment Entry cancellation ordering where the same payment is evidence for Employee Loan disbursement/repayment.

Blocking: employee-loan payment-correction edge-case DoD; not blocking Salary Slip statutory evaluator or Salary Slip GL reversal evidence.

## 9. Verification state

### Exact static evidence completed

- exact branch is based on current `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33` with no behind drift at the last pre-PR compare;
- canonical evaluator, Salary Slip, Payroll Entry, ledger reversal, migrations, permissions and package test gate audited;
- official-source URLs and effective legal documents re-read for the PIT fixture;
- stale operational fixture repaired instead of weakening production validation;
- new regressions are included by the existing `node --test tests/*.test.mjs` wildcard.

### Execution evidence not claimed

Full Node/TypeScript/SQLite execution is **NOT RUN in this session** because the available execution environment cannot resolve/check out GitHub and the repository intentionally does not use GitHub Actions as development CI. Authored regression source is not reported as PASS merely because it exists.

No temporary CI/deploy workflow was added to manufacture a green badge.

## 10. Maturity decision

- `H05-014 PIT engine integration`: stronger RC candidate evidence for the resident-wage 2026 core because source-locked executable vectors now exist; no Hardened claim and no production-rule activation claim.
- `H05-015 BHXH engine integration`: no promotion; legal numeric matrix remains unresolved.
- `H05-016 Payroll GL posting`: existing canonical source plus explicit reversal/reconciliation regression evidence strengthened; no new ledger authority.
- `V03-001..005`: no promotion until clause-locked insurance basis/rate/cap/category evidence exists.

Do not rewrite the global capability-status baseline from this branch before convergence/acceptance.

## 11. Merge/deploy boundary

This branch is **non-UI CRITICAL**.

- Open PR: allowed after evidence capture.
- Merge: **STOP — requires explicit user approval**.
- Production deploy/migration/rule activation: **STOP — not authorized**.
- No customer data, production payroll rule, DNS, secret or provider state is mutated by A5.
