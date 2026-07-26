# Procure to Pay Oracle

## Fixture steps
1. Supplier + Item
2. Material Request/RFQ optional
3. Purchase Order
4. partial Purchase Receipt
5. Purchase Invoice
6. Payment Entry
7. debit note/return

## Assertions

- received/billed percentages
- stock valuation
- payable/outstanding
- withholding/advances
- GL balance

## Failure handling

Any unexplained diff blocks the compatibility unit. Store normalized snapshots and raw evidence in R2/artifact storage with source and target version.
