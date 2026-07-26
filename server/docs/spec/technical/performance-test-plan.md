# Performance Test Plan

## SLO classes

| Operation | Local/near-primary target | Cross-region target | Dataset |
|---|---:|---:|---|
| App shell cached | P95 250 ms | P95 350 ms | warm edge |
| Indexed list first page | P95 350 ms | P95 500 ms | 1M docs/type |
| Standard save, no ledger | P95 600 ms | P95 1.2 s | ≤20 child rows |
| Financial submit | P95 1.2 s | P95 2.0 s | ≤100 ledger rows |
| Stock submit | P95 1.5 s | P95 2.5 s | serial/batch ≤200 refs |
| Dashboard cached | P95 400 ms | P95 600 ms | 10 cards/charts |

Không dùng một con số “global save 800 ms” cho mọi region và mọi chứng từ.

## Workloads

- 100 concurrent saves cùng document.
- 500 writes/s chia trên 1.000 tenant.
- Hot tenant sustained write until overload/backpressure.
- 1M GL rows, 5M SLE rows, 10M CRM activities.
- 10k tenants route through dispatcher.
- 100k realtime rooms idle/active mix.

## Evidence

Lưu Worker CPU, wall time, D1 rows read/written, served region, primary flag, query plan, queue lag và cost per transaction. SLO chỉ được đánh xanh bằng report benchmark có fixture/version.
