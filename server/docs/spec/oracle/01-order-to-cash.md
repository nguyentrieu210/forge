# Order to Cash Oracle

## Fixture steps
1. Customer + Item + Price/Tax setup
2. Quotation
3. Sales Order
4. partial Delivery Note
5. partial Sales Invoice
6. Payment Entry
7. return/credit note
8. cancel/repost

## Assertions

- order delivered/billed percentages
- stock quantity/value
- receivable/outstanding
- GL debit=credit
- serial/batch links

## Failure handling

Any unexplained diff blocks the compatibility unit. Store normalized snapshots and raw evidence in R2/artifact storage with source and target version.
