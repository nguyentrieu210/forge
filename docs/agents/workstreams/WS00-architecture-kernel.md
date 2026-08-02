# WS00 — Architecture / Kernel / Tech-stack 360°

Status: **ACTIVE**  
Owner: **ChatGPT / ws00**  
Branch: `agent/ent-00-architecture-kernel`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Exact `main` at claim: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Claim commit: `722066400d0b8ee960f4ad408ffacc25d84a0e34`  
Main sync checkpoints: PR `#302` -> `b74bb6b034ce60f950ba53953deb625a269a8675`; PR `#324` -> `db182c9133f2f35ca39a3618fb1070214c8cb12a`  
Delivery PR: **#306** (Draft, backend/CRITICAL, not merged/deployed)  
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

## Authoritative mutation path

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
-> D1 command store / first-primary session
   -> mutation_guard OCC/lifecycle trigger
   -> document + children + search projection
   -> immutable ledger/progress rows
   -> Version audit snapshot
   -> outbox events
   -> mutation receipt
   -> one D1 batch + bookmark result
```

The executable path matches the core intent of `server/docs/spec/technical/atomic-write-protocol.md`: authoritative document/ledger/audit/outbox/receipt state commits together. The in-transaction guard is essential because a zero-row optimistic UPDATE does not itself fail `db.batch()`.

## Capability evidence

The current capability map has no dedicated IDs for document kernel/OCC/atomic mutation/DO coordination. WS00 therefore maps the nearest stable cross-cutting IDs instead of inventing unofficial coverage numbers.

| Capability | Current maturity | Evidence / boundary |
|---|---|---|
| `I01-014` Idempotency | **RC** | payload hash, tenant-scoped receipt, exact replay, incompatible command reuse fail-closed. |
| `G02-001` Audit trail | **RC** | versions snapshot with actor/action/command linkage committed with mutation. |
| `G02-002` Immutable audit evidence | **Wired/RC** | receipts + append-only ledger revisions; delete/rename maintenance path still needs unified command semantics. |
| `O01-011` Integrity checks | **Wired/RC** | SQL guards + kernel invariants + bounded-scan fail-closed; exact failure-injection suite NOT RUN here. |
| `W01-012` Stock Ledger | **affected, WS04-owned** | coordination hardened; stock semantics unchanged. |
| `W01-019` Stock reservation | **affected, WS04-owned** | shared reservation read-check-write uses company coordination. |

## Findings and disposition

### WS00-F01 — CRITICAL — inventory coordinator did not serialize the complete async mutation

Inventory-affecting commands shared one company Durable Object key but `mutateInventory()` invoked `kernel.execute()` without an explicit full-operation queue. Durable Object JavaScript may interleave across awaited non-DO-storage I/O; per-document OCC cannot protect a shared inventory invariant across differently named vouchers.

**Disposition: FIXED on PR #306.**

- added generic `MutationSerialExecutor` in document-kernel;
- queue wraps the complete `commandServices().kernel.execute(command)` operation;
- a rejected mutation releases the queue;
- no schema/migration change.

### WS00-F02 — STANDARD — document-kernel dependency surface was a domain service locator

`DomainReader` exposed document + finance + stock + manufacturing + asset + project + POS + bank + procurement reads as one dependency.

**Disposition: PARTIALLY FIXED / compatibility migration started.**

Added narrow reader ports while retaining `DomainReader` as a source-compatible aggregate:
- `DocumentReader`;
- `SubmittedQuantityReader`;
- `PaymentLedgerReader`;
- `StockLedgerReader`;
- `ReturnProgressReader`;
- `ManufacturingProgressReader`;
- `AssetProgressReader`;
- `ProjectProgressReader`;
- `PosProgressReader`;
- `BankReconciliationReader`;
- `SalesFulfillmentReader`;
- `ProcurementProgressReader`;
- `MasterDataReader`;
- `PeriodLockReader`.

Contract: new code depends on the smallest port. Domain owners migrate callers incrementally; do not fork D1 authority. Spec: `server/docs/spec/technical/kernel-domain-ports.md`.

### WS00-F03 — KEEP/HARDEN — OCC/idempotency/atomic batch shape is sound

- `DocumentKernel` recomputes payload hash;
- same tenant + command ID + actor/hash returns stored receipt;
- incompatible reuse fails closed;
- `mutation_guard` revalidates expected version/lifecycle inside transaction scope;
- document/children/search/audit/ledger/outbox/receipt share one D1 batch;
- after D1 error, store rechecks receipt for commit-before-response recovery.

Do not redesign this path without evidence of a real invariant gap.

### WS00-F04 — shared-state concurrency contract

**Contract:** a common Durable Object identity is necessary but not sufficient when correctness depends on shared state observed before commit. The complete asynchronous authoritative read-check-write must be serialized unless the D1 transaction itself fully enforces the invariant.

Current scopes:
- same-document conflict -> D1 OCC guard;
- inventory/reservation -> company coordinator + `MutationSerialExecutor`;
- purchase allocation -> company/supplier coordinator + shared serial primitive + selective allocation-revision retry.

### WS00-F05 — CRITICAL hardening — purchase executor created command services before waiting in queue

Purchase coordination previously captured one `DocumentKernel`/D1 session before entering the supplier serial queue. Revision retries then reused that same captured service.

**Disposition: FIXED on PR #306.**

`mutatePurchase()` now constructs `commandServices()` inside the queued callback. Each queue turn and selective retry therefore gets a fresh request-scoped `first-primary` session and rereads authoritative allocation state after it actually reaches the front of the queue.

`PurchaseCommandSerialExecutor` now reuses `MutationSerialExecutor`; purchase keeps only its domain-specific revision retry policy.

### WS00-F06 — CRITICAL — bounded controller scan could silently hide rows beyond 5,000

`D1MutationStore.listDocumentsByDoctype()` is capped at 5,000. Controllers including Alumdoor stock-reservation protection use it for absence/shared-state decisions. Silent truncation on a larger tenant can turn “not returned” into “does not exist”.

**Disposition: FIXED fail-closed on authoritative rollout command store; targeted-reader migration remains.**

- added `CONTROLLER_DOCUMENT_SCAN_LIMIT` + `assertControllerDocumentScanCount()`;
- `D1RolloutPurchaseAllocationDomainStore` counts the tenant/doctype first in the same primary-first session;
- if count exceeds 5,000, mutation fails closed instead of using an incomplete scan;
- domain owner must add a targeted indexed reader rather than raise the limit for large datasets.

### WS00-F07 — architecture gap — delete/rename lifecycle maintenance bypasses MutationCommand

`frappe-api` calls `D1MutationStore.deleteDraftDocument()` and `renameDocument()` directly after permission checks. These operations use D1 batches and have sensible local safety guards, but they do not share the normal command envelope/receipt/outbox/idempotency contract. Delete also removes `versions`, which makes tombstone/name-reuse semantics part of the design problem.

**Disposition: OPEN contract gap; do not patch impulsively.**

Before implementation, define explicit maintenance-command semantics for:
- idempotency key + replay result;
- rename old/new identity and reference refusal;
- delete tombstone/name reuse;
- immutable audit evidence;
- event/outbox behavior;
- permission action;
- whether `MutationAction` should grow or maintenance commands remain a separate contract.

This gap is independent of PR #306 correctness fixes and does not block them.

### WS00-F08 — cross-workstream — accounting period lock writes directly through D1 store

`metaforge.api.set_accounting_period_lock` calls `context.documents.setAccountingPeriodLock()`, which writes `accounting_period_locks` + event rows directly with `db.batch()` rather than a finance-owned domain command.

The existing event table provides some audit evidence, but this path does not use kernel command receipt/outbox/OCC semantics.

**Disposition: dependency to WS01.** WS00 must not redesign finance period/business-rule semantics from the kernel branch.

### WS00-F09 — Cloudflare fit / cost / scale

Current architecture fits Cloudflare when command queries remain targeted:
- D1-per-tenant matches D1 horizontal database scaling;
- command reads use `withSession("first-primary")`;
- bookmark is the right read-after-write seam;
- report/read paths may use replicas with the Sessions consistency model;
- company inventory coordinator is an intentional correctness-first hotspot;
- broad scans and very large `db.batch()` statement counts are the main kernel performance risks.

Current external platform evidence and capacity gates are recorded in `server/docs/spec/technical/cloudflare-kernel-fit.md`.

## Dependency requests

### DR-WS00-01 — stable kernel capability IDs
- Target stream: WS00 / capability registry maintenance.
- Need: stable IDs for document kernel, OCC, atomic mutation, Durable Object coordination and receipt/outbox semantics.
- Why generic: every domain depends on these L0 capabilities.
- Blocking: **no** for current implementation; **yes** for precise long-term coverage accounting.
- Temporary workaround: nearest cross-cutting IDs + explicit affected domain IDs.

### DR-WS00-02 — compiler accepts business-context dimensions package parser cannot resolve
- Target stream: **WS09 BPM/App Factory**.
- Evidence: user CI reported `COMPILE_PRODUCED_INVALID_PACKAGE hrm: client.dimensions[2] ... department`; current compiler copies `brief.dimensions`, while app-registry supports only its canonical resolvable set and rejects `department`.
- Need: brief/compiler validation and package parser must share one canonical business-context dimension contract.
- Why generic: every generated app package crosses this compiler/parser seam.
- Contract proposed: unsupported dimensions fail during brief validation/compile with a precise compiler diagnostic; package parser remains defense-in-depth. Do **not** add `department` merely to silence CI unless the server business-context resolver actually supports it.
- Blocking: **no** for WS00.
- Temporary workaround: generated packages declare only server-resolvable dimensions.

### DR-WS00-03 — finance period-lock domain command
- Target stream: **WS01 Finance/VN Accounting**.
- Need: replace/retire direct generic-store period-lock write with finance-owned versioned/audited command semantics when WS01 hardens period control.
- Why generic: period lock changes authoritative accounting behavior and must have explicit correction/audit semantics.
- Contract proposed: tenant/company scope, actor/reason, expected/current state, idempotency, immutable event/audit, deterministic effective lock state.
- Blocking: **no** for WS00.
- Temporary workaround: existing period-lock + event-table path remains; WS00 does not duplicate finance logic.

## Legacy PR disposition

| PR | WS00 disposition | Reason |
|---|---|---|
| `#278` VN accounting integrity | **secondary review only / not WS00 implementation source** | no document-kernel files in exact changed-file set; primary owner WS01. |
| `#153` ERP platform Wave 1 design | **MERGED / reference only** | architecture reference already in main; no code to transplant. |

## Verification

Risk: **CRITICAL** for shared stock/purchase coordination.

Executed in this session:
- Node **22.16.0** + TypeScript **5.8.3** isolated compile of new generic primitives: **PASS**;
- `MutationSerialExecutor` complete async serialization: **PASS**;
- queue recovery after rejected operation: **PASS**;
- bounded scan at limit: **PASS**;
- bounded scan overflow fail-closed: **PASS**;
- narrow reader-port synthetic type-shape compile: **PASS**.

Repository-wide exact checkout evidence:
- `npm test`: **NOT RUN**;
- Worker typecheck/integration: **NOT RUN**;
- D1 migration replay: **N/A** (no migration in WS00 changes);
- production deploy: **NOT RUN / prohibited before explicit approval**.

Reason for NOT RUN: connector session has no exact repository checkout/dependency tree; shell DNS cannot resolve GitHub. Per autonomous execution rule this is recorded, not treated as a blocker to independent audit/implementation.

## Affected workstreams

- **WS03 Procurement:** purchase serial primitive reused; retry semantics preserved.
- **WS04 Inventory/WMS:** stock/reservation shared-state commands now serialize complete mutation; broad reservation scan fails closed beyond safe bound and should later get targeted reader/index.
- **WS05 Manufacturing:** inventory-coordinated manufacturing stock mutations inherit the shared coordination contract.
- **WS09 App Factory:** DR-WS00-02 compiler dimension contract.
- **WS01 Finance/VN:** DR-WS00-03 period-lock command ownership.
- **WS11:** permission implementation unchanged.
- **WS12:** future load/failure-injection/queue-wait observability evidence.

## Migration / production impact

- Schema migration: **none**.
- Customer data mutation: **none**.
- Secrets/DNS: **none**.
- Production deploy: **none**.
- Delivery PR: **#306**, still Draft while autonomous closure continues.
- Merge/deploy gate: backend/CRITICAL; explicit user approval required.

## Remaining WS00 closure work

1. Re-sync exact latest `main` before final handoff because parallel UI branches continue to advance main.
2. Review final PR diff for accidental ownership overlap.
3. Update PR #306 title/body to reflect coordination + reader-boundary + scale hardening.
4. Mark workstream `REVIEW` and PR ready when exact branch relation is clean.
5. Do **not** merge/deploy PR #306 without explicit user approval.
