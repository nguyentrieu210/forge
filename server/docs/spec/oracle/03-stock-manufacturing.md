# Stock & Manufacturing Oracle

## Fixture steps
1. BOM
2. Production Plan
3. Work Order
4. Material Transfer
5. Job Cards
6. Manufacture Stock Entry
7. backdated Stock Reconciliation
8. repost

## Assertions

- raw/WIP/finished stock
- process loss/scrap
- valuation layers
- work order progress
- stock GL

## Failure handling

Any unexplained diff blocks the compatibility unit. Store normalized snapshots and raw evidence in R2/artifact storage with source and target version.
