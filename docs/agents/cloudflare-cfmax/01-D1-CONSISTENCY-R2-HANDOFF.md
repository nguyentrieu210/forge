# CF01 R2 — D1 Sessions / Read Replication / Bookmark Consistency

Date: 2026-08-04
Status: REVIEW — clean current-main replay and exact-head CI complete; remote replica proof pending
Branch: `cloudflare/cfmax-01-d1-consistency-r2`
Baseline: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: CRITICAL
Primary authority: WS00 architecture/kernel; query-worker owns report execution surface

## Takeover decision

The original CF01 contained useful D1 Sessions work but was built on stale query-worker code and would overwrite the current Finance report compiler if merged directly. R2 replays the consistency contract onto exact current main instead.

## Current-main evidence reused

The canonical client adapter already has one D1 bookmark seam:

- request interceptor sends `x-d1-bookmark` when present;
- response interceptor captures `x-d1-bookmark`;
- bookmark resets on login, logout and authentication/session expiry.

CF01 does not add a second client state authority.

## Implemented

### Canonical D1 policy helper

`server/packages/core/src/d1-session-policy.ts` defines:

- authoritative -> `first-primary`;
- replica-safe -> supplied bookmark, otherwise `first-unconstrained`;
- bounded/transport-safe opaque bookmark handling;
- bookmark extraction;
- non-sensitive served-region/served-primary observation headers.

### Query worker wiring

Current `FinanceReportCompiler` is preserved.

- synchronous report reads are replica-safe and inherit caller bookmark;
- prepared-report creation is primary-first;
- prepared Queue payload carries the post-command bookmark so background execution cannot fall behind job creation or the caller chain;
- prepared-report execution is bookmark-aware replica-safe;
- prepared job status is primary-first;
- stale-job reconciliation is primary-first because stale status could duplicate work;
- completion/failure state mutations remain primary-first;
- routing observation logs record only tenant/correlation/surface/region/primary/bookmark-present, never SQL or business payload.

### Tests

- `d1-session-policy.integration.test.mts`: policy, hostile bookmark and observation header contract;
- `reports.integration.test.mts`: real workerd+D1 prepared bookmark response, dependent bookmark read, queue execution and primary-first status path;
- `cfmax-d1-client-bookmark-contract.test.mjs`: locks the already-existing adapter request/response/reset seam.

### Validation evidence

Exact-head run `30853819015`: **PASS**.

Passed:

1. locked dependency install;
2. focused TypeScript;
3. real-workerd query-worker D1 integration: 2 files / 9 tests;
4. client bookmark transport/reset contract guard;
5. Query Worker Wrangler config/type parse.

The preceding run `30853646834` had already passed TypeScript and all 9 real-workerd D1 tests; it failed only because the source guard incorrectly counted field initialization as a runtime `this.d1Bookmark` reset. Test-only correction `e47a039a753779a16877d8e051ce93f86300df03` aligned the assertion to the actual three runtime identity boundaries: login, logout and auth/session expiry.

## Authority / safety

- report/replica state is never an authoritative validator;
- permission/domain/ledger mutation authority is unchanged;
- D1 remains authoritative;
- no production read replication enablement;
- no database/provider mutation;
- no migration.

## Remaining RC/Hardened gates

Current source evidence supports **Wired**, not RC/Hardened.

RC still needs provider/non-production evidence for actual replica serving and latency/correctness, plus an explicit concurrency policy for multiple simultaneously advancing browser mutation chains if that scenario must be guaranteed. Hardened needs production rollout, monitoring and rollback evidence.

## Completion record

Owner: coordinator takeover / CF01 R2
Original branch: `cloudflare/cfmax-01-d1-consistency` — superseded for convergence
PR: `#567` draft -> `main`
Validated head: `e47a039a753779a16877d8e051ce93f86300df03`
Exact-head CI: run `30853819015` **PASS**
Changed zones: D1 session policy helper, current query-worker, query-worker integration tests, client bookmark contract guard, focused CI, this handoff
Migration: none
Production mutation: none
Remaining RC gap: remote replica serving/latency and stronger multi-chain concurrency proof
Merge boundary: do not merge to main or enable production read replication without explicit approval
