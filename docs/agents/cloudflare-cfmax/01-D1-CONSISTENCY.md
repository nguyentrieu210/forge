# CF01 — D1 Sessions / Read Replication / Consistency

Status: ACTIVE
Branch: `cloudflare/cfmax-01-d1-consistency`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authority: WS00 architecture/kernel
Consulted owner: WS14 client/runtime for bookmark transport
Risk: CRITICAL

## Mission

Prove and harden Forge's end-to-end D1 consistency model so global read replication improves latency/throughput without allowing stale reads to validate authoritative writes.

Do not assume architecture documents equal implementation. Audit exact code paths.

## Required reading

Read program common sources plus:

- `server/docs/spec/technical/cloudflare-kernel-fit.md`;
- document-kernel D1 store/session code;
- frappe-model stores/services;
- query worker;
- tenant worker;
- client Frappe adapter and TanStack Query seams;
- D1 migration/deploy/provision scripts;
- tests involving bookmarks/read-after-write/OCC.

Official provider source: `https://developers.cloudflare.com/d1/best-practices/read-replication/`.

## Owned scope

- classification of every D1 binding access path;
- session creation policy;
- `first-primary` command semantics;
- bookmark extraction/return/transport;
- bookmark consumption on subsequent requests;
- read-only/report replica policy;
- replica rollout configuration proposal;
- D1 result region/primary observability;
- stale-tolerant KV/Cache boundaries associated with read architecture;
- targeted tests/benchmarks for the above.

## Forbidden zone

Do not:

- redesign finance/stock/payroll invariants;
- bypass or replace Document Kernel/DO;
- weaken OCC/idempotency;
- rewrite unrelated client state management;
- use cached/replica state for permission or ledger decisions without proven contract;
- enable production read replication without explicit deployment approval.

## Audit questions

1. Which stores call `env.DB.prepare/batch/exec` directly versus an injected/session-aware abstraction?
2. Does every authoritative command create its service/store inside the correct session lifetime?
3. Is `withSession("first-primary")` used at the right boundary, not merely instantiated and bypassed later?
4. After commit, where does `getBookmark()` surface?
5. Which HTTP header/body seam transports the bookmark?
6. Does the client persist bookmark per tenant/session, not globally across tenants?
7. How do multiple tabs/concurrent requests advance bookmark freshness?
8. Can an old/foreign bookmark cause leakage, denial, or consistency regression?
9. Which report/query/list endpoints can safely start `first-unconstrained`?
10. Which endpoints must inherit a client bookmark?
11. Are permissions/meta reads allowed on replica, and under what freshness assumptions?
12. Are `served_by_region` / `served_by_primary` fields captured anywhere useful?
13. Is read replication actually enabled on production tenant D1s, or only architecture-ready?
14. What provisioning/migration change would enable it safely for new/existing tenants?
15. What is the measured latency benefit for APAC users and representative tenants?

## Required state classification

Create an evidence table:

```text
path | role | current API | session constraint | bookmark in/out | replica-safe | evidence | gap
```

Roles at minimum:

- authoritative command;
- interactive read-after-write;
- metadata/permission;
- list/search;
- report/query;
- background job;
- migration/admin.

## Implementation slices

### Slice A — exact consistency inventory

No code first. Produce current wiring map and canonical Forge capability IDs/maturity.

### Slice B — one session factory/contract

If current code has fragmented session creation, converge behind the smallest shared authority owned by WS00. Do not create a parallel database abstraction if one already exists.

### Slice C — bookmark round-trip

Prove:

```text
write command
 -> D1 commit
 -> response bookmark B
 -> client stores B in tenant/session scope
 -> next dependent read sends B
 -> server creates session >= B
 -> read sees committed state
 -> response may advance bookmark
```

### Slice D — replica-safe query policy

Explicitly classify replica-friendly reads. Reports must never accidentally become authoritative validators.

### Slice E — observability

Capture enough metadata to prove which region/primary served representative reads without logging sensitive query payloads.

### Slice F — rollout plan

Define provisioning/backfill/config procedure, rollback, smoke check and tenant-by-tenant rollout evidence. Do not execute production rollout autonomously.

## Acceptance gates

Required before RC claim:

- exact capability mapping;
- TypeScript/typecheck in affected scope;
- unit/worker integration tests for bookmark flow;
- negative cross-tenant bookmark test;
- write/read-your-write test across separate HTTP requests;
- concurrency test with two advancing bookmarks;
- authoritative command test proving primary-first behavior;
- report/list replica-friendly test where feasible;
- region/primary metadata evidence in remote non-production environment if available;
- benchmark before/after or explicit reason production benchmark is pending;
- no duplicate DB source of truth;
- production enablement remains unclaimed until exact deployment evidence.

Hardened additionally requires production rollout evidence, observed replica serving, latency/correctness monitoring and failure/rollback evidence.

## Dependency requests

Use common CFMAX format. Likely targets:

- CF08 for config/deploy/inventory;
- WS14/CF06 only for shared client transport if adapter ownership requires it;
- WS12 for telemetry aggregation.

## NO-STOP

Do not stop for ordinary decisions. If one endpoint's contract needs another owner, record a Dependency Request and continue inventory/tests/other paths.

## Completion record

Owner: CF01 execution 2026-08-04
Started from: `cloudflare/cfmax-01-d1-consistency@d6f0e3e2227c8b9248e4109e46dd3468f03d3614`
Implementation/test head before this handoff update: `22138416ca42e14e777959124d725a4b1bc97682`
PR: #533 (draft) -> `cloudflare/cfmax-00-control`
Status: ACTIVE — implementation and evidence landed; CRITICAL acceptance gates remain
Canonical capabilities: `G01-016`, `G01-017`, `A01-008`, `O01-003`, `O01-004`, `O01-005`, `O01-018`, `O01-019`, `X01-007`; tenant rollout/config also touches `T01-002`, `T01-015`, `O01-016`, `O01-017`
Changed zones: `server/packages/core/src/d1-session-policy.ts`; query-worker source/tests; CF01 evidence docs
Tests: workerd+D1 bookmark round-trip tests and policy tests added; GitHub Actions has not produced a run for the CFMAX control-base draft PR, so exact-head execution is still pending
Production evidence: none; read replication was not enabled and nothing was deployed
Dependency requests: `DR-CF01-01` WS14 concurrent/multi-tab bookmark contract; `DR-CF01-02` WS00 permission/meta freshness split; `DR-CF01-03` CF08 production resource/config evidence
Remaining gaps: exact typecheck/test execution; concurrent advancing-bookmark client behavior; true two-D1 foreign-bookmark integration; permission revocation freshness split; remote replica-serving metadata; APAC p50/p95 benchmark; native tenant command bookmark parity/exclusion decision
Evidence: `docs/agents/cloudflare-cfmax/01-D1-CONSISTENCY-EVIDENCE.md`

## Startup prompt

Đọc branch-local handoff này, Forge Enterprise Completion Skill, exact branch/main và CFMAX common docs. Audit toàn bộ D1 access path trước khi code. Khóa authoritative/read-only/session/bookmark semantics bằng evidence, không suy từ tài liệu. Không dừng vì blocker cục bộ; ghi Dependency Request rồi tiếp tục phần độc lập. Không sửa business invariant của domain khác. Verify theo CRITICAL risk. Dừng trước merge/deploy/production read-replica enablement cho tới khi user duyệt rõ.
