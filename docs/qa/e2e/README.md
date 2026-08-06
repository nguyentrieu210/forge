# PILOT-UX-E2E — Operator End-to-End Acceptance

Date: 2026-08-06  
Status: ACTIVE — documentation/control lane  
Phase: CONTROLLED_PILOT  
Scope: browser-level operator usability and end-to-end task completion for Forge/Alumdoor.

## 1. Mission

This program proves one thing that build, source inspection, API tests, capability counts and backend Golden Flow do not prove by themselves:

> A real business operator can enter through the browser, complete the intended job from start to finish, observe the authoritative result, recover from supported errors, and continue without developer intervention or unexplained red errors.

The program is intentionally task-first. A screen is not considered usable because it renders, a component exists, an API returns 200, or a backend controller has integration tests.

## 2. Authority and phase relationship

This workstream does **not** reopen historical R6 certification. R6 remains historical release/certification evidence. PILOT-UX-E2E adds operator-usability evidence required by the current controlled-pilot phase.

Truth order for this program:

1. exact GitHub source/branch/PR/workflow state;
2. `CURRENT_STATUS.md` and `NEXT_TASKS.md`;
3. active pilot authority;
4. `skills/forge-enterprise-completion/SKILL.md`;
5. exact browser evidence bound to release/package identity;
6. source/tests/metadata/runtime contracts;
7. North Star as strategic direction.

Browser evidence never authorizes production mutation by itself.

## 3. Primary acceptance rule

A business flow only receives `PASS` when the tested persona completes the full browser flow and the expected authoritative business outcome is read back successfully.

Canonical sequence:

`login -> navigate -> context ready -> input -> validate/preview -> save -> submit/action -> authoritative write -> reopen/readback -> downstream state -> report/history -> supported recovery`

A flow is not `PASS` when any material step is unproven.

## 4. Status vocabulary

Only these execution states are allowed:

- `UNKNOWN` — not executed on the exact candidate/environment.
- `BLOCKED` — cannot execute because an explicit prerequisite is unavailable.
- `FAIL` — execution proves the application/flow does not satisfy acceptance.
- `PARTIAL` — some required steps pass but the end condition is not proven.
- `PASS` — all mandatory acceptance conditions are proven.

`IMPLEMENTED`, `BUILT`, `WIRED`, `RC`, source presence, screenshot-only review or API-only PASS may be useful evidence, but none is a substitute for operator-flow `PASS`.

## 5. Program documents

- `E2E_OPERATOR_ACCEPTANCE_STANDARD.md` — definition of usable and PASS/FAIL rules.
- `E2E_FLOW_MATRIX.md` — canonical operator jobs and current execution state.
- `E2E_TEST_DATA_CONTRACT.md` — fixtures, preflight and data/config failure classification.
- `E2E_ERROR_POLICY.md` — browser/network/UI error capture and severity.
- `E2E_EVIDENCE_CONTRACT.md` — exact-SHA evidence schema and artifacts.
- `E2E_RELEASE_GATE.md` — OPERATOR-READY gate.
- `E2E_CURRENT_STATUS.md` — current measured usability truth.
- `flows/*.md` — per-job acceptance specs.

## 6. Initial core flow set

1. E2E-00 Login and operating context.
2. E2E-01 Sales / order-to-cash operational entry.
3. E2E-02 Procurement / purchase-to-receipt.
4. E2E-03 Inventory operational movements.
5. E2E-04 Manufacturing execution.
6. E2E-05 Finance, debt and cash collection/payment.
7. E2E-06 Warranty/service lifecycle.
8. E2E-07 HR/payroll operator flow.
9. E2E-08 Report/history readback.
10. E2E-09 Correction/retry/idempotency operator flow.

The denominator is the job set, not the number of routes or screens.

## 7. Environment classes

- `E0_LOCAL` — local source/runtime, synthetic data allowed.
- `E1_DISPOSABLE` — disposable tenant/database, synthetic writes allowed.
- `E2_PRODUCTION_LIKE` — production-like environment with controlled fixtures.
- `E3_PILOT_OBSERVED` — pilot target, read-only smoke by default.
- `E4_PILOT_AUTHORIZED_WRITE` — pilot write only with explicit authorization required by existing governance.

No document in this folder grants production/pilot mutation authority.

## 8. Program verdict

The top-level product verdict uses operator evidence:

- `NOT_USABLE`
- `PILOT_USABLE`
- `OPERATIONAL`
- `PRODUCTION_GRADE_UX_CANDIDATE`

Hard rule: any open P0 in a core flow, or core task-completion rate below 80%, prevents a verdict above `NOT_USABLE` regardless of source architecture quality.

## 9. Implementation direction

Automation should converge into one browser-level operator E2E authority rather than accumulating unrelated Playwright configs and ad-hoc scripts. Shared harness responsibilities include authentication, persona/context setup, test-data preflight, network auditing, console/page-error auditing, UI error detection, traces, screenshots and evidence manifests.

This documentation lane is docs/control-plane only. Runtime implementation, merge, deploy and pilot writes remain separate actions governed by their actual blast radius and authorization boundary.
