# Payroll to GL Oracle

## Fixture steps
1. Employee + structure assignment
2. attendance/leave/LWP
3. Payroll Entry
4. Salary Slips
5. Journal Entry/payment
6. cancel payroll

## Assertions

- payment days
- component values/tax
- net pay
- payroll liability
- GL/payment ledger reversal

## Failure handling

Any unexplained diff blocks the compatibility unit. Store normalized snapshots and raw evidence in R2/artifact storage with source and target version.
