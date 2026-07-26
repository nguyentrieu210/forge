
# Gate 3 Implementation Notes

## BRD → code mapping

| BRD contract | Code evidence |
|---|---|
| Atomic Write Protocol | `packages/document-kernel/src/d1-store.ts`, `migrations/tenant/0001_core.sql` |
| Aggregate DO atom | `apps/tenant-worker/src/aggregate-do.ts` |
| Tenant dynamic dispatch | `apps/gateway-worker/src/index.ts` |
| Outbox idempotency | `apps/jobs-worker/src/index.ts` |
| Controller compatibility | `packages/document-kernel/src/controller.ts` |
| O2C rules | `packages/clouderp-selling/src/controllers.ts` |
| Ledger invariants | `packages/ledger/src/index.ts` |
| MetaForge adapter | `packages/metaforge-cloudforge-adapter/src/index.ts` |
| Query Report prototype | `packages/query/src/index.ts`, `apps/query-worker/src/index.ts` |
| Oracle skeleton | `fixtures/o2c/`, `tests/o2c.test.mjs` |

## Deliberate limits

Current controllers implement a deterministic compatibility slice, not complete ERPNext algorithms. Exact source parity remains blocked until the source lock has full SHAs and scanner output. This distinction is encoded in `source-lock.json`, `STATUS.md`, and the verification output.
