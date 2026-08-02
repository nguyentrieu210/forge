# WS06 — HCM + Statutory Payroll VN

Status: **ACTIVE**  
Owner: **ChatGPT / WS06**  
Branch: `agent/ent-06-hcm-payroll`  
Claimed head: `4097d31865cb0e85d5db3a817b88474372ebb1b7`  
Claim commit: `0a122c97b68089d030a527f117d744f29b36b81c`  
Current main checked: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

Claim note: current `main` is 18 commits ahead of the seed baseline, but the compared drift is docs/deploy-workflow evidence plus an Alumdoor UI hotfix outside WS06 ownership. WS06 therefore keeps the Forge 0.2.0 product baseline and consumes current-main coordination/legacy-PR evidence without importing unrelated source changes.

## Mission

Đưa HRM operational 1.5 lên full HCM và xây statutory payroll evaluator Việt Nam theo legal-rule engine deterministic, versioned, source-bound.

## Capability families

HCM/recruitment/time/payroll/performance/training + `V03`.

## Own

organization/headcount, recruitment depth, employee lifecycle, leave/shift/attendance/OT, payroll input/run, benefits/loan/advance/expense, KPI/OKR/appraisal/training/ESS, PIT/BHXH/BHYT/BHTN evaluator contracts và payroll accounting integration phía payroll.

## Critical guard

Không thay canonical Salary Slip -> Payroll Entry -> GL bằng ledger khác. Rule pháp lý phải effective-dated/versioned/immutable sau dùng, fixed-point và có official-source evidence.

## Phase A audit — exact Forge 0.2.0 evidence

Risk: **CRITICAL** vì statutory payroll + money + migration + payroll/accounting integration.

### Baseline evidence

- HRM operational 1.5 đã merge qua PR `#261`; canonical payroll path hiện là `SalarySlipController -> PayrollEntryController -> GL`.
- `VN Payroll Rule` hiện có effective dates, legal document/source URL, approval metadata và `formula_json`; Salary Slip trace lưu hash/evidence, migration `0041` khóa rule sau khi dùng.
- `server/packages/clouderp-erpnext/src/hrm-payroll.ts` hiện chỉ parse/hash `formula_json`; chưa thực thi PIT/BHXH/BHYT/BHTN deterministic.
- Salary Structure hiện chỉ hỗ trợ `Fixed` và `Percent of Base`; Assignment chưa có typed statutory inputs.
- Search exact code không tìm thấy implementation evidence ngoài target docs cho headcount/manpower planning, career portal/CV parser/candidate matching, benefits/employee loan/bank salary transfer, OKR/360/competency/succession/LMS và geofence/mobile attendance.

### Capability maturity snapshot

| Capability | Current | Evidence / gap |
|---|---|---|
| `H01-001..005` organization masters | Wired | Company/Branch/Department/Designation/Employment Type có metadata/nav hiện hành. |
| `H01-006..008` org chart/headcount/manpower budget | Missing | Không có implementation evidence trong exact code search. |
| `H02-001,003,007,009` recruitment core | Wired | Job Opening/Applicant/Interview/Job Offer có trong HRM 1.5. |
| `H02-002,004..006,008,010..011` recruitment depth | Missing/Foundation | Không có career portal/candidate pool/CV parser/matching/funnel implementation evidence; scorecard/acceptance cần audit sâu khi mở slice tuyển dụng. |
| `H03-001..005,009` lifecycle core | Wired/RC | Employee/Contract/Onboarding/Transfer/Promotion/Separation đã nằm trong operational 1.5. |
| `H03-006..008,010` discipline/personnel docs/ESS | Missing/Foundation | Chưa có full evidence; legacy #269 có ESS/privacy work nhưng chưa canonical. |
| `H04-001..009,011..015` leave/shift/checkin/attendance/OT | Wired/RC | HRM 1.5 đã có operational flow và payroll input freeze. |
| `H04-010` geofence/mobile checkin | Missing | Không có implementation evidence ngoài capability target. |
| `H05-001..008,011..013,016` payroll core | RC | Salary structure/assignment/period/slip/entry, Additional Salary, advance/travel/expense touchpoints và GL canonical path đã có. |
| `H05-009..010` benefits/employee loan | Missing | Không có implementation evidence trong exact code search. |
| `H05-014..015` PIT/BHXH engine integration | Foundation | Rule evidence/effective date/hash có, nhưng chưa có deterministic evaluator. |
| `H05-017..018` bank salary/payslip portal | Missing/Foundation | Bank salary chưa có evidence; payslip exact-share/ESS tồn tại trong legacy #269 nhưng chưa canonical. |
| `H06-001,004,009` goal/appraisal/training core | Wired | Goal/Appraisal/Training Event có trong HRM 1.5. |
| `H06-002..003,005..008,010..013` KPI/OKR/360/competency/talent/LMS | Missing/Foundation | Không có full enterprise-depth implementation evidence. |
| `V03-001..005` contribution basis/rates/caps | Foundation | Có thể lưu dưới opaque `formula_json`, chưa executable/schema-validated. |
| `V03-007` rule selection by effective date | Foundation/Wired | Payroll hiện validate rule covers payroll period. |
| `V03-008` versioned formula schema | Foundation | JSON được hash/audit nhưng schema evaluator chưa canonical. |
| `V03-009` official legal source evidence | Foundation | Có legal document/source fields; cần source-lock chất lượng và version-specific evidence. |
| `V03-010` statutory regression fixtures | Missing | Chưa có canonical evaluator regression theo legal version. |

### Legacy PR disposition

- PR `#269` / `feat/hrm-statutory-payroll-evaluator-20260803-v2`: **CHERRY-PICK**. Lý do: evaluator/schema/migration/test có giá trị, nhưng branch hiện `136` commits behind current main và PR trộn statutory payroll với attendance closure, hiring/final settlement, ESS/privacy/reporting. Không reuse/merge nguyên branch stale.
- Slice tái sử dụng từ `#269`: deterministic schema-v1 evaluator, typed Assignment inputs, Salary Structure `Payroll Rule Output`, Salary Slip rule trace, migration integrity `0043`, statutory regression. Không kéo các migration `0044..0047`/ESS/hiring closure vào statutory slice.
- PR `#286` TT99/localization: **AUDIT AS DEPENDENCY / WS01 OWNER**. WS06 chỉ review touchpoint PIT/payroll; không nhận canonical ownership finance.

## Target statutory contract — Slice 1

User outcome: Payroll Manager cấu hình một legal rule đã phê duyệt, gán effective period + typed inputs cho nhân viên; Salary Slip deterministic tạo các statutory deductions/earnings và lưu trace đủ để audit/replay.

Authoritative data:

1. `VN Payroll Rule`: immutable-after-use rule identity, effective range, approval, source evidence, formula schema.
2. `Salary Structure Assignment`: typed effective-dated statutory input values; không chứa executable expression.
3. `Salary Structure Component`: mapping một output key của rule sang canonical Salary Component/account/cost center.
4. `Salary Slip`: authoritative evaluated output snapshot + input/hash trace; accounting vẫn đi Payroll Entry -> GL.

Invariants:

- currency calculation dùng scaled integer/fixed-point semantics; không dùng binary float authoritative;
- rule phải cover toàn kỳ lương và không disabled;
- schema/version/currency/output keys được validate trước evaluation;
- cycle/complexity/overflow fail closed;
- statutory output mapping không duplicate để tránh double-count;
- consumed rule + exact statutory assignment inputs immutable sau submitted Salary Slip, correction qua cancel/amend/rerun;
- source/legal metadata + canonical formula hash + inputs + outputs được snapshot vào rule trace;
- không tạo payroll ledger cạnh tranh.

Acceptance evidence:

- evaluator unit regression: valid arithmetic, progressive tiers, type mismatch, unknown key, cycles, complexity, overflow, rounding;
- integration: Salary Structure -> Assignment -> Salary Slip statutory components -> Payroll Entry/GL unchanged;
- migration replay through `0041 + reserved 0042 + new 0043` with tenant isolation/immutability/duplicate-output guards;
- statutory legal-version fixtures are disabled/reference-only until tenant legal/payroll approval;
- payroll-to-GL reconciliation before merge.

## Phase B priority

1. Statutory evaluator contract + integration (`H05-014`, `H05-015`, `V03-001..010`).
2. Payroll/accounting reconciliation + bank salary (`H05-016..017`).
3. Workforce/headcount + time/geofence gaps.
4. ESS/payslip portal with WS11/WS14 boundaries.
5. Performance/talent depth.

## Dependencies

WS01 accounting/statutory financial side, WS11 security/employee privacy, WS14 mobile/ESS runtime, WS00 kernel contracts.

### Dependency request DR-WS06-01
- Target stream: WS01
- Need: preserve migration ordering around reserved `0042_vn_accounting_period_hardening.sql` and review Payroll Entry/GL reconciliation + accounting-period guard touchpoint.
- Why generic: payroll posting lands in canonical finance ledger/period controls owned by WS01.
- Contract proposed: WS06 owns evaluated payroll inputs/Salary Slip trace; WS01 owns ledger/period invariant.
- Blocking: evaluator implementation no; final merge/reconciliation yes.
- Temporary workaround: none.

### Dependency request DR-WS06-02
- Target stream: WS11
- Need: review employee/payroll privacy and exact-share contract before ESS/payslip expansion.
- Why generic: permission/privacy is shared security ownership.
- Blocking: no for statutory evaluator; yes for later ESS slice.
- Temporary workaround: preserve current server-side permission boundary.

### Dependency request DR-WS06-03
- Target stream: WS14
- Need: mobile/ESS runtime contract when employee self-service UI slice starts.
- Why generic: shared React/mobile runtime belongs WS14.
- Blocking: no for statutory evaluator.
- Temporary workaround: metadata-only domain changes; no shared runtime edits.

## Handoff checklist

Cuối nhánh ghi capability IDs, legal formulas/schema/source, migration replay, payroll regression, GL reconciliation, legacy PR disposition, blockers, PR/head SHA. Backend/schema/business-rule changes chỉ mở PR; không merge/deploy trước explicit approval.
