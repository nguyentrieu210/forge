# Assets, Projects, Quality & Support Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## AS1 — Asset lifecycle
- **Actor:** Asset Manager
- **Precondition:** asset category/accounts ready
- **Happy path:**
  1. Capitalize
  2. Move/use
  3. Schedule/post depreciation
  4. Repair/value adjust
  5. Sell/scrap
- **Nhánh lỗi:**
  - duplicate depreciation
  - closed period
  - invalid location/custody
- **Transaction/Event:** Asset+GL atomic
- **Oracle:** asset register/depreciation/GL parity

## P1 — Project time-to-billing
- **Actor:** Project Manager
- **Precondition:** project/tasks/rates
- **Happy path:**
  1. Plan/assign task
  2. Log/approve timesheet
  3. Accrue cost
  4. Generate invoice
  5. Measure profitability
- **Nhánh lỗi:**
  - unapproved time
  - double billing
  - budget breach
- **Transaction/Event:** Timesheet/invoice independent atomic docs
- **Oracle:** billed hours/cost/revenue parity

## Q1 — Quality gate
- **Actor:** Quality User
- **Precondition:** inspection required by item/process
- **Happy path:**
  1. Create inspection
  2. Record samples/results
  3. Accept/reject
  4. Open corrective action
  5. Gate receipt/delivery/job
- **Nhánh lỗi:**
  - missing result
  - failed sample
  - override without role
- **Transaction/Event:** Inspection audit; downstream action transaction
- **Oracle:** quality status and blocked flow parity

## SUP1 — Issue/SLA/maintenance
- **Actor:** Support User
- **Precondition:** customer/product/contract
- **Happy path:**
  1. Create issue
  2. Assign/SLA timer
  3. Communicate/resolve
  4. Warranty/maintenance if needed
  5. Close with evidence
- **Nhánh lỗi:**
  - SLA breach/escalate
  - invalid warranty
  - missing resolution
- **Transaction/Event:** Events/outbox; business docs atomic
- **Oracle:** SLA/warranty/visit parity
