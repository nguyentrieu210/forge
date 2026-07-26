# Performance SLO & Benchmark Plan

| Path | P95 target |
|---|---:|
| Shell cached TTFB | 150 ms |
| Meta bundle cached | 150 ms |
| Indexed document read | 300 ms |
| Indexed list 50 rows/100k | 400 ms |
| Standard document save | 800 ms |
| Realtime fanout | 500 ms |
| Job acknowledgement | 300 ms |
| Tenant provision | 120 s |

Benchmarks run cold/warm, local/global, small/100k/1M rows, concurrent users, role predicates, read-after-write, large child grids and suite reconciliation. SLO regression blocks rollout.
