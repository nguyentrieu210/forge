# WS06 — HCM + Statutory Payroll VN

Status: **READY**  
Owner: **—**  
Branch: `agent/ent-06-hcm-payroll`  
Base: `b15378be7c036204f92a6e4c289038aa84d6f286`

## Mission

Đưa HRM operational 1.5 lên full HCM và xây statutory payroll evaluator Việt Nam theo legal-rule engine deterministic, versioned, source-bound.

## Capability families

HCM/recruitment/time/payroll/performance/training + `V03`.

## Own

organization/headcount, recruitment depth, employee lifecycle, leave/shift/attendance/OT, payroll input/run, benefits/loan/advance/expense, KPI/OKR/appraisal/training/ESS, PIT/BHXH/BHYT/BHTN evaluator contracts và payroll accounting integration phía payroll.

## Critical guard

Không thay canonical Salary Slip -> Payroll Entry -> GL bằng ledger khác. Rule pháp lý phải effective-dated/versioned/immutable sau dùng, fixed-point và có official-source evidence.

## Phase A audit

Bắt đầu từ evidence HRM 1.5 hiện tại; không tin Feature Matrix cũ ghi Missing. Audit gaps: headcount, career portal/CV parsing, roster/geofence, benefits/loans, statutory PIT/BHXH execution, bank salary, ESS/mobile, OKR/360/competency/LMS.

## Phase B priority

Statutory evaluator contract -> payroll/accounting reconciliation -> workforce/time gaps -> ESS -> performance/talent depth.

## Dependencies

WS01 accounting/statutory financial side, WS11 security/employee privacy, WS14 mobile/ESS runtime, WS00 kernel contracts.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability IDs, legal formulas/schema/source, migration replay, payroll regression, GL reconciliation, blockers, PR.