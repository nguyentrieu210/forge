# Engineering Specification 360

## Runtime invariants
1. Metadata is versioned data, not compile-time constants.
2. Document, children, ledgers, version and outbox commit atomically.
3. Permission is compiled server-side into query projection/predicate/action.
4. Side effects are asynchronous and idempotent.
5. Submitted/financial/stock facts are corrected by reversal/repost, not silent update.
6. Cross-suite integration is versioned event/contract based.
7. Every critical upstream artifact has spec, implementation and oracle evidence.

## Error taxonomy
`AUTH_*`, `PERMISSION_*`, `VALIDATION_*`, `CONFLICT_VERSION`, `WORKFLOW_*`, `QUERY_BUDGET_*`, `LEDGER_*`, `STOCK_*`, `INTEGRATION_*`, `JOB_*`, `SOURCE_PARITY_*`.

## Observability
Every request/job/event carries `tenant_id`, `correlation_id`, `actor`, `app_release`, `schema_version`, `document_ref`, `idempotency_key`, timing and resource usage.

## Definition of Done
Typecheck/lint/unit/integration/e2e/security/performance/oracle/reconciliation/visual/docs all green; zero placeholder; migration and rollback rehearsed.
