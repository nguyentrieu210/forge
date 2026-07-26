# CloudHR Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## H1 — Hire-to-retire
- **Actor:** HR Manager
- **Precondition:** position/employee setup
- **Happy path:**
  1. Staffing/opening/applicant/interview/offer
  2. Create employee/user
  3. Onboarding activities
  4. Transfer/promotion
  5. Separation/full-final
- **Nhánh lỗi:**
  - duplicate employee
  - open assets/advances/tasks
  - privacy/permission
- **Transaction/Event:** Lifecycle docs atomic; tasks/events async
- **Oracle:** employee status/history/obligations parity

## H2 — Leave allocation-to-payroll
- **Actor:** Employee/Approver
- **Precondition:** policy/allocation
- **Happy path:**
  1. Allocate
  2. Request
  3. Approve
  4. Update balance/calendar
  5. Feed attendance/payroll
- **Nhánh lỗi:**
  - overlap/insufficient balance
  - approver missing
  - cancel after payroll
- **Transaction/Event:** Leave doc atomic; payroll reads versioned facts
- **Oracle:** balance/days/payroll effect parity

## H3 — Check-in-to-attendance
- **Actor:** Employee/HR
- **Precondition:** shift/device rules
- **Happy path:**
  1. Capture check-in events
  2. Match shift
  3. Compute attendance/late/early/overtime
  4. Queue exception
  5. Approve correction
- **Nhánh lỗi:**
  - duplicate/out-of-window/device bad
  - night shift edge
- **Transaction/Event:** Event idempotent; attendance atomic
- **Oracle:** attendance outputs fixture parity

## H4 — Payroll-to-GL
- **Actor:** Payroll Manager
- **Precondition:** structures/tax/attendance complete
- **Happy path:**
  1. Partition employees
  2. Calculate salary slips
  3. Collect exceptions
  4. Reconcile totals
  5. Submit slips/payroll entry
  6. Post GL/payment
- **Nhánh lỗi:**
  - formula/tax/missing attendance
  - partial partition
  - GL mismatch
- **Transaction/Event:** Partition jobs + final atomic postings
- **Oracle:** gross/net/components/tax/GL totals parity

## H5 — Expense/advance settlement
- **Actor:** Employee/Accounts
- **Precondition:** policy/budget
- **Happy path:**
  1. Request advance/travel
  2. Pay advance
  3. Submit claim/receipts
  4. Approve
  5. Settle/pay/return excess
- **Nhánh lỗi:**
  - duplicate receipt
  - over policy
  - currency/advance mismatch
- **Transaction/Event:** Claim/payment docs atomic
- **Oracle:** advance balance/expense/GL parity

## H6 — Performance cycle
- **Actor:** Manager/Employee/HR
- **Precondition:** goals/template/cycle
- **Happy path:**
  1. Set goals/KRAs
  2. Check-ins/feedback
  3. Self/manager appraisal
  4. Calibration
  5. Finalize outcomes
- **Nhánh lỗi:**
  - visibility/self-approval/conflict
- **Transaction/Event:** Versioned appraisal docs
- **Oracle:** scores/status/permissions parity
