# CloudForge v0.4.0 — O2C Production-Hardened Slice

## Release scope

This release closes the remaining code-local production gaps around the existing Order-to-Cash slice. It is **not** a claim of complete ERPNext backend parity.

## Delivered

- Fail-closed outbox delivery to the correct tenant dispatch Worker through a server-owned reverse route index.
- Bounded Control Plane route-index rebuild endpoint for existing tenants.
- Dispatch-namespace encrypted-secret list/put CLI that never prints secret values.
- Fixed-point advanced Sales Invoice tax subset:
  - multiple rows;
  - On Net Total;
  - On Previous Row Total;
  - Actual;
  - On Item Quantity;
  - Add/Deduct;
  - additive inclusive tax;
  - percentage/fixed document discount;
  - explicit round-off.
- Company-currency totals and GL posting using server-resolved exchange rates.
- Payment Entry realized exchange gain/loss with receivable cleared at the invoice historical rate.
- Updated Sales Invoice and Payment Entry UI inputs.
- Regression tests for routing, secret tooling, tax, multicurrency and base-currency receivable reconciliation.

## Verification in this build environment

- 67/67 Node/domain tests pass.
- SQLite schema, trigger and cross-aggregate race suites pass.
- Worker integration TypeScript typecheck passes.
- Web TypeScript typecheck passes.
- Source parser regression passes.
- Repository and plaintext-secret verifiers pass.

## Promotion requirements

The v0.4.0 code was not deployed from this environment. Before production promotion:

1. Run `npm ci && npm run check:full` on clean Linux/WSL2.
2. Run the web production build.
3. Deploy Control Plane and page through `POST /v1/routes/rebuild-index` until complete.
4. Put tenant secrets through `scripts/manage-dispatch-secrets.mjs` and verify encrypted bindings.
5. Remove plaintext tenant vars only after a controlled current/previous-key overlap.
6. Deploy Jobs/Tenant/Gateway changes and smoke-test outbox, tax, FX and reports.
7. Refresh pinned Bench differential evidence before changing parity claims.

## Explicit remaining scope

- FIFO/moving-average stock valuation and Delivery Note COGS GL.
- Backdated stock repost/recalculation.
- Serial/batch bundle and traceability.
- Amendments and complete returns.
- Full ERPNext metadata, workflow, print/import and remaining modules.
