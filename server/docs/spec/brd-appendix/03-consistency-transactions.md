# Consistency & Transaction Boundaries

- One D1 transaction handles one business aggregate and directly coupled ledger facts.
- Cross-D1/control-plane operations use saga/Workflow with compensation and reconciliation, never fake distributed transaction.
- Queue consumers are at-least-once and use processed-event/idempotency records.
- D1 session bookmark is propagated after write; stale-tolerant dashboards expose `as_of`.
- Naming counter coordination uses sharded Durable Objects plus committed unique name constraint.
- Offline mutations use client UUID/idempotency and typed conflict resolution; financial submit/close/payroll submit not offline-safe.
