# WS06 — HCM + Statutory Payroll VN

Status: **ACTIVE**  
Owner: **ChatGPT / WS06**  
Branch: `agent/ent-06-hcm-payroll`  
Claimed head: `4097d31865cb0e85d5db3a817b88474372ebb1b7`  
Claim commit: `0a122c97b68089d030a527f117d744f29b36b81c`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before final verification: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not redefine the product baseline.

## Mission

Đưa HRM operational 1.5 lên enterprise HCM depth và xây statutory payroll evaluator Việt Nam deterministic, versioned, source-bound mà không thay canonical `Salary Slip -> Payroll Entry -> GL`.

## Risk

- Statutory payroll / payroll source freeze / employee finance migrations: **CRITICAL**.
- HCM workforce/recruitment/lifecycle/time/talent domain flows: **STANDARD**, trừ khi chạm shared security/finance/public API.
- Không production migration/deploy trong WS06 trước explicit approval.

## Exact baseline audit

- HRM operational 1.5 đã merge qua PR `#261`.
- `VN Payroll Rule` baseline đã có effective dates, source URL, approval, `formula_json`, hash trace và migration `0041` khóa rule đã dùng.
- Baseline chưa thực thi deterministic PIT/BHXH/BHYT/BHTN; chưa có typed statutory inputs/output mapping.
- Baseline thiếu enterprise depth cho headcount/position planning, candidate pool/CV matching, benefits/loan/bank salary, geofence, discipline/personnel-document expiry, OKR/360/competency/talent/succession/course/certificate và full hire/separation closure.

## Legacy PR disposition

### PR #269 — `feat/hrm): complete Wave 1 statutory payroll and self-service`
Disposition: **CHERRY-PICK / SUPERSEDE**.

Lý do:
- branch lịch sử diverged sâu khỏi current main;
- trộn statutory evaluator, attendance closure, hiring/final settlement, ESS/privacy/reporting;
- code/evidence tốt được audit và tái sử dụng có chọn lọc;
- WS06 không merge wholesale branch stale.

Đã tái sử dụng/adapt:
- schema-v1 deterministic payroll evaluator;
- typed statutory inputs;
- Salary Structure `Payroll Rule Output`;
- Salary Slip statutory trace;
- integrity migration concept;
- hire/final-settlement lineage concept.

Đã thay đổi so với legacy:
- offer/contract salary comparison dùng exact fixed-point minor units, không epsilon float;
- 2026 statutory numeric fixture cũ không được promote;
- ESS/privacy không copy wholesale, để đúng WS11/WS14 boundary;
- workforce/benefit/loan/org/talent/recruitment depth được triển khai theo current WS06 contracts.

## Implemented slices

### A. Statutory payroll evaluator — `H05-014`, `H05-015`, `V03-001..010`

Implemented:
- schema-v1 deterministic evaluator, typed `currency/integer/boolean` inputs;
- operations add/sub/min/max/floor-zero, bps multiply, integer multiply, condition/comparison, progressive marginal tiers;
- output dependency/cycle checks, node/depth complexity bounds, safe integer/BigInt overflow guards;
- fixed/scaled integer money semantics;
- Salary Structure maps deterministic rule output to canonical Salary Component;
- Salary Slip traces schema/hash/source/approval/input/output;
- exact Assignment statutory inputs freeze after Salary Slip consumption;
- no competing payroll ledger.

Files:
- `server/packages/clouderp-erpnext/src/hrm-payroll-rule.ts`
- `server/packages/clouderp-erpnext/src/hrm-payroll.ts`
- `server/packages/clouderp-erpnext/src/hrm-policy-controllers.ts`
- `server/migrations/tenant/0043_hrm_statutory_payroll_integrity.sql`

Legal source lock:
- `docs/hrm/VN_STATUTORY_PAYROLL_SOURCE_LOCK_2026.md`
- official 2026 PIT/social-insurance source chain recorded;
- numeric production fixture **NOT PROMOTED** until clause-level rate/cap/category extraction is verified exactly;
- rates/caps remain effective-dated inputs rather than TypeScript constants.

Maturity: **RC implementation / legal numeric fixture promotion pending source verification**.

### B. Workforce/headcount/org chart — `H01-006..008`

Implemented:
- `Workforce Plan` with effective period, line-level branch/department/designation/employment type, planned headcount and fixed-point monthly/period budget;
- one submitted company/fiscal-year workforce plan;
- `Organization Position` hierarchy with cycle guard and `planned_seats`;
- effective-dated `Employee Position Assignment`;
- employee scope match, no overlapping assignment, seat-capacity enforcement;
- DB overlap/capacity/scope-lock guards.

Files:
- `server/packages/clouderp-erpnext/src/hrm-workforce-finance-controllers.ts`
- `server/packages/clouderp-erpnext/src/hrm-organization-controllers.ts`
- `server/migrations/tenant/0047_hrm_organization_position_integrity.sql`

Maturity: **RC domain model**. Specialized org-tree visualization is shared frontend dependency, not domain blocker.

### C. Recruitment / ATS — `H02-001..011`

Implemented domain:
- structured Job Opening requirements and opening-specific match weights;
- reusable `Candidate Profile` pool separate from one `Job Applicant` application;
- deterministic normalized skill/experience match with full trace;
- basic deterministic `resume_text -> profile evidence` extraction/validation;
- Interview Scorecard with unique criteria, 100% weighting and recommendation;
- explicit Job Offer Response Accepted/Rejected within offer window;
- Career Posting domain object with safe slug/publish window;
- Hiring Completion now requires exactly one Accepted Job Offer Response;
- recruitment funnel/match reports;
- DB uniqueness/source-lock for candidate identity, scorecard and offer response.

Files:
- `server/packages/clouderp-erpnext/src/hrm-recruitment-depth-controllers.ts`
- `server/packages/clouderp-erpnext/src/hrm-recruitment-lifecycle.ts`
- `server/migrations/tenant/0046_hrm_recruitment_depth_integrity.sql`

Maturity: **RC domain / Wired end-to-end internal flow**.

Remaining shared dependencies:
- CV attachment/PDF/DOCX -> text extraction connector: WS10;
- public career serving/anonymous application surface: WS11 + WS14;
- AI enrichment optional: WS08, deterministic matching already works without AI.

### D. Employee lifecycle / personnel compliance — `H03-001..010`

Implemented:
- existing Employee/Contract/Onboarding/Transfer/Promotion/Separation kept canonical;
- explicit `Hiring Completion` lineage: Offer -> Employee -> Contract -> Onboarding;
- exact offered-vs-contract salary equality in minor units;
- `Employee Discipline` effective-dated record;
- `Personnel Document` with attachment, expiry warning, status, duplicate guard and explicit renewal lineage via `replaces_document`;
- `Employee Final Settlement`: requires completed clearance + final submitted Salary Slip covering last working day + no paid/unsettled Employee Advances;
- final-settlement source freeze and uniqueness.

Migration:
- `0045_hrm_lifecycle_closure_integrity.sql`

Maturity: **RC domain** except ESS/shared privacy surface.

### E. Time / attendance / geofence — `H04-001..015`

Existing operational leave/shift/checkin/attendance/OT preserved.

Added:
- configurable `Attendance Geofence` company/branch center/radius/max GPS accuracy;
- Shift Type policy `geofence_required/default_geofence`;
- mobile check-in finds effective Shift Assignment;
- GPS accuracy fail-closed;
- haversine radius validation;
- recorded geofence/distance/accuracy/pass evidence.

File:
- `server/packages/clouderp-erpnext/src/hrm-geofence-controllers.ts`

Maturity: **RC backend**. Shared mobile capture UX remains WS14 dependency.

### F. Benefits / employee loan / payroll finance — `H05-009..013`, `H05-016..017`

Implemented:
- effective-dated `Employee Benefit Enrollment`, overlap guard, canonical Salary Component mapping;
- benefits feed Salary Slip before statutory formula and are traced;
- `Employee Loan` fixed-point principal/installment schedule with exact final remainder;
- loan deduction feeds canonical Salary Slip and trace;
- loan balance replay is as-of payroll end date: future repayment/future Salary Slip cannot alter a historical payroll run;
- manual loan repayment references submitted Payment Entry and cannot exceed outstanding;
- `Salary Bank Batch` is a reconciled control artifact over submitted Payroll Entry/Salary Slips + employee bank details;
- bank batch total must exactly equal Payroll Entry total net pay;
- bank batch never creates another payment/GL ledger.

Loan disbursement hardening:
- `Employee Loan Disbursement` references submitted Payment Entry;
- derives exact employee/company/currency/principal from loan;
- validates party/company/currency and exact payment amount when available;
- one submitted disbursement per loan;
- DB migration `0048_hrm_loan_disbursement_integrity.sql` requires disbursement before Loan may become submitted and locks disbursement once Loan is active.

Migration:
- `0044_hrm_workforce_finance_integrity.sql`
- `0048_hrm_loan_disbursement_integrity.sql`

Maturity: **RC HRM side**. Finance Payment Entry cancel/reversal ordering remains WS01-owned shared contract.

### G. Performance / talent / learning — `H06-001..013`

Implemented domain:
- Goal upgraded to `Goal / KPI / OKR Objective / OKR Key Result` with parent-period/employee validation;
- competency master + competency assessment with per-competency scale/evidence;
- 360 review with >=2 reviewers, no self/duplicates, relationship and 0..100 scores;
- Talent Pool with performance/potential/readiness;
- Succession Plan with scoped incumbent/candidates and unique priority;
- Training Course/curriculum master;
- Training Assessment deterministic pass/fail by course threshold;
- Employee Certificate requires submitted passed assessment and derives expiry from course validity;
- reports for competency/training.

File:
- `server/packages/clouderp-erpnext/src/hrm-talent-controllers.ts`

Maturity: **RC domain / Foundation portal UX**. LMS/ESS portal is shared WS14/WS11 dependency.

## Migration sequence owned by WS06 branch

After baseline `0041` and reserved/current WS01 `0042` boundary:

1. `0043_hrm_statutory_payroll_integrity.sql`
2. `0044_hrm_workforce_finance_integrity.sql`
3. `0045_hrm_lifecycle_closure_integrity.sql`
4. `0046_hrm_recruitment_depth_integrity.sql`
5. `0047_hrm_organization_position_integrity.sql`
6. `0048_hrm_loan_disbursement_integrity.sql`

No prior migration is rewritten.

## Regression source committed

Node/source regressions include:
- `hrm-payroll-rule.test.mjs`
- `hrm-statutory-payroll-integration.test.mjs`
- `hrm-workforce-finance.test.mjs`
- `hrm-loan-asof.test.mjs`
- `hrm-loan-disbursement.test.mjs`
- `hrm-lifecycle-closure.test.mjs`
- `hrm-recruitment-depth.test.mjs`
- `hrm-geofence.test.mjs`
- `hrm-personnel-talent.test.mjs`
- `hrm-organization.test.mjs`

SQLite migration regressions include:
- `test-hrm-statutory-payroll-migration.py`
- `test-hrm-workforce-finance-migration.py`
- `test-hrm-lifecycle-closure-migration.py`
- `test-hrm-recruitment-depth-migration.py`
- `test-hrm-organization-position-migration.py`
- `test-hrm-loan-disbursement-migration.py`

`server/package.json` test gate has been extended through the migrations wired at the time of each slice; final static audit must confirm `0048` is also included before review-ready promotion.

## Verification state

- Exact connector code/migration/metadata review: **DONE / ongoing final audit**.
- Full checkout/build/TypeScript/unit tests: **NOT RUN** — environment DNS could not resolve GitHub checkout; per autonomous execution this is recorded, not a blocker to independent work.
- GitHub development CI: **NOT RUN / no PR validation run available under current repo workflow policy**.
- Production migration/deploy: **NOT RUN** and prohibited until explicit approval.
- Do not claim test PASS solely because regression source exists.

## Dependency requests

### DR-WS06-01 — WS01 Finance
- Need: final Payroll Entry -> GL reconciliation and accounting-period guard review for WS06 changes.
- Contract: WS06 owns evaluated Salary Slip inputs/trace; WS01 owns financial ledger/period invariants.
- Blocking: final merge/reconciliation yes; independent HCM implementation no.

### DR-WS06-02 — WS11 Security/IAM
- Need: employee/payroll/personnel owner/share privacy contract before employee self-service/payslip/360/competency personal portal exposure.
- Contract: no broad Employee read of sensitive HR/payroll data merely for UX convenience.
- Blocking: ESS/public personal-data surface only.

### DR-WS06-03 — WS14 Frontend/Mobile
- Need: shared mobile/ESS runtime for check-in capture, payslip/requests/talent portal and specialized org-tree UI.
- Contract: WS06 supplies metadata/domain/API; WS14 owns shared renderer/mobile shell.
- Blocking: specialized UX only; generic metadata routes remain usable.

### DR-WS06-04 — WS10 Integrations
- Need: generic document attachment extractor (`PDF/DOCX/image -> text`) for CV ingestion.
- Why generic: useful outside recruitment and belongs connector/integration layer.
- Contract: WS10 returns extracted text/evidence; WS06 owns Candidate Profile normalization/matching.
- Blocking: CV file auto-parse only. Manual/external `resume_text` + deterministic matching works independently.

### DR-WS06-05 — WS11 + WS14 public career boundary
- Need: anonymous/public Career Posting read + candidate application submission contract with tenant scope, abuse/rate controls and public runtime.
- Contract: WS06 owns Career Posting/Job Applicant domain; WS11 owns public security, WS14 owns shared public rendering.
- Blocking: public career website only; internal ATS works independently.

### DR-WS06-06 — WS01 Payment Entry correction boundary
- Need: define cancellation/reversal ordering when a submitted Payment Entry has been used as Employee Loan Disbursement evidence.
- Contract: WS06 does not add finance-owned Payment Entry triggers or ledger behavior. Finance correction must preserve loan/disbursement reconciliation.
- Blocking: final employee-loan correction DoD; normal disbursement evidence path implemented.

### DR-WS06-07 — WS08 AI optional enrichment
- Need: optional CV/JD semantic enrichment/ranking only after deterministic profile/match evidence and permission boundary.
- Blocking: no. WS06 deterministic matching is authoritative baseline.

## Genuine unresolved business decision

### BR-WS06-01 — Employee loan balance at termination
Repo/source cannot determine one universal policy for an outstanding Employee Loan when an employee leaves.

Possible business policies include:
- accelerate remaining balance into final settlement;
- continue as employee receivable after separation;
- restructure/write off/waive through approved finance process.

WS06 deliberately does **not** silently choose one. Final Settlement records this as an unresolved loan-exit policy and does not auto-clear the balance.

This decision blocks only the employee-loan termination edge-case DoD; it does not invalidate completed payroll/loan/disbursement flows.

## Product surface

HRM app manifest has been expanded through workforce, recruitment, lifecycle, geofence, payroll finance and talent capabilities using generic metadata-driven runtime. Final manifest audit must ensure newly added `Organization Position`, `Employee Position Assignment` and `Employee Loan Disbursement` are exposed before review-ready promotion.

## Final gate before REVIEW

1. audit exact current main and migration-number collisions;
2. verify all new controllers are registered;
3. verify HRM app pack references all non-child DocTypes/nav/reports appropriately;
4. ensure sensitive Employee permissions fail closed until WS11 owner/share contract;
5. wire `0048` migration regression into test gate;
6. update PR #322 body/title to represent full WS06 scope;
7. keep PR Draft while build/test are NOT RUN;
8. no merge/deploy without explicit user approval.
