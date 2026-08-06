# Operator E2E harness

This directory implements the executable side of `docs/qa/e2e/**`.

## Contract

- Business mutations must originate from visible browser controls.
- Read-only API calls are allowed for readiness and authoritative readback.
- Fixture setup uses the public Frappe facade only and is restricted to loopback/local CI.
- `FORGE_E2E_MODE=local` plus a loopback backend is mandatory for mutation flows.
- Every flow attaches browser/network evidence and the custom reporter emits `PASS`, `FAIL`, `BLOCKED`, or `SKIPPED` with a failure class.
- Existing API/backend Golden Flow tests remain complementary; they do not establish operator PASS.

## Current flow ownership

- E2E-00 Login/context/navigation.
- E2E-01 Sales/O2C.
- E2E-02 Procurement/P2P entry.
- E2E-03 Inventory/cutting.
- E2E-04 Manufacturing.
- E2E-05 Finance/debt/cash.
- E2E-06 Warranty/service.
- E2E-07 HR/payroll.
- E2E-08 Reports/history.
- E2E-09 Correction/retry.

Do not add production credentials, remote tenant URLs, direct D1 writes, or provider mutation to this harness.
