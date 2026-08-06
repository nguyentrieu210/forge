# E2E-07 — HR / Payroll

## Persona
HR User / C&B or personnel operator, non-admin.

## Business job
Progress a representative employee-to-time-to-payroll flow through the HR & Payroll workspace and verify authoritative employee/time/payroll readback under correct permissions.

## Preconditions
Company/department, Employee, employment/contract state, HR persona and the exact time/payroll prerequisites required by the active package are `READY`. When payroll is in scope, salary structure/assignment, payroll period and applicable statutory configuration must be present and version-valid.

## Operator steps
1. Complete E2E-00 as HR User.
2. Open `Nhân sự & tiền lương`.
3. Locate/create the representative employee record according to scope.
4. Verify employment/contract context.
5. Record or inspect the representative attendance/leave/time input used by payroll.
6. Enter any supported advance/additional salary adjustment required by the fixture.
7. Run/create the representative payroll/slip action where current scope supports it.
8. Reopen Employee/time/payroll records.
9. Verify values, lifecycle and permission scope.
10. Verify payroll/history/report surface where available.

## Required negative variants
- unauthorized role cannot view/modify restricted payroll data;
- invalid period/missing salary authority fails clearly;
- retry does not duplicate payroll/payment authority;
- invalid statutory/config version fails closed when relevant.

## PASS
Representative HR/time/payroll state can be completed and read back through the supported UI, sensitive permissions hold, calculations/lifecycle match the declared deterministic authority, and no unexplained browser/network/red errors occur.

## FAIL examples
Workspace renders but required transaction routes are dead, employee can be selected only as admin, payroll shows raw configuration errors after READY, sensitive payroll leaks across role scope, duplicate payroll on retry.

## Exit condition
At least one declared HR/payroll operator job is proven end-to-end for the active Alumdoor scope; unsupported long-term HCM capabilities are not falsely counted as PASS.
