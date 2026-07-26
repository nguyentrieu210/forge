# CloudCRM Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## C1 — Lead capture and assignment
- **Actor:** Integration/Sales User
- **Precondition:** source/assignment rules
- **Happy path:**
  1. Ingest web/social/import/manual lead
  2. Normalize/dedupe
  3. Create lead
  4. Assign owner/SLA
  5. Notify
- **Nhánh lỗi:**
  - duplicate ambiguous
  - invalid consent
  - provider duplicate
- **Transaction/Event:** Ingest idempotent; lead+assignment atomic
- **Oracle:** lead count/source/owner parity

## C2 — Lead qualification and conversion
- **Actor:** Sales User
- **Precondition:** lead active
- **Happy path:**
  1. Activities/tasks
  2. Qualify/disqualify
  3. Resolve contact/org
  4. Convert to deal
  5. Preserve timeline/links
- **Nhánh lỗi:**
  - missing required fields
  - duplicate contact/org
  - conversion retry
- **Transaction/Event:** Conversion atomic
- **Oracle:** one contact/org/deal links parity

## C3 — Deal pipeline to ERP
- **Actor:** Sales User
- **Precondition:** deal/products/mapping
- **Happy path:**
  1. Manage stage/forecast/activity
  2. Close won
  3. Create/link ERP customer/quotation/order
  4. Sync statuses
  5. Reconcile
- **Nhánh lỗi:**
  - stage condition
  - duplicate ERP doc
  - mapping/tax/pricing error
- **Transaction/Event:** Stage+reason atomic; integration idempotent
- **Oracle:** pipeline/forecast/ERP links parity

## C4 — Communication threading
- **Actor:** Sales User/Connector
- **Precondition:** channel connected
- **Happy path:**
  1. Receive/send email/call/message
  2. Deduplicate/provider-map
  3. Thread/link entity
  4. Update activity projection
  5. Retry failures
- **Nhánh lỗi:**
  - provider timeout
  - orphan communication
  - consent/recording
- **Transaction/Event:** Canonical communication + outbox
- **Oracle:** thread/activity counts parity
