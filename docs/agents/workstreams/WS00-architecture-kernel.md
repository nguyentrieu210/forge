# WS00 — Architecture / Kernel / Tech-stack 360°

Status: **REVIEW**  
Owner: **ChatGPT / ws00**  
Branch: `agent/ent-00-architecture-kernel`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Exact `main` at claim: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Final reviewed base: `4e63b14bcf52c0aba1fa69eec0417465b5f66897`  
Sync checkpoints: PR `#302`, `#324`, `#330`  
Delivery PR: **#306** `fix(kernel): harden coordinated mutations and command boundaries`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission / ownership

Own `server/packages/document-kernel/**`, generic authoritative write/OCC/idempotency/receipt/outbox primitives, shared package boundaries and Cloudflare kernel architecture. Do not absorb IAM (WS11), App Factory/compiler (WS09), release/SRE (WS12), shared React runtime (WS14), or domain accounting/stock/payroll semantics.

## Authoritative mutation path

```text
Gateway trusted identity
-> Tenant Worker
-> AggregateCoordinator DO
   ordinary: tenant:doctype:name
   inventory: inventory:tenant:company
   purchase: purchase:tenant:company:supplier
-> DocumentKernel
   hash / receipt idempotency / permission / lifecycle / OCC precheck
   -> deterministic MutationPlan + balanced GL
-> D1 command store, first-primary session
   mutation_guard -> document/children/search -> ledgers/projections
   -> version audit -> outbox -> receipt
   -> one atomic D1 batch + bookmark
```

Core OCC/idempotency/atomic-batch design is sound and should be hardened with evidence, not redesigned casually.

## Capability snapshot

| Capability | Maturity | Evidence / boundary |
|---|---|---|
| `I01-014` Idempotency | **RC** | payload hash, tenant command receipt, exact replay, incompatible reuse fails closed. |
| `G02-001` Audit trail | **RC** | version snapshot linked to actor/action/command in mutation batch. |
| `G02-002` Immutable audit evidence | **Wired/RC** | receipts + append-only ledger revisions; maintenance delete/rename remains a contract gap. |
| `O01-011` Integrity checks | **Wired/RC** | D1 guards, kernel invariants, shared-state serialization and fail-closed scan bound. |
| `W01-012`, `W01-019` | **affected; WS04-owned** | stock semantics unchanged; coordination hardened. |

Dedicated capability IDs for document kernel/OCC/atomic mutation/DO coordination are still missing from the enterprise map; see DR-WS00-01.

## Implemented findings

### WS00-F01 — CRITICAL — inventory shared-state interleaving

Routing inventory commands to one company DO did not explicitly serialize the complete async D1 read-check-plan-commit pipeline. Different vouchers could observe the same pre-mutation shared stock/reservation state even though per-document OCC was correct.

**Fixed:**
- generic `MutationSerialExecutor` in document-kernel;
- inventory coordinator queues the complete `commandServices().kernel.execute(command)` operation;
- rejection releases the queue;
- no migration/schema change.

### WS00-F02 — package-boundary debt

The compatibility `DomainReader` had become a cross-domain service locator.

**Partially fixed without breaking callers:** narrow ports now exist for document, submitted quantity, payment ledger, stock ledger, return/manufacturing/asset/project/POS/bank/sales/procurement progress, master data and period lock. `DomainReader` remains a compatibility aggregate only. New code should depend on the smallest port.

Spec: `server/docs/spec/technical/kernel-domain-ports.md`.

### WS00-F03 — KEEP/HARDEN — atomic command shape

Keep current design:
- kernel recomputes payload hash;
- receipt replay precedes planning;
- D1 mutation guard revalidates lifecycle/version in transaction scope;
- document/children/search/audit/ledger/outbox/receipt share one batch;
- store rechecks receipt after D1 failure for commit-before-response recovery.

### WS00-F04 — shared-state coordination contract

Common DO identity alone is not a proof of atomic shared-state mutation. If correctness depends on state read before commit, either the D1 transaction must fully enforce the invariant or the complete asynchronous operation must be serialized inside the shared coordinator.

Current scopes:
- same document -> D1 OCC;
- inventory/reservation -> company coordinator + `MutationSerialExecutor`;
- purchase allocation -> company/supplier coordinator + shared serial executor + selective revision retry.

### WS00-F05 — CRITICAL — purchase session created before serial queue

Purchase coordinator captured command services before waiting in its queue, so a delayed command/retry could reuse a session created too early.

**Fixed:** command services are now constructed inside each queued attempt. Purchase also reuses the generic serial primitive; only domain-specific revision retry remains local.

### WS00-F06 — CRITICAL — generic 5,000-row scan silently truncated invariants

`D1MutationStore.listDocumentsByDoctype()` is capped at 5,000 and is used by shared-state checks including Alumdoor stock reservations. Silent truncation makes “not returned” indistinguishable from “does not exist”.

**Fixed fail-closed on authoritative rollout command store:**
- `CONTROLLER_DOCUMENT_SCAN_LIMIT` and `assertControllerDocumentScanCount()`;
- count tenant/doctype first in the primary-first command session;
- reject scans above the bound instead of using incomplete data;
- large domains must add targeted indexed readers rather than increase the generic cap.

### WS00-F07 — OPEN — delete/rename bypass normal command receipt/outbox lifecycle

Frappe API permission-checks then calls `deleteDraftDocument()` / `renameDocument()` directly. Their local D1 batches are defensive, but they do not use normal MutationCommand receipt/outbox semantics. Delete also removes versions while keeping historical receipts, so replay/name-reuse/tombstone behavior needs an explicit contract before implementation.

Do not patch this by casually adding `delete`/`rename` to `MutationAction`. Required design covers idempotency, tombstone/name reuse, immutable audit, rename identity, reference refusal, event/outbox and permission semantics.

### WS00-F08 — DEPENDENCY — accounting period lock direct write

`metaforge.api.set_accounting_period_lock` directly calls the D1 store path. Existing event rows provide partial audit evidence, but finance-owned period state does not use the normal command receipt/outbox/OCC envelope.

Disposition: DR-WS00-03 to WS01; WS00 does not copy finance rules into kernel.

### WS00-F09 — Cloudflare fit / performance / cost

Verified current Cloudflare architecture/limits and recorded them in `server/docs/spec/technical/cloudflare-kernel-fit.md`.

Key result:
- D1-per-tenant fits horizontal D1 scale;
- command reads correctly use `first-primary` Sessions;
- bookmark is the correct read-after-write seam;
- D1 per-database throughput is dominated by query duration because one database processes queries sequentially;
- broad scans and oversized mutation batches are the real kernel hot spots;
- company inventory coordinator is an intentional correctness-first hotspot; shard only with a proven invariant protocol.

## Dependency requests

### DR-WS00-01 — stable L0 kernel capability IDs
- Target: capability registry maintenance.
- Need: IDs for document kernel, OCC, atomic mutation, DO coordination and receipt/outbox semantics.
- Blocking: **no** for code; **yes** for precise platform coverage accounting.

### DR-WS00-02 — compiler dimension contract mismatch
- Target: **WS09 BPM/App Factory**.
- Evidence: CI reported `COMPILE_PRODUCED_INVALID_PACKAGE hrm: client.dimensions[2] ... department`; compiler copies brief dimensions but app-registry/server supports a narrower canonical set.
- Contract: compiler/brief validator and package parser share one resolvable-dimension contract; unsupported dimensions fail before package emission. Do not add `department` merely to silence CI unless server business-context resolution supports it.
- Blocking WS00: **no**.

### DR-WS00-03 — finance period-lock command
- Target: **WS01 Finance/VN Accounting**.
- Need: finance-owned versioned/idempotent/audited period-lock state command when WS01 hardens period control.
- Blocking WS00: **no**.

## Legacy PR disposition

| PR | Disposition |
|---|---|
| `#278` VN accounting integrity | secondary review only; primary owner WS01, no document-kernel changed files. |
| `#153` ERP platform Wave 1 design | merged/reference only. |

## Verification

Risk: **CRITICAL** for coordination changes.

Executed:
- Node **22.16.0** / TypeScript **5.8.3** isolated compile of new generic primitives: **PASS**;
- complete async serialization: **PASS**;
- queue recovery after rejection: **PASS**;
- bounded scan at limit: **PASS**;
- bounded scan overflow fail-closed: **PASS**;
- narrow reader-port synthetic type-shape compile: **PASS**;
- final branch compare at reviewed base: **ahead only / 0 behind**;
- unresolved PR review threads: **0**.

Not available in this connector shell:
- repository-wide `npm test`: **NOT RUN**;
- Worker typecheck/integration: **NOT RUN**;
- exact full checkout build: **NOT RUN**.

Reason: no exact repository checkout/dependency tree and shell DNS cannot resolve GitHub. Per autonomous execution policy, this is recorded evidence rather than a local blocker.

Migration replay: **N/A**; WS00 adds no migration.

## Production / safety boundary

- schema migration: none;
- customer-data mutation: none;
- secrets/DNS: none;
- production deploy: none;
- PR #306: backend/CRITICAL, mergeable but must not merge/deploy without explicit user approval.

## Handoff

Workstream: **WS00**  
Branch: `agent/ent-00-architecture-kernel`  
Status: **REVIEW**  
PR: **#306**  
Final reviewed base: `main@4e63b14bcf52c0aba1fa69eec0417465b5f66897`  
Capabilities: `I01-014`, `G02-001`, `G02-002`, `O01-011`; affected `W01-012`, `W01-019`  
Changed zones: document-kernel, tenant-worker aggregate coordination, targeted kernel tests, WS00 architecture specs  
Migration: none  
Dependency requests: DR-WS00-01 capability IDs; DR-WS00-02 -> WS09; DR-WS00-03 -> WS01  
Known gaps: delete/rename maintenance-command semantics; exact full checkout/Worker integration evidence; mutation statement-count/load benchmark  
Recommended merge order: WS00 #306 before inventory/manufacturing work that assumes cross-document stock serialization; WS09/WS01 dependencies remain independent and do not block #306 review.
