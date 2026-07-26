# Commercial Release Gate — v1.0.0

Source readiness is not production readiness. Promotion is blocked unless all checks below are supported by immutable evidence tied to the exact ZIP SHA-256:

1. Release manifest and SHA-256 verification.
2. Clean supported Linux dependency installation.
3. Full source suite and tenant migrations 0001–0009.
4. Workerd tenant/query integration tests.
5. Web typecheck and Vite production build.
6. Pinned ERPNext differential suite for every promoted transaction module.
7. Production-shaped migration rehearsal and clean reconciliation.
8. Multi-tenant, load, concurrency and security testing.
9. Cloudflare staging smoke for transaction, report, queue, outbox and R2 paths.
10. Bank-reconciliation and payroll race tests against Workerd+D1.
11. E-invoice provider adapter idempotency, retry/dead-letter and secret-rotation tests.
12. Country-specific accounting, payroll, privacy, retention and e-invoice legal review.
13. Rollback and tenant backup/restore drill.
14. Completed promotion evidence matching the exact release SHA-256.

Failure or missing evidence is a stop-ship condition.
