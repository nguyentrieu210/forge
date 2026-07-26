# CloudERP Selling & Buying Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## S1 — Quote-to-cash
- **Actor:** Sales User
- **Precondition:** customer/item/pricing ready
- **Happy path:**
  1. Quotation
  2. Sales Order
  3. Reservation/Delivery
  4. Sales Invoice
  5. Payment/close
- **Nhánh lỗi:**
  - pricing/tax/credit
  - overdelivery
  - stock unavailable
- **Transaction/Event:** Each doc atomic; chain status event-driven
- **Oracle:** qty/billed/delivered/outstanding parity

## B1 — Procure-to-pay
- **Actor:** Purchase User
- **Precondition:** supplier/item/setup ready
- **Happy path:**
  1. Material Request
  2. RFQ and quote comparison
  3. Purchase Order
  4. Receipt
  5. Invoice
  6. Payment
- **Nhánh lỗi:**
  - approval/budget
  - overreceipt/bill
  - quality reject
- **Transaction/Event:** Each doc atomic; status projections
- **Oracle:** ordered/received/billed/payable parity

## B2 — Return and credit/debit
- **Actor:** Sales/Purchase User
- **Precondition:** original submitted doc
- **Happy path:**
  1. Create return against original
  2. Validate quantities/serial/batch
  3. Post reverse stock/GL
  4. Update chain/status/outstanding
- **Nhánh lỗi:**
  - exceed returned qty
  - closed period
  - traceability mismatch
- **Transaction/Event:** Return voucher atomic
- **Oracle:** net qty/value/ledger parity
