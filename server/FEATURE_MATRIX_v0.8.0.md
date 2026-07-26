# CloudForge v0.8.0 Feature Matrix

Status meanings:

- **Hardened subset** — protected by commercial O2C accounting/security gates; still requires exact-artifact production promotion.
- **Beta** — implemented across source, migration and permission/runtime tests; production evidence remains required.
- **Preview** — implemented with controller, ledger/projection and regression coverage; no complete ERPNext parity claim.
- **Foundation only** — metadata and generic runtime are available, but a complete domain engine is not.
- **Missing** — not implemented.

| Area | Status | Included | Important gaps |
|---|---|---|---|
| Tenant/security kernel | Hardened subset | JWT Gateway, signed trusted identity, WfP dispatch, per-tenant D1, secret tooling | external security review and exact-release promotion |
| Mutation kernel | Hardened subset | DO serialization, OCC, actor-bound idempotency, atomic D1 batch, audit/outbox/receipt | large-ledger benchmark, regional recovery drill |
| Frappe Core | Beta | metadata/custom DocTypes, Permission V2, generic lifecycle/workflow, Meta Desk, versions, collaboration, files, import/export | scripts/hooks, hierarchy permission expansion, notifications, all Desk builders/views |
| O2C | Hardened subset | SO→DN→SI→customer receipt, tax subset, multicurrency, AR/Stock reports, reconciliation | complete CRM/quotation, advances/write-offs, statutory tax breadth |
| Buying/P2P | Preview | PO→PR→PI→supplier payment and AP projection | RFQ, supplier quotation, purchase tax breadth, landed cost, portal |
| Journal/GL | Preview | balanced Journal Entry, GL and Trial Balance definitions | complete Chart of Accounts admin, dimensions, close, consolidated statements |
| Pricing | Preview | server Item Price and bounded Pricing Rule matching by item/party/group/date/quantity/priority | full ERPNext promotional schemes, margin/free-item/mixed-condition rules |
| Returns | Preview | Credit Note, Debit Note, Stock Return, source party/warehouse and cumulative-quantity guards | full amendment chain, replacement flows, tax/accounting regional parity |
| Stock valuation | Preview | FIFO and Moving Average issue valuation from server ledger history, exact layer consumption, COGS-capable stock values | full repost graph, landed cost, stock reconciliation, close-scale benchmarking |
| Repost valuation | Preview | bounded zero-quantity valuation adjustment with balanced GL difference | downstream replay of every affected voucher/COGS entry and async repost orchestration |
| Serial/batch | Preview | submitted bundles, single-use, serial 0/1 state, batch non-negative state, cancellation release | expiry/warranty/recall, bundle auto-creation, full item-master policy and UX |
| Manufacturing | Preview | BOM, Work Order, server-valued Manufacture, overproduction/overconsumption guards, progress report | Production Plan, Job Card, operations, capacity, routing and complete WIP workflows |
| Assets | Preview | Asset registration, depreciation methods subset, depreciation cap, balanced GL, NBV and ledger report | capitalization/purchase integration, movement, maintenance, sale, disposal and schedule generation |
| Reports | Preview | AR/AP, GL, Trial Balance, Stock Balance/Ledger, batch/serial, Work Order progress, depreciation | complete financial statements, aging breadth, dashboards and statutory reports |
| Projects | Foundation only | standard metadata and generic document runtime | project costing/billing, Gantt, profitability and domain automation |
| Quality | Foundation only | standard metadata and generic document runtime | inspection templates, non-conformance and corrective workflows |
| Support | Foundation only | Issue metadata and generic workflow seam | SLA timers, inbound email, knowledge base and customer portal |
| POS | Foundation only | POS Profile metadata seam | opening/closing sessions, POS invoices, offline/fast checkout and reconciliation |
| Regional/HR | Missing | — | statutory packs, e-invoice, payroll and HRMS |

## Compatibility statement

v0.8 materially expands ERP accounting, stock and manufacturing foundations, but it is still an **ERPNext Core Preview**. Only the separately promotion-gated O2C subset may be represented as Limited GA. Preview and foundation rows require their own oracle/runtime/operations evidence before commercial promises.
