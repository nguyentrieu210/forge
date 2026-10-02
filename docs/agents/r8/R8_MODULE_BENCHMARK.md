# R8-A — ERPNext Module Benchmark

Status: module denominator resolved to conservative dispositions

The canonical denominator remains the existing **109 ERPNext artifacts**. R8 does not replace it.

Each of the 11 module rows now has a whole-module disposition. A module is `PARTIAL` when Forge has meaningful current transaction behavior but at least one important ERPNext artifact/depth dimension is absent or unproven.

| Module | Artifacts | R8 disposition | Decisive open depth |
|---|---:|---|---|
| Accounting | 18 | PARTIAL | close/retained earnings, period FX revaluation, budget actuals, consolidation |
| Selling | 13 | PARTIAL | credit hold, fully-paid refund/customer credit, current 115-fixture replay |
| Buying | 11 | PARTIAL | landed cost, subcontracting, split-price row identity |
| Stock | 16 | PARTIAL | landed cost/repost-to-Finance, full ATP/WMS task, LIFO/policy differences |
| Manufacturing | 10 | PARTIAL | phantom/substitute/alternate BOM, full MRP netting, posted operation cost/rework/subcontract |
| Assets | 8 | PARTIAL | capitalization/finance books/schedules/value adjustment |
| Projects | 8 | PARTIAL | authoritative Finance/procurement/inventory integration, EVM/retention |
| Quality | 7 | PARTIAL | full ERPNext governance denominator + supplier-quality/runtime differential |
| Support | 6 | PARTIAL | durable SLA, channels/portal, row scope, service finance/parts automation |
| Commerce/POS | 8 | PARTIAL | recurring invoice scheduler, Auto Repeat, website/product-bundle runtime breadth |
| Regional | 4 | PARTIAL | provider/legal certification/filing + ERPNext multi-country mapping |

## Meaning of this result

`R8_BENCHMARK_COMPLETE` is supportable when the executable `--audit-complete` gate is green.

`R8_BUSINESS_CLOSED` is **not** supportable. It requires every `PARTIAL` and `GAP` to be resolved or deliberately reclassified with evidence.

The only flow-level `GAP` at this stage is first-class **Subcontracting**. Other open areas are `PARTIAL` because meaningful authority already exists.

This benchmark is designed to become the prioritized input to R8-B business closure and, later, the language-neutral contract for a .NET successor. It is not permission to copy ERPNext source or to start broad .NET migration now.
