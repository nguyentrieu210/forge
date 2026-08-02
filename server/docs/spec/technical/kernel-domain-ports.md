# Kernel domain-reader port boundary

> Status: WS00 architecture contract. This narrows dependencies without changing authoritative data ownership or business rules.

## Problem

`document-kernel` currently exposes one compatibility `DomainReader` that contains document reads plus finance, stock, procurement, manufacturing, asset, project, POS and bank projections. That shape is convenient in the short term but creates a dependency magnet: a controller that needs one stock balance method implicitly depends on every unrelated projection the kernel happens to expose.

The D1 implementation may remain physically colocated while Forge is small. The architectural boundary should still be explicit now, because moving code later is much cheaper when callers already depend on narrow contracts.

## Rule

New controller/service code must depend on the smallest reader port that expresses its authoritative reads.

`DomainReader` remains a compatibility aggregate only. It is not the preferred dependency for new code and must not receive a new domain method until a focused port exists first.

Current ports:

- `DocumentReader`
- `SubmittedQuantityReader`
- `PaymentLedgerReader`
- `StockLedgerReader`
- `ReturnProgressReader`
- `ManufacturingProgressReader`
- `AssetProgressReader`
- `ProjectProgressReader`
- `PosProgressReader`
- `BankReconciliationReader`
- `SalesFulfillmentReader`
- `ProcurementProgressReader`
- `MasterDataReader`
- `PeriodLockReader`

## Dependency direction

```text
controller/domain package
        |
        v
small read port from document-kernel
        |
        v
D1MutationStore / compatible implementation
        |
        v
D1 authoritative tables / append-only ledgers
```

The port does not move source of truth. It only prevents a caller from coupling itself to unrelated reads.

## Write boundary

No narrow reader port grants a write path. Authoritative document/ledger writes still flow through:

```text
MutationCommand
-> coordinator/OCC boundary
-> DocumentKernel
-> deterministic MutationPlan
-> MutationStore.execute()
-> one D1 atomic batch
```

A domain must not add a convenience write method beside these ports just to avoid constructing a command/plan.

## Shared-state concurrency contract

A mutation that reads shared state before commit must prove one of these protections:

1. the invariant is enforced by a D1 constraint/trigger in the same authoritative batch; or
2. every competing mutation routes to the same Durable Object key and the complete async read-check-write operation is explicitly serialized there.

Routing to the same Durable Object key alone is not sufficient because RPC methods can interleave across `await` points.

Current examples:

- same-document version conflict: D1 OCC guard;
- inventory/reservation shared state: company inventory coordinator + `MutationSerialExecutor`;
- purchase allocation: company/supplier coordinator + `MutationSerialExecutor` + selective allocation-revision retry.

## Migration strategy

1. Add/maintain narrow ports in `store.ts` while keeping `DomainReader` source-compatible.
2. Domain owners migrate controller constructor/context types to the smallest applicable port when they next touch that code.
3. Once no caller requires a domain-specific capability through the compatibility aggregate, move its implementation to the owning package if doing so reduces dependency direction without duplicating D1 authority.
4. Keep one authoritative ledger/table. Extraction must never introduce a second projection as a competing source of truth.

## Ownership

- WS00 owns the generic port pattern and document-kernel public boundary.
- Domain semantics remain with their workstreams: Finance WS01, Sales WS02, Procurement WS03, Inventory WS04, Manufacturing WS05, etc.
- App Factory/compiler remains WS09; IAM/permission WS11; release/observability WS12; shared React runtime WS14.

## Acceptance

A port refactor is acceptable only when:

- no runtime behavior changes unintentionally;
- tenant IDs remain mandatory on authoritative reads;
- money/quantity units are unchanged;
- controller tests remain valid;
- no direct D1 business write is added outside the mutation contract;
- cancellation/reversal continues reading exact historical ledger revisions where required.
