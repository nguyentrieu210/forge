# WS00 — Architecture / Kernel / Tech-stack 360°

Status: **ACTIVE**  
Owner: **ChatGPT / ws00**  
Branch: `agent/ent-00-architecture-kernel`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Exact `main` at claim: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Claim commit: `722066400d0b8ee960f4ad408ffacc25d84a0e34`  
Main sync: PR `#302` merged into the workstream branch at `b74bb6b034ce60f950ba53953deb625a269a8675`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Audit và harden kiến trúc nền Forge 360°: document kernel, mutation model, contracts, data model, multi-tenant boundaries, concurrency, performance/cost, package boundaries và tech-stack. Đây là owner của shared architectural primitive, không phải owner của mọi business domain.

## Own

- `server/packages/document-kernel/**`
- shared contracts/core primitives khi thật sự cross-domain
- D1/DO authoritative write model, OCC/idempotency/receipt/outbox invariants
- package dependency direction và public/private boundary
- tech-stack/performance/cost architecture
- architecture specs/contracts dùng chung

## Do not absorb

- auth/IAM/permission implementation -> WS11
- App Factory/compiler -> WS09
- release/backup/observability -> WS12
- shared React runtime -> WS14
- domain accounting/stock/payroll rules -> domain owner

## Phase A audit snapshot

### Authoritative mutation path

```text
Gateway trusted tenant/user envelope
-> Tenant Worker / command route
-> AggregateCoordinator Durable Object
   -> ordinary document key: tenant:doctype:name
   -> inventory key: inventory:tenant:company
   -> purchase key: purchase:tenant:company:supplier
-> DocumentKernel
   -> payload hash + idempotency receipt lookup
   -> authoritative document read + permission
   -> lifecycle + expected-version precheck
   -> controller builds deterministic MutationPlan
   -> balanced-GL invariant
-> D1MutationStore on first-primary session
   -> mutation_guard OCC/lifecycle trigger
   -> document + child diff + search projection
   -> immutable ledger/progress rows
   -> Version audit snapshot
   -> outbox events
   -> mutation receipt
   -> one D1 batch / bookmark result
```

The executable path matches the intent of `server/docs/spec/technical/atomic-write-protocol.md`: canonical write, audit, ledger, outbox and receipt are committed together. The D1 guard is essential because a zero-row optimistic UPDATE alone does not fail a D1 batch.

### Capability evidence

The current enterprise capability map does not have dedicated IDs for the L0 document kernel, OCC or atomic mutation protocol. Until that registry is expanded, WS00 maps the nearest stable cross-cutting IDs and records the gap instead of inventing unofficial IDs.

| Capability | Current maturity | Evidence / boundary |
|---|---|---|
| `I01-014` Idempotency | **RC** | `DocumentKernel` validates payload hash, tenant-scoped command receipt replay and key-reuse conflict; D1 persists `mutation_receipts` in the same batch. |
| `G02-001` Audit trail | **RC** | `versions` snapshot plus actor/action/command linkage is written atomically with the document mutation. |
| `G02-002` Immutable audit evidence | **Wired/RC** | receipts, versions and append-only ledger revisions are preserved; draft deletion deliberately keeps idempotency/audit records. Full failure-injection evidence was not rerun on this branch. |
| `O01-011` Integrity checks | **Wired** | SQL guards, ledger invariants and regression sources exist; exact full-suite execution is still required before claiming RC/Hardened. |
| `W01-012` Stock Ledger | **affected, WS04-owned** | append-only stock ledger and negative-stock trigger exist; WS00 hardens coordinator serialization only. |
| `W01-019` Stock reservation | **affected, WS04-owned** | reservation read-check-write is routed to the same company inventory coordinator; WS00 hardens that coordinator only. |

### Findings

#### WS00-F01 — CRITICAL — shared inventory coordinator did not serialize the full async mutation

`AggregateCoordinator` correctly routed stock posting/cutting/reconciliation/reservation commands to one company-wide inventory Durable Object. However `mutateInventory()` immediately called `kernel.execute()` with no promise-tail serialization.

The adjacent purchase coordinator already documents the Cloudflare behavior that matters: Durable Object RPC methods can interleave while awaiting database work. Therefore two differently named inventory documents could both enter controller read-check-write logic against the same pre-mutation stock/reservation state. Per-document OCC cannot protect a cross-document inventory invariant.

**Disposition: FIXED on WS00 branch.**

Implementation:

- added `server/packages/document-kernel/src/mutation-serial-executor.ts` as a generic cross-domain coordination primitive;
- exported it from document-kernel public surface;
- inventory coordinator now queues the entire `commandServices().kernel.execute(command)` operation;
- rejection releases the queue so a failed command cannot block later work.

No schema/migration change.

#### WS00-F02 — STANDARD architecture debt — document-kernel contains broad domain leakage

`DomainReader` and `D1MutationStore` currently expose/implement domain-specific reads and projections for sales fulfillment, procurement, stock/batch, manufacturing, assets, projects, POS, bank reconciliation and period locks. `document-kernel/src/index.ts` also exports purchase-allocation services directly.

This does not immediately break correctness, but it makes the kernel a dependency magnet and increases blast radius/cost of every domain change. Refactor should be contract-first and incremental; do not split it in the concurrency hotfix because that would mix a correctness fix with a broad package-boundary rewrite.

**Disposition: OPEN architecture debt.** Next WS00 slice should define narrow reader/projection ports and a staged extraction order with domain owners before moving code.

#### WS00-F03 — OCC/idempotency/atomic batch shape is fundamentally sound

- `DocumentKernel` recomputes command payload hash before any write.
- Same tenant + command ID + same actor/hash returns the stored receipt; incompatible reuse fails closed.
- `mutation_guard` validates expected version/lifecycle inside D1 transaction scope.
- document/children/search/audit/ledger/outbox/receipt are assembled into one D1 batch.
- after a D1 error the store rechecks receipt, allowing a retry after commit-before-response to return the committed result.

**Disposition: KEEP/HARDEN, do not redesign.** Remaining work is evidence depth and cross-document coordination coverage, not replacing this model.

#### WS00-F04 — ordinary document DO interleaving is protected by D1 OCC; shared invariants still need explicit coordinators

A normal document mutation may interleave at the DO level, but same-document stale writes are rejected by the D1 guard. That is acceptable for document-local invariants. Shared state such as inventory, supplier FIFO allocation, period-close or similar cross-document invariants must use a deliberately scoped coordinator and serialize the complete read-check-write operation.

**Contract:** routing to a common DO key is necessary but not sufficient; the full async authoritative mutation must be queued when correctness depends on shared state observed before commit.

## Verification for WS00-F01

Risk: **CRITICAL** because the patch protects stock/reservation correctness.

Executed in this session against the exact new primitive source in an isolated TypeScript scratch compile:

- TypeScript 5.8.3 compile of `MutationSerialExecutor`: **PASS**.
- Node 22 regression `serializes the complete async operation`: **PASS**.
- Node 22 regression `releases the queue after a rejected mutation`: **PASS**.
- Result: **2/2 PASS**.

Repository-wide `npm test`, Worker typecheck and Cloudflare Worker integration tests have **not** been executed from an exact checkout in this connector session. This branch therefore must not be described as Hardened or merged/deployed solely from the isolated evidence.

## Legacy PR disposition

| PR | WS00 disposition | Reason |
|---|---|---|
| `#278` VN accounting integrity | **REJECT as WS00 implementation source; secondary review only** | Exact changed-file set has no `document-kernel` file. Primary ownership stays WS01; WS00 should review shared ledger/kernel contracts without transplanting the accounting branch. This is not a global rejection of the WS01 PR. |
| `#153` ERP platform Wave 1 design | **MERGED / reference only** | Historical architecture design already merged; no code to cherry-pick into WS00. |

## Affected workstreams

- **WS04 Inventory/WMS:** inventory/stock-reservation shared-state commands now have actual full-operation serialization at the platform coordinator.
- **WS03 Procurement:** no code changed; its purchase coordinator remains independently serialized and has allocation-revision retry.
- **WS11 Security/SaaS:** permission implementation unchanged; `DocumentKernel` continues to call server-side authorizer before mutation.
- **WS12 SRE:** no release/deploy changes; future load/failure-injection evidence should be coordinated here if promoted to production readiness.

## Dependency / follow-up contract

### DR-WS00-01 — capability map kernel IDs
- Target stream: WS00 architecture registry maintenance.
- Need: first-class stable capability IDs for document kernel, OCC, atomic mutation, Durable Object coordination and canonical receipt/outbox semantics.
- Why generic: these are L0 platform capabilities used by every domain and currently have no direct IDs in the enterprise capability map.
- Blocking: no for F01 fix; yes for precise long-term L0 coverage accounting.
- Temporary workaround: map nearest stable cross-cutting IDs and explicitly mark affected domain IDs.

### WS00 next architecture slice

Define narrow shared ports around the current `DomainReader`/D1 projection surface, then extract domain-specific readers/writers incrementally without changing authoritative ledger semantics. Any extraction that changes domain behavior must be coordinated with the corresponding owner instead of being swept into a giant kernel refactor.

## Migration / production impact

- Migration: **none**.
- Customer data mutation: **none**.
- Production deploy: **none**.
- Merge/deploy gate: backend CRITICAL, must stop at PR until explicit user approval.

## Handoff

Capabilities: `I01-014`, `G02-001`, `G02-002`, `O01-011`; affected `W01-012`, `W01-019`.  
Changed zones: `server/packages/document-kernel/src/`, `server/apps/tenant-worker/src/aggregate-do.ts`, `server/tests/`.  
Tests: isolated TypeScript + Node regression 2/2 PASS; full repo/Worker validation pending.  
Migration: none.  
Known gap: domain leakage from `DomainReader`/`D1MutationStore`; capability-map L0 kernel IDs missing.  
Recommended merge order: WS00 concurrency hardening before WS04/WS05 inventory-heavy changes that rely on shared stock coordination.