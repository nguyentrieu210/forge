# Cloudflare kernel fit — D1 / Durable Objects / Queues

Verified: **2026-08-03** against current Forge source and Cloudflare documentation.

This document is an architecture constraint record, not a pricing promise. Cloudflare limits/pricing change over time; re-check official docs before capacity commitments.

Official references checked:

- D1 limits: `https://developers.cloudflare.com/d1/platform/limits/` (updated 2026-04-21)
- D1 pricing: `https://developers.cloudflare.com/d1/platform/pricing/` (updated 2026-04-21)
- D1 read replication / Sessions: `https://developers.cloudflare.com/d1/best-practices/read-replication/` (updated 2026-04-28)
- Durable Object rules / concurrency: `https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/` (updated 2026-07-15)

## Executive conclusion

Forge's current shape is a good fit for Cloudflare **if the tenant database remains the scale unit and command-side queries stay short and targeted**.

```text
Gateway / stateless edge
        |
        v
Tenant Worker
        |
        +--> Durable Object coordination for shared write invariants
        |
        +--> D1 authoritative tenant database
        |      - primary-first Sessions for command reads
        |      - bookmark/session consistency for read-your-write
        |      - read replicas only for read paths that tolerate the model
        |
        +--> Queue / outbox for post-commit side effects
        |
        +--> R2 for file/blob payloads, not document rows
```

The main scaling risk is not the absence of infrastructure. It is allowing command handlers to perform broad scans or very large multi-statement mutations against one tenant D1 database.

## D1 fit

As of the verification date, Cloudflare documents:

- paid D1 database size: **10 GB per database**;
- a D1 database processes queries **one at a time**;
- paid Workers may issue up to **1,000 D1 queries per Worker invocation** (Free: 50);
- maximum SQL query duration: **30 seconds**;
- maximum string/BLOB/table-row size: **2 MB**;
- maximum SQL statement length: **100 KB**;
- maximum bound parameters per query: **100**.

Forge's database-per-tenant model matches D1's horizontal scale model: one busy customer does not force every customer through one database. It also gives an operationally clean tenant boundary.

### Consequence: optimize query duration, not just request count

Because an individual D1 database is single-threaded, one broad/slow query delays unrelated work for that tenant. A 1 ms average query and a 100 ms average query differ by roughly two orders of magnitude in theoretical per-database throughput.

Therefore command-side invariants should prefer targeted indexed reads over scanning document JSON.

### Current finding: generic controller scan

`D1MutationStore.listDocumentsByDoctype()` is intentionally bounded at 5,000 rows. Several domain controllers use it for absence/overlap/shared-state checks. Silent truncation would turn “not in the first 5,000 rows” into “does not exist”, which is a correctness failure, not merely a performance problem.

WS00 therefore makes the production rollout command store count first and fail closed when the generic scan would be incomplete. Domain owners should replace large scans with targeted readers/indexes instead of raising the limit.

### Mutation statement budget

`D1MutationStore.execute()` builds one atomic `db.batch()` containing guard, document, child diffs, audit/version, ledger/projection rows, outbox and receipt. This is the correct atomicity boundary, but statement count grows with child and ledger row count.

Architecture rule:

- do not solve a large mutation by splitting authoritative ledger/document writes across independent commits;
- instead keep user/bulk limits bounded, reduce redundant statements, and introduce purpose-built server-side bulk primitives only when they preserve the same atomic contract;
- benchmark worst-case statement count before increasing bulk row limits.

A future benchmark should record `statements_per_mutation`, D1 duration, rows read/written and queue wait for representative 10/100/500-row documents.

## D1 Sessions and consistency

Cloudflare read replication requires the Sessions API. Replica reads may otherwise lag the primary.

Forge command-side `D1MutationStore` starts with:

```text
withSession("first-primary")
```

That is correct for authoritative read-check-write planning: the first read must see the latest primary state and later reads in the session remain sequentially consistent.

After commit, returning the D1 bookmark is also the correct seam for read-your-write behavior in a later request. Report/query paths may choose replica-friendly sessions when they do not participate in authoritative mutation planning.

Architecture rule:

- command/controller reads: primary-first or a bookmark at least as fresh as the command dependency;
- interactive read-after-write: carry bookmark;
- analytics/report reads: may use replica-friendly sessions if product semantics allow lag;
- never let an unconstrained replica read decide whether an authoritative write is valid.

## Durable Object coordination

A common Durable Object identity is a coordination scope, but it does not magically make an arbitrary asynchronous pipeline atomic. Durable Object JavaScript can interleave across awaited non-DO-storage I/O.

Forge's command pipeline awaits D1 binding operations, so shared read-check-write invariants use explicit serial execution around the **whole** kernel operation.

Current scopes:

- ordinary document OCC: document version + D1 mutation guard;
- inventory/reservation: `inventory:<tenant>:<company>` + `MutationSerialExecutor`;
- purchase allocation: `purchase:<tenant>:<company>:<supplier>` + `MutationSerialExecutor` + selective allocation-revision retry.

### Company-wide inventory lock trade-off

The current company-wide inventory coordinator deliberately favors correctness over maximum parallelism. A multi-row voucher can touch multiple items/batches/warehouses; one company scope avoids lock ordering and cross-lock deadlocks.

Do not shard this lock just because a benchmark shows queueing. A smaller key is acceptable only when the invariant can prove that one mutation never needs atomic visibility across two keys, or when a deterministic multi-key protocol is introduced and tested.

Measure before redesigning:

- coordinator queue wait p50/p95/p99;
- kernel plan + D1 commit duration;
- mutations per company per second;
- percentage of mutations touching multiple warehouses/items;
- retry/conflict rate.

## Queue/outbox fit

Post-commit network side effects belong after the authoritative D1 commit and are driven from the outbox. This keeps external APIs, email, webhooks and app callbacks outside the document/ledger transaction.

Required invariant:

```text
D1 document + ledger + outbox + receipt commit
        -> queue publication / delivery
        -> idempotent consumer
```

A queue delivery may happen more than once. Consumer idempotency must key off the event/command identity, not delivery count.

## Cost model

D1 billing is row-read / row-written / storage based, not provisioned instance-hours. On Workers Paid at the verification date the included monthly D1 usage is documented as 25 billion rows read and 50 million rows written, with usage beyond that charged per row-volume tier.

Implication for Forge:

- a targeted indexed read is both faster and cheaper than repeatedly scanning thousands of JSON documents;
- derived projections are justified when they make repeated business queries bounded and rebuildable from an authoritative source;
- duplicating an authoritative ledger merely to save reads is not justified;
- per-tenant databases help attribute heavy customers and keep hotspots isolated.

## Current risk register

| Risk | Current state | WS00 direction |
|---|---|---|
| Cross-document inventory race | Fixed on WS00 branch | Company coordinator + full-operation serialization. |
| Purchase queue interleaving/session age | Hardened on WS00 branch | Shared serial primitive; construct command services inside queued execution/retry. |
| Generic 5,000-row controller scans | Fail-closed guard added for rollout command store | Domain owners replace with targeted indexed readers. |
| Giant `DomainReader` dependency surface | Compatibility debt reduced | Narrow reader ports added; migrate callers gradually. |
| Very large mutation `db.batch()` | Open performance risk | Benchmark statement budget before expanding bulk limits. |
| Company inventory coordinator hotspot | Intentional correctness trade-off | Instrument first; only shard with a proven invariant protocol. |
| Direct lifecycle writes bypassing MutationCommand | Open contract gap | Design delete/rename maintenance command semantics before implementation. |
| Finance period-lock direct write | Cross-workstream dependency | WS01 should own domain-command/audit semantics. |

## Capacity gates before calling kernel Hardened

1. Exact Worker integration test proving competing inventory RPCs cannot interleave the shared invariant.
2. Failure injection across D1 batch positions: no partial document/ledger/outbox/receipt state.
3. 100 same-version saves: one commit, remaining conflicts.
4. Same command replay after commit-before-response: one receipt/ledger set.
5. Representative mutation statement-count benchmark at large child grids.
6. Large-tenant scan regression: generic bounded scan fails closed; targeted readers remain correct beyond 5,000 documents.
7. Queue/outbox duplicate delivery regression with idempotent consumer evidence.
8. D1 bookmark read-after-write integration evidence.

Until those gates exist on an exact checkout/runtime, WS00 should remain **RC/Wired**, not self-declare Hardened.
