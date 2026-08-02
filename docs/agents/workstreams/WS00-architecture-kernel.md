# WS00 — Architecture / Kernel / Tech-stack 360°

Status: **REVIEW**  
Owner: **ChatGPT / ws00**  
Branch: `agent/ent-00-architecture-kernel`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Exact `main` at claim: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Claim commit: `722066400d0b8ee960f4ad408ffacc25d84a0e34`  
Main sync: PR `#302` merged into this workstream at `b74bb6b034ce60f950ba53953deb625a269a8675`  
Delivery PR: **#306** `fix(kernel): serialize shared inventory mutations` (Draft, not merged/deployed)  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission / ownership

Audit và harden kiến trúc nền Forge: document kernel, mutation model, contracts, data model, multi-tenant boundaries, concurrency, performance/cost, package boundaries và tech-stack.

Own:
- `server/packages/document-kernel/**`;
- shared contracts/core primitives khi thật sự cross-domain;
- D1/DO authoritative write model, OCC/idempotency/receipt/outbox invariants;
- package dependency direction, public/private boundary, tech/perf/cost architecture.

Do not absorb:
- auth/IAM/permission implementation -> WS11;
- App Factory/compiler -> WS09;
- release/backup/observability -> WS12;
- shared React runtime -> WS14;
- domain accounting/stock/payroll rules -> domain owner.

## Phase A audit snapshot

### Authoritative mutation path

```text
Gateway trusted tenant/user envelope
-> Tenant Worker / command route
-> AggregateCoordinator Durable Object
   -> ordinary document: tenant:doctype:name
   -> inventory: inventory:tenant:company
   -> purchase: purchase:tenant:company:supplier
-> DocumentKernel
   -> payload hash + receipt idempotency
   -> authoritative read + server permission
   -> lifecycle + expected-version precheck
   -> controller builds deterministic MutationPlan
   -> balanced-GL invariant
-> D1MutationStore / first-primary session
   -> mutation_guard OCC/lifecycle trigger
   -> document + children + search projection
   -> immutable ledger/progress rows
   -> Version audit snapshot
   -> outbox events
   -> mutation receipt
   -> one D1 batch + bookmark result
```

Executable code matches the core intent of `server/docs/spec/technical/atomic-write-protocol.md`: write, audit, ledger, outbox and receipt share one authoritative batch. The D1 guard is essential because a zero-row optimistic UPDATE does not itself fail a batch.

### Capability evidence

The capability map currently has no dedicated IDs for L0 document kernel/OCC/atomic mutation/DO coordination. WS00 therefore maps the nearest stable cross-cutting IDs and records the registry gap instead of inventing unofficial IDs.

| Capability | Current maturity | Evidence / boundary |
|---|---|---|
| `I01-014` Idempotency | **RC** | payload-hash verification, tenant-scoped command receipts, exact replay, incompatible key reuse fail-closed. |
| `G02-001` Audit trail | **RC** | `versions` snapshot with actor/action/command linkage committed atomically. |
| `G02-002` Immutable audit evidence | **Wired/RC** | receipts, versions and append-only ledger revisions preserved; full failure-injection evidence not rerun here. |
| `O01-011` Integrity checks | **Wired** | SQL guards, ledger invariants and regression sources exist; exact full-suite execution still required. |
| `W01-012` Stock Ledger | **affected, WS04-owned** | WS00 changes coordination only, not stock business rules. |
| `W01-019` Stock reservation | **affected, WS04-owned** | shared reservation read-check-write now receives full-operation serialization. |

## Findings

### WS00-F01 — CRITICAL — inventory coordinator did not serialize the full async mutation

Inventory-affecting commands were routed to one company-wide Durable Object, but `mutateInventory()` directly called `kernel.execute()`. The adjacent purchase implementation already records the Cloudflare behavior that matters: Durable Object RPC methods may interleave while awaiting database work.

Two differently named stock/reservation documents could therefore build plans from the same pre-mutation shared state. Per-document OCC protects one document version, not a cross-document inventory invariant.

**Disposition: FIXED on WS00 branch / PR #306.**

Implementation:
- new generic `MutationSerialExecutor` in document-kernel;
- export through document-kernel public surface;
- inventory coordinator queues the complete `commandServices().kernel.execute(command)` operation;
- failed operations release the queue instead of poisoning subsequent commands;
- no schema/migration change.

### WS00-F02 — STANDARD architecture debt — domain leakage inside document-kernel

`DomainReader` and `D1MutationStore` currently expose/implement domain-specific reads/projections for sales fulfillment, procurement, stock/batch, manufacturing, assets, projects, POS, bank reconciliation and period locks. `document-kernel/src/index.ts` also exports purchase-allocation services directly.

This is not an immediate correctness defect, but it makes the kernel a dependency magnet and increases blast radius. Do not mix a broad extraction with the concurrency fix.

**Disposition: OPEN.** Next WS00 architecture slice should define narrow reader/projection ports and a staged extraction order with domain owners.

### WS00-F03 — OCC/idempotency/atomic batch shape is sound

- `DocumentKernel` recomputes payload hash before write.
- same tenant + command ID + same actor/hash returns stored receipt; incompatible reuse fails closed.
- `mutation_guard` validates expected version/lifecycle inside D1 transaction scope.
- document/children/search/audit/ledger/outbox/receipt are assembled into one D1 batch.
- after D1 error, the store rechecks receipt, covering commit-before-response retry behavior.

**Disposition: KEEP/HARDEN, not redesign.**

### WS00-F04 — document-local vs shared-state concurrency contract

Ordinary same-document interleaving is protected by D1 OCC. Shared state such as inventory or supplier allocation requires a deliberately scoped coordinator plus explicit serialization of the complete authoritative read-check-write operation.

**Contract:** routing to a common DO key is necessary but not sufficient when correctness depends on shared state observed before commit.

## Verification for PR #306

Risk: **CRITICAL**.

Executed in this session against the exact new primitive source in an isolated TypeScript scratch compile:
- TypeScript 5.8.3 compile: **PASS**;
- Node 22 regression, full async serialization: **PASS**;
- Node 22 regression, queue recovery after rejection: **PASS**;
- result: **2/2 PASS**.

GitHub workflow runs on exact PR head at PR creation: **none** (repo policy is not providing development CI on this head).

Repository-wide `npm test`, Worker typecheck and Cloudflare Worker integration tests have **not** been executed from an exact repository checkout in this connector session. PR #306 remains Draft and must not be called Hardened from isolated evidence alone.

## Legacy PR disposition

| PR | WS00 disposition | Reason |
|---|---|---|
| `#278` VN accounting integrity | **REJECT as WS00 implementation source; secondary review only** | Exact changed-file set has no `document-kernel` file. Primary ownership stays WS01. This is not a global rejection of the WS01 PR. |
| `#153` ERP platform Wave 1 design | **MERGED / reference only** | Historical architecture design already merged; no code to transplant. |

## Affected workstreams

- **WS04 Inventory/WMS:** stock/reservation shared-state commands now have actual full-operation platform serialization.
- **WS03 Procurement:** no code changed; purchase coordinator keeps its serial executor + allocation-revision retry.
- **WS11 Security/SaaS:** permission implementation unchanged.
- **WS12 SRE:** no release/deploy change; future load/failure-injection evidence can be coordinated here.

## Dependency / follow-up

### DR-WS00-01 — capability map kernel IDs
- Target: WS00 architecture registry maintenance.
- Need: stable IDs for document kernel, OCC, atomic mutation, Durable Object coordination and receipt/outbox semantics.
- Why generic: these are L0 capabilities used by every business domain.
- Blocking: no for PR #306; yes for precise long-term L0 coverage accounting.
- Temporary workaround: nearest stable cross-cutting IDs + explicit affected domain IDs.

### Next WS00 architecture slice

Define narrow shared ports around the current `DomainReader`/D1 projection surface, then extract domain-specific readers/writers incrementally without changing authoritative ledger semantics. Coordinate any behavioral extraction with the corresponding domain owner.

## Migration / production impact

- Migration: **none**.
- Customer data mutation: **none**.
- Production deploy: **none**.
- PR: **#306 Draft**.
- Merge/deploy gate: backend CRITICAL, explicit user approval required.

## Handoff

Workstream: WS00  
Branch: `agent/ent-00-architecture-kernel`  
Status: **REVIEW**  
PR: **#306**  
Capabilities: `I01-014`, `G02-001`, `G02-002`, `O01-011`; affected `W01-012`, `W01-019`  
Changed zones: `server/packages/document-kernel/src/`, `server/apps/tenant-worker/src/aggregate-do.ts`, `server/tests/`  
Tests: isolated TypeScript + Node regression 2/2 PASS; full repo/Worker validation pending  
Migration: none  
Known gaps: domain leakage from `DomainReader`/`D1MutationStore`; no dedicated L0 kernel IDs  
Recommended merge order: PR #306 before WS04/WS05 inventory-heavy changes relying on shared stock coordination.