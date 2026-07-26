# CRM to ERP Oracle

## Fixture steps
1. Lead capture
2. qualification
3. Deal stages
4. communication
5. won conversion
6. Customer/Quotation creation
7. sync conflict/retry

## Assertions

- no duplicate ERP entity
- stage/activity audit
- external IDs
- compensation on failure

## Failure handling

Any unexplained diff blocks the compatibility unit. Store normalized snapshots and raw evidence in R2/artifact storage with source and target version.
