# Insights Query Parity Oracle

## Fixture steps
1. Data source sync
2. visual query
3. equivalent SQL
4. chart/workbook/dashboard
5. permission variants
6. refresh/export

## Assertions

- logical plan/result rows
- null/time grouping
- filters/aggregates
- share visibility
- snapshot/cache provenance

## Failure handling

Any unexplained diff blocks the compatibility unit. Store normalized snapshots and raw evidence in R2/artifact storage with source and target version.
