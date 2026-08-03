# CF01 — D1 Consistency Evidence

Date: 2026-08-04
Branch: `cloudflare/cfmax-01-d1-consistency`
Program baseline: `fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`
Risk: CRITICAL
Adoption decision: REQUIRED
Production read-replica enablement: NOT EXECUTED
Merge/deploy: NOT EXECUTED

## 1. Provider contract lock

Official Cloudflare D1 Sessions/read-replication contract checked 2026-08-04:

- read replication requires the Sessions API; direct binding queries remain primary-only;
- `first-primary` requires the first query to observe the latest primary state and later session queries are sequentially consistent;
- `first-unconstrained` may start on primary or a replica and is only valid for reads whose product semantics tolerate that freshness model;
- a bookmark starts a later session at least as fresh as the supplied bookmark;
- `getBookmark()` is the cross-request read-your-writes seam;
- `served_by_region` / `served_by_primary` are available in D1 result metadata for remote requests and may be absent in local workerd;
- read replication is enabled per D1 database and is intentionally outside this worker's autonomous scope.

Source: `https://developers.cloudflare.com/d1/best-practices/read-replication/` and D1 Worker API documentation.

## 2. Exact wiring inventory

| path | role | current API | session constraint | bookmark in/out | replica-safe | evidence | gap |
|---|---|---|---|---|---|---|---|
| `document-kernel/D1MutationStore` | authoritative command | injected D1 | `first-primary` in constructor | internal session only | no | `server/packages/document-kernel/src/d1-store.ts` | bookmark is surfaced at HTTP boundary, not store |
| aggregate DO command route | authoritative command | DO -> document kernel | command store primary-first | Frappe façade advances request session after DO commit | no | `tenant-worker/index-core.ts` | native `/api/v1/commands` does not yet emit bookmark |
| Frappe write façade | interactive command | request session + DO | `first-primary` | response `x-d1-bookmark` | no | `tenant-worker/index-core.ts` | covered by existing façade seam; targeted concurrency evidence still needed |
| Frappe resource/method reads | interactive read-after-write | request session | client bookmark or `first-primary`/replica-safe allowlist | in/out `x-d1-bookmark` | conditional | `readDatabaseForRequest()` | metadata/permission reads currently share read session; revocation-freshness contract needs WS00/WS14 convergence |
| Frappe auth/session revocation | metadata/permission/security | raw tenant D1 | direct binding => primary | none | no | `D1UserStore(env.DB)` before request read session | correct freshness boundary; keep primary |
| client Frappe adapter | bookmark transport | Axios interceptors | N/A | sends/receives `x-d1-bookmark` | N/A | `client/packages/adapter-frappe/src/frappe-adapter.ts` | bookmark is adapter-instance scoped; multi-tab propagation is intentionally not assumed |
| query worker synchronous report | report/query | `D1ReportService` | **CF01: bookmark or `first-unconstrained`** | **CF01: in/out header** | yes | `server/apps/query-worker/src/index.ts` | remote replica proof pending non-production read-replica database |
| query worker prepared report create | background job command | D1 insert + Queue | **CF01: `first-primary`** | response primary bookmark; request bookmark carried to queue | no | query-worker | none in slice |
| query worker prepared report execution | report/query background | `D1ReportService` | **CF01: origin bookmark or `first-unconstrained`** | queue carries bookmark | yes | query-worker | remote replica proof pending |
| query worker prepared status | interactive control read | D1 status lookup | **CF01: `first-primary`** | response bookmark | no | query-worker | intentionally not replica-friendly |
| query worker stale-job reconciliation | background control | D1 status scan | **CF01: `first-primary`** | none | no | query-worker | intentionally primary to avoid duplicate redelivery from stale state |
| native tenant internal event/outbox/social paths | background command | direct `env.DB` | direct binding => primary | none | no | `tenant-worker/index-core.ts` | correctness-safe; no replica optimization intended |
| migration/provision/admin scripts | migration/admin | direct D1/wrangler | primary/admin | none | no | server scripts/migrations | must remain primary/admin |
| KV/Cache | stale-tolerant cache/routing only | KV/Cache | eventual | N/A | yes only where declared | architecture/consistency matrix | never permission, command validation or ledger authority |

## 3. CF01 code slice landed on branch

### Canonical D1 session policy seam

Added `server/packages/core/src/d1-session-policy.ts`:

- `authoritative` => `withSession("first-primary")`;
- `replica-safe` => supplied normalized bookmark, otherwise `first-unconstrained`;
- transport-safe bookmark normalization (trim, max 1024, CR/LF rejection);
- bookmark extraction;
- non-sensitive routing observation probe;
- response headers for bookmark, region and primary/replica evidence.

This is deliberately a policy seam, not a second database/source-of-truth abstraction.

### Query worker conversion

`server/apps/query-worker/src/index.ts` now classifies routes instead of using raw D1 uniformly:

- synchronous reports: replica-safe;
- prepared report creation: primary-first;
- prepared report execution: replica-safe and inherits origin bookmark when present;
- prepared status: primary-first;
- stale queued-job reconciliation: primary-first;
- routing telemetry logs only region/primary/bookmark-presence and correlation metadata, never SQL or filter payloads.

## 4. Read-your-writes contract

Target proven by implementation/test seam:

```text
previous write/report session
 -> x-d1-bookmark B
 -> client/request sends B
 -> query worker opens session >= B
 -> report executes in that session
 -> response returns current bookmark B2
```

Prepared report path preserves the incoming bookmark in the queue message so asynchronous execution cannot intentionally start behind the requesting logical session.

## 5. Tenant / hostile-bookmark boundary

Forge uses database-per-tenant bindings. A client bookmark never chooses the database; the Worker binding does.

Controls in this slice:

- tenant identity still comes from authenticated Worker context, never bookmark contents;
- overlong/CRLF bookmark input is discarded before D1;
- an opaque syntactically acceptable but foreign/expired bookmark remains D1's validation responsibility;
- no code falls back to another tenant/database when a bookmark fails;
- raw bookmark values are not logged.

A true two-D1 negative foreign-bookmark integration test is still required before RC claim because the current query-worker integration fixture exposes one tenant D1 binding only.

## 6. Concurrency and multi-tab semantics

Current client evidence:

- bookmark state is held per `FrappeAdapterImpl` instance;
- login/logout/auth expiry clears that instance's bookmark;
- no global cross-tenant bookmark store exists.

Contract for this phase:

- one adapter instance is one logical D1 session chain;
- separate browser tabs are separate logical chains unless a future WS14-owned transport deliberately synchronizes them;
- CF01 does **not** introduce localStorage/BroadcastChannel global propagation because opaque bookmark ordering and tenant/session ownership need a shared client contract;
- concurrent response ordering inside one adapter remains a documented gap: blindly replacing an opaque bookmark cannot prove monotonic freshness across out-of-order completions.

Dependency request is recorded below rather than duplicating WS14 state management.

## 7. Permission / metadata freshness

Security-sensitive authentication/session revocation already uses direct primary D1 before the replica-capable Frappe request session.

Open CRITICAL question: Frappe metadata/permission stores used after authentication currently share `requestDb` with replica-friendly data reads. A stale permission definition must never authorize data that has just been revoked.

CF01 therefore does **not** claim this boundary RC yet. Preferred convergence is to keep permission/authorization authority primary-first while allowing the already-authorized data/report query to use the replica/bookmark session.

## 8. Observability

Query-worker remote requests now expose/log, when Cloudflare provides them:

- `x-d1-bookmark`;
- `x-d1-served-by-region`;
- `x-d1-served-by-primary`;
- structured log scope `d1-read-routing` with tenant/correlation/surface only.

Local workerd is expected to omit remote region/primary fields; this is not evidence of replica serving.

## 9. Tests added / expected gates

Changed `server/apps/query-worker/test/reports.integration.test.mts` to cover real workerd + D1:

- synchronous report returns bookmark;
- valid bookmark round-trip across separate HTTP requests;
- overlong hostile bookmark is ignored before D1;
- prepared report creation returns primary-session bookmark;
- prepared report executes with carried bookmark and status is read primary-first;
- existing sanitized failure behavior remains covered.

Still required before RC claim:

- exact CI pass on branch head;
- native tenant `/api/v1/commands` bookmark parity or explicit exclusion contract;
- two advancing concurrent bookmark regression;
- two-D1 foreign-bookmark negative test;
- permission-revocation freshness test with split authority/read session;
- remote non-production evidence showing `served_by_region` / `served_by_primary`;
- APAC p50/p95 before/after benchmark.

## 10. Rollout plan — proposal only

No production action is authorized by this document.

1. Inventory each tenant D1 and current read-replication mode.
2. Select one non-production tenant with representative APAC traffic.
3. Deploy session-aware Worker code first while read replication remains disabled; smoke correctness/bookmark headers.
4. Enable D1 read replication only for that non-production DB.
5. Run write -> bookmark -> dependent read and report/list smoke from at least two regions.
6. Capture `served_by_region`, `served_by_primary`, p50/p95 and correctness evidence.
7. Disable read replication to prove rollback does not break Sessions; direct/primary behavior must remain correct.
8. Production rollout, if later approved, is tenant-by-tenant with pre/post evidence and immediate disable-read-replication rollback.

## 11. Dependency Requests

### DR-CF01-01

Owner: WS14 client/runtime  
Need: define/test monotonic bookmark behavior for concurrent requests and whether multi-tab chains are intentionally independent or synchronized.  
Why: shared client transport/state ownership belongs to WS14.  
Blocked scope: multi-tab/concurrent bookmark acceptance gate.  
Can continue independently: yes.  
Next independent work: server inventory, query-worker tests, observability, rollout evidence.

### DR-CF01-02

Owner: WS00 architecture/kernel  
Need: split authorization/permission reads from replica-capable data reads, preserving primary-first permission revocation semantics.  
Why: this changes the shared authoritative request contract and must not be locally duplicated.  
Blocked scope: permission/meta replica policy RC claim.  
Can continue independently: yes.  
Next independent work: report/query replica path and non-production evidence.

### DR-CF01-03

Owner: CF08 production governance  
Need: exact D1 read-replication inventory, non-production enable/disable procedure and production tenant rollout gate.  
Why: provider resource config/deploy inventory belongs to CF08.  
Blocked scope: production enablement and measured replica evidence.  
Can continue independently: yes.  
Next independent work: code/test evidence with replication disabled.

## 12. Maturity claim

Current CF01 maturity: **Wired, not RC**.

Reason:

- command primary-first foundation exists;
- Frappe bookmark transport exists;
- query-worker replica-safe session/bookmark wiring is now implemented on this branch;
- production read replication is unclaimed;
- remote replica/latency evidence, cross-tenant two-DB negative test, concurrency monotonicity and permission-revocation freshness remain open.

No `Hardened` or production claim is made.
